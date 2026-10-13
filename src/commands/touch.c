#define _POSIX_C_SOURCE 200809L
#include <ctype.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include <utime.h>

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

int main(int argc, char **argv) {
  int no_create = 0;
  struct utimbuf stamp;
  int have_stamp = 0;
  int first_file = 1;
  for (; first_file < argc; first_file++) {
    if (strcmp(argv[first_file], "--") == 0) {
      first_file++;
      break;
    }
    if (strcmp(argv[first_file], "--help") == 0) {
      fputs("usage: touch [-c] [-t [[CC]YY]MMDDhhmm[.ss]] [--] FILE ...\n", stdout);
      return 0;
    }
    if (strcmp(argv[first_file], "-c") == 0 ||
        strcmp(argv[first_file], "--no-create") == 0) {
      no_create = 1;
    } else if (strcmp(argv[first_file], "-t") == 0) {
      if (++first_file == argc) {
        fputs("touch: -t requires a timestamp\n", stderr);
        return 2;
      }
      time_t when;
      if (parse_stamp(argv[first_file], &when) != 0) {
        fprintf(stderr, "touch: invalid timestamp: %s\n", argv[first_file]);
        return 2;
      }
      stamp.actime = stamp.modtime = when;
      have_stamp = 1;
    } else if (argv[first_file][0] == '-') {
      fprintf(stderr, "touch: unsupported option: %s\n", argv[first_file]);
      return 2;
    } else {
      break;
    }
  }
  if (first_file == argc) {
    fputs("touch: missing file operand\n", stderr);
    return 2;
  }

  int status = 0;
  for (int index = first_file; index < argc; index++) {
    if (utime(argv[index], have_stamp ? &stamp : NULL) == 0) {
      continue;
    }
    if (errno != ENOENT) {
      fprintf(stderr, "touch: %s: %s\n", argv[index], strerror(errno));
      status = 1;
      continue;
    }
    if (no_create) continue;
    FILE *file = fopen(argv[index], "ab");
    if (file == NULL) {
      fprintf(stderr, "touch: %s: %s\n", argv[index], strerror(errno));
      status = 1;
    } else if (fclose(file) != 0) {
      fprintf(stderr, "touch: %s: %s\n", argv[index], strerror(errno));
      status = 1;
    } else if (have_stamp && utime(argv[index], &stamp) != 0) {
      fprintf(stderr, "touch: %s: %s\n", argv[index], strerror(errno));
      status = 1;
    }
  }
  return status;
}
