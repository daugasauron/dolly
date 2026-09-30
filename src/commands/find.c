#define _XOPEN_SOURCE 700

#include <dirent.h>
#include <fnmatch.h>
#include <stdint.h>

#include "run-program.h"

enum {
  NODE_LIMIT = 4096,
  EXEC_BATCH_ITEMS = 256,
  EXEC_BATCH_BYTES = 64 * 1024,
};

typedef enum {
  NODE_TRUE,
  NODE_FALSE,
  NODE_AND,
  NODE_OR,
  NODE_NOT,
  NODE_NAME,
  NODE_PATH,
  NODE_TYPE,
  NODE_EMPTY,
  NODE_PRINT,
  NODE_PRINT0,
  NODE_PRUNE,
  NODE_QUIT,
  NODE_EXEC,
} node_kind;

typedef struct string_list {
  char **items;
  size_t count;
  size_t capacity;
  size_t bytes;
} string_list;

typedef struct exec_spec {
  char **arguments;
  size_t count;
  int batched;
  string_list pending;
} exec_spec;

typedef struct expression {
  node_kind kind;
  struct expression *left;
  struct expression *right;
  const char *text;
  char type;
  exec_spec *execution;
} expression;

typedef struct {
  int argc;
  char **argv;
  int index;
  expression **nodes;
  size_t node_count;
  size_t node_capacity;
  exec_spec **executions;
  size_t execution_count;
  size_t execution_capacity;
  size_t minimum_depth;
  size_t maximum_depth;
  int depth_first;
  int has_output_action;
  int failed;
} parser;

typedef struct {
  int had_error;
  int interrupted;
  int quit;
} find_state;

typedef struct {
  const char *path;
  const char *name;
  const struct stat *metadata;
  size_t depth;
  int prune;
} evaluation;

static find_state state;

static void usage(FILE *stream) {
  fputs(
      "usage: find [path ...] [expression]\n"
      "expression: [-maxdepth N] [-mindepth N] [-depth]\n"
      "            [-name PATTERN] [-path PATTERN] [-type f|d|l] [-empty]\n"
      "            [-print|-print0|-prune|-quit]\n"
      "            [-exec COMMAND ... {} ';' | -exec COMMAND ... {} +]\n"
      "            [! EXPR] [( EXPR )] [EXPR -a EXPR] [EXPR -o EXPR]\n",
      stream);
}

static void dispose_strings(string_list *list) {
  for (size_t index = 0; index < list->count; ++index) free(list->items[index]);
  free(list->items);
  *list = (string_list){0};
}

static int append_owned(string_list *list, char *item) {
  if (list->count == list->capacity) {
    size_t capacity = list->capacity == 0 ? 16 : list->capacity * 2;
    if (capacity < list->capacity || capacity > SIZE_MAX / sizeof(*list->items)) {
      errno = ENOMEM;
      return -1;
    }
    char **items = realloc(list->items, capacity * sizeof(*items));
    if (items == NULL) return -1;
    list->items = items;
    list->capacity = capacity;
  }
  const size_t length = strlen(item) + 1;
  if (list->bytes > SIZE_MAX - length) {
    errno = ENOMEM;
    return -1;
  }
  list->items[list->count++] = item;
  list->bytes += length;
  return 0;
}

static int append_copy(string_list *list, const char *item) {
  char *copy = strdup(item);
  if (copy == NULL || append_owned(list, copy) != 0) {
    free(copy);
    return -1;
  }
  return 0;
}

static char *join_path(const char *directory, const char *name) {
  const size_t directory_length = strlen(directory);
  const size_t name_length = strlen(name);
  const int slash = directory_length != 0 && directory[directory_length - 1] != '/';
  if (directory_length > SIZE_MAX - name_length - (size_t)slash - 1) {
    errno = ENAMETOOLONG;
    return NULL;
  }
  char *path = malloc(directory_length + (size_t)slash + name_length + 1);
  if (path == NULL) return NULL;
  memcpy(path, directory, directory_length);
  if (slash) path[directory_length] = '/';
  memcpy(path + directory_length + (size_t)slash, name, name_length + 1);
  return path;
}

