#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/uio.h>
#include <sys/wait.h>
#include <unistd.h>
#ifdef __EMSCRIPTEN__
#include <dolly/runtime.h>
#endif

#define CHECK(condition) do { if (!(condition)) { \
  fprintf(stderr, "DESCRIPTORS FAIL line %d: %s (errno %d)\n", __LINE__, #condition, errno); \
  exit(1); \
} } while (0)

static int scratch(const char *contents) {
  char path[] = "/tmp/process-descriptors-XXXXXX";
  int fd = mkstemp(path);
  CHECK(fd >= 0);
  CHECK(unlink(path) == 0);
  CHECK(write(fd, contents, strlen(contents)) == (ssize_t)strlen(contents));
  CHECK(lseek(fd, 0, SEEK_SET) == 0);
  return fd;
}

static void record_locks(void) {
  int fd = scratch("lock"), closed = dup(fd);
  CHECK(closed >= 0 && close(closed) == 0);
  struct flock lock = {.l_type = F_WRLCK, .l_whence = SEEK_SET, .l_len = 1};
  const int commands[] = {F_GETLK, F_SETLK, F_SETLKW};
  for (unsigned index = 0; index < sizeof(commands) / sizeof(commands[0]); ++index) {
    errno = 0;
    CHECK(fcntl(-1, commands[index], &lock) == -1 && errno == EBADF);
    errno = 0;
    CHECK(fcntl(closed, commands[index], &lock) == -1 && errno == EBADF);
#ifdef __EMSCRIPTEN__
    unsigned char before[sizeof(lock)];
    memcpy(before, &lock, sizeof(lock));
    errno = 0;
    CHECK(fcntl(fd, commands[index], &lock) == -1 && errno == ENOTSUP);
    CHECK(memcmp(before, &lock, sizeof(lock)) == 0);
#endif
  }
#ifdef __EMSCRIPTEN__
  lock.l_type = F_UNLCK;
  errno = 0;
  CHECK(fcntl(fd, F_SETLK, &lock) == -1 && errno == ENOTSUP);
#else
  CHECK(fcntl(fd, F_SETLK, &lock) == 0);
  pid_t pid = fork();
  CHECK(pid >= 0);
  if (pid == 0) {
    CHECK(fcntl(fd, F_GETLK, &lock) == 0);
    CHECK(lock.l_type == F_WRLCK && lock.l_pid == getppid());
    errno = 0;
    CHECK(fcntl(fd, F_SETLK, &lock) == -1 && (errno == EACCES || errno == EAGAIN));
    _exit(0);
  }
  int status;
  CHECK(waitpid(pid, &status, 0) == pid);
  CHECK(WIFEXITED(status) && WEXITSTATUS(status) == 0);
  lock.l_type = F_UNLCK;
  CHECK(fcntl(fd, F_SETLKW, &lock) == 0);
#endif
  CHECK(fcntl(fd, F_GETFD) == 0 && lseek(fd, 0, SEEK_CUR) == 0);
  CHECK(close(fd) == 0);
}

