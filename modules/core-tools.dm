DOLLY 2
MODULE core-tools

REQUIRES HEADER libc
REQUIRES TOOL   cc
REQUIRES TOOL   rm

# Small Dolly-owned commands live directly in the module. The root's module
# hash authenticates their source; each TOOL export names the compiled result.
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
      fputs("stateful builtins: : exit cd export unset set\n", stdout);
      printf("PATH=%s\n", path == NULL ? "" : path);
      fputs("/bin: slop help pwd cd cat echo mkdir touch rm clear ls stat file test [ mv cp grep sed head wc printf awk cc c++ ld ar download\n", stdout);
      fputs("/usr/bin: curl git make zig ghostty-vt", stdout);
      if (access("/usr/bin/qjs", F_OK) == 0) fputs(" qjs janis pi", stdout);
      if (access("/usr/bin/graphics-demo", F_OK) == 0) fputs(" graphics-demo", stdout);
      fputc('\n', stdout);
      fputs("operators: ; newline && || ! | < > >> 2> 2>> 2>&1\n", stdout);
      fputs("expansion: $VAR ${VAR} $? $$ $# $0..9 $@ $* $(command) and globs\n", stdout);
      fputs("make recipes run serially through /bin/slop -c\n", stdout);
      return 0;
    }
FILE /tmp/core-tools/pwd.c
    #include <errno.h>
    #include <stdio.h>
    #include <string.h>
    #include <unistd.h>
    
    int main(int argc, char **argv) {
      if (argc == 2 && strcmp(argv[1], "--help") == 0) {
        fputs("usage: pwd [-L|-P]\n", stdout);
        return 0;
      }
      if (argc > 2 ||
          (argc == 2 && strcmp(argv[1], "-L") != 0 && strcmp(argv[1], "-P") != 0)) {
        fprintf(stderr, "pwd: unsupported option: %s\n", argc > 1 ? argv[1] : "");
        return 2;
      }
      char cwd[1024];
      if (getcwd(cwd, sizeof(cwd)) == NULL) {
        fprintf(stderr, "pwd: %s\n", strerror(errno));
        return 1;
      }
      fputs(cwd, stdout);
      fputc('\n', stdout);
      return 0;
    }
FILE /tmp/core-tools/cd.c
    #include <errno.h>
    #include <stdio.h>
    #include <stdlib.h>
    #include <string.h>
    #include <unistd.h>
    
    int main(int argc, char **argv) {
      int first_path = 1;
      if (first_path < argc && strcmp(argv[first_path], "--help") == 0) {
        fputs("usage: cd [--] [DIRECTORY]\n", stdout);
        return 0;
      }
      if (first_path < argc && strcmp(argv[first_path], "--") == 0) first_path++;
      if (argc - first_path > 1) {
        fputs("cd: expected at most one path\n", stderr);
        return 2;
      }
      const char *path = first_path < argc ? argv[first_path] : getenv("HOME");
      if (path == NULL || path[0] == '\0') path = "/workspace";
      if (chdir(path) != 0) {
        fprintf(stderr, "cd: %s: %s\n", path, strerror(errno));
        return 1;
      }
      return 0;
    }