static char *root_name(const char *path) {
  size_t length = strlen(path);
  while (length > 1 && path[length - 1] == '/') length--;
  if (length == 1 && path[0] == '/') return strdup("/");
  size_t start = length;
  while (start != 0 && path[start - 1] != '/') start--;
  if (start == length) return strdup(".");
  char *name = malloc(length - start + 1);
  if (name == NULL) return NULL;
  memcpy(name, path + start, length - start);
  name[length - start] = '\0';
  return name;
}

static int flush_execution(exec_spec *execution) {
  if (!execution->batched || execution->pending.count == 0) return 0;
  const size_t prefix_count = execution->count - 1;
  if (prefix_count > SIZE_MAX - execution->pending.count - 1) {
    state.had_error = 1;
    return -1;
  }
  const size_t count = prefix_count + execution->pending.count;
  char **arguments = calloc(count + 1, sizeof(*arguments));
  if (arguments == NULL) {
    fputs("find: out of memory while building -exec batch\n", stderr);
    state.had_error = 1;
    return -1;
  }
  for (size_t index = 0; index < prefix_count; ++index) {
    arguments[index] = execution->arguments[index];
  }
  for (size_t index = 0; index < execution->pending.count; ++index) {
    arguments[prefix_count + index] = execution->pending.items[index];
  }
  const int status = run_program("find", (int)count, arguments, getenv("PATH"), -1);
  free(arguments);
  dispose_strings(&execution->pending);
  if (status == 130) {
    state.interrupted = 1;
    state.quit = 1;
  } else if (status != 0) {
    state.had_error = 1;
  }
  return status;
}

static int queue_execution(exec_spec *execution, const char *path) {
  const size_t length = strlen(path) + 1;
  if (execution->pending.count != 0 &&
      (execution->pending.count >= EXEC_BATCH_ITEMS ||
       length > EXEC_BATCH_BYTES - execution->pending.bytes)) {
    (void)flush_execution(execution);
    if (state.quit) return 0;
  }
  if (append_copy(&execution->pending, path) != 0) {
    fputs("find: out of memory while collecting -exec paths\n", stderr);
    state.had_error = 1;
    state.quit = 1;
    return 0;
  }
  return 1;
}

static int immediate_execution(exec_spec *execution, const char *path) {
  char **arguments = calloc(execution->count + 1, sizeof(*arguments));
  if (arguments == NULL) {
    fputs("find: out of memory while building -exec command\n", stderr);
    state.had_error = 1;
    state.quit = 1;
    return 0;
  }
  for (size_t index = 0; index < execution->count; ++index) {
    arguments[index] = strcmp(execution->arguments[index], "{}") == 0
                           ? (char *)path
                           : execution->arguments[index];
  }
  const int status = run_program("find", (int)execution->count, arguments,
                                 getenv("PATH"), -1);
  free(arguments);
  if (status == 130) {
    state.interrupted = 1;
    state.quit = 1;
  }
  return status == 0;
}

static expression *new_node(parser *input, node_kind kind) {
  if (input->node_count >= NODE_LIMIT) {
    fputs("find: expression is too large\n", stderr);
    input->failed = 1;
    return NULL;
  }
  expression *node = calloc(1, sizeof(*node));
  if (node == NULL) {
    fputs("find: out of memory while parsing expression\n", stderr);
    input->failed = 1;
    return NULL;
  }
  if (input->node_count == input->node_capacity) {
    size_t capacity = input->node_capacity == 0 ? 32 : input->node_capacity * 2;
    expression **nodes = realloc(input->nodes, capacity * sizeof(*nodes));
    if (nodes == NULL) {
      free(node);
      fputs("find: out of memory while parsing expression\n", stderr);
      input->failed = 1;
      return NULL;
    }
    input->nodes = nodes;
    input->node_capacity = capacity;
  }
  node->kind = kind;
  input->nodes[input->node_count++] = node;
  return node;
}

