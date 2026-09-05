#define _POSIX_C_SOURCE 200809L
#define _XOPEN_SOURCE 700

#include <ctype.h>
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
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
#define SLOP_MAX_HEREDOCS 32
#define SLOP_DEFERRED_STATUS "\x1f" "DOLLY_STATUS" "\x1f"
#define SLOP_DEFERRED_DOLLAR ((char)0x1d)
#define SLOP_DYNAMIC_DESCRIPTOR (-2)

typedef enum {
  TOKEN_WORD,
  TOKEN_SEMI,
  TOKEN_CASE_END,
  TOKEN_AND,
  TOKEN_OR,
  TOKEN_PIPE,
  TOKEN_NOT,
  TOKEN_INPUT,
  TOKEN_OUTPUT,
  TOKEN_APPEND,
  TOKEN_HEREDOC,
  TOKEN_DUP_INPUT,
  TOKEN_DUP_OUTPUT,
  TOKEN_LPAREN,
  TOKEN_RPAREN,
  TOKEN_END,
} TokenKind;

typedef struct {
  TokenKind kind;
  char *text;
  int quoted;
  int split;
  int positional_fields;
  int descriptor;
  int target_descriptor;
} Token;
typedef struct { Token *items; size_t count; size_t capacity; } TokenList;
typedef struct { char *name; TokenList body; } Function;
typedef struct { Function *items; size_t count; size_t capacity; } Functions;
typedef struct { char *data; size_t length; size_t capacity; } Buffer;
typedef struct { char **items; size_t count; size_t capacity; } Arguments;
typedef struct { char **items; size_t count; size_t capacity; } History;
typedef struct {
  char *text;
  int directory;
} Completion;
typedef struct { Completion *items; size_t count; size_t capacity; } Completions;
typedef struct LocalFrame LocalFrame;

typedef struct {
  int interactive;
  int active;
  int last_status;
  int exit_status;
  int errexit;
  int xtrace;
  int noexec;
  int pipefail;
  int loop_depth;
  int loop_control;
  unsigned loop_levels;
  int function_depth;
  int returning;
  int return_status;
  Functions *functions;
  int argc;
  char **argv;
  int argv_array_owned;
  int argv_strings_owned;
  unsigned getopts_index;
  size_t getopts_offset;
  LocalFrame *local_frame;
} Shell;

enum {
  LOOP_CONTROL_NONE,
  LOOP_CONTROL_BREAK,
  LOOP_CONTROL_CONTINUE,
};

typedef struct { char *name; char *old_value; int existed; } EnvironmentChange;
struct LocalFrame {
  EnvironmentChange *changes;
  size_t count;
  size_t capacity;
};
typedef struct {
  char **environment;
  size_t environment_count;
  size_t environment_capacity;
  char *cwd;
} ShellStateSnapshot;

extern char **environ;

static int execute_text(Shell *shell, const char *text);
static int execute_tokens(Shell *shell, TokenList *list);
static char *read_script(const char *path);
static int wildcard_match(const char *pattern, const char *text);
static void print_prompt(void);
static void restore_environment_changes(EnvironmentChange *changes,
                                        size_t count);

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
  tokens->items[tokens->count++] = (Token){
      .kind = kind,
      .text = text,
      .quoted = quoted,
      .descriptor = -1,
      .target_descriptor = -1,
  };
  return 1;
}

static int tokens_clone_range(const Token *tokens, size_t start, size_t end,
                              TokenList *copy) {
  for (size_t index = start; index < end; index++) {
    char *text = tokens[index].text == NULL ? NULL : strdup(tokens[index].text);
    if ((tokens[index].text != NULL && text == NULL) ||
        !token_push(copy, tokens[index].kind, text, tokens[index].quoted)) {
      tokens_dispose(copy);
      return 0;
    }
    copy->items[copy->count - 1].split = tokens[index].split;
    copy->items[copy->count - 1].positional_fields =
        tokens[index].positional_fields;
    copy->items[copy->count - 1].descriptor = tokens[index].descriptor;
    copy->items[copy->count - 1].target_descriptor =
        tokens[index].target_descriptor;
  }
  if (!token_push(copy, TOKEN_END, NULL, 0)) {
    tokens_dispose(copy);
    return 0;
  }
  return 1;
}

static Function *function_lookup(Functions *functions, const char *name) {
  if (functions == NULL) return NULL;
  for (size_t index = 0; index < functions->count; index++) {
    if (strcmp(functions->items[index].name, name) == 0)
      return &functions->items[index];
  }
  return NULL;
}

static void functions_dispose(Functions *functions) {
  for (size_t index = 0; index < functions->count; index++) {
    free(functions->items[index].name);
    tokens_dispose(&functions->items[index].body);
  }
  free(functions->items);
  memset(functions, 0, sizeof(*functions));
}

static int function_define(Functions *functions, const char *name,
                           const Token *tokens, size_t start, size_t end) {
  TokenList body = {0};
  if (!tokens_clone_range(tokens, start, end, &body)) return 0;
  Function *existing = function_lookup(functions, name);
  if (existing != NULL) {
    tokens_dispose(&existing->body);
    existing->body = body;
    return 1;
  }
  char *name_copy = strdup(name);
  if (name_copy == NULL ||
      !grow((void **)&functions->items, &functions->capacity,
            functions->count + 1, sizeof(*functions->items))) {
    free(name_copy);
    tokens_dispose(&body);
    return 0;
  }
  functions->items[functions->count++] = (Function){name_copy, body};
  return 1;
}

