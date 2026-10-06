#define _POSIX_C_SOURCE 200809L
#define _XOPEN_SOURCE 700

#include <ctype.h>
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <fnmatch.h>
#include <limits.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#include <dolly/runtime.h>

#define SLOP_MAX_LINE 65536
#define SLOP_MAX_HISTORY 1000
#define SLOP_MAX_HEREDOCS 32
#define SLOP_DEFERRED_DOLLAR ((char)0x1d)
#define SLOP_DYNAMIC_DESCRIPTOR (-2)
#define SLOP_BOTH_OUTPUTS (-3)

typedef enum {
  TOKEN_WORD,
  TOKEN_SEMI,
  TOKEN_CASE_END,
  TOKEN_AND,
  TOKEN_OR,
  TOKEN_PIPE,
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
  char *quote_mask;
  int quoted;
  int split;
  int positional_fields;
  int newline;
  int line; // Where the token starts in its text, from 1.
  int background; // A `;` written as `&`.
  int descriptor;
  int target_descriptor;
  int strip_tabs;
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
  int destination;
  int saved;
  int was_open;
} DescriptorBackup;
typedef struct {
  DescriptorBackup items[10];
  size_t count;
} DescriptorState;

// How a pipeline or `&` wants its simple command run. A program is started
// and not waited for, and writes to a kernel pipe. Anything else runs in the
// shell: it writes to a spool file, and `&` refuses it.
typedef struct {
  int piped;      // In: a later stage reads this stage's output.
  int background; // In: started with `&`.
  int first;      // In: no earlier stage feeds its input.
  int output;     // Out: where the next stage reads, or -1.
  int spooled;    // Out: `output` is a spool file to rewind.
  pid_t pid;      // Out: the program that was started and not waited for.
} Stage;

typedef struct {
  int interactive;
  int active;
  int last_status;
  int substitution_status;
  int exit_status;
  int terminating_signal;
  int errexit;
  // Set while running a condition, a `!` pipeline or a command of an AND-OR
  // list other than the last, including the functions such a command calls.
  int errexit_ignored;
  // The last pipeline ran while `set -e` was ignored: a compound command that
  // ends with its status is exempt too (POSIX `set -e`, third exception).
  int errexit_exempt;
  int errexit_fired; // `set -e` ended this shell; the prompt survives it.
  int xtrace;
  int nounset;
  int noexec;
  int pipefail;
  int loop_depth;
  int loop_control;
  unsigned loop_levels;
  int function_depth;
  int source_depth;
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
  // Originals of descriptors changed by `exec`; NULL makes them permanent.
  DescriptorState *descriptors;
  // `trap` actions by condition: 0 is EXIT, the others are signal numbers.
  char *traps[SIGTERM + 1];
  // Set only while a stage's simple command starts its program.
  Stage *stage;
  pid_t last_background; // `$!`; 0 while unset.
  // `$LINENO`: the line of the command being run, and the line before the
  // first one of the text being run (an `eval` or substitution continues the
  // numbering of its command).
  int lineno;
  int line_base;
} Shell;

enum {
  LOOP_CONTROL_NONE,
  LOOP_CONTROL_BREAK,
  LOOP_CONTROL_CONTINUE,
};

typedef struct { char *name; char *old_value; int existed; int exported; } EnvironmentChange;
struct LocalFrame {
  EnvironmentChange *changes;
  size_t count;
  size_t capacity;
};
typedef struct {
  Arguments environment;
  Arguments exported;
  int cwd;
} ShellStateSnapshot;

extern char **environ;

// Programs started with `&` that `wait` has not collected. The kernel runs
// at most 32 processes.
static pid_t background_programs[32];
static size_t background_count;

// Signals that arrived for a `trap` action, one bit each.
static volatile sig_atomic_t trapped_signals;

// A signal ends this shell unless it has a `trap` action, which then runs
// once the current command has finished.
static void interrupt_shell(Shell *shell, int signal_number) {
  if (signal_number == 0) return;
  if (shell->traps[signal_number] != NULL) {
    trapped_signals |= 1 << signal_number;
    return;
  }
  shell->terminating_signal = signal_number;
  shell->active = 0;
  shell->exit_status = 128 + signal_number;
}

// The interactive shell survives Ctrl+C: its SIGINT handler only records it.
static volatile sig_atomic_t interrupt_requested;

static void request_interrupt(int signal_number) {
  if (signal_number == SIGINT) interrupt_requested = 1;
  else trapped_signals |= 1 << signal_number;
}

// A loop of builtins may make no system call that would deliver SIGINT, so
// the shell also polls for it. A poll costs about a quarter of a builtin, so
// only every 64th command polls; the shell stops with status 130.
static void poll_interrupt(Shell *shell) {
  static unsigned commands;
  if (++commands % 64 == 0 && dolly_interrupt_poll() == SIGINT) interrupt_requested = 1;
  if (!interrupt_requested) return;
  interrupt_requested = 0;
  interrupt_shell(shell, SIGINT);
}

static int execute_text(Shell *shell, const char *text);
static int execute_tokens(Shell *shell, TokenList *list);

static void run_trap(Shell *shell, int condition) {
  char *action = strdup(shell->traps[condition]);
  if (action == NULL) return;
  const int status = shell->last_status;
  (void)execute_text(shell, action);
  shell->last_status = status;
  free(action);
}

// Runs the action of every trapped signal that arrived. A handler stays
// installed once a trap was set, so without an action the signal ends the shell.
static void run_traps(Shell *shell) {
  while (trapped_signals != 0 && shell->active && !shell->returning &&
         shell->loop_control == LOOP_CONTROL_NONE) {
    const int number = __builtin_ctz((unsigned)trapped_signals);
    trapped_signals &= ~(1 << number);
    if (shell->traps[number] == NULL) interrupt_shell(shell, number);
    else run_trap(shell, number);
  }
}

// Runs the EXIT action as the shell leaves; `exit` inside it sets the status.
static int leave_shell(Shell *shell, int status) {
  if (shell->traps[0] != NULL) {
    shell->active = 1;
    shell->returning = 0;
    shell->loop_control = LOOP_CONTROL_NONE;
    shell->last_status = status;
    char *action = shell->traps[0];
    shell->traps[0] = NULL;
    (void)execute_text(shell, action);
    free(action);
    if (!shell->active) status = shell->exit_status;
  }
  for (size_t index = 0; index < sizeof(shell->traps) / sizeof(shell->traps[0]); index++) {
    free(shell->traps[index]);
    shell->traps[index] = NULL;
  }
  return status;
}
static char *read_script(const char *path);
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
  for (size_t index = 0; index < tokens->count; index++) {
    free(tokens->items[index].text);
    free(tokens->items[index].quote_mask);
  }
  free(tokens->items);
  memset(tokens, 0, sizeof(*tokens));
}

