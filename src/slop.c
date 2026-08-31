#define _POSIX_C_SOURCE 200809L

#include <ctype.h>
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#include <dolly/runtime.h>

#define SLOP_MAX_LINE 65536
#define SLOP_MAX_ARGS 512
#define SLOP_MAX_HISTORY 1000
#define SLOP_DEFERRED_STATUS "\x1f" "DOLLY_STATUS" "\x1f"

typedef enum {
  TOKEN_WORD,
  TOKEN_SEMI,
  TOKEN_AND,
  TOKEN_OR,
  TOKEN_PIPE,
  TOKEN_NOT,
  TOKEN_INPUT,
  TOKEN_OUTPUT,
  TOKEN_APPEND,
  TOKEN_ERROR,
  TOKEN_ERROR_APPEND,
  TOKEN_ERROR_TO_OUTPUT,
  TOKEN_END,
} TokenKind;

typedef struct { TokenKind kind; char *text; int quoted; } Token;
typedef struct { Token *items; size_t count; size_t capacity; } TokenList;
typedef struct { char *data; size_t length; size_t capacity; } Buffer;
typedef struct { char **items; size_t count; size_t capacity; } Arguments;
typedef struct { char **items; size_t count; size_t capacity; } History;
typedef struct {
  char *text;
  int directory;
} Completion;
typedef struct { Completion *items; size_t count; size_t capacity; } Completions;

typedef struct {
  int interactive;
  int active;
  int last_status;
  int exit_status;
  int errexit;
  int xtrace;
  int argc;
  char **argv;
} Shell;

typedef struct { char *name; char *old_value; int existed; } EnvironmentChange;

static int execute_text(Shell *shell, const char *text);
static void print_prompt(void);

static int grow(void **allocation, size_t *capacity, size_t count,
                size_t element_size) {
  if (count <= *capacity) return 1;
  size_t next = *capacity == 0 ? 16 : *capacity;
  while (next < count) {
    if (next > SIZE_MAX / 2) return 0;
    next *= 2;
  }
  if (next > SIZE_MAX / element_size) return 0;
  void *grown = realloc(*allocation, next * element_size);
  if (grown == NULL) return 0;
  *allocation = grown;
  *capacity = next;
  return 1;
}

static int buffer_append(Buffer *buffer, const char *bytes, size_t length) {
  if (length > SIZE_MAX - buffer->length - 1 ||
      !grow((void **)&buffer->data, &buffer->capacity,
            buffer->length + length + 1, 1)) return 0;
  memcpy(buffer->data + buffer->length, bytes, length);
  buffer->length += length;
  buffer->data[buffer->length] = '\0';
  return 1;
}

static int buffer_character(Buffer *buffer, char byte) {
  return buffer_append(buffer, &byte, 1);
}

static char *buffer_release(Buffer *buffer) {
  if (buffer->data == NULL) buffer->data = strdup("");
  char *result = buffer->data;
  buffer->data = NULL;
  buffer->length = buffer->capacity = 0;
  return result;
}

static void tokens_dispose(TokenList *tokens) {
  for (size_t index = 0; index < tokens->count; index++) free(tokens->items[index].text);
  free(tokens->items);
  memset(tokens, 0, sizeof(*tokens));
}

static int token_push(TokenList *tokens, TokenKind kind, char *text, int quoted) {
  if (!grow((void **)&tokens->items, &tokens->capacity,
            tokens->count + 1, sizeof(*tokens->items))) {
    free(text);
    return 0;
  }
  tokens->items[tokens->count++] = (Token){kind, text, quoted};
  return 1;
}

static void arguments_dispose(Arguments *arguments) {
  for (size_t index = 0; index < arguments->count; index++) free(arguments->items[index]);
  free(arguments->items);
  memset(arguments, 0, sizeof(*arguments));
}

static int argument_push_owned(Arguments *arguments, char *text) {
  if (arguments->count == SLOP_MAX_ARGS ||
      !grow((void **)&arguments->items, &arguments->capacity,
            arguments->count + 2, sizeof(*arguments->items))) {
    free(text);
    return 0;
  }
  arguments->items[arguments->count++] = text;
  arguments->items[arguments->count] = NULL;
  return 1;
}

static int argument_push(Arguments *arguments, const char *text) {
  char *copy = strdup(text);
  return copy != NULL && argument_push_owned(arguments, copy);
}

static int is_name_start(char byte) {
  return byte == '_' || isalpha((unsigned char)byte);
}

static int is_name_byte(char byte) {
  return byte == '_' || isalnum((unsigned char)byte);
}

static int valid_name(const char *text, size_t length) {
  if (length == 0 || !is_name_start(text[0])) return 0;
  for (size_t index = 1; index < length; index++) if (!is_name_byte(text[index])) return 0;
  return 1;
}

static const char *parameter_value(Shell *shell, const char *name,
                                   size_t length, char temporary[64]) {
  if (length == 1 && name[0] == '?') {
    snprintf(temporary, 64, "%d", shell->last_status);
    return temporary;
  }
  if (length == 1 && name[0] == '$') {
    snprintf(temporary, 64, "%ld", (long)getpid());
    return temporary;
  }
  if (length == 1 && name[0] == '#') {
    snprintf(temporary, 64, "%d", shell->argc > 0 ? shell->argc - 1 : 0);
    return temporary;
  }
  if (length == 1 && isdigit((unsigned char)name[0])) {
    int index = name[0] - '0';
    return index < shell->argc ? shell->argv[index] : "";
  }
  if (!valid_name(name, length)) return "";
  char *copy = strndup(name, length);
  if (copy == NULL) return NULL;
  const char *value = getenv(copy);
  free(copy);
  return value == NULL ? "" : value;
}

static int capture_command(Shell *shell, const char *command, Buffer *output) {
  char path[] = "/tmp/slop-substitution-XXXXXX";
  int descriptor = mkstemp(path);
  if (descriptor < 0) return 0;
  unlink(path);
  int saved = dup(STDOUT_FILENO);
  if (saved < 0 || dup2(descriptor, STDOUT_FILENO) < 0) {
    if (saved >= 0) close(saved);
    close(descriptor);
    return 0;
  }
  clearerr(stdout);
  int status = execute_text(shell, command);
  fflush(stdout);
  fsync(STDOUT_FILENO);
  dup2(saved, STDOUT_FILENO);
  close(saved);
  clearerr(stdout);
  if (status != 0 || lseek(descriptor, 0, SEEK_SET) < 0) {
    close(descriptor);
    shell->last_status = status;
    return status == 0;
  }
  char bytes[4096];
  ssize_t count;
  while ((count = read(descriptor, bytes, sizeof(bytes))) > 0) {
    if (!buffer_append(output, bytes, (size_t)count)) {
      close(descriptor);
      return 0;
    }
  }
  close(descriptor);
  if (count < 0) return 0;
  while (output->length != 0 && output->data[output->length - 1] == '\n') {
    output->data[--output->length] = '\0';
  }
  return 1;
}

