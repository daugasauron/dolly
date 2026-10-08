#include <errno.h>
#include <sys/socket.h>
#include <sys/types.h>

/* What a program gets that does not link -ldolly-sockets: every socket call
 * fails. These are in an object of their own, and that client names exactly
 * the same functions, so a link takes one of the two and never both: the
 * client when its archive comes first, as a library the program asks for
 * does (host/sockets/client.c). */
static int raw_socket_unavailable(void) {
  errno = ENOSYS;
  return -1;
}

int socket(int domain, int type, int protocol) {
  (void)domain;
  (void)type;
  (void)protocol;
  return raw_socket_unavailable();
}

int connect(int descriptor, const struct sockaddr *address,
            socklen_t address_length) {
  (void)descriptor;
  (void)address;
  (void)address_length;
  return raw_socket_unavailable();
}

int bind(int descriptor, const struct sockaddr *address,
         socklen_t address_length) {
  (void)descriptor;
  (void)address;
  (void)address_length;
  return raw_socket_unavailable();
}

int listen(int descriptor, int backlog) {
  (void)descriptor;
  (void)backlog;
  return raw_socket_unavailable();
}

int accept(int descriptor, struct sockaddr *address,
           socklen_t *address_length) {
  (void)descriptor;
  (void)address;
  (void)address_length;
  return raw_socket_unavailable();
}

int accept4(int descriptor, struct sockaddr *address,
            socklen_t *address_length, int flags) {
  (void)flags;
  return accept(descriptor, address, address_length);
}

int getsockname(int descriptor, struct sockaddr *address,
                socklen_t *address_length) {
  (void)descriptor;
  (void)address;
  (void)address_length;
  return raw_socket_unavailable();
}

int getpeername(int descriptor, struct sockaddr *address,
                socklen_t *address_length) {
  return getsockname(descriptor, address, address_length);
}

ssize_t recv(int descriptor, void *buffer, size_t length, int flags) {
  (void)descriptor;
  (void)buffer;
  (void)length;
  (void)flags;
  return (ssize_t)raw_socket_unavailable();
}

ssize_t send(int descriptor, const void *buffer, size_t length, int flags) {
  (void)descriptor;
  (void)buffer;
  (void)length;
  (void)flags;
  return (ssize_t)raw_socket_unavailable();
}

ssize_t sendto(int descriptor, const void *buffer, size_t length, int flags,
               const struct sockaddr *address, socklen_t address_length) {
  (void)address;
  (void)address_length;
  return send(descriptor, buffer, length, flags);
}

ssize_t recvfrom(int descriptor, void *buffer, size_t length, int flags,
                 struct sockaddr *address, socklen_t *address_length) {
  (void)address;
  (void)address_length;
  return recv(descriptor, buffer, length, flags);
}

ssize_t sendmsg(int descriptor, const struct msghdr *message, int flags) {
  (void)descriptor;
  (void)message;
  (void)flags;
  return (ssize_t)raw_socket_unavailable();
}

ssize_t recvmsg(int descriptor, struct msghdr *message, int flags) {
  (void)descriptor;
  (void)message;
  (void)flags;
  return (ssize_t)raw_socket_unavailable();
}

int getsockopt(int descriptor, int level, int option, void *value,
               socklen_t *value_length) {
  (void)descriptor;
  (void)level;
  (void)option;
  (void)value;
  (void)value_length;
  return raw_socket_unavailable();
}

int socketpair(int domain, int type, int protocol, int descriptors[2]) {
  (void)domain;
  (void)type;
  (void)protocol;
  (void)descriptors;
  return raw_socket_unavailable();
}

int setsockopt(int descriptor, int level, int option, const void *value,
               socklen_t value_length) {
  (void)descriptor;
  (void)level;
  (void)option;
  (void)value;
  (void)value_length;
  return raw_socket_unavailable();
}

int shutdown(int descriptor, int how) {
  (void)descriptor;
  (void)how;
  return raw_socket_unavailable();
}

