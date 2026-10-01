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

// The engine is the only program compiled before the root recipe runs; the
// recipe builds everything else, with COMPILEC until Slop exists.
static int compile_engine(void) {
  static const char source[] = "/usr/src/dolly/dollyfile.c";
  static const char output[] = "/bin/dollyfile";
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

static int run_recipe(void) {
  char *recipe = read_boot_text("/etc/dolly/recipe.locator");
  if (recipe == NULL) {
    fprintf(stderr, "dolly-bootstrap: invalid boot configuration: %s\n",
            strerror(errno));
    return 1;
  }
  char *arguments[] = {"/bin/dollyfile", recipe, NULL};
  const int status = run_child("/bin/dollyfile", 2, arguments);
  free(recipe);
  return status;
}

int main(int argc, char **argv) {
  (void)argv;
  if (argc != 1) return 64;
  const int status = compile_engine();
  return status == 0 ? run_recipe() : status;
}