static int functions_clone(const Functions *source, Functions *copy) {
  if (source == NULL) return 1;
  for (size_t index = 0; index < source->count; index++) {
    const Function *function = &source->items[index];
    if (!function_define(copy, function->name, function->body.items, 0,
                         function->body.count - 1)) {
      functions_dispose(copy);
      return 0;
    }
  }
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

static void shell_argv_dispose(Shell *shell) {
  if (shell->argv_strings_owned) {
    for (int index = 0; index < shell->argc; index++) free(shell->argv[index]);
  }
  if (shell->argv_array_owned) free(shell->argv);
  shell->argc = 0;
  shell->argv = NULL;
  shell->argv_array_owned = 0;
  shell->argv_strings_owned = 0;
}

static int shell_argv_clone(Shell *destination, const Shell *source) {
  char **arguments = calloc((size_t)source->argc + 1, sizeof(*arguments));
  if (arguments == NULL) return 0;
  for (int index = 0; index < source->argc; index++) {
    arguments[index] = strdup(source->argv[index]);
    if (arguments[index] == NULL) {
      for (int previous = 0; previous < index; previous++) free(arguments[previous]);
      free(arguments);
      return 0;
    }
  }
  destination->argc = source->argc;
  destination->argv = arguments;
  destination->argv_array_owned = 1;
  destination->argv_strings_owned = 1;
  return 1;
}

static int shell_set_positional(Shell *shell, int count, char **values) {
  char **arguments = calloc((size_t)count + 2, sizeof(*arguments));
  if (arguments == NULL) return 0;
  const char *zero = shell->argc > 0 ? shell->argv[0] : "slop";
  arguments[0] = strdup(zero);
  for (int index = 0; arguments[0] != NULL && index < count; index++) {
    arguments[index + 1] = strdup(values[index]);
    if (arguments[index + 1] == NULL) {
      for (int previous = 0; previous <= index; previous++) free(arguments[previous]);
      free(arguments);
      return 0;
    }
  }
  if (arguments[0] == NULL) {
    free(arguments);
    return 0;
  }
  shell_argv_dispose(shell);
  shell->argc = count + 1;
  shell->argv = arguments;
  shell->argv_array_owned = 1;
  shell->argv_strings_owned = 1;
  return 1;
}

static int shell_shift(Shell *shell, unsigned count) {
  const unsigned positional = shell->argc > 0 ? (unsigned)shell->argc - 1 : 0;
  if (count > positional) return 0;
  char **arguments = calloc((size_t)(positional - count) + 2,
                            sizeof(*arguments));
  if (arguments == NULL) return -1;
  arguments[0] = shell->argv[0];
  for (unsigned index = count; index < positional; index++) {
    arguments[index - count + 1] = shell->argv[index + 1];
  }
  if (shell->argv_strings_owned) {
    for (unsigned index = 1; index <= count; index++) free(shell->argv[index]);
  }
  if (shell->argv_array_owned) free(shell->argv);
  shell->argc = (int)(positional - count + 1);
  shell->argv = arguments;
  shell->argv_array_owned = 1;
  return 1;
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
  if (length == 1 && name[0] == '-') {
    size_t index = 0;
    if (shell->errexit) temporary[index++] = 'e';
    if (shell->interactive) temporary[index++] = 'i';
    if (shell->noexec) temporary[index++] = 'n';
    if (shell->xtrace) temporary[index++] = 'x';
    temporary[index] = '\0';
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

// Return the closing brace for a ${...} expression. Nested parameter
// expansions and quoted/escaped braces are kept inside the same deferred
// frame and expanded only if their containing word is selected.
static const char *parameter_closing_brace(const char *source) {
  int depth = 1;
  char quote = '\0';
  while (*source != '\0') {
    if (quote != '\0') {
      if (*source == quote) quote = '\0';
      else if (*source == '\\' && quote == '"' && source[1] != '\0') source++;
    } else if (*source == '\'' || *source == '"') {
      quote = *source;
    } else if (*source == '\\' && source[1] != '\0') {
      source++;
    } else if (source[0] == '$' && source[1] == '{') {
      depth++;
      source++;
    } else if (*source == '}' && --depth == 0) {
      return source;
    }
    source++;
  }
  return NULL;
}

static int expand_dollar_now(Shell *shell, const char **cursor, Buffer *word);

static int expand_parameter_word(Shell *shell, const char *source,
                                 size_t length, Buffer *output) {
  const char *end = source + length;
  char quote = '\0';
  while (source < end) {
    if (*source == '\\' && quote != '\'' && source + 1 < end) {
      source++;
      if (!buffer_character(output, *source++)) return 0;
      continue;
    }
    if (*source == '\'' || *source == '"') {
      if (quote == '\0') {
        quote = *source++;
        continue;
      }
      if (quote == *source) {
        quote = '\0';
        source++;
        continue;
      }
    }
    if (*source == '$' && quote != '\'') {
      const char *cursor = source;
      if (expand_dollar_now(shell, &cursor, output) < 0 || cursor > end) return 0;
      source = cursor;
      continue;
    }
    if (!buffer_character(output, *source++)) return 0;
  }
  return quote == '\0';
}

static void shell_state_snapshot_dispose(ShellStateSnapshot *snapshot) {
  for (size_t index = 0; index < snapshot->environment_count; index++)
    free(snapshot->environment[index]);
  free(snapshot->environment);
  free(snapshot->cwd);
  memset(snapshot, 0, sizeof(*snapshot));
}

static int shell_state_capture(ShellStateSnapshot *snapshot) {
  snapshot->cwd = getcwd(NULL, 0);
  if (snapshot->cwd == NULL) return 0;
  for (char **entry = environ; entry != NULL && *entry != NULL; entry++) {
    char *copy = strdup(*entry);
    if (copy == NULL ||
        !grow((void **)&snapshot->environment,
              &snapshot->environment_capacity,
              snapshot->environment_count + 1, sizeof(*snapshot->environment))) {
      free(copy);
      shell_state_snapshot_dispose(snapshot);
      return 0;
    }
    snapshot->environment[snapshot->environment_count++] = copy;
  }
  return 1;
}

static int shell_state_restore(const ShellStateSnapshot *snapshot) {
  Arguments current_names = {0};
  for (char **entry = environ; entry != NULL && *entry != NULL; entry++) {
    const char *equals = strchr(*entry, '=');
    if (equals == NULL) continue;
    char *name = strndup(*entry, (size_t)(equals - *entry));
    if (name == NULL || !argument_push_owned(&current_names, name)) {
      arguments_dispose(&current_names);
      return 0;
    }
  }
  int ok = 1;
  for (size_t index = 0; index < current_names.count; index++) {
    if (unsetenv(current_names.items[index]) != 0) ok = 0;
  }
  arguments_dispose(&current_names);
  for (size_t index = 0; index < snapshot->environment_count; index++) {
    const char *entry = snapshot->environment[index];
    const char *equals = strchr(entry, '=');
    if (equals == NULL) continue;
    char *name = strndup(entry, (size_t)(equals - entry));
    if (name == NULL) {
      ok = 0;
      continue;
    }
    if (setenv(name, equals + 1, 1) != 0) ok = 0;
    free(name);
  }
  if (chdir(snapshot->cwd) != 0) ok = 0;
  return ok;
}

static int capture_command(Shell *shell, const char *command, Buffer *output) {
  const size_t starting_length = output->length;
  ShellStateSnapshot state = {0};
  if (!shell_state_capture(&state)) return 0;
  char path[] = "/tmp/slop-substitution-XXXXXX";
  int descriptor = mkstemp(path);
  if (descriptor < 0) {
    shell_state_snapshot_dispose(&state);
    return 0;
  }
  unlink(path);
  int saved = dup(STDOUT_FILENO);
  if (saved < 0 || dup2(descriptor, STDOUT_FILENO) < 0) {
    if (saved >= 0) close(saved);
    close(descriptor);
    shell_state_snapshot_dispose(&state);
    return 0;
  }
  clearerr(stdout);
  // Command substitution has its own control state. In particular, `exit`
  // must not terminate the outer shell and the outer `-e` must not turn a
  // useful `$(false; echo value)` sequence into an expansion failure.
  Shell nested = *shell;
  nested.argc = 0;
  nested.argv = NULL;
  nested.argv_array_owned = 0;
  nested.argv_strings_owned = 0;
  if (!shell_argv_clone(&nested, shell)) {
    dup2(saved, STDOUT_FILENO);
    close(saved);
    close(descriptor);
    clearerr(stdout);
    shell_state_snapshot_dispose(&state);
    return 0;
  }
  nested.active = 1;
  nested.errexit = 0;
  nested.exit_status = 0;
  nested.loop_depth = 0;
  nested.loop_control = LOOP_CONTROL_NONE;
  nested.loop_levels = 0;
  nested.function_depth = 0;
  nested.returning = 0;
  nested.return_status = 0;
  Functions nested_functions = {0};
  if (!functions_clone(shell->functions, &nested_functions)) {
    shell_argv_dispose(&nested);
    dup2(saved, STDOUT_FILENO);
    close(saved);
    close(descriptor);
    clearerr(stdout);
    shell_state_snapshot_dispose(&state);
    return 0;
  }
  nested.functions = &nested_functions;
  execute_text(&nested, command);
  functions_dispose(&nested_functions);
  shell_argv_dispose(&nested);
  fflush(stdout);
  fsync(STDOUT_FILENO);
  dup2(saved, STDOUT_FILENO);
  close(saved);
  clearerr(stdout);
  const int restored = shell_state_restore(&state);
  shell_state_snapshot_dispose(&state);
  if (!restored) {
    close(descriptor);
    fputs("slop: could not restore command-substitution state\n", stderr);
    return 0;
  }
  if (lseek(descriptor, 0, SEEK_SET) < 0) {
    close(descriptor);
    return 0;
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
  while (output->length > starting_length &&
         output->data[output->length - 1] == '\n') {
    output->data[--output->length] = '\0';
  }
  return 1;
}

typedef struct {
  Shell *shell;
  const char *cursor;
  int error;
  int evaluate;
} Arithmetic;

static void arithmetic_space(Arithmetic *parser) {
  while (isspace((unsigned char)*parser->cursor)) parser->cursor++;
}

static int arithmetic_take(Arithmetic *parser, const char *operator) {
  arithmetic_space(parser);
  const size_t length = strlen(operator);
  if (strncmp(parser->cursor, operator, length) != 0) return 0;
  parser->cursor += length;
  return 1;
}

static long arithmetic_or(Arithmetic *parser);

static long arithmetic_primary(Arithmetic *parser) {
  arithmetic_space(parser);
  if (*parser->cursor == '(') {
    parser->cursor++;
    const long value = arithmetic_or(parser);
    if (!arithmetic_take(parser, ")")) parser->error = 1;
    return value;
  }
  if (is_name_start(*parser->cursor)) {
    const char *start = parser->cursor++;
    while (is_name_byte(*parser->cursor)) parser->cursor++;
    char *name = strndup(start, (size_t)(parser->cursor - start));
    if (name == NULL) {
      parser->error = 1;
      return 0;
    }
    const char *text = getenv(name);
    free(name);
    if (text == NULL || text[0] == '\0') return 0;
    char *end = NULL;
    errno = 0;
    const long value = strtol(text, &end, 0);
    if (parser->evaluate &&
        (errno == ERANGE || end == text || *end != '\0')) parser->error = 1;
    return value;
  }
  char *end = NULL;
  errno = 0;
  const long value = strtol(parser->cursor, &end, 0);
  if (errno == ERANGE || end == parser->cursor) {
    parser->error = 1;
    return 0;
  }
  parser->cursor = end;
  return value;
}

static long arithmetic_unary(Arithmetic *parser) {
  arithmetic_space(parser);
  if (arithmetic_take(parser, "+")) return arithmetic_unary(parser);
  if (arithmetic_take(parser, "-"))
    return (long)(0ul - (unsigned long)arithmetic_unary(parser));
  if (arithmetic_take(parser, "!")) return !arithmetic_unary(parser);
  if (arithmetic_take(parser, "~")) return ~arithmetic_unary(parser);
  return arithmetic_primary(parser);
}

static long arithmetic_multiply(Arithmetic *parser) {
  long value = arithmetic_unary(parser);
  for (;;) {
    arithmetic_space(parser);
    if (parser->cursor[0] == '*' && parser->cursor[1] != '*') {
      parser->cursor++;
      value = (long)((unsigned long)value *
                     (unsigned long)arithmetic_unary(parser));
    } else if (parser->cursor[0] == '/' || parser->cursor[0] == '%') {
      const char operation = *parser->cursor++;
      const long right = arithmetic_unary(parser);
      if (parser->evaluate &&
          (right == 0 || (value == LONG_MIN && right == -1))) {
        parser->error = 1;
        value = 0;
      } else if (parser->evaluate) {
        value = operation == '/' ? value / right : value % right;
      }
    } else {
      break;
    }
  }
  return value;
}

static long arithmetic_add(Arithmetic *parser) {
  long value = arithmetic_multiply(parser);
  for (;;) {
    arithmetic_space(parser);
    if (*parser->cursor != '+' && *parser->cursor != '-') break;
    const char operation = *parser->cursor++;
    const long right = arithmetic_multiply(parser);
    value = operation == '+'
                ? (long)((unsigned long)value + (unsigned long)right)
                : (long)((unsigned long)value - (unsigned long)right);
  }
  return value;
}

static long arithmetic_shift(Arithmetic *parser) {
  long value = arithmetic_add(parser);
  for (;;) {
    arithmetic_space(parser);
    int right_shift = 0;
    if (strncmp(parser->cursor, "<<", 2) == 0) right_shift = 0;
    else if (strncmp(parser->cursor, ">>", 2) == 0) right_shift = 1;
    else break;
    parser->cursor += 2;
    const long count = arithmetic_add(parser);
    if (parser->evaluate &&
        (count < 0 || count >= (long)(sizeof(long) * 8))) {
      parser->error = 1;
      value = 0;
    } else if (!parser->evaluate) {
      continue;
    } else if (right_shift) {
      value >>= count;
    } else {
      value = (long)((unsigned long)value << count);
    }
  }
  return value;
}

static long arithmetic_compare(Arithmetic *parser) {
  long value = arithmetic_shift(parser);
  for (;;) {
    arithmetic_space(parser);
    const char *operation = NULL;
    if (strncmp(parser->cursor, "<=", 2) == 0 ||
        strncmp(parser->cursor, ">=", 2) == 0) {
      operation = parser->cursor;
      parser->cursor += 2;
    } else if ((*parser->cursor == '<' || *parser->cursor == '>') &&
               parser->cursor[1] != *parser->cursor) {
      operation = parser->cursor++;
    } else {
      break;
    }
    const long right = arithmetic_shift(parser);
    if (operation[0] == '<')
      value = operation[1] == '=' ? value <= right : value < right;
    else
      value = operation[1] == '=' ? value >= right : value > right;
  }
  return value;
}

static long arithmetic_equal(Arithmetic *parser) {
  long value = arithmetic_compare(parser);
  for (;;) {
    arithmetic_space(parser);
    int unequal;
    if (strncmp(parser->cursor, "==", 2) == 0) unequal = 0;
    else if (strncmp(parser->cursor, "!=", 2) == 0) unequal = 1;
    else break;
    parser->cursor += 2;
    const long right = arithmetic_compare(parser);
    value = unequal ? value != right : value == right;
  }
  return value;
}

static long arithmetic_bit_and(Arithmetic *parser) {
  long value = arithmetic_equal(parser);
  for (;;) {
    arithmetic_space(parser);
    if (*parser->cursor != '&' || parser->cursor[1] == '&') break;
    parser->cursor++;
    value &= arithmetic_equal(parser);
  }
  return value;
}

static long arithmetic_bit_xor(Arithmetic *parser) {
  long value = arithmetic_bit_and(parser);
  while (arithmetic_take(parser, "^")) value ^= arithmetic_bit_and(parser);
  return value;
}

static long arithmetic_bit_or(Arithmetic *parser) {
  long value = arithmetic_bit_xor(parser);
  for (;;) {
    arithmetic_space(parser);
    if (*parser->cursor != '|' || parser->cursor[1] == '|') break;
    parser->cursor++;
    value |= arithmetic_bit_xor(parser);
  }
  return value;
}

static long arithmetic_and(Arithmetic *parser) {
  long value = arithmetic_bit_or(parser);
  while (arithmetic_take(parser, "&&")) {
    const int evaluate = parser->evaluate;
    if (evaluate && value == 0) parser->evaluate = 0;
    const long right = arithmetic_bit_or(parser);
    parser->evaluate = evaluate;
    if (evaluate) value = value && right;
  }
  return value;
}

static long arithmetic_or(Arithmetic *parser) {
  long value = arithmetic_and(parser);
  while (arithmetic_take(parser, "||")) {
    const int evaluate = parser->evaluate;
    if (evaluate && value != 0) parser->evaluate = 0;
    const long right = arithmetic_and(parser);
    parser->evaluate = evaluate;
    if (evaluate) value = value || right;
  }
  return value;
}

static int expand_arithmetic(Shell *shell, const char *source, size_t length,
                             Buffer *word) {
  Buffer expanded = {0};
  if (!expand_parameter_word(shell, source, length, &expanded)) {
    free(expanded.data);
    return 0;
  }
  char *expression = buffer_release(&expanded);
  if (expression == NULL) return 0;
  Arithmetic parser = {.shell = shell, .cursor = expression, .evaluate = 1};
  const long value = arithmetic_or(&parser);
  arithmetic_space(&parser);
  const int valid = !parser.error && *parser.cursor == '\0';
  if (!valid) {
    fprintf(stderr, "slop: invalid arithmetic expression: %s\n", expression);
    free(expression);
    return 0;
  }
  free(expression);
  char result[64];
  const int written = snprintf(result, sizeof(result), "%ld", value);
  return written >= 0 && (size_t)written < sizeof(result) &&
         buffer_append(word, result, (size_t)written);
}

static int append_pattern_removal(Buffer *word, const char *value,
                                  const char *pattern, char operation,
                                  int longest) {
  const size_t length = strlen(value);
  for (size_t step = 0; step <= length; step++) {
    const size_t removed = longest ? length - step : step;
    const char *candidate;
    char *owned = NULL;
    if (operation == '#') {
      owned = strndup(value, removed);
      if (owned == NULL) return 0;
      candidate = owned;
    } else {
      candidate = value + length - removed;
    }
    const int matched = wildcard_match(pattern, candidate);
    free(owned);
    if (!matched) continue;
    if (operation == '#')
      return buffer_append(word, value + removed, length - removed);
    return buffer_append(word, value, length - removed);
  }
  return buffer_append(word, value, length);
}

static int expand_dollar_now(Shell *shell, const char **cursor, Buffer *word) {
  const char *source = *cursor + 1;
  if (source[0] == '(' && source[1] == '(') {
    const char *start = source + 2;
    const char *closing = start;
    int depth = 0;
    while (*closing != '\0') {
      if (*closing == '(') depth++;
      else if (*closing == ')') {
        if (depth != 0) depth--;
        else if (closing[1] == ')') break;
      }
      closing++;
    }
    if (*closing == '\0') {
      fputs("slop: unterminated arithmetic expansion\n", stderr);
      return -1;
    }
    if (!expand_arithmetic(shell, start, (size_t)(closing - start), word))
      return -1;
    *cursor = closing + 2;
    return 1;
  }
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
    const char *body = source + 1;
    const char *closing = parameter_closing_brace(body);
    if (closing == NULL) {
      fputs("slop: unterminated parameter expansion\n", stderr);
      return -1;
    }
    const char *body_cursor = body;
    if (*body_cursor == '#') {
      const char *length_name = ++body_cursor;
      if (!is_name_start(*body_cursor)) {
        fputs("slop: unsupported parameter length expansion\n", stderr);
        return -1;
      }
      while (body_cursor < closing && is_name_byte(*body_cursor)) body_cursor++;
      if (body_cursor != closing) {
        fputs("slop: unsupported parameter length expansion\n", stderr);
        return -1;
      }
      char temporary[64];
      const char *value = parameter_value(shell, length_name,
                                          (size_t)(body_cursor - length_name),
                                          temporary);
      char result[64];
      const int written = value == NULL ? -1 :
          snprintf(result, sizeof(result), "%zu", strlen(value));
      if (written < 0 || (size_t)written >= sizeof(result) ||
          !buffer_append(word, result, (size_t)written)) return -1;
      *cursor = closing + 1;
      return 1;
    }
    if (!is_name_start(*body_cursor)) {
      fputs("slop: unsupported parameter expansion\n", stderr);
      return -1;
    }
    while (body_cursor < closing && is_name_byte(*body_cursor)) body_cursor++;
    name = body;
    length = (size_t)(body_cursor - body);
    if (body_cursor != closing) {
      int colon = *body_cursor == ':';
      if (colon) body_cursor++;
      const int pattern_operation = !colon && body_cursor != closing &&
                                    (*body_cursor == '#' || *body_cursor == '%');
      if (body_cursor == closing ||
          (!pattern_operation && strchr("-=+?", *body_cursor) == NULL)) {
        fputs("slop: unsupported parameter expansion\n", stderr);
        return -1;
      }
      const char operation = *body_cursor++;
      int longest = 0;
      if (pattern_operation && body_cursor < closing &&
          *body_cursor == operation) {
        longest = 1;
        body_cursor++;
      }
      char *variable = strndup(name, length);
      if (variable == NULL) return -1;
      const char *value = getenv(variable);
      const int set = value != NULL;
      const int usable = set && (!colon || value[0] != '\0');
      const char *replacement = body_cursor;
      const size_t replacement_length = (size_t)(closing - body_cursor);
      int ok = 1;
      if (pattern_operation) {
        Buffer expanded_pattern = {0};
        ok = expand_parameter_word(shell, replacement, replacement_length,
                                   &expanded_pattern);
        char *pattern = ok ? buffer_release(&expanded_pattern) : NULL;
        if (ok) ok = pattern != NULL && append_pattern_removal(
            word, value == NULL ? "" : value, pattern, operation, longest);
        free(pattern);
        free(expanded_pattern.data);
      } else if (operation == '-') {
        ok = usable ? buffer_append(word, value, strlen(value))
                    : expand_parameter_word(shell, replacement,
                                            replacement_length, word);
      } else if (operation == '+') {
        if (usable) ok = expand_parameter_word(shell, replacement,
                                               replacement_length, word);
      } else if (operation == '=') {
        if (usable) {
          ok = buffer_append(word, value, strlen(value));
        } else {
          Buffer assigned = {0};
          ok = expand_parameter_word(shell, replacement, replacement_length,
                                     &assigned);
          if (ok) {
            char *assigned_value = buffer_release(&assigned);
            ok = assigned_value != NULL &&
                 setenv(variable, assigned_value, 1) == 0 &&
                 buffer_append(word, assigned_value, strlen(assigned_value));
            free(assigned_value);
          } else {
            free(assigned.data);
          }
        }
      } else if (!usable) {
        Buffer message = {0};
        ok = expand_parameter_word(shell, replacement, replacement_length,
                                   &message);
        if (ok) {
          fprintf(stderr, "slop: %s: %s\n", variable,
                  message.length == 0
                      ? (colon ? "parameter is unset or empty" : "parameter is unset")
                      : message.data);
        }
        free(message.data);
        free(variable);
        return -1;
      } else {
        ok = buffer_append(word, value, strlen(value));
      }
      free(variable);
      if (!ok) return -1;
      *cursor = closing + 1;
      return 1;
    }
    source = closing + 1;
  } else if (strchr("?$#@*-", *source) != NULL || isdigit((unsigned char)*source)) {
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

// Lexing determines command structure, but expansion belongs to execution of
// each simple command. Length-framed dollar expressions preserve the original
// source without confusing escaped/single-quoted dollars with live expansion.
static int defer_dollar(const char **cursor, Buffer *word) {
  const char *start = *cursor;
  const char *source = start + 1;
  if (*source == '(') {
    int depth = 1;
    char quote = '\0';
    source++;
    while (*source != '\0' && depth != 0) {
      if (quote != '\0') {
        if (*source == quote) quote = '\0';
        else if (*source == '\\' && quote == '"' && source[1] != '\0') source++;
      } else if (*source == '\'' || *source == '"') quote = *source;
      else if (*source == '(') depth++;
      else if (*source == ')' && --depth == 0) {
        source++;
        break;
      }
      source++;
    }
    if (depth != 0) {
      fputs("slop: unterminated command substitution\n", stderr);
      return -1;
    }
  } else if (*source == '{') {
    const char *closing = parameter_closing_brace(source + 1);
    if (closing == NULL) {
      fputs("slop: unterminated parameter expansion\n", stderr);
      return -1;
    }
    source = closing + 1;
  } else if (strchr("?$#@*-", *source) != NULL ||
             isdigit((unsigned char)*source)) {
    source++;
  } else if (is_name_start(*source)) {
    while (is_name_byte(*source)) source++;
  } else {
    if (!buffer_character(word, '$')) return -1;
    *cursor = source;
    return 1;
  }

  const size_t length = (size_t)(source - start);
  char header[64];
  const int header_length = snprintf(header, sizeof(header), "%c%zu:",
                                     SLOP_DEFERRED_DOLLAR, length);
  if (header_length < 0 || (size_t)header_length >= sizeof(header) ||
      !buffer_append(word, header, (size_t)header_length) ||
      !buffer_append(word, start, length)) return -1;
  *cursor = source;
  return 1;
}

// Preserve the common legacy `command` spelling as an execution-time frame.
// Deliberately do not attempt the historical escaped-backtick nesting rules;
// modern $(command) is the unambiguous nested form supported by Slop.
static int defer_backtick(const char **cursor, Buffer *word) {
  const char *start = *cursor + 1;
  const char *source = start;
  while (*source != '\0' && *source != '`') {
    if (*source == '\\' && source[1] != '\0') source++;
    source++;
  }
  if (*source != '`') {
    fputs("slop: unterminated backtick substitution\n", stderr);
    return -1;
  }

  Buffer expression = {0};
  if (!buffer_append(&expression, "$(", 2) ||
      !buffer_append(&expression, start, (size_t)(source - start)) ||
      !buffer_character(&expression, ')')) {
    free(expression.data);
    return -1;
  }
  char header[64];
  const int header_length = snprintf(header, sizeof(header), "%c%zu:",
                                     SLOP_DEFERRED_DOLLAR,
                                     expression.length);
  const int ok = header_length >= 0 &&
                 (size_t)header_length < sizeof(header) &&
                 buffer_append(word, header, (size_t)header_length) &&
                 buffer_append(word, expression.data, expression.length);
  free(expression.data);
  if (!ok) return -1;
  *cursor = source + 1;
  return 1;
}

static int append_lexed_character(Buffer *word, char byte) {
  if (byte == SLOP_DEFERRED_DOLLAR && !buffer_character(word, byte)) return 0;
  return buffer_character(word, byte);
}

static int deferred_quoted_positional_fields(const char *text) {
  if (text == NULL || text[0] != SLOP_DEFERRED_DOLLAR) return 0;
  const char *cursor = text + 1;
  if (!isdigit((unsigned char)*cursor)) return 0;
  size_t length = 0;
  while (isdigit((unsigned char)*cursor)) {
    const unsigned digit = (unsigned)(*cursor - '0');
    if (length > (SIZE_MAX - digit) / 10) return 0;
    length = length * 10 + digit;
    cursor++;
  }
  return *cursor++ == ':' && length == 2 && cursor[0] == '$' &&
         cursor[1] == '@' && cursor[2] == '\0';
}

static TokenKind operator_kind(const char *source, size_t *length,
                               int token_boundary, int *descriptor,
                               int *target_descriptor) {
  *descriptor = -1;
  *target_descriptor = -1;
  if (strncmp(source, ";;", 2) == 0) {
    *length = 2;
    return TOKEN_CASE_END;
  }
  if (strncmp(source, "&&", 2) == 0) { *length = 2; return TOKEN_AND; }
  if (strncmp(source, "||", 2) == 0) { *length = 2; return TOKEN_OR; }

  const char *operator = source;
  unsigned parsed_descriptor = 0;
  if (token_boundary && isdigit((unsigned char)*operator)) {
    const char *digits = operator;
    while (isdigit((unsigned char)*operator)) {
      parsed_descriptor = parsed_descriptor * 10u +
                          (unsigned)(*operator - '0');
      if (parsed_descriptor > 9) break;
      operator++;
    }
    if (parsed_descriptor > 9 || (*operator != '<' && *operator != '>'))
      operator = digits;
    else
      *descriptor = (int)parsed_descriptor;
  }
  if (*operator == '<' || *operator == '>') {
    const char direction = *operator++;
    if (*descriptor < 0) *descriptor = direction == '<' ? 0 : 1;
    TokenKind redirection = direction == '<' ? TOKEN_INPUT : TOKEN_OUTPUT;
    if (direction == '<' && *operator == '<') {
      redirection = TOKEN_HEREDOC;
      operator++;
    } else if (direction == '>' && *operator == '>') {
      redirection = TOKEN_APPEND;
      operator++;
    } else if (*operator == '&') {
      operator++;
      redirection = direction == '<' ? TOKEN_DUP_INPUT : TOKEN_DUP_OUTPUT;
      if (*operator == '-') {
        *target_descriptor = -1;
        operator++;
      } else if (*operator == '$') {
        *target_descriptor = SLOP_DYNAMIC_DESCRIPTOR;
      } else {
        unsigned target = 0;
        while (isdigit((unsigned char)*operator)) {
          target = target * 10u + (unsigned)(*operator - '0');
          if (target > 9) break;
          operator++;
        }
        if (target > 9) {
          *length = 0;
          return TOKEN_WORD;
        }
        *target_descriptor = (int)target;
      }
    }
    *length = (size_t)(operator - source);
    return redirection;
  }

  *length = 1;
  switch (*source) {
    case ';': case '\n': return TOKEN_SEMI;
    case '|': return TOKEN_PIPE;
    case '!':
      if (token_boundary) return TOKEN_NOT;
      break;
    case '(': return TOKEN_LPAREN;
    case ')': return TOKEN_RPAREN;
    default: *length = 0; return TOKEN_WORD;
  }
  *length = 0;
  return TOKEN_WORD;
}

static int redirection_boundary(unsigned char byte) {
  return byte == '\0' || isspace(byte) || strchr(";|&<>()", byte) != NULL;
}

static int invalid_descriptor_redirection(const char *source) {
  const char *operator = source;
  while (isdigit((unsigned char)*operator)) operator++;
  if (operator != source && (*operator == '<' || *operator == '>') &&
      operator != source + 1) return 1;
  if (*operator != '<' && *operator != '>') return 0;
  operator++;
  if (*operator != '&') return 0;
  operator++;
  if (*operator == '$') return 0;
  if (*operator == '-') return !redirection_boundary((unsigned char)operator[1]);
  const char *target = operator;
  while (isdigit((unsigned char)*operator)) operator++;
  return operator != target + 1 ||
         !redirection_boundary((unsigned char)*operator);
}

static int lex(const char *source, TokenList *tokens) {
  size_t pending_heredocs[SLOP_MAX_HEREDOCS];
  size_t pending_count = 0;
  while (*source != '\0') {
    while (*source == ' ' || *source == '\t' || *source == '\r') source++;
    /* A backslash-newline is removed before token recognition. In
       particular, it must not manufacture an empty word when it appears
       between two already-separated words. */
    if (source[0] == '\\' && source[1] == '\n') {
      source += 2;
      continue;
    }
    if (*source == '#') {
      while (*source != '\0' && *source != '\n') source++;
      continue;
    }
    if (*source == '\0') break;
    if (*source == '\n' && pending_count != 0) {
      source++;
      for (size_t pending = 0; pending < pending_count; pending++) {
        const size_t operator_index = pending_heredocs[pending];
        if (operator_index + 1 >= tokens->count ||
            tokens->items[operator_index + 1].kind != TOKEN_WORD) {
          fputs("slop: here-document requires a delimiter word\n", stderr);
          return 0;
        }
        Token *operator_token = &tokens->items[operator_index];
        const Token *delimiter_token = &tokens->items[operator_index + 1];
        if (strchr(delimiter_token->text, SLOP_DEFERRED_DOLLAR) != NULL) {
          fputs("slop: expanded here-document delimiters are unsupported\n",
                stderr);
          return 0;
        }
        const char *body_start = source;
        int found = 0;
        while (!found) {
          const char *newline = strchr(source, '\n');
          const char *line_end = newline == NULL ? source + strlen(source)
                                                  : newline;
          if (line_end > source && line_end[-1] == '\r') line_end--;
          const size_t line_length = (size_t)(line_end - source);
          if (strlen(delimiter_token->text) == line_length &&
              memcmp(source, delimiter_token->text, line_length) == 0) {
            operator_token->text =
                strndup(body_start, (size_t)(source - body_start));
            if (operator_token->text == NULL) return 0;
            operator_token->quoted = delimiter_token->quoted;
            source = newline == NULL ? line_end : newline + 1;
            found = 1;
          } else if (newline == NULL) {
            fprintf(stderr, "slop: unterminated here-document: %s\n",
                    delimiter_token->text);
            return 0;
          } else {
            source = newline + 1;
          }
        }
      }
      pending_count = 0;
      if (!token_push(tokens, TOKEN_SEMI, NULL, 0)) return 0;
      continue;
    }
    if (source[0] == '<' && source[1] == '<' && source[2] == '-') {
      fputs("slop: tab-stripping <<- here-documents are unsupported\n",
            stderr);
      return 0;
    }
    if (invalid_descriptor_redirection(source)) {
      fputs("slop: invalid file descriptor redirection; descriptors are 0 through 9\n",
            stderr);
      return 0;
    }
    size_t operator_length = 0;
    int descriptor = -1;
    int target_descriptor = -1;
    TokenKind kind = operator_kind(source, &operator_length, 1, &descriptor,
                                   &target_descriptor);
    if (kind == TOKEN_HEREDOC && source[operator_length] == '-') {
      fputs("slop: tab-stripping <<- here-documents are unsupported\n",
            stderr);
      return 0;
    }
    if (kind == TOKEN_NOT && tokens->count != 0 &&
        tokens->items[tokens->count - 1].kind != TOKEN_SEMI &&
        tokens->items[tokens->count - 1].kind != TOKEN_AND &&
        tokens->items[tokens->count - 1].kind != TOKEN_OR) {
      operator_length = 0;
      kind = TOKEN_WORD;
    }
    if (operator_length != 0) {
      if (kind == TOKEN_SEMI && *source == '\n' && tokens->count != 0) {
        const TokenKind previous = tokens->items[tokens->count - 1].kind;
        if (previous == TOKEN_AND || previous == TOKEN_OR ||
            previous == TOKEN_PIPE) {
          source += operator_length;
          continue;
        }
      }
      if (!token_push(tokens, kind, NULL, 0)) return 0;
      tokens->items[tokens->count - 1].descriptor = descriptor;
      tokens->items[tokens->count - 1].target_descriptor = target_descriptor;
      if (kind == TOKEN_HEREDOC) {
        if (pending_count == SLOP_MAX_HEREDOCS) {
          fputs("slop: too many here-documents on one command line\n", stderr);
          return 0;
        }
        pending_heredocs[pending_count++] = tokens->count - 1;
      }
      source += operator_length;
      continue;
    }

    Buffer word = {0};
    char quote = '\0';
    int quoted = 0;
    int touched = 0;
    int split = 0;
    while (*source != '\0') {
      if (quote == '\0') {
        if (*source == ' ' || *source == '\t' || *source == '\r' || *source == '\n') break;
        int ignored_descriptor;
        int ignored_target;
        operator_kind(source, &operator_length, 0, &ignored_descriptor,
                      &ignored_target);
        if (operator_length != 0) break;
      }
      char byte = *source;
      if (quote == '\0' && (byte == '\'' || byte == '"')) {
        quote = byte; quoted = touched = 1; source++;
      } else if (quote != '\0' && byte == quote) {
        quote = '\0'; source++;
      } else if (byte == '\\' && quote != '\'') {
        source++;
        if (*source == '\0') {
          free(word.data); fputs("slop: trailing backslash\n", stderr); return 0;
        }
        if (*source == '\n') {
          source++;
          continue;
        }
        quoted = touched = 1;
        if (!append_lexed_character(&word, *source++)) { free(word.data); return 0; }
      } else if (byte == '$' && quote != '\'') {
        touched = 1;
        if (quote == '\0') split = 1;
        if (defer_dollar(&source, &word) < 0) { free(word.data); return 0; }
      } else if (byte == '`' && quote != '\'') {
        touched = 1;
        if (quote == '\0') split = 1;
        if (defer_backtick(&source, &word) < 0) { free(word.data); return 0; }
      } else {
        touched = 1;
        if (!append_lexed_character(&word, byte)) { free(word.data); return 0; }
        source++;
      }
    }
    if (quote != '\0') {
      free(word.data); fputs("slop: unterminated quote\n", stderr); return 0;
    }
    if (!touched) {
      free(word.data); return 0;
    }
    char *word_text = buffer_release(&word);
    if (tokens->count != 0 &&
        (tokens->items[tokens->count - 1].kind == TOKEN_DUP_INPUT ||
         tokens->items[tokens->count - 1].kind == TOKEN_DUP_OUTPUT) &&
        tokens->items[tokens->count - 1].target_descriptor ==
            SLOP_DYNAMIC_DESCRIPTOR) {
      tokens->items[tokens->count - 1].text = word_text;
      tokens->items[tokens->count - 1].quoted = quoted;
      continue;
    }
    if (!token_push(tokens, TOKEN_WORD, word_text, quoted)) return 0;
    tokens->items[tokens->count - 1].split = split && !quoted;
    tokens->items[tokens->count - 1].positional_fields =
        quoted && deferred_quoted_positional_fields(
                      tokens->items[tokens->count - 1].text);
  }
  if (pending_count != 0) {
    fputs("slop: here-document body must begin on the next line\n", stderr);
    return 0;
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

static enum command_resolution resolved_command_at(
    const char *candidate, char *resolved, size_t capacity) {
  if (command_at(candidate) != COMMAND_FOUND) return COMMAND_NOT_FOUND;
  if (candidate[0] == '/') {
    if (candidate == resolved) return COMMAND_FOUND;
    int length = snprintf(resolved, capacity, "%s", candidate);
    return length < 0 || (size_t)length >= capacity
        ? COMMAND_PATH_TOO_LONG : COMMAND_FOUND;
  }
  char absolute[PATH_MAX];
  if (realpath(candidate, absolute) == NULL) return COMMAND_NOT_FOUND;
  int length = snprintf(resolved, capacity, "%s", absolute);
  return length < 0 || (size_t)length >= capacity
      ? COMMAND_PATH_TOO_LONG : COMMAND_FOUND;
}

static enum command_resolution resolve_command(const char *command,
                                                char *resolved, size_t capacity) {
  if (strchr(command, '/') != NULL) {
    return resolved_command_at(command, resolved, capacity);
  }
  const char *path = getenv("PATH");
  if (path == NULL) path = "";
  do {
    const char *separator = strchr(path, ':');
    size_t length = separator == NULL ? strlen(path) : (size_t)(separator - path);
    const char *directory = length == 0 ? "." : path;
    if (length == 0) length = 1;
    int written = snprintf(resolved, capacity, "%.*s/%s", (int)length, directory, command);
    if (written >= 0 && (size_t)written < capacity) {
      const enum command_resolution found =
          resolved_command_at(resolved, resolved, capacity);
      if (found != COMMAND_NOT_FOUND) return found;
    }
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

static int ifs_byte(const char *ifs, char byte) {
  return ifs[0] != '\0' && strchr(ifs, byte) != NULL;
}

static int builtin_read(int argc, char **argv) {
  int raw = 0;
  int first_name = 1;
  if (first_name < argc && strcmp(argv[first_name], "-r") == 0) {
    raw = 1;
    first_name++;
  }
  if (first_name < argc && argv[first_name][0] == '-') {
    fprintf(stderr, "slop: read: unsupported option: %s\n", argv[first_name]);
    return 2;
  }
  if (first_name == argc) {
    static char *default_name[] = {"REPLY"};
    argv = default_name;
    argc = 1;
    first_name = 0;
  }
  for (int index = first_name; index < argc; index++) {
    if (!valid_name(argv[index], strlen(argv[index]))) {
      fprintf(stderr, "slop: read: invalid name: %s\n", argv[index]);
      return 2;
    }
  }

  Buffer line = {0};
  int reached_eof = 0;
  for (;;) {
    int byte = fgetc(stdin);
    if (byte == EOF) {
      reached_eof = 1;
      break;
    }
    if (byte == '\n') break;
    if (!raw && byte == '\\') {
      byte = fgetc(stdin);
      if (byte == EOF) {
        reached_eof = 1;
        if (!buffer_character(&line, '\\')) goto memory_error;
        break;
      }
      if (byte == '\n') continue;
    }
    if (!buffer_character(&line, (char)byte)) goto memory_error;
  }
  if (ferror(stdin)) {
    fprintf(stderr, "slop: read: %s\n", strerror(errno));
    free(line.data);
    return 1;
  }
  char *text = buffer_release(&line);
  if (text == NULL) goto memory_error;
  const char *ifs = getenv("IFS");
  if (ifs == NULL) ifs = " \t\n";
  char *cursor = text;
  while (ifs_byte(ifs, *cursor)) cursor++;
  for (int index = first_name; index < argc; index++) {
    char *value = cursor;
    if (index + 1 < argc) {
      while (*cursor != '\0' && !ifs_byte(ifs, *cursor)) cursor++;
      if (*cursor != '\0') *cursor++ = '\0';
      while (ifs_byte(ifs, *cursor)) cursor++;
    } else {
      char *end = cursor + strlen(cursor);
      while (end > cursor && ifs_byte(ifs, end[-1])) *--end = '\0';
    }
    if (setenv(argv[index], value, 1) != 0) {
      free(text);
      return 1;
    }
  }
  free(text);
  return reached_eof ? 1 : 0;

memory_error:
  free(line.data);
  fputs("slop: read: out of memory\n", stderr);
  return 1;
}

static int print_shell_variables(void) {
  ShellStateSnapshot snapshot = {0};
  if (!shell_state_capture(&snapshot)) {
    fputs("slop: set: out of memory\n", stderr);
    return 1;
  }
  qsort(snapshot.environment, snapshot.environment_count,
        sizeof(*snapshot.environment), compare_strings);
  for (size_t index = 0; index < snapshot.environment_count; index++) {
    const char *entry = snapshot.environment[index];
    const char *equals = strchr(entry, '=');
    if (equals == NULL) continue;
    fwrite(entry, 1, (size_t)(equals - entry) + 1, stdout);
    fputc('\'', stdout);
    for (const char *value = equals + 1; *value != '\0'; value++) {
      if (*value == '\'') fputs("'\\''", stdout);
      else fputc(*value, stdout);
    }
    fputs("'\n", stdout);
  }
  shell_state_snapshot_dispose(&snapshot);
  return ferror(stdout) ? 1 : 0;
}

static int print_shell_options(const Shell *shell, int commands) {
  if (commands) {
    printf("set %co errexit\n", shell->errexit ? '-' : '+');
    printf("set %co pipefail\n", shell->pipefail ? '-' : '+');
    puts("set -o posix");
    printf("set %co xtrace\n", shell->xtrace ? '-' : '+');
  } else {
    printf("errexit %s\n", shell->errexit ? "on" : "off");
    printf("pipefail %s\n", shell->pipefail ? "on" : "off");
    puts("posix on");
    printf("xtrace %s\n", shell->xtrace ? "on" : "off");
  }
  return ferror(stdout) ? 1 : 0;
}

static int set_named_option(Shell *shell, const char *name, int enabled) {
  if (strcmp(name, "errexit") == 0) shell->errexit = enabled;
  else if (strcmp(name, "pipefail") == 0) shell->pipefail = enabled;
  else if (strcmp(name, "xtrace") == 0) shell->xtrace = enabled;
  else if (strcmp(name, "posix") != 0) {
    fprintf(stderr, "slop: set: unsupported option name: %s\n", name);
    return 0;
  }
  return 1;
}

static int publish_getopts_index(unsigned index) {
  char text[32];
  const int length = snprintf(text, sizeof(text), "%u", index);
  return length >= 0 && (size_t)length < sizeof(text) &&
         setenv("OPTIND", text, 1) == 0;
}

static int builtin_getopts(Shell *shell, int argc, char **argv) {
  if (argc < 3) {
    fputs("slop: getopts: expected OPTSTRING NAME [ARG ...]\n", stderr);
    return 2;
  }
  const char *optstring = argv[1];
  const char *name = argv[2];
  if (!valid_name(name, strlen(name))) {
    fprintf(stderr, "slop: getopts: invalid name: %s\n", name);
    return 2;
  }

  unsigned requested_index = 1;
  const char *optind_text = getenv("OPTIND");
  if (optind_text != NULL && optind_text[0] != '\0') {
    char *end = NULL;
    errno = 0;
    const unsigned long parsed = strtoul(optind_text, &end, 10);
    if (errno == 0 && end != optind_text && *end == '\0' && parsed != 0 &&
        parsed <= UINT_MAX) requested_index = (unsigned)parsed;
  }
  if (shell->getopts_index != requested_index) {
    shell->getopts_index = requested_index;
    shell->getopts_offset = 1;
  }
  if (shell->getopts_offset == 0) shell->getopts_offset = 1;

  char **arguments = argc > 3 ? argv + 3 : shell->argv + 1;
  const size_t count = argc > 3 ? (size_t)(argc - 3)
                                : (size_t)(shell->argc > 0 ? shell->argc - 1 : 0);
  if (shell->getopts_index > count) return 1;
  const char *word = arguments[shell->getopts_index - 1];
  if (shell->getopts_offset == 1) {
    if (strcmp(word, "--") == 0) {
      shell->getopts_index++;
      if (!publish_getopts_index(shell->getopts_index)) return 1;
      return 1;
    }
    if (word[0] != '-' || word[1] == '\0') return 1;
  }
  if (shell->getopts_offset >= strlen(word)) {
    shell->getopts_index++;
    shell->getopts_offset = 1;
    if (!publish_getopts_index(shell->getopts_index)) return 1;
    return builtin_getopts(shell, argc, argv);
  }

  const char option = word[shell->getopts_offset++];
  const int silent = optstring[0] == ':';
  const char *specification = strchr(optstring + silent, option);
  const int known = option != ':' && specification != NULL;
  const int requires_argument = known && specification[1] == ':';
  const char *option_argument = NULL;
  int missing_argument = 0;

  if (requires_argument) {
    if (word[shell->getopts_offset] != '\0') {
      option_argument = word + shell->getopts_offset;
      shell->getopts_index++;
      shell->getopts_offset = 1;
    } else if (shell->getopts_index < count) {
      option_argument = arguments[shell->getopts_index];
      shell->getopts_index += 2;
      shell->getopts_offset = 1;
    } else {
      missing_argument = 1;
      shell->getopts_index++;
      shell->getopts_offset = 1;
    }
  } else if (word[shell->getopts_offset] == '\0') {
    shell->getopts_index++;
    shell->getopts_offset = 1;
  }
  if (!publish_getopts_index(shell->getopts_index)) return 1;

  char option_text[2] = {option, '\0'};
  if (!known) {
    if (setenv(name, "?", 1) != 0) return 1;
    if (silent) {
      if (setenv("OPTARG", option_text, 1) != 0) return 1;
    } else {
      unsetenv("OPTARG");
      fprintf(stderr, "slop: getopts: illegal option: %c\n", option);
    }
    return 0;
  }
  if (missing_argument) {
    if (setenv(name, silent ? ":" : "?", 1) != 0) return 1;
    if (silent) {
      if (setenv("OPTARG", option_text, 1) != 0) return 1;
    } else {
      unsetenv("OPTARG");
      fprintf(stderr, "slop: getopts: option requires an argument: %c\n", option);
    }
    return 0;
  }
  if (setenv(name, option_text, 1) != 0) return 1;
  if (requires_argument) {
    if (setenv("OPTARG", option_argument, 1) != 0) return 1;
  } else {
    unsetenv("OPTARG");
  }
  return 0;
}

static int builtin_local(Shell *shell, int argc, char **argv) {
  if (shell->function_depth == 0 || shell->local_frame == NULL) {
    fputs("slop: local: only valid inside a function\n", stderr);
    return 1;
  }
  int argument = 1;
  if (argument < argc && strcmp(argv[argument], "--") == 0) argument++;
  for (; argument < argc; argument++) {
    const char *word = argv[argument];
    size_t name_length = 0;
    const int has_value = assignment(word, &name_length);
    if (!has_value) {
      name_length = strlen(word);
      if (!valid_name(word, name_length)) {
        fprintf(stderr, "slop: local: invalid name: %s\n", word);
        return 2;
      }
    }
    LocalFrame *frame = shell->local_frame;
    EnvironmentChange *change = NULL;
    for (size_t index = 0; index < frame->count; index++) {
      if (strlen(frame->changes[index].name) == name_length &&
          strncmp(frame->changes[index].name, word, name_length) == 0) {
        change = &frame->changes[index];
        break;
      }
    }
    if (change == NULL) {
      if (!grow((void **)&frame->changes, &frame->capacity,
                frame->count + 1, sizeof(*frame->changes))) {
        fputs("slop: local: out of memory\n", stderr);
        return 1;
      }
      change = &frame->changes[frame->count];
      memset(change, 0, sizeof(*change));
      change->name = strndup(word, name_length);
      if (change->name == NULL) {
        fputs("slop: local: out of memory\n", stderr);
        return 1;
      }
      const char *old_value = getenv(change->name);
      change->existed = old_value != NULL;
      change->old_value = old_value == NULL ? NULL : strdup(old_value);
      if (old_value != NULL && change->old_value == NULL) {
        free(change->name);
        memset(change, 0, sizeof(*change));
        fputs("slop: local: out of memory\n", stderr);
        return 1;
      }
      frame->count++;
    }
    if (setenv(change->name, has_value ? word + name_length + 1 : "", 1) != 0)
      return 1;
  }
  return 0;
}

static int builtin_name(const char *name) {
  static const char *const names[] = {
      ":", ".", "source", "eval", "return", "exit", "break", "continue", "cd",
      "export", "unset", "set", "shift", "read", "getopts", "local",
      "type", "exec",
  };
  for (size_t index = 0; index < sizeof(names) / sizeof(names[0]); index++) {
    if (strcmp(name, names[index]) == 0) return 1;
  }
  return 0;
}

static int builtin(Shell *shell, int argc, char **argv, int *handled) {
  *handled = 1;
  if (strcmp(argv[0], ":") == 0) return 0;
  if (strcmp(argv[0], "exec") == 0) {
    fputs("slop: exec: replacing the shell with a command is unsupported\n",
          stderr);
    return 2;
  }
  if (strcmp(argv[0], ".") == 0 || strcmp(argv[0], "source") == 0) {
    if (argc < 2) {
      fprintf(stderr, "slop: %s: a script path is required\n", argv[0]);
      return 2;
    }
    char resolved[1024];
    const char *path = argv[1];
    if (strchr(path, '/') == NULL) {
      const enum command_resolution resolution =
          resolve_command(path, resolved, sizeof(resolved));
      if (resolution != COMMAND_FOUND) {
        fprintf(stderr, "slop: %s: %s: not found\n", argv[0], path);
        return 1;
      }
      path = resolved;
    }
    char *source = read_script(path);
    if (source == NULL) return 1;
    const int saved_argc = shell->argc;
    char **saved_argv = shell->argv;
    const int saved_array_owned = shell->argv_array_owned;
    const int saved_strings_owned = shell->argv_strings_owned;
    if (argc > 2) {
      shell->argv_array_owned = 0;
      shell->argv_strings_owned = 0;
      if (!shell_set_positional(shell, argc - 2, argv + 2)) {
        shell->argc = saved_argc;
        shell->argv = saved_argv;
        shell->argv_array_owned = saved_array_owned;
        shell->argv_strings_owned = saved_strings_owned;
        free(source);
        fprintf(stderr, "slop: %s: out of memory\n", argv[0]);
        return 1;
      }
    }
    const int status = execute_text(shell, source);
    if (argc > 2) shell_argv_dispose(shell);
    shell->argc = saved_argc;
    shell->argv = saved_argv;
    shell->argv_array_owned = saved_array_owned;
    shell->argv_strings_owned = saved_strings_owned;
    free(source);
    return status;
  }
  if (strcmp(argv[0], "eval") == 0) {
    Buffer source = {0};
    for (int index = 1; index < argc; index++) {
      if ((index != 1 && !buffer_character(&source, ' ')) ||
          !buffer_append(&source, argv[index], strlen(argv[index]))) {
        free(source.data);
        fputs("slop: eval: out of memory\n", stderr);
        return 1;
      }
    }
    char *text = buffer_release(&source);
    if (text == NULL) return 1;
    const int status = execute_text(shell, text);
    free(text);
    return status;
  }
  if (strcmp(argv[0], "return") == 0) {
    if (shell->function_depth == 0) {
      fputs("slop: return: only valid inside a function\n", stderr);
      return 1;
    }
    if (argc > 2) {
      fputs("slop: return: expected at most one status\n", stderr);
      return 2;
    }
    long parsed = shell->last_status;
    if (argc == 2) {
      char *end = NULL;
      errno = 0;
      parsed = strtol(argv[1], &end, 10);
      if (errno == ERANGE || end == argv[1] || *end != '\0') {
        fprintf(stderr, "slop: return: %s: numeric argument required\n",
                argv[1]);
        parsed = 2;
      }
    }
    shell->returning = 1;
    shell->return_status = (int)(parsed & 255);
    return shell->return_status;
  }
  if (strcmp(argv[0], "break") == 0 || strcmp(argv[0], "continue") == 0) {
    if (shell->loop_depth == 0) {
      fprintf(stderr, "slop: %s: only valid inside a loop\n", argv[0]);
      return 1;
    }
    if (argc > 2) {
      fprintf(stderr, "slop: %s: expected at most one level\n", argv[0]);
      return 2;
    }
    unsigned levels = 1;
    if (argc == 2) {
      char *end = NULL;
      errno = 0;
      unsigned long parsed = strtoul(argv[1], &end, 10);
      if (errno == ERANGE || end == argv[1] || *end != '\0' || parsed == 0) {
        fprintf(stderr, "slop: %s: %s: positive loop level required\n",
                argv[0], argv[1]);
        return 2;
      }
      levels = parsed > (unsigned)shell->loop_depth
                   ? (unsigned)shell->loop_depth
                   : (unsigned)parsed;
    }
    shell->loop_control = strcmp(argv[0], "break") == 0
                              ? LOOP_CONTROL_BREAK
                              : LOOP_CONTROL_CONTINUE;
    shell->loop_levels = levels;
    return 0;
  }
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
    int argument = 1;
    if (argument < argc && strcmp(argv[argument], "--") == 0) argument++;
    if (argc - argument > 1) {
      fputs("slop: cd: expected at most one directory\n", stderr);
      return 2;
    }
    const int previous = argument < argc && strcmp(argv[argument], "-") == 0;
    const char *path = argument < argc
                           ? (previous ? getenv("OLDPWD") : argv[argument])
                           : getenv("HOME");
    if (previous && (path == NULL || path[0] == '\0')) {
      fputs("slop: cd: OLDPWD is not set\n", stderr);
      return 1;
    }
    if (path == NULL || path[0] == '\0') path = "/workspace";
    char *old_cwd = getcwd(NULL, 0);
    if (old_cwd == NULL) {
      fprintf(stderr, "slop: cd: %s\n", strerror(errno));
      return 1;
    }
    if (chdir(path) != 0) {
      fprintf(stderr, "slop: cd: %s: %s\n", path, strerror(errno));
      free(old_cwd);
      return 1;
    }
    char *new_cwd = getcwd(NULL, 0);
    if (new_cwd == NULL || setenv("OLDPWD", old_cwd, 1) != 0 ||
        setenv("PWD", new_cwd, 1) != 0) {
      fprintf(stderr, "slop: cd: could not publish directory state: %s\n",
              strerror(errno));
      free(old_cwd);
      free(new_cwd);
      return 1;
    }
    if (previous) puts(new_cwd);
    free(old_cwd);
    free(new_cwd);
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
  if (strcmp(argv[0], "read") == 0) return builtin_read(argc, argv);
  if (strcmp(argv[0], "getopts") == 0)
    return builtin_getopts(shell, argc, argv);
  if (strcmp(argv[0], "local") == 0)
    return builtin_local(shell, argc, argv);
  if (strcmp(argv[0], "shift") == 0) {
    if (argc > 2) {
      fputs("slop: shift: expected at most one count\n", stderr);
      return 2;
    }
    unsigned count = 1;
    if (argc == 2) {
      char *end = NULL;
      errno = 0;
      unsigned long parsed = strtoul(argv[1], &end, 10);
      if (errno == ERANGE || end == argv[1] || *end != '\0' ||
          parsed > UINT_MAX) {
        fprintf(stderr, "slop: shift: %s: nonnegative count required\n",
                argv[1]);
        return 2;
      }
      count = (unsigned)parsed;
    }
    const int shifted = shell_shift(shell, count);
    if (shifted < 0) {
      fputs("slop: shift: out of memory\n", stderr);
      return 1;
    }
    if (shifted == 0) {
      fputs("slop: shift: count exceeds positional parameters\n", stderr);
      return 1;
    }
    return 0;
  }
  if (strcmp(argv[0], "set") == 0) {
    if (argc == 1) return print_shell_variables();
    int argument = 1;
    for (; argument < argc; argument++) {
      const char *option = argv[argument];
      if (strcmp(option, "--") == 0) { argument++; break; }
      if ((option[0] != '-' && option[0] != '+') || option[1] == '\0') break;
      const int enabled = option[0] == '-';
      if (strcmp(option + 1, "o") == 0) {
        if (argument + 1 == argc) return print_shell_options(shell, !enabled);
        if (!set_named_option(shell, argv[++argument], enabled)) return 2;
        continue;
      }
      for (size_t index = 1; option[index] != '\0'; index++) {
        if (option[index] == 'e') shell->errexit = enabled;
        else if (option[index] == 'x') shell->xtrace = enabled;
        else {
          fputs("slop: set: only e, x, and named -o options are supported\n", stderr);
          return 2;
        }
      }
    }
    if (argument < argc || strcmp(argv[argc - 1], "--") == 0) {
      if (!shell_set_positional(shell, argc - argument, argv + argument)) {
        fputs("slop: set: out of memory\n", stderr);
        return 1;
      }
    }
    return 0;
  }
  if (strcmp(argv[0], "type") == 0) {
    int path_only = 0;
    int argument = 1;
    if (argument < argc &&
        (strcmp(argv[argument], "-p") == 0 ||
         strcmp(argv[argument], "-P") == 0)) {
      path_only = 1;
      argument++;
    }
    if (argument == argc) {
      fputs("slop: type: a command name is required\n", stderr);
      return 2;
    }
    int status = 0;
    for (; argument < argc; argument++) {
      const char *name = argv[argument];
      Function *function = function_lookup(shell->functions, name);
      if (!path_only && function != NULL) {
        printf("%s is a shell function\n", name);
        continue;
      }
      if (!path_only && builtin_name(name)) {
        printf("%s is a shell builtin\n", name);
        continue;
      }
      char path[1024];
      if (resolve_command(name, path, sizeof(path)) == COMMAND_FOUND) {
        if (path_only) puts(path);
        else printf("%s is %s\n", name, path);
      } else {
        if (!path_only) fprintf(stderr, "slop: type: %s: not found\n", name);
        status = 1;
      }
    }
    return status;
  }
  *handled = 0;
  return 0;
}

static int run_function(Shell *shell, const Function *function,
                        int argc, char **argv) {
  if (shell->function_depth >= 64) {
    fprintf(stderr, "slop: %s: function recursion limit reached\n",
            function->name);
    return 2;
  }
  TokenList body = {0};
  if (!tokens_clone_range(function->body.items, 0,
                          function->body.count - 1, &body)) {
    fputs("slop: function: out of memory\n", stderr);
    return 1;
  }
  char **parameters = calloc((size_t)argc + 1, sizeof(*parameters));
  if (parameters == NULL) {
    tokens_dispose(&body);
    return 1;
  }
  parameters[0] = shell->argc > 0 ? shell->argv[0] : argv[0];
  for (int index = 1; index < argc; index++) parameters[index] = argv[index];

  const int saved_argc = shell->argc;
  char **saved_argv = shell->argv;
  const int saved_array_owned = shell->argv_array_owned;
  const int saved_strings_owned = shell->argv_strings_owned;
  shell->argc = argc;
  shell->argv = parameters;
  shell->argv_array_owned = 1;
  shell->argv_strings_owned = 0;
  shell->function_depth++;
  LocalFrame local_frame = {0};
  LocalFrame *saved_local_frame = shell->local_frame;
  shell->local_frame = &local_frame;
  int status = execute_tokens(shell, &body);
  restore_environment_changes(local_frame.changes, local_frame.count);
  free(local_frame.changes);
  shell->local_frame = saved_local_frame;
  shell->function_depth--;
  if (shell->returning) {
    status = shell->return_status;
    shell->returning = 0;
    shell->return_status = 0;
  }
  shell_argv_dispose(shell);
  shell->argc = saved_argc;
  shell->argv = saved_argv;
  shell->argv_array_owned = saved_array_owned;
  shell->argv_strings_owned = saved_strings_owned;
  tokens_dispose(&body);
  return status;
}

static int run_with_descriptors(Shell *shell, int argc, char **argv,
                                int input, int output, int error) {
  if (argc == 0) return 0;
  int handled = 0;
  int is_builtin = builtin_name(argv[0]);
  Function *function = is_builtin ? NULL : function_lookup(shell->functions, argv[0]);
  if (is_builtin || function != NULL) {
    int saved[3] = {dup(0), dup(1), dup(2)};
    if (saved[0] < 0 || saved[1] < 0 || saved[2] < 0 ||
        dup2(input, 0) < 0 || dup2(output, 1) < 0 || dup2(error, 2) < 0) {
      for (int index = 0; index < 3; index++) if (saved[index] >= 0) close(saved[index]);
      return 126;
    }
    clearerr(stdin); clearerr(stdout); clearerr(stderr);
    int status = is_builtin ? builtin(shell, argc, argv, &handled)
                            : run_function(shell, function, argc, argv);
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

typedef struct {
  int destination;
  int saved;
  int was_open;
} DescriptorBackup;

typedef struct {
  DescriptorBackup items[10];
  size_t count;
} DescriptorState;

static int token_is_file_redirection(TokenKind kind) {
  return kind == TOKEN_INPUT || kind == TOKEN_OUTPUT || kind == TOKEN_APPEND ||
         kind == TOKEN_HEREDOC;
}

static int token_is_redirection(TokenKind kind) {
  return token_is_file_redirection(kind) || kind == TOKEN_DUP_INPUT ||
         kind == TOKEN_DUP_OUTPUT;
}

static int open_heredoc(Shell *shell, const Token *token);

static int descriptor_state_save(DescriptorState *state, int destination) {
  for (size_t index = 0; index < state->count; index++) {
    if (state->items[index].destination == destination) return 1;
  }
  if (destination < 0 || destination > 9 || state->count == 10) {
    errno = EINVAL;
    return 0;
  }
  errno = 0;
  const int saved = fcntl(destination, F_DUPFD, 10);
  if (saved < 0 && errno != EBADF) return 0;
  state->items[state->count++] = (DescriptorBackup){
      .destination = destination,
      .saved = saved,
      .was_open = saved >= 0,
  };
  return 1;
}

static int descriptor_state_save_all(DescriptorState *state) {
  for (int descriptor = 0; descriptor <= 9; descriptor++) {
    if (!descriptor_state_save(state, descriptor)) return 0;
  }
  return 1;
}

static void descriptor_state_restore(DescriptorState *state) {
  fflush(NULL);
  while (state->count != 0) {
    DescriptorBackup *backup = &state->items[--state->count];
    if (backup->was_open) {
      (void)dup2(backup->saved, backup->destination);
      close(backup->saved);
    } else {
      (void)close(backup->destination);
    }
  }
  clearerr(stdin);
  clearerr(stdout);
  clearerr(stderr);
}

static void descriptor_state_commit(DescriptorState *state) {
  while (state->count != 0) {
    DescriptorBackup *backup = &state->items[--state->count];
    if (backup->was_open) close(backup->saved);
  }
}

static int descriptor_state_duplicate(DescriptorState *state, int destination,
                                      int source) {
  if (!descriptor_state_save(state, destination)) return 0;
  if (source < 0) {
    if (close(destination) != 0 && errno != EBADF) return 0;
    return 1;
  }
  return dup2(source, destination) >= 0;
}

static int apply_descriptor_redirections(Shell *shell, DescriptorState *state,
                                         const Token *tokens, size_t start,
                                         size_t end, int pipeline_input,
                                         int pipeline_output) {
  fflush(NULL);
  if ((pipeline_input != STDIN_FILENO &&
       !descriptor_state_duplicate(state, STDIN_FILENO, pipeline_input)) ||
      (pipeline_output != STDOUT_FILENO &&
       !descriptor_state_duplicate(state, STDOUT_FILENO, pipeline_output))) {
    fprintf(stderr, "slop: pipeline redirection: %s\n", strerror(errno));
    return 0;
  }
  for (size_t cursor = start; cursor < end; cursor++) {
    const Token *token = &tokens[cursor];
    if (!token_is_redirection(token->kind)) continue;
    if (token->kind == TOKEN_DUP_INPUT || token->kind == TOKEN_DUP_OUTPUT) {
      if (!descriptor_state_duplicate(state, token->descriptor,
                                      token->target_descriptor)) {
        fprintf(stderr, "slop: %d: bad file descriptor\n",
                token->target_descriptor);
        return 0;
      }
      continue;
    }

    const char *path = tokens[++cursor].text;
    const int flags = token->kind == TOKEN_INPUT
                          ? O_RDONLY
                          : O_WRONLY | O_CREAT |
                                (token->kind == TOKEN_APPEND ? O_APPEND
                                                            : O_TRUNC);
    if (!descriptor_state_save(state, token->descriptor)) return 0;
    const int opened = token->kind == TOKEN_HEREDOC
                           ? open_heredoc(shell, token)
                           : open_redirection(path, flags);
    if (opened < 0) return 0;
    int duplicated = opened == token->descriptor
                         ? token->descriptor
                         : dup2(opened, token->descriptor);
    if (opened != token->descriptor) close(opened);
    if (duplicated < 0) return 0;
  }
  clearerr(stdin);
  clearerr(stdout);
  clearerr(stderr);
  return 1;
}

typedef struct {
  DescriptorState descriptors;
  int streams[3];
  int owned[32];
  size_t owned_count;
} CommandRedirections;

static void command_redirections_dispose(CommandRedirections *redirections) {
  for (size_t index = 0; index < redirections->owned_count; index++)
    close(redirections->owned[index]);
  redirections->owned_count = 0;
  descriptor_state_restore(&redirections->descriptors);
}

static int command_redirections_own(CommandRedirections *redirections,
                                    int descriptor) {
  if (redirections->owned_count ==
      sizeof(redirections->owned) / sizeof(redirections->owned[0])) {
    close(descriptor);
    errno = EMFILE;
    return -1;
  }
  redirections->owned[redirections->owned_count++] = descriptor;
  return descriptor;
}

static int command_redirections_copy(CommandRedirections *redirections,
                                     int descriptor) {
  const int copy = fcntl(descriptor, F_DUPFD, 10);
  return copy < 0 ? -1 : command_redirections_own(redirections, copy);
}

static int apply_command_redirections(Shell *shell,
                                      CommandRedirections *redirections,
                                      const Token *tokens, size_t start,
                                      size_t end, int pipeline_input,
                                      int pipeline_output) {
  redirections->streams[0] = pipeline_input;
  redirections->streams[1] = pipeline_output;
  redirections->streams[2] = STDERR_FILENO;
  for (size_t cursor = start; cursor < end; cursor++) {
    const Token *token = &tokens[cursor];
    if (!token_is_redirection(token->kind)) continue;
    const int destination = token->descriptor;
    if (token->kind == TOKEN_DUP_INPUT || token->kind == TOKEN_DUP_OUTPUT) {
      int source = token->target_descriptor;
      if (source >= 0 && source <= STDERR_FILENO)
        source = redirections->streams[source];
      if (destination <= STDERR_FILENO) {
        if (source < 0) {
          const int flags = destination == STDIN_FILENO ? O_RDONLY : O_WRONLY;
          source = open_redirection("/dev/null", flags);
          if (source >= 0)
            source = command_redirections_own(redirections, source);
        } else {
          source = command_redirections_copy(redirections, source);
        }
        if (source < 0) goto descriptor_error;
        redirections->streams[destination] = source;
      } else if (!descriptor_state_duplicate(&redirections->descriptors,
                                             destination, source)) {
        goto descriptor_error;
      }
      continue;
    }

    const char *path = tokens[++cursor].text;
    const int flags = token->kind == TOKEN_INPUT
                          ? O_RDONLY
                          : O_WRONLY | O_CREAT |
                                (token->kind == TOKEN_APPEND ? O_APPEND
                                                            : O_TRUNC);
    int opened = token->kind == TOKEN_HEREDOC
                     ? open_heredoc(shell, token)
                     : open_redirection(path, flags);
    if (opened < 0) return 0;
    if (destination <= STDERR_FILENO) {
      const int routed = fcntl(opened, F_DUPFD, 10);
      close(opened);
      if (routed < 0 || command_redirections_own(redirections, routed) < 0)
        goto descriptor_error;
      redirections->streams[destination] = routed;
    } else {
      if (!descriptor_state_save(&redirections->descriptors, destination)) {
        close(opened);
        goto descriptor_error;
      }
      const int duplicated = opened == destination
                                 ? destination
                                 : dup2(opened, destination);
      if (opened != destination) close(opened);
      if (duplicated < 0) goto descriptor_error;
    }
  }
  return 1;

descriptor_error:
  fprintf(stderr, "slop: redirection: %s\n", strerror(errno));
  return 0;
}

static int command_redirections_commit(CommandRedirections *redirections) {
  fflush(NULL);
  for (int descriptor = 0; descriptor <= STDERR_FILENO; descriptor++) {
    if (redirections->streams[descriptor] != descriptor &&
        dup2(redirections->streams[descriptor], descriptor) < 0) return 0;
  }
  for (size_t index = 0; index < redirections->owned_count; index++)
    close(redirections->owned[index]);
  redirections->owned_count = 0;
  descriptor_state_commit(&redirections->descriptors);
  clearerr(stdin);
  clearerr(stdout);
  clearerr(stderr);
  return 1;
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

static void trace_simple(Shell *shell, Arguments *arguments,
                         Token *tokens, size_t start, size_t end) {
  if (!shell->xtrace) return;
  fputc('+', stderr);
  for (size_t index = 0; index < arguments->count; index++) {
    fputc(' ', stderr);
    trace_word(arguments->items[index]);
  }
  for (size_t index = start; index < end; index++) {
    const Token *token = &tokens[index];
    if (!token_is_redirection(token->kind)) continue;
    fprintf(stderr, " %d%s", token->descriptor,
            token->kind == TOKEN_INPUT ? "<" :
            token->kind == TOKEN_OUTPUT ? ">" :
            token->kind == TOKEN_APPEND ? ">>" :
            token->kind == TOKEN_HEREDOC ? "<<" :
            token->kind == TOKEN_DUP_INPUT ? "<&" : ">&");
    if (token_is_file_redirection(token->kind) && ++index < end) {
      fputc(' ', stderr);
      trace_word(tokens[index].text);
    } else if (token->target_descriptor < 0) {
      fputc('-', stderr);
    } else {
      fprintf(stderr, "%d", token->target_descriptor);
    }
  }
  fputc('\n', stderr);
  fflush(stderr);
  fsync(STDERR_FILENO);
}

static int expand_deferred_dollars(Shell *shell, Token *tokens,
                                   size_t start, size_t end) {
  for (size_t index = start; index < end; index++) {
    if (tokens[index].positional_fields) continue;
    if (tokens[index].text == NULL ||
        strchr(tokens[index].text, SLOP_DEFERRED_DOLLAR) == NULL) continue;
    Buffer expanded = {0};
    const char *cursor = tokens[index].text;
    while (*cursor != '\0') {
      if (*cursor != SLOP_DEFERRED_DOLLAR) {
        if (!buffer_character(&expanded, *cursor++)) goto memory_error;
        continue;
      }
      cursor++;
      if (*cursor == SLOP_DEFERRED_DOLLAR) {
        if (!buffer_character(&expanded, *cursor++)) goto memory_error;
        continue;
      }
      if (!isdigit((unsigned char)*cursor)) goto malformed;
      size_t length = 0;
      while (isdigit((unsigned char)*cursor)) {
        const unsigned digit = (unsigned)(*cursor - '0');
        if (length > (SIZE_MAX - digit) / 10) goto malformed;
        length = length * 10 + digit;
        cursor++;
      }
      if (*cursor++ != ':' || strlen(cursor) < length) goto malformed;
      char *expression = strndup(cursor, length);
      if (expression == NULL) goto memory_error;
      const char *expression_cursor = expression;
      const int result = expand_dollar_now(shell, &expression_cursor, &expanded);
      const int complete = result >= 0 && *expression_cursor == '\0';
      free(expression);
      if (!complete) goto expansion_error;
      cursor += length;
    }
    free(tokens[index].text);
    tokens[index].text = buffer_release(&expanded);
    if (tokens[index].text == NULL) return 0;
    continue;

malformed:
    fputs("slop: malformed deferred expansion\n", stderr);
expansion_error:
    free(expanded.data);
    return -1;
memory_error:
    free(expanded.data);
    return 0;
  }
  return 1;
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

static int resolve_dynamic_descriptors(Token *tokens, size_t start,
                                       size_t end) {
  for (size_t index = start; index < end; index++) {
    Token *token = &tokens[index];
    if ((token->kind != TOKEN_DUP_INPUT &&
         token->kind != TOKEN_DUP_OUTPUT) ||
        token->target_descriptor != SLOP_DYNAMIC_DESCRIPTOR) continue;
    if (token->text != NULL && token->text[0] == '-' &&
        token->text[1] == '\0') {
      token->target_descriptor = -1;
      continue;
    }
    if (token->text == NULL || token->text[0] < '0' || token->text[0] > '9' ||
        token->text[1] != '\0') {
      fprintf(stderr, "slop: %s: bad file descriptor\n",
              token->text == NULL ? "" : token->text);
      return 0;
    }
    token->target_descriptor = token->text[0] - '0';
  }
  return 1;
}

static int expand_tilde_words(Token *tokens, size_t start, size_t end,
                              int command_context) {
  const char *home = getenv("HOME");
  if (home == NULL || home[0] == '\0') return 1;
  int command_seen = 0;
  for (size_t index = start; index < end; index++) {
    Token *token = &tokens[index];
    if (token->kind != TOKEN_WORD || token->text == NULL) continue;
    const int redirection_path = index > start &&
        token_is_file_redirection(tokens[index - 1].kind);
    size_t name_length = 0;
    const int assignment_word = !token->quoted && command_context &&
                                !command_seen && !redirection_path &&
                                assignment(token->text, &name_length);
    if (!assignment_word && command_context && !redirection_path)
      command_seen = 1;
    if (token->quoted) continue;
    char *tilde = assignment_word ? token->text + name_length + 1
                                  : token->text;
    if (tilde[0] != '~' || (tilde[1] != '\0' && tilde[1] != '/')) continue;
    const size_t prefix = (size_t)(tilde - token->text);
    const size_t home_length = strlen(home);
    const size_t suffix_length = strlen(tilde + 1);
    if (prefix > SIZE_MAX - home_length - suffix_length - 1) return 0;
    char *expanded = malloc(prefix + home_length + suffix_length + 1);
    if (expanded == NULL) return 0;
    memcpy(expanded, token->text, prefix);
    memcpy(expanded + prefix, home, home_length);
    memcpy(expanded + prefix + home_length, tilde + 1, suffix_length + 1);
    free(token->text);
    token->text = expanded;
  }
  return 1;
}

static int expand_heredoc(Shell *shell, const char *source, Buffer *output) {
  while (*source != '\0') {
    if (*source == '\\') {
      if (source[1] == '\n') {
        source += 2;
        continue;
      }
      if (source[1] == '$' || source[1] == '`' || source[1] == '\\') {
        if (!buffer_character(output, source[1])) return 0;
        source += 2;
        continue;
      }
      if (!buffer_character(output, *source++)) return 0;
      continue;
    }
    if (*source == '$') {
      const char *cursor = source;
      if (expand_dollar_now(shell, &cursor, output) < 0) return 0;
      source = cursor;
      continue;
    }
    if (*source == '`') {
      const char *start = ++source;
      while (*source != '\0' && *source != '`') {
        if (*source == '\\' && source[1] != '\0') source++;
        source++;
      }
      if (*source != '`') {
        fputs("slop: unterminated backtick in here-document\n", stderr);
        return 0;
      }
      char *command = strndup(start, (size_t)(source - start));
      if (command == NULL || !capture_command(shell, command, output)) {
        free(command);
        return 0;
      }
      free(command);
      source++;
      continue;
    }
    if (!buffer_character(output, *source++)) return 0;
  }
  return 1;
}

static int open_heredoc(Shell *shell, const Token *token) {
  Buffer contents = {0};
  int expanded = token->quoted
                     ? buffer_append(&contents, token->text,
                                     strlen(token->text))
                     : expand_heredoc(shell, token->text, &contents);
  if (!expanded) {
    free(contents.data);
    return -1;
  }
  Token result = {
      .kind = TOKEN_WORD,
      .text = buffer_release(&contents),
  };
  if (result.text == NULL ||
      !expand_deferred_status(shell, &result, 0, 1)) {
    free(result.text);
    return -1;
  }

  char path[] = "/tmp/slop-heredoc-XXXXXX";
  const int descriptor = mkstemp(path);
  if (descriptor < 0) {
    free(result.text);
    return -1;
  }
  unlink(path);
  size_t offset = 0;
  const size_t length = strlen(result.text);
  while (offset < length) {
    const ssize_t written = write(descriptor, result.text + offset,
                                  length - offset);
    if (written < 0 && errno == EINTR) continue;
    if (written <= 0) {
      close(descriptor);
      free(result.text);
      return -1;
    }
    offset += (size_t)written;
  }
  free(result.text);
  if (lseek(descriptor, 0, SEEK_SET) < 0) {
    close(descriptor);
    return -1;
  }
  return descriptor;
}

static int expand_word_arguments(Shell *shell, Arguments *arguments,
                                 const Token *token) {
  if (token->positional_fields) {
    for (int index = 1; index < shell->argc; index++) {
      if (!argument_push(arguments, shell->argv[index])) return 0;
    }
    return 1;
  }
  if (!token->split) return expand_glob(arguments, token);
  const char *ifs = getenv("IFS");
  if (ifs == NULL) ifs = " \t\n";
  if (ifs[0] == '\0') return expand_glob(arguments, token);
  const char *cursor = token->text;
  while (*cursor != '\0') {
    while (*cursor != '\0' && ifs_byte(ifs, *cursor)) cursor++;
    if (*cursor == '\0') break;
    const char *start = cursor;
    while (*cursor != '\0' && !ifs_byte(ifs, *cursor)) cursor++;
    Token field = {
        .kind = TOKEN_WORD,
        .text = strndup(start, (size_t)(cursor - start)),
    };
    if (field.text == NULL || !expand_glob(arguments, &field)) {
      free(field.text);
      return 0;
    }
    free(field.text);
  }
  return 1;
}

static int run_simple_mutable(Shell *shell, Token *tokens, size_t start,
                              size_t end, int pipeline_input,
                              int pipeline_output) {
  Arguments arguments = {0};
  CommandRedirections redirections = {0};
  const int expansion_status = shell->last_status;
  const int dollar_status = expand_deferred_dollars(shell, tokens, start, end);
  if (dollar_status == 0) goto memory_error;
  if (dollar_status < 0) goto expansion_error;
  shell->last_status = expansion_status;
  if (!expand_deferred_status(shell, tokens, start, end) ||
      !expand_tilde_words(tokens, start, end, 1)) goto memory_error;
  if (!resolve_dynamic_descriptors(tokens, start, end)) goto syntax_error;
  int command_seen = 0;
  size_t command_index = SIZE_MAX;
  for (size_t index = start; index < end; index++) {
    Token *token = &tokens[index];
    if (token->kind == TOKEN_WORD) {
      size_t name_length = 0;
      if (!command_seen && assignment(token->text, &name_length)) {
        if (!argument_push(&arguments, token->text)) goto memory_error;
        continue;
      }
      if (command_seen && assignment(token->text, &name_length) &&
          (strcmp(arguments.items[command_index], "export") == 0 ||
           strcmp(arguments.items[command_index], "local") == 0)) {
        if (!argument_push(&arguments, token->text)) goto memory_error;
        continue;
      }
      const size_t before = arguments.count;
      if (!expand_word_arguments(shell, &arguments, token)) goto memory_error;
      if (!command_seen && arguments.count != before) {
        command_seen = 1;
        command_index = before;
      }
      continue;
    }
    if (!token_is_redirection(token->kind)) {
      fputs("slop: invalid simple command\n", stderr); goto syntax_error;
    }
    if (token_is_file_redirection(token->kind) &&
        (++index >= end || tokens[index].kind != TOKEN_WORD)) {
      fputs("slop: redirection requires a path\n", stderr); goto syntax_error;
    }
  }
  trace_simple(shell, &arguments, tokens, start, end);
  if (!apply_command_redirections(shell, &redirections, tokens, start, end,
                                  pipeline_input, pipeline_output))
    goto command_error;
  size_t prefix = 0;
  while (prefix < arguments.count) {
    size_t ignored;
    if (!assignment(arguments.items[prefix], &ignored)) break;
    prefix++;
  }
  if (prefix == arguments.count) {
    for (size_t index = 0; index < prefix; index++) if (set_assignment(arguments.items[index]) < 0) goto command_error;
    arguments_dispose(&arguments);
    command_redirections_dispose(&redirections);
    return 0;
  }
  if (strcmp(arguments.items[prefix], "exec") == 0 &&
      prefix + 1 == arguments.count) {
    for (size_t index = 0; index < prefix; index++) {
      if (set_assignment(arguments.items[index]) < 0) goto command_error;
    }
    if (!command_redirections_commit(&redirections)) goto command_error;
    arguments_dispose(&arguments);
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
                                    arguments.items + prefix,
                                    redirections.streams[STDIN_FILENO],
                                    redirections.streams[STDOUT_FILENO],
                                    redirections.streams[STDERR_FILENO]);
  restore_environment_changes(changes, changed);
  free(changes);
  arguments_dispose(&arguments);
  command_redirections_dispose(&redirections);
  return status;
memory_error:
  fputs("slop: out of memory\n", stderr);
expansion_error:
command_error:
  arguments_dispose(&arguments);
  command_redirections_dispose(&redirections);
  return 1;
syntax_error:
  arguments_dispose(&arguments);
  command_redirections_dispose(&redirections);
  return 2;
}

static int run_simple(Shell *shell, Token *tokens, size_t start, size_t end,
                      int pipeline_input, int pipeline_output) {
  const size_t count = end - start;
  Token *copy = calloc(count == 0 ? 1 : count, sizeof(*copy));
  if (copy == NULL) {
    fputs("slop: out of memory\n", stderr);
    return 1;
  }
  for (size_t index = 0; index < count; index++) {
    copy[index].kind = tokens[start + index].kind;
    copy[index].quoted = tokens[start + index].quoted;
    copy[index].split = tokens[start + index].split;
    copy[index].positional_fields = tokens[start + index].positional_fields;
    copy[index].descriptor = tokens[start + index].descriptor;
    copy[index].target_descriptor = tokens[start + index].target_descriptor;
    if (tokens[start + index].text != NULL) {
      copy[index].text = strdup(tokens[start + index].text);
      if (copy[index].text == NULL) {
        for (size_t dispose = 0; dispose < index; dispose++) free(copy[dispose].text);
        free(copy);
        fputs("slop: out of memory\n", stderr);
        return 1;
      }
    }
  }
  const int status = run_simple_mutable(shell, copy, 0, count,
                                        pipeline_input, pipeline_output);
  for (size_t index = 0; index < count; index++) free(copy[index].text);
  free(copy);
  return status;
}

static int run_pipeline(Shell *shell, Token *tokens, size_t start, size_t end) {
  int invert = 0;
  if (start < end && tokens[start].kind == TOKEN_NOT) { invert = 1; start++; }
  if (start == end) { fputs("slop: expected a command\n", stderr); return 2; }
  int input = STDIN_FILENO, owned_input = -1, status = 0;
  int rightmost_failure = 0;
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
    if (status != 0) rightmost_failure = status;
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
  if (shell->pipefail && rightmost_failure != 0) status = rightmost_failure;
  return invert ? status == 0 : status;
}

enum {
  STOP_THEN = 1u << 0,
  STOP_ELIF = 1u << 1,
  STOP_ELSE = 1u << 2,
  STOP_FI = 1u << 3,
  STOP_DO = 1u << 4,
  STOP_DONE = 1u << 5,
  STOP_ESAC = 1u << 6,
  STOP_CASE_CLAUSE = 1u << 7,
  STOP_RBRACE = 1u << 8,
  STOP_RPAREN = 1u << 9,
};

typedef struct {
  Token *tokens;
  size_t cursor;
  size_t end;
  int error;
} CommandParser;

static unsigned stop_word(const Token *token) {
  if (token->kind == TOKEN_RPAREN) return STOP_RPAREN;
  if (token->kind != TOKEN_WORD || token->quoted) return 0;
  if (strcmp(token->text, "then") == 0) return STOP_THEN;
  if (strcmp(token->text, "elif") == 0) return STOP_ELIF;
  if (strcmp(token->text, "else") == 0) return STOP_ELSE;
  if (strcmp(token->text, "fi") == 0) return STOP_FI;
  if (strcmp(token->text, "do") == 0) return STOP_DO;
  if (strcmp(token->text, "done") == 0) return STOP_DONE;
  if (strcmp(token->text, "esac") == 0) return STOP_ESAC;
  if (strcmp(token->text, "}") == 0) return STOP_RBRACE;
  return 0;
}

static int command_word(const CommandParser *parser, const char *word) {
  return parser->cursor < parser->end &&
         parser->tokens[parser->cursor].kind == TOKEN_WORD &&
         !parser->tokens[parser->cursor].quoted &&
         strcmp(parser->tokens[parser->cursor].text, word) == 0;
}

static int execute_list(Shell *shell, CommandParser *parser, int execute,
                        int suppress_errexit, unsigned stops,
                        unsigned *stopped);
static int compound_redirection_end(const CommandParser *parser, size_t start,
                                    size_t *end);
static int apply_compound_redirections(Shell *shell, const Token *tokens,
                                       size_t start, size_t end,
                                       DescriptorState *descriptors,
                                       int pipeline_output);

static int function_header(const CommandParser *parser, char **name,
                           size_t *body_start) {
  *name = NULL;
  if (parser->cursor >= parser->end ||
      parser->tokens[parser->cursor].kind != TOKEN_WORD ||
      parser->tokens[parser->cursor].quoted) return 0;
  const char *first = parser->tokens[parser->cursor].text;
  const size_t length = strlen(first);
  size_t name_length = 0;
  size_t brace_index = 0;
  if (length > 2 && strcmp(first + length - 2, "()") == 0) {
    name_length = length - 2;
    brace_index = parser->cursor + 1;
  } else if (valid_name(first, length) && parser->cursor + 3 < parser->end &&
             parser->tokens[parser->cursor + 1].kind == TOKEN_LPAREN &&
             parser->tokens[parser->cursor + 2].kind == TOKEN_RPAREN) {
    name_length = length;
    brace_index = parser->cursor + 3;
  } else if (valid_name(first, length) && parser->cursor + 2 < parser->end &&
             parser->tokens[parser->cursor + 1].kind == TOKEN_WORD &&
             !parser->tokens[parser->cursor + 1].quoted &&
             strcmp(parser->tokens[parser->cursor + 1].text, "()") == 0) {
    name_length = length;
    brace_index = parser->cursor + 2;
  } else {
    return 0;
  }
  if (!valid_name(first, name_length) || brace_index >= parser->end ||
      parser->tokens[brace_index].kind != TOKEN_WORD ||
      parser->tokens[brace_index].quoted ||
      strcmp(parser->tokens[brace_index].text, "{") != 0) return 0;
  *name = strndup(first, name_length);
  if (*name == NULL) return -1;
  *body_start = brace_index + 1;
  return 1;
}

static int parse_group(Shell *shell, CommandParser *parser, int execute,
                       int suppress_errexit) {
  const size_t body_start = ++parser->cursor;
  CommandParser probe = {
      .tokens = parser->tokens,
      .cursor = body_start,
      .end = parser->end,
  };
  unsigned probe_stop = 0;
  (void)execute_list(shell, &probe, 0, 1, STOP_RBRACE, &probe_stop);
  if (probe.error || probe_stop != STOP_RBRACE) {
    fputs("slop: group requires }\n", stderr);
    parser->error = 1;
    return 2;
  }
  size_t command_end = probe.cursor + 1;
  if (!compound_redirection_end(parser, command_end, &command_end)) {
    parser->error = 1;
    return 2;
  }
  if (!execute) {
    parser->cursor = command_end;
    return 0;
  }

  DescriptorState descriptors = {0};
  if (!apply_compound_redirections(shell, parser->tokens, probe.cursor + 1,
                                   command_end, &descriptors,
                                   STDOUT_FILENO)) {
    descriptor_state_restore(&descriptors);
    fputs("slop: could not apply group redirection\n", stderr);
    parser->error = 1;
    return 2;
  }
  unsigned stopped = 0;
  const int status = execute_list(shell, parser, execute, suppress_errexit,
                                  STOP_RBRACE, &stopped);
  descriptor_state_restore(&descriptors);
  if (parser->error || stopped != STOP_RBRACE) {
    fputs("slop: group requires }\n", stderr);
    parser->error = 1;
    return 2;
  }
  parser->cursor = command_end;
  return status;
}

static int compound_redirection_end(const CommandParser *parser, size_t start,
                                    size_t *end) {
  size_t cursor = start;
  while (cursor < parser->end) {
    const TokenKind kind = parser->tokens[cursor].kind;
    if (kind == TOKEN_DUP_INPUT || kind == TOKEN_DUP_OUTPUT) {
      cursor++;
      continue;
    }
    if (!token_is_file_redirection(kind)) break;
    if (++cursor >= parser->end ||
        parser->tokens[cursor].kind != TOKEN_WORD) {
      fputs("slop: compound redirection requires a path\n", stderr);
      return 0;
    }
    cursor++;
  }
  *end = cursor;
  return 1;
}

static int apply_compound_redirections(Shell *shell, const Token *tokens,
                                       size_t start, size_t end,
                                       DescriptorState *descriptors,
                                       int pipeline_output) {
  TokenList copy = {0};
  if (!tokens_clone_range(tokens, start, end, &copy)) return 0;
  const size_t count = end - start;
  const int expansion_status = shell->last_status;
  const int dollars = expand_deferred_dollars(shell, copy.items, 0, count);
  shell->last_status = expansion_status;
  if (dollars <= 0 ||
      !expand_deferred_status(shell, copy.items, 0, count) ||
      !expand_tilde_words(copy.items, 0, count, 0)) {
    tokens_dispose(&copy);
    return 0;
  }
  if (!resolve_dynamic_descriptors(copy.items, 0, count)) {
    tokens_dispose(&copy);
    return 0;
  }
  if (!apply_descriptor_redirections(shell, descriptors, copy.items, 0, count,
                                     STDIN_FILENO, pipeline_output))
    goto redirection_error;
  tokens_dispose(&copy);
  return 1;

redirection_error:
  tokens_dispose(&copy);
  return 0;
}

static int parse_subshell(Shell *shell, CommandParser *parser, int execute,
                          int suppress_errexit) {
  const size_t body_start = ++parser->cursor;
  CommandParser probe = {
      .tokens = parser->tokens,
      .cursor = body_start,
      .end = parser->end,
  };
  unsigned probe_stop = 0;
  (void)execute_list(shell, &probe, 0, 1, STOP_RPAREN, &probe_stop);
  if (probe.error || probe_stop != STOP_RPAREN) {
    fputs("slop: subshell requires )\n", stderr);
    parser->error = 1;
    return 2;
  }
  size_t command_end = probe.cursor + 1;
  if (!compound_redirection_end(parser, command_end, &command_end)) {
    parser->error = 1;
    return 2;
  }
  size_t pipeline_end = command_end;
  if (pipeline_end < parser->end &&
      parser->tokens[pipeline_end].kind == TOKEN_PIPE) {
    for (;;) {
      const size_t stage_start = ++pipeline_end;
      while (pipeline_end < parser->end) {
        const TokenKind kind = parser->tokens[pipeline_end].kind;
        if (kind == TOKEN_PIPE || kind == TOKEN_SEMI || kind == TOKEN_AND ||
            kind == TOKEN_OR || kind == TOKEN_RPAREN) break;
        pipeline_end++;
      }
      if (stage_start == pipeline_end) {
        fputs("slop: pipeline requires commands on both sides\n", stderr);
        parser->error = 1;
        return 2;
      }
      if (pipeline_end >= parser->end ||
          parser->tokens[pipeline_end].kind != TOKEN_PIPE) break;
    }
  }
  if (!execute) {
    parser->cursor = pipeline_end;
    return 0;
  }

  DescriptorState descriptors = {0};
  int pipeline_output = -1;
  if (pipeline_end != command_end) {
    char path[] = "/tmp/slop-pipeline-XXXXXX";
    pipeline_output = mkstemp(path);
    if (pipeline_output >= 0) unlink(path);
  }
  if ((pipeline_end != command_end && pipeline_output < 0) ||
      !descriptor_state_save_all(&descriptors) ||
      !apply_compound_redirections(shell, parser->tokens, probe.cursor + 1,
                                   command_end, &descriptors,
                                   pipeline_output >= 0 ? pipeline_output
                                                        : STDOUT_FILENO)) {
    descriptor_state_restore(&descriptors);
    if (pipeline_output >= 0) close(pipeline_output);
    fputs("slop: could not apply subshell redirection\n", stderr);
    parser->error = 1;
    return 2;
  }
  ShellStateSnapshot state = {0};
  if (!shell_state_capture(&state)) {
    descriptor_state_restore(&descriptors);
    if (pipeline_output >= 0) close(pipeline_output);
    fputs("slop: subshell: could not capture shell state\n", stderr);
    parser->error = 1;
    return 2;
  }
  Shell nested = *shell;
  nested.argc = 0;
  nested.argv = NULL;
  nested.argv_array_owned = 0;
  nested.argv_strings_owned = 0;
  nested.active = 1;
  nested.exit_status = 0;
  nested.loop_depth = 0;
  nested.loop_control = LOOP_CONTROL_NONE;
  nested.loop_levels = 0;
  nested.function_depth = 0;
  nested.returning = 0;
  nested.return_status = 0;
  nested.local_frame = NULL;
  Functions nested_functions = {0};
  if (!shell_argv_clone(&nested, shell) ||
      !functions_clone(shell->functions, &nested_functions)) {
    shell_argv_dispose(&nested);
    functions_dispose(&nested_functions);
    shell_state_snapshot_dispose(&state);
    descriptor_state_restore(&descriptors);
    if (pipeline_output >= 0) close(pipeline_output);
    fputs("slop: subshell: out of memory\n", stderr);
    parser->error = 1;
    return 2;
  }
  nested.functions = &nested_functions;
  unsigned stopped = 0;
  const int status = execute_list(&nested, parser, 1, suppress_errexit,
                                  STOP_RPAREN, &stopped);
  functions_dispose(&nested_functions);
  shell_argv_dispose(&nested);
  descriptor_state_restore(&descriptors);
  const int restored = shell_state_restore(&state);
  shell_state_snapshot_dispose(&state);
  if (!restored) {
    if (pipeline_output >= 0) close(pipeline_output);
    fputs("slop: subshell: could not restore shell state\n", stderr);
    parser->error = 1;
    return 2;
  }
  if (parser->error || stopped != STOP_RPAREN) {
    if (pipeline_output >= 0) close(pipeline_output);
    fputs("slop: subshell requires )\n", stderr);
    parser->error = 1;
    return 2;
  }
  int pipeline_status = status;
  int rightmost_failure = status == 0 ? 0 : status;
  if (pipeline_output >= 0) {
    if (lseek(pipeline_output, 0, SEEK_SET) < 0) {
      close(pipeline_output);
      parser->error = 1;
      return 2;
    }
    int input = pipeline_output;
    size_t stage_start = command_end + 1;
    for (size_t cursor = stage_start; cursor <= pipeline_end; cursor++) {
      if (cursor != pipeline_end &&
          parser->tokens[cursor].kind != TOKEN_PIPE) continue;
      int output = STDOUT_FILENO;
      if (cursor != pipeline_end) {
        char path[] = "/tmp/slop-pipeline-XXXXXX";
        output = mkstemp(path);
        if (output >= 0) unlink(path);
        if (output < 0) {
          close(input);
          parser->error = 1;
          return 2;
        }
      }
      pipeline_status = run_simple(shell, parser->tokens, stage_start, cursor,
                                   input, output);
      close(input);
      if (pipeline_status != 0) rightmost_failure = pipeline_status;
      if (cursor != pipeline_end) {
        if (lseek(output, 0, SEEK_SET) < 0) {
          close(output);
          parser->error = 1;
          return 2;
        }
        input = output;
      }
      stage_start = cursor + 1;
      if (!shell->active) break;
    }
  }
  parser->cursor = pipeline_end;
  return shell->pipefail && rightmost_failure != 0
             ? rightmost_failure
             : pipeline_status;
}

static int parse_function_definition(Shell *shell, CommandParser *parser,
                                     int define, const char *name,
                                     size_t body_start) {
  CommandParser body = {
      .tokens = parser->tokens,
      .cursor = body_start,
      .end = parser->end,
  };
  unsigned stopped = 0;
  (void)execute_list(shell, &body, 0, 1, STOP_RBRACE, &stopped);
  if (body.error || stopped != STOP_RBRACE) {
    fprintf(stderr, "slop: function %s requires }\n", name);
    parser->error = 1;
    return 2;
  }
  if (define && !function_define(shell->functions, name, parser->tokens,
                                 body_start, body.cursor)) {
    fputs("slop: function definition: out of memory\n", stderr);
    parser->error = 1;
    return 2;
  }
  parser->cursor = body.cursor + 1;
  return 0;
}

static int expand_loop_words(Shell *shell, Token *tokens, size_t start,
                             size_t end, Arguments *values) {
  const int expansion_status = shell->last_status;
  for (size_t index = start; index < end; index++) {
    if (tokens[index].kind != TOKEN_WORD) {
      fputs("slop: invalid operator in for word list\n", stderr);
      return 0;
    }
    Token copy = {
        .kind = TOKEN_WORD,
        .text = strdup(tokens[index].text),
        .quoted = tokens[index].quoted,
        .split = tokens[index].split,
        .positional_fields = tokens[index].positional_fields,
    };
    if (copy.text == NULL) return 0;
    const int dollar_status = expand_deferred_dollars(shell, &copy, 0, 1);
    shell->last_status = expansion_status;
    if (dollar_status <= 0 || !expand_deferred_status(shell, &copy, 0, 1) ||
        !expand_tilde_words(&copy, 0, 1, 0) ||
        !expand_word_arguments(shell, values, &copy)) {
      free(copy.text);
      return 0;
    }
    free(copy.text);
  }
  return 1;
}

static int parse_for(Shell *shell, CommandParser *parser, int execute,
                     int suppress_errexit) {
  parser->cursor++;
  if (parser->cursor == parser->end ||
      parser->tokens[parser->cursor].kind != TOKEN_WORD ||
      parser->tokens[parser->cursor].quoted ||
      !valid_name(parser->tokens[parser->cursor].text,
                  strlen(parser->tokens[parser->cursor].text))) {
    fputs("slop: for requires a variable name\n", stderr);
    parser->error = 1;
    return 2;
  }
  char *variable = strdup(parser->tokens[parser->cursor++].text);
  if (variable == NULL) {
    fputs("slop: out of memory\n", stderr);
    parser->error = 1;
    return 2;
  }

  Arguments values = {0};
  if (command_word(parser, "in")) {
    parser->cursor++;
    const size_t words_start = parser->cursor;
    while (parser->cursor < parser->end &&
           parser->tokens[parser->cursor].kind != TOKEN_SEMI) {
      parser->cursor++;
    }
    if (execute && !expand_loop_words(shell, parser->tokens, words_start,
                                      parser->cursor, &values)) {
      fputs("slop: could not expand for word list\n", stderr);
      arguments_dispose(&values);
      free(variable);
      parser->error = 1;
      return 2;
    }
  } else if (execute) {
    for (int index = 1; index < shell->argc; index++) {
      if (!argument_push(&values, shell->argv[index])) {
        fputs("slop: out of memory\n", stderr);
        arguments_dispose(&values);
        free(variable);
        parser->error = 1;
        return 2;
      }
    }
  }

  if (parser->cursor == parser->end ||
      parser->tokens[parser->cursor].kind != TOKEN_SEMI) {
    fputs("slop: for word list requires a separator before do\n", stderr);
    goto syntax_error;
  }
  while (parser->cursor < parser->end &&
         parser->tokens[parser->cursor].kind == TOKEN_SEMI) parser->cursor++;
  if (!command_word(parser, "do")) {
    fputs("slop: for requires do\n", stderr);
    goto syntax_error;
  }
  parser->cursor++;

  const size_t body_start = parser->cursor;
  size_t body_end = body_start;
  int status = 0;
  const size_t iterations = execute ? values.count : 0;
  const size_t passes = iterations == 0 ? 1 : iterations;
  if (execute) shell->loop_depth++;
  for (size_t iteration_index = 0; iteration_index < passes; iteration_index++) {
    CommandParser iteration = {
        .tokens = parser->tokens,
        .cursor = body_start,
        .end = parser->end,
    };
    unsigned stopped = 0;
    int run = execute && iteration_index < iterations;
    if (run && setenv(variable, values.items[iteration_index], 1) != 0) {
      fprintf(stderr, "slop: for: %s\n", strerror(errno));
      status = 1;
      run = 0;
    }
    const int body_status = execute_list(shell, &iteration, run,
                                         suppress_errexit,
                                         STOP_DONE, &stopped);
    if (run) status = body_status;
    if (iteration.error || stopped != STOP_DONE) {
      fputs("slop: for requires done\n", stderr);
      if (execute) shell->loop_depth--;
      arguments_dispose(&values);
      free(variable);
      parser->error = 1;
      return 2;
    }
    body_end = iteration.cursor;
    if (run && shell->loop_control != LOOP_CONTROL_NONE) {
      const int control = shell->loop_control;
      if (shell->loop_levels > 1) {
        shell->loop_levels--;
        break;
      }
      shell->loop_control = LOOP_CONTROL_NONE;
      shell->loop_levels = 0;
      if (control == LOOP_CONTROL_BREAK) break;
      continue;
    }
    if (!shell->active || (run && shell->errexit && !suppress_errexit &&
                           status != 0)) break;
  }
  if (execute) shell->loop_depth--;
  parser->cursor = body_end + 1;
  arguments_dispose(&values);
  free(variable);
  return iterations == 0 ? 0 : status;

syntax_error:
  arguments_dispose(&values);
  free(variable);
  parser->error = 1;
  return 2;
}

static int parse_while(Shell *shell, CommandParser *parser, int execute,
                       int suppress_errexit, int until) {
  parser->cursor++;
  const size_t condition_start = parser->cursor;
  size_t body_end = condition_start;
  int body_status = 0;

  if (execute) shell->loop_depth++;
  for (;;) {
    CommandParser condition = {
        .tokens = parser->tokens,
        .cursor = condition_start,
        .end = parser->end,
    };
    unsigned stopped = 0;
    const int condition_status = execute_list(shell, &condition, execute, 1,
                                              STOP_DO, &stopped);
    if (condition.error || stopped != STOP_DO) {
      fprintf(stderr, "slop: %s requires do\n", until ? "until" : "while");
      if (execute) shell->loop_depth--;
      parser->error = 1;
      return 2;
    }
    const size_t body_start = condition.cursor + 1;
    const int selected = execute && shell->active &&
                         (until ? condition_status != 0
                                : condition_status == 0);
    CommandParser body = {
        .tokens = parser->tokens,
        .cursor = body_start,
        .end = parser->end,
    };
    const int iteration_status = execute_list(shell, &body, selected,
                                              suppress_errexit,
                                              STOP_DONE, &stopped);
    if (body.error || stopped != STOP_DONE) {
      fprintf(stderr, "slop: %s requires done\n", until ? "until" : "while");
      if (execute) shell->loop_depth--;
      parser->error = 1;
      return 2;
    }
    body_end = body.cursor;
    if (execute && shell->loop_control != LOOP_CONTROL_NONE) {
      const int control = shell->loop_control;
      if (shell->loop_levels > 1) {
        shell->loop_levels--;
        break;
      }
      shell->loop_control = LOOP_CONTROL_NONE;
      shell->loop_levels = 0;
      if (control == LOOP_CONTROL_BREAK) break;
      continue;
    }
    if (!selected) break;
    body_status = iteration_status;
    if (!shell->active || (shell->errexit && !suppress_errexit &&
                           body_status != 0)) break;
  }
  if (execute) shell->loop_depth--;
  parser->cursor = body_end + 1;
  return body_status;
}

static char *expand_case_text(Shell *shell, const Token *token,
                              size_t start, size_t length) {
  Token copy = {
      .kind = TOKEN_WORD,
      .text = strndup(token->text + start, length),
      .quoted = token->quoted,
  };
  if (copy.text == NULL) return NULL;
  const int expansion_status = shell->last_status;
  const int dollar_status = expand_deferred_dollars(shell, &copy, 0, 1);
  shell->last_status = expansion_status;
  if (dollar_status <= 0 || !expand_deferred_status(shell, &copy, 0, 1) ||
      !expand_tilde_words(&copy, 0, 1, 0)) {
    free(copy.text);
    return NULL;
  }
  return copy.text;
}

static int parse_case(Shell *shell, CommandParser *parser, int execute,
                      int suppress_errexit) {
  parser->cursor++;
  if (parser->cursor == parser->end ||
      parser->tokens[parser->cursor].kind != TOKEN_WORD) {
    fputs("slop: case requires a word\n", stderr);
    parser->error = 1;
    return 2;
  }
  char *value = execute
      ? expand_case_text(shell, &parser->tokens[parser->cursor], 0,
                         strlen(parser->tokens[parser->cursor].text))
      : NULL;
  if (execute && value == NULL) {
    fputs("slop: could not expand case word\n", stderr);
    parser->error = 1;
    return 2;
  }
  parser->cursor++;
  if (!command_word(parser, "in")) {
    fputs("slop: case requires in\n", stderr);
    free(value);
    parser->error = 1;
    return 2;
  }
  parser->cursor++;

  int matched = 0;
  int status = 0;
  while (parser->cursor < parser->end) {
    while (parser->cursor < parser->end &&
           parser->tokens[parser->cursor].kind == TOKEN_SEMI) parser->cursor++;
    if (command_word(parser, "esac")) {
      parser->cursor++;
      free(value);
      return status;
    }

    int clause_match = 0;
    int closed = 0;
    int need_pattern = 1;
    while (parser->cursor < parser->end) {
      Token *token = &parser->tokens[parser->cursor];
      if (token->kind == TOKEN_PIPE) {
        if (need_pattern) break;
        need_pattern = 1;
        parser->cursor++;
        continue;
      }
      if (token->kind == TOKEN_LPAREN && need_pattern) {
        parser->cursor++;
        continue;
      }
      if (token->kind == TOKEN_RPAREN && !need_pattern) {
        parser->cursor++;
        closed = 1;
        break;
      }
      if (token->kind != TOKEN_WORD || !need_pattern) break;
      if (execute) {
        char *pattern = expand_case_text(shell, token, 0, strlen(token->text));
        if (pattern == NULL) {
          fputs("slop: could not expand case pattern\n", stderr);
          free(value);
          parser->error = 1;
          return 2;
        }
        if (token->quoted ? strcmp(pattern, value) == 0
                          : wildcard_match(pattern, value)) clause_match = 1;
        free(pattern);
      }
      parser->cursor++;
      need_pattern = 0;
      if (closed) break;
    }
    if (!closed || need_pattern) {
      fputs("slop: case pattern requires )\n", stderr);
      free(value);
      parser->error = 1;
      return 2;
    }

    unsigned stopped = 0;
    const int selected = execute && !matched && clause_match;
    const int clause_status = execute_list(shell, parser, selected,
                                           suppress_errexit,
                                           STOP_CASE_CLAUSE | STOP_ESAC,
                                           &stopped);
    if (parser->error || stopped == 0) {
      fputs("slop: case requires ;; or esac\n", stderr);
      free(value);
      parser->error = 1;
      return 2;
    }
    if (selected) {
      matched = 1;
      status = clause_status;
    }
    if (stopped == STOP_ESAC) {
      parser->cursor++;
      free(value);
      return status;
    }
    parser->cursor++;
  }
  fputs("slop: case requires esac\n", stderr);
  free(value);
  parser->error = 1;
  return 2;
}

static int parse_if_branch(Shell *shell, CommandParser *parser, int execute,
                           int suppress_errexit) {
  unsigned stopped = 0;
  const int condition = execute_list(shell, parser, execute, 1,
                                     STOP_THEN, &stopped);
  if (parser->error || stopped != STOP_THEN) {
    fputs("slop: if requires then\n", stderr);
    parser->error = 1;
    return 2;
  }
  parser->cursor++;

  const int selected = execute && condition == 0;
  const int body_status = execute_list(shell, parser, selected,
                                       suppress_errexit,
                                       STOP_ELIF | STOP_ELSE | STOP_FI,
                                       &stopped);
  if (parser->error || stopped == 0) {
    fputs("slop: if requires fi\n", stderr);
    parser->error = 1;
    return 2;
  }

  if (stopped == STOP_ELIF) {
    parser->cursor++;
    const int alternate_status = parse_if_branch(shell, parser,
                                                  execute && !selected,
                                                  suppress_errexit);
    return selected ? body_status : alternate_status;
  }
  if (stopped == STOP_ELSE) {
    parser->cursor++;
    unsigned final_stop = 0;
    const int alternate_status = execute_list(shell, parser,
                                               execute && !selected,
                                               suppress_errexit,
                                               STOP_FI, &final_stop);
    if (parser->error || final_stop != STOP_FI) {
      fputs("slop: else requires fi\n", stderr);
      parser->error = 1;
      return 2;
    }
    parser->cursor++;
    return selected ? body_status : alternate_status;
  }

  parser->cursor++;
  return selected ? body_status : 0;
}

static int parse_if(Shell *shell, CommandParser *parser, int execute,
                    int suppress_errexit) {
  parser->cursor++;
  return parse_if_branch(shell, parser, execute, suppress_errexit);
}

static int execute_list(Shell *shell, CommandParser *parser, int execute,
                        int suppress_errexit, unsigned stops,
                        unsigned *stopped) {
  int status = shell->last_status;
  TokenKind previous = TOKEN_SEMI;
  int aborted = 0;
  *stopped = 0;

  while (parser->cursor < parser->end) {
    while (parser->cursor < parser->end &&
           parser->tokens[parser->cursor].kind == TOKEN_SEMI) {
      parser->cursor++;
      previous = TOKEN_SEMI;
    }
    if (parser->cursor == parser->end) break;
    if ((stops & STOP_CASE_CLAUSE) != 0 &&
        parser->tokens[parser->cursor].kind == TOKEN_CASE_END) {
      *stopped = STOP_CASE_CLAUSE;
      break;
    }
    const unsigned found_stop = stop_word(&parser->tokens[parser->cursor]);
    if ((found_stop & stops) != 0) {
      *stopped = found_stop;
      break;
    }

    const int should_run = execute && !aborted &&
        shell->loop_control == LOOP_CONTROL_NONE && !shell->returning &&
        (previous == TOKEN_SEMI ||
         (previous == TOKEN_AND && status == 0) ||
         (previous == TOKEN_OR && status != 0));
    char *function_name = NULL;
    size_t function_body_start = 0;
    const int definition = function_header(parser, &function_name,
                                           &function_body_start);
    if (definition < 0) {
      fputs("slop: function definition: out of memory\n", stderr);
      parser->error = 1;
      return 2;
    }
    const int invert_subshell = parser->tokens[parser->cursor].kind == TOKEN_NOT &&
        parser->cursor + 1 < parser->end &&
        parser->tokens[parser->cursor + 1].kind == TOKEN_LPAREN;
    if (invert_subshell) {
      parser->cursor++;
      const int result = parse_subshell(shell, parser, should_run, 1);
      if (parser->error) return 2;
      if (should_run) status = result == 0;
    } else if (definition > 0) {
      const int result = parse_function_definition(shell, parser, should_run,
                                                   function_name,
                                                   function_body_start);
      free(function_name);
      if (parser->error) return 2;
      if (should_run) status = result;
    } else if (command_word(parser, "{")) {
      const int result = parse_group(shell, parser, should_run,
                                     suppress_errexit);
      if (parser->error) return 2;
      if (should_run) status = result;
    } else if (parser->tokens[parser->cursor].kind == TOKEN_LPAREN) {
      const int result = parse_subshell(shell, parser, should_run,
                                       suppress_errexit);
      if (parser->error) return 2;
      if (should_run) status = result;
    } else if (command_word(parser, "if")) {
      const int result = parse_if(shell, parser, should_run, suppress_errexit);
      if (parser->error) return 2;
      if (should_run) status = result;
    } else if (command_word(parser, "for")) {
      const int result = parse_for(shell, parser, should_run, suppress_errexit);
      if (parser->error) return 2;
      if (should_run) status = result;
    } else if (command_word(parser, "while") || command_word(parser, "until")) {
      const int until = command_word(parser, "until");
      const int result = parse_while(shell, parser, should_run,
                                     suppress_errexit, until);
      if (parser->error) return 2;
      if (should_run) status = result;
    } else if (command_word(parser, "case")) {
      const int result = parse_case(shell, parser, should_run,
                                    suppress_errexit);
      if (parser->error) return 2;
      if (should_run) status = result;
    } else {
      const size_t start = parser->cursor;
      while (parser->cursor < parser->end) {
        const TokenKind kind = parser->tokens[parser->cursor].kind;
        if (kind == TOKEN_SEMI || kind == TOKEN_CASE_END ||
            kind == TOKEN_AND || kind == TOKEN_OR) break;
        if (kind == TOKEN_RPAREN && (stops & STOP_RPAREN) != 0) break;
        parser->cursor++;
      }
      if (start == parser->cursor) {
        fputs("slop: missing command around conditional operator\n", stderr);
        parser->error = 1;
        return 2;
      }
      if (should_run) {
        status = run_pipeline(shell, parser->tokens, start, parser->cursor);
      }
    }

    if (should_run) {
      shell->last_status = status;
      if (!shell->active) {
        status = shell->exit_status;
        aborted = 1;
      }
      if (shell->loop_control != LOOP_CONTROL_NONE) aborted = 1;
      if (shell->returning) aborted = 1;
    }

    TokenKind separator = TOKEN_END;
    if (parser->cursor < parser->end) {
      separator = parser->tokens[parser->cursor].kind;
      if ((stops & STOP_CASE_CLAUSE) != 0 &&
          separator == TOKEN_CASE_END) {
        *stopped = STOP_CASE_CLAUSE;
        if (should_run && shell->errexit && !suppress_errexit && status != 0) {
          aborted = 1;
        }
        break;
      }
      if (separator == TOKEN_AND || separator == TOKEN_OR ||
          separator == TOKEN_SEMI) {
        parser->cursor++;
      } else {
        const unsigned next_stop = stop_word(&parser->tokens[parser->cursor]);
        if ((next_stop & stops) == 0) {
          fputs("slop: expected a command separator\n", stderr);
          parser->error = 1;
          return 2;
        }
      }
    }
    if (should_run && shell->errexit && !suppress_errexit && status != 0 &&
        separator != TOKEN_AND && separator != TOKEN_OR) {
      aborted = 1;
    }
    previous = separator;
  }
  return status;
}

static int execute_tokens(Shell *shell, TokenList *list) {
  CommandParser parser = {
      .tokens = list->items,
      .cursor = 0,
      .end = list->count == 0 ? 0 : list->count - 1,
  };
  unsigned stopped = 0;
  const int status = execute_list(shell, &parser, !shell->noexec, 0, 0,
                                  &stopped);
  if (parser.error) return 2;
  if (stopped != 0 || parser.cursor != parser.end) {
    fputs("slop: unexpected conditional keyword\n", stderr);
    return 2;
  }
  return status;
}

static int execute_text(Shell *shell, const char *text) {
  TokenList tokens = {0};
  if (!lex(text, &tokens)) { tokens_dispose(&tokens); return 2; }
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
      redraw_line(line, length, cursor);
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
  if (setenv("PWD", "/workspace", 1) != 0) {
    fprintf(stderr, "slop: PWD: %s\n", strerror(errno));
    return 1;
  }
  if (getenv("HISTFILE") == NULL &&
      setenv("HISTFILE", "/home/dolly/.slop_history", 0) != 0) {
    fprintf(stderr, "slop: HISTFILE: %s\n", strerror(errno));
    return 1;
  }
  shell->interactive = 1;
  shell->active = 1;
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
    int report_status = 1;
    if (result == EDITOR_INTERRUPTED) shell->last_status = 130;
    else {
      history_add(&history, line);
      // An empty interactive line is not a new command. Preserve $? as POSIX
      // shells do, but do not report that inherited failure again. Otherwise
      // every Enter after an interrupted program repeats "slop: status 130".
      report_status = !line_is_blank(line);
      shell->last_status = execute_text(shell, line);
    }
    if (report_status && shell->last_status != 0 &&
        shell->last_status != 127 && shell->active)
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
  fputs("usage: slop [-enx] [-c COMMAND [NAME [ARG ...]] | FILE [ARG ...]]\n",
        stream);
}

int main(int argc, char **argv) {
  Functions functions = {0};
  Shell shell = {
      .active = 1,
      .functions = &functions,
      .argc = argc,
      .argv = argv,
  };
  int index = 1;
  if (index < argc && strcmp(argv[index], "--help") == 0) { usage(stdout); return 0; }
  while (index < argc && argv[index][0] == '-' && argv[index][1] != '\0' &&
         strcmp(argv[index], "-c") != 0) {
    if (strcmp(argv[index], "--") == 0) {
      index++;
      break;
    }
    for (size_t option = 1; argv[index][option] != '\0'; option++) {
      if (argv[index][option] == 'e') shell.errexit = 1;
      else if (argv[index][option] == 'n') shell.noexec = 1;
      else if (argv[index][option] == 'x') shell.xtrace = 1;
      else {
        fprintf(stderr, "slop: unsupported option: -%c\n",
                argv[index][option]);
        return 2;
      }
    }
    index++;
  }
  if (index == argc) {
    const int status = interactive(&shell);
    shell_argv_dispose(&shell);
    functions_dispose(&functions);
    return status;
  }
  if (strcmp(argv[index], "-c") == 0) {
    if (++index == argc) { usage(stderr); return 2; }
    const char *command = argv[index++];
    char *default_parameters[] = {"slop", NULL};
    shell.argc = index < argc ? argc - index : 1;
    shell.argv = index < argc ? argv + index : default_parameters;
    int status = execute_text(&shell, command);
    const int result = shell.active ? status : shell.exit_status;
    shell_argv_dispose(&shell);
    functions_dispose(&functions);
    return result;
  }
  if (argv[index][0] == '-') { fprintf(stderr, "slop: unsupported option: %s\n", argv[index]); return 2; }
  char *source = read_script(argv[index]);
  if (source == NULL) return 1;
  shell.argc = argc - index;
  shell.argv = argv + index;
  int status = execute_text(&shell, source);
  free(source);
  const int result = shell.active ? status : shell.exit_status;
  shell_argv_dispose(&shell);
  functions_dispose(&functions);
  return result;
}
