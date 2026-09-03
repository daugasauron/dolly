#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <fcntl.h>
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#define DOLLY_DD_MAX_BLOCK (64u * 1024u * 1024u)

typedef struct {
  const char *input;
  const char *output;
  uint64_t block_size;
  uint64_t count;
  uint64_t skip;
  uint64_t seek;
  int count_set;
  int notrunc;
  int sync;
  int quiet;
} Options;

static void usage(FILE *stream) {
  fputs("usage: dd [if=FILE] [of=FILE] [bs=N] [count=N] [skip=N] [seek=N] "
        "[conv=notrunc,sync] [status=none|noxfer]\n", stream);
}

static int checked_multiply(uint64_t left, uint64_t right, uint64_t *value) {
  if (right != 0 && left > UINT64_MAX / right) return 0;
  *value = left * right;
  return 1;
}

static int parse_number(const char *text, uint64_t *value) {
  if (text[0] == '\0' || text[0] == '-') return 0;
  char *end = NULL;
  errno = 0;
  uint64_t number = strtoull(text, &end, 10);
  if (errno == ERANGE || end == text) return 0;

  uint64_t multiplier = 1;
  if (strcmp(end, "c") == 0) multiplier = 1;
  else if (strcmp(end, "w") == 0) multiplier = 2;
  else if (strcmp(end, "b") == 0) multiplier = 512;
  else if (strcmp(end, "k") == 0 || strcmp(end, "K") == 0 ||
           strcmp(end, "KiB") == 0) multiplier = 1024;
  else if (strcmp(end, "kB") == 0) multiplier = 1000;
  else if (strcmp(end, "M") == 0 || strcmp(end, "MiB") == 0)
    multiplier = 1024u * 1024u;
  else if (strcmp(end, "MB") == 0) multiplier = 1000u * 1000u;
  else if (strcmp(end, "G") == 0 || strcmp(end, "GiB") == 0)
    multiplier = 1024ull * 1024ull * 1024ull;
  else if (strcmp(end, "GB") == 0) multiplier = 1000ull * 1000ull * 1000ull;
  else if (*end != '\0') return 0;
  return checked_multiply(number, multiplier, value);
}

static int parse_conversion(Options *options, const char *text) {
  if (text[0] == '\0') {
    fputs("dd: conversion list cannot be empty\n", stderr);
    return 0;
  }
  const char *cursor = text;
  while (*cursor != '\0') {
    const char *comma = strchr(cursor, ',');
    const size_t length = comma == NULL ? strlen(cursor)
                                        : (size_t)(comma - cursor);
    if (length == 7 && strncmp(cursor, "notrunc", length) == 0)
      options->notrunc = 1;
    else if (length == 4 && strncmp(cursor, "sync", length) == 0)
      options->sync = 1;
    else {
      fprintf(stderr, "dd: unsupported conversion: %.*s\n",
              (int)length, cursor);
      return 0;
    }
    if (comma == NULL) break;
    if (comma[1] == '\0') {
      fputs("dd: conversion list cannot end with a comma\n", stderr);
      return 0;
    }
    cursor = comma + 1;
  }
  return 1;
}

static int parse_options(int argc, char **argv, Options *options) {
  *options = (Options){.block_size = 512};
  for (int index = 1; index < argc; index++) {
    if (strcmp(argv[index], "--help") == 0) {
      usage(stdout);
      return 1;
    }
    char *equals = strchr(argv[index], '=');
    if (equals == NULL) {
      fprintf(stderr, "dd: expected NAME=VALUE operand: %s\n", argv[index]);
      return -1;
    }
    const size_t name_length = (size_t)(equals - argv[index]);
    const char *value = equals + 1;
    uint64_t number;
    if (name_length == 2 && strncmp(argv[index], "if", 2) == 0)
      options->input = value;
    else if (name_length == 2 && strncmp(argv[index], "of", 2) == 0)
      options->output = value;
    else if (name_length == 2 && strncmp(argv[index], "bs", 2) == 0) {
      if (!parse_number(value, &number) || number == 0 ||
          number > DOLLY_DD_MAX_BLOCK) {
        fprintf(stderr, "dd: invalid or oversized block size: %s\n", value);
        return -1;
      }
      options->block_size = number;
    } else if (name_length == 5 && strncmp(argv[index], "count", 5) == 0) {
      if (!parse_number(value, &options->count)) goto bad_number;
      options->count_set = 1;
    } else if (name_length == 4 && strncmp(argv[index], "skip", 4) == 0) {
      if (!parse_number(value, &options->skip)) goto bad_number;
    } else if (name_length == 4 && strncmp(argv[index], "seek", 4) == 0) {
      if (!parse_number(value, &options->seek)) goto bad_number;
    } else if (name_length == 4 && strncmp(argv[index], "conv", 4) == 0) {
      if (!parse_conversion(options, value)) return -1;
    } else if (name_length == 6 && strncmp(argv[index], "status", 6) == 0) {
      if (strcmp(value, "none") == 0) options->quiet = 1;
      else if (strcmp(value, "noxfer") != 0) {
        fprintf(stderr, "dd: unsupported status mode: %s\n", value);
        return -1;
      }
    } else {
      fprintf(stderr, "dd: unsupported operand: %s\n", argv[index]);
      return -1;
    }
    continue;
bad_number:
    fprintf(stderr, "dd: invalid number: %s\n", value);
    return -1;
  }
  return 0;
}