static int add_execution(parser *input, exec_spec *execution) {
  if (input->execution_count == input->execution_capacity) {
    size_t capacity = input->execution_capacity == 0
                          ? 8
                          : input->execution_capacity * 2;
    exec_spec **items = realloc(input->executions, capacity * sizeof(*items));
    if (items == NULL) return -1;
    input->executions = items;
    input->execution_capacity = capacity;
  }
  input->executions[input->execution_count++] = execution;
  return 0;
}

static int parse_depth(const char *option, const char *text, size_t *value) {
  char *end = NULL;
  errno = 0;
  unsigned long long parsed = strtoull(text, &end, 10);
  if (errno != 0 || text[0] == '\0' || *end != '\0' || parsed > SIZE_MAX) {
    fprintf(stderr, "find: %s requires a nonnegative integer: %s\n",
            option, text);
    return -1;
  }
  *value = (size_t)parsed;
  return 0;
}

static expression *parse_or(parser *input);

static expression *parse_primary(parser *input) {
  if (input->index >= input->argc) {
    fputs("find: expected expression\n", stderr);
    input->failed = 1;
    return NULL;
  }
  const char *token = input->argv[input->index++];
  if (strcmp(token, "(") == 0) {
    expression *inner = parse_or(input);
    if (input->index >= input->argc || strcmp(input->argv[input->index], ")") != 0) {
      fputs("find: missing ')'\n", stderr);
      input->failed = 1;
      return inner;
    }
    input->index++;
    return inner;
  }
  if (strcmp(token, "-true") == 0) return new_node(input, NODE_TRUE);
  if (strcmp(token, "-false") == 0) return new_node(input, NODE_FALSE);
  if (strcmp(token, "-depth") == 0) {
    input->depth_first = 1;
    return new_node(input, NODE_TRUE);
  }
  if (strcmp(token, "-maxdepth") == 0 || strcmp(token, "-mindepth") == 0) {
    if (input->index >= input->argc) {
      fprintf(stderr, "find: %s requires an argument\n", token);
      input->failed = 1;
      return NULL;
    }
    size_t depth = 0;
    if (parse_depth(token, input->argv[input->index++], &depth) != 0) {
      input->failed = 1;
      return NULL;
    }
    if (strcmp(token, "-maxdepth") == 0) input->maximum_depth = depth;
    else input->minimum_depth = depth;
    return new_node(input, NODE_TRUE);
  }
  if (strcmp(token, "-name") == 0 || strcmp(token, "-path") == 0) {
    if (input->index >= input->argc) {
      fprintf(stderr, "find: %s requires a pattern\n", token);
      input->failed = 1;
      return NULL;
    }
    expression *node = new_node(
        input, strcmp(token, "-name") == 0 ? NODE_NAME : NODE_PATH);
    if (node != NULL) node->text = input->argv[input->index++];
    return node;
  }
  if (strcmp(token, "-type") == 0) {
    if (input->index >= input->argc || strlen(input->argv[input->index]) != 1 ||
        strchr("fdl", input->argv[input->index][0]) == NULL) {
      fputs("find: -type supports exactly f, d, or l\n", stderr);
      input->failed = 1;
      return NULL;
    }
    expression *node = new_node(input, NODE_TYPE);
    if (node != NULL) node->type = input->argv[input->index++][0];
    return node;
  }
  if (strcmp(token, "-empty") == 0) return new_node(input, NODE_EMPTY);
  if (strcmp(token, "-print") == 0) {
    input->has_output_action = 1;
    return new_node(input, NODE_PRINT);
  }
  if (strcmp(token, "-print0") == 0) {
    input->has_output_action = 1;
    return new_node(input, NODE_PRINT0);
  }
  if (strcmp(token, "-prune") == 0) return new_node(input, NODE_PRUNE);
  if (strcmp(token, "-quit") == 0) {
    input->has_output_action = 1;
    return new_node(input, NODE_QUIT);
  }
  if (strcmp(token, "-exec") == 0) {
    const int start = input->index;
    while (input->index < input->argc &&
           strcmp(input->argv[input->index], ";") != 0 &&
           strcmp(input->argv[input->index], "+") != 0) {
      input->index++;
    }
    if (input->index >= input->argc || input->index == start) {
      fputs("find: -exec requires a command terminated by ';' or '+'\n", stderr);
      input->failed = 1;
      return NULL;
    }
    const int batched = strcmp(input->argv[input->index], "+") == 0;
    const size_t count = (size_t)(input->index - start);
    size_t placeholders = 0;
    for (size_t index = 0; index < count; ++index) {
      if (strcmp(input->argv[start + (int)index], "{}") == 0) placeholders++;
    }
    if (placeholders == 0 ||
        (batched && (placeholders != 1 ||
                     strcmp(input->argv[start + (int)count - 1], "{}") != 0))) {
      fputs("find: -exec requires '{}'; with '+' it must appear once at the end\n",
            stderr);
      input->failed = 1;
      return NULL;
    }
    input->index++;
    exec_spec *execution = calloc(1, sizeof(*execution));
    if (execution == NULL || add_execution(input, execution) != 0) {
      free(execution);
      fputs("find: out of memory while parsing -exec\n", stderr);
      input->failed = 1;
      return NULL;
    }
    execution->arguments = input->argv + start;
    execution->count = count;
    execution->batched = batched;
    expression *node = new_node(input, NODE_EXEC);
    if (node != NULL) node->execution = execution;
    input->has_output_action = 1;
    return node;
  }
  if (strcmp(token, ")") == 0 || strcmp(token, "-a") == 0 ||
      strcmp(token, "-and") == 0 || strcmp(token, "-o") == 0 ||
      strcmp(token, "-or") == 0) {
    fprintf(stderr, "find: unexpected expression token: %s\n", token);
  } else if (strcmp(token, "-user") == 0 || strcmp(token, "-group") == 0 ||
             strcmp(token, "-uid") == 0 || strcmp(token, "-gid") == 0 ||
             strcmp(token, "-perm") == 0 || strcmp(token, "-readable") == 0 ||
             strcmp(token, "-writable") == 0 || strcmp(token, "-executable") == 0) {
    fprintf(stderr,
            "find: %s is unsupported because Dolly has no user, group, or permission model\n",
            token);
  } else {
    fprintf(stderr, "find: unsupported predicate or action: %s\n", token);
  }
  input->failed = 1;
  return NULL;
}