// The line the lexer is on; token_push records it.
static int lex_line;

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
      .line = lex_line,
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
    if (tokens[index].quote_mask) {
      copy->items[copy->count - 1].quote_mask = strdup(tokens[index].quote_mask);
      if (!copy->items[copy->count - 1].quote_mask) {
        tokens_dispose(copy);
        return 0;
      }
    }
    copy->items[copy->count - 1].newline = tokens[index].newline;
    copy->items[copy->count - 1].line = tokens[index].line;
    copy->items[copy->count - 1].background = tokens[index].background;
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
  if (!grow((void **)&arguments->items, &arguments->capacity,
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

static int is_special_parameter(char byte) {
  return byte != '\0' && strchr("?$#@*-!", byte) != NULL;
}

static int valid_name(const char *text, size_t length) {
  if (length == 0 || !is_name_start(text[0])) return 0;
  for (size_t index = 1; index < length; index++) if (!is_name_byte(text[index])) return 0;
  return 1;
}

static const char *parameter_value(Shell *shell, const char *name,
                                   size_t length, char temporary[64], int *is_set) {
  if (is_set) *is_set = 1;
  if (length == 1 && name[0] == '?') {
    snprintf(temporary, 64, "%d", shell->last_status);
    return temporary;
  }
  if (length == 1 && name[0] == '$') {
    snprintf(temporary, 64, "%ld", (long)getpid());
    return temporary;
  }
  if (length == 1 && name[0] == '!') {
    if (is_set) *is_set = shell->last_background != 0;
    if (shell->last_background == 0) return "";
    snprintf(temporary, 64, "%ld", (long)shell->last_background);
    return temporary;
  }
  if (length == 1 && name[0] == '#') {
    snprintf(temporary, 64, "%d", shell->argc > 0 ? shell->argc - 1 : 0);
    return temporary;
  }
  if (length == 6 && memcmp(name, "LINENO", 6) == 0) {
    snprintf(temporary, 64, "%d", shell->lineno);
    return temporary;
  }
  if (length == 1 && name[0] == '-') {
    size_t index = 0;
    if (shell->errexit) temporary[index++] = 'e';
    if (shell->interactive) temporary[index++] = 'i';
    if (shell->noexec) temporary[index++] = 'n';
    if (shell->nounset) temporary[index++] = 'u';
    if (shell->xtrace) temporary[index++] = 'x';
    temporary[index] = '\0';
    return temporary;
  }
  if (length && isdigit((unsigned char)name[0])) {
    size_t index = 0;
    for (size_t digit = 0; digit < length; digit++) {
      if (!isdigit((unsigned char)name[digit])) return "";
      if (index <= (size_t)shell->argc)
        index = index * 10 + (unsigned)(name[digit] - '0');
    }
    if (is_set) *is_set = index < (size_t)shell->argc;
    return index < (size_t)shell->argc ? shell->argv[index] : "";
  }
  if (!valid_name(name, length)) return "";
  char *copy = strndup(name, length);
  if (copy == NULL) return NULL;
  const char *value = getenv(copy);
  free(copy);
  if (is_set) *is_set = value != NULL;
  return value == NULL ? "" : value;
}

static const char *parameter_name_end(const char *name) {
  const char *end = name;
  if (is_name_start(*end)) {
    while (is_name_byte(*end)) end++;
  } else if (isdigit((unsigned char)*end)) {
    while (isdigit((unsigned char)*end)) end++;
  } else if (is_special_parameter(*end)) {
    end++;
  }
  return end;
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

// While expand_dollars expands a word, the text it is building and the mask
// beside it: a quoted part of ${NAME-word} stays quoted in the result.
static Buffer *expanding_text, *expanding_mask;
static char expanding_protection;

// Marks what `output` gained since the mask was last filled.
static int mark_expanded(const Buffer *output, char protection) {
  if (output != expanding_text) return 1;
  while (expanding_mask->length < output->length)
    if (!buffer_character(expanding_mask, protection)) return 0;
  return 1;
}

// Set by a caller whose word is a pattern (${NAME%word}): what the word
// quotes must then match itself, so it is escaped for fnmatch.
static int expanding_pattern;

// Escapes the pattern characters `output` gained since `from`.
static int pattern_literal(Buffer *output, size_t from) {
  char *tail = strndup(output->data == NULL ? "" : output->data + from, output->length - from);
  if (tail == NULL) return 0;
  output->length = from;
  int ok = 1;
  for (const char *byte = tail; ok && *byte != '\0'; byte++) {
    if (strchr("\\*?[", *byte) != NULL) ok = buffer_character(output, '\\');
    if (ok) ok = buffer_character(output, *byte);
  }
  free(tail);
  return ok;
}

static int expand_parameter_word(Shell *shell, const char *source,
                                 size_t length, Buffer *output) {
  const char *end = source + length;
  char quote = '\0';
  // Only this word is the pattern, not the words of what it expands.
  const int pattern = expanding_pattern;
  expanding_pattern = 0;
  while (source < end) {
    const size_t before = output->length;
    if (*source == '\\' && quote != '\'' && source + 1 < end) {
      source++;
      if (!buffer_character(output, *source++) ||
          (pattern && !pattern_literal(output, before))) return 0;
      continue;
    }
    if (*source == '\'' || *source == '"') {
      if (quote == '\0') {
        if (!mark_expanded(output, expanding_protection)) return 0;
        quote = *source++;
        continue;
      }
      if (quote == *source) {
        if (!mark_expanded(output, 'q')) return 0;
        quote = '\0';
        source++;
        continue;
      }
    }
    if (*source == '$' && quote != '\'') {
      const char *cursor = source;
      if (expand_dollar_now(shell, &cursor, output) < 0 || cursor > end ||
          (pattern && quote != '\0' && !pattern_literal(output, before))) return 0;
      source = cursor;
      continue;
    }
    if (!buffer_character(output, *source++) ||
        (pattern && quote != '\0' && !pattern_literal(output, before))) return 0;
  }
  return quote == '\0';
}

// Every shell variable lives in `environ`; only these names reach children.
static Arguments exported_names;

static size_t exported_index(const char *name, size_t length) {
  for (size_t index = 0; index < exported_names.count; index++) {
    if (strlen(exported_names.items[index]) == length &&
        memcmp(exported_names.items[index], name, length) == 0) return index;
  }
  return SIZE_MAX;
}

static int export_variable(const char *name) {
  return exported_index(name, strlen(name)) != SIZE_MAX ||
         argument_push(&exported_names, name);
}

static void unexport_variable(const char *name) {
  const size_t index = exported_index(name, strlen(name));
  if (index == SIZE_MAX) return;
  free(exported_names.items[index]);
  exported_names.items[index] = exported_names.items[--exported_names.count];
  exported_names.items[exported_names.count] = NULL;
}

// Borrowed pointers into `environ`; valid until the next variable change.
static char **exported_environment(void) {
  size_t count = 0;
  for (char **entry = environ; entry != NULL && *entry != NULL; entry++) count++;
  char **result = calloc(count + 1, sizeof(*result));
  if (result == NULL) return NULL;
  size_t used = 0;
  for (char **entry = environ; entry != NULL && *entry != NULL; entry++) {
    const char *equals = strchr(*entry, '=');
    if (equals != NULL &&
        exported_index(*entry, (size_t)(equals - *entry)) != SIZE_MAX)
      result[used++] = *entry;
  }
  return result;
}

static int arguments_copy(const Arguments *source, Arguments *copy) {
  for (size_t index = 0; index < source->count; index++) {
    if (!argument_push(copy, source->items[index])) {
      arguments_dispose(copy);
      return 0;
    }
  }
  return 1;
}

// Internal descriptors stay above the 0-9 user range and out of children.
static int high_descriptor(int descriptor) {
  if (descriptor < 0) return -1;
  const int moved = fcntl(descriptor, F_DUPFD_CLOEXEC, 10);
  close(descriptor);
  return moved;
}

static void shell_state_snapshot_dispose(ShellStateSnapshot *snapshot) {
  arguments_dispose(&snapshot->environment);
  arguments_dispose(&snapshot->exported);
  if (snapshot->cwd >= 0) close(snapshot->cwd);
  snapshot->cwd = -1;
}

static int shell_state_capture(ShellStateSnapshot *snapshot) {
  memset(snapshot, 0, sizeof(*snapshot));
  snapshot->cwd = high_descriptor(open(".", O_RDONLY | O_DIRECTORY));
  if (snapshot->cwd < 0) return 0;
  for (char **entry = environ; entry != NULL && *entry != NULL; entry++) {
    if (!argument_push(&snapshot->environment, *entry)) {
      shell_state_snapshot_dispose(snapshot);
      return 0;
    }
  }
  if (!arguments_copy(&exported_names, &snapshot->exported)) {
    shell_state_snapshot_dispose(snapshot);
    return 0;
  }
  return 1;
}

// Consumes the snapshot's exported names.
static int shell_state_restore(ShellStateSnapshot *snapshot) {
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
  for (size_t index = 0; index < snapshot->environment.count; index++) {
    const char *entry = snapshot->environment.items[index];
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
  arguments_dispose(&exported_names);
  exported_names = snapshot->exported;
  memset(&snapshot->exported, 0, sizeof(snapshot->exported));
  if (fchdir(snapshot->cwd) != 0) ok = 0;
  return ok;
}

// An unlinked temporary file for pipeline, substitution and here-document bytes.
static int spool_file(void) {
  char path[] = "/tmp/slop-spool-XXXXXX";
  const int descriptor = mkstemp(path);
  if (descriptor >= 0) unlink(path);
  return high_descriptor(descriptor);
}

static int write_all(int descriptor, const char *bytes, size_t length) {
  while (length != 0) {
    const ssize_t written = write(descriptor, bytes, length);
    if (written < 0 && errno == EINTR) continue;
    if (written <= 0) return 0;
    bytes += written;
    length -= (size_t)written;
  }
  return 1;
}

// A pipeline stage or command substitution runs to completion before its
// output is read, so its output collects in an unlinked spool file.
// Returns the spool rewound for reading, or -1.
static int spool_rewind(int descriptor) {
  if (lseek(descriptor, 0, SEEK_SET) == 0) return descriptor;
  close(descriptor);
  return -1;
}

static int descriptor_state_save(DescriptorState *state, int destination) {
  for (size_t index = 0; index < state->count; index++) {
    if (state->items[index].destination == destination) return 1;
  }
  if (destination < 0 || destination > 9 || state->count == 10) {
    errno = EINVAL;
    return 0;
  }
  errno = 0;
  const int saved = fcntl(destination, F_DUPFD_CLOEXEC, 10);
  if (saved < 0 && errno != EBADF) return 0;
  state->items[state->count++] = (DescriptorBackup){
      .destination = destination,
      .saved = saved,
      .was_open = saved >= 0,
  };
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

// Keeps the redirections; a subshell's scope still restores them on exit.
static void descriptor_state_commit(DescriptorState *state, DescriptorState *scope) {
  for (size_t index = 0; index < state->count; index++) {
    DescriptorBackup *backup = &state->items[index];
    size_t saved = 0;
    while (scope != NULL && saved < scope->count &&
           scope->items[saved].destination != backup->destination) saved++;
    if (scope != NULL && saved == scope->count) scope->items[scope->count++] = *backup;
    else if (backup->was_open) close(backup->saved);
  }
  state->count = 0;
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

typedef struct {
  Shell shell;
  Functions functions;
  ShellStateSnapshot state;
  DescriptorState descriptors;
} Subshell;

// A subshell is a private copy of the interpreter state. Files remain shared.
static int subshell_enter(Shell *shell, Subshell *subshell) {
  memset(subshell, 0, sizeof(*subshell));
  if (!shell_state_capture(&subshell->state)) return 0;
  Shell *nested = &subshell->shell;
  *nested = *shell;
  nested->argc = 0;
  nested->argv = NULL;
  nested->argv_array_owned = 0;
  nested->argv_strings_owned = 0;
  nested->active = 1;
  nested->exit_status = 0;
  nested->loop_depth = 0;
  nested->loop_control = LOOP_CONTROL_NONE;
  nested->loop_levels = 0;
  nested->function_depth = 0;
  nested->source_depth = 0;
  nested->returning = 0;
  nested->return_status = 0;
  nested->local_frame = NULL;
  memset(nested->traps, 0, sizeof(nested->traps));
  nested->functions = &subshell->functions;
  nested->descriptors = &subshell->descriptors;
  if (!shell_argv_clone(nested, shell) ||
      !functions_clone(shell->functions, &subshell->functions)) {
    shell_argv_dispose(nested);
    functions_dispose(&subshell->functions);
    shell_state_snapshot_dispose(&subshell->state);
    fputs("slop: subshell: out of memory\n", stderr);
    return 0;
  }
  return 1;
}

static int subshell_leave(Shell *shell, Subshell *subshell, int status) {
  Shell *nested = &subshell->shell;
  status = leave_shell(nested, nested->active ? status : nested->exit_status);
  functions_dispose(&subshell->functions);
  shell_argv_dispose(nested);
  descriptor_state_restore(&subshell->descriptors);
  if (!shell_state_restore(&subshell->state))
    fputs("slop: could not restore subshell state\n", stderr);
  shell_state_snapshot_dispose(&subshell->state);
  interrupt_shell(shell, nested->terminating_signal);
  return status;
}

static int capture_command(Shell *shell, const char *command, Buffer *output) {
  const size_t starting_length = output->length;
  const int spool = spool_file();
  Subshell subshell;
  if (spool < 0) return 0;
  if (!subshell_enter(shell, &subshell)) {
    close(spool);
    return 0;
  }
  int status = 1;
  if (descriptor_state_duplicate(&subshell.descriptors, STDOUT_FILENO, spool)) {
    // The outer `-e` must not turn `$(false; echo value)` into a failure.
    subshell.shell.errexit = 0;
    status = execute_text(&subshell.shell, command);
  }
  shell->substitution_status = subshell_leave(shell, &subshell, status);
  shell->last_status = shell->substitution_status;
  const int descriptor = spool_rewind(spool);
  if (descriptor < 0) return 0;
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
  return shell->active;
}

typedef struct {
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

static long arithmetic_assignment(Arithmetic *parser);

static long arithmetic_primary(Arithmetic *parser) {
  arithmetic_space(parser);
  if (*parser->cursor == '(') {
    parser->cursor++;
    const long value = arithmetic_assignment(parser);
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

// condition ? value : value, right to left; only the chosen side is evaluated.
static long arithmetic_conditional(Arithmetic *parser) {
  const long condition = arithmetic_or(parser);
  if (!arithmetic_take(parser, "?")) return condition;
  const int evaluate = parser->evaluate;
  parser->evaluate = evaluate && condition != 0;
  const long first = arithmetic_assignment(parser);
  if (!arithmetic_take(parser, ":")) parser->error = 1;
  parser->evaluate = evaluate && condition == 0;
  const long second = arithmetic_conditional(parser);
  parser->evaluate = evaluate;
  return condition != 0 ? first : second;
}

// NAME = value and NAME op= value, right to left; the variable is set.
static long arithmetic_assignment(Arithmetic *parser) {
  static const char *const operators[] = {"<<=", ">>=", "+=", "-=", "*=", "/=", "%=", "&=", "^=", "|=", "="};
  arithmetic_space(parser);
  const char *start = parser->cursor, *end = start;
  while (end == start ? is_name_start(*end) : is_name_byte(*end)) end++;
  const char *operator = NULL;
  parser->cursor = end;
  for (size_t index = 0; end != start && operator == NULL &&
       index < sizeof(operators) / sizeof(operators[0]); index++) {
    if (arithmetic_take(parser, operators[index])) operator = operators[index];
  }
  if (operator == NULL || (operator[0] == '=' && *parser->cursor == '=')) {
    parser->cursor = start;
    return arithmetic_conditional(parser);
  }
  parser->cursor = start;
  long value = arithmetic_primary(parser);
  arithmetic_take(parser, operator);
  const long right = arithmetic_assignment(parser);
  if (!parser->evaluate || parser->error) return 0;
  const unsigned long a = (unsigned long)value, b = (unsigned long)right;
  switch (operator[0]) {
    case '=': value = right; break;
    case '+': value = (long)(a + b); break;
    case '-': value = (long)(a - b); break;
    case '*': value = (long)(a * b); break;
    case '&': value &= right; break;
    case '^': value ^= right; break;
    case '|': value |= right; break;
    case '/': case '%':
      if (right == 0 || (value == LONG_MIN && right == -1)) { parser->error = 1; return 0; }
      value = operator[0] == '/' ? value / right : value % right;
      break;
    default:
      if (right < 0 || right >= (long)(sizeof(long) * 8)) { parser->error = 1; return 0; }
      value = operator[0] == '<' ? (long)(a << right) : value >> right;
  }
  char name[256], text[32];
  if ((size_t)(end - start) >= sizeof(name)) { parser->error = 1; return 0; }
  memcpy(name, start, (size_t)(end - start));
  name[end - start] = '\0';
  snprintf(text, sizeof(text), "%ld", value);
  if (setenv(name, text, 1) != 0) parser->error = 1;
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
  Arithmetic parser = {.cursor = expression, .evaluate = 1};
  const long value = arithmetic_assignment(&parser);
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
    const int matched = fnmatch(pattern, candidate, 0) == 0;
    free(owned);
    if (!matched) continue;
    if (operation == '#')
      return buffer_append(word, value + removed, length - removed);
    return buffer_append(word, value, length - removed);
  }
  return buffer_append(word, value, length);
}

// `set -u`: expanding an unset parameter other than $@ and $* is an error.
static int unset_parameter_error(const Shell *shell, const char *name,
                                 size_t length, int set) {
  if (set || !shell->nounset) return 0;
  fprintf(stderr, "slop: %.*s: parameter not set\n", (int)length, name);
  return 1;
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
      } else if (*source == '\\' && source[1] != '\0') source++;
      else if (*source == '\'' || *source == '"') quote = *source;
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
    if (*body_cursor == '#' && body_cursor + 1 != closing) {
      const char *length_name = ++body_cursor;
      body_cursor = parameter_name_end(body_cursor);
      if (body_cursor == length_name || body_cursor != closing ||
          *length_name == '@' || *length_name == '*') {
        fputs("slop: unsupported parameter length expansion\n", stderr);
        return -1;
      }
      char temporary[64];
      int set;
      const size_t name_length = (size_t)(body_cursor - length_name);
      const char *value = parameter_value(shell, length_name, name_length,
                                          temporary, &set);
      if (unset_parameter_error(shell, length_name, name_length, set)) return -1;
      char result[64];
      const int written = value == NULL ? -1 :
          snprintf(result, sizeof(result), "%zu", strlen(value));
      if (written < 0 || (size_t)written >= sizeof(result) ||
          !buffer_append(word, result, (size_t)written)) return -1;
      *cursor = closing + 1;
      return 1;
    }
    body_cursor = parameter_name_end(body_cursor);
    if (body_cursor == body) {
      fprintf(stderr, "slop: unsupported parameter expansion: ${%.*s}\n",
              (int)(closing - body), body);
      return -1;
    }
    name = body;
    length = (size_t)(body_cursor - body);
    if (body_cursor != closing) {
      int colon = *body_cursor == ':';
      if (colon) body_cursor++;
      const int pattern_operation = !colon && body_cursor != closing &&
                                    (*body_cursor == '#' || *body_cursor == '%');
      if (body_cursor == closing ||
          (!pattern_operation && strchr("-=+?", *body_cursor) == NULL)) {
        fprintf(stderr, "slop: unsupported parameter expansion: ${%.*s}\n",
                (int)(closing - body), body);
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
      const int positional = length == 1 && strchr("@*", *name) != NULL;
      if (positional && pattern_operation) {
        fprintf(stderr, "slop: unsupported parameter operation: %s\n", variable);
        free(variable);
        return -1;
      }
      char temporary[64];
      int set;
      const char *value = parameter_value(shell, name, length, temporary, &set);
      if (positional) {
        // ${*-word} and ${@+word}: no positional parameters count as unset,
        // as in Bash; otherwise the value is the parameters joined by spaces.
        free(variable);
        Buffer joined = {0};
        set = shell->argc > 1;
        for (int index = 1; index < shell->argc; index++) {
          if ((index > 1 && !buffer_character(&joined, ' ')) ||
              !buffer_append(&joined, shell->argv[index], strlen(shell->argv[index]))) {
            free(joined.data);
            return -1;
          }
        }
        value = variable = joined.data == NULL ? strdup("") : joined.data;
      }
      if (!value || (pattern_operation &&
                     unset_parameter_error(shell, name, length, set))) {
        free(variable);
        return -1;
      }
      const int usable = set && (!colon || value[0] != '\0');
      const char *replacement = body_cursor;
      const size_t replacement_length = (size_t)(closing - body_cursor);
      int ok = 1;
      if (pattern_operation) {
        Buffer expanded_pattern = {0};
        expanding_pattern = 1;
        ok = expand_parameter_word(shell, replacement, replacement_length,
                                   &expanded_pattern);
        char *pattern = ok ? buffer_release(&expanded_pattern) : NULL;
        if (ok) ok = pattern != NULL && append_pattern_removal(
            word, value, pattern, operation, longest);
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
        } else if (!valid_name(name, length)) {
          fprintf(stderr, "slop: cannot assign parameter: %s\n", variable);
          ok = 0;
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
  } else if (is_special_parameter(*source) || isdigit((unsigned char)*source)) {
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
    const char *ifs = name[0] == '*' ? getenv("IFS") : NULL;
    const char separator = ifs == NULL ? ' ' : ifs[0];
    for (int index = 1; index < shell->argc; index++) {
      if (index != 1 && separator != '\0' && !buffer_character(word, separator)) return -1;
      if (!buffer_append(word, shell->argv[index], strlen(shell->argv[index]))) return -1;
    }
  } else {
    char temporary[64];
    int set;
    const char *value = parameter_value(shell, name, length, temporary, &set);
    if (value == NULL || unset_parameter_error(shell, name, length, set) ||
        !buffer_append(word, value, strlen(value))) return -1;
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
      } else if (*source == '\\' && source[1] != '\0') source++;
      else if (*source == '\'' || *source == '"') quote = *source;
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
  } else if (is_special_parameter(*source) || isdigit((unsigned char)*source)) {
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

// Backquotes remove one escape layer before parsing the captured command.
static int defer_backtick(const char **cursor, Buffer *word, int double_quoted) {
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
  // `(...)` is a subshell; "$((" would read as arithmetic expansion.
  const int subshell = start < source && *start == '(';
  if (!buffer_append(&expression, "$( ", subshell ? 3 : 2)) return -1;
  for (const char *byte = start; byte < source; byte++) {
    if (*byte == '\\' && byte + 1 < source &&
        (strchr("$`\\", byte[1]) || (double_quoted && byte[1] == '"')))
      byte++;
    if (!buffer_character(&expression, *byte)) {
      free(expression.data);
      return -1;
    }
  }
  if (!buffer_character(&expression, ')')) {
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
  if (*cursor++ != ':') return 0;
  return (length == 2 && strcmp(cursor, "$@") == 0) ||
         (length == 4 && strcmp(cursor, "${@}") == 0);
}

// `${1+"$@"}` is how scripts for pre-POSIX shells spell "$@": the same fields.
static int deferred_guarded_positional_fields(const char *text) {
  return text != NULL && text[0] == SLOP_DEFERRED_DOLLAR &&
         strcmp(text + 1, "9:${1+\"$@\"}") == 0;
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
  // Bash's `&>word` and `&>>word` redirect both stdout and stderr.
  if (operator[0] == '&' && operator[1] == '>') operator++;
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
    const int both = operator != source && *source == '&';
    const int explicit_descriptor = *descriptor >= 0;
    const char direction = *operator++;
    if (*descriptor < 0) *descriptor = direction == '<' ? 0 : 1;
    if (both) *target_descriptor = SLOP_BOTH_OUTPUTS;
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
      } else if (!isdigit((unsigned char)*operator) && direction == '>' &&
                 !explicit_descriptor) {
        // Bash's `>&word` with a non-descriptor word is `&>word`.
        redirection = TOKEN_OUTPUT;
        *target_descriptor = SLOP_BOTH_OUTPUTS;
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
    case '(': return TOKEN_LPAREN;
    case ')': return TOKEN_RPAREN;
    default: *length = 0; return TOKEN_WORD;
  }
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
  if (operator == target) return source[0] != '>';
  return operator != target + 1 ||
         !redirection_boundary((unsigned char)*operator);
}

static int lex(const char *source, TokenList *tokens) {
  size_t pending_heredocs[SLOP_MAX_HEREDOCS];
  size_t pending_count = 0;
  int both_outputs = 0;
  const char *counted = source;
  lex_line = 1;
  while (*source != '\0') {
    for (; counted < source; counted++) lex_line += *counted == '\n';
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
        /* <<- removes leading tabs from every body line and the delimiter. */
        Buffer body = {0};
        int found = 0;
        while (!found) {
          if (operator_token->strip_tabs) while (*source == '\t') source++;
          const char *newline = strchr(source, '\n');
          const char *line_end = newline == NULL ? source + strlen(source)
                                                  : newline;
          if (line_end > source && line_end[-1] == '\r') line_end--;
          const size_t line_length = (size_t)(line_end - source);
          if (strlen(delimiter_token->text) == line_length &&
              memcmp(source, delimiter_token->text, line_length) == 0) {
            operator_token->text = body.data != NULL ? body.data : strdup("");
            if (operator_token->text == NULL) return 0;
            operator_token->quoted = delimiter_token->quoted;
            source = newline == NULL ? line_end : newline + 1;
            found = 1;
          } else if (newline == NULL) {
            free(body.data);
            fprintf(stderr, "slop: unterminated here-document: %s\n",
                    delimiter_token->text);
            return 0;
          } else {
            if (!buffer_append(&body, source, (size_t)(newline + 1 - source))) {
              free(body.data);
              return 0;
            }
            source = newline + 1;
          }
        }
      }
      pending_count = 0;
      // `cmd <<EOF ||` continues after the here-document's body.
      const TokenKind previous = tokens->items[tokens->count - 1].kind;
      if (previous != TOKEN_AND && previous != TOKEN_OR && previous != TOKEN_PIPE &&
          !token_push(tokens, TOKEN_SEMI, NULL, 0)) return 0;
      continue;
    }
    if (source[0] == '&' && source[1] != '&' && source[1] != '>') {
      if (!token_push(tokens, TOKEN_SEMI, NULL, 0)) return 0;
      tokens->items[tokens->count - 1].background = 1;
      source++;
      continue;
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
    const int strip_tabs = kind == TOKEN_HEREDOC && source[operator_length] == '-';
    if (strip_tabs) operator_length++;
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
      both_outputs = target_descriptor == SLOP_BOTH_OUTPUTS;
      if (both_outputs) target_descriptor = -1;
      tokens->items[tokens->count - 1].newline = kind == TOKEN_SEMI && *source == '\n';
      tokens->items[tokens->count - 1].descriptor = descriptor;
      tokens->items[tokens->count - 1].target_descriptor = target_descriptor;
      tokens->items[tokens->count - 1].strip_tabs = strip_tabs;
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

    Buffer word = {0}, quote_mask = {0};
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
        if (operator_length != 0 || *source == '&') break;
      }
      char byte = *source;
      int protected = quote != '\0';
      if (quote == '\0' && (byte == '\'' || byte == '"')) {
        quote = byte; quoted = touched = 1; source++;
      } else if (quote != '\0' && byte == quote) {
        quote = '\0'; source++;
      } else if (byte == '\\' && quote != '\'') {
        source++;
        if (*source == '\0') {
          fputs("slop: trailing backslash\n", stderr); goto word_error;
        }
        if (*source == '\n') {
          source++;
          continue;
        }
        if (quote == '"' && !strchr("$`\"\\", *source)) {
          if (!append_lexed_character(&word, '\\')) goto word_error;
        }
        protected = 1;
        quoted = touched = 1;
        if (!append_lexed_character(&word, *source++)) goto word_error;
      } else if (byte == '$' && quote == '\0' && source[1] == '\'') {
        // POSIX.1-2024 dollar-single-quotes: C escapes in a quoted string.
        protected = quoted = touched = 1;
        for (source += 2; *source != '\''; ) {
          if (*source == '\0') { fputs("slop: unterminated quote\n", stderr); goto word_error; }
          unsigned value = (unsigned char)*source++;
          if (value == '\\' && *source != '\0') {
            static const char names[] = "abeEfnrtv", bytes[] = "\a\b\033\033\f\n\r\t\v";
            const char escape = *source++;
            const char *named = strchr(names, escape);
            int digits = 0;
            if (named != NULL) value = (unsigned char)bytes[named - names];
            else if (escape == 'c' && *source != '\0') value = (unsigned char)*source++ & 0x1f;
            else if (escape == 'x') {
              for (value = 0; digits < 2 && isxdigit((unsigned char)*source); digits++, source++)
                value = value * 16 + (unsigned)(isdigit((unsigned char)*source)
                    ? *source - '0' : (*source | 0x20) - 'a' + 10);
            } else if (escape >= '0' && escape <= '7') {
              for (value = (unsigned)(escape - '0'); digits < 2 && *source >= '0' && *source <= '7'; digits++)
                value = value * 8 + (unsigned)(*source++ - '0');
            } else value = (unsigned char)escape;
            if ((value & 0xff) == 0) { fputs("slop: $'...' cannot hold a NUL byte\n", stderr); goto word_error; }
          }
          if (!append_lexed_character(&word, (char)value)) goto word_error;
        }
        source++;
      } else if (byte == '$' && quote != '\'') {
        touched = 1;
        if (quote == '\0') split = 1;
        if (defer_dollar(&source, &word) < 0) goto word_error;
      } else if (byte == '`' && quote != '\'') {
        touched = 1;
        if (quote == '\0') split = 1;
        if (defer_backtick(&source, &word, quote == '"') < 0) goto word_error;
      } else {
        touched = 1;
        if (!append_lexed_character(&word, byte)) goto word_error;
        source++;
      }
      while (quote_mask.length < word.length) {
        if (!buffer_character(&quote_mask, protected ? 'q' : 'u')) goto word_error;
      }
    }
    if (quote != '\0') {
      fputs("slop: unterminated quote\n", stderr); goto word_error;
    }
    if (!touched) {
      goto word_error;
    }
    char *word_text = buffer_release(&word);
    if (!word_text) goto word_error;
    if (tokens->count != 0 &&
        (tokens->items[tokens->count - 1].kind == TOKEN_DUP_INPUT ||
         tokens->items[tokens->count - 1].kind == TOKEN_DUP_OUTPUT) &&
        tokens->items[tokens->count - 1].target_descriptor ==
            SLOP_DYNAMIC_DESCRIPTOR) {
      tokens->items[tokens->count - 1].text = word_text;
      tokens->items[tokens->count - 1].quoted = quoted;
      free(quote_mask.data);
      continue;
    }
    if (!token_push(tokens, TOKEN_WORD, word_text, quoted)) { free(quote_mask.data); return 0; }
    tokens->items[tokens->count - 1].quote_mask = buffer_release(&quote_mask);
    if (!tokens->items[tokens->count - 1].quote_mask) return 0;
    tokens->items[tokens->count - 1].split = split;
    tokens->items[tokens->count - 1].positional_fields =
        (quoted && deferred_quoted_positional_fields(
                       tokens->items[tokens->count - 1].text)) ||
        deferred_guarded_positional_fields(tokens->items[tokens->count - 1].text);
    if (both_outputs) {
      if (!token_push(tokens, TOKEN_DUP_OUTPUT, NULL, 0)) return 0;
      tokens->items[tokens->count - 1].descriptor = STDERR_FILENO;
      tokens->items[tokens->count - 1].target_descriptor = STDOUT_FILENO;
      both_outputs = 0;
    }
    continue;
word_error:
    free(word.data);
    free(quote_mask.data);
    return 0;
  }
  if (pending_count != 0) {
    fputs("slop: here-document body must begin on the next line\n", stderr);
    return 0;
  }
  return token_push(tokens, TOKEN_END, NULL, 0);
}

static int compare_strings(const void *left, const void *right) {
  return strcmp(*(const char *const *)left, *(const char *const *)right);
}

static int glob_active(const Token *token, size_t index) {
  return strchr("*?[", token->text[index]) != NULL &&
         (token->quote_mask ? token->quote_mask[index] != 'q' : !token->quoted);
}

// Quoted metacharacters and every backslash become literal pattern bytes.
static int glob_pattern(Buffer *pattern, const Token *token, size_t start,
                        size_t end) {
  for (size_t index = start; index < end; index++) {
    const char byte = token->text[index];
    const int protected = token->quote_mask ? token->quote_mask[index] == 'q'
                                            : token->quoted;
    if ((byte == '\\' || (protected && strchr("*?[]", byte))) &&
        !buffer_character(pattern, '\\')) return 0;
    if (!buffer_character(pattern, byte)) return 0;
  }
  return 1;
}

// Matches the components of token->text from `offset` below `path`.
static int glob_below(const Token *token, size_t offset, Buffer *path,
                      Arguments *matches) {
  const char *text = token->text;
  const size_t path_length = path->length;
  size_t end = offset;
  int pattern = 0;
  while (text[end] != '\0' && text[end] != '/') pattern |= glob_active(token, end++);
  size_t next = end;
  while (text[next] == '/') next++;
  int ok = 1;
  if (!pattern) {
    struct stat metadata;
    ok = buffer_append(path, text + offset, next - offset);
    if (ok && text[next] != '\0') ok = glob_below(token, next, path, matches);
    else if (ok && lstat(path->data, &metadata) == 0) ok = argument_push(matches, path->data);
  } else {
    Buffer component = {0};
    DIR *stream = opendir(path_length == 0 ? "." : path->data);
    ok = glob_pattern(&component, token, offset, end);
    struct dirent *entry;
    while (ok && stream != NULL && (entry = readdir(stream)) != NULL) {
      if (entry->d_name[0] == '.' && component.data[0] != '.') continue;
      if (fnmatch(component.data, entry->d_name, 0) != 0) continue;
      struct stat metadata;
      path->length = path_length;
      ok = buffer_append(path, entry->d_name, strlen(entry->d_name)) &&
           buffer_append(path, text + end, next - end);
      if (ok && text[next] != '\0') ok = glob_below(token, next, path, matches);
      else if (ok && (next == end || stat(path->data, &metadata) == 0))
        ok = argument_push(matches, path->data);
    }
    if (stream != NULL) closedir(stream);
    free(component.data);
  }
  path->length = path_length;
  if (path->data != NULL) path->data[path_length] = '\0';
  return ok;
}

static int expand_glob(Arguments *arguments, const Token *token) {
  int has_pattern = 0;
  for (size_t index = 0; token->text[index]; index++) has_pattern |= glob_active(token, index);
  if (!has_pattern) return argument_push(arguments, token->text);
  Arguments matches = {0};
  Buffer path = {0};
  int ok = glob_below(token, 0, &path, &matches);
  free(path.data);
  if (ok && matches.count == 0) ok = argument_push(arguments, token->text);
  if (matches.count != 0)
    qsort(matches.items, matches.count, sizeof(*matches.items), compare_strings);
  for (size_t index = 0; ok && index < matches.count; index++) {
    ok = argument_push_owned(arguments, matches.items[index]);
    matches.items[index] = NULL;
  }
  arguments_dispose(&matches);
  return ok;
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

// Yields each PATH directory in order; an empty entry names the cwd.
static int next_path_directory(const char **cursor, const char **directory,
                               size_t *length) {
  if (*cursor == NULL) return 0;
  const char *separator = strchr(*cursor, ':');
  *length = separator == NULL ? strlen(*cursor) : (size_t)(separator - *cursor);
  *directory = *length == 0 ? "." : *cursor;
  if (*length == 0) *length = 1;
  *cursor = separator == NULL ? NULL : separator + 1;
  return 1;
}

static const char *path_variable(void) {
  const char *path = getenv("PATH");
  return path == NULL ? "/bin:/usr/bin" : path;
}

static enum command_resolution resolve_command(const char *command, const char *search,
                                                char *resolved, size_t capacity) {
  if (strchr(command, '/') != NULL) {
    return resolved_command_at(command, resolved, capacity);
  }
  const char *cursor = search, *directory;
  size_t length;
  while (next_path_directory(&cursor, &directory, &length)) {
    int written = snprintf(resolved, capacity, "%.*s/%s", (int)length, directory, command);
    if (written >= 0 && (size_t)written < capacity) {
      const enum command_resolution found =
          resolved_command_at(resolved, resolved, capacity);
      if (found != COMMAND_NOT_FOUND) return found;
    }
  }
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

static int remember_variable(const char *name, EnvironmentChange *change) {
  change->name = strdup(name);
  if (change->name == NULL) return 0;
  const char *old = getenv(name);
  change->existed = old != NULL;
  change->old_value = old == NULL ? NULL : strdup(old);
  change->exported = exported_index(name, strlen(name)) != SIZE_MAX;
  if (old != NULL && change->old_value == NULL) { free(change->name); return 0; }
  return 1;
}

static int ifs_byte(const char *ifs, char byte) {
  return byte != '\0' && strchr(ifs, byte) != NULL;
}

// Reads one logical line from fd 0 without consuming bytes after it, so the
// next reader of the same file or pipe sees them. 1 ok, 0 memory, -1 errno.
static int read_line(Buffer *line, int raw, int *reached_eof) {
  const int seekable = lseek(STDIN_FILENO, 0, SEEK_CUR) >= 0;
  char bytes[4096];
  int escaped = 0;
  for (;;) {
    const ssize_t count = read(STDIN_FILENO, bytes, seekable ? sizeof(bytes) : 1);
    if (count < 0 && errno == EINTR && !interrupt_requested) continue;
    if (count < 0) return -1;
    if (count == 0) {
      *reached_eof = 1;
      return !escaped || buffer_character(line, '\\');
    }
    for (ssize_t index = 0; index < count; index++) {
      const char byte = bytes[index];
      if (escaped) {
        escaped = 0;
        if (byte == '\n') continue;
      } else if (byte == '\n') {
        if (seekable && lseek(STDIN_FILENO, index + 1 - count, SEEK_CUR) < 0) return -1;
        return 1;
      } else if (!raw && byte == '\\') {
        escaped = 1;
        continue;
      }
      if (!buffer_character(line, byte)) return 0;
    }
  }
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
  const int result = read_line(&line, raw, &reached_eof);
  if (result == 0) goto memory_error;
  if (result < 0) {
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

static int print_shell_variables(int exported_only) {
  ShellStateSnapshot snapshot;
  if (!shell_state_capture(&snapshot)) {
    fputs("slop: out of memory\n", stderr);
    return 1;
  }
  qsort(snapshot.environment.items, snapshot.environment.count,
        sizeof(*snapshot.environment.items), compare_strings);
  for (size_t index = 0; index < snapshot.environment.count; index++) {
    const char *entry = snapshot.environment.items[index];
    const char *equals = strchr(entry, '=');
    if (equals == NULL || (exported_only &&
        exported_index(entry, (size_t)(equals - entry)) == SIZE_MAX)) continue;
    if (exported_only) fputs("export ", stdout);
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
    printf("set %co nounset\n", shell->nounset ? '-' : '+');
    printf("set %co pipefail\n", shell->pipefail ? '-' : '+');
    printf("set %co xtrace\n", shell->xtrace ? '-' : '+');
  } else {
    printf("errexit %s\n", shell->errexit ? "on" : "off");
    printf("nounset %s\n", shell->nounset ? "on" : "off");
    printf("pipefail %s\n", shell->pipefail ? "on" : "off");
    printf("xtrace %s\n", shell->xtrace ? "on" : "off");
  }
  return ferror(stdout) ? 1 : 0;
}

static int set_named_option(Shell *shell, const char *name, int enabled) {
  if (strcmp(name, "errexit") == 0) shell->errexit = enabled;
  else if (strcmp(name, "nounset") == 0) shell->nounset = enabled;
  else if (strcmp(name, "pipefail") == 0) shell->pipefail = enabled;
  else if (strcmp(name, "xtrace") == 0) shell->xtrace = enabled;
  else {
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
      publish_getopts_index(shell->getopts_index);
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
      char *name = strndup(word, name_length);
      const int remembered = name != NULL && remember_variable(name, change);
      free(name);
      if (!remembered) {
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
      "type", "exec", "command", "trap", "wait",
  };
  for (size_t index = 0; index < sizeof(names) / sizeof(names[0]); index++) {
    if (strcmp(name, names[index]) == 0) return 1;
  }
  return 0;
}

// POSIX special builtins take precedence over functions; the others yield.
static int special_builtin_name(const char *name) {
  static const char *const names[] = {
      ":", ".", "source", "eval", "exec", "exit", "export", "return", "set",
      "shift", "unset", "break", "continue", "trap",
  };
  for (size_t index = 0; index < sizeof(names) / sizeof(names[0]); index++) {
    if (strcmp(name, names[index]) == 0) return 1;
  }
  return 0;
}

static int command_builtin(Shell *shell, int argc, char **argv);

static const char *const trap_names[] = {
    [0] = "EXIT", [SIGHUP] = "HUP", [SIGINT] = "INT", [SIGQUIT] = "QUIT",
    [SIGPIPE] = "PIPE", [SIGTERM] = "TERM",
};

// A trap condition's index, by name, SIG-prefixed name or number; -1 otherwise.
static int trap_condition(const char *word) {
  char *end = NULL;
  const long number = strtol(word, &end, 10);
  if (strncmp(word, "SIG", 3) == 0) word += 3;
  for (size_t index = 0; index < sizeof(trap_names) / sizeof(trap_names[0]); index++) {
    if (trap_names[index] != NULL &&
        (strcmp(word, trap_names[index]) == 0 ||
         (end != word && *end == '\0' && number == (long)index))) return (int)index;
  }
  return -1;
}

// trap [ACTION] CONDITION...: `-` or no action restores the default.
static int builtin_trap(Shell *shell, int argc, char **argv) {
  int first = 1;
  if (first < argc && strcmp(argv[first], "--") == 0) first++;
  if (first == argc) {
    for (size_t index = 0; index < sizeof(trap_names) / sizeof(trap_names[0]); index++) {
      const char *action = shell->traps[index];
      if (action == NULL) continue;
      fputs("trap -- '", stdout);
      for (; *action != '\0'; action++) {
        if (*action == '\'') fputs("'\\''", stdout);
        else putchar(*action);
      }
      printf("' %s\n", trap_names[index]);
    }
    return 0;
  }
  const char *action = NULL;
  if (argc - first > 1 && trap_condition(argv[first]) < 0) {
    action = argv[first++];
    if (strcmp(action, "-") == 0) action = NULL;
  }
  for (int index = first; index < argc; index++) {
    const int condition = trap_condition(argv[index]);
    if (condition < 0) {
      fprintf(stderr, "slop: trap: %s: only EXIT, HUP, INT, QUIT, PIPE and TERM can be trapped\n",
              argv[index]);
      return 2;
    }
    if (condition != 0 && action != NULL && action[0] == '\0') {
      fprintf(stderr, "slop: trap: %s: a signal cannot be ignored: "
              "commands always start with default signal actions\n", argv[index]);
      return 2;
    }
    char *copy = action == NULL ? NULL : strdup(action);
    const struct sigaction handler = {.sa_handler = request_interrupt};
    if ((action != NULL && copy == NULL) ||
        (condition != 0 && copy != NULL && sigaction(condition, &handler, NULL) != 0)) {
      fprintf(stderr, "slop: trap: %s: %s\n", argv[index], strerror(errno));
      free(copy);
      return 1;
    }
    free(shell->traps[condition]);
    shell->traps[condition] = copy;
  }
  return 0;
}

// What ended a program the shell started: its status, and its signal or 0.
static int wait_program(pid_t pid, int *signal_number) {
  int status;
  pid_t waited;
  *signal_number = 0;
  do { waited = waitpid(pid, &status, 0); } while (waited < 0 && errno == EINTR);
  if (waited < 0) { fprintf(stderr, "slop: wait failed: %s\n", strerror(errno)); return 126; }
  if (WIFSIGNALED(status)) *signal_number = WTERMSIG(status);
  return WIFSIGNALED(status) ? 128 + WTERMSIG(status) : WIFEXITED(status) ? WEXITSTATUS(status) : 126;
}

// `wait` collects every program started with `&`; `wait PID...` collects
// those and returns the status of the last one.
static int builtin_wait(int argc, char **argv) {
  int status = 0, signal_number;
  if (argc == 1) {
    while (background_count != 0)
      (void)wait_program(background_programs[--background_count], &signal_number);
    return 0;
  }
  for (int argument = 1; argument < argc; argument++) {
    char *end;
    const long pid = strtol(argv[argument], &end, 10);
    size_t index = 0;
    while (index < background_count && background_programs[index] != pid) index++;
    if (end == argv[argument] || *end != '\0' || index == background_count) {
      fprintf(stderr, "slop: wait: %s: not a background program of this shell\n", argv[argument]);
      status = 127;
      continue;
    }
    background_programs[index] = background_programs[--background_count];
    status = wait_program((pid_t)pid, &signal_number);
  }
  return status;
}

static int builtin(Shell *shell, int argc, char **argv) {
  if (strcmp(argv[0], ":") == 0) return 0;
  if (strcmp(argv[0], "trap") == 0) return builtin_trap(shell, argc, argv);
  if (strcmp(argv[0], "wait") == 0) return builtin_wait(argc, argv);
  if (strcmp(argv[0], "command") == 0) return command_builtin(shell, argc, argv);
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
          resolve_command(path, path_variable(), resolved, sizeof(resolved));
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
    shell->source_depth++;
    // A sourced file numbers its own lines.
    const int line = shell->lineno;
    shell->lineno = 0;
    int status = execute_text(shell, source);
    shell->lineno = line;
    shell->source_depth--;
    if (shell->returning) {
      status = shell->return_status;
      shell->returning = 0;
      shell->return_status = 0;
    }
    // With no explicit arguments, sourcing uses (and may replace) the current
    // argument frame. Only an explicitly supplied frame is popped on return.
    if (argc > 2) {
      shell_argv_dispose(shell);
      shell->argc = saved_argc;
      shell->argv = saved_argv;
      shell->argv_array_owned = saved_array_owned;
      shell->argv_strings_owned = saved_strings_owned;
    }
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
    if (shell->function_depth == 0 && shell->source_depth == 0) {
      fputs("slop: return: only valid inside a function or sourced script\n", stderr);
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
    if (path == NULL || path[0] == '\0') {
      if (argument < argc && !previous) return 0;
      fprintf(stderr, "slop: cd: %s is not set\n", previous ? "OLDPWD" : "HOME");
      return 1;
    }
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
        setenv("PWD", new_cwd, 1) != 0 || !export_variable("OLDPWD")) {
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
    if (argc == 1 || (argc == 2 && strcmp(argv[1], "-p") == 0))
      return print_shell_variables(1);
    for (int index = 1; index < argc; index++) {
      size_t name_length;
      if (!assignment(argv[index], &name_length)) name_length = strlen(argv[index]);
      char *name = strndup(argv[index], name_length);
      if (name == NULL) return 1;
      const int valid = valid_name(name, name_length);
      const int ok = valid && set_assignment(argv[index]) >= 0 &&
                     export_variable(name);
      free(name);
      if (!valid) {
        fprintf(stderr, "slop: export: invalid name: %s\n", argv[index]); return 2;
      }
      if (!ok) return 1;
    }
    return 0;
  }
  if (strcmp(argv[0], "unset") == 0) {
    int first = 1, functions = 0;
    for (; first < argc && argv[first][0] == '-'; first++) {
      if (strcmp(argv[first], "--") == 0) { first++; break; }
      if (strcmp(argv[first], "-f") == 0) functions = 1;
      else if (strcmp(argv[first], "-v") == 0) functions = 0;
      else { fprintf(stderr, "slop: unset: invalid option: %s\n", argv[first]); return 2; }
    }
    for (int index = first; index < argc; index++) {
      if (!valid_name(argv[index], strlen(argv[index]))) {
        fprintf(stderr, "slop: unset: invalid name: %s\n", argv[index]); return 2;
      }
      if (functions) {
        Function *function = function_lookup(shell->functions, argv[index]);
        if (function == NULL) continue;
        free(function->name);
        tokens_dispose(&function->body);
        *function = shell->functions->items[--shell->functions->count];
        continue;
      }
      if (unsetenv(argv[index]) != 0) return 1;
      unexport_variable(argv[index]);
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
    if (argc == 1) return print_shell_variables(0);
    int argument = 1;
    for (; argument < argc; argument++) {
      const char *option = argv[argument];
      if (strcmp(option, "--") == 0) { argument++; break; }
      if ((option[0] != '-' && option[0] != '+') || option[1] == '\0') break;
      const int enabled = option[0] == '-';
      for (size_t index = 1; option[index] != '\0'; index++) {
        if (option[index] == 'e') shell->errexit = enabled;
        else if (option[index] == 'u') shell->nounset = enabled;
        else if (option[index] == 'x') shell->xtrace = enabled;
        else if (option[index] != 'o') {
          fputs("slop: set: only e, u, x, and named -o options are supported\n", stderr);
          return 2;
        } else if (argument + 1 == argc) {
          return print_shell_options(shell, !enabled);
        } else if (!set_named_option(shell, argv[++argument], enabled)) {
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
      if (resolve_command(name, path_variable(), path, sizeof(path)) == COMMAND_FOUND) {
        if (path_only) puts(path);
        else printf("%s is %s\n", name, path);
      } else {
        if (!path_only) fprintf(stderr, "slop: type: %s: not found\n", name);
        status = 1;
      }
    }
    return status;
  }
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

static int wait_command(Shell *shell, pid_t pid) {
  int signal_number;
  const int status = wait_program(pid, &signal_number);
  if (signal_number == SIGINT || signal_number == SIGQUIT) interrupt_shell(shell, signal_number);
  return status;
}

// The child inherits the shell's descriptors 0-9 and its exported variables.
static int spawn_command(Shell *shell, int argc, char **argv, const char *search) {
  Stage *stage = shell->stage;
  shell->stage = NULL;
  char path[PATH_MAX];
  enum command_resolution resolution = resolve_command(argv[0], search, path, sizeof(path));
  if (resolution == COMMAND_PATH_TOO_LONG) { fprintf(stderr, "slop: %s: path is too long\n", argv[0]); return 126; }
  if (resolution != COMMAND_FOUND) {
    // A word with a slash is a path: say what is wrong with it, as sh does.
    struct stat metadata;
    if (strchr(argv[0], '/') == NULL) { fprintf(stderr, "slop: %s: command not found\n", argv[0]); return 127; }
    if (stat(argv[0], &metadata) != 0) { fprintf(stderr, "slop: %s: %s\n", argv[0], strerror(errno)); return 127; }
    fprintf(stderr, "slop: %s: %s\n", argv[0], S_ISDIR(metadata.st_mode) ? strerror(EISDIR) : "not a regular file");
    return 126;
  }
  // Ctrl+C that reached the shell while it prepared this command cancels it.
  if (interrupt_requested) {
    interrupt_requested = 0;
    interrupt_shell(shell, SIGINT);
    return 128 + SIGINT;
  }
  char **environment = exported_environment();
  if (environment == NULL) { fputs("slop: out of memory\n", stderr); return 126; }
  fflush(NULL);
  const int pid = dolly_spawn_mapped(path, argc, argv, environment, NULL,
                                     DOLLY_PROCESS_INHERIT_FDS_ALL, NULL, 0, -1);
  free(environment);
  if (pid < 0) { fprintf(stderr, "slop: %s: spawn failed: %s\n", argv[0], strerror(-pid)); return 126; }
  if (stage == NULL) return wait_command(shell, pid);
  stage->pid = pid;
  return 0;
}

// Shell features Slop refuses by name rather than as an unknown command.
static const char *unsupported_builtin(const char *name) {
  static const char *const reasons[][2] = {
      {"alias", "aliases are unsupported; define a function"},
      {"unalias", "aliases are unsupported"},
        {"bg", "there is no job control; `wait` collects programs started with &"},
      {"fg", "there is no job control; `wait` collects programs started with &"},
      {"jobs", "there is no job control; `wait` collects programs started with &"},
      {"umask", "Dolly has no permission bits"},
      {"ulimit", "limits are fixed; `help` lists them"},
  };
  for (size_t index = 0; index < sizeof(reasons) / sizeof(reasons[0]); index++) {
    if (strcmp(name, reasons[index][0]) == 0) return reasons[index][1];
  }
  return NULL;
}

static int run_command_words(Shell *shell, int argc, char **argv) {
  if (!shell->active) return shell->exit_status;
  Function *function = function_lookup(shell->functions, argv[0]);
  if (function != NULL && !special_builtin_name(argv[0])) {
    return run_function(shell, function, argc, argv);
  }
  if (builtin_name(argv[0])) return builtin(shell, argc, argv);
  const char *unsupported = unsupported_builtin(argv[0]);
  if (unsupported != NULL) {
    fprintf(stderr, "slop: %s: %s\n", argv[0], unsupported);
    return 2;
  }
  return spawn_command(shell, argc, argv, path_variable());
}

// command NAME runs a built-in or a program, never a function; -v prints what
// would run and -p searches the default PATH.
static int command_builtin(Shell *shell, int argc, char **argv) {
  const char *search = path_variable();
  int describe = 0, argument = 1;
  for (; argument < argc && argv[argument][0] == '-'; argument++) {
    if (strcmp(argv[argument], "--") == 0) { argument++; break; }
    if (strcmp(argv[argument], "-p") == 0) search = "/bin:/usr/bin";
    else if (strcmp(argv[argument], "-v") == 0) describe = 1;
    else {
      fprintf(stderr, "slop: command: unsupported option: %s\n", argv[argument]);
      return 2;
    }
  }
  if (argument == argc) return describe ? 2 : 0;
  if (!describe) {
    return builtin_name(argv[argument])
        ? builtin(shell, argc - argument, argv + argument)
        : spawn_command(shell, argc - argument, argv + argument, search);
  }
  int status = 0;
  for (; argument < argc; argument++) {
    char path[PATH_MAX];
    if (builtin_name(argv[argument]) || function_lookup(shell->functions, argv[argument]) != NULL) {
      puts(argv[argument]);
    } else if (resolve_command(argv[argument], search, path, sizeof(path)) == COMMAND_FOUND) {
      puts(path);
    } else {
      status = 1;
    }
  }
  return status;
}

// A command-prefix assignment is exported to that command only.
static int save_environment_change(const char *word, size_t name_length,
                                   EnvironmentChange *change) {
  char *name = strndup(word, name_length);
  const int ok = name != NULL && remember_variable(name, change);
  free(name);
  if (!ok) return 0;
  if (setenv(change->name, word + name_length + 1, 1) != 0 ||
      !export_variable(change->name)) {
    restore_environment_changes(change, 1);
    return 0;
  }
  return 1;
}

static void restore_environment_changes(EnvironmentChange *changes, size_t count) {
  while (count != 0) {
    EnvironmentChange *change = &changes[--count];
    if (change->existed) setenv(change->name, change->old_value, 1);
    else unsetenv(change->name);
    if (change->exported) export_variable(change->name);
    else unexport_variable(change->name);
    free(change->name); free(change->old_value);
  }
}

static int open_redirection(const char *path, int flags) {
  int descriptor = open(path, flags, 0666);
  if (descriptor < 0) fprintf(stderr, "slop: %s: %s\n", path, strerror(errno));
  return descriptor;
}

static int token_is_file_redirection(TokenKind kind) {
  return kind == TOKEN_INPUT || kind == TOKEN_OUTPUT || kind == TOKEN_APPEND ||
         kind == TOKEN_HEREDOC;
}

static int token_is_redirection(TokenKind kind) {
  return token_is_file_redirection(kind) || kind == TOKEN_DUP_INPUT ||
         kind == TOKEN_DUP_OUTPUT;
}

static int open_heredoc(Shell *shell, const Token *token);

// Applies expanded redirections in order to the shell's own descriptors.
static int apply_redirections(Shell *shell, DescriptorState *state,
                              const Token *tokens, size_t start, size_t end) {
  fflush(NULL);
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
    if (opened != token->descriptor) {
      const int moved = dup2(opened, token->descriptor);
      close(opened);
      if (moved < 0) return 0;
    }
  }
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

static void trace_simple(Shell *shell, const Arguments *assignments,
                         const Arguments *arguments, const Token *tokens,
                         size_t start, size_t end) {
  if (!shell->xtrace) return;
  fputc('+', stderr);
  for (size_t index = 0; index < assignments->count; index++) {
    fputc(' ', stderr);
    trace_word(assignments->items[index]);
  }
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
}

// POSIX: an expansion error exits a non-interactive shell.
static int expansion_error(Shell *shell) {
  if (shell->active && !shell->interactive) {
    shell->active = 0;
    shell->exit_status = 1;
  }
  return -1;
}

static int expand_dollars(Shell *shell, Token *token) {
  if (token->positional_fields || token->text == NULL ||
      strchr(token->text, SLOP_DEFERRED_DOLLAR) == NULL) return 1;
  Buffer expanded = {0}, expanded_mask = {0};
  const char *cursor = token->text;
  while (*cursor != '\0') {
    const char protection = token->quote_mask
        ? token->quote_mask[cursor - token->text] : 'u';
    const char *cursor_before = cursor;
    if (*cursor != SLOP_DEFERRED_DOLLAR) {
      if (!buffer_character(&expanded, *cursor++)) goto memory_error;
    } else if (cursor[1] == SLOP_DEFERRED_DOLLAR) {
      cursor++;
      if (!buffer_character(&expanded, *cursor++)) goto memory_error;
    } else {
      cursor++;
      if (!isdigit((unsigned char)*cursor)) goto malformed;
      size_t length = 0;
      while (isdigit((unsigned char)*cursor)) {
        const unsigned digit = (unsigned)(*cursor - '0');
        if (length > (SIZE_MAX - digit) / 10) goto malformed;
        length = length * 10 + digit;
        cursor++;
      }
      if (*cursor++ != ':' || strlen(cursor) < length) goto malformed;
      // A quoted $@ inside a word: one field per parameter. The mask marks
      // each boundary 'f'; where fields do not split it reads as a space.
      if (protection == 'q' && ((length == 2 && strncmp(cursor, "$@", 2) == 0) ||
                                (length == 4 && strncmp(cursor, "${@}", 4) == 0))) {
        for (int index = 1; index < shell->argc; index++) {
          while (expanded_mask.length < expanded.length)
            if (!buffer_character(&expanded_mask, protection)) goto memory_error;
          if (index > 1 && (!buffer_character(&expanded, ' ') ||
                            !buffer_character(&expanded_mask, 'f'))) goto memory_error;
          if (!buffer_append(&expanded, shell->argv[index], strlen(shell->argv[index])))
            goto memory_error;
        }
        cursor += length;
        continue;
      }
      char *expression = strndup(cursor, length);
      if (expression == NULL) goto memory_error;
      const char *expression_cursor = expression;
      Buffer *const outer_text = expanding_text, *const outer_mask = expanding_mask;
      const char outer_protection = expanding_protection;
      if (token->quote_mask) {
        while (expanded_mask.length < expanded.length)
          if (!buffer_character(&expanded_mask, protection)) goto memory_error;
        expanding_text = &expanded;
        expanding_mask = &expanded_mask;
        expanding_protection = protection == 'u' ? 'e' : protection;
      }
      const int result = expand_dollar_now(shell, &expression_cursor, &expanded);
      expanding_text = outer_text;
      expanding_mask = outer_mask;
      expanding_protection = outer_protection;
      const int complete = result >= 0 && *expression_cursor == '\0';
      free(expression);
      if (!complete) goto expansion_failed;
      cursor += length;
    }
    if (token->quote_mask) {
      // 'e': what an unquoted expansion produced; only that splits into fields.
      const char produced = *cursor_before == SLOP_DEFERRED_DOLLAR && protection == 'u'
          ? 'e' : protection;
      while (expanded_mask.length < expanded.length)
        if (!buffer_character(&expanded_mask, produced)) goto memory_error;
    }
  }
  free(token->text);
  token->text = buffer_release(&expanded);
  if (token->quote_mask) {
    free(token->quote_mask);
    token->quote_mask = buffer_release(&expanded_mask);
    if (!token->quote_mask) return 0;
  }
  return token->text != NULL;

malformed:
  fputs("slop: malformed deferred expansion\n", stderr);
expansion_failed:
  free(expanded_mask.data);
  free(expanded.data);
  return expansion_error(shell);
memory_error:
  free(expanded_mask.data);
  free(expanded.data);
  return 0;
}

// `~` starts a fully unquoted word or the value of an assignment.
static int expand_tilde(Token *token, size_t offset) {
  const char *home = getenv("HOME");
  if (home == NULL || home[0] == '\0' || token->text == NULL) return 1;
  const char *tilde = token->text + offset;
  // An unquoted `~` up to an unquoted `/`, or `:` in an assignment's value.
  if (tilde[0] != '~' || (tilde[1] != '\0' && tilde[1] != '/' && (offset == 0 || tilde[1] != ':')) ||
      (token->quote_mask != NULL && (token->quote_mask[offset] != 'u' ||
          (tilde[1] != '\0' && token->quote_mask[offset + 1] != 'u')))) return 1;
  const size_t home_length = strlen(home);
  const size_t suffix_length = strlen(tilde + 1);
  if (offset > SIZE_MAX - home_length - suffix_length - 1) return 0;
  const size_t length = offset + home_length + suffix_length;
  char *expanded = malloc(length + 1);
  char *mask = malloc(length + 1);
  if (expanded == NULL || mask == NULL) { free(expanded); free(mask); return 0; }
  memcpy(expanded, token->text, offset);
  memcpy(expanded + offset, home, home_length);
  memcpy(expanded + offset + home_length, tilde + 1, suffix_length + 1);
  memset(mask, 'u', length);
  if (token->quote_mask) {
    memcpy(mask, token->quote_mask, offset);
    memcpy(mask + offset + home_length, token->quote_mask + offset + 1, suffix_length);
  }
  memset(mask + offset, 'q', home_length);
  mask[length] = '\0';
  free(token->quote_mask);
  token->quote_mask = mask;
  free(token->text);
  token->text = expanded;
  return 1;
}

// Returns 1 on success, 0 when out of memory and -1 after an expansion error.
static int expand_word(Shell *shell, Token *token, size_t tilde_offset) {
  if (!expand_tilde(token, tilde_offset)) return 0;
  // In an assignment a `~` also expands after each unquoted `:` (PATH=a:~/bin).
  for (size_t index = tilde_offset; tilde_offset != 0 && token->text[index] != '\0'; index++) {
    if (token->text[index] == SLOP_DEFERRED_DOLLAR) {
      // Skip a deferred expansion: its length, a colon, then its text.
      char *payload;
      const size_t length = strtoul(token->text + index + 1, &payload, 10);
      if (*payload == ':') index = (size_t)(payload - token->text) + length;
    } else if (token->text[index] == ':' &&
               (token->quote_mask == NULL || token->quote_mask[index] == 'u') &&
               !expand_tilde(token, index + 1)) {
      return 0;
    }
  }
  return expand_dollars(shell, token);
}

static int expand_redirections(Shell *shell, Token *tokens, size_t start,
                               size_t end) {
  for (size_t index = start; index < end; index++) {
    Token *token = &tokens[index];
    if (token->kind == TOKEN_HEREDOC) {
      index++;
    } else if (token_is_file_redirection(token->kind)) {
      const int expanded = expand_word(shell, &tokens[++index], 0);
      if (expanded <= 0) return expanded;
    } else if ((token->kind == TOKEN_DUP_INPUT ||
                token->kind == TOKEN_DUP_OUTPUT) &&
               token->target_descriptor == SLOP_DYNAMIC_DESCRIPTOR) {
      const int expanded = expand_word(shell, token, 0);
      if (expanded <= 0) return expanded;
      if (strcmp(token->text, "-") == 0) {
        token->target_descriptor = -1;
      } else if (token->text[0] >= '0' && token->text[0] <= '9' &&
                 token->text[1] == '\0') {
        token->target_descriptor = token->text[0] - '0';
      } else {
        fprintf(stderr, "slop: %s: bad file descriptor\n", token->text);
        return -1;
      }
    }
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
  const int expanded = token->quoted
      ? buffer_append(&contents, token->text, strlen(token->text))
      : expand_heredoc(shell, token->text, &contents);
  if (!expanded) {
    free(contents.data);
    return expansion_error(shell);
  }
  const int descriptor = spool_file();
  const int written = descriptor >= 0 &&
      write_all(descriptor, contents.data, contents.length) &&
      lseek(descriptor, 0, SEEK_SET) == 0;
  free(contents.data);
  if (descriptor >= 0 && !written) {
    close(descriptor);
    return -1;
  }
  return descriptor;
}

// An IFS byte splits only where an unquoted expansion produced it.
static int splits_field(const Token *token, const char *ifs, const char *byte) {
  return ifs_byte(ifs, *byte) &&
         (token->quote_mask == NULL || token->quote_mask[byte - token->text] == 'e');
}

static int expand_word_arguments(Shell *shell, Arguments *arguments,
                                 const Token *token) {
  if (token->positional_fields) {
    for (int index = 1; index < shell->argc; index++) {
      if (!argument_push(arguments, shell->argv[index])) return 0;
    }
    return 1;
  }
  const char *boundary = token->quote_mask ? strchr(token->quote_mask, 'f') : NULL;
  if (boundary != NULL) {
    const size_t length = (size_t)(boundary - token->quote_mask);
    Token head = *token, tail = *token;
    head.text = strndup(token->text, length);
    head.quote_mask = strndup(token->quote_mask, length);
    tail.text = token->text + length + 1;
    tail.quote_mask = token->quote_mask + length + 1;
    const int ok = head.text != NULL && head.quote_mask != NULL &&
        expand_word_arguments(shell, arguments, &head) &&
        expand_word_arguments(shell, arguments, &tail);
    free(head.text);
    free(head.quote_mask);
    return ok;
  }
  if (!token->split) return expand_glob(arguments, token);
  if (token->quoted && !token->text[0]) return argument_push(arguments, "");
  const char *ifs = getenv("IFS");
  if (ifs == NULL) ifs = " \t\n";
  if (ifs[0] == '\0') return expand_glob(arguments, token);
  // POSIX 2.6.5: IFS white space around a field is dropped; every other IFS
  // byte ends a field, so two of them in a row hold an empty one.
  const char *cursor = token->text;
  while (splits_field(token, ifs, cursor) && isspace((unsigned char)*cursor)) cursor++;
  while (*cursor != '\0') {
    const char *start = cursor;
    while (*cursor != '\0' && !splits_field(token, ifs, cursor)) cursor++;
    const char *end = cursor;
    while (splits_field(token, ifs, cursor) && isspace((unsigned char)*cursor)) cursor++;
    if (splits_field(token, ifs, cursor)) {
      cursor++;
      while (splits_field(token, ifs, cursor) && isspace((unsigned char)*cursor)) cursor++;
    }
    Token field = {
        .kind = TOKEN_WORD,
        .text = strndup(start, (size_t)(end - start)),
        .quote_mask = token->quote_mask ? token->quote_mask + (start - token->text) : NULL,
    };
    const int ok = field.text != NULL &&
        (end == start ? argument_push(arguments, "") : expand_glob(arguments, &field));
    free(field.text);
    if (!ok) return 0;
  }
  return 1;
}

// Assignments are recognized before expansion and only with an unquoted name.
static int assignment_word(const Token *token, size_t *name_length) {
  return token->kind == TOKEN_WORD && assignment(token->text, name_length) &&
         (token->quote_mask == NULL ||
          memchr(token->quote_mask, 'q', *name_length + 1) == NULL);
}

// Decides how a stage runs once its command name is known, and routes its
// output before the command's own redirections apply. Returns 0 on refusal.
static int stage_open(Shell *shell, Stage *stage, DescriptorState *descriptors,
                      const char *name) {
  char path[PATH_MAX];
  const int program = name != NULL && function_lookup(shell->functions, name) == NULL &&
      !builtin_name(name) && unsupported_builtin(name) == NULL &&
      resolve_command(name, path_variable(), path, sizeof(path)) == COMMAND_FOUND;
  if (stage->background && !program) {
    fprintf(stderr, "slop: %s: only a program can run in the background; use slop -c '...' &\n",
            name == NULL ? "&" : name);
    return 0;
  }
  if (stage->background && background_count == sizeof(background_programs) / sizeof(background_programs[0])) {
    fputs("slop: too many background programs; `wait` collects them\n", stderr);
    return 0;
  }
  // Without job control a background program does not read the terminal.
  const int null = stage->background && stage->first
      ? high_descriptor(open("/dev/null", O_RDONLY)) : -1;
  if (null >= 0) {
    (void)descriptor_state_duplicate(descriptors, STDIN_FILENO, null);
    close(null);
  }
  if (!stage->piped) return 1;
  int ends[2] = {-1, -1};
  if (!program) {
    stage->spooled = 1;
    ends[0] = ends[1] = spool_file();
  } else if (pipe(ends) == 0) {
    // Close-on-exec, so a stage holds no end of a pipe but its own 0 and 1.
    ends[0] = high_descriptor(ends[0]);
    ends[1] = high_descriptor(ends[1]);
  }
  stage->output = ends[0];
  const int routed = ends[0] >= 0 && ends[1] >= 0 &&
      descriptor_state_duplicate(descriptors, STDOUT_FILENO, ends[1]);
  if (!routed) fprintf(stderr, "slop: pipeline: %s\n", strerror(errno));
  if (program && ends[1] >= 0) close(ends[1]);
  return routed;
}

// POSIX order: command words, then redirection words, then assignments from
// left to right, each visible to the next. Redirections apply after tracing.
static int run_simple_mutable(Shell *shell, Token *tokens, size_t start,
                              size_t end) {
  Stage *stage = shell->stage;
  shell->stage = NULL;
  Arguments assignments = {0}, arguments = {0};
  DescriptorState descriptors = {0};
  EnvironmentChange *changes = NULL;
  size_t changed = 0, changes_capacity = 0;
  int status = 1, expansion = 1;
  shell->substitution_status = 0;
  size_t command_start = end;
  for (size_t index = start; index < end; index++) {
    Token *token = &tokens[index];
    if (token_is_redirection(token->kind)) {
      if (token_is_file_redirection(token->kind) &&
          (++index >= end || tokens[index].kind != TOKEN_WORD)) {
        fputs("slop: redirection requires a path\n", stderr);
        status = 2;
        goto done;
      }
      continue;
    }
    if (token->kind != TOKEN_WORD) {
      fputs("slop: invalid simple command\n", stderr);
      status = 2;
      goto done;
    }
    size_t name_length;
    if (command_start == end && assignment_word(token, &name_length)) continue;
    if (command_start == end) command_start = index;
    const int declaration = arguments.count != 0 &&
        (strcmp(arguments.items[0], "export") == 0 ||
         strcmp(arguments.items[0], "local") == 0) &&
        assignment_word(token, &name_length);
    expansion = expand_word(shell, token, declaration ? name_length + 1 : 0);
    if (expansion <= 0) goto expansion_failed;
    if (!(declaration ? argument_push(&arguments, token->text)
                      : expand_word_arguments(shell, &arguments, token)))
      goto memory_error;
  }
  expansion = expand_redirections(shell, tokens, start, end);
  if (expansion <= 0) goto expansion_failed;

  const int persistent = arguments.count == 0 ||
      (arguments.count == 1 && strcmp(arguments.items[0], "exec") == 0);
  for (size_t index = start; index < command_start; index++) {
    Token *token = &tokens[index];
    size_t name_length;
    if (token_is_redirection(token->kind)) {
      if (token_is_file_redirection(token->kind)) index++;
      continue;
    }
    if (!assignment_word(token, &name_length)) continue;
    expansion = expand_word(shell, token, name_length + 1);
    if (expansion <= 0) goto expansion_failed;
    if (!argument_push(&assignments, token->text)) goto memory_error;
    if (persistent) {
      if (set_assignment(token->text) < 0) goto memory_error;
      continue;
    }
    if (!grow((void **)&changes, &changes_capacity, changed + 1,
              sizeof(*changes)) ||
        !save_environment_change(token->text, name_length, &changes[changed]))
      goto memory_error;
    changed++;
  }
  trace_simple(shell, &assignments, &arguments, tokens, start, end);
  if (stage != NULL && !stage_open(shell, stage, &descriptors,
                                   arguments.count == 0 ? NULL : arguments.items[0])) {
    status = 2;
    goto done;
  }
  if (!apply_redirections(shell, &descriptors, tokens, start, end)) goto done;
  if (arguments.count == 0) {
    status = shell->substitution_status;
  } else if (persistent) {
    descriptor_state_commit(&descriptors, shell->descriptors);
    status = 0;
  } else {
    // stage_open found a program, so these words reach spawn_command.
    if (stage != NULL && (stage->piped || stage->background) && !stage->spooled)
      shell->stage = stage;
    status = run_command_words(shell, (int)arguments.count, arguments.items);
    shell->stage = NULL;
  }
  goto done;

memory_error:
  fputs("slop: out of memory\n", stderr);
  goto done;
expansion_failed:
  if (!shell->active) status = shell->exit_status;
  else if (expansion == 0) fputs("slop: out of memory\n", stderr);
done:
  restore_environment_changes(changes, changed);
  free(changes);
  descriptor_state_restore(&descriptors);
  arguments_dispose(&assignments);
  arguments_dispose(&arguments);
  return status;
}

static int run_simple(Shell *shell, Token *tokens, size_t start, size_t end) {
  const size_t count = end - start;
  TokenList copy = {0};
  if (!tokens_clone_range(tokens, start, end, &copy)) {
    fputs("slop: out of memory\n", stderr);
    return 1;
  }
  const int status = run_simple_mutable(shell, copy.items, 0, count);
  tokens_dispose(&copy);
  return status;
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

static int compound_start(const CommandParser *parser);
static int parse_compound(Shell *shell, CommandParser *parser, int execute,
                          int suppress_errexit);

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
  if (!valid_name(first, name_length)) return 0;
  while (brace_index < parser->end &&
         parser->tokens[brace_index].kind == TOKEN_SEMI &&
         parser->tokens[brace_index].newline) brace_index++;
  // POSIX: the body is any compound command; `{` is only the common one.
  CommandParser body = *parser;
  body.cursor = brace_index;
  if (!compound_start(&body)) return -2;
  *name = strndup(first, name_length);
  if (*name == NULL) return -1;
  *body_start = brace_index + (command_word(&body, "{") ? 1 : 0);
  return 1;
}

static int parse_group(Shell *shell, CommandParser *parser, int execute,
                       int suppress_errexit) {
  parser->cursor++;
  unsigned stopped = 0;
  const int status = execute_list(shell, parser, execute, suppress_errexit,
                                  STOP_RBRACE, &stopped);
  if (parser->error || stopped != STOP_RBRACE) {
    fputs("slop: group requires }\n", stderr);
    parser->error = 1;
    return 2;
  }
  parser->cursor++;
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
                                       DescriptorState *descriptors) {
  TokenList copy = {0};
  if (!tokens_clone_range(tokens, start, end, &copy)) return 0;
  const int ok = expand_redirections(shell, copy.items, 0, end - start) > 0 &&
      apply_redirections(shell, descriptors, copy.items, 0, end - start);
  tokens_dispose(&copy);
  return ok;
}

static int parse_subshell(Shell *shell, CommandParser *parser, int execute,
                          int suppress_errexit) {
  parser->cursor++;
  Subshell subshell;
  if (execute && !subshell_enter(shell, &subshell)) {
    parser->error = 1;
    return 2;
  }
  unsigned stopped = 0;
  int status = execute_list(execute ? &subshell.shell : shell, parser, execute,
                            suppress_errexit, STOP_RPAREN, &stopped);
  if (execute) status = subshell_leave(shell, &subshell, status);
  if (parser->error || stopped != STOP_RPAREN) {
    fputs("slop: subshell requires )\n", stderr);
    parser->error = 1;
    return 2;
  }
  parser->cursor++;
  return status;
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
  // A `{` body is kept as its list; any other compound command as itself.
  const int braced = body_start != 0 && parser->tokens[body_start - 1].kind == TOKEN_WORD &&
      !parser->tokens[body_start - 1].quoted &&
      strcmp(parser->tokens[body_start - 1].text, "{") == 0;
  if (braced) (void)execute_list(shell, &body, 0, 1, STOP_RBRACE, &stopped);
  else (void)parse_compound(shell, &body, 0, 1);
  if (body.error || (braced && stopped != STOP_RBRACE)) {
    fprintf(stderr, "slop: function %s requires a complete body\n", name);
    parser->error = 1;
    return 2;
  }
  if (define && !function_define(shell->functions, name, parser->tokens,
                                 body_start, body.cursor)) {
    fputs("slop: function definition: out of memory\n", stderr);
    parser->error = 1;
    return 2;
  }
  parser->cursor = body.cursor + (braced ? 1 : 0);
  return 0;
}

static int expand_loop_words(Shell *shell, Token *tokens, size_t start,
                             size_t end, Arguments *values) {
  for (size_t index = start; index < end; index++) {
    if (tokens[index].kind != TOKEN_WORD) {
      fputs("slop: invalid operator in for word list\n", stderr);
      return 0;
    }
    TokenList copy = {0};
    if (!tokens_clone_range(tokens, index, index + 1, &copy)) return 0;
    const int ok = expand_word(shell, copy.items, 0) > 0 &&
        expand_word_arguments(shell, values, copy.items);
    tokens_dispose(&copy);
    if (!ok) return 0;
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
  int failed = 0;
  if (command_word(parser, "in")) {
    parser->cursor++;
    const size_t words_start = parser->cursor;
    while (parser->cursor < parser->end &&
           parser->tokens[parser->cursor].kind != TOKEN_SEMI) {
      parser->cursor++;
    }
    if (execute && !expand_loop_words(shell, parser->tokens, words_start,
                                      parser->cursor, &values)) {
      arguments_dispose(&values);
      execute = 0;
      failed = 1;
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
    if (!shell->active) break;
  }
  if (execute) shell->loop_depth--;
  parser->cursor = body_end + 1;
  arguments_dispose(&values);
  free(variable);
  return failed ? 1 : iterations == 0 ? 0 : status;

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
    // The loop's status is that of the last body it ran, also when `break`
    // or `continue` (status 0) ended that body; a `break` in the condition
    // runs no body.
    const int ran = selected && shell->loop_control == LOOP_CONTROL_NONE;
    const int iteration_status = execute_list(shell, &body, selected,
                                              suppress_errexit,
                                              STOP_DONE, &stopped);
    if (ran) body_status = iteration_status;
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
    if (!shell->active) break;
  }
  if (execute) shell->loop_depth--;
  parser->cursor = body_end + 1;
  return body_status;
}

// A case pattern keeps only its unquoted metacharacters active.
static char *expand_case_text(Shell *shell, const Token *token, int pattern) {
  TokenList copy = {0};
  if (!tokens_clone_range(token, 0, 1, &copy)) return NULL;
  char *result = NULL;
  if (expand_word(shell, copy.items, 0) > 0) {
    Buffer text = {0};
    if (!pattern) {
      result = copy.items[0].text;
      copy.items[0].text = NULL;
    } else if (glob_pattern(&text, copy.items, 0, strlen(copy.items[0].text))) {
      result = buffer_release(&text);
    } else {
      free(text.data);
    }
  }
  tokens_dispose(&copy);
  return result;
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
      ? expand_case_text(shell, &parser->tokens[parser->cursor], 0) : NULL;
  int failed = execute && value == NULL;
  if (failed) execute = 0;
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
      return failed ? 1 : status;
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
      if (execute && !matched && !clause_match) {
        char *pattern = expand_case_text(shell, token, 1);
        if (pattern == NULL) {
          failed = 1;
          execute = 0;
        } else if (fnmatch(pattern, value, 0) == 0) {
          clause_match = 1;
        }
        free(pattern);
      }
      parser->cursor++;
      need_pattern = 0;
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
      return failed ? 1 : status;
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

static int compound_start(const CommandParser *parser) {
  return (parser->cursor < parser->end &&
          parser->tokens[parser->cursor].kind == TOKEN_LPAREN) ||
         command_word(parser, "{") || command_word(parser, "if") ||
         command_word(parser, "for") || command_word(parser, "while") ||
         command_word(parser, "until") || command_word(parser, "case");
}

static int parse_compound(Shell *shell, CommandParser *parser, int execute,
                          int suppress_errexit) {
  if (command_word(parser, "{"))
    return parse_group(shell, parser, execute, suppress_errexit);
  if (command_word(parser, "if"))
    return parse_if(shell, parser, execute, suppress_errexit);
  if (command_word(parser, "for"))
    return parse_for(shell, parser, execute, suppress_errexit);
  if (command_word(parser, "case"))
    return parse_case(shell, parser, execute, suppress_errexit);
  if (command_word(parser, "while") || command_word(parser, "until"))
    return parse_while(shell, parser, execute, suppress_errexit,
                       command_word(parser, "until"));
  return parse_subshell(shell, parser, execute, suppress_errexit);
}

// Parses one command without running it. Returns where a compound body ends
// (and its trailing redirections begin); the cursor moves past the command.
static size_t skip_command(Shell *shell, CommandParser *parser,
                           unsigned stops) {
  if (compound_start(parser)) {
    (void)parse_compound(shell, parser, 0, 1);
    const size_t body_end = parser->cursor;
    if (!parser->error &&
        !compound_redirection_end(parser, body_end, &parser->cursor))
      parser->error = 1;
    return body_end;
  }
  const size_t start = parser->cursor;
  while (parser->cursor < parser->end) {
    const TokenKind kind = parser->tokens[parser->cursor].kind;
    if (kind == TOKEN_SEMI || kind == TOKEN_CASE_END || kind == TOKEN_AND ||
        kind == TOKEN_OR || kind == TOKEN_PIPE ||
        (kind == TOKEN_RPAREN && (stops & STOP_RPAREN) != 0)) break;
    parser->cursor++;
  }
  if (start == parser->cursor) {
    fputs("slop: expected a command\n", stderr);
    parser->error = 1;
  }
  return parser->cursor;
}

static int run_command(Shell *shell, CommandParser *parser, size_t body_end,
                       size_t end, int suppress_errexit) {
  int status = 1;
  if (!compound_start(parser)) {
    status = run_simple(shell, parser->tokens, parser->cursor, end);
  } else {
    DescriptorState descriptors = {0};
    if (apply_compound_redirections(shell, parser->tokens, body_end, end,
                                    &descriptors))
      status = parse_compound(shell, parser, 1, suppress_errexit);
    descriptor_state_restore(&descriptors);
  }
  parser->cursor = end;
  return status;
}

static int pipe_follows(const CommandParser *parser) {
  return parser->cursor < parser->end &&
         parser->tokens[parser->cursor].kind == TOKEN_PIPE;
}

typedef struct { pid_t pid; int status; } StageResult;

// Every stage is a subshell. The programs of a pipeline run at the same time
// over kernel pipes: one is started, not waited for, and collected at the
// end. A stage that runs in the shell (a builtin, a function, a compound
// command) is serial: it reads a program's pipe while that program runs, but
// its own output collects in a spool file that the next stage reads once it
// has finished, because nothing would drain a pipe while the shell writes.
static int run_pipeline(Shell *shell, CommandParser *parser, size_t end,
                        int suppress_errexit, unsigned stops, int background) {
  StageResult *results = NULL;
  size_t count = 0, capacity = 0;
  int input = -1, status = 1, failure = 0;
  for (;;) {
    CommandParser probe = *parser;
    const size_t body_end = skip_command(shell, &probe, stops);
    const int last = !pipe_follows(&probe);
    int compound = compound_start(parser);
    size_t start = parser->cursor, stop = probe.cursor;
    // `( PROGRAM ARG... ) &` is `PROGRAM ARG... &`: a stage is a subshell already.
    CommandParser inner = {.tokens = parser->tokens, .cursor = start + 1, .end = body_end - 1};
    if (background && compound && body_end == stop && body_end - start > 2 &&
        parser->tokens[start].kind == TOKEN_LPAREN && !compound_start(&inner)) {
      size_t word = inner.cursor;
      while (word < inner.end && (parser->tokens[word].kind == TOKEN_WORD ||
                                  token_is_redirection(parser->tokens[word].kind))) word++;
      if (word == inner.end) { start = inner.cursor; stop = inner.end; compound = 0; }
    }
    Stage stage = {.piped = !last, .background = background, .first = input < 0, .output = -1};
    if (!grow((void **)&results, &capacity, count + 1, sizeof(*results))) {
      fputs("slop: pipeline: out of memory\n", stderr);
      break;
    }
    Subshell subshell;
    status = 1;
    if (compound && background) {
      fputs("slop: only a program can run in the background; use slop -c '...' &\n", stderr);
      status = 2;
    } else if (compound && !last && (stage.spooled = 1, stage.output = spool_file()) < 0) {
      fprintf(stderr, "slop: pipeline: %s\n", strerror(errno));
    } else if (subshell_enter(shell, &subshell)) {
      if ((input < 0 || descriptor_state_duplicate(&subshell.descriptors,
                                                   STDIN_FILENO, input)) &&
          (!compound || last || descriptor_state_duplicate(&subshell.descriptors,
                                                           STDOUT_FILENO, stage.output))) {
        CommandParser command = *parser;
        command.cursor = start;
        if (!compound && (!last || background)) subshell.shell.stage = &stage;
        status = run_command(&subshell.shell, &command, compound ? body_end : stop,
                             stop, suppress_errexit);
      }
      status = subshell_leave(shell, &subshell, status);
    }
    // `wait` collects a background program; the pipeline collects the others.
    if (background && stage.pid != 0)
      background_programs[background_count++] = shell->last_background = stage.pid;
    results[count++] = (StageResult){background ? 0 : stage.pid, status};
    // Closing a pipe's read end is what stops a producer nobody reads.
    if (input >= 0) close(input);
    input = stage.spooled && stage.output >= 0 ? spool_rewind(stage.output) : stage.output;
    parser->cursor = probe.cursor + 1;
    // A refused or failed background stage starts nothing after it.
    if (last || !shell->active || (background && stage.pid == 0)) break;
    // A stage that failed before it had an output leaves an empty one.
    if (input < 0 && (input = spool_file()) < 0) {
      fprintf(stderr, "slop: pipeline: %s\n", strerror(errno));
      break;
    }
  }
  if (input >= 0) close(input);
  for (size_t index = 0; index < count; index++) {
    StageResult *result = &results[index];
    if (result->pid != 0) result->status = wait_command(shell, result->pid);
    if (result->status != 0) failure = result->status;
    status = result->status;
  }
  free(results);
  parser->cursor = end;
  return shell->pipefail && failure != 0 ? failure : status;
}

// `listed` says the pipeline follows `!`, `&&` or `||`.
static int execute_pipeline(Shell *shell, CommandParser *parser, int execute,
                            int suppress_errexit, unsigned stops, int listed) {
  CommandParser probe = *parser;
  const size_t body_end = skip_command(shell, &probe, stops);
  const int single = !pipe_follows(&probe);
  while (!probe.error && pipe_follows(&probe)) {
    probe.cursor++;
    (void)skip_command(shell, &probe, stops);
  }
  if (probe.error) {
    parser->error = 1;
    return 2;
  }
  const TokenKind separator = probe.cursor < probe.end
      ? probe.tokens[probe.cursor].kind : TOKEN_END;
  const int background = separator == TOKEN_SEMI && probe.tokens[probe.cursor].background;
  if (background && listed) {
    fputs("slop: & runs one program or pipeline, not a !, && or || list; use slop -c '...' &\n", stderr);
    parser->error = 1;
    return 2;
  }
  if (!execute) {
    parser->cursor = probe.cursor;
    return 0;
  }
  const int ignored = shell->errexit_ignored;
  shell->errexit_ignored = suppress_errexit || separator == TOKEN_AND ||
                           separator == TOKEN_OR;
  // A compound command other than a subshell has the status of a command in it.
  const int derived = single && compound_start(parser) &&
                      parser->tokens[parser->cursor].kind != TOKEN_LPAREN;
  if (derived) shell->errexit_exempt = 0;
  const int status = single && !background
      ? run_command(shell, parser, body_end, probe.cursor, shell->errexit_ignored)
      : run_pipeline(shell, parser, probe.cursor, shell->errexit_ignored, stops, background);
  // `set -e` ends the shell where a command fails, not where the status of
  // that failure arrives: a failure that was ignored stays ignored when it
  // becomes the status of the loop, group or conditional around it.
  if (shell->errexit_ignored) shell->errexit_exempt = 1;
  else if (!derived) shell->errexit_exempt = 0;
  if (status != 0 && shell->active && shell->errexit && !shell->errexit_exempt) {
    shell->active = 0;
    shell->exit_status = status;
    shell->errexit_fired = 1;
  }
  shell->errexit_ignored = ignored;
  return status;
}

static int execute_list(Shell *shell, CommandParser *parser, int execute,
                        int suppress_errexit, unsigned stops,
                        unsigned *stopped) {
  int status = 0;
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

    const int should_run = execute && shell->active && !aborted &&
        shell->loop_control == LOOP_CONTROL_NONE && !shell->returning &&
        (previous == TOKEN_SEMI ||
         (previous == TOKEN_AND && status == 0) ||
         (previous == TOKEN_OR && status != 0));
    if (should_run) shell->lineno = shell->line_base + parser->tokens[parser->cursor].line;
    // `time` measures the whole pipeline that follows, compound or not.
    const int timed = command_word(parser, "time");
    struct timespec started = {0};
    if (timed) {
      parser->cursor++;
      if (command_word(parser, "-p")) parser->cursor++;
      if (should_run) clock_gettime(CLOCK_MONOTONIC, &started);
    }
    const int invert = command_word(parser, "!");
    if (invert && ++parser->cursor == parser->end) {
      fputs("slop: expected a command after !\n", stderr);
      parser->error = 1;
      return 2;
    }
    const int suppress_command_errexit =
        suppress_errexit || invert || shell->errexit_ignored;
    char *function_name = NULL;
    size_t function_body_start = 0;
    const int definition = function_header(parser, &function_name,
                                           &function_body_start);
    if (definition < 0) {
      fputs(definition == -2 ? "slop: a function body is a compound command: { ...; } or ( ... )\n"
                            : "slop: function definition: out of memory\n", stderr);
      parser->error = 1;
      return 2;
    }
    if (definition > 0) {
      const int result = parse_function_definition(shell, parser, should_run,
                                                   function_name,
                                                   function_body_start);
      free(function_name);
      if (parser->error) return 2;
      if (should_run) status = result;
    } else {
      const int result = execute_pipeline(shell, parser, should_run,
                                          suppress_command_errexit, stops,
                                          invert || previous == TOKEN_AND || previous == TOKEN_OR);
      if (parser->error) return 2;
      if (should_run) status = result;
    }

    if (should_run) {
      if (timed) {
        struct timespec finished;
        clock_gettime(CLOCK_MONOTONIC, &finished);
        fprintf(stderr, "real %.3f\n", (double)(finished.tv_sec - started.tv_sec) +
                (double)(finished.tv_nsec - started.tv_nsec) / 1e9);
      }
      if (invert) status = status == 0;
      shell->last_status = status;
      poll_interrupt(shell);
      run_traps(shell);
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
  const int base = shell->line_base;
  shell->line_base = shell->lineno == 0 ? 0 : shell->lineno - 1;
  int status = execute_tokens(shell, &tokens);
  shell->line_base = base;
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

  const char *cursor = path_variable(), *entry;
  size_t length;
  while (next_path_directory(&cursor, &entry, &length)) {
    char *directory = strndup(entry, length);
    if (directory == NULL ||
        !complete_directory(directory, word, "", 1, completions)) {
      free(directory);
      return 0;
    }
    free(directory);
  }
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
enum editor_key { KEY_NONE, KEY_UP, KEY_DOWN, KEY_RIGHT, KEY_LEFT, KEY_DELETE, KEY_HOME, KEY_END };

static enum editor_key read_escape_sequence(void) {
  int byte = dolly_terminal_read_raw_timeout(25);
  if (byte != '[' && byte != 'O') return KEY_NONE;
  int final = dolly_terminal_read_raw_timeout(25);
  if (final < 0) return KEY_NONE;
  if (final >= '0' && final <= '9') {
    int number = 0;
    do {
      number = number * 10 + final - '0';
      final = dolly_terminal_read_raw_timeout(25);
    } while (final >= '0' && final <= '9');
    while (final >= 0 && final != '~' && !(final >= '@' && final <= '~')) {
      final = dolly_terminal_read_raw_timeout(25);
    }
    if (final != '~') return KEY_NONE;
    if (number == 3) return KEY_DELETE;
    if (number == 1 || number == 7) return KEY_HOME;
    if (number == 4 || number == 8) return KEY_END;
    return KEY_NONE;
  }
  switch (final) {
    case 'A': return KEY_UP;
    case 'B': return KEY_DOWN;
    case 'C': return KEY_RIGHT;
    case 'D': return KEY_LEFT;
    case 'H': return KEY_HOME;
    case 'F': return KEY_END;
    default: return KEY_NONE;
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
    enum editor_key key = byte == 0x1b ? read_escape_sequence() : KEY_NONE;
    if (key != KEY_NONE) byte = 0;
    if (key == KEY_UP || key == KEY_DOWN) {
      if (key == KEY_UP && history_cursor != 0) {
        if (history_cursor == history->count) {
          free(draft);
          draft = strdup(line);
        }
        editor_replace(line, &length, &cursor,
                       history->items[--history_cursor]);
      } else if (key == KEY_DOWN && history_cursor < history->count) {
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
    if (key == KEY_RIGHT || byte == 0x06) {
      if (cursor < length) {
        cursor++;
        editor_write("\033[C");
      }
      continue;
    }
    if (key == KEY_LEFT || byte == 0x02) {
      if (cursor != 0) {
        cursor--;
        editor_write("\033[D");
      }
      continue;
    }
    if (key == KEY_DELETE || byte == 0x04) {
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
    if (key == KEY_HOME || byte == 0x01) {
      cursor = 0;
      redraw_line(line, length, cursor);
      continue;
    }
    if (key == KEY_END || byte == 0x05) {
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

// Ctrl+C is input to the line editor and SIGINT to the commands it runs.
static void terminal_signals(int enabled) {
  const int mode = dolly_terminal_mode_get(STDIN_FILENO);
  if (mode >= 0) (void)dolly_terminal_mode_set(STDIN_FILENO, enabled
      ? (unsigned)mode | DOLLY_TERMINAL_ISIG : (unsigned)mode & ~DOLLY_TERMINAL_ISIG);
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
  const struct sigaction interrupt = {.sa_handler = request_interrupt};
  if (sigaction(SIGINT, &interrupt, NULL) != 0) {
    fprintf(stderr, "slop: SIGINT: %s\n", strerror(errno));
    return 1;
  }
  char *line = malloc(SLOP_MAX_LINE + 1);
  if (line == NULL) return 1;
  History history = {0};
  history_load(&history);
  terminal_signals(0);
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
      // A blank/comment-only line is not a new command. Preserve $? as POSIX
      // shells do, but do not report that inherited failure again. Otherwise
      // every Enter after an interrupted program repeats "slop: status 130".
      const char *command = line;
      while (isspace((unsigned char)*command)) command++;
      report_status = *command != '\0' && *command != '#';
      if (report_status) {
        interrupt_requested = 0;
        terminal_signals(1);
        shell->last_status = execute_text(shell, line);
        terminal_signals(0);
      }
    }
    if (shell->terminating_signal || shell->errexit_fired) {
      shell->last_status = shell->exit_status;
      shell->active = 1;
      shell->terminating_signal = shell->errexit_fired = 0;
      shell->exit_status = 0;
    }
    if (report_status && shell->last_status != 0 &&
        shell->last_status != 127 && shell->active)
      fprintf(stderr, "slop: status %d\n", shell->last_status);
    dolly_terminal_publish_result(shell->last_status);
  }
  terminal_signals(1);
  history_dispose(&history);
  free(line);
  return leave_shell(shell, shell->active ? shell->last_status : shell->exit_status);
}

static char *read_descriptor(int descriptor) {
  Buffer source = {0};
  char bytes[4096];
  ssize_t count;
  while ((count = read(descriptor, bytes, sizeof(bytes))) != 0) {
    if (count < 0 && errno == EINTR) continue;
    if (count < 0 || !buffer_append(&source, bytes, (size_t)count)) {
      free(source.data);
      return NULL;
    }
  }
  return buffer_release(&source);
}

static char *read_script(const char *path) {
  const int descriptor = open(path, O_RDONLY | O_CLOEXEC);
  char *source = descriptor < 0 ? NULL : read_descriptor(descriptor);
  if (source == NULL) fprintf(stderr, "slop: %s: %s\n", path, strerror(errno));
  if (descriptor >= 0) close(descriptor);
  return source;
}

static void usage(FILE *stream) {
  fputs("usage: slop [-cenux] [COMMAND [NAME [ARG ...]] | FILE [ARG ...]]\n",
        stream);
}

static int run_script(Shell *shell, const char *source) {
  const int status = execute_text(shell, source);
  const int result = leave_shell(shell, shell->active ? status : shell->exit_status);
  shell_argv_dispose(shell);
  functions_dispose(shell->functions);
  if (shell->terminating_signal) {
    signal(shell->terminating_signal, SIG_DFL);
    raise(shell->terminating_signal);
  }
  return result;
}

int main(int argc, char **argv) {
  Functions functions = {0};
  Shell shell = {
      .active = 1,
      .functions = &functions,
      .argc = argc,
      .argv = argv,
  };
  for (char **entry = environ; entry != NULL && *entry != NULL; entry++) {
    char *name = strndup(*entry, strcspn(*entry, "="));
    if (name == NULL || !export_variable(name)) { perror("slop"); return 1; }
    free(name);
  }
  int index = 1;
  int command = 0;
  if (index < argc && strcmp(argv[index], "--help") == 0) { usage(stdout); return 0; }
  for (; index < argc && argv[index][0] == '-' && argv[index][1] != '\0'; index++) {
    if (strcmp(argv[index], "--") == 0) {
      index++;
      break;
    }
    for (size_t option = 1; argv[index][option] != '\0'; option++) {
      if (argv[index][option] == 'c') command = 1;
      else if (argv[index][option] == 'e') shell.errexit = 1;
      else if (argv[index][option] == 'n') shell.noexec = 1;
      else if (argv[index][option] == 'u') shell.nounset = 1;
      else if (argv[index][option] == 'x') shell.xtrace = 1;
      else {
        fprintf(stderr, "slop: unsupported option: -%c\n",
                argv[index][option]);
        return 2;
      }
    }
  }
  if (!export_variable("PWD")) { perror("slop"); return 1; }
  if (index == argc && !command && isatty(STDIN_FILENO)) {
    const int status = interactive(&shell);
    shell_argv_dispose(&shell);
    functions_dispose(&functions);
    return status;
  }
  char *cwd = getcwd(NULL, 0);
  if (cwd == NULL) { perror("slop: getcwd"); return 1; }
  const int cwd_status = setenv("PWD", cwd, 1);
  free(cwd);
  if (cwd_status != 0) { perror("slop: PWD"); return 1; }
  if (command) {
    if (index == argc) { usage(stderr); return 2; }
    const char *text = argv[index++];
    char *default_parameters[] = {"slop", NULL};
    shell.argc = index < argc ? argc - index : 1;
    shell.argv = index < argc ? argv + index : default_parameters;
    return run_script(&shell, text);
  }
  char *source = index == argc ? read_descriptor(STDIN_FILENO)
                               : read_script(argv[index]);
  if (source == NULL) return 1;
  if (index < argc) {
    shell.argc = argc - index;
    shell.argv = argv + index;
  } else {
    shell.argc = 1;
  }
  const int status = run_script(&shell, source);
  free(source);
  return status;
}