static void nonblocking_pipes(void) {
  int pipes[2];
  CHECK(pipe2(pipes, O_CLOEXEC | O_NONBLOCK) == 0);
  for (int index = 0; index < 2; ++index) {
    CHECK(fcntl(pipes[index], F_GETFD) == FD_CLOEXEC);
    CHECK((fcntl(pipes[index], F_GETFL) & O_NONBLOCK) != 0);
  }
  int duplicate = dup(pipes[0]), disabled = 0, enabled = 1;
  CHECK(duplicate >= 0 && fcntl(duplicate, F_GETFD) == 0);
  CHECK(ioctl(duplicate, FIONBIO, &disabled) == 0);
  CHECK((fcntl(pipes[0], F_GETFL) & O_NONBLOCK) == 0);
  CHECK((fcntl(pipes[1], F_GETFL) & O_NONBLOCK) != 0);
  CHECK(ioctl(pipes[0], FIONBIO, &enabled) == 0);
  CHECK((fcntl(duplicate, F_GETFL) & O_NONBLOCK) != 0);
  CHECK(close(duplicate) == 0);
  char bytes[8192] = {0};
  CHECK(read(pipes[0], bytes, 1) == -1 && errno == EAGAIN);
  CHECK(read(pipes[0], bytes, 0) == 0);
  CHECK(write(pipes[1], "x", 1) == 1);
  struct iovec vectors[] = {{bytes, 1}, {bytes + 1, 1}};
  CHECK(readv(pipes[0], vectors, 2) == 1 && bytes[0] == 'x');
  size_t capacity = 0;
  for (;;) {
    ssize_t count = write(pipes[1], bytes, sizeof(bytes));
    if (count < 0) { CHECK(errno == EAGAIN); break; }
    CHECK(count > 0);
    capacity += count;
    CHECK(capacity <= 1024 * 1024);
  }
  CHECK(capacity >= 4096);
  CHECK(read(pipes[0], bytes, 1) == 1);
  CHECK(write(pipes[1], "xx", 2) == -1 && errno == EAGAIN);
  struct iovec pair[] = {{(void *)"a", 1}, {(void *)"b", 1}};
  CHECK(writev(pipes[1], pair, 2) == -1 && errno == EAGAIN);
  CHECK(read(pipes[0], bytes, 4095) == 4095);
  CHECK(write(pipes[1], bytes, sizeof(bytes)) == 4096);
  CHECK(read(pipes[0], bytes, 4096) == 4096);
  struct iovec large[] = {{bytes, 3}, {bytes + 3, sizeof(bytes) - 3}};
  CHECK(writev(pipes[1], large, 2) == 4096);
  CHECK(close(pipes[1]) == 0);
  size_t received = 0;
  for (;;) {
    ssize_t count = read(pipes[0], bytes, sizeof(bytes));
    CHECK(count >= 0);
    if (count == 0) break;
    received += count;
  }
  CHECK(received == capacity);
  CHECK(close(pipes[0]) == 0);
}

static void vectored_io(void) {
  unsigned char original[70000], received[70000];
  for (size_t index = 0; index < sizeof(original); ++index) original[index] = index;
  struct iovec parts[] = {{NULL, 0}, {original, 1}, {original + 1, 16000},
    {NULL, 0}, {original + 16001, 40000}, {original + 56001, 13999}, {NULL, 0}};
  int fd = scratch("");
  CHECK(writev(fd, parts, 7) == sizeof(original));
  CHECK(lseek(fd, 0, SEEK_SET) == 0);
  struct iovec reads[] = {{received, 40001}, {NULL, 0}, {received + 40001, 29999}};
  CHECK(readv(fd, reads, 3) == sizeof(received));
  CHECK(memcmp(original, received, sizeof(original)) == 0);
  CHECK(close(fd) == 0);
  int pipes[2];
  CHECK(pipe(pipes) == 0);
  CHECK(write(pipes[1], "x", 1) == 1);
  struct iovec short_read[] = {{received, 1}, {received + 1, 1}};
  CHECK(readv(pipes[0], short_read, 2) == 1 && received[0] == 'x');
  CHECK(close(pipes[0]) == 0 && close(pipes[1]) == 0);
}

