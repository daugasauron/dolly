#define _POSIX_C_SOURCE 200809L

#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

#include <dolly/runtime.h>

enum { INPUT_LIMIT = 16 * 1024 * 1024, ARGUMENT_LIMIT = 100000 };

typedef struct {
  char **items;
  size_t count;
  size_t capacity;
} string_list;

static void usage(void) {
  fputs("usage: xargs [-0rt] [-n number] [-I replace] [-P 1] "
        "[command [argument ...]]\n", stderr);
}

static void dispose_list(string_list *list) {
  for (size_t index = 0; index < list->count; ++index) free(list->items[index]);
  free(list->items);
  *list = (string_list){0};
}

static int append_item(string_list *list, const char *bytes, size_t length) {
  if (list->count >= ARGUMENT_LIMIT) {
    errno = E2BIG;
    return -1;
  }
  if (list->count == list->capacity) {
    size_t capacity = list->capacity == 0 ? 32 : list->capacity * 2;
    if (capacity < list->capacity || capacity > SIZE_MAX / sizeof(*list->items)) {
      return -1;
    }
    char **items = realloc(list->items, capacity * sizeof(*items));
    if (items == NULL) return -1;
    list->items = items;
    list->capacity = capacity;
  }
  char *item = malloc(length + 1);
  if (item == NULL) return -1;
  memcpy(item, bytes, length);
  item[length] = '\0';
  list->items[list->count++] = item;
  return 0;
}

static int append_byte(char **buffer, size_t *length, size_t *capacity, int byte) {
  if (*length >= INPUT_LIMIT) {
    errno = E2BIG;
    return -1;
  }
  if (*length == *capacity) {
    size_t next = *capacity == 0 ? 128 : *capacity * 2;
    if (next > INPUT_LIMIT) next = INPUT_LIMIT;
    char *resized = realloc(*buffer, next);
    if (resized == NULL) return -1;
    *buffer = resized;
    *capacity = next;
  }
  (*buffer)[(*length)++] = (char)byte;
  return 0;
}

static int read_items(string_list *items, int nul, int line_mode) {
  char *item = NULL;
  size_t length = 0;
  size_t capacity = 0;
  int quote = 0;
  int escaped = 0;
  int started = 0;
  size_t total = 0;
  int byte;

  while ((byte = fgetc(stdin)) != EOF) {
    if (++total > INPUT_LIMIT) {
      errno = E2BIG;
      goto fail;
    }
    if (nul) {
      if (byte == 0) {
        if (append_item(items, item == NULL ? "" : item, length) != 0) goto fail;
        length = 0;
        started = 0;
      } else if (append_byte(&item, &length, &capacity, byte) != 0) {
        goto fail;
      } else {
        started = 1;
      }
      continue;
    }

    if (escaped) {
      if (byte != '\n' && append_byte(&item, &length, &capacity, byte) != 0) goto fail;
      started = 1;
      escaped = 0;
      continue;
    }
    if (byte == '\\' && quote != '\'') {
      escaped = 1;
      started = 1;
      continue;
    }
    if ((byte == '\'' || byte == '"')) {
      if (quote == 0) {
        quote = byte;
        started = 1;
        continue;
      }
      if (quote == byte) {
        quote = 0;
        continue;
      }
    }
    if (quote == 0 && (byte == '\n' || (!line_mode && isspace((unsigned char)byte)))) {
      if (started) {
        if (append_item(items, item == NULL ? "" : item, length) != 0) goto fail;
        length = 0;
        started = 0;
      }
      continue;
    }
    if (append_byte(&item, &length, &capacity, byte) != 0) goto fail;
    started = 1;
  }

  if (ferror(stdin)) {
    fprintf(stderr, "xargs: could not read stdin: %s\n", strerror(errno));
    free(item);
    return -1;
  }
  if (escaped || quote != 0) {
    fputs(escaped ? "xargs: backslash at end of input\n"
                  : "xargs: unterminated quote\n", stderr);
    free(item);
    return -1;
  }
  if (started && append_item(items, item == NULL ? "" : item, length) != 0) goto fail;
  free(item);
  return 0;

fail:
  fprintf(stderr,
          "xargs: input exceeds the %d-byte/%d-argument limit or memory is exhausted\n",
          INPUT_LIMIT, ARGUMENT_LIMIT);
  free(item);
  return -1;
}