FILE /tmp/core-tools/cat.c
    #include <errno.h>
    #include <stdio.h>
    #include <string.h>
    
    static int copy_stream(FILE *input, const char *name, int number_lines,
                           unsigned long *line_number) {
      unsigned char buffer[4096];
      int line_start = 1;
      size_t count;
      while ((count = fread(buffer, 1, sizeof(buffer), input)) != 0) {
        if (!number_lines) {
          if (fwrite(buffer, 1, count, stdout) != count) {
            fprintf(stderr, "cat: %s: write failed\n", name);
            return 1;
          }
          continue;
        }
        for (size_t index = 0; index < count; index++) {
          if (line_start) {
            if (fprintf(stdout, "%6lu\t", (*line_number)++) < 0) return 1;
            line_start = 0;
          }
          if (fputc(buffer[index], stdout) == EOF) return 1;
          if (buffer[index] == '\n') line_start = 1;
        }
      }
      if (ferror(input)) {
        fprintf(stderr, "cat: %s: %s\n", name, strerror(errno));
        return 1;
      }
      return 0;
    }
    
    int main(int argc, char **argv) {
      int number_lines = 0;
      int first_file = 1;
      for (; first_file < argc; first_file++) {
        if (strcmp(argv[first_file], "--") == 0) {
          first_file++;
          break;
        }
        if (strcmp(argv[first_file], "--help") == 0) {
          fputs("usage: cat [-n] [--] [FILE ...]\n", stdout);
          fputs("with no FILE, or when FILE is -, read standard input\n", stdout);
          return 0;
        }
        if (strcmp(argv[first_file], "-n") == 0) {
          number_lines = 1;
          continue;
        }
        if (argv[first_file][0] == '-' && strcmp(argv[first_file], "-") != 0) {
          fprintf(stderr, "cat: unsupported option: %s\n", argv[first_file]);
          return 2;
        }
        break;
      }
    
      int status = 0;
      unsigned long line_number = 1;
      if (first_file == argc) {
        status = copy_stream(stdin, "standard input", number_lines, &line_number);
      }
      for (int index = first_file; index < argc; index++) {
        FILE *input = stdin;
        if (strcmp(argv[index], "-") != 0) {
          input = fopen(argv[index], "rb");
          if (input == NULL) {
            fprintf(stderr, "cat: %s: %s\n", argv[index], strerror(errno));
            status = 1;
            continue;
          }
        }
        if (copy_stream(input, argv[index], number_lines, &line_number) != 0) {
          status = 1;
        }
        if (input != stdin && fclose(input) != 0) {
          fprintf(stderr, "cat: %s: %s\n", argv[index], strerror(errno));
          status = 1;
        }
      }
      if (fflush(stdout) != 0) status = 1;
      return status;
    }
FILE /tmp/core-tools/echo.c
    #include <stdio.h>
    #include <string.h>
    
    int main(int argc, char **argv) {
      int newline = 1;
      int first = 1;
      if (first < argc && strcmp(argv[first], "--help") == 0) {
        fputs("usage: echo [-n] [--] [ARG ...]\n", stdout);
        return 0;
      }
      if (first < argc && strcmp(argv[first], "-n") == 0) {
        newline = 0;
        first++;
      }
      if (first < argc && strcmp(argv[first], "--") == 0) first++;
    
      for (int index = first; index < argc; index++) {
        if (index != first) fputc(' ', stdout);
        fputs(argv[index], stdout);
      }
      if (newline) fputc('\n', stdout);
      fflush(stdout);
      return ferror(stdout) ? 1 : 0;
    }