static void descriptor_flags(void) {
  int fd = scratch("abc"), duplicate, pipes[2];
  CHECK(fcntl(fd, F_GETFD) == 0);
  CHECK(fcntl(fd, F_SETFD, FD_CLOEXEC) == 0);
  CHECK(fcntl(fd, F_GETFD) == FD_CLOEXEC);
  CHECK(dup2(fd, fd) == fd && fcntl(fd, F_GETFD) == FD_CLOEXEC);
  errno = 0;
  CHECK(dup2(-1, -1) == -1 && errno == EBADF);
  errno = 0;
  CHECK(fcntl(-1, F_GETFD) == -1 && errno == EBADF);
  errno = 0;
  CHECK(fcntl(-1, F_SETFD, FD_CLOEXEC) == -1 && errno == EBADF);
  duplicate = dup(fd);
  CHECK(duplicate >= 0 && fcntl(duplicate, F_GETFD) == 0);
  char byte;
  CHECK(read(duplicate, &byte, 1) == 1 && byte == 'a');
  CHECK(read(fd, &byte, 1) == 1 && byte == 'b');
  CHECK(fcntl(duplicate, F_SETFL, O_APPEND) == 0);
  CHECK((fcntl(fd, F_GETFL) & O_APPEND) != 0);
  CHECK(fcntl(fd, F_GETFD) == FD_CLOEXEC);
  CHECK(ioctl(duplicate, FIOCLEX) == 0);
  CHECK(fcntl(duplicate, F_GETFD) == FD_CLOEXEC);
  CHECK(ioctl(duplicate, FIONCLEX) == 0);
  CHECK(fcntl(duplicate, F_GETFD) == 0 && fcntl(fd, F_GETFD) == FD_CLOEXEC);
  CHECK(dup3(fd, duplicate, O_CLOEXEC) == duplicate);
  CHECK(fcntl(duplicate, F_GETFD) == FD_CLOEXEC);
  errno = 0;
  CHECK(dup3(-1, duplicate, 0) == -1 && errno == EBADF);
  CHECK(fcntl(duplicate, F_GETFD) == FD_CLOEXEC);
  CHECK(lseek(duplicate, 0, SEEK_CUR) == 2);
  errno = 0;
  CHECK(dup3(fd, -1, 0) == -1 && errno == EBADF);
  errno = 0;
  CHECK(dup3(fd, fd, 0) == -1 && errno == EINVAL);
  CHECK(dup2(fd, duplicate) == duplicate && fcntl(duplicate, F_GETFD) == 0);
  CHECK(close(duplicate) == 0);
  duplicate = fcntl(fd, F_DUPFD_CLOEXEC, 64);
  CHECK(duplicate == 64 && fcntl(duplicate, F_GETFD) == FD_CLOEXEC);
  CHECK(close(duplicate) == 0);
  duplicate = fcntl(fd, F_DUPFD, 64);
  CHECK(duplicate == 64 && fcntl(duplicate, F_GETFD) == 0);
  CHECK(close(duplicate) == 0);
  duplicate = open("/dev/null", O_RDONLY | O_CLOEXEC);
  CHECK(duplicate >= 0 && fcntl(duplicate, F_GETFD) == FD_CLOEXEC);
  CHECK(close(duplicate) == 0);
  CHECK(pipe2(pipes, O_CLOEXEC) == 0);
  CHECK(fcntl(pipes[0], F_GETFD) == FD_CLOEXEC);
  CHECK(fcntl(pipes[1], F_GETFD) == FD_CLOEXEC);
  CHECK(close(pipes[0]) == 0 && close(pipes[1]) == 0);

  int saved_stdin = fcntl(0, F_DUPFD_CLOEXEC, 64);
  CHECK(saved_stdin == 64);
  CHECK(close(0) == 0);
  CHECK(open("/dev/null", O_RDONLY) == 0 && fcntl(0, F_GETFD) == 0);
  CHECK(close(0) == 0);
  CHECK(dup(fd) == 0 && fcntl(0, F_GETFD) == 0);
  CHECK(close(0) == 0);
  CHECK(pipe(pipes) == 0 && pipes[0] == 0);
  CHECK(fcntl(pipes[0], F_GETFD) == 0 && fcntl(pipes[1], F_GETFD) == 0);
  CHECK(close(pipes[0]) == 0 && close(pipes[1]) == 0);
  CHECK(dup2(saved_stdin, 0) == 0);
  CHECK(close(saved_stdin) == 0 && close(fd) == 0);
}

#ifdef __EMSCRIPTEN__
static void completed(int pid) {
  CHECK(pid > 0);
  int status;
  CHECK(waitpid(pid, &status, 0) == pid);
  CHECK(WIFEXITED(status) && WEXITSTATUS(status) == 0);
}

static void inheritance(const char *path, uint32_t policy, unsigned mask,
                        const dolly_process_fd_mapping *mappings, uint32_t count) {
  char expected[16];
  snprintf(expected, sizeof(expected), "%u", mask);
  char *arguments[] = {(char *)path, "inherit", expected, NULL};
  completed(dolly_spawn_mapped(path, 3, arguments, NULL, NULL,
                               policy, mappings, count, 10000));
}

