#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <poll.h>
#include <signal.h>
#include <spawn.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <sys/wait.h>
#include <unistd.h>
#include <dolly/process.h>
#include <dolly/sockets.h>

#define CHECK(condition) do { if (!(condition)) { \
  fprintf(stderr, "SOCKETS FAIL line %d: %s (errno %d)\n", __LINE__, #condition, errno); \
  exit(1); \
} } while (0)

extern char **environ;
static char *self;

/* Starts this program in `mode` with `descriptor` as its descriptor 3. */
static pid_t spawn_with(int descriptor, char *mode) {
  posix_spawn_file_actions_t actions;
  char *arguments[] = {self, mode, NULL};
  pid_t child;
  CHECK(posix_spawn_file_actions_init(&actions) == 0);
  CHECK(posix_spawn_file_actions_adddup2(&actions, descriptor, 3) == 0);
  CHECK(posix_spawn(&child, self, &actions, NULL, arguments, environ) == 0);
  posix_spawn_file_actions_destroy(&actions);
  return child;
}

static struct sockaddr_un address_of(const char *path) {
  struct sockaddr_un address = {.sun_family = AF_UNIX};
  strncpy(address.sun_path, path, sizeof(address.sun_path) - 1);
  return address;
}

static int local_socket(int flags) {
  const int descriptor = socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC | flags, 0);
  CHECK(descriptor >= 0);
  return descriptor;
}

/* The child of `pair`: returns what it reads until end of file. */
static int echo(void) {
  struct stat status;
  char bytes[8192];
  ssize_t count;
  if (fstat(3, &status) != 0 || !S_ISSOCK(status.st_mode)) return 3;
  while ((count = read(3, bytes, sizeof(bytes))) > 0) {
    if (write(3, bytes, (size_t)count) != count) return 4;
  }
  return count == 0 ? 0 : 5;
}

static int waker;
static void wake(int number) {
  (void)number;
  if (send(waker, "X", 1, MSG_DONTWAIT) != 1) abort();
}

/* As signal-hook, Tokio and asyncio do: a handler wakes its loop through a
 * nonblocking pair, having asked with an empty send whether it is a socket. */
static void signal_wake(void) {
  int ends[2], enabled = 1;
  char byte;
  CHECK(socketpair(AF_UNIX, SOCK_STREAM, 0, ends) == 0);
  CHECK(ioctl(ends[0], FIONBIO, &enabled) == 0 && ioctl(ends[1], FIONBIO, &enabled) == 0);
  CHECK(send(ends[1], "", 0, MSG_DONTWAIT) == 0);
  waker = ends[1];
  CHECK(signal(SIGWINCH, wake) != SIG_ERR && raise(SIGWINCH) == 0);
  struct pollfd woken = {ends[0], POLLIN, 0};
  CHECK(poll(&woken, 1, 1000) == 1 && recv(ends[0], &byte, 1, 0) == 1 && byte == 'X');
  CHECK(recv(ends[0], &byte, 1, 0) == -1 && errno == EAGAIN);
  CHECK(close(ends[0]) == 0 && close(ends[1]) == 0);
}

/* sendmsg and recvmsg gather and scatter when they carry no control data;
 * a duplicate is the same socket. */
static void vectors(void) {
  int ends[2], error = -1;
  socklen_t size = sizeof(error);
  char first[3], second[1];
  struct iovec parts[2] = {{"ab", 2}, {"cd", 2}}, into[2] = {{first, 3}, {second, 1}};
  const struct msghdr gathered = {.msg_iov = parts, .msg_iovlen = 2};
  struct msghdr scattered = {.msg_iov = into, .msg_iovlen = 2};
  CHECK(socketpair(AF_UNIX, SOCK_STREAM, 0, ends) == 0);
  const int duplicate = dup(ends[1]);
  CHECK(duplicate >= 0 && close(ends[1]) == 0);
  CHECK(sendmsg(duplicate, &gathered, 0) == 4);
  CHECK(recvmsg(ends[0], &scattered, 0) == 4 && memcmp(first, "abc", 3) == 0 && second[0] == 'd');
  CHECK(getsockopt(ends[0], SOL_SOCKET, SO_ERROR, &error, &size) == 0 && error == 0);
  CHECK(close(duplicate) == 0 && recv(ends[0], first, 1, 0) == 0 && close(ends[0]) == 0);
}

