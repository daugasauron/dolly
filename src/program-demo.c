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

static int verify_lua_output(void) {
  static const char expected[] = "lua 5.5.1 saw 49 bytes\n";
  char buffer[sizeof(expected)] = {0};
  FILE *file = fopen("/workspace/lua.txt", "rb");
  if (file == NULL) {
    fprintf(stderr, "demo: Lua output is missing: %s\n", strerror(errno));
    return 1;
  }
  size_t length = fread(buffer, 1, sizeof(buffer) - 1, file);
  int close_status = fclose(file);
  if (close_status != 0 || length != sizeof(expected) - 1 ||
      strcmp(buffer, expected) != 0) {
    fputs("demo: Lua output did not match\n", stderr);
    return 2;
  }
  return 0;
}

int main(int argc, char **argv) {
  (void)argc;
  (void)argv;
  if (ensure_workspace() != 0) return 10;
  remove("/workspace/shared.txt");
  remove("/workspace/lua.txt");
  remove("/workspace/host-escape.txt");

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

  fputs("dolly: loading unmodified Lua 5.5.1 sources from WasmFS\n", stdout);
  char lua_script[] =
      "local ok = os.execute('touch /workspace/host-escape.txt'); "
      "assert(ok == nil, 'subprocess unexpectedly succeeded'); "
      "assert(io.open('/workspace/host-escape.txt', 'rb') == nil, 'subprocess wrote a file'); "
      "local f = assert(io.open('/workspace/shared.txt', 'rb')); "
      "local s = f:read('a'); f:close(); assert(#s == 49); "
      "local o = assert(io.open('/workspace/lua.txt', 'wb')); "
      "o:write('lua 5.5.1 saw ', #s, ' bytes\\n'); o:close(); "
      "print('lua 5.5.1: observed ' .. #s .. ' bytes from WasmFS; subprocess denied')";
  char *lua_argv[] = {"lua", "-e", lua_script, NULL};
  status = spawn_and_wait("/usr/bin/lua", 3, lua_argv);
  if (status != 0) {
    fprintf(stderr, "dolly: Lua failed with status %d\n", status);
    return 100 + status;
  }
  status = verify_lua_output();
  if (status != 0) return 110 + status;

  fputs("dolly: shared in-Wasm filesystem verified\n", stdout);
  return 0;
}