static int child(int argc, char **argv) {
  if (strcmp(argv[1], "nonblocking") == 0) {
    CHECK((fcntl(20, F_GETFL) & O_NONBLOCK) != 0);
    char byte;
    CHECK(read(20, &byte, 1) == -1 && errno == EAGAIN);
    CHECK(fcntl(20, F_SETFL, 0) == 0);
    return 0;
  }
  if (strcmp(argv[1], "inherit") == 0) {
    CHECK(argc == 3);
    unsigned expected = (unsigned)strtoul(argv[2], NULL, 10);
    const int descriptors[] = {0, 1, 2, 20, 21};
    for (unsigned index = 0; index < 5; ++index) {
      errno = 0;
      int flags = fcntl(descriptors[index], F_GETFD);
      CHECK(expected & (1u << index) ? flags == 0 : flags == -1 && errno == EBADF);
    }
    return 0;
  }
  CHECK(strcmp(argv[1], "swap") == 0);
  char byte;
  CHECK(read(20, &byte, 1) == 1 && byte == 'B');
  CHECK(read(21, &byte, 1) == 1 && byte == 'A');
  CHECK(fcntl(20, F_GETFD) == 0 && fcntl(21, F_GETFD) == 0);
  CHECK(fcntl(22, F_GETFD) == 0);
  CHECK(fcntl(20, F_SETFD, FD_CLOEXEC) == 0);
  errno = 0;
  CHECK(fcntl(0, F_GETFD) == -1 && errno == EBADF);
  CHECK(write(22, "!", 1) == 1);
  return 0;
}

static void rejected_packets(const char *path, int writer) {
  const size_t path_size = strlen(path);
  const char arguments[] = "inherit\0" "0";
  dolly_process_spawn_request header = {
    .flags = DOLLY_PROCESS_SPAWN_INHERIT_ENVIRONMENT, .argument_count = 3,
    .mapping_count = 2, .path_size = path_size,
    .argument_bytes = path_size + 1 + sizeof(arguments), .deadline_nanoseconds = UINT64_MAX,
  };
  const size_t size = sizeof(header) + path_size + header.argument_bytes + 2 * sizeof(dolly_process_fd_mapping);
  unsigned char *packet = malloc(size);
  CHECK(packet != NULL);
  memcpy(packet + sizeof(header), path, path_size);
  memcpy(packet + sizeof(header) + path_size, path, path_size + 1);
  memcpy(packet + sizeof(header) + 2 * path_size + 1, arguments, sizeof(arguments));
  for (int variant = -1; variant < 6; ++variant) {
    dolly_process_spawn_request request = header;
    dolly_process_fd_mapping mappings[] = {{(uint32_t)writer, 22}, {20, 23}};
    if (variant == 1) request.descriptor_inheritance = UINT32_MAX;
    if (variant == 2) request.reserved = 1;
    if (variant == 3) request.mapping_count = 257;
    if (variant == 4) mappings[1].target_descriptor = 256;
    if (variant == 5) mappings[1].target_descriptor = 22;
    memcpy(packet, &request, sizeof(request));
    memcpy(packet + size - sizeof(mappings), mappings, sizeof(mappings));
    dolly_process_spawn_response response;
    int64_t result = dolly_process_call(DOLLY_PROCESS_SPAWN, packet,
        size - (variant == 0), &response, sizeof(response));
    if (variant == -1) {
      CHECK(result == (int64_t)sizeof(response));
      completed(response.pid);
    } else CHECK(result == (variant == 4 ? -EBADF : -EINVAL));
    CHECK(fcntl(writer, F_GETFD) == FD_CLOEXEC);
    CHECK(fcntl(20, F_GETFD) == FD_CLOEXEC && fcntl(21, F_GETFD) == 0);
    CHECK(lseek(20, 0, SEEK_CUR) == 0 && lseek(21, 0, SEEK_CUR) == 0);
  }
  free(packet);
}

