#define _POSIX_C_SOURCE 200809L

#include <dolly/runtime.h>

#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

static const char compiler_path[] =
    "/usr/libexec/dolly/process-bin/compiler";

static int run_child(const char *path, int argc, char **argv) {
  const int pid = dolly_spawn(
      path, argc, argv, STDIN_FILENO, STDOUT_FILENO, STDERR_FILENO);
  if (pid < 0) {
    fprintf(stderr, "dolly-bootstrap: %s: spawn failed: %s\n",
            path, strerror(-pid));
    return 126;
  }
  int status = 126;
  const int waited = dolly_wait(pid, &status);
  if (waited != 0) {
    fprintf(stderr, "dolly-bootstrap: %s: wait failed: %s\n",
            path, strerror(-waited));
    return 126;
  }
  return status;
}

static int compile_source(const char *source, const char *output) {
  printf("dolly: compiling %s to %s as a private process\n", source, output);
  fflush(stdout);
  char *arguments[] = {
      (char *)output,
      "--dolly-toolchain-mode=c",
      "-O1",
      (char *)source,
      "-o",
      (char *)output,
      NULL,
  };
  const int status = run_child(compiler_path, 6, arguments);
  if (status != 0) {
    fprintf(stderr, "dolly-bootstrap: compiler failed for %s with status %d\n",
            output, status);
  }
  return status;
}

static char *read_boot_text(const char *path) {
  int descriptor = open(path, O_RDONLY);
  if (descriptor < 0) return NULL;
  struct stat metadata;
  if (fstat(descriptor, &metadata) != 0 || metadata.st_size <= 0 ||
      metadata.st_size > 8192) {
    close(descriptor);
    errno = EINVAL;
    return NULL;
  }
  char *text = malloc((size_t)metadata.st_size + 1);
  if (text == NULL) {
    close(descriptor);
    return NULL;
  }
  size_t offset = 0;
  while (offset < (size_t)metadata.st_size) {
    const ssize_t count = read(
        descriptor, text + offset, (size_t)metadata.st_size - offset);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) {
      free(text);
      close(descriptor);
      errno = count == 0 ? EIO : errno;
      return NULL;
    }
    offset += (size_t)count;
  }
  if (close(descriptor) != 0) {
    free(text);
    return NULL;
  }
  while (offset != 0 && (text[offset - 1] == '\n' || text[offset - 1] == '\r')) {
    --offset;
  }
  text[offset] = 0;
  if (offset == 0) {
    free(text);
    errno = EINVAL;
    return NULL;
  }
  return text;
}

static int build_core(void) {
  static const struct {
    const char *source;
    const char *output;
  } programs[] = {
      {"/usr/src/dolly/slop.c", "/bin/slop"},
      {"/usr/src/dolly/commands/mkdir.c", "/bin/mkdir"},
      {"/usr/src/dolly/commands/rm.c", "/bin/rm"},
      {"/usr/src/dolly/dollyfile.c", "/bin/dollyfile"},
      {"/usr/src/dolly/process-tools/cc.c", "/bin/cc"},
      {"/usr/src/dolly/process-tools/cxx.c", "/bin/c++"},
      {"/usr/src/dolly/process-tools/ld.c", "/bin/ld"},
      {"/usr/src/dolly/process-tools/ar.c", "/bin/ar"},
  };
  for (size_t index = 0; index < sizeof(programs) / sizeof(programs[0]); ++index) {
    const int status = compile_source(programs[index].source,
                                      programs[index].output);
    if (status != 0) return status;
  }
  puts("dolly: private compiler, Slop, and Dollyfile engine installed in /bin");
  fflush(stdout);
  return 0;
}

static int run_recipe(unsigned resume_uses) {
  char *recipe = read_boot_text("/etc/dolly/recipe.locator");
  char *host_base = read_boot_text("/etc/dolly/host.base");
  if (recipe == NULL || host_base == NULL) {
    fprintf(stderr, "dolly-bootstrap: invalid boot configuration: %s\n",
            strerror(errno));
    free(recipe);
    free(host_base);
    return 1;
  }
  char resume_text[16];
  snprintf(resume_text, sizeof(resume_text), "%u", resume_uses);
  char *arguments[] = {
      "/bin/dollyfile",
      recipe,
      host_base,
      resume_uses == 0 ? NULL : "--resume",
      resume_uses == 0 ? NULL : resume_text,
      NULL,
  };
  const int status = run_child(
      "/bin/dollyfile", resume_uses == 0 ? 3 : 5, arguments);
  free(recipe);
  free(host_base);
  return status;
}

int main(int argc, char **argv) {
  unsigned resume_uses = 0;
  if (argc == 3 && strcmp(argv[1], "--resume") == 0) {
    char *end = NULL;
    errno = 0;
    const unsigned long parsed = strtoul(argv[2], &end, 10);
    if (errno != 0 || end == argv[2] || *end != 0 || parsed == 0 ||
        parsed > UINT_MAX) return 64;
    resume_uses = (unsigned)parsed;
  } else if (argc != 1) {
    return 64;
  }
  const int core_status = build_core();
  return core_status == 0 ? run_recipe(resume_uses) : core_status;
}