static expression *parse_not(parser *input) {
  int invert = 0;
  while (input->index < input->argc &&
         (strcmp(input->argv[input->index], "!") == 0 ||
          strcmp(input->argv[input->index], "-not") == 0)) {
    invert = !invert;
    input->index++;
  }
  expression *node = parse_primary(input);
  if (!invert || node == NULL) return node;
  expression *negation = new_node(input, NODE_NOT);
  if (negation != NULL) negation->left = node;
  return negation;
}

static int at_and_boundary(parser *input) {
  if (input->index >= input->argc) return 1;
  const char *token = input->argv[input->index];
  return strcmp(token, ")") == 0 || strcmp(token, "-o") == 0 ||
         strcmp(token, "-or") == 0;
}

static expression *parse_and(parser *input) {
  expression *left = parse_not(input);
  while (!input->failed && !at_and_boundary(input)) {
    if (strcmp(input->argv[input->index], "-a") == 0 ||
        strcmp(input->argv[input->index], "-and") == 0) {
      input->index++;
    }
    expression *right = parse_not(input);
    expression *combined = new_node(input, NODE_AND);
    if (combined == NULL) return left;
    combined->left = left;
    combined->right = right;
    left = combined;
  }
  return left;
}

static expression *parse_or(parser *input) {
  expression *left = parse_and(input);
  while (!input->failed && input->index < input->argc &&
         (strcmp(input->argv[input->index], "-o") == 0 ||
          strcmp(input->argv[input->index], "-or") == 0)) {
    input->index++;
    expression *right = parse_and(input);
    expression *combined = new_node(input, NODE_OR);
    if (combined == NULL) return left;
    combined->left = left;
    combined->right = right;
    left = combined;
  }
  return left;
}