static int regular_file(const char *path) {
  struct stat metadata;
  return stat(path, &metadata) == 0 && S_ISREG(metadata.st_mode);
}

static char *resolve_command(const char *name) {
  if (strchr(name, '/') != NULL) return regular_file(name) ? strdup(name) : NULL;
  const char *path = getenv("PATH");
  if (path == NULL) path = "";
  const size_t name_length = strlen(name);
  const char *entry = path;
  do {
    const char *separator = strchr(entry, ':');
    const size_t length = separator == NULL ? strlen(entry)
                                             : (size_t)(separator - entry);
    const char *directory = length == 0 ? "." : entry;
    const size_t directory_length = length == 0 ? 1 : length;
    if (directory_length <= SIZE_MAX - name_length - 2) {
      char *candidate = malloc(directory_length + name_length + 2);
      if (candidate == NULL) return NULL;
      memcpy(candidate, directory, directory_length);
      size_t offset = directory_length;
      if (candidate[offset - 1] != '/') candidate[offset++] = '/';
      memcpy(candidate + offset, name, name_length + 1);
      if (regular_file(candidate)) return candidate;
      free(candidate);
    }
    if (separator == NULL) break;
    entry = separator + 1;
  } while (1);
  return NULL;
}

static char *replace_all(const char *input, const char *needle,
                         const char *replacement) {
  const size_t input_length = strlen(input);
  const size_t needle_length = strlen(needle);
  const size_t replacement_length = strlen(replacement);
  if (needle_length == 0) return strdup(input);
  size_t matches = 0;
  for (const char *cursor = input; (cursor = strstr(cursor, needle)) != NULL;
       cursor += needle_length) {
    matches++;
  }
  if (replacement_length > needle_length &&
      matches > (SIZE_MAX - input_length - 1) / (replacement_length - needle_length)) {
    return NULL;
  }
  size_t result_length = input_length;
  if (replacement_length >= needle_length) {
    result_length += matches * (replacement_length - needle_length);
  } else {
    result_length -= matches * (needle_length - replacement_length);
  }
  char *result = malloc(result_length + 1);
  if (result == NULL) return NULL;
  const char *source = input;
  char *destination = result;
  const char *match;
  while ((match = strstr(source, needle)) != NULL) {
    const size_t prefix = (size_t)(match - source);
    memcpy(destination, source, prefix);
    destination += prefix;
    memcpy(destination, replacement, replacement_length);
    destination += replacement_length;
    source = match + needle_length;
  }
  strcpy(destination, source);
  return result;
}

static void trace_arguments(char **arguments) {
  for (size_t index = 0; arguments[index] != NULL; ++index) {
    if (index != 0) fputc(' ', stderr);
    fputc('\'', stderr);
    for (const char *byte = arguments[index]; *byte != '\0'; ++byte) {
      if (*byte == '\'') fputs("'\\''", stderr);
      else fputc(*byte, stderr);
    }
    fputc('\'', stderr);
  }
  fputc('\n', stderr);
}

static int execute(char **arguments, int count, int trace) {
  char *path = resolve_command(arguments[0]);
  if (path == NULL) {
    fprintf(stderr, "xargs: %s: command not found\n", arguments[0]);
    return 127;
  }
  if (trace) trace_arguments(arguments);
  const int pid = dolly_spawn(path, count, arguments, 0, 1, 2);
  free(path);
  if (pid < 0) {
    fprintf(stderr, "xargs: could not run %s: %s\n", arguments[0], strerror(-pid));
    return 126;
  }
  int status = 126;
  const int result = dolly_wait(pid, &status);
  if (result != 0) {
    fprintf(stderr, "xargs: could not wait for %s: %s\n",
            arguments[0], strerror(-result));
    return 126;
  }
  return status;
}

