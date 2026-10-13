#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>

static const char *kind(mode_t mode) {
  if (S_ISDIR(mode)) return "directory";
  if (S_ISLNK(mode)) return "symbolic link";
  if (S_ISREG(mode)) return "regular file";
  if (S_ISCHR(mode)) return "character device";
  if (S_ISFIFO(mode)) return "fifo";
  return "other";
}

static void print_mode(mode_t mode) {
  putchar(S_ISDIR(mode) ? 'd' : S_ISLNK(mode) ? 'l' : S_ISCHR(mode) ? 'c' : S_ISFIFO(mode) ? 'p' : '-');
  for (int bit = 8; bit >= 0; bit--) putchar(mode & (1u << bit) ? "xwr"[bit % 3] : '-');
}

static void formatted(const char *format, const char *path, const struct stat *metadata) {
  for (const char *cursor = format; *cursor != '\0'; cursor++) {
    if (*cursor != '%') { putchar(*cursor); continue; }
    switch (*++cursor) {
      case '%': putchar('%'); break;
      case 'n': fputs(path, stdout); break;
      case 's': printf("%lld", (long long)metadata->st_size); break;
      case 'F': fputs(kind(metadata->st_mode), stdout); break;
      case 'Y': printf("%lld", (long long)metadata->st_mtime); break;
      case 'a': printf("%o", (unsigned)(metadata->st_mode & 07777)); break;
      case 'A': print_mode(metadata->st_mode); break;
    }
  }
  putchar('\n');
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
    fputs("usage: stat [-c FORMAT] FILE ...\nformats: %n name, %s size, %F type, %Y mtime, %a octal mode, %A mode, %% percent\n", stdout);
    return 0;
  }
  for (const char *cursor = format; cursor != NULL && (cursor = strchr(cursor, '%')) != NULL; cursor += 2) {
    if (cursor[1] == '\0' || strchr("%nsFYaA", cursor[1]) == NULL) {
      fprintf(stderr, "stat: unsupported format directive: %.2s\n", cursor);
      return 2;
    }
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
           argv[first], (long long)metadata.st_size, kind(metadata.st_mode), timestamp);
  }
  return status;
}