static int expand_dollar(Shell *shell, const char **cursor, Buffer *word) {
  const char *source = *cursor + 1;
  if (*source == '(') {
    const char *start = ++source;
    int depth = 1;
    char quote = '\0';
    while (*source != '\0' && depth != 0) {
      if (quote != '\0') {
        if (*source == quote) quote = '\0';
        else if (*source == '\\' && quote == '"' && source[1] != '\0') source++;
      } else if (*source == '\'' || *source == '"') quote = *source;
      else if (*source == '(') depth++;
      else if (*source == ')' && --depth == 0) break;
      source++;
    }
    if (depth != 0) {
      fputs("slop: unterminated command substitution\n", stderr);
      return -1;
    }
    char *command = strndup(start, (size_t)(source - start));
    if (command == NULL || !capture_command(shell, command, word)) {
      free(command);
      return -1;
    }
    free(command);
    *cursor = source + 1;
    return 1;
  }

  const char *name = source;
  size_t length = 0;
  if (*source == '{') {
    name = ++source;
    while (*source != '\0' && *source != '}') source++;
    if (*source != '}') {
      fputs("slop: unterminated parameter expansion\n", stderr);
      return -1;
    }
    length = (size_t)(source - name);
    source++;
  } else if (strchr("?$#@*", *source) != NULL || isdigit((unsigned char)*source)) {
    length = 1;
    source++;
  } else if (is_name_start(*source)) {
    while (is_name_byte(*source)) source++;
    length = (size_t)(source - name);
  } else {
    if (!buffer_character(word, '$')) return -1;
    *cursor = source;
    return 1;
  }

  if (length == 1 && name[0] == '?') {
    if (!buffer_append(word, SLOP_DEFERRED_STATUS,
                       sizeof(SLOP_DEFERRED_STATUS) - 1)) return -1;
  } else if (length == 1 && (name[0] == '@' || name[0] == '*')) {
    for (int index = 1; index < shell->argc; index++) {
      if (index != 1 && !buffer_character(word, ' ')) return -1;
      if (!buffer_append(word, shell->argv[index], strlen(shell->argv[index]))) return -1;
    }
  } else {
    char temporary[64];
    const char *value = parameter_value(shell, name, length, temporary);
    if (value == NULL || !buffer_append(word, value, strlen(value))) return -1;
  }
  *cursor = source;
  return 1;
}

static TokenKind operator_kind(const char *source, size_t *length,
                               int token_boundary) {
  if (token_boundary && strncmp(source, "2>&1", 4) == 0) {
    *length = 4; return TOKEN_ERROR_TO_OUTPUT;
  }
  if (token_boundary && strncmp(source, "2>>", 3) == 0) {
    *length = 3; return TOKEN_ERROR_APPEND;
  }
  if (token_boundary && strncmp(source, "2>", 2) == 0) {
    *length = 2; return TOKEN_ERROR;
  }
  if (strncmp(source, "&&", 2) == 0) { *length = 2; return TOKEN_AND; }
  if (strncmp(source, "||", 2) == 0) { *length = 2; return TOKEN_OR; }
  if (strncmp(source, ">>", 2) == 0) { *length = 2; return TOKEN_APPEND; }
  *length = 1;
  switch (*source) {
    case ';': case '\n': return TOKEN_SEMI;
    case '|': return TOKEN_PIPE;
    case '!':
      if (token_boundary) return TOKEN_NOT;
      break;
    case '<': return TOKEN_INPUT;
    case '>': return TOKEN_OUTPUT;
    default: *length = 0; return TOKEN_WORD;
  }
  *length = 0;
  return TOKEN_WORD;
}

static int lex(Shell *shell, const char *source, TokenList *tokens) {
  while (*source != '\0') {
    while (*source == ' ' || *source == '\t' || *source == '\r') source++;
    if (*source == '#') {
      while (*source != '\0' && *source != '\n') source++;
      continue;
    }
    if (*source == '\0') break;
    size_t operator_length = 0;
    TokenKind kind = operator_kind(source, &operator_length, 1);
    if (kind == TOKEN_NOT && tokens->count != 0 &&
        tokens->items[tokens->count - 1].kind != TOKEN_SEMI &&
        tokens->items[tokens->count - 1].kind != TOKEN_AND &&
        tokens->items[tokens->count - 1].kind != TOKEN_OR) {
      operator_length = 0;
      kind = TOKEN_WORD;
    }
    if (operator_length != 0) {
      if (!token_push(tokens, kind, NULL, 0)) return 0;
      source += operator_length;
      continue;
    }

    Buffer word = {0};
    char quote = '\0';
    int quoted = 0;
    int touched = 0;
    while (*source != '\0') {
      if (quote == '\0') {
        if (*source == ' ' || *source == '\t' || *source == '\r' || *source == '\n') break;
        operator_kind(source, &operator_length, 0);
        if (operator_length != 0) break;
      }
      char byte = *source;
      if (quote == '\0' && (byte == '\'' || byte == '"')) {
        quote = byte; quoted = touched = 1; source++;
      } else if (quote != '\0' && byte == quote) {
        quote = '\0'; source++;
      } else if (byte == '\\' && quote != '\'') {
        quoted = touched = 1;
        source++;
        if (*source == '\0') {
          free(word.data); fputs("slop: trailing backslash\n", stderr); return 0;
        }
        if (!buffer_character(&word, *source++)) { free(word.data); return 0; }
      } else if (byte == '$' && quote != '\'') {
        touched = 1;
        if (expand_dollar(shell, &source, &word) < 0) { free(word.data); return 0; }
      } else {
        touched = 1;
        if (!buffer_character(&word, byte)) { free(word.data); return 0; }
        source++;
      }
    }
    if (quote != '\0') {
      free(word.data); fputs("slop: unterminated quote\n", stderr); return 0;
    }
    if (!touched || !token_push(tokens, TOKEN_WORD, buffer_release(&word), quoted)) {
      free(word.data); return 0;
    }
  }
  return token_push(tokens, TOKEN_END, NULL, 0);
}

static int wildcard_match(const char *pattern, const char *text) {
  while (*pattern != '\0') {
    if (*pattern == '*') {
      while (*pattern == '*') pattern++;
      if (*pattern == '\0') return 1;
      for (; *text != '\0'; text++) if (wildcard_match(pattern, text)) return 1;
      return wildcard_match(pattern, text);
    }
    if (*pattern == '?') {
      if (*text == '\0') return 0;
      pattern++; text++; continue;
    }
    if (*pattern == '[') {
      if (*text == '\0') return 0;
      pattern++;
      int matched = 0;
      int inverted = *pattern == '!' || *pattern == '^';
      if (inverted) pattern++;
      while (*pattern != '\0' && *pattern != ']') {
        char first = *pattern++;
        if (*pattern == '-' && pattern[1] != '\0' && pattern[1] != ']') {
          pattern++;
          char last = *pattern++;
          if (*text >= first && *text <= last) matched = 1;
        } else if (*text == first) matched = 1;
      }
      if (*pattern != ']' || matched == inverted) return 0;
      pattern++; text++; continue;
    }
    if (*pattern++ != *text++) return 0;
  }
  return *text == '\0';
}