static int parse_count(const char *text, size_t *value) {
  char *end = NULL;
  errno = 0;
  unsigned long long parsed = strtoull(text, &end, 10);
  if (errno != 0 || text[0] == '\0' || *end != '\0' || parsed == 0 ||
      parsed > INT_MAX) return -1;
  *value = (size_t)parsed;
  return 0;
}

int main(int argc, char **argv) {
  int nul = 0;
  int no_run_if_empty = 0;
  int trace = 0;
  size_t maximum = SIZE_MAX;
  const char *replace = NULL;
  int index = 1;
  for (; index < argc; ++index) {
    const char *option = argv[index];
    if (strcmp(option, "--") == 0) {
      index++;
      break;
    }
    if (option[0] != '-' || option[1] == '\0') break;
    if (strcmp(option, "-0") == 0) nul = 1;
    else if (strcmp(option, "-r") == 0) no_run_if_empty = 1;
    else if (strcmp(option, "-t") == 0) trace = 1;
    else if (option[1] == 'n') {
      const char *value = option[2] == '\0' && ++index < argc ? argv[index]
                                                               : option + 2;
      if (parse_count(value, &maximum) != 0) {
        fprintf(stderr, "xargs: invalid -n value: %s\n", value);
        return 2;
      }
    } else if (option[1] == 'I') {
      replace = option[2] == '\0' && ++index < argc ? argv[index] : option + 2;
      if (replace[0] == '\0') {
        fputs("xargs: -I requires a nonempty replacement string\n", stderr);
        return 2;
      }
      maximum = 1;
    } else if (option[1] == 'P') {
      size_t parallel = 0;
      const char *value = option[2] == '\0' && ++index < argc ? argv[index]
                                                               : option + 2;
      if (parse_count(value, &parallel) != 0 || parallel != 1) {
        fputs("xargs: Dolly executes serially; only -P 1 is supported\n", stderr);
        return 2;
      }
    } else {
      usage();
      return 2;
    }
  }
  if (replace != NULL) {
    maximum = 1;
    no_run_if_empty = 1;
  }

  char *default_command[] = {"echo"};
  char **base = index < argc ? argv + index : default_command;
  const size_t base_count = index < argc ? (size_t)(argc - index) : 1;
  string_list items = {0};
  if (read_items(&items, nul, replace != NULL) != 0) {
    dispose_list(&items);
    return 1;
  }
  if (items.count == 0 && no_run_if_empty) {
    dispose_list(&items);
    return 0;
  }

  const size_t runs = items.count == 0 ? 1 : 1 + (items.count - 1) / maximum;
  int final_status = 0;
  for (size_t run = 0; run < runs; ++run) {
    const size_t first = run * maximum;
    size_t count = items.count == 0 ? 0 : items.count - first;
    if (count > maximum) count = maximum;
    const size_t argument_count = replace == NULL ? base_count + count : base_count;
    char **arguments = calloc(argument_count + 1, sizeof(*arguments));
    if (arguments == NULL) {
      fputs("xargs: out of memory\n", stderr);
      final_status = 1;
      break;
    }
    int allocation_failed = 0;
    for (size_t argument = 0; argument < base_count; ++argument) {
      arguments[argument] = replace == NULL
          ? base[argument]
          : replace_all(base[argument], replace, items.items[first]);
      if (arguments[argument] == NULL) allocation_failed = 1;
    }
    if (replace == NULL) {
      for (size_t item = 0; item < count; ++item) {
        arguments[base_count + item] = items.items[first + item];
      }
    }
    int status = allocation_failed ? 126
                                   : execute(arguments, (int)argument_count, trace);
    if (replace != NULL) {
      for (size_t argument = 0; argument < base_count; ++argument) {
        free(arguments[argument]);
      }
    }
    free(arguments);
    if (allocation_failed) fputs("xargs: out of memory\n", stderr);
    if (status == 255) final_status = 124;
    else if (status == 126 || status == 127 || status == 130) final_status = status;
    else if (status != 0 && final_status == 0) final_status = 123;
    if (final_status == 124 || final_status == 126 ||
        final_status == 127 || final_status == 130) break;
  }
  dispose_list(&items);
  return final_status;
}
