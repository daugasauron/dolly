#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static void usage(FILE *stream) {
  fputs("usage: tee [-a] [file ...]\n", stream);
}

static int write_all(int descriptor, const void *bytes, size_t length) {
  const unsigned char *cursor = bytes;
  while (length != 0) {
    const ssize_t written = write(descriptor, cursor, length);
    if (written < 0) {
      if (errno == EINTR) continue;
      return -1;
    }
    if (written == 0) {
      errno = EIO;
      return -1;
    }
    cursor += (size_t)written;
    length -= (size_t)written;
  }
  return 0;
}

int main(int argc, char **argv) {
  int append = 0;
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
    if (strcmp(option, "--append") == 0) {
      append = 1;
      continue;
    }
    if (strcmp(option, "-i") == 0 ||
        strcmp(option, "--ignore-interrupts") == 0) {
      fputs("tee: -i is unsupported; Dolly Ctrl+C always cancels the foreground command\n",
            stderr);
      return 2;
    }
    if (option[0] != '-' || option[1] == '\0') break;
    for (size_t index = 1; option[index] != '\0'; ++index) {
      if (option[index] == 'a') append = 1;
      else {
        fprintf(stderr, "tee: unsupported option: -%c\n", option[index]);
        usage(stderr);
        return 2;
      }
    }
  }

  const size_t file_count = (size_t)(argc - argument);
  if (file_count > (SIZE_MAX / sizeof(int)) - 1) {
    fputs("tee: too many output files\n", stderr);
    return 1;
  }
  int *descriptors = malloc((file_count + 1) * sizeof(*descriptors));
  if (descriptors == NULL) {
    fputs("tee: out of memory\n", stderr);
    return 1;
  }
  descriptors[0] = STDOUT_FILENO;
  int failed = 0;
  const int flags = O_WRONLY | O_CREAT | (append ? O_APPEND : O_TRUNC);
  for (size_t index = 0; index < file_count; ++index) {
    descriptors[index + 1] = open(argv[argument + (int)index], flags, 0666);
    if (descriptors[index + 1] < 0) {
      fprintf(stderr, "tee: %s: %s\n",
              argv[argument + (int)index], strerror(errno));
      failed = 1;
    }
  }

  unsigned char buffer[16 * 1024];
  ssize_t length;
  while ((length = read(STDIN_FILENO, buffer, sizeof(buffer))) != 0) {
    if (length < 0) {
      if (errno == EINTR) continue;
      fprintf(stderr, "tee: standard input: %s\n", strerror(errno));
      failed = 1;
      break;
    }
    for (size_t index = 0; index <= file_count; ++index) {
      if (descriptors[index] < 0) continue;
      if (write_all(descriptors[index], buffer, (size_t)length) != 0) {
        fprintf(stderr, "tee: %s: %s\n",
                index == 0 ? "standard output"
                           : argv[argument + (int)index - 1],
                strerror(errno));
        if (index != 0) close(descriptors[index]);
        descriptors[index] = -1;
        failed = 1;
      }
    }
  }

  for (size_t index = 1; index <= file_count; ++index) {
    if (descriptors[index] >= 0 && close(descriptors[index]) != 0) {
      fprintf(stderr, "tee: %s: %s\n",
              argv[argument + (int)index - 1], strerror(errno));
      failed = 1;
    }
  }
  free(descriptors);
  return failed;
}