static int compare_strings(const void *left, const void *right) {
  return strcmp(*(const char *const *)left, *(const char *const *)right);
}

static int expand_glob(Arguments *arguments, const Token *token) {
  if (token->quoted || strpbrk(token->text, "*?[") == NULL) return argument_push(arguments, token->text);
  const char *slash = strrchr(token->text, '/');
  size_t directory_length = slash == NULL ? 0 : (size_t)(slash - token->text);
  int root_directory = slash == token->text;
  const char *pattern = slash == NULL ? token->text : slash + 1;
  char *directory = slash == NULL ? strdup(".")
                    : root_directory ? strdup("/")
                                     : strndup(token->text, directory_length);
  if (directory == NULL || strpbrk(directory, "*?[") != NULL) {
    free(directory); return argument_push(arguments, token->text);
  }
  DIR *stream = opendir(directory);
  if (stream == NULL) { free(directory); return argument_push(arguments, token->text); }
  Arguments matches = {0};
  struct dirent *entry;
  while ((entry = readdir(stream)) != NULL) {
    if (entry->d_name[0] == '.' && pattern[0] != '.') continue;
    if (!wildcard_match(pattern, entry->d_name)) continue;
    size_t length = slash == NULL ? strlen(entry->d_name)
                    : root_directory ? 1 + strlen(entry->d_name)
                                     : directory_length + 1 + strlen(entry->d_name);
    char *path = malloc(length + 1);
    if (path == NULL) goto glob_error;
    if (slash == NULL) strcpy(path, entry->d_name);
    else if (root_directory) snprintf(path, length + 1, "/%s", entry->d_name);
    else snprintf(path, length + 1, "%.*s/%s", (int)directory_length, token->text, entry->d_name);
    if (!argument_push_owned(&matches, path)) goto glob_error;
  }
  closedir(stream);
  free(directory);
  if (matches.count == 0) { arguments_dispose(&matches); return argument_push(arguments, token->text); }
  qsort(matches.items, matches.count, sizeof(*matches.items), compare_strings);
  for (size_t index = 0; index < matches.count; index++) {
    char *path = matches.items[index];
    matches.items[index] = NULL;
    if (!argument_push_owned(arguments, path)) { arguments_dispose(&matches); return 0; }
  }
  arguments_dispose(&matches);
  return 1;
glob_error:
  closedir(stream); free(directory); arguments_dispose(&matches); return 0;
}

enum command_resolution { COMMAND_FOUND, COMMAND_NOT_FOUND, COMMAND_PATH_TOO_LONG };

static enum command_resolution command_at(const char *path) {
  struct stat metadata;
  return stat(path, &metadata) == 0 && S_ISREG(metadata.st_mode)
             ? COMMAND_FOUND : COMMAND_NOT_FOUND;
}

static enum command_resolution resolve_command(const char *command,
                                                char *resolved, size_t capacity) {
  if (strchr(command, '/') != NULL) {
    int length = snprintf(resolved, capacity, "%s", command);
    if (length < 0 || (size_t)length >= capacity) return COMMAND_PATH_TOO_LONG;
    return command_at(resolved);
  }
  const char *path = getenv("PATH");
  if (path == NULL) path = "";
  do {
    const char *separator = strchr(path, ':');
    size_t length = separator == NULL ? strlen(path) : (size_t)(separator - path);
    const char *directory = length == 0 ? "." : path;
    if (length == 0) length = 1;
    int written = snprintf(resolved, capacity, "%.*s/%s", (int)length, directory, command);
    if (written >= 0 && (size_t)written < capacity && command_at(resolved) == COMMAND_FOUND)
      return COMMAND_FOUND;
    if (separator == NULL) break;
    path = separator + 1;
  } while (1);
  return COMMAND_NOT_FOUND;
}

static int assignment(const char *word, size_t *name_length) {
  const char *equals = strchr(word, '=');
  if (equals == NULL) return 0;
  *name_length = (size_t)(equals - word);
  return valid_name(word, *name_length);
}

static int set_assignment(const char *word) {
  size_t name_length;
  if (!assignment(word, &name_length)) return 0;
  char *name = strndup(word, name_length);
  if (name == NULL) return -1;
  int status = setenv(name, word + name_length + 1, 1);
  free(name);
  return status == 0 ? 1 : -1;
}

static int builtin(Shell *shell, int argc, char **argv, int *handled) {
  *handled = 1;
  if (strcmp(argv[0], ":") == 0) return 0;
  if (strcmp(argv[0], "exit") == 0) {
    if (argc > 2) { fputs("slop: exit: expected at most one status\n", stderr); return 2; }
    long parsed = shell->last_status;
    if (argc == 2) {
      char *end = NULL;
      errno = 0;
      parsed = strtol(argv[1], &end, 10);
      if (errno == ERANGE || end == argv[1] || *end != '\0') {
        fprintf(stderr, "slop: exit: %s: numeric argument required\n", argv[1]);
        parsed = 2;
      }
    }
    shell->active = 0;
    shell->exit_status = (int)(parsed & 255);
    return shell->exit_status;
  }
  if (strcmp(argv[0], "cd") == 0) {
    if (argc > 2) { fputs("slop: cd: expected at most one directory\n", stderr); return 2; }
    const char *path = argc == 2 ? argv[1] : getenv("HOME");
    if (path == NULL || path[0] == '\0') path = "/workspace";
    if (chdir(path) != 0) { fprintf(stderr, "slop: cd: %s: %s\n", path, strerror(errno)); return 1; }
    return 0;
  }
  if (strcmp(argv[0], "export") == 0) {
    for (int index = 1; index < argc; index++) {
      int result = set_assignment(argv[index]);
      if (result < 0) return 1;
      if (result == 0 && !valid_name(argv[index], strlen(argv[index]))) {
        fprintf(stderr, "slop: export: invalid name: %s\n", argv[index]); return 2;
      }
    }
    return 0;
  }
  if (strcmp(argv[0], "unset") == 0) {
    for (int index = 1; index < argc; index++) {
      if (!valid_name(argv[index], strlen(argv[index]))) {
        fprintf(stderr, "slop: unset: invalid name: %s\n", argv[index]); return 2;
      }
      if (unsetenv(argv[index]) != 0) return 1;
    }
    return 0;
  }
  if (strcmp(argv[0], "set") == 0) {
    if (argc == 1) return 0;
    for (int argument = 1; argument < argc; argument++) {
      const char *option = argv[argument];
      if ((option[0] != '-' && option[0] != '+') || option[1] == '\0') {
        fputs("slop: set: only e and x options are supported\n", stderr);
        return 2;
      }
      const int enabled = option[0] == '-';
      for (size_t index = 1; option[index] != '\0'; index++) {
        if (option[index] == 'e') shell->errexit = enabled;
        else if (option[index] == 'x') shell->xtrace = enabled;
        else {
          fputs("slop: set: only e and x options are supported\n", stderr);
          return 2;
        }
      }
    }
    return 0;
  }
  *handled = 0;
  return 0;
}

