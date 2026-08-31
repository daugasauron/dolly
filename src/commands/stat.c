#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>

static const char *kind(const struct stat *metadata) {
  if (S_ISDIR(metadata->st_mode)) return "directory";
  if (S_ISLNK(metadata->st_mode)) return "symbolic link";
  if (S_ISREG(metadata->st_mode)) return "regular file";
  if (S_ISCHR(metadata->st_mode)) return "character device";
  if (S_ISFIFO(metadata->st_mode)) return "fifo";
  return "other";
}

static void formatted(const char *format, const char *path, const struct stat *metadata) {
  for (const char *cursor = format; *cursor != '\0'; cursor++) {
    if (*cursor != '%' || cursor[1] == '\0') { fputc(*cursor, stdout); continue; }
    cursor++;
    switch (*cursor) {
      case '%': fputc('%', stdout); break;
      case 'n': fputs(path, stdout); break;
      case 's': printf("%lld", (long long)metadata->st_size); break;
      case 'F': fputs(kind(metadata), stdout); break;
      case 'Y': printf("%lld", (long long)metadata->st_mtime); break;
      case 'a': fputc('0', stdout); break;
      case 'A': fputc(S_ISDIR(metadata->st_mode) ? 'd' : '-', stdout); break;
      default: fputc('%', stdout); fputc(*cursor, stdout); break;
    }
  }
  fputc('\n', stdout);
}

int main(int argc, char **argv) {
  const char *format = NULL;
  int first = 1;
  if (first < argc && strcmp(argv[first], "-c") == 0) {
    if (++first == argc) { fputs("stat: -c requires a format\n", stderr); return 2; }
    format = argv[first++];
  } else if (first < argc && strncmp(argv[first], "--format=", 9) == 0) {
    format = argv[first++] + 9;
  } else if (first < argc && strcmp(argv[first], "--help") == 0) {
    fputs("usage: stat [-c FORMAT] FILE ...\nformats: %n name, %s size, %F type, %Y mtime\n", stdout);
    return 0;
  }
  if (first == argc) { fputs("stat: missing file operand\n", stderr); return 2; }
  int status = 0;
  for (; first < argc; first++) {
    struct stat metadata;
    if (lstat(argv[first], &metadata) != 0) {
      fprintf(stderr, "stat: %s: %s\n", argv[first], strerror(errno));
      status = 1;
      continue;
    }
    if (format != NULL) { formatted(format, argv[first], &metadata); continue; }
    char timestamp[32] = "?";
    struct tm *broken = localtime(&metadata.st_mtime);
    if (broken != NULL) strftime(timestamp, sizeof(timestamp), "%Y-%m-%d %H:%M:%S", broken);
    printf("  File: %s\n  Size: %lld\tType: %s\nModify: %s\n",
           argv[first], (long long)metadata.st_size, kind(&metadata), timestamp);
  }
  return status;
}