/* A pair, one end inherited through spawn: 300 KiB each way through the
 * kernel's 64 KiB buffers, so both sides wait and are woken. */
static void pair(void) {
  enum { TOTAL = 300 * 1024 };
  int ends[2], pipes[2], type = 0;
  socklen_t size = sizeof(type);
  struct stat status;
  char byte;
  CHECK(socketpair(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC | SOCK_NONBLOCK, 0, ends) == 0);
  CHECK(fstat(ends[0], &status) == 0 && S_ISSOCK(status.st_mode));
  CHECK(fcntl(ends[0], F_GETFD) == FD_CLOEXEC);
  CHECK((fcntl(ends[0], F_GETFL) & (O_ACCMODE | O_NONBLOCK)) == (O_RDWR | O_NONBLOCK));
  CHECK(read(ends[0], &byte, 1) == -1 && errno == EAGAIN);
  CHECK(fcntl(ends[1], F_SETFL, 0) == 0);
  CHECK(recv(ends[1], &byte, 1, MSG_DONTWAIT) == -1 && errno == EAGAIN);
  CHECK(lseek(ends[0], 0, SEEK_CUR) == -1 && errno == ESPIPE);
  CHECK(getsockopt(ends[0], SOL_SOCKET, SO_TYPE, &type, &size) == 0 && type == SOCK_STREAM);
  CHECK(pipe(pipes) == 0);
  CHECK(send(pipes[1], "x", 1, 0) == -1 && errno == ENOTSOCK);
  CHECK(shutdown(pipes[0], SHUT_RD) == -1 && errno == ENOTSOCK);
  CHECK(send(99, "x", 1, 0) == -1 && errno == EBADF);
  signal_wake();
  vectors();

  const pid_t child = spawn_with(ends[1], "echo");
  CHECK(close(ends[1]) == 0);
  unsigned char *sent = malloc(TOTAL), *received = malloc(TOTAL);
  CHECK(sent != NULL && received != NULL);
  for (size_t index = 0; index < TOTAL; ++index) sent[index] = (unsigned char)(index * 31 + index / 251);
  size_t out = 0, in = 0;
  while (in < TOTAL) {
    struct pollfd ready = {ends[0], (short)(POLLIN | (out < TOTAL ? POLLOUT : 0)), 0};
    CHECK(poll(&ready, 1, 20000) == 1);
    if (ready.revents & POLLOUT) {
      const ssize_t count = send(ends[0], sent + out, TOTAL - out, 0);
      CHECK(count > 0);
      out += (size_t)count;
      if (out == TOTAL) CHECK(shutdown(ends[0], SHUT_WR) == 0);
    }
    if (ready.revents & POLLIN) {
      const ssize_t count = recv(ends[0], received + in, TOTAL - in, 0);
      CHECK(count > 0);
      in += (size_t)count;
    }
  }
  CHECK(out == TOTAL && memcmp(sent, received, TOTAL) == 0);
  /* The child read end of file after the shutdown and exited: so do we. */
  int ended;
  CHECK(fcntl(ends[0], F_SETFL, 0) == 0 && read(ends[0], &byte, 1) == 0);
  CHECK(waitpid(child, &ended, 0) == child && WIFEXITED(ended) && WEXITSTATUS(ended) == 0);
  puts("SOCKETS-PAIR-OK");
}