static int run_with_descriptors(Shell *shell, int argc, char **argv,
                                int input, int output, int error) {
  if (argc == 0) return 0;
  int handled = 0;
  int is_builtin = strcmp(argv[0], ":") == 0 || strcmp(argv[0], "exit") == 0 ||
                   strcmp(argv[0], "cd") == 0 || strcmp(argv[0], "export") == 0 ||
                   strcmp(argv[0], "unset") == 0 || strcmp(argv[0], "set") == 0;
  if (is_builtin) {
    int saved[3] = {dup(0), dup(1), dup(2)};
    if (saved[0] < 0 || saved[1] < 0 || saved[2] < 0 ||
        dup2(input, 0) < 0 || dup2(output, 1) < 0 || dup2(error, 2) < 0) {
      for (int index = 0; index < 3; index++) if (saved[index] >= 0) close(saved[index]);
      return 126;
    }
    clearerr(stdin); clearerr(stdout); clearerr(stderr);
    int status = builtin(shell, argc, argv, &handled);
    fflush(NULL);
    dup2(saved[0], 0); dup2(saved[1], 1); dup2(saved[2], 2);
    close(saved[0]); close(saved[1]); close(saved[2]);
    clearerr(stdin); clearerr(stdout); clearerr(stderr);
    return status;
  }
  char path[1024];
  enum command_resolution resolution = resolve_command(argv[0], path, sizeof(path));
  if (resolution == COMMAND_PATH_TOO_LONG) { fprintf(stderr, "slop: %s: path is too long\n", argv[0]); return 126; }
  if (resolution != COMMAND_FOUND) { fprintf(stderr, "slop: %s: command not found\n", argv[0]); return 127; }
  int pid = dolly_spawn(path, argc, argv, input, output, error);
  if (pid < 0) { fprintf(stderr, "slop: %s: spawn failed: %s\n", argv[0], strerror(-pid)); return 126; }
  int status = 126;
  int wait_status = dolly_wait(pid, &status);
  if (wait_status != 0) { fprintf(stderr, "slop: %s: wait failed: %s\n", argv[0], strerror(-wait_status)); return 126; }
  return status;
}

static int save_environment_change(const char *word, EnvironmentChange *change) {
  size_t name_length;
  if (!assignment(word, &name_length)) return 0;
  change->name = strndup(word, name_length);
  if (change->name == NULL) return -1;
  const char *old = getenv(change->name);
  change->existed = old != NULL;
  change->old_value = old == NULL ? NULL : strdup(old);
  if (old != NULL && change->old_value == NULL) { free(change->name); return -1; }
  if (setenv(change->name, word + name_length + 1, 1) != 0) {
    free(change->name); free(change->old_value); return -1;
  }
  return 1;
}

static void restore_environment_changes(EnvironmentChange *changes, size_t count) {
  while (count != 0) {
    EnvironmentChange *change = &changes[--count];
    if (change->existed) setenv(change->name, change->old_value, 1);
    else unsetenv(change->name);
    free(change->name); free(change->old_value);
  }
}

static int open_redirection(const char *path, int flags) {
  int descriptor = open(path, flags, 0666);
  if (descriptor < 0) fprintf(stderr, "slop: %s: %s\n", path, strerror(errno));
  return descriptor;
}

static int trace_safe_byte(unsigned char byte) {
  return isalnum(byte) || byte == '_' || byte == '@' || byte == '%' ||
         byte == '+' || byte == '=' || byte == ':' || byte == ',' ||
         byte == '.' || byte == '/' || byte == '-';
}

static void trace_word(const char *word) {
  if (word[0] == '\0') {
    fputs("''", stderr);
    return;
  }
  int safe = 1;
  for (const unsigned char *byte = (const unsigned char *)word;
       *byte != '\0'; byte++) {
    if (!trace_safe_byte(*byte)) {
      safe = 0;
      break;
    }
  }
  if (safe) {
    fputs(word, stderr);
    return;
  }
  fputc('\'', stderr);
  for (const char *byte = word; *byte != '\0'; byte++) {
    if (*byte == '\'') fputs("'\\''", stderr);
    else fputc(*byte, stderr);
  }
  fputc('\'', stderr);
}

static const char *trace_redirection(TokenKind kind) {
  switch (kind) {
    case TOKEN_INPUT: return "<";
    case TOKEN_OUTPUT: return ">";
    case TOKEN_APPEND: return ">>";
    case TOKEN_ERROR: return "2>";
    case TOKEN_ERROR_APPEND: return "2>>";
    case TOKEN_ERROR_TO_OUTPUT: return "2>&1";
    default: return NULL;
  }
}

static void trace_simple(Shell *shell, Arguments *arguments,
                         Token *tokens, size_t start, size_t end) {
  if (!shell->xtrace) return;
  fputc('+', stderr);
  for (size_t index = 0; index < arguments->count; index++) {
    fputc(' ', stderr);
    trace_word(arguments->items[index]);
  }
  for (size_t index = start; index < end; index++) {
    const char *operator = trace_redirection(tokens[index].kind);
    if (operator == NULL) continue;
    fputc(' ', stderr);
    fputs(operator, stderr);
    if (tokens[index].kind != TOKEN_ERROR_TO_OUTPUT && ++index < end) {
      fputc(' ', stderr);
      trace_word(tokens[index].text);
    }
  }
  fputc('\n', stderr);
  fflush(stderr);
  fsync(STDERR_FILENO);
}

static int expand_deferred_status(Shell *shell, Token *tokens,
                                  size_t start, size_t end) {
  char status[32];
  snprintf(status, sizeof(status), "%d", shell->last_status);
  const size_t marker_length = sizeof(SLOP_DEFERRED_STATUS) - 1;
  for (size_t index = start; index < end; index++) {
    if (tokens[index].text == NULL ||
        strstr(tokens[index].text, SLOP_DEFERRED_STATUS) == NULL) continue;
    Buffer expanded = {0};
    const char *cursor = tokens[index].text;
    const char *marker;
    while ((marker = strstr(cursor, SLOP_DEFERRED_STATUS)) != NULL) {
      if (!buffer_append(&expanded, cursor, (size_t)(marker - cursor)) ||
          !buffer_append(&expanded, status, strlen(status))) {
        free(expanded.data);
        return 0;
      }
      cursor = marker + marker_length;
    }
    if (!buffer_append(&expanded, cursor, strlen(cursor))) {
      free(expanded.data);
      return 0;
    }
    free(tokens[index].text);
    tokens[index].text = buffer_release(&expanded);
    if (tokens[index].text == NULL) return 0;
  }
  return 1;
}

