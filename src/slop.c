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

  if (length == 1 && (name[0] == '@' || name[0] == '*')) {
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
    case '!': return TOKEN_NOT;
    case '<': return TOKEN_INPUT;
    case '>': return TOKEN_OUTPUT;
    default: *length = 0; return TOKEN_WORD;
  }
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
  const char *pattern = slash == NULL ? token->text : slash + 1;
  char *directory = directory_length == 0 ? strdup(".") : strndup(token->text, directory_length);
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
    size_t length = directory_length == 0 ? strlen(entry->d_name)
                                          : directory_length + 1 + strlen(entry->d_name);
    char *path = malloc(length + 1);
    if (path == NULL) goto glob_error;
    if (directory_length == 0) strcpy(path, entry->d_name);
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
    int status = argc == 2 ? (int)strtol(argv[1], NULL, 10) : shell->last_status;
    shell->active = 0;
    shell->exit_status = status & 255;
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

static int run_simple(Shell *shell, Token *tokens, size_t start, size_t end,
                      int pipeline_input, int pipeline_output) {
  Arguments arguments = {0};
  int input = pipeline_input, output = pipeline_output, error = STDERR_FILENO;
  int owned_input = -1, owned_output = -1, owned_error = -1, error_to_output = 0;
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
      if (shell->errexit && status != 0 && kind != TOKEN_OR) return status;
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
  shell->interactive = 1;
  shell->active = 1;
  puts("Dolly slop 0.1 — type 'help' for commands");
  print_prompt();
  char *line = malloc(SLOP_MAX_LINE + 1);
  if (line == NULL) return 1;
  while (shell->active) {
    if (fgets(line, SLOP_MAX_LINE + 1, stdin) == NULL) {
      if (feof(stdin)) { shell->active = 0; puts("logout"); }
      else { fprintf(stderr, "slop: stdin: %s\n", strerror(errno)); shell->last_status = 1; }
      break;
    }
    size_t length = strlen(line);
    if (length == SLOP_MAX_LINE && line[length - 1] != '\n') {
      fputs("slop: command is too long\n", stderr); shell->last_status = 2;
    } else shell->last_status = execute_text(shell, line);
    if (shell->last_status != 0 && shell->last_status != 127 && shell->active)
      fprintf(stderr, "slop: status %d\n", shell->last_status);
    dolly_terminal_publish_result(shell->last_status);
    if (shell->active) print_prompt();
  }
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