/* What the module does not have fails by name. */
static void refuse(void) {
  int ends[2];
  CHECK(socket(AF_INET, SOCK_STREAM, 0) == -1 && errno == EAFNOSUPPORT);
  CHECK(socket(AF_INET6, SOCK_STREAM, 0) == -1 && errno == EAFNOSUPPORT);
  CHECK(socket(AF_INET, SOCK_DGRAM, 0) == -1 && errno == EAFNOSUPPORT);
  CHECK(socketpair(AF_INET, SOCK_STREAM, 0, ends) == -1 && errno == EAFNOSUPPORT);
  CHECK(socket(AF_UNIX, SOCK_DGRAM, 0) == -1 && errno == EPROTOTYPE);
  CHECK(socket(AF_UNIX, SOCK_SEQPACKET, 0) == -1 && errno == EPROTOTYPE);
  CHECK(socket(AF_UNIX, SOCK_STREAM, 1) == -1 && errno == EPROTONOSUPPORT);
  const int local = local_socket(0);
  const struct sockaddr_in remote = {.sin_family = AF_INET};
  CHECK(connect(local, (const struct sockaddr *)&remote, sizeof(remote)) == -1 && errno == EAFNOSUPPORT);
  CHECK(bind(local, (const struct sockaddr *)&remote, sizeof(remote)) == -1 && errno == EAFNOSUPPORT);
  struct sockaddr_un abstract = {.sun_family = AF_UNIX};
  memcpy(abstract.sun_path, "\0name", 5);
  CHECK(bind(local, (const struct sockaddr *)&abstract,
             offsetof(struct sockaddr_un, sun_path) + 5) == -1 && errno == ENOENT);
  CHECK(listen(local, 1) == -1 && errno == EDESTADDRREQ);
  CHECK(setsockopt(local, SOL_SOCKET, SO_KEEPALIVE, &local, sizeof(local)) == -1 && errno == ENOPROTOOPT);
  CHECK(send(local, "x", 1, 0) == -1 && errno == ENOTCONN);
  /* A descriptor does not travel. */
  CHECK(socketpair(AF_UNIX, SOCK_STREAM, 0, ends) == 0);
  union { struct cmsghdr header; char bytes[CMSG_SPACE(sizeof(int))]; } control = {0};
  control.header.cmsg_level = SOL_SOCKET;
  control.header.cmsg_type = SCM_RIGHTS;
  control.header.cmsg_len = CMSG_LEN(sizeof(int));
  memcpy(CMSG_DATA(&control.header), &local, sizeof(int));
  struct iovec bytes = {"x", 1};
  const struct msghdr message = {.msg_iov = &bytes, .msg_iovlen = 1,
      .msg_control = control.bytes, .msg_controllen = sizeof(control.bytes)};
  CHECK(sendmsg(ends[0], &message, 0) == -1 && errno == ENOTSUP);
  /* The raw operations check their packets. */
  const dolly_socket_request unknown_flag = {0, 4}, on_file = {0, 0};
  dolly_socket_descriptors created;
  CHECK(dolly_process_call(DOLLY_SOCKET_CREATE, &unknown_flag, sizeof(unknown_flag),
                           &created, sizeof(created)) == -EINVAL);
  CHECK(dolly_process_call(DOLLY_SOCKET_PAIR, &on_file, 4, &created, sizeof(created)) == -EINVAL);
  CHECK(dolly_process_call(DOLLY_SOCKET_SHUTDOWN, &on_file, sizeof(on_file), NULL, 0) == -ENOTSOCK);
  puts("SOCKETS-REFUSED-OK");
}

/* A peer that ends, by exit or by force, is end of file and EPIPE. */
static void peer(void) {
  int ends[2], ended;
  char byte;
  CHECK(socketpair(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0, ends) == 0);
  pid_t child = spawn_with(ends[1], "linger");
  CHECK(close(ends[1]) == 0);
  struct pollfd hung = {ends[0], POLLIN, 0};
  CHECK(poll(&hung, 1, 20000) == 1 && hung.revents == (POLLIN | POLLHUP));
  CHECK(read(ends[0], &byte, 1) == 0);
  CHECK(send(ends[0], "x", 1, MSG_NOSIGNAL) == -1 && errno == EPIPE);
  CHECK(waitpid(child, &ended, 0) == child && WIFEXITED(ended));

  CHECK(socketpair(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0, ends) == 0);
  child = spawn_with(ends[1], "spin");
  CHECK(close(ends[1]) == 0);
  CHECK(read(ends[0], &byte, 1) == 1 && byte == 's');
  CHECK(kill(child, SIGKILL) == 0);
  CHECK(read(ends[0], &byte, 1) == 0);
  CHECK(signal(SIGPIPE, SIG_IGN) != SIG_ERR);
  CHECK(write(ends[0], "x", 1) == -1 && errno == EPIPE);
  CHECK(waitpid(child, &ended, 0) == child && WIFSIGNALED(ended) && WTERMSIG(ended) == SIGKILL);
  puts("SOCKETS-PEER-OK");
}

/* A server that knows only the path. Its listener's last descriptor closes
 * at exit, and the path stays for `stale`. */