static int run_simple(Shell *shell, Token *tokens, size_t start, size_t end,
                      int pipeline_input, int pipeline_output) {
  Arguments arguments = {0};
  int input = pipeline_input, output = pipeline_output, error = STDERR_FILENO;
  int owned_input = -1, owned_output = -1, owned_error = -1, error_to_output = 0;
  if (!expand_deferred_status(shell, tokens, start, end)) goto memory_error;
  for (size_t index = start; index < end; index++) {
    Token *token = &tokens[index];
    if (token->kind == TOKEN_WORD) {
      if (!expand_glob(&arguments, token)) goto memory_error;
      continue;
    }
    if (token->kind == TOKEN_ERROR_TO_OUTPUT) continue;
    if (token->kind != TOKEN_INPUT && token->kind != TOKEN_OUTPUT &&
        token->kind != TOKEN_APPEND && token->kind != TOKEN_ERROR &&
        token->kind != TOKEN_ERROR_APPEND) {
      fputs("slop: invalid simple command\n", stderr); goto syntax_error;
    }
    if (++index >= end || tokens[index].kind != TOKEN_WORD) {
      fputs("slop: redirection requires a path\n", stderr); goto syntax_error;
    }
  }
  trace_simple(shell, &arguments, tokens, start, end);
  for (size_t index = start; index < end; index++) {
    Token *token = &tokens[index];
    if (token->kind == TOKEN_WORD) continue;
    if (token->kind == TOKEN_ERROR_TO_OUTPUT) { error_to_output = 1; continue; }
    index++;
    const char *path = tokens[index].text;
    int descriptor;
    if (token->kind == TOKEN_INPUT) {
      descriptor = open_redirection(path, O_RDONLY);
      if (descriptor < 0) goto command_error;
      if (owned_input >= 0) close(owned_input);
      input = owned_input = descriptor;
    } else {
      int flags = O_WRONLY | O_CREAT |
                  ((token->kind == TOKEN_APPEND || token->kind == TOKEN_ERROR_APPEND)
                       ? O_APPEND : O_TRUNC);
      descriptor = open_redirection(path, flags);
      if (descriptor < 0) goto command_error;
      if (token->kind == TOKEN_ERROR || token->kind == TOKEN_ERROR_APPEND) {
        if (owned_error >= 0) close(owned_error);
        error = owned_error = descriptor;
      } else {
        if (owned_output >= 0) close(owned_output);
        output = owned_output = descriptor;
      }
    }
  }
  if (error_to_output) error = output;
  size_t prefix = 0;
  while (prefix < arguments.count) {
    size_t ignored;
    if (!assignment(arguments.items[prefix], &ignored)) break;
    prefix++;
  }
  if (prefix == arguments.count) {
    for (size_t index = 0; index < prefix; index++) if (set_assignment(arguments.items[index]) < 0) goto command_error;
    arguments_dispose(&arguments);
    if (owned_input >= 0) close(owned_input);
    if (owned_output >= 0) close(owned_output);
    if (owned_error >= 0) close(owned_error);
    return 0;
  }
  EnvironmentChange *changes = prefix == 0 ? NULL : calloc(prefix, sizeof(*changes));
  if (prefix != 0 && changes == NULL) goto memory_error;
  size_t changed = 0;
  for (; changed < prefix; changed++) {
    if (save_environment_change(arguments.items[changed], &changes[changed]) < 0) {
      restore_environment_changes(changes, changed); free(changes); goto command_error;
    }
  }
  int status = run_with_descriptors(shell, (int)(arguments.count - prefix),
                                    arguments.items + prefix, input, output, error);
  restore_environment_changes(changes, changed);
  free(changes);
  arguments_dispose(&arguments);
  if (owned_input >= 0) close(owned_input);
  if (owned_output >= 0) close(owned_output);
  if (owned_error >= 0) close(owned_error);
  return status;
memory_error:
  fputs("slop: out of memory\n", stderr);
command_error:
  arguments_dispose(&arguments);
  if (owned_input >= 0) close(owned_input);
  if (owned_output >= 0) close(owned_output);
  if (owned_error >= 0) close(owned_error);
  return 1;
syntax_error:
  arguments_dispose(&arguments);
  if (owned_input >= 0) close(owned_input);
  if (owned_output >= 0) close(owned_output);
  if (owned_error >= 0) close(owned_error);
  return 2;
}

static int run_pipeline(Shell *shell, Token *tokens, size_t start, size_t end) {
  int invert = 0;
  if (start < end && tokens[start].kind == TOKEN_NOT) { invert = 1; start++; }
  if (start == end) { fputs("slop: expected a command\n", stderr); return 2; }
  int input = STDIN_FILENO, owned_input = -1, status = 0;
  size_t stage = start;
  for (size_t index = start; index <= end; index++) {
    if (index != end && tokens[index].kind != TOKEN_PIPE) continue;
    if (stage == index) {
      fputs("slop: pipeline requires commands on both sides\n", stderr);
      if (owned_input >= 0) close(owned_input);
      return 2;
    }
    int output = STDOUT_FILENO;
    if (index != end) {
      char path[] = "/tmp/slop-pipeline-XXXXXX";
      output = mkstemp(path);
      if (output < 0) { if (owned_input >= 0) close(owned_input); return 1; }
      unlink(path);
    }
    status = run_simple(shell, tokens, stage, index, input, output);
    if (owned_input >= 0) close(owned_input);
    owned_input = -1;
    if (index != end) {
      if (lseek(output, 0, SEEK_SET) < 0) { close(output); return 1; }
      input = owned_input = output;
    }
    stage = index + 1;
    if (!shell->active) break;
  }
  if (owned_input >= 0) close(owned_input);
  return invert ? status == 0 : status;
}

static int execute_tokens(Shell *shell, TokenList *list) {
  size_t start = 0;
  TokenKind previous = TOKEN_SEMI;
  int status = shell->last_status;
  for (size_t index = 0; index < list->count; index++) {
    TokenKind kind = list->items[index].kind;
    if (kind != TOKEN_SEMI && kind != TOKEN_AND && kind != TOKEN_OR && kind != TOKEN_END) continue;
    if (start == index) {
      if (kind == TOKEN_SEMI || kind == TOKEN_END) { start = index + 1; previous = kind; continue; }
      fputs("slop: missing command around conditional operator\n", stderr);
      return 2;
    }
    int should_run = previous == TOKEN_SEMI ||
                     (previous == TOKEN_AND && status == 0) ||
                     (previous == TOKEN_OR && status != 0);
    if (should_run) {
      status = run_pipeline(shell, list->items, start, index);
      shell->last_status = status;
      if (!shell->active) return shell->exit_status;
      if (shell->errexit && status != 0 && kind != TOKEN_AND && kind != TOKEN_OR)
        return status;
    }
    previous = kind;
    start = index + 1;
  }
  return status;
}

