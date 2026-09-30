#define _GNU_SOURCE
#include <dolly/runtime.h>
#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

/* Translate the experimental Rust Emscripten target's linker vocabulary to
 * Dolly cc. Unsupported Emscripten modes remain errors. */
int main(int argc, char **argv) {
  char directory[] = "/tmp/dolly-rust-link.XXXXXX";
  if (!mkdtemp(directory)) { perror("mkdtemp"); return 1; }
  size_t capacity = (size_t)argc + 2;
  for (int i = 1; i < argc; i++) capacity += strlen(argv[i]);
  char **args = calloc(capacity, sizeof(*args));
  char **links = calloc((size_t)argc, sizeof(*links));
  if (!args || !links) return 1;
  int count = 0, files = 0, status = 1;
  args[count++] = "/bin/cc";
  int shared = 0;
  for (int i = 1; i < argc; i++) if (!strcmp(argv[i], "-sSIDE_MODULE=2")) shared = 1;
  if (shared) args[count++] = "-Wl,--no-export-dynamic";
  for (int i = 1; i < argc; i++) {
    char *arg = argv[i];
    if (!strcmp(arg, "-s")) {
      if (++i >= argc) goto invalid;
      arg = argv[i];
      const char *prefix = "EXPORTED_FUNCTIONS=[";
      if (strncmp(arg, prefix, strlen(prefix))) goto invalid;
      char *cursor = arg + strlen(prefix);
      while (*cursor != ']') {
        if (cursor[0] != '"' || cursor[1] != '_') goto invalid;
        cursor += 2; /* Emscripten adds one underscore to Wasm symbol names. */
        char *begin = cursor;
        while (isalnum((unsigned char)*cursor) || *cursor == '_' || *cursor == '.' || *cursor == '$') cursor++;
        if (*cursor != '"' || cursor == begin) goto invalid;
        char *option;
        if (asprintf(&option, "-Wl,--export=%.*s", (int)(cursor - begin), begin) < 0) goto done;
        args[count++] = option;
        cursor++;
        if (*cursor == ',') cursor++;
        else if (*cursor != ']') goto invalid;
      }
      if (cursor[1]) goto invalid;
      continue;
    }
    /* Dolly malloc already returns NULL on failure. Wasm i64 crosses its
     * typed process ABI directly; there is no Emscripten JavaScript wrapper. */
    if (!strcmp(arg, "-sABORTING_MALLOC=0") || !strcmp(arg, "-sWASM_BIGINT")) continue;
    if (!strcmp(arg, "-sSIDE_MODULE=2")) arg = "-shared";
    if (!strcmp(arg, "-fwasm-exceptions")) arg = "-fexceptions";
    size_t length = strlen(arg);
    if (shared && length >= 16 && !strcmp(arg + length - 16, "/libdolly-rust.a")) continue;
    if (length > 5 && !strcmp(arg + length - 5, ".rlib")) {
      char *path;
      if (asprintf(&path, "%s/%d.a", directory, files) < 0) goto done;
      char absolute[PATH_MAX];
      if (!realpath(arg, absolute) || symlink(absolute, path)) { perror(arg); goto done; }
      links[files++] = path;
      arg = path;
    }
    args[count++] = arg;
    continue;
invalid:
    fprintf(stderr, "dolly-rust-link: unsupported linker setting: %s\n", arg);
    status = 64;
    goto done;
  }
  int pid = dolly_spawn(args[0], count, args, 0, 1, 2);
  if (pid < 0) { errno = -pid; perror("dolly-rust-link: spawn cc"); goto done; }
  int error = dolly_wait(pid, &status);
  if (error) { errno = -error; perror("dolly-rust-link: wait cc"); status = 1; }
done:
  for (int i = 0; i < files; i++) unlink(links[i]);
  rmdir(directory);
  return status;
}