static void server(const char *path) {
  const struct sockaddr_un address = address_of(path);
  struct sockaddr_un name;
  socklen_t length = sizeof(name);
  struct stat status;
  char bytes[32];
  const int listener = local_socket(0), second = local_socket(0);
  CHECK(bind(listener, (const struct sockaddr *)&address, sizeof(address)) == 0);
  CHECK(stat(path, &status) == 0 && S_ISSOCK(status.st_mode));
  CHECK(bind(second, (const struct sockaddr *)&address, sizeof(address)) == -1 && errno == EADDRINUSE);
  CHECK(listen(listener, 4) == 0);
  struct pollfd pending = {listener, POLLIN, 0};
  CHECK(poll(&pending, 1, 20000) == 1 && pending.revents == POLLIN);
  const int connection = accept4(listener, (struct sockaddr *)&name, &length, SOCK_CLOEXEC);
  CHECK(connection >= 0 && name.sun_family == AF_UNIX && length == sizeof(name.sun_family));
  length = sizeof(name);
  CHECK(getsockname(connection, (struct sockaddr *)&name, &length) == 0 && strcmp(name.sun_path, path) == 0);
  CHECK(read(connection, bytes, sizeof(bytes)) == 6 && memcmp(bytes, "client", 6) == 0);
  CHECK(write(connection, "server", 6) == 6);
  CHECK(read(connection, bytes, sizeof(bytes)) == 0);
  puts("SOCKETS-SERVER-OK");
}

/* The server may not be listening yet: nothing but the path tells. */
static void client(const char *path) {
  const struct sockaddr_un address = address_of(path);
  struct sockaddr_un name;
  socklen_t length = sizeof(name);
  char bytes[32];
  const int connection = local_socket(0);
  int connected = -1;
  for (int attempt = 0; attempt < 500 && connected != 0; ++attempt) {
    connected = connect(connection, (const struct sockaddr *)&address, sizeof(address));
    if (connected != 0) {
      CHECK(errno == ENOENT || errno == ECONNREFUSED);
      usleep(10000);
    }
  }
  CHECK(connected == 0);
  CHECK(connect(connection, (const struct sockaddr *)&address, sizeof(address)) == -1 && errno == EISCONN);
  CHECK(getpeername(connection, (struct sockaddr *)&name, &length) == 0 && strcmp(name.sun_path, path) == 0);
  CHECK(write(connection, "client", 6) == 6);
  CHECK(read(connection, bytes, sizeof(bytes)) == 6 && memcmp(bytes, "server", 6) == 0);
  puts("SOCKETS-CLIENT-OK");
}

/* The path of a listener that is gone: still a socket file, refused, taken
 * until it is unlinked. */
static void stale(const char *path) {
  const struct sockaddr_un address = address_of(path);
  struct stat status;
  const int connection = local_socket(0), listener = local_socket(0);
  CHECK(lstat(path, &status) == 0 && S_ISSOCK(status.st_mode) && status.st_size == 0);
  CHECK(connect(connection, (const struct sockaddr *)&address, sizeof(address)) == -1 && errno == ECONNREFUSED);
  CHECK(bind(listener, (const struct sockaddr *)&address, sizeof(address)) == -1 && errno == EADDRINUSE);
  CHECK(unlink(path) == 0);
  CHECK(connect(connection, (const struct sockaddr *)&address, sizeof(address)) == -1 && errno == ENOENT);
  CHECK(bind(listener, (const struct sockaddr *)&address, sizeof(address)) == 0);
  /* Bound but not listening, and a file that is no socket, refuse alike. */
  CHECK(connect(connection, (const struct sockaddr *)&address, sizeof(address)) == -1 && errno == ECONNREFUSED);
  CHECK(connect(connection, (const struct sockaddr *)&(struct sockaddr_un){AF_UNIX, "/etc/dolly/Dollyfile"},
                sizeof(address)) == -1 && errno == ECONNREFUSED);
  /* A renamed path is still the listener's; an unlinked one is nobody's. */
  char moved[sizeof(address.sun_path)];
  snprintf(moved, sizeof(moved), "%s.moved", path);
  const struct sockaddr_un renamed = address_of(moved);
  CHECK(listen(listener, 1) == 0 && rename(path, moved) == 0);
  CHECK(connect(connection, (const struct sockaddr *)&renamed, sizeof(renamed)) == 0);
  CHECK(unlink(moved) == 0);
  const int late = local_socket(0);
  CHECK(connect(late, (const struct sockaddr *)&renamed, sizeof(renamed)) == -1 && errno == ENOENT);
  puts("SOCKETS-STALE-OK");
}