static int execute_text(Shell *shell, const char *text) {
  TokenList tokens = {0};
  if (!lex(shell, text, &tokens)) { tokens_dispose(&tokens); return 2; }
  int status = execute_tokens(shell, &tokens);
  tokens_dispose(&tokens);
  shell->last_status = status;
  return status;
}

static void history_dispose(History *history) {
  for (size_t index = 0; index < history->count; index++) {
    free(history->items[index]);
  }
  free(history->items);
  memset(history, 0, sizeof(*history));
}

static int history_push_owned(History *history, char *line) {
  if (history->count != 0 &&
      strcmp(history->items[history->count - 1], line) == 0) {
    free(line);
    return 1;
  }
  if (history->count == SLOP_MAX_HISTORY) {
    free(history->items[0]);
    memmove(history->items, history->items + 1,
            (history->count - 1) * sizeof(*history->items));
    history->count--;
  }
  if (!grow((void **)&history->items, &history->capacity,
            history->count + 1, sizeof(*history->items))) {
    free(line);
    return 0;
  }
  history->items[history->count++] = line;
  return 1;
}

static int line_is_blank(const char *line) {
  for (; *line != '\0'; line++) {
    if (!isspace((unsigned char)*line)) return 0;
  }
  return 1;
}

static const char *history_path(void) {
  const char *path = getenv("HISTFILE");
  return path == NULL ? "/home/dolly/.slop_history" : path;
}

static void history_load(History *history) {
  const char *path = history_path();
  if (path[0] == '\0') return;
  FILE *file = fopen(path, "rb");
  if (file == NULL) return;
  char *line = malloc(SLOP_MAX_LINE + 2);
  if (line == NULL) { fclose(file); return; }
  while (fgets(line, SLOP_MAX_LINE + 2, file) != NULL) {
    size_t length = strlen(line);
    if (length == SLOP_MAX_LINE + 1 && line[length - 1] != '\n') {
      int byte;
      do byte = fgetc(file); while (byte != '\n' && byte != EOF);
      continue;
    }
    while (length != 0 &&
           (line[length - 1] == '\n' || line[length - 1] == '\r')) {
      line[--length] = '\0';
    }
    if (length == 0) continue;
    char *copy = strdup(line);
    if (copy == NULL || !history_push_owned(history, copy)) break;
  }
  free(line);
  fclose(file);
}

static void history_add(History *history, const char *line) {
  if (line[0] == '\0' || line_is_blank(line)) return;
  int duplicate = history->count != 0 &&
                  strcmp(history->items[history->count - 1], line) == 0;
  if (!duplicate) {
    const char *path = history_path();
    if (path[0] != '\0') {
      FILE *file = fopen(path, "ab");
      if (file != NULL) {
        fwrite(line, 1, strlen(line), file);
        fputc('\n', file);
        fclose(file);
      }
    }
  }
  char *copy = strdup(line);
  if (copy != NULL) history_push_owned(history, copy);
}

static void completions_dispose(Completions *completions) {
  for (size_t index = 0; index < completions->count; index++) {
    free(completions->items[index].text);
  }
  free(completions->items);
  memset(completions, 0, sizeof(*completions));
}

static int completion_push(Completions *completions, const char *text,
                           int directory) {
  for (size_t index = 0; index < completions->count; index++) {
    if (strcmp(completions->items[index].text, text) == 0) return 1;
  }
  char *copy = strdup(text);
  if (copy == NULL ||
      !grow((void **)&completions->items, &completions->capacity,
            completions->count + 1, sizeof(*completions->items))) {
    free(copy);
    return 0;
  }
  completions->items[completions->count++] =
      (Completion){.text = copy, .directory = directory};
  return 1;
}

static int compare_completions(const void *left, const void *right) {
  const Completion *first = left;
  const Completion *second = right;
  return strcmp(first->text, second->text);
}

static int completion_command_position(const char *line, size_t word_start) {
  while (word_start != 0 &&
         isspace((unsigned char)line[word_start - 1])) word_start--;
  if (word_start == 0) return 1;
  char previous = line[word_start - 1];
  return previous == ';' || previous == '|' || previous == '&';
}

static int completion_word_byte(unsigned char byte) {
  return !isspace(byte) && strchr(";|&<>", byte) == NULL;
}

static int complete_directory(const char *directory, const char *base,
                              const char *replacement_directory,
                              int regular_only, Completions *completions) {
  DIR *stream = opendir(directory);
  if (stream == NULL) return 1;
  const size_t base_length = strlen(base);
  struct dirent *entry;
  while ((entry = readdir(stream)) != NULL) {
    if (entry->d_name[0] == '.' && base[0] != '.') continue;
    if (strncmp(entry->d_name, base, base_length) != 0) continue;

    size_t path_length = strlen(directory) + strlen(entry->d_name) + 2;
    char *path = malloc(path_length);
    if (path == NULL) { closedir(stream); return 0; }
    snprintf(path, path_length, "%s%s%s", directory,
             strcmp(directory, "/") == 0 ? "" : "/", entry->d_name);
    struct stat metadata;
    int exists = stat(path, &metadata) == 0;
    free(path);
    if (!exists || (regular_only && !S_ISREG(metadata.st_mode))) continue;

    size_t replacement_length = strlen(replacement_directory) +
                                strlen(entry->d_name) + 1;
    char *replacement = malloc(replacement_length);
    if (replacement == NULL) { closedir(stream); return 0; }
    snprintf(replacement, replacement_length, "%s%s",
             replacement_directory, entry->d_name);
    int ok = completion_push(completions, replacement,
                             S_ISDIR(metadata.st_mode));
    free(replacement);
    if (!ok) { closedir(stream); return 0; }
  }
  closedir(stream);
  return 1;
}

static int collect_completions(const char *word, int command_position,
                               Completions *completions) {
  const char *slash = strrchr(word, '/');
  if (slash != NULL || !command_position) {
    size_t directory_length = slash == NULL ? 0 : (size_t)(slash - word);
    const char *base = slash == NULL ? word : slash + 1;
    char *directory = slash == NULL ? strdup(".")
                      : directory_length == 0 ? strdup("/")
                                              : strndup(word, directory_length);
    char *replacement = slash == NULL ? strdup("")
                        : strndup(word, (size_t)(slash - word) + 1);
    if (directory == NULL || replacement == NULL) {
      free(directory); free(replacement); return 0;
    }
    int ok = complete_directory(directory, base, replacement, 0, completions);
    free(directory);
    free(replacement);
    return ok;
  }

  const char *path = getenv("PATH");
  if (path == NULL) path = "";
  do {
    const char *separator = strchr(path, ':');
    size_t length = separator == NULL ? strlen(path) : (size_t)(separator - path);
    char *directory = length == 0 ? strdup(".") : strndup(path, length);
    if (directory == NULL ||
        !complete_directory(directory, word, "", 1, completions)) {
      free(directory);
      return 0;
    }
    free(directory);
    if (separator == NULL) break;
    path = separator + 1;
  } while (1);
  return 1;
}

