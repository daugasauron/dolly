DOLLY 4
MODULE core-tools

REQUIRES HEADER libc
REQUIRES HEADER runtime
REQUIRES TOOL   cc
REQUIRES TOOL   rm

# Small Dolly-owned commands live directly in the module. The root's module
# hash authenticates their source; each TOOL export names the compiled result.
FILE /tmp/core-tools/foreground.c
    #include <errno.h>
    #include <stdio.h>
    #include <string.h>
    #include <dolly/runtime.h>
    
    int main(int argc, char **argv) {
      int first = 1;
      int interactive = 0;
      if (argc == 2 && strcmp(argv[1], "--help") == 0) {
        fputs("usage: foreground [-i] /absolute/program [ARG ...]\n", stdout);
        return 0;
      }
      if (first < argc && strcmp(argv[first], "-i") == 0) {
        interactive = 1;
        first++;
      }
      if (first == argc || argv[first][0] != '/') {
        fputs("usage: foreground [-i] /absolute/program [ARG ...]\n", stderr);
        return 2;
      }
      const int pid = dolly_spawn_foreground(argv[first], argc - first,
                                             argv + first, interactive);
      if (pid < 0) {
        fprintf(stderr, "foreground: %s: %s\n", argv[first], strerror(-pid));
        return pid == -ENOENT ? 127 : 126;
      }
      int status;
      const int waited = dolly_wait(pid, &status);
      if (waited < 0) {
        fprintf(stderr, "foreground: wait: %s\n", strerror(-waited));
        return 126;
      }
      return status;
    }
FILE /tmp/core-tools/help.c
    #include <stdio.h>
    #include <stdlib.h>
    #include <string.h>
    #include <unistd.h>
    
    int main(int argc, char **argv) {
      if (argc > 2 || (argc == 2 && strcmp(argv[1], "--help") != 0)) {
        fprintf(stderr, "help: unsupported argument: %s\n", argv[1]);
        return 2;
      }
      const char *path = getenv("PATH");
      fputs("Dolly Slop: minimal agent-tool compatibility inside Wasm\n", stdout);
      fputs("stateful builtins: : . source eval exec exit return cd export unset set shift read getopts local break continue type\n", stdout);
      printf("PATH=%s\n", path == NULL ? "" : path);
      fputs("commands are files on PATH; inspect this image with ls /bin /usr/bin\n", stdout);
      fputs("exec supports permanent redirections, not replacing the shell\n", stdout);
      fputs("operators: ; newline backslash-newline && || ! | < > >> 2> 2>> 2>&1\n", stdout);
      fputs("conditionals: if COMMANDS; then COMMANDS; [elif ...; then ...;] [else ...;] fi\n", stdout);
      fputs("loops: for NAME [in WORD ...]; do COMMANDS; done; while|until COMMANDS; do COMMANDS; done; break|continue [N]\n", stdout);
      fputs("selection: case WORD in PATTERN[|PATTERN]...) COMMANDS ;; ... esac\n", stdout);
      fputs("functions/groups: NAME () { COMMANDS; }; return [STATUS]; { COMMANDS; }; (COMMANDS)\n", stdout);
      fputs("expansion: $VAR ${VAR} ${VAR:-WORD} ${VAR:=WORD} ${VAR:+WORD} ${VAR:?WORD} ${#VAR} ${VAR#PATTERN} ${VAR##PATTERN} ${VAR%PATTERN} ${VAR%%PATTERN} $? $$ $# $0..9 $@ $* $(command) `command` $((integer expression)) and globs; set [--] ARG...; shift [N]\n", stdout);
      fputs("options: set -e/+e -u/+u -x/+x -o/+o pipefail; set -o lists finite options\n", stdout);
      fputs("make recipes run serially through /bin/slop -c\n", stdout);
      if (access("/usr/bin/tsc", F_OK) == 0)
        fputs("TypeScript: tsc FILE.ts --target ES2023 --module ES2022\n", stdout);
      if (access("/usr/bin/bonnie", F_OK) == 0) {
        fputs("Python packages: bonnie install PACKAGE; bonnie list|freeze|show|check\n", stdout);
      }
      return 0;
    }
FILE /tmp/core-tools/clear.c
    #include <stdio.h>
    #include <string.h>
    
    int main(int argc, char **argv) {
      if (argc == 2 && strcmp(argv[1], "--help") == 0) {
        fputs("usage: clear\n", stdout);
        return 0;
      }
      if (argc != 1) {
        fprintf(stderr, "clear: unsupported option: %s\n", argv[1]);
        return 2;
      }
      fputs("\033[2J\033[H", stdout);
      fflush(stdout);
      return 0;
    }