/* One listener's backlog, and what poll reports of each state. */
static void backlog(const char *path) {
  const struct sockaddr_un address = address_of(path);
  const int listener = local_socket(0), first = local_socket(SOCK_NONBLOCK), second = local_socket(SOCK_NONBLOCK);
  struct pollfd state = {first, POLLIN | POLLOUT, 0};
  CHECK(poll(&state, 1, 0) == 1 && state.revents == (POLLOUT | POLLHUP));
  CHECK(bind(listener, (const struct sockaddr *)&address, sizeof(address)) == 0 && listen(listener, 1) == 0);
  state.fd = listener;
  CHECK(poll(&state, 1, 0) == 0);
  CHECK(connect(first, (const struct sockaddr *)&address, sizeof(address)) == 0);
  CHECK(connect(second, (const struct sockaddr *)&address, sizeof(address)) == -1 && errno == EAGAIN);
  CHECK(poll(&state, 1, 0) == 1 && state.revents == POLLIN);
  const int accepted = accept(listener, NULL, NULL);
  CHECK(accepted >= 0 && poll(&state, 1, 0) == 0);
  CHECK(connect(second, (const struct sockaddr *)&address, sizeof(address)) == 0);
  state.fd = first;
  CHECK(poll(&state, 1, 0) == 1 && state.revents == POLLOUT);
  CHECK(write(accepted, "x", 1) == 1);
  CHECK(poll(&state, 1, 0) == 1 && state.revents == (POLLIN | POLLOUT));
  /* Hung up: a read or a write would not wait, so both are reported. */
  CHECK(close(accepted) == 0);
  CHECK(poll(&state, 1, 0) == 1 && state.revents == (POLLIN | POLLOUT | POLLHUP));
  /* A connection nobody accepted ends with its listener. */
  state.fd = second;
  CHECK(poll(&state, 1, 0) == 1 && state.revents == POLLOUT);
  CHECK(close(listener) == 0);
  CHECK(poll(&state, 1, 0) == 1 && state.revents == (POLLIN | POLLOUT | POLLHUP));
  CHECK(unlink(path) == 0);
  puts("SOCKETS-BACKLOG-OK");
}

/* The kernel holds 128 sockets: one process can take them all, and however
 * it ends, the next run finds 64 pairs again. */
static void quota(const char *ending) {
  int ends[2], pairs = 0;
  while (socketpair(AF_UNIX, SOCK_STREAM, 0, ends) == 0) ++pairs;
  CHECK(errno == ENFILE && pairs == 64);
  CHECK(socket(AF_UNIX, SOCK_STREAM, 0) == -1 && errno == ENFILE);
  puts("SOCKETS-QUOTA-OK");
  fflush(stdout);
  if (strcmp(ending, "abort") == 0) abort();
  if (strcmp(ending, "spin") == 0) for (;;) {}
}

int main(int argc, char **argv) {
  self = argv[0];
  const char *mode = argc > 1 ? argv[1] : "", *argument = argc > 2 ? argv[2] : "";
  if (strcmp(mode, "echo") == 0) return echo();
  if (strcmp(mode, "linger") == 0) return usleep(200000);
  if (strcmp(mode, "spin") == 0) {
    if (write(3, "s", 1) != 1) return 6;
    for (;;) {}
  }
  /* Linked without -ldolly-sockets, the calls are libc's refusals. */
  if (strcmp(mode, "unlinked") == 0) {
    int ends[2];
    return socketpair(AF_UNIX, SOCK_STREAM, 0, ends) == -1 && errno == ENOSYS &&
        socket(AF_INET, SOCK_STREAM, 0) == -1 && errno == ENOSYS ? 0 : 9;
  }
  if (strcmp(mode, "pair") == 0) pair();
  else if (strcmp(mode, "refuse") == 0) refuse();
  else if (strcmp(mode, "peer") == 0) peer();
  else if (strcmp(mode, "sigpipe") == 0) {
    int ends[2];
    CHECK(socketpair(AF_UNIX, SOCK_STREAM, 0, ends) == 0 && close(ends[1]) == 0);
    return write(ends[0], "x", 1) == -1 && errno == EPIPE ? 7 : 8;
  }
  else if (strcmp(mode, "server") == 0) server(argument);
  else if (strcmp(mode, "client") == 0) client(argument);
  else if (strcmp(mode, "stale") == 0) stale(argument);
  else if (strcmp(mode, "backlog") == 0) backlog(argument);
  else if (strcmp(mode, "quota") == 0) quota(argument);
  else return 2;
  return 0;
}