static void spawning(const char *path) {
  int shared_pipe[2];
  CHECK(pipe2(shared_pipe, O_NONBLOCK | O_CLOEXEC) == 0);
  char *pipe_arguments[] = {(char *)path, "nonblocking", NULL};
  const dolly_process_fd_mapping pipe_mapping = {(uint32_t)shared_pipe[0], 20};
  completed(dolly_spawn_mapped(path, 2, pipe_arguments, NULL, NULL,
      DOLLY_PROCESS_INHERIT_FDS_STDIO, &pipe_mapping, 1, 10000));
  CHECK((fcntl(shared_pipe[0], F_GETFL) & O_NONBLOCK) == 0);
  CHECK((fcntl(shared_pipe[1], F_GETFL) & O_NONBLOCK) != 0);
  CHECK(close(shared_pipe[0]) == 0 && close(shared_pipe[1]) == 0);
  int first = scratch("A"), second = scratch("B"), output[2];
  CHECK(dup2(first, 20) == 20 && dup2(second, 21) == 21);
  CHECK(close(first) == 0 && close(second) == 0);
  CHECK(fcntl(20, F_SETFD, FD_CLOEXEC) == 0);
  CHECK(fcntl(0, F_SETFD, FD_CLOEXEC) == 0);
  inheritance(path, DOLLY_PROCESS_INHERIT_FDS_NONE, 0, NULL, 0);
  inheritance(path, DOLLY_PROCESS_INHERIT_FDS_STDIO, 6, NULL, 0);
  inheritance(path, DOLLY_PROCESS_INHERIT_FDS_ALL, 22, NULL, 0);
  dolly_process_fd_mapping stdin_mapping = {0, 0};
  inheritance(path, DOLLY_PROCESS_INHERIT_FDS_STDIO, 7, &stdin_mapping, 1);
  CHECK(fcntl(0, F_GETFD) == FD_CLOEXEC);
  CHECK(fcntl(0, F_SETFD, 0) == 0);
  CHECK(pipe2(output, O_CLOEXEC) == 0);
  rejected_packets(path, output[1]);
  char *arguments[] = {(char *)path, "swap", NULL};
  dolly_process_fd_mapping invalid[] = {{(uint32_t)output[1], 22}, {255, 23}};
  for (int attempt = 0; attempt < 40; ++attempt)
    CHECK(dolly_spawn_mapped(path, 2, arguments, NULL, NULL,
                            DOLLY_PROCESS_INHERIT_FDS_NONE, invalid, 2, 10000) == -EBADF);
  dolly_process_fd_mapping duplicate[] = {{20, 22}, {21, 22}};
  CHECK(dolly_spawn_mapped(path, 2, arguments, NULL, NULL,
                          DOLLY_PROCESS_INHERIT_FDS_NONE, duplicate, 2, 10000) == -EINVAL);
  dolly_process_fd_mapping mappings[] = {{20, 21}, {21, 20}, {(uint32_t)output[1], 22}};
  for (int attempt = 0; attempt < 40; ++attempt)
    CHECK(dolly_spawn_mapped("/no-such-descriptor-fixture", 2, arguments, NULL, NULL,
                            DOLLY_PROCESS_INHERIT_FDS_ALL, mappings, 3, 10000) == -ENOENT);
  int pid = dolly_spawn_mapped(path, 2, arguments, NULL, NULL,
                              DOLLY_PROCESS_INHERIT_FDS_NONE, mappings, 3, 10000);
  CHECK(close(output[1]) == 0);
  completed(pid);
  CHECK(fcntl(20, F_GETFD) == FD_CLOEXEC && fcntl(21, F_GETFD) == 0);
  CHECK(lseek(20, 0, SEEK_CUR) == 1 && lseek(21, 0, SEEK_CUR) == 1);
  struct pollfd ready = {output[0], POLLIN, 0};
  CHECK(poll(&ready, 1, 1000) == 1);
  char byte;
  CHECK(read(output[0], &byte, 1) == 1 && byte == '!');
  CHECK(poll(&ready, 1, 1000) == 1);
  CHECK(read(output[0], &byte, 1) == 0);
  CHECK(close(output[0]) == 0 && close(20) == 0 && close(21) == 0);
}
#endif

int main(int argc, char **argv) {
#ifdef __EMSCRIPTEN__
  if (argc > 1) return child(argc, argv);
#else
  (void)argc;
  (void)argv;
#endif
  descriptor_flags();
  nonblocking_pipes();
  vectored_io();
  record_locks();
#ifdef __EMSCRIPTEN__
  spawning(argv[0]);
#endif
  puts("PROCESS-DESCRIPTORS-OK");
  return 0;
}
