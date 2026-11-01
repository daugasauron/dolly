#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>
#include <zlib.h>

enum { BUFFER_SIZE = 64 * 1024 };

static void usage(FILE *stream) {
  fputs("usage: gzip [-cfkn] [-1...-9] [FILE|-]...  compress FILE to FILE.gz, removing it unless -k\n"
        "       gzip -d [-cfk] [FILE|-]...         decompress FILE.gz to FILE (FILE.tgz to FILE.tar)\n"
        "       gzip -t FILE...                    check that each FILE decompresses\n"
        "-c writes to stdout, as does a FILE that is - or none; -f replaces an existing output,\n"
        "writes compressed data to a terminal and, with -d, copies data that is no gzip stream.\n"
        "-1 (--fast) is fastest, -9 (--best) smallest, 6 the default. No name or time is stored\n"
        "(-n, --no-name), so the same input gives the same output.\n", stream);
}

static int write_all(int descriptor, const unsigned char *bytes, size_t length) {
  while (length != 0) {
    const ssize_t count = write(descriptor, bytes, length);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) return -1;
    bytes += (size_t)count;
    length -= (size_t)count;
  }
  return 0;
}

static int open_input(const char *name) {
  return strcmp(name, "-") == 0 ? dup(STDIN_FILENO) : open(name, O_RDONLY);
}

// Compresses `name` (- is stdin) to `output` as one gzip member at `level`.
static int compress_file(const char *name, int output, int level) {
  const int input = open_input(name);
  if (input < 0) {
    fprintf(stderr, "gzip: %s: %s\n", name, strerror(errno));
    return 1;
  }
  char mode[4];
  snprintf(mode, sizeof(mode), "wb%d", level);
  const int descriptor = dup(output);
  gzFile packed = descriptor < 0 ? NULL : gzdopen(descriptor, mode);
  unsigned char *buffer = malloc(BUFFER_SIZE);
  if (packed == NULL || buffer == NULL) {
    if (packed != NULL) gzclose(packed);
    else if (descriptor >= 0) close(descriptor);
    free(buffer);
    close(input);
    fputs("gzip: out of memory\n", stderr);
    return 1;
  }
  int status = 0;
  for (;;) {
    const ssize_t count = read(input, buffer, BUFFER_SIZE);
    if (count < 0 && errno == EINTR) continue;
    if (count < 0) {
      fprintf(stderr, "gzip: %s: %s\n", name, strerror(errno));
      status = 1;
      break;
    }
    if (count == 0) break;
    if (gzwrite(packed, buffer, (unsigned)count) != (int)count) {
      int code = Z_OK;
      fprintf(stderr, "gzip: %s: %s\n", name, gzerror(packed, &code));
      status = 1;
      break;
    }
  }
  free(buffer);
  close(input);
  if (gzclose(packed) != Z_OK && status == 0) {
    fprintf(stderr, "gzip: %s: cannot write the compressed data\n", name);
    status = 1;
  }
  return status;
}

// Decompresses `name` (- is stdin) to `output`, or only checks it when output
// is -1. Data that is no gzip stream is an error, or with -f (`force`) copied
// as it is, as GNU gzip does. Prints why it failed.
static int decompress_file(const char *name, int output, int force) {
  const int descriptor = open_input(name);
  gzFile input = descriptor < 0 ? NULL : gzdopen(descriptor, "rb");
  if (input == NULL) {
    if (descriptor >= 0) close(descriptor);
    fprintf(stderr, "gzip: %s: %s\n", name, descriptor < 0 ? strerror(errno) : "out of memory");
    return 1;
  }
  unsigned char *buffer = malloc(BUFFER_SIZE);
  if (buffer == NULL) {
    gzclose(input);
    fputs("gzip: out of memory\n", stderr);
    return 1;
  }
  int status = 0;
  for (;;) {
    const int count = gzread(input, buffer, BUFFER_SIZE);
    if (count > 0 && !force && gzdirect(input)) {
      fprintf(stderr, "gzip: %s: not in gzip format\n", name);
      status = 1;
      break;
    }
    if (count > 0) {
      if (output >= 0 && write_all(output, buffer, (size_t)count) != 0) {
        fprintf(stderr, "gzip: %s: %s\n", name, strerror(errno));
        status = 1;
        break;
      }
      continue;
    }
    if (count < 0) {
      int code = Z_OK;
      const char *message = gzerror(input, &code);
      fprintf(stderr, "gzip: %s: %s\n", name, message == NULL ? "decompression failed" : message);
      status = 1;
    }
    break;
  }
  free(buffer);
  if (gzclose(input) != Z_OK && status == 0) {
    fprintf(stderr, "gzip: %s: invalid or incomplete gzip stream\n", name);
    status = 1;
  }
  return status;
}

// FILE.gz, FILE.z and FILE.tgz decompress to FILE and FILE.tar; NULL for
// another name.
static char *decompressed_name(const char *name) {
  const size_t length = strlen(name);
  static const char *const suffixes[][2] = {{".gz", ""}, {".z", ""}, {".tgz", ".tar"}};
  for (size_t index = 0; index < sizeof(suffixes) / sizeof(suffixes[0]); index++) {
    const size_t suffix = strlen(suffixes[index][0]);
    if (length <= suffix || strcmp(name + length - suffix, suffixes[index][0]) != 0) continue;
    char *result = malloc(length - suffix + strlen(suffixes[index][1]) + 1);
    if (result != NULL) sprintf(result, "%.*s%s", (int)(length - suffix), name, suffixes[index][1]);
    return result;
  }
  return NULL;
}

