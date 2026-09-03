#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef enum {
  UNIT_LINES,
  UNIT_BYTES,
} count_unit;

typedef struct {
  size_t value;
  int from_start;
} count_spec;

typedef struct {
  unsigned char *bytes;
  size_t length;
  size_t capacity;
} line;

static void usage(FILE *stream) {
  fputs("usage: tail [-qv] [-n NUMBER | -c NUMBER] [file ...]\n", stream);
}

static int parse_count(const char *text, count_spec *result) {
  result->from_start = text[0] == '+';
  if (text[0] == '+' || text[0] == '-') text++;
  if (*text == '\0') return -1;
  char *end = NULL;
  errno = 0;
  const unsigned long long value = strtoull(text, &end, 10);
  if (errno != 0 || *end != '\0' || value > SIZE_MAX) return -1;
  result->value = (size_t)value;
  if (result->from_start && result->value == 0) result->value = 1;
  return 0;
}

static int append_byte(line *item, int byte) {
  if (item->length == item->capacity) {
    size_t capacity = item->capacity == 0 ? 256 : item->capacity * 2;
    if (capacity < item->capacity) {
      errno = ENOMEM;
      return -1;
    }
    unsigned char *bytes = realloc(item->bytes, capacity);
    if (bytes == NULL) return -1;
    item->bytes = bytes;
    item->capacity = capacity;
  }
  item->bytes[item->length++] = (unsigned char)byte;
  return 0;
}

static int write_bytes(const void *bytes, size_t length) {
  return length == 0 || fwrite(bytes, 1, length, stdout) == length ? 0 : -1;
}

static int copy_stream(FILE *input) {
  unsigned char buffer[16 * 1024];
  size_t length;
  while ((length = fread(buffer, 1, sizeof(buffer), input)) != 0) {
    if (write_bytes(buffer, length) != 0) return -1;
  }
  return ferror(input) ? -1 : 0;
}

static int tail_bytes(FILE *input, count_spec count) {
  if (count.from_start) {
    size_t skip = count.value - 1;
    unsigned char buffer[16 * 1024];
    while (skip != 0) {
      const size_t request = skip < sizeof(buffer) ? skip : sizeof(buffer);
      const size_t length = fread(buffer, 1, request, input);
      skip -= length;
      if (length != request) return ferror(input) ? -1 : 0;
    }
    return copy_stream(input);
  }
  if (count.value == 0) {
    unsigned char buffer[16 * 1024];
    while (fread(buffer, 1, sizeof(buffer), input) != 0) {}
    return ferror(input) ? -1 : 0;
  }
  unsigned char *ring = malloc(count.value);
  if (ring == NULL) return -1;
  size_t total = 0;
  int byte;
  while ((byte = fgetc(input)) != EOF) ring[total++ % count.value] = (unsigned char)byte;
  if (ferror(input)) {
    free(ring);
    return -1;
  }
  const size_t retained = total < count.value ? total : count.value;
  const size_t start = total < count.value ? 0 : total % count.value;
  const size_t first = retained < count.value - start ? retained : count.value - start;
  int result = write_bytes(ring + start, first);
  if (result == 0) result = write_bytes(ring, retained - first);
  free(ring);
  return result;
}

static int tail_lines_from_start(FILE *input, size_t start) {
  size_t current = 1;
  int byte;
  while ((byte = fgetc(input)) != EOF) {
    if (current >= start && fputc(byte, stdout) == EOF) return -1;
    if (byte == '\n') current++;
  }
  return ferror(input) ? -1 : 0;
}

static int tail_lines_from_end(FILE *input, size_t count) {
  if (count == 0) {
    while (fgetc(input) != EOF) {}
    return ferror(input) ? -1 : 0;
  }
  if (count > SIZE_MAX / sizeof(line)) {
    errno = ENOMEM;
    return -1;
  }
  line *ring = calloc(count, sizeof(*ring));
  if (ring == NULL) return -1;
  size_t complete = 0;
  line current = {0};
  int byte;
  while ((byte = fgetc(input)) != EOF) {
    if (append_byte(&current, byte) != 0) goto fail;
    if (byte == '\n') {
      const size_t slot = complete++ % count;
      free(ring[slot].bytes);
      ring[slot] = current;
      current = (line){0};
    }
  }
  if (ferror(input)) goto fail;
  if (current.length != 0) {
    const size_t slot = complete++ % count;
    free(ring[slot].bytes);
    ring[slot] = current;
    current = (line){0};
  }
  const size_t retained = complete < count ? complete : count;
  const size_t start = complete < count ? 0 : complete % count;
  for (size_t index = 0; index < retained; ++index) {
    line *item = &ring[(start + index) % count];
    if (write_bytes(item->bytes, item->length) != 0) goto fail;
  }
  for (size_t index = 0; index < count; ++index) free(ring[index].bytes);
  free(ring);
  return 0;

fail:
  free(current.bytes);
  for (size_t index = 0; index < count; ++index) free(ring[index].bytes);
  free(ring);
  return -1;
}

