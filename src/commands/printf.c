#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// printf FORMAT [ARGUMENT ...], as POSIX specifies it. Slop includes this file
// and runs the same code itself for the printf that PATH finds in /bin
// (DOLLY_SHELL_UTILITY), so nothing here exits.

typedef struct {
  char **items;
  int count, next, status;
} PrintfOperands;

static const char *printf_operand(PrintfOperands *operands) {
  return operands->next < operands->count ? operands->items[operands->next++] : "";
}

// The escape after a backslash at *cursor, advancing past it: a byte in
// *byte, or 0 for \c, which ends all output. A %b operand writes an octal byte
// as \0 and up to three digits, a format as one to three digits. An unknown
// escape is the backslash itself.
static int printf_escape(const char **cursor, int operand, int *byte) {
  static const char named[256] = {
      ['\\'] = '\\', ['a'] = '\a', ['b'] = '\b', ['e'] = 033, ['E'] = 033, ['f'] = '\f',
      ['n'] = '\n',  ['r'] = '\r', ['t'] = '\t', ['v'] = '\v', ['"'] = '"', ['\''] = '\'',
  };
  const unsigned char next = (unsigned char)**cursor;
  if (next == 'c') return 0;
  *byte = '\\';
  if (named[next] != 0) {
    *byte = named[next];
    (*cursor)++;
  } else if (next >= '0' && next <= '7') {
    if (operand && next == '0') (*cursor)++;
    int value = 0;
    for (int digits = 0; digits < 3 && **cursor >= '0' && **cursor <= '7'; digits++)
      value = value * 8 + *(*cursor)++ - '0';
    *byte = value & 0xff;
  } else if (next == 'x' && isxdigit((unsigned char)(*cursor)[1])) {
    char digits[3] = {(*cursor)[1], 0, 0};
    *cursor += 2;
    if (isxdigit((unsigned char)**cursor)) digits[1] = *(*cursor)++;
    *byte = (int)strtol(digits, NULL, 16);
  }
  return 1;
}

// An operand that is not wholly a number is diagnosed and its value so far
// used, as POSIX says; the status then is 1.
static void printf_check_number(PrintfOperands *operands, const char *text, const char *end) {
  if (errno == ERANGE) fprintf(stderr, "printf: %s: out of range\n", text);
  else if (end == text || *end != '\0') fprintf(stderr, "printf: %s: not a number\n", text);
  else return;
  operands->status = 1;
}

// A leading quote makes the value the next character's code.
static int printf_character_code(const char *text, unsigned long long *value) {
  if (*text != '\'' && *text != '"') return 0;
  *value = (unsigned char)text[1];
  return 1;
}

static long long printf_signed(PrintfOperands *operands, const char *text) {
  unsigned long long code;
  if (*text == '\0') return 0;
  if (printf_character_code(text, &code)) return (long long)code;
  char *end;
  errno = 0;
  const long long value = strtoll(text, &end, 0);
  printf_check_number(operands, text, end);
  return value;
}

static unsigned long long printf_unsigned(PrintfOperands *operands, const char *text) {
  unsigned long long value;
  if (*text == '\0') return 0;
  if (printf_character_code(text, &value)) return value;
  char *end;
  errno = 0;
  value = strtoull(text, &end, 0);
  printf_check_number(operands, text, end);
  return value;
}

// A width or precision: digits in the format, or * for the next operand.
static int printf_amount(PrintfOperands *operands, const char **cursor) {
  if (**cursor == '*') {
    (*cursor)++;
    const long long value = printf_signed(operands, printf_operand(operands));
    return value > INT_MAX ? INT_MAX : value < -INT_MAX ? -INT_MAX : (int)value;
  }
  long long value = 0;
  for (; **cursor >= '0' && **cursor <= '9'; (*cursor)++)
    if (value <= INT_MAX) value = value * 10 + **cursor - '0';
  return value > INT_MAX ? INT_MAX : (int)value;
}

// %s, %c and %b: bytes, cut to the precision and padded to the width.
static void printf_field(const char *bytes, size_t length, int width, int precision, int left) {
  if (precision >= 0 && (size_t)precision < length) length = (size_t)precision;
  if (width < 0) left = 1, width = -width;
  size_t padding = (size_t)width > length ? (size_t)width - length : 0;
  if (!left) for (; padding > 0; padding--) putchar(' ');
  fwrite(bytes, 1, length, stdout);
  for (; padding > 0; padding--) putchar(' ');
}