static int directory_empty(const char *path) {
  DIR *directory = opendir(path);
  if (directory == NULL) {
    fprintf(stderr, "find: %s: %s\n", path, strerror(errno));
    state.had_error = 1;
    return 0;
  }
  int empty = 1;
  struct dirent *entry;
  errno = 0;
  while ((entry = readdir(directory)) != NULL) {
    if (strcmp(entry->d_name, ".") != 0 && strcmp(entry->d_name, "..") != 0) {
      empty = 0;
      break;
    }
  }
  if (entry == NULL && errno != 0) {
    fprintf(stderr, "find: %s: %s\n", path, strerror(errno));
    state.had_error = 1;
    empty = 0;
  }
  if (closedir(directory) != 0) {
    fprintf(stderr, "find: %s: %s\n", path, strerror(errno));
    state.had_error = 1;
  }
  return empty;
}

static int evaluate_expression(expression *node, evaluation *item) {
  if (node == NULL || state.quit) return 0;
  switch (node->kind) {
    case NODE_TRUE:
      return 1;
    case NODE_FALSE:
      return 0;
    case NODE_AND:
      return evaluate_expression(node->left, item) &&
             evaluate_expression(node->right, item);
    case NODE_OR:
      return evaluate_expression(node->left, item) ||
             evaluate_expression(node->right, item);
    case NODE_NOT:
      return !evaluate_expression(node->left, item);
    case NODE_NAME:
      return fnmatch(node->text, item->name, 0) == 0;
    case NODE_PATH:
      return fnmatch(node->text, item->path, 0) == 0;
    case NODE_TYPE:
      return (node->type == 'f' && S_ISREG(item->metadata->st_mode)) ||
             (node->type == 'd' && S_ISDIR(item->metadata->st_mode)) ||
             (node->type == 'l' && S_ISLNK(item->metadata->st_mode));
    case NODE_EMPTY:
      if (S_ISREG(item->metadata->st_mode)) return item->metadata->st_size == 0;
      if (S_ISDIR(item->metadata->st_mode)) return directory_empty(item->path);
      return 0;
    case NODE_PRINT:
      if (puts(item->path) == EOF) {
        state.had_error = 1;
        state.quit = 1;
        return 0;
      }
      return 1;
    case NODE_PRINT0:
      if (fputs(item->path, stdout) == EOF || fputc('\0', stdout) == EOF) {
        state.had_error = 1;
        state.quit = 1;
        return 0;
      }
      return 1;
    case NODE_PRUNE:
      item->prune = 1;
      return 1;
    case NODE_QUIT:
      state.quit = 1;
      return 1;
    case NODE_EXEC:
      return node->execution->batched
                 ? queue_execution(node->execution, item->path)
                 : immediate_execution(node->execution, item->path);
  }
  return 0;
}

static int compare_names(const void *left, const void *right) {
  const char *const *left_name = left;
  const char *const *right_name = right;
  return strcmp(*left_name, *right_name);
}