static int tail_stream(FILE *input, count_unit unit, count_spec count) {
  if (unit == UNIT_BYTES) return tail_bytes(input, count);
  return count.from_start ? tail_lines_from_start(input, count.value)
                          : tail_lines_from_end(input, count.value);
}

int main(int argc, char **argv) {
  count_unit unit = UNIT_LINES;
  count_spec count = {.value = 10};
  int quiet = 0;
  int verbose = 0;
  int argument = 1;
  for (; argument < argc; ++argument) {
    const char *option = argv[argument];
    if (strcmp(option, "--") == 0) {
      argument++;
      break;
    }
    if (strcmp(option, "--help") == 0) {
      usage(stdout);
      return 0;
    }
    if (strcmp(option, "-f") == 0 || strcmp(option, "-F") == 0 ||
        strcmp(option, "--follow") == 0 || strncmp(option, "--follow=", 9) == 0) {
      fputs("tail: follow mode is unsupported in Dolly's serial process model\n",
            stderr);
      return 2;
    }
    if (strcmp(option, "-q") == 0 || strcmp(option, "--quiet") == 0 ||
        strcmp(option, "--silent") == 0) {
      quiet = 1;
      continue;
    }
    if (strcmp(option, "-v") == 0 || strcmp(option, "--verbose") == 0) {
      verbose = 1;
      continue;
    }
    const char *number = NULL;
    if (strcmp(option, "-n") == 0 || strcmp(option, "--lines") == 0 ||
        strcmp(option, "-c") == 0 || strcmp(option, "--bytes") == 0) {
      unit = option[1] == 'c' || strcmp(option, "--bytes") == 0
                 ? UNIT_BYTES : UNIT_LINES;
      if (++argument >= argc) {
        fprintf(stderr, "tail: %s requires a number\n", option);
        return 2;
      }
      number = argv[argument];
    } else if (strncmp(option, "--lines=", 8) == 0) {
      unit = UNIT_LINES;
      number = option + 8;
    } else if (strncmp(option, "--bytes=", 8) == 0) {
      unit = UNIT_BYTES;
      number = option + 8;
    } else if (strncmp(option, "-n", 2) == 0 && option[2] != '\0') {
      unit = UNIT_LINES;
      number = option + 2;
    } else if (strncmp(option, "-c", 2) == 0 && option[2] != '\0') {
      unit = UNIT_BYTES;
      number = option + 2;
    } else if (option[0] == '-' && option[1] >= '0' && option[1] <= '9') {
      unit = UNIT_LINES;
      number = option + 1;
    } else if (option[0] == '-' && option[1] != '\0') {
      fprintf(stderr, "tail: unsupported option: %s\n", option);
      usage(stderr);
      return 2;
    } else {
      break;
    }
    if (parse_count(number, &count) != 0) {
      fprintf(stderr, "tail: invalid count: %s\n", number);
      return 2;
    }
  }

  const int file_count = argc - argument;
  int failed = 0;
  const int operands = file_count == 0 ? 1 : file_count;
  for (int index = 0; index < operands; ++index) {
    const char *name = file_count == 0 ? "standard input" : argv[argument + index];
    FILE *input = file_count == 0 || strcmp(name, "-") == 0
                      ? stdin : fopen(name, "rb");
    if (input == NULL) {
      fprintf(stderr, "tail: %s: %s\n", name, strerror(errno));
      failed = 1;
      continue;
    }
    if (!quiet && (verbose || operands > 1)) {
      if (index != 0) fputc('\n', stdout);
      printf("==> %s <==\n", name);
    }
    if (tail_stream(input, unit, count) != 0) {
      fprintf(stderr, "tail: %s: %s\n", name, strerror(errno));
      failed = 1;
    }
    if (input != stdin && fclose(input) != 0) {
      fprintf(stderr, "tail: %s: %s\n", name, strerror(errno));
      failed = 1;
    }
  }
  if (fflush(stdout) == EOF) failed = 1;
  return failed;
}
