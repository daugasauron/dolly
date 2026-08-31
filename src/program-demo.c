#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#include <dolly/runtime.h>

static int spawn_and_wait(const char *path, int argc, char **argv) {
  int pid = dolly_spawn(path, argc, argv,
                        STDIN_FILENO, STDOUT_FILENO, STDERR_FILENO);
  if (pid < 0) {
    fprintf(stderr, "demo: %s: spawn failed: %s\n", path, strerror(-pid));
    return 126;
  }
  int status = 126;
  int result = dolly_wait(pid, &status);
  if (result != 0) {
    fprintf(stderr, "demo: %s: wait failed: %s\n", path, strerror(-result));
    return 126;
  }
  return status;
}

static int ensure_workspace(void) {
  if (mkdir("/workspace", 0755) == 0 || errno == EEXIST) return 0;
  fprintf(stderr, "demo: mkdir /workspace failed: %s\n", strerror(errno));
  return 1;
}

int main(int argc, char **argv) {
  (void)argc;
  (void)argv;
  if (ensure_workspace() != 0) return 10;
  remove("/workspace/shared.txt");

  fputs("dolly: loading writer module from WasmFS\n", stdout);
  char *writer_argv[] = {"writer", "/workspace/shared.txt", NULL};
  int status = spawn_and_wait("/usr/libexec/dolly/writer", 2, writer_argv);
  if (status != 0) {
    fprintf(stderr, "dolly: writer failed with status %d\n", status);
    return 20 + status;
  }

  fputs("dolly: loading reader module from WasmFS\n", stdout);
  char *reader_argv[] = {"reader", "/workspace/shared.txt", NULL};
  status = spawn_and_wait("/usr/libexec/dolly/reader", 2, reader_argv);
  if (status != 0) {
    fprintf(stderr, "dolly: reader failed with status %d\n", status);
    return 40 + status;
  }

  fputs("dolly: loading inspector module from WasmFS\n", stdout);
  char *inspector_argv[] = {"inspector", "--verify", NULL};
  status = spawn_and_wait("/usr/libexec/dolly/inspector", 2, inspector_argv);
  if (status != 0) {
    fprintf(stderr, "dolly: inspector failed with status %d\n", status);
    return 60 + status;
  }

  fputs("dolly: loading C++23 module from WasmFS\n", stdout);
  char *cpp_argv[] = {"cpp-check", "/workspace/shared.txt", NULL};
  status = spawn_and_wait("/usr/libexec/dolly/cpp-check", 2, cpp_argv);
  if (status != 0) {
    fprintf(stderr, "dolly: C++ module failed with status %d\n", status);
    return 80 + status;
  }

  fputs("dolly: shared in-Wasm filesystem verified\n", stdout);
  return 0;
}
