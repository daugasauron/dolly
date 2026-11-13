#define _POSIX_C_SOURCE 200809L
#include <ctype.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include <fcntl.h>
#include <stdlib.h>
#include <sys/stat.h>
#include <unistd.h>

static int field(const char *p) { return (p[0] - '0') * 10 + (p[1] - '0'); }

/* POSIX -t [[CC]YY]MMDDhhmm[.ss] in local time. */
static int parse_stamp(const char *stamp, time_t *out) {
  size_t len = strcspn(stamp, ".");
  const char *seconds = stamp[len] == '.' ? stamp + len + 1 : NULL;
  for (size_t i = 0; i < len; i++) {
    if (!isdigit((unsigned char)stamp[i])) return -1;
  }
  struct tm tm;
  time_t now = time(NULL);
  localtime_r(&now, &tm);
  const char *p = stamp;
  if (len == 12) {
    tm.tm_year = (field(p) * 100 + field(p + 2)) - 1900;
    p += 4;
  } else if (len == 10) {
    int yy = field(p);
    tm.tm_year = yy < 69 ? 2000 + yy - 1900 : yy;
    p += 2;
  } else if (len != 8) {
    return -1;
  }
  tm.tm_mon = field(p) - 1;
  tm.tm_mday = field(p + 2);
  tm.tm_hour = field(p + 4);
  tm.tm_min = field(p + 6);
  tm.tm_sec = 0;
  if (seconds) {
    if (strlen(seconds) != 2 || !isdigit((unsigned char)seconds[0]) ||
        !isdigit((unsigned char)seconds[1])) {
      return -1;
    }
    tm.tm_sec = field(seconds);
  }
  tm.tm_isdst = -1;
  time_t when = mktime(&tm);
  if (when == (time_t)-1) return -1;
  *out = when;
  return 0;
}

/* POSIX -d YYYY-MM-DDThh:mm:SS[.frac][Z]: a space may stand for T; local
   time without Z. */
static int parse_date(const char *text, struct timespec *out) {
  struct tm tm = {0};
  int used = 0;
  if (sscanf(text, "%4d-%2d-%2d%n", &tm.tm_year, &tm.tm_mon, &tm.tm_mday, &used) != 3 || used != 10 ||
      (text[10] != 'T' && text[10] != ' ') ||
      sscanf(text + 11, "%2d:%2d:%2d%n", &tm.tm_hour, &tm.tm_min, &tm.tm_sec, &used) != 3 || used != 8) return -1;
  const char *rest = text + 19;
  long nanoseconds = 0;
  if (*rest == '.' || *rest == ',') {
    long scale = 100000000;
    for (rest++; isdigit((unsigned char)*rest); rest++, scale /= 10) nanoseconds += (*rest - '0') * scale;
  }
  const int utc = *rest == 'Z';
  if (rest[utc] != '\0') return -1;
  tm.tm_year -= 1900;
  tm.tm_mon -= 1;
  tm.tm_isdst = -1;
  if (utc) setenv("TZ", "UTC0", 1);
  const time_t when = mktime(&tm);
  if (when == (time_t)-1) return -1;
  *out = (struct timespec){.tv_sec = when, .tv_nsec = nanoseconds};
  return 0;
}

int main(int argc, char **argv) {
  int no_create = 0, access_only = 0, modification_only = 0;
  // Both times; UTIME_NOW unless -t, -d or -r gives them.
  struct timespec times[2] = {{.tv_nsec = UTIME_NOW}, {.tv_nsec = UTIME_NOW}};
  int first_file = 1;
  for (; first_file < argc; first_file++) {
    const char *option = argv[first_file];
    if (strcmp(option, "--") == 0) {
      first_file++;
      break;
    }
    if (strcmp(option, "--help") == 0) {
      fputs("usage: touch [-acm] [-r FILE | -t [[CC]YY]MMDDhhmm[.ss] | -d YYYY-MM-DDThh:mm:SS[.frac][Z]]\n"
            "             [--] FILE ...\n", stdout);
      return 0;
    }
    if (option[0] != '-' || option[1] == '\0') break;
    if (strcmp(option, "-c") == 0 || strcmp(option, "--no-create") == 0) no_create = 1;
    else if (strcmp(option, "-a") == 0) access_only = 1;
    else if (strcmp(option, "-m") == 0) modification_only = 1;
    else if (strcmp(option, "-t") == 0 || strcmp(option, "-d") == 0 || strcmp(option, "-r") == 0) {
      const char *value = ++first_file < argc ? argv[first_file] : NULL;
      struct stat reference;
      time_t when;
      if (value != NULL && option[1] == 'r' && stat(value, &reference) == 0) {
        times[0] = reference.st_atim;
        times[1] = reference.st_mtim;
      } else if (value != NULL && option[1] == 't' && parse_stamp(value, &when) == 0) {
        times[0] = times[1] = (struct timespec){.tv_sec = when};
      } else if (value == NULL || option[1] == 'r' || option[1] == 't' || parse_date(value, &times[0]) != 0) {
        fprintf(stderr, "touch: %s: %s\n", option, value == NULL ? "a value is required"
                : option[1] == 'r' ? strerror(errno) : "invalid time");
        return 2;
      } else {
        times[1] = times[0];
      }
    } else {
      fprintf(stderr, "touch: unsupported option: %s\n", option);
      return 2;
    }
  }
  if (first_file == argc) {
    fputs("touch: missing file operand\n", stderr);
    return 2;
  }
  // -a or -m alone leaves the other time as it is.
  if (access_only != modification_only) times[access_only ? 1 : 0].tv_nsec = UTIME_OMIT;

  int status = 0;
  for (int index = first_file; index < argc; index++) {
    if (utimensat(AT_FDCWD, argv[index], times, 0) == 0) continue;
    if (errno != ENOENT) {
      fprintf(stderr, "touch: %s: %s\n", argv[index], strerror(errno));
      status = 1;
      continue;
    }
    if (no_create) continue;
    const int descriptor = open(argv[index], O_WRONLY | O_CREAT, 0666);
    if (descriptor < 0 || futimens(descriptor, times) != 0) {
      fprintf(stderr, "touch: %s: %s\n", argv[index], strerror(errno));
      status = 1;
    }
    if (descriptor >= 0 && close(descriptor) != 0) {
      fprintf(stderr, "touch: %s: %s\n", argv[index], strerror(errno));
      status = 1;
    }
  }
  return status;
}