static int seek_blocks(int descriptor, uint64_t blocks, uint64_t block_size,
                       const char *description) {
  if (blocks == 0) return 1;
  uint64_t bytes;
  if (!checked_multiply(blocks, block_size, &bytes) || bytes > INT64_MAX) {
    fprintf(stderr, "dd: %s: offset is too large\n", description);
    return 0;
  }
  if (lseek(descriptor, (off_t)bytes, SEEK_CUR) < 0) {
    fprintf(stderr, "dd: %s: %s\n", description, strerror(errno));
    return 0;
  }
  return 1;
}

static int write_all(int descriptor, const unsigned char *bytes, size_t count) {
  size_t offset = 0;
  while (offset < count) {
    ssize_t written = write(descriptor, bytes + offset, count - offset);
    if (written < 0) {
      if (errno == EINTR) continue;
      return 0;
    }
    if (written == 0) { errno = EIO; return 0; }
    offset += (size_t)written;
  }
  return 1;
}

int main(int argc, char **argv) {
  Options options;
  const int parsed = parse_options(argc, argv, &options);
  if (parsed != 0) return parsed > 0 ? 0 : 2;

  int input = STDIN_FILENO;
  int output = STDOUT_FILENO;
  if (options.input != NULL && strcmp(options.input, "-") != 0) {
    input = open(options.input, O_RDONLY);
    if (input < 0) {
      fprintf(stderr, "dd: %s: %s\n", options.input, strerror(errno));
      return 1;
    }
  }
  if (options.output != NULL && strcmp(options.output, "-") != 0) {
    int flags = O_WRONLY | O_CREAT | (options.notrunc ? 0 : O_TRUNC);
    output = open(options.output, flags, 0666);
    if (output < 0) {
      fprintf(stderr, "dd: %s: %s\n", options.output, strerror(errno));
      if (input != STDIN_FILENO) close(input);
      return 1;
    }
  }

  int ok = seek_blocks(input, options.skip, options.block_size, "input skip") &&
           seek_blocks(output, options.seek, options.block_size, "output seek");
  unsigned char *buffer = ok ? malloc((size_t)options.block_size) : NULL;
  if (ok && buffer == NULL) {
    fputs("dd: out of memory\n", stderr);
    ok = 0;
  }

  uint64_t input_full = 0, input_partial = 0;
  uint64_t output_full = 0, output_partial = 0, total = 0, records = 0;
  while (ok && (!options.count_set || records < options.count)) {
    ssize_t received = read(input, buffer, (size_t)options.block_size);
    if (received < 0) {
      if (errno == EINTR) continue;
      fprintf(stderr, "dd: read: %s\n", strerror(errno));
      ok = 0;
      break;
    }
    if (received == 0) break;
    records++;
    size_t write_count = (size_t)received;
    if ((uint64_t)received == options.block_size) input_full++;
    else {
      input_partial++;
      if (options.sync) {
        memset(buffer + received, 0,
               (size_t)options.block_size - (size_t)received);
        write_count = (size_t)options.block_size;
      }
    }
    if (!write_all(output, buffer, write_count)) {
      fprintf(stderr, "dd: write: %s\n", strerror(errno));
      ok = 0;
      break;
    }
    total += write_count;
    if ((uint64_t)write_count == options.block_size) output_full++;
    else output_partial++;
  }

  free(buffer);
  if (input != STDIN_FILENO && close(input) != 0) ok = 0;
  if (output != STDOUT_FILENO && close(output) != 0) ok = 0;
  if (!options.quiet) {
    fprintf(stderr, "%" PRIu64 "+%" PRIu64 " records in\n",
            input_full, input_partial);
    fprintf(stderr, "%" PRIu64 "+%" PRIu64 " records out\n",
            output_full, output_partial);
    fprintf(stderr, "%" PRIu64 " bytes copied\n", total);
  }
  return ok ? 0 : 1;
}