static void editor_write(const char *text) {
  fputs(text, stdout);
  fflush(stdout);
}

static void editor_write_bytes(const unsigned char *bytes, size_t length) {
  fwrite(bytes, 1, length, stdout);
  fflush(stdout);
}

static void redraw_line(const char *line, size_t length, size_t cursor) {
  editor_write("\r\033[2K");
  print_prompt();
  editor_write_bytes((const unsigned char *)line, length);
  if (cursor < length) {
    char movement[64];
    snprintf(movement, sizeof(movement), "\033[%zuD", length - cursor);
    editor_write(movement);
  }
}

static void editor_replace(char *line, size_t *length, size_t *cursor,
                           const char *replacement) {
  size_t replacement_length = strlen(replacement);
  if (replacement_length > SLOP_MAX_LINE) replacement_length = SLOP_MAX_LINE;
  memcpy(line, replacement, replacement_length);
  line[replacement_length] = '\0';
  *length = replacement_length;
  *cursor = replacement_length;
  redraw_line(line, *length, *cursor);
}

static size_t common_completion_length(const Completions *completions) {
  size_t length = strlen(completions->items[0].text);
  for (size_t index = 1; index < completions->count; index++) {
    size_t cursor = 0;
    while (cursor < length &&
           completions->items[0].text[cursor] ==
               completions->items[index].text[cursor]) cursor++;
    length = cursor;
  }
  return length;
}

static void show_completions(const Completions *completions,
                             const char *line, size_t length, size_t cursor) {
  editor_write("\r\n");
  uint32_t columns = dolly_terminal_columns();
  if (columns < 20) columns = 80;
  size_t used = 0;
  for (size_t index = 0; index < completions->count; index++) {
    size_t item_length = strlen(completions->items[index].text) +
                         (completions->items[index].directory ? 1 : 0);
    if (used != 0 && used + 2 + item_length >= columns) {
      editor_write("\r\n");
      used = 0;
    } else if (used != 0) {
      editor_write("  ");
      used += 2;
    }
    editor_write(completions->items[index].text);
    if (completions->items[index].directory) editor_write("/");
    used += item_length;
  }
  editor_write("\r\n");
  print_prompt();
  editor_write_bytes((const unsigned char *)line, length);
  if (cursor < length) {
    char movement[64];
    snprintf(movement, sizeof(movement), "\033[%zuD", length - cursor);
    editor_write(movement);
  }
}

static void complete_line(char *line, size_t *length, size_t *cursor) {
  size_t start = *cursor;
  while (start != 0 && completion_word_byte((unsigned char)line[start - 1])) {
    start--;
  }
  char *word = strndup(line + start, *cursor - start);
  if (word == NULL) return;
  Completions completions = {0};
  int command_position = completion_command_position(line, start);
  if (!collect_completions(word, command_position, &completions)) {
    free(word);
    completions_dispose(&completions);
    return;
  }
  free(word);
  if (completions.count == 0) {
    editor_write("\a");
    completions_dispose(&completions);
    return;
  }
  qsort(completions.items, completions.count, sizeof(*completions.items),
        compare_completions);
  size_t replacement_length = completions.count == 1
                                  ? strlen(completions.items[0].text)
                                  : common_completion_length(&completions);
  size_t old_word_length = *cursor - start;
  size_t suffix = *length - *cursor;
  size_t addition = completions.count == 1 ? 1 : 0;
  if (completions.count == 1 && completions.items[0].directory) {
    addition = replacement_length != 0 &&
               completions.items[0].text[replacement_length - 1] == '/'
                   ? 0 : 1;
  }
  if (*length - old_word_length + replacement_length + addition <=
      SLOP_MAX_LINE) {
    memmove(line + start + replacement_length + addition,
            line + *cursor, suffix + 1);
    memcpy(line + start, completions.items[0].text, replacement_length);
    if (addition != 0) {
      line[start + replacement_length] =
          completions.count == 1 && completions.items[0].directory ? '/' : ' ';
    }
    *length = *length - old_word_length + replacement_length + addition;
    *cursor = start + replacement_length + addition;
    redraw_line(line, *length, *cursor);
  }
  if (completions.count > 1 && replacement_length == old_word_length) {
    show_completions(&completions, line, *length, *cursor);
  }
  completions_dispose(&completions);
}

enum editor_result { EDITOR_LINE, EDITOR_EOF, EDITOR_INTERRUPTED };

static int read_escape_sequence(void) {
  int byte = dolly_terminal_read_raw_timeout(25);
  if (byte != '[' && byte != 'O') return 0;
  int final = dolly_terminal_read_raw_timeout(25);
  if (final < 0) return 0;
  if (final >= '0' && final <= '9') {
    int number = 0;
    do {
      number = number * 10 + final - '0';
      final = dolly_terminal_read_raw_timeout(25);
    } while (final >= '0' && final <= '9');
    while (final >= 0 && final != '~' && !(final >= '@' && final <= '~')) {
      final = dolly_terminal_read_raw_timeout(25);
    }
    if (final != '~') return 0;
    if (number == 3) return 5;
    if (number == 1 || number == 7) return 6;
    if (number == 4 || number == 8) return 7;
    return 0;
  }
  switch (final) {
    case 'A': return 1;
    case 'B': return 2;
    case 'C': return 3;
    case 'D': return 4;
    case 'H': return 6;
    case 'F': return 7;
    default: return 0;
  }
}

static enum editor_result read_interactive_line(char *line, History *history) {
  size_t length = 0;
  size_t cursor = 0;
  size_t history_cursor = history->count;
  char *draft = NULL;
  char *search = NULL;
  size_t search_cursor = history->count;
  line[0] = '\0';

