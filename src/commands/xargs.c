#define _XOPEN_SOURCE 700

#include <ctype.h>
#include <limits.h>
#include <stdint.h>

#include "run-program.h"

// A spawn packet carries the path, arguments and environment; leave half of
// it for the environment.
enum {
  DEFAULT_COMMAND_BYTES = 128 * 1024,
  MAXIMUM_COMMAND_BYTES = DOLLY_PROCESS_PACKET_LIMIT / 2,
};

typedef struct {
  char *bytes;
  size_t length;
  size_t capacity;
} buffer;

typedef struct {
  char **items;
  size_t count;
  size_t capacity;
} string_list;

static void usage(void) {
  fputs("usage: xargs [-0rt] [-n number] [-s size] [-I replace] [-P 1] "
        "[command [argument ...]]\n", stderr);
}

static int push_byte(buffer *item, int byte) {
  if (item->length == item->capacity) {
    const size_t capacity = item->capacity == 0 ? 128 : item->capacity * 2;
    char *bytes = realloc(item->bytes, capacity);
    if (bytes == NULL) return -1;
    item->bytes = bytes;
    item->capacity = capacity;
  }
  item->bytes[item->length++] = (char)byte;
  return 0;
}

static int push_item(string_list *list, char *item) {
  if (list->count + 1 >= list->capacity) {
    const size_t capacity = list->capacity == 0 ? 64 : list->capacity * 2;
    char **items = realloc(list->items, capacity * sizeof(*items));
    if (items == NULL) return -1;
    list->items = items;
    list->capacity = capacity;
  }
  list->items[list->count++] = item;
  list->items[list->count] = NULL;
  return 0;
}

// Reads the next input item: 1 when one was read, 0 at end of input, -1 on error.
static int read_item(buffer *item, int nul, int line_mode) {
  int quote = 0, started = 0, byte;
  item->length = 0;
  while ((byte = getchar()) != EOF) {
    const int separator = nul ? byte == '\0'
        : quote == 0 && (byte == '\n' || (!line_mode && isspace(byte)));
    if (separator) {
      if (nul || started) return push_byte(item, '\0') == 0 ? 1 : -1;
      continue;
    }
    started = 1;
    if (!nul && quote == 0 && byte == '\\') {
      if ((byte = getchar()) == EOF) {
        fputs("xargs: backslash at end of input\n", stderr);
        return -1;
      }
    } else if (!nul && (byte == '\'' || byte == '"') && (quote == 0 || quote == byte)) {
      quote = quote == 0 ? byte : 0;
      continue;
    }
    if (push_byte(item, byte) != 0) return -1;
  }
  if (ferror(stdin)) {
    fprintf(stderr, "xargs: could not read stdin: %s\n", strerror(errno));
    return -1;
  }
  if (quote != 0) {
    fputs("xargs: unterminated quote\n", stderr);
    return -1;
  }
  if (!started) return 0;
  return push_byte(item, '\0') == 0 ? 1 : -1;
}