FILE /tmp/core-tools/touch.c
    #include <errno.h>
    #include <stdio.h>
    #include <string.h>
    #include <utime.h>
    
    int main(int argc, char **argv) {
      int no_create = 0;
      int first_file = 1;
      for (; first_file < argc; first_file++) {
        if (strcmp(argv[first_file], "--") == 0) {
          first_file++;
          break;
        }
        if (strcmp(argv[first_file], "--help") == 0) {
          fputs("usage: touch [-c] [--] FILE ...\n", stdout);
          return 0;
        }
        if (strcmp(argv[first_file], "-c") == 0 ||
            strcmp(argv[first_file], "--no-create") == 0) {
          no_create = 1;
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
        if (utime(argv[index], NULL) == 0) {
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
        }
      }
      return status;
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
FILE /tmp/core-tools/ls.c
    #define _POSIX_C_SOURCE 200809L
    
    #include <dirent.h>
    #include <errno.h>
    #include <stdint.h>
    #include <stdio.h>
    #include <stdlib.h>
    #include <string.h>
    #include <sys/stat.h>
    #include <time.h>
    
    typedef struct { char **items; size_t length; size_t capacity; } name_list;
    typedef struct {
      int show_all, almost_all, long_format, human, directory;
      int classify, recursive, reverse;
    } options;
    
    static void free_names(name_list *names) {
      for (size_t index = 0; index < names->length; index++) free(names->items[index]);
      free(names->items);
    }
    
    static int add_name(name_list *names, const char *name) {
      if (names->length == names->capacity) {
        size_t capacity = names->capacity == 0 ? 32 : names->capacity * 2;
        if (capacity < names->capacity || capacity > SIZE_MAX / sizeof(*names->items)) return -1;
        char **items = realloc(names->items, capacity * sizeof(*items));
        if (items == NULL) return -1;
        names->items = items;
        names->capacity = capacity;
      }
      char *copy = strdup(name);
      if (copy == NULL) return -1;
      names->items[names->length++] = copy;
      return 0;
    }
    
    static int compare_names(const void *left, const void *right) {
      return strcmp(*(const char *const *)left, *(const char *const *)right);
    }
    
    static char *join_path(const char *directory, const char *name) {
      const size_t directory_length = strlen(directory), name_length = strlen(name);
      const int slash = directory_length != 0 && directory[directory_length - 1] != '/';
      if (directory_length > SIZE_MAX - name_length - (size_t)slash - 1) return NULL;
      char *path = malloc(directory_length + (size_t)slash + name_length + 1);
      if (path == NULL) return NULL;
      memcpy(path, directory, directory_length);
      if (slash) path[directory_length] = '/';
      memcpy(path + directory_length + (size_t)slash, name, name_length + 1);
      return path;
    }
    
    static void format_size(char output[32], off_t size, int human) {
      if (!human || size < 1024) { snprintf(output, 32, "%lld", (long long)size); return; }
      static const char units[] = "KMGTPE";
      double value = (double)size;
      size_t unit = 0;
      do { value /= 1024.0; unit++; } while (value >= 1024.0 && unit < sizeof(units) - 1);
      if (value < 10.0) snprintf(output, 32, "%.1f%c", value, units[unit - 1]);
      else snprintf(output, 32, "%.0f%c", value, units[unit - 1]);
    }
    
    static int print_entry(const char *path, const char *name, const options *option) {
      struct stat metadata;
      if (lstat(path, &metadata) != 0) {
        fprintf(stderr, "ls: %s: %s\n", path, strerror(errno));
        return 1;
      }
      const char suffix = option->classify
          ? S_ISDIR(metadata.st_mode) ? '/' : S_ISLNK(metadata.st_mode) ? '@' : '\0'
          : '\0';
      if (!option->long_format) {
        fputs(name, stdout);
        if (suffix != '\0') fputc(suffix, stdout);
        fputc('\n', stdout);
        return 0;
      }
      char size[32], timestamp[32] = "?";
      format_size(size, metadata.st_size, option->human);
      struct tm *broken = localtime(&metadata.st_mtime);
      if (broken != NULL) strftime(timestamp, sizeof(timestamp), "%Y-%m-%d %H:%M", broken);
      const char kind = S_ISDIR(metadata.st_mode) ? 'd' : S_ISLNK(metadata.st_mode) ? 'l' : '-';
      printf("%c %10s %s %s", kind, size, timestamp, name);
      if (suffix != '\0') fputc(suffix, stdout);
      fputc('\n', stdout);
      return 0;
    }
    
    static int hidden(const char *name, const options *option) {
      if (name[0] != '.' || option->show_all) return 0;
      if (option->almost_all && strcmp(name, ".") != 0 && strcmp(name, "..") != 0) return 0;
      return 1;
    }
    
    static int list_path(const char *path, const options *option, int print_heading) {
      struct stat metadata;
      if (lstat(path, &metadata) != 0) {
        fprintf(stderr, "ls: %s: %s\n", path, strerror(errno));
        return 1;
      }
      if (!S_ISDIR(metadata.st_mode) || option->directory) return print_entry(path, path, option);
      DIR *directory = opendir(path);
      if (directory == NULL) { fprintf(stderr, "ls: %s: %s\n", path, strerror(errno)); return 1; }
      name_list names = {0};
      int status = 0;
      struct dirent *entry;
      while ((entry = readdir(directory)) != NULL) {
        if (hidden(entry->d_name, option)) continue;
        if (add_name(&names, entry->d_name) != 0) { fputs("ls: out of memory\n", stderr); status = 1; break; }
      }
      if (closedir(directory) != 0) status = 1;
      qsort(names.items, names.length, sizeof(*names.items), compare_names);
      if (print_heading) printf("%s:\n", path);
      for (size_t offset = 0; offset < names.length; offset++) {
        const size_t index = option->reverse ? names.length - offset - 1 : offset;
        char *entry_path = join_path(path, names.items[index]);
        if (entry_path == NULL || print_entry(entry_path, names.items[index], option) != 0) status = 1;
        free(entry_path);
      }
      if (option->recursive) {
        for (size_t offset = 0; offset < names.length; offset++) {
          const size_t index = option->reverse ? names.length - offset - 1 : offset;
          if (strcmp(names.items[index], ".") == 0 || strcmp(names.items[index], "..") == 0) continue;
          char *entry_path = join_path(path, names.items[index]);
          struct stat child;
          if (entry_path != NULL && lstat(entry_path, &child) == 0 && S_ISDIR(child.st_mode) && !S_ISLNK(child.st_mode)) {
            fputc('\n', stdout);
            if (list_path(entry_path, option, 1) != 0) status = 1;
          }
          free(entry_path);
        }
      }
      free_names(&names);
      return status;
    }
    
    static int short_option(options *option, char value) {
      switch (value) {
        case '1': return 0;
        case 'a': option->show_all = 1; option->almost_all = 0; return 0;
        case 'A': option->almost_all = 1; option->show_all = 0; return 0;
        case 'd': option->directory = 1; return 0;
        case 'F': case 'p': option->classify = 1; return 0;
        case 'h': option->human = 1; return 0;
        case 'l': option->long_format = 1; return 0;
        case 'R': option->recursive = 1; return 0;
        case 'r': option->reverse = 1; return 0;
        default: return -1;
      }
    }
    
    int main(int argc, char **argv) {
      options option = {0};
      int first_path = 1;
      for (; first_path < argc; first_path++) {
        const char *argument = argv[first_path];
        if (strcmp(argument, "--") == 0) { first_path++; break; }
        if (strcmp(argument, "--help") == 0) {
          fputs("usage: ls [-1aAdFhlpRr] [--color[=WHEN]] [--] [PATH ...]\n", stdout);
          return 0;
        }
        if (strncmp(argument, "--color", 7) == 0 || strcmp(argument, "--group-directories-first") == 0) continue;
        if (argument[0] != '-' || argument[1] == '\0') break;
        for (size_t index = 1; argument[index] != '\0'; index++) {
          if (short_option(&option, argument[index]) != 0) {
            fprintf(stderr, "ls: unsupported option: -%c\n", argument[index]);
            return 2;
          }
        }
      }
      if (first_path == argc) return list_path(".", &option, 0);
      const int multiple = argc - first_path > 1;
      int status = 0;
      for (int index = first_path; index < argc; index++) {
        if (index != first_path) fputc('\n', stdout);
        if (list_path(argv[index], &option, multiple) != 0) status = 1;
      }
      return status;
    }
FILE /tmp/core-tools/stat.c
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
FILE /tmp/core-tools/file.c
    #define _POSIX_C_SOURCE 200809L
    
    #include <ctype.h>
    #include <errno.h>
    #include <stdio.h>
    #include <string.h>
    #include <sys/stat.h>
    
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
      int text = 1;
      for (size_t index = 0; index < length; index++) {
        if (bytes[index] == 0 || (!isprint(bytes[index]) && !isspace(bytes[index]))) { text = 0; break; }
      }
      return text ? (mime ? "text/plain" : "ASCII text")
                  : (mime ? "application/octet-stream" : "data");
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
FILE /tmp/core-tools/test.c
    #define _POSIX_C_SOURCE 200809L
    
    #include <errno.h>
    #include <stdio.h>
    #include <stdlib.h>
    #include <string.h>
    #include <sys/stat.h>
    
    #ifndef DOLLY_BRACKET
    #define DOLLY_BRACKET 0
    #endif
    
    static int unary(const char *operation, const char *value, int *known) {
      struct stat metadata;
      *known = 1;
      if (strcmp(operation, "-n") == 0) return value[0] != '\0';
      if (strcmp(operation, "-z") == 0) return value[0] == '\0';
      if (strcmp(operation, "-e") == 0) return lstat(value, &metadata) == 0;
      if (strcmp(operation, "-f") == 0) return lstat(value, &metadata) == 0 && S_ISREG(metadata.st_mode);
      if (strcmp(operation, "-d") == 0) return lstat(value, &metadata) == 0 && S_ISDIR(metadata.st_mode);
      if (strcmp(operation, "-s") == 0) return lstat(value, &metadata) == 0 && metadata.st_size > 0;
      if (strcmp(operation, "-L") == 0 || strcmp(operation, "-h") == 0)
        return lstat(value, &metadata) == 0 && S_ISLNK(metadata.st_mode);
      *known = 0;
      return 0;
    }
    
    static int integer(const char *left, const char *operation, const char *right, int *known) {
      char *left_end, *right_end;
      errno = 0;
      const long long a = strtoll(left, &left_end, 10), b = strtoll(right, &right_end, 10);
      if (errno != 0 || *left_end != '\0' || *right_end != '\0') return -1;
      *known = 1;
      if (strcmp(operation, "-eq") == 0) return a == b;
      if (strcmp(operation, "-ne") == 0) return a != b;
      if (strcmp(operation, "-gt") == 0) return a > b;
      if (strcmp(operation, "-ge") == 0) return a >= b;
      if (strcmp(operation, "-lt") == 0) return a < b;
      if (strcmp(operation, "-le") == 0) return a <= b;
      *known = 0;
      return 0;
    }
    
    static int evaluate(int argc, char **argv, int *error) {
      *error = 0;
      if (argc == 0) return 0;
      if (argc >= 2 && strcmp(argv[0], "!") == 0) {
        return !evaluate(argc - 1, argv + 1, error);
      }
      if (argc == 1) return argv[0][0] != '\0';
      if (argc == 2) {
        int known;
        const int result = unary(argv[0], argv[1], &known);
        if (known) return result;
      }
      if (argc == 3) {
        if (strcmp(argv[1], "=") == 0 || strcmp(argv[1], "==") == 0) return strcmp(argv[0], argv[2]) == 0;
        if (strcmp(argv[1], "!=") == 0) return strcmp(argv[0], argv[2]) != 0;
        int known = 0;
        const int result = integer(argv[0], argv[1], argv[2], &known);
        if (result < 0) { *error = 1; return 0; }
        if (known) return result;
      }
      *error = 1;
      return 0;
    }
    
    int main(int argc, char **argv) {
      argc--; argv++;
      if (DOLLY_BRACKET) {
        if (argc == 0 || strcmp(argv[argc - 1], "]") != 0) { fputs("[: missing ]\n", stderr); return 2; }
        argc--;
      }
      int error = 0;
      const int result = evaluate(argc, argv, &error);
      if (error) { fputs(DOLLY_BRACKET ? "[: unsupported expression\n" : "test: unsupported expression\n", stderr); return 2; }
      return result ? 0 : 1;
    }
FILE /tmp/core-tools/bracket.c
    #define DOLLY_BRACKET 1
    #include "test.c"
FILE /tmp/core-tools/mv.c
    #define _POSIX_C_SOURCE 200809L
    
    #include <errno.h>
    #include <stdio.h>
    #include <stdlib.h>
    #include <string.h>
    #include <sys/stat.h>
    
    static const char *base_name(const char *path) {
      const char *slash = strrchr(path, '/');
      return slash == NULL ? path : slash + 1;
    }
    
    static int move_one(const char *source, const char *destination,
                        int destination_is_directory) {
      char *target = NULL;
      if (destination_is_directory) {
        const char *name = base_name(source);
        const size_t destination_length = strlen(destination);
        const size_t name_length = strlen(name);
        const int slash = destination_length != 0 &&
                          destination[destination_length - 1] != '/';
        target = malloc(destination_length + (size_t)slash + name_length + 1);
        if (target == NULL) {
          fputs("mv: out of memory\n", stderr);
          return 1;
        }
        memcpy(target, destination, destination_length);
        if (slash) target[destination_length] = '/';
        memcpy(target + destination_length + (size_t)slash, name, name_length + 1);
      }
      const char *resolved = target == NULL ? destination : target;
      if (rename(source, resolved) != 0) {
        fprintf(stderr, "mv: %s -> %s: %s\n", source, resolved, strerror(errno));
        free(target);
        return 1;
      }
      free(target);
      return 0;
    }
    
    int main(int argc, char **argv) {
      int first = 1;
      while (first < argc && argv[first][0] == '-') {
        if (strcmp(argv[first], "--") == 0) {
          first++;
          break;
        }
        if (strcmp(argv[first], "-f") != 0) {
          fprintf(stderr, "mv: unsupported option %s\n", argv[first]);
          return 2;
        }
        first++;
      }
      if (argc - first < 2) {
        fputs("usage: mv [-f] SOURCE... DESTINATION\n", stderr);
        return 2;
      }
      const char *destination = argv[argc - 1];
      struct stat metadata;
      const int destination_is_directory =
          stat(destination, &metadata) == 0 && S_ISDIR(metadata.st_mode);
      if (argc - first > 2 && !destination_is_directory) {
        fprintf(stderr, "mv: %s is not a directory\n", destination);
        return 1;
      }
      int status = 0;
      for (int index = first; index < argc - 1; index++) {
        if (move_one(argv[index], destination, destination_is_directory) != 0) {
          status = 1;
        }
      }
      return status;
    }
FILE /tmp/core-tools/cp.c
    #define _POSIX_C_SOURCE 200809L
    #define _XOPEN_SOURCE 700
    
    #include <dirent.h>
    #include <errno.h>
    #include <fcntl.h>
    #include <limits.h>
    #include <stdio.h>
    #include <stdlib.h>
    #include <string.h>
    #include <sys/stat.h>
    #include <unistd.h>
    
    static int recursive;
    static int verbose;
    
    static const char *base_name(const char *path) {
      size_t length = strlen(path);
      while (length > 1 && path[length - 1] == '/') length--;
      const char *base = path + length;
      while (base > path && base[-1] != '/') base--;
      return base;
    }
    
    static char *join_path(const char *directory, const char *name) {
      const size_t directory_length = strlen(directory);
      const size_t name_length = strlen(name);
      const int slash = directory_length != 0 && directory[directory_length - 1] != '/';
      char *joined = malloc(directory_length + (size_t)slash + name_length + 1);
      if (joined == NULL) return NULL;
      memcpy(joined, directory, directory_length);
      if (slash) joined[directory_length] = '/';
      memcpy(joined + directory_length + (size_t)slash, name, name_length + 1);
      return joined;
    }
    
    static int copy_path(const char *source, const char *destination);
    
    static int copy_regular(const char *source, const char *destination) {
      int input = open(source, O_RDONLY);
      if (input < 0) {
        fprintf(stderr, "cp: %s: %s\n", source, strerror(errno));
        return 1;
      }
      int output = open(destination, O_WRONLY | O_CREAT | O_TRUNC, 0666);
      if (output < 0) {
        fprintf(stderr, "cp: %s: %s\n", destination, strerror(errno));
        close(input);
        return 1;
      }
    
      int status = 0;
      unsigned char buffer[16384];
      for (;;) {
        ssize_t count = read(input, buffer, sizeof(buffer));
        if (count < 0 && errno == EINTR) continue;
        if (count < 0) {
          fprintf(stderr, "cp: %s: %s\n", source, strerror(errno));
          status = 1;
          break;
        }
        if (count == 0) break;
        size_t offset = 0;
        while (offset < (size_t)count) {
          ssize_t written = write(output, buffer + offset, (size_t)count - offset);
          if (written < 0 && errno == EINTR) continue;
          if (written <= 0) {
            fprintf(stderr, "cp: %s: %s\n", destination,
                    written == 0 ? "short write" : strerror(errno));
            status = 1;
            break;
          }
          offset += (size_t)written;
        }
        if (status != 0) break;
      }
      if (close(input) != 0 && status == 0) status = 1;
      if (close(output) != 0 && status == 0) {
        fprintf(stderr, "cp: %s: %s\n", destination, strerror(errno));
        status = 1;
      }
      return status;
    }
    
    static int copy_link(const char *source, const char *destination,
                         off_t source_size) {
      size_t capacity = source_size > 0 ? (size_t)source_size + 1 : 256;
      char *target = malloc(capacity);
      if (target == NULL) {
        fputs("cp: out of memory\n", stderr);
        return 1;
      }
      const ssize_t length = readlink(source, target, capacity - 1);
      if (length < 0 || (size_t)length >= capacity - 1) {
        fprintf(stderr, "cp: %s: %s\n", source,
                length < 0 ? strerror(errno) : "link target is too long");
        free(target);
        return 1;
      }
      target[length] = '\0';
      if (unlink(destination) != 0 && errno != ENOENT) {
        fprintf(stderr, "cp: %s: %s\n", destination, strerror(errno));
        free(target);
        return 1;
      }
      if (symlink(target, destination) != 0) {
        fprintf(stderr, "cp: %s: %s\n", destination, strerror(errno));
        free(target);
        return 1;
      }
      free(target);
      return 0;
    }
    
    static int copy_directory(const char *source, const char *destination) {
      if (!recursive) {
        fprintf(stderr, "cp: %s is a directory (use -R)\n", source);
        return 1;
      }
      struct stat destination_metadata;
      int created = 0;
      if (lstat(destination, &destination_metadata) != 0) {
        if (errno != ENOENT || mkdir(destination, 0777) != 0) {
          fprintf(stderr, "cp: %s: %s\n", destination, strerror(errno));
          return 1;
        }
        created = 1;
      } else if (!S_ISDIR(destination_metadata.st_mode)) {
        fprintf(stderr, "cp: %s is not a directory\n", destination);
        return 1;
      }
    
      char source_resolved[PATH_MAX];
      char destination_resolved[PATH_MAX];
      if (realpath(source, source_resolved) != NULL &&
          realpath(destination, destination_resolved) != NULL) {
        const size_t source_length = strlen(source_resolved);
        const int nested = strcmp(source_resolved, destination_resolved) == 0 ||
            (strncmp(source_resolved, destination_resolved, source_length) == 0 &&
             destination_resolved[source_length] == '/');
        if (nested) {
          fprintf(stderr, "cp: refusing to copy %s into itself at %s\n",
                  source, destination);
          if (created) (void)rmdir(destination);
          return 1;
        }
      }
    
      DIR *directory = opendir(source);
      if (directory == NULL) {
        fprintf(stderr, "cp: %s: %s\n", source, strerror(errno));
        return 1;
      }
      int status = 0;
      struct dirent *entry;
      while ((entry = readdir(directory)) != NULL) {
        if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) continue;
        char *source_child = join_path(source, entry->d_name);
        char *destination_child = join_path(destination, entry->d_name);
        if (source_child == NULL || destination_child == NULL) {
          fputs("cp: out of memory\n", stderr);
          status = 1;
        } else if (copy_path(source_child, destination_child) != 0) {
          status = 1;
        }
        free(source_child);
        free(destination_child);
        if (status != 0) break;
      }
      if (closedir(directory) != 0 && status == 0) status = 1;
      return status;
    }
    
    static int copy_path(const char *source, const char *destination) {
      struct stat metadata;
      if (lstat(source, &metadata) != 0) {
        fprintf(stderr, "cp: %s: %s\n", source, strerror(errno));
        return 1;
      }
      struct stat destination_metadata;
      if (lstat(destination, &destination_metadata) == 0 &&
          metadata.st_dev == destination_metadata.st_dev &&
          metadata.st_ino == destination_metadata.st_ino) {
        fprintf(stderr, "cp: %s and %s are the same file\n", source, destination);
        return 1;
      }
      if (verbose) printf("%s -> %s\n", source, destination);
      if (S_ISREG(metadata.st_mode)) return copy_regular(source, destination);
      if (S_ISDIR(metadata.st_mode)) return copy_directory(source, destination);
      if (S_ISLNK(metadata.st_mode)) return copy_link(source, destination, metadata.st_size);
      fprintf(stderr, "cp: %s: unsupported file type\n", source);
      return 1;
    }
    
    static int copy_operand(const char *source, const char *destination,
                            int destination_is_directory) {
      char *target = NULL;
      if (destination_is_directory) {
        target = join_path(destination, base_name(source));
        if (target == NULL) {
          fputs("cp: out of memory\n", stderr);
          return 1;
        }
      }
      const int status = copy_path(source, target == NULL ? destination : target);
      free(target);
      return status;
    }
    
    int main(int argc, char **argv) {
      int first = 1;
      for (; first < argc; first++) {
        const char *argument = argv[first];
        if (strcmp(argument, "--") == 0) {
          first++;
          break;
        }
        if (strcmp(argument, "--help") == 0) {
          fputs("usage: cp [-Rrvf] [--] SOURCE... DESTINATION\n", stdout);
          return 0;
        }
        if (argument[0] != '-' || argument[1] == '\0') break;
        for (const char *option = argument + 1; *option != '\0'; option++) {
          if (*option == 'R' || *option == 'r') recursive = 1;
          else if (*option == 'v') verbose = 1;
          else if (*option != 'f') {
            fprintf(stderr, "cp: unsupported option -%c\n", *option);
            return 2;
          }
        }
      }
      if (argc - first < 2) {
        fputs("usage: cp [-Rrvf] [--] SOURCE... DESTINATION\n", stderr);
        return 2;
      }
    
      const char *destination = argv[argc - 1];
      struct stat metadata;
      const int destination_is_directory =
          stat(destination, &metadata) == 0 && S_ISDIR(metadata.st_mode);
      if (argc - first > 2 && !destination_is_directory) {
        fprintf(stderr, "cp: %s is not a directory\n", destination);
        return 1;
      }
      int status = 0;
      for (int index = first; index < argc - 1; index++) {
        if (copy_operand(argv[index], destination, destination_is_directory) != 0) {
          status = 1;
        }
      }
      return status;
    }
SLOP cc \
  /tmp/core-tools/help.c \
  -o /bin/help
SLOP cc \
  /tmp/core-tools/pwd.c \
  -o /bin/pwd
SLOP cc \
  /tmp/core-tools/cd.c \
  -o /bin/cd
SLOP cc \
  /tmp/core-tools/cat.c \
  -o /bin/cat
SLOP cc \
  /tmp/core-tools/echo.c \
  -o /bin/echo
SLOP cc \
  /tmp/core-tools/touch.c \
  -o /bin/touch
SLOP cc \
  /tmp/core-tools/clear.c \
  -o /bin/clear
SLOP cc \
  /tmp/core-tools/ls.c \
  -o /bin/ls
SLOP cc \
  /tmp/core-tools/stat.c \
  -o /bin/stat
SLOP cc \
  /tmp/core-tools/file.c \
  -o /bin/file
SLOP cc \
  /tmp/core-tools/test.c \
  -o /bin/test
SLOP cc \
  -I /tmp/core-tools \
  /tmp/core-tools/bracket.c \
  -o /bin/[
SLOP cc \
  /tmp/core-tools/mv.c \
  -o /bin/mv
SLOP cc \
  /tmp/core-tools/cp.c \
  -o /bin/cp
EXPORTS TOOL help
EXPORTS TOOL pwd
EXPORTS TOOL cd
EXPORTS TOOL cat
EXPORTS TOOL echo
EXPORTS TOOL touch
EXPORTS TOOL clear
EXPORTS TOOL ls
EXPORTS TOOL stat
EXPORTS TOOL file
EXPORTS TOOL test
EXPORTS TOOL [
EXPORTS TOOL mv
EXPORTS TOOL cp

SLOP rm \
  -rf \
  /tmp/core-tools