  for (;;) {
    int byte = dolly_terminal_read_raw_timeout(-1);
    int key = byte == 0x1b ? read_escape_sequence() : 0;
    if (key != 0) byte = 0;
    if (key == 1 || key == 2) {
      if (key == 1 && history_cursor != 0) {
        if (history_cursor == history->count) {
          free(draft);
          draft = strdup(line);
        }
        editor_replace(line, &length, &cursor,
                       history->items[--history_cursor]);
      } else if (key == 2 && history_cursor < history->count) {
        history_cursor++;
        editor_replace(line, &length, &cursor,
                       history_cursor == history->count
                           ? (draft == NULL ? "" : draft)
                           : history->items[history_cursor]);
      }
      free(search); search = NULL;
      search_cursor = history->count;
      continue;
    }
    if (key == 3 || byte == 0x06) {
      if (cursor < length) {
        cursor++;
        editor_write("\033[C");
      }
      continue;
    }
    if (key == 4 || byte == 0x02) {
      if (cursor != 0) {
        cursor--;
        editor_write("\033[D");
      }
      continue;
    }
    if (key == 5 || byte == 0x04) {
      if (length == 0 && byte == 0x04) {
        free(draft); free(search);
        return EDITOR_EOF;
      }
      if (cursor < length) {
        memmove(line + cursor, line + cursor + 1, length - cursor);
        length--;
        redraw_line(line, length, cursor);
      }
      continue;
    }
    if (key == 6 || byte == 0x01) {
      cursor = 0;
      redraw_line(line, length, cursor);
      continue;
    }
    if (key == 7 || byte == 0x05) {
      cursor = length;
      redraw_line(line, length, cursor);
      continue;
    }
    if (byte == '\r' || byte == '\n') {
      editor_write("\r\n");
      free(draft); free(search);
      return EDITOR_LINE;
    }
    if (byte == 0x03) {
      editor_write("^C\r\n");
      free(draft); free(search);
      line[0] = '\0';
      return EDITOR_INTERRUPTED;
    }
    if (byte == '\t') {
      complete_line(line, &length, &cursor);
      free(search); search = NULL;
      search_cursor = history->count;
      continue;
    }
    if (byte == 0x0c) {
      editor_write("\033[2J\033[H");
      print_prompt();
      editor_write_bytes((const unsigned char *)line, length);
      continue;
    }
    if (byte == 0x12) {
      if (search == NULL) {
        search = strdup(line);
        search_cursor = history->count;
      }
      if (search != NULL) {
        while (search_cursor != 0) {
          const char *candidate = history->items[--search_cursor];
          if (strstr(candidate, search) != NULL) {
            editor_replace(line, &length, &cursor, candidate);
            break;
          }
        }
      }
      continue;
    }
    if (byte == 0x15) {
      if (cursor != 0) {
        memmove(line, line + cursor, length - cursor + 1);
        length -= cursor;
        cursor = 0;
        redraw_line(line, length, cursor);
      }
      continue;
    }
    if (byte == 0x0b) {
      if (cursor < length) {
        line[cursor] = '\0';
        length = cursor;
        redraw_line(line, length, cursor);
      }
      continue;
    }
    if (byte == 0x7f || byte == '\b') {
      if (cursor != 0) {
        memmove(line + cursor - 1, line + cursor, length - cursor + 1);
        cursor--;
        length--;
        redraw_line(line, length, cursor);
      }
      free(search); search = NULL;
      search_cursor = history->count;
      continue;
    }
    if (byte < ' ') continue;
    if (length == SLOP_MAX_LINE) {
      editor_write("\a");
      continue;
    }
    memmove(line + cursor + 1, line + cursor, length - cursor + 1);
    line[cursor++] = (char)byte;
    length++;
    if (cursor == length) {
      unsigned char character = (unsigned char)byte;
      editor_write_bytes(&character, 1);
    } else {
      redraw_line(line, length, cursor);
    }
    history_cursor = history->count;
    free(draft); draft = NULL;
    free(search); search = NULL;
    search_cursor = history->count;
  }
}

static void print_prompt(void) {
  char cwd[1024];
  if (getcwd(cwd, sizeof(cwd)) == NULL) strcpy(cwd, "?");
  printf("\033[33mdolly\033[0m:%s$ ", cwd);
  fflush(stdout);
}

static int interactive(Shell *shell) {
  if (mkdir("/workspace", 0755) != 0 && errno != EEXIST) {
    fprintf(stderr, "slop: /workspace: %s\n", strerror(errno)); return 1;
  }
  if (chdir("/workspace") != 0) { fprintf(stderr, "slop: /workspace: %s\n", strerror(errno)); return 1; }
  if (getenv("HISTFILE") == NULL &&
      setenv("HISTFILE", "/home/dolly/.slop_history", 0) != 0) {
    fprintf(stderr, "slop: HISTFILE: %s\n", strerror(errno));
    return 1;
  }
  shell->interactive = 1;
  shell->active = 1;
  puts("Dolly slop 0.1 — type 'help' for commands");
  char *line = malloc(SLOP_MAX_LINE + 1);
  if (line == NULL) return 1;
  History history = {0};
  history_load(&history);
  while (shell->active) {
    print_prompt();
    enum editor_result result = read_interactive_line(line, &history);
    if (result == EDITOR_EOF) {
      shell->active = 0;
      puts("logout");
      break;
    }
    if (result == EDITOR_INTERRUPTED) shell->last_status = 130;
    else {
      history_add(&history, line);
      shell->last_status = execute_text(shell, line);
    }
    if (shell->last_status != 0 && shell->last_status != 127 && shell->active)
      fprintf(stderr, "slop: status %d\n", shell->last_status);
    dolly_terminal_publish_result(shell->last_status);
  }
  history_dispose(&history);
  free(line);
  return shell->active ? shell->last_status : shell->exit_status;
}

static char *read_script(const char *path) {
  FILE *file = fopen(path, "rb");
  if (file == NULL) { fprintf(stderr, "slop: %s: %s\n", path, strerror(errno)); return NULL; }
  Buffer source = {0};
  char bytes[4096];
  size_t count;
  while ((count = fread(bytes, 1, sizeof(bytes), file)) != 0) {
    if (!buffer_append(&source, bytes, count)) { fclose(file); free(source.data); return NULL; }
  }
  if (ferror(file) || fclose(file) != 0) { free(source.data); return NULL; }
  return buffer_release(&source);
}

static void usage(FILE *stream) {
  fputs("usage: slop [-e] [-c COMMAND [NAME [ARG ...]] | FILE [ARG ...]]\n", stream);
}

int main(int argc, char **argv) {
  Shell shell = {.active = 1, .argc = argc, .argv = argv};
  int index = 1;
  if (index < argc && strcmp(argv[index], "--help") == 0) { usage(stdout); return 0; }
  if (index < argc && strcmp(argv[index], "-e") == 0) { shell.errexit = 1; index++; }
  if (index == argc) return interactive(&shell);
  if (strcmp(argv[index], "-c") == 0) {
    if (++index == argc) { usage(stderr); return 2; }
    const char *command = argv[index++];
    char *default_parameters[] = {"slop", NULL};
    shell.argc = index < argc ? argc - index : 1;
    shell.argv = index < argc ? argv + index : default_parameters;
    int status = execute_text(&shell, command);
    return shell.active ? status : shell.exit_status;
  }
  if (argv[index][0] == '-') { fprintf(stderr, "slop: unsupported option: %s\n", argv[index]); return 2; }
  char *source = read_script(argv[index]);
  if (source == NULL) return 1;
  shell.argc = argc - index;
  shell.argv = argv + index;
  int status = execute_text(&shell, source);
  free(source);
  return shell.active ? status : shell.exit_status;
}
