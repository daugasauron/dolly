#define _GNU_SOURCE
#include <dolly/runtime.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/random.h>
#include <sys/stat.h>
#include <unistd.h>

static void fail(const char *path) {
  perror(path);
  exit(1);
}

static void create(const char *directory, const char *name, const char *bytes, size_t size) {
  char path[PATH_MAX];
  if (snprintf(path, sizeof(path), "%s/%s", directory, name) >= (int)sizeof(path)) {
    errno = ENAMETOOLONG; fail(directory);
  }
  int fd = open(path, O_WRONLY | O_CREAT | O_EXCL, 0600);
  if (fd < 0) {
    if (errno == EEXIST) return;
    fail(path);
  }
  while (size) {
    ssize_t count = write(fd, bytes, size);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) { close(fd); unlink(path); fail(path); }
    bytes += count; size -= (size_t)count;
  }
  if (close(fd)) fail(path);
}

int main(int argc, char **argv) {
  const char *configured = getenv("CODEX_HOME"), *home = getenv("HOME");
  char directory[PATH_MAX];
  int length = configured ? snprintf(directory, sizeof(directory), "%s", configured)
                          : snprintf(directory, sizeof(directory), "%s/.codex", home ? home : "/home/dolly");
  if (length <= 0) { errno = EINVAL; fail("CODEX_HOME"); }
  if (length >= (int)sizeof(directory)) { errno = ENAMETOOLONG; fail("CODEX_HOME"); }
  for (char *part = directory + 1; ; ++part) {
    if (*part && *part != '/') continue;
    char saved = *part; *part = 0;
    if (mkdir(directory, 0700) && errno != EEXIST) fail(directory);
    *part = saved;
    if (!saved) break;
  }
  unsigned char random[16];
  if (getrandom(random, sizeof(random), 0) != (ssize_t)sizeof(random)) fail("getrandom");
  random[6] = (random[6] & 15) | 64;
  random[8] = (random[8] & 63) | 128;
  char id[38], *cursor = id;
  for (int i = 0; i < 16; i++) {
    if (i == 4 || i == 6 || i == 8 || i == 10) *cursor++ = '-';
    cursor += sprintf(cursor, "%02x", random[i]);
  }
  *cursor++ = '\n';
  create(directory, "installation_id", id, (size_t)(cursor - id));
  FILE *file = fopen("/usr/share/codex/config.toml", "r");
  if (!file) fail("Codex default configuration");
  char config[4096];
  size_t size = fread(config, 1, sizeof(config), file);
  if (ferror(file) || size == sizeof(config) || fclose(file)) fail("Codex default configuration");
  create(directory, "config.toml", config, size);
  char rules[PATH_MAX];
  if (snprintf(rules, sizeof(rules), "%s/rules/default.rules", directory) >= (int)sizeof(rules)) {
    errno = ENAMETOOLONG; fail(directory);
  }
  if (access(rules, F_OK) != 0 && errno == ENOENT) create(directory, ".sandbox_migration", "v1\n", 3);
  if (!getenv("SHELL") && setenv("SHELL", "/bin/sh", 1)) fail("SHELL");
  int pid = isatty(0) && isatty(1)
      ? dolly_spawn_foreground("/usr/libexec/codex", argc, argv, 1)
      : dolly_spawn("/usr/libexec/codex", argc, argv, 0, 1, 2);
  if (pid < 0) { errno = -pid; fail("codex"); }
  int status;
  int error = dolly_wait(pid, &status);
  if (error) { errno = -error; fail("codex wait"); }
  return status;
}