// Writes FILE.gz from FILE, or FILE from FILE.gz, with the input's times, and
// removes the input unless -k (`keep`).
static int replace_file(const char *name, int decompressing, int force, int keep, int level) {
  char *target = NULL;
  if (decompressing) {
    target = decompressed_name(name);
    if (target == NULL) {
      fprintf(stderr, "gzip: %s: unknown suffix (.gz, .z or .tgz)\n", name);
      return 1;
    }
  } else {
    char *unpacked = decompressed_name(name);
    free(unpacked);
    if (unpacked != NULL) {
      fprintf(stderr, "gzip: %s already has a compressed suffix: unchanged\n", name);
      return 1;
    }
    target = malloc(strlen(name) + 4);
    if (target != NULL) sprintf(target, "%s.gz", name);
  }
  struct stat metadata;
  if (target == NULL || stat(name, &metadata) != 0) {
    fprintf(stderr, "gzip: %s: %s\n", name, target == NULL ? "out of memory" : strerror(errno));
    free(target);
    return 1;
  }
  const int output = open(target, O_WRONLY | O_CREAT | O_TRUNC | (force ? 0 : O_EXCL), 0666);
  if (output < 0) {
    fprintf(stderr, "gzip: %s: %s\n", target, strerror(errno));
    free(target);
    return 1;
  }
  int status = decompressing ? decompress_file(name, output, 0) : compress_file(name, output, level);
  const struct timespec times[2] = {metadata.st_atim, metadata.st_mtim};
  if (status == 0 && (futimens(output, times) != 0 || close(output) != 0)) {
    fprintf(stderr, "gzip: %s: %s\n", target, strerror(errno));
    status = 1;
  } else if (status != 0) {
    close(output);
  }
  if (status != 0) unlink(target);
  if (status == 0 && !keep && unlink(name) != 0) {
    fprintf(stderr, "gzip: %s: %s\n", name, strerror(errno));
    status = 1;
  }
  free(target);
  return status;
}

// GNU gzip's long spellings of the letters this gzip takes.
static char long_option(const char *option) {
  static const char *const names[][2] = {
      {"--stdout", "c"}, {"--to-stdout", "c"}, {"--decompress", "d"}, {"--uncompress", "d"},
      {"--force", "f"}, {"--keep", "k"}, {"--no-name", "n"}, {"--test", "t"},
      {"--quiet", "q"}, {"--fast", "1"}, {"--best", "9"},
  };
  for (size_t index = 0; index < sizeof(names) / sizeof(names[0]); index++) {
    if (strcmp(option, names[index][0]) == 0) return names[index][1][0];
  }
  return '\0';
}

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--help") == 0) {
    usage(stdout);
    return 0;
  }
  int decompressing = 0, to_stdout = 0, force = 0, keep = 0, testing = 0, level = 6, first = 1;
  for (; first < argc && argv[first][0] == '-' && argv[first][1] != '\0'; first++) {
    const char *option = argv[first];
    if (strcmp(option, "--") == 0) {
      first++;
      break;
    }
    const char spelled[2] = {long_option(option), '\0'};
    if (option[1] == '-' && spelled[0] == '\0') {
      fprintf(stderr, "gzip: %s is unsupported (gzip --help lists the options)\n", option);
      return 2;
    }
    for (const char *letter = option[1] == '-' ? spelled : option + 1; *letter != '\0'; letter++) {
      if (*letter == 'd') decompressing = 1;
      else if (*letter == 'c') to_stdout = 1;
      else if (*letter == 'f') force = 1;
      else if (*letter == 'k') keep = 1;
      else if (*letter == 't') testing = 1;
      else if (*letter >= '1' && *letter <= '9') level = *letter - '0';
      else if (*letter != 'n' && *letter != 'q') {
        fprintf(stderr, "gzip: -%c is unsupported (gzip --help lists the options)\n", *letter);
        return 2;
      }
    }
  }
  if (testing) {
    int status = first == argc;
    if (status) usage(stderr);
    for (int index = first; index < argc; index++) status |= decompress_file(argv[index], -1, force);
    return status;
  }
  static char *const standard_input[] = {"-"};
  char *const *names = first == argc ? standard_input : argv + first;
  const int count = first == argc ? 1 : argc - first;
  int writes_stdout = to_stdout;
  for (int index = 0; index < count; index++) writes_stdout |= strcmp(names[index], "-") == 0;
  if (writes_stdout && !decompressing && !force && isatty(STDOUT_FILENO)) {
    fputs("gzip: compressed data is not written to a terminal; -f forces it\n", stderr);
    return 1;
  }
  int status = 0;
  for (int index = 0; index < count; index++) {
    const char *name = names[index];
    if (!to_stdout && strcmp(name, "-") != 0) status |= replace_file(name, decompressing, force, keep, level);
    else if (decompressing) status |= decompress_file(name, STDOUT_FILENO, force);
    else status |= compress_file(name, STDOUT_FILENO, level);
  }
  return status;
}
