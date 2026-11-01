#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <zlib.h>

enum { BUFFER_SIZE = 64 * 1024 };

static void usage(FILE *stream) {
  fputs("usage: gzip -dc [FILE|-]...   decompress to stdout (-cdf, as tar -z passes it, too)\n"
        "       gzip -d [-fk] FILE...   decompress FILE.gz to FILE (FILE.tgz to FILE.tar), removing it\n"
        "                               unless -k; -f replaces an existing FILE\n"
        "       gzip -t FILE...         check that each FILE decompresses\n"
        "Without FILE, or with -, gzip -dc reads stdin. This gzip only decompresses;\n"
        "pigz compresses (amy install pigz).\n", stream);
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

// Decompresses `name` (- is stdin) to `output`, or only checks it when output
// is -1. Data that is no gzip stream is an error, or with -f (`force`) copied
// as it is, as GNU gzip does. Prints why it failed.
static int decompress(const char *name, int output, int force) {
  gzFile input;
  if (strcmp(name, "-") == 0) {
    const int descriptor = dup(STDIN_FILENO);
    input = descriptor < 0 ? NULL : gzdopen(descriptor, "rb");
    if (input == NULL && descriptor >= 0) close(descriptor);
  } else {
    input = gzopen(name, "rb");
  }
  if (input == NULL) {
    fprintf(stderr, "gzip: %s: could not open gzip stream\n", name);
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

// FILE.gz, FILE.z and FILE.tgz decompress to FILE and FILE.tar.
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

static int decompress_in_place(const char *name, int force, int keep) {
  char *target = decompressed_name(name);
  if (target == NULL) {
    fprintf(stderr, "gzip: %s: unknown suffix (.gz, .z or .tgz)\n", name);
    return 1;
  }
  const int output = open(target, O_WRONLY | O_CREAT | O_TRUNC | (force ? 0 : O_EXCL), 0666);
  int status = output < 0 ? 1 : decompress(name, output, 0);
  if (output < 0) fprintf(stderr, "gzip: %s: %s\n", target, strerror(errno));
  if (output >= 0 && close(output) != 0 && status == 0) {
    fprintf(stderr, "gzip: %s: %s\n", target, strerror(errno));
    status = 1;
  }
  if (status != 0 && output >= 0) unlink(target);
  if (status == 0 && !keep && unlink(name) != 0) {
    fprintf(stderr, "gzip: %s: %s\n", name, strerror(errno));
    status = 1;
  }
  free(target);
  return status;
}

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--help") == 0) {
    usage(stdout);
    return 0;
  }
  int decompressing = 0, to_stdout = 0, force = 0, keep = 0, testing = 0, first = 1;
  for (; first < argc && argv[first][0] == '-' && argv[first][1] != '\0'; first++) {
    const char *option = argv[first];
    if (strcmp(option, "--") == 0) {
      first++;
      break;
    }
    if (strcmp(option, "--decompress-stdout") == 0) {
      decompressing = to_stdout = 1;
      continue;
    }
    for (const char *letter = option + 1; *letter != '\0'; letter++) {
      if (*letter == 'd') decompressing = 1;
      else if (*letter == 'c') to_stdout = 1;
      else if (*letter == 'f') force = 1;
      else if (*letter == 'k') keep = 1;
      else if (*letter == 't') testing = 1;
      else {
        usage(stderr);
        fprintf(stderr, "gzip: -%c is unsupported: this gzip only decompresses\n", *letter);
        return 2;
      }
    }
  }
  if (testing) {
    int status = first == argc;
    if (status) usage(stderr);
    for (int index = first; index < argc; index++) status |= decompress(argv[index], -1, force);
    return status;
  }
  if (!decompressing) {
    usage(stderr);
    fputs("gzip: this gzip only decompresses; pigz compresses (amy install pigz)\n", stderr);
    return 2;
  }
  if (to_stdout) {
    int status = first == argc ? decompress("-", STDOUT_FILENO, force) : 0;
    for (int index = first; index < argc; index++) status |= decompress(argv[index], STDOUT_FILENO, force);
    return status;
  }
  if (first == argc) {
    usage(stderr);
    return 2;
  }
  int status = 0;
  for (int index = first; index < argc; index++) status |= decompress_in_place(argv[index], force, keep);
  return status;
}