// %b's operand with its escapes; 0 when a \c in it ended the output.
static int printf_escaped_field(const char *text, int width, int precision, int left) {
  char *bytes = malloc(strlen(text) + 1);
  if (bytes == NULL) { fputs("printf: out of memory\n", stderr); return 0; }
  size_t length = 0;
  int more = 1, byte;
  for (const char *cursor = text; *cursor != '\0' && more;) {
    if (*cursor != '\\') { bytes[length++] = *cursor++; continue; }
    cursor++;
    if ((more = printf_escape(&cursor, 1, &byte))) bytes[length++] = (char)byte;
  }
  printf_field(bytes, length, width, precision, left);
  free(bytes);
  return more;
}

// One conversion after its %; 0 when the output ends here.
static int printf_conversion(PrintfOperands *operands, const char **cursor) {
  const char *start = *cursor;
  char spec[16] = "%";
  for (const char *flag = "-+ #0"; *flag != '\0'; flag++)
    if (memchr(start, *flag, strspn(start, "-+ #0")) != NULL) strncat(spec, flag, 1);
  *cursor += strspn(start, "-+ #0");
  const int left = strchr(spec, '-') != NULL;
  const int width = printf_amount(operands, cursor);
  int precision = -1;
  if (**cursor == '.') {
    (*cursor)++;
    precision = printf_amount(operands, cursor);
  }
  const char conversion = **cursor;
  if (conversion == '\0' || strchr("bcsdiouxXeEfFgGaA", conversion) == NULL) {
    fprintf(stderr, "printf: %%%.*s: invalid conversion\n", (int)(*cursor - start) + (conversion != '\0'), start);
    operands->status = 1;
    return 0;
  }
  (*cursor)++;
  const char *operand = printf_operand(operands);
  if (conversion == 'b') return printf_escaped_field(operand, width, precision, left);
  if (conversion == 's') printf_field(operand, strlen(operand), width, precision, left);
  else if (conversion == 'c') printf_field(operand, 1, width, -1, left);  // An empty one is NUL.
  else if (strchr("di", conversion) != NULL) {
    strcat(spec, "*.*lld");
    printf(spec, width, precision, printf_signed(operands, operand));
  } else if (strchr("ouxX", conversion) != NULL) {
    strcat(spec, "*.*ll");
    strncat(spec, &conversion, 1);
    printf(spec, width, precision, printf_unsigned(operands, operand));
  } else {
    char *end;
    errno = 0;
    const double value = *operand == '\0' ? 0 : strtod(operand, &end);
    if (*operand != '\0') printf_check_number(operands, operand, end);
    strcat(spec, "*.*");
    strncat(spec, &conversion, 1);
    printf(spec, width, precision, value);
  }
  return 1;
}

// The format once; 0 when \c or an invalid conversion ended the output.
static int printf_format(PrintfOperands *operands, const char *format) {
  for (const char *cursor = format; *cursor != '\0';) {
    int byte;
    if (*cursor == '\\') {
      cursor++;
      if (!printf_escape(&cursor, 0, &byte)) return 0;
      putchar(byte);
    } else if (*cursor != '%') {
      putchar(*cursor++);
    } else if (*++cursor == '%') {
      putchar('%');
      cursor++;
    } else if (!printf_conversion(operands, &cursor)) {
      return 0;
    }
  }
  return 1;
}

static int printf_utility(int argc, char **argv) {
  // POSIX: a utility without options discards a first --.
  const int first = argc > 1 && strcmp(argv[1], "--") == 0 ? 2 : 1;
  if (first >= argc) {
    fputs("usage: printf FORMAT [ARGUMENT ...]\n", stderr);
    return 2;
  }
  PrintfOperands operands = {argv + first + 1, argc - first - 1, 0, 0};
  // The format is reused while operands remain, if it converts any.
  while (printf_format(&operands, argv[first]) && operands.next > 0 && operands.next < operands.count) {}
  fflush(stdout);
  return ferror(stdout) ? 1 : operands.status;
}

#ifndef DOLLY_SHELL_UTILITY
int main(int argc, char **argv) { return printf_utility(argc, argv); }
#endif