static char *replace_all(const char *input, const char *needle,
                         const char *replacement) {
  const size_t needle_length = strlen(needle);
  const size_t replacement_length = strlen(replacement);
  size_t matches = 0;
  for (const char *cursor = input; (cursor = strstr(cursor, needle)) != NULL;
       cursor += needle_length) {
    matches++;
  }
  char *result = malloc(strlen(input) + matches * replacement_length + 1);
  if (result == NULL) return NULL;
  char *destination = result;
  const char *match;
  while ((match = strstr(input, needle)) != NULL) {
    memcpy(destination, input, (size_t)(match - input));
    destination += match - input;
    memcpy(destination, replacement, replacement_length);
    destination += replacement_length;
    input = match + needle_length;
  }
  strcpy(destination, input);
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

// Runs one command line and folds its status into xargs' own. Returns
// nonzero when POSIX requires xargs to stop.
static int execute(string_list *command, size_t owned_from, int trace, int *status) {
  if (trace) trace_arguments(command->items);
  const int result = run_program("xargs", (int)command->count, command->items,
                                 getenv("PATH"), -1);
  for (size_t index = owned_from; index < command->count; ++index) {
    free(command->items[index]);
  }
  command->count = owned_from;
  command->items[owned_from] = NULL;
  if (result == 255) *status = 124;
  else if (result == 126 || result == 127 || result == 130) *status = result;
  else if (result != 0) *status = 123;
  return result == 255 || result == 126 || result == 127 || result == 130;
}

static int parse_count(const char *text, size_t *value) {
  char *end = NULL;
  errno = 0;
  const unsigned long long parsed = text == NULL ? 0 : strtoull(text, &end, 10);
  if (text == NULL || errno != 0 || text[0] == '\0' || *end != '\0' ||
      parsed == 0 || parsed > INT_MAX) return -1;
  *value = (size_t)parsed;
  return 0;
}

int main(int argc, char **argv) {
  int nul = 0, no_run_if_empty = 0, trace = 0;
  size_t maximum_items = SIZE_MAX, maximum_bytes = DEFAULT_COMMAND_BYTES;
  const char *replace = NULL;
  int index = 1;
  for (; index < argc && argv[index][0] == '-' && argv[index][1] != '\0'; ++index) {
    const char *option = argv[index];
    const char *value = option[2] != '\0' ? option + 2 : argv[index + 1];
    const int consumes = strchr("nsIP", option[1]) != NULL && option[2] == '\0';
    size_t parsed = 0;
    if (strcmp(option, "--") == 0) {
      index++;
      break;
    }
    if (strcmp(option, "-0") == 0) nul = 1;
    else if (strcmp(option, "-r") == 0) no_run_if_empty = 1;
    else if (strcmp(option, "-t") == 0) trace = 1;
    else if (option[1] == 'n' && parse_count(value, &maximum_items) == 0) {}
    else if (option[1] == 's' && parse_count(value, &maximum_bytes) == 0) {}
    else if (option[1] == 'I' && value != NULL && value[0] != '\0') replace = value;
    else if (option[1] == 'P' && parse_count(value, &parsed) == 0 && parsed == 1) {}
    else {
      if (option[1] == 'P') fputs("xargs: Dolly executes serially; only -P 1 is supported\n", stderr);
      usage();
      return 1;
    }
    index += consumes;
  }
  if (maximum_bytes > MAXIMUM_COMMAND_BYTES) maximum_bytes = MAXIMUM_COMMAND_BYTES;

  char *echo[] = {"echo", NULL};
  char **base = index < argc ? argv + index : echo;
  string_list command = {0};
  size_t base_bytes = 0;
  for (char **argument = base; *argument != NULL; ++argument) {
    base_bytes += strlen(*argument) + 1;
    if (push_item(&command, *argument) != 0) return 1;
  }
  const size_t base_count = command.count;
  size_t bytes = base_bytes;
  buffer item = {0};
  int status = 0, ran = 0, result;
  while ((result = read_item(&item, nul, replace != NULL)) > 0) {
    if (replace != NULL) {
      for (size_t argument = 0; argument < base_count; ++argument) {
        command.items[argument] = replace_all(base[argument], replace, item.bytes);
        if (command.items[argument] == NULL) return 1;
      }
      if (execute(&command, 0, trace, &status)) break;
      command.count = base_count;
      continue;
    }
    if (base_bytes + item.length > maximum_bytes) {
      fprintf(stderr, "xargs: argument does not fit the %zu-byte command line\n",
              maximum_bytes);
      status = 1;
      break;
    }
    if (command.count - base_count == maximum_items || bytes + item.length > maximum_bytes) {
      ran = 1;
      if (execute(&command, base_count, trace, &status)) break;
      bytes = base_bytes;
    }
    char *copy = strdup(item.bytes);
    if (copy == NULL || push_item(&command, copy) != 0) return 1;
    bytes += item.length;
  }
  if (result < 0) status = 1;
  if (result == 0 && replace == NULL &&
      (command.count > base_count || (!ran && !no_run_if_empty))) {
    execute(&command, base_count, trace, &status);
  }
  return status;
}