static void walk(expression *root, const char *path, const char *name,
                 size_t depth, const parser *input) {
  if (state.quit || depth > input->maximum_depth) return;
  struct stat metadata;
  if (lstat(path, &metadata) != 0) {
    fprintf(stderr, "find: %s: %s\n", path, strerror(errno));
    state.had_error = 1;
    return;
  }
  evaluation item = {
      .path = path,
      .name = name,
      .metadata = &metadata,
      .depth = depth,
  };
  if (!input->depth_first && depth >= input->minimum_depth) {
    (void)evaluate_expression(root, &item);
  }
  if (!state.quit && !item.prune && S_ISDIR(metadata.st_mode) &&
      depth < input->maximum_depth) {
    DIR *directory = opendir(path);
    if (directory == NULL) {
      fprintf(stderr, "find: %s: %s\n", path, strerror(errno));
      state.had_error = 1;
    } else {
      string_list names = {0};
      struct dirent *entry;
      errno = 0;
      while ((entry = readdir(directory)) != NULL) {
        if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) {
          continue;
        }
        if (append_copy(&names, entry->d_name) != 0) {
          fprintf(stderr, "find: %s: out of memory\n", path);
          state.had_error = 1;
          state.quit = 1;
          break;
        }
      }
      if (entry == NULL && errno != 0) {
        fprintf(stderr, "find: %s: %s\n", path, strerror(errno));
        state.had_error = 1;
      }
      if (closedir(directory) != 0) {
        fprintf(stderr, "find: %s: %s\n", path, strerror(errno));
        state.had_error = 1;
      }
      if (names.count > 1) {
        qsort(names.items, names.count, sizeof(*names.items), compare_names);
      }
      for (size_t index = 0; index < names.count && !state.quit; ++index) {
        char *child = join_path(path, names.items[index]);
        if (child == NULL) {
          fprintf(stderr, "find: %s/%s: %s\n",
                  path, names.items[index], strerror(errno));
          state.had_error = 1;
          state.quit = errno == ENOMEM;
          break;
        }
        walk(root, child, names.items[index], depth + 1, input);
        free(child);
      }
      dispose_strings(&names);
    }
  }
  if (!state.quit && input->depth_first && depth >= input->minimum_depth) {
    item.prune = 0;
    (void)evaluate_expression(root, &item);
  }
}

static int expression_start(const char *argument) {
  return argument[0] == '-' || strcmp(argument, "!") == 0 ||
         strcmp(argument, "(") == 0 || strcmp(argument, ")") == 0;
}

int main(int argc, char **argv) {
  state = (find_state){0};
  if (argc == 2 && strcmp(argv[1], "--help") == 0) {
    usage(stdout);
    return 0;
  }
  parser input = {
      .argc = argc,
      .argv = argv,
      .maximum_depth = SIZE_MAX,
  };
  int first = 1;
  int forced_path = 0;
  if (first < argc && strcmp(argv[first], "--") == 0) {
    first++;
    forced_path = first < argc;
  }
  const int path_start = first;
  if (forced_path) first++;
  while (first < argc && !expression_start(argv[first])) first++;
  const int path_count = first - path_start;
  input.index = first;

  expression *root = NULL;
  if (input.index < argc) root = parse_or(&input);
  else root = new_node(&input, NODE_TRUE);
  if (!input.failed && input.index != argc) {
    fprintf(stderr, "find: unexpected expression token: %s\n", argv[input.index]);
    input.failed = 1;
  }
  if (!input.failed && input.minimum_depth > input.maximum_depth) {
    fputs("find: -mindepth cannot exceed -maxdepth\n", stderr);
    input.failed = 1;
  }
  if (!input.failed && !input.has_output_action) {
    expression *print = new_node(&input, NODE_PRINT);
    expression *combined = new_node(&input, NODE_AND);
    if (combined != NULL) {
      combined->left = root;
      combined->right = print;
      root = combined;
    }
  }

  if (!input.failed) {
    if (path_count == 0) {
      walk(root, ".", ".", 0, &input);
    } else {
      for (int index = path_start; index < path_start + path_count && !state.quit;
           ++index) {
        char *name = root_name(argv[index]);
        if (name == NULL) {
          fputs("find: out of memory\n", stderr);
          state.had_error = 1;
          break;
        }
        walk(root, argv[index], name, 0, &input);
        free(name);
      }
    }
    for (size_t index = 0; index < input.execution_count && !state.interrupted;
         ++index) {
      (void)flush_execution(input.executions[index]);
    }
    if (fflush(stdout) == EOF) state.had_error = 1;
  }

  for (size_t index = 0; index < input.execution_count; ++index) {
    dispose_strings(&input.executions[index]->pending);
    free(input.executions[index]);
  }
  for (size_t index = 0; index < input.node_count; ++index) free(input.nodes[index]);
  free(input.executions);
  free(input.nodes);

  if (input.failed) return 2;
  if (state.interrupted) return 130;
  return state.had_error ? 1 : 0;
}