FILE /tmp/core-tools/stat.c
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
FILE /tmp/core-tools/file.c
    #define _POSIX_C_SOURCE 200809L
    
    #include <ctype.h>
    #include <errno.h>
    #include <stdio.h>
    #include <string.h>
    #include <sys/stat.h>
    
    // Printable ASCII and well-formed UTF-8; a sequence may be cut off only
    // where the sample ends before the file does.
    static int text(const unsigned char *bytes, size_t length, int sampled) {
      for (size_t index = 0; index < length;) {
        const unsigned char byte = bytes[index++];
        size_t extra = byte < 0x80 ? 0 : byte >= 0xc2 && byte <= 0xdf ? 1
            : byte >= 0xe0 && byte <= 0xef ? 2 : byte >= 0xf0 && byte <= 0xf4 ? 3 : 4;
        if (extra == 4 || (extra == 0 && !isprint(byte) && !isspace(byte))) return 0;
        for (; extra != 0; extra--, index++) {
          if (index == length) return sampled;
          if ((bytes[index] & 0xc0) != 0x80) return 0;
        }
      }
      return 1;
    }
    
    static const char *classify(const char *path, int mime) {
      static char result[96];
      struct stat metadata;
      if (lstat(path, &metadata) != 0) {
        snprintf(result, sizeof(result), "cannot open: %s", strerror(errno));
        return result;
      }
      if (S_ISDIR(metadata.st_mode)) return mime ? "inode/directory" : "directory";
      FILE *stream = fopen(path, "rb");
      if (stream == NULL) {
        snprintf(result, sizeof(result), "cannot open: %s", strerror(errno));
        return result;
      }
      unsigned char bytes[512];
      const size_t length = fread(bytes, 1, sizeof(bytes), stream);
      fclose(stream);
      static const unsigned char wasm_magic[] = {0, 'a', 's', 'm', 1, 0, 0, 0};
      if (length >= sizeof(wasm_magic) && memcmp(bytes, wasm_magic, sizeof(wasm_magic)) == 0)
        return mime ? "application/wasm" : "WebAssembly binary module";
      if (length >= 8 && memcmp(bytes, "!<arch>\n", 8) == 0)
        return mime ? "application/x-archive" : "current ar archive";
      if (length >= 2 && bytes[0] == 0x1f && bytes[1] == 0x8b)
        return mime ? "application/gzip" : "gzip compressed data";
      if (length == 0) return mime ? "application/x-empty" : "empty";
      if (!text(bytes, length, length == sizeof(bytes)))
        return mime ? "application/octet-stream" : "data";
      for (size_t index = 0; index < length; index++) {
        if (bytes[index] >= 0x80) return mime ? "text/plain" : "UTF-8 Unicode text";
      }
      return mime ? "text/plain" : "ASCII text";
    }
    
    int main(int argc, char **argv) {
      int brief = 0, mime = 0, first = 1;
      for (; first < argc; first++) {
        if (strcmp(argv[first], "--") == 0) { first++; break; }
        if (strcmp(argv[first], "-b") == 0 || strcmp(argv[first], "--brief") == 0) brief = 1;
        else if (strcmp(argv[first], "--mime-type") == 0) mime = 1;
        else if (strcmp(argv[first], "--help") == 0) { fputs("usage: file [-b] [--mime-type] FILE ...\n", stdout); return 0; }
        else if (argv[first][0] == '-') { fprintf(stderr, "file: unsupported option: %s\n", argv[first]); return 2; }
        else break;
      }
      if (first == argc) { fputs("file: missing file operand\n", stderr); return 2; }
      for (; first < argc; first++) {
        if (!brief) printf("%s: ", argv[first]);
        puts(classify(argv[first], mime));
      }
      return 0;
    }
SLOP cc \
  -O2 \
  /tmp/core-tools/foreground.c \
  -o /bin/foreground
SLOP cc \
  -O2 \
  /tmp/core-tools/help.c \
  -o /bin/help
SLOP cc \
  -O2 \
  /tmp/core-tools/clear.c \
  -o /bin/clear
SLOP cc \
  -O2 \
  /tmp/core-tools/stat.c \
  -o /bin/stat
SLOP cc \
  -O2 \
  /tmp/core-tools/file.c \
  -o /bin/file
EXPORTS TOOL foreground
EXPORTS TOOL help
EXPORTS TOOL clear
EXPORTS TOOL stat
EXPORTS TOOL file

SLOP rm \
  -rf \
  /tmp/core-tools
