#define _GNU_SOURCE

/* The libc socket calls over sockets@0: local stream sockets only. A program
 * links this instead of libc's refusals by asking for -ldolly-sockets. */
#include <dolly/host.h>
#include <dolly/process.h>
#include <dolly/sockets.h>
#include <errno.h>
#include <signal.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/un.h>

DOLLY_HOST_REQUIRE(sockets, 0, DOLLY_SOCKETS_ABI_DIGEST);
_Static_assert(sizeof(((struct sockaddr_un *)0)->sun_path) > DOLLY_SOCKET_PATH_MAX, "sun_path");

/* One call: the request header, then `payload`. */
static int64_t socket_call(uint32_t operation, int descriptor, uint32_t argument,
                           const void *payload, size_t payload_size,
                           void *response, size_t response_capacity) {
  if (descriptor < 0) return -EBADF;
  const dolly_socket_request request = {(uint32_t)descriptor, argument};
  if (payload_size == 0) {
    return dolly_process_call(operation, &request, sizeof(request), response, response_capacity);
  }
  unsigned char *packet = malloc(sizeof(request) + payload_size);
  if (packet == NULL) return -ENOMEM;
  memcpy(packet, &request, sizeof(request));
  memcpy(packet + sizeof(request), payload, payload_size);
  const int64_t result = dolly_process_call(operation, packet, sizeof(request) + payload_size,
                                            response, response_capacity);
  free(packet);
  return result;
}

static int status(int64_t result) {
  if (result == 0) return 0;
  errno = result < 0 ? (int)-result : EIO;
  return -1;
}

static uint32_t descriptor_flags(int flags) {
  return (flags & SOCK_CLOEXEC ? DOLLY_SOCKET_CLOEXEC : 0) |
      (flags & SOCK_NONBLOCK ? DOLLY_SOCKET_NONBLOCK : 0);
}

/* No network family, datagram or other protocol exists to ask the kernel for. */
static int create(uint32_t operation, int domain, int type, int protocol, int descriptors[2]) {
  if (domain != AF_UNIX) return status(-EAFNOSUPPORT);
  if ((type & ~(SOCK_NONBLOCK | SOCK_CLOEXEC)) != SOCK_STREAM) return status(-EPROTOTYPE);
  if (protocol != 0) return status(-EPROTONOSUPPORT);
  dolly_socket_descriptors response;
  const int64_t result = socket_call(operation, 0, descriptor_flags(type), NULL, 0,
                                     &response, sizeof(response));
  if (result != sizeof(response)) return status(result < 0 ? result : -EIO);
  descriptors[0] = (int)response.first;
  descriptors[1] = (int)response.second;
  return 0;
}

int socket(int domain, int type, int protocol) {
  int descriptors[2];
  return create(DOLLY_SOCKET_CREATE, domain, type, protocol, descriptors) == 0 ? descriptors[0] : -1;
}

int socketpair(int domain, int type, int protocol, int descriptors[2]) {
  if (descriptors == NULL) return status(-EFAULT);
  return create(DOLLY_SOCKET_PAIR, domain, type, protocol, descriptors);
}

/* BIND or CONNECT with the path of a local address. An abstract name (a
 * leading NUL) is the empty path here, as outside Linux. */
static int address_call(uint32_t operation, int descriptor,
                        const struct sockaddr *address, socklen_t length) {
  const size_t header = offsetof(struct sockaddr_un, sun_path);
  if (address == NULL || length < sizeof(address->sa_family)) return status(-EINVAL);
  if (address->sa_family != AF_UNIX) return status(-EAFNOSUPPORT);
  const char *path = ((const struct sockaddr_un *)address)->sun_path;
  const size_t size = length > header ? strnlen(path, length - header) : 0;
  if (size == 0) return status(-ENOENT);
  if (size > DOLLY_SOCKET_PATH_MAX) return status(-ENAMETOOLONG);
  return status(socket_call(operation, descriptor, 0, path, size, NULL, 0));
}

int bind(int descriptor, const struct sockaddr *address, socklen_t length) {
  return address_call(DOLLY_SOCKET_BIND, descriptor, address, length);
}

int connect(int descriptor, const struct sockaddr *address, socklen_t length) {
  return address_call(DOLLY_SOCKET_CONNECT, descriptor, address, length);
}

/* A negative backlog asks for the most, as on Linux; the kernel bounds it. */
int listen(int descriptor, int backlog) {
  return status(socket_call(DOLLY_SOCKET_LISTEN, descriptor, (uint32_t)backlog, NULL, 0, NULL, 0));
}

/* An unnamed socket's address is its family alone. */
static int name(int descriptor, uint32_t which, struct sockaddr *address, socklen_t *length) {
  struct sockaddr_un local = {.sun_family = AF_UNIX};
  const int64_t size = socket_call(DOLLY_SOCKET_NAME, descriptor, which, NULL, 0,
                                   local.sun_path, DOLLY_SOCKET_PATH_MAX);
  if (size < 0) return status(size);
  if (address == NULL || length == NULL) return status(-EFAULT);
  const socklen_t full = (socklen_t)(offsetof(struct sockaddr_un, sun_path) +
      (size != 0 ? (size_t)size + 1 : 0));
  memcpy(address, &local, *length < full ? *length : full);
  *length = full;
  return 0;
}

int getsockname(int descriptor, struct sockaddr *address, socklen_t *length) {
  return name(descriptor, 0, address, length);
}

int getpeername(int descriptor, struct sockaddr *address, socklen_t *length) {
  return name(descriptor, DOLLY_SOCKET_PEER, address, length);
}

int accept4(int descriptor, struct sockaddr *address, socklen_t *length, int flags) {
  if ((flags & ~(SOCK_NONBLOCK | SOCK_CLOEXEC)) != 0) return status(-EINVAL);
  dolly_socket_descriptors response;
  const int64_t result = socket_call(DOLLY_SOCKET_ACCEPT, descriptor, descriptor_flags(flags),
                                     NULL, 0, &response, sizeof(response));
  if (result != sizeof(response)) return status(result < 0 ? result : -EIO);
  if (address != NULL) getpeername((int)response.first, address, length);
  return (int)response.first;
}

int accept(int descriptor, struct sockaddr *address, socklen_t *length) {
  return accept4(descriptor, address, length, 0);
}

int shutdown(int descriptor, int how) {
  if (how != SHUT_RD && how != SHUT_WR && how != SHUT_RDWR) return status(-EINVAL);
  return status(socket_call(DOLLY_SOCKET_SHUTDOWN, descriptor,
      (how != SHUT_WR ? DOLLY_SOCKET_SHUTDOWN_READ : 0) |
      (how != SHUT_RD ? DOLLY_SOCKET_SHUTDOWN_WRITE : 0), NULL, 0, NULL, 0));
}

/* Each call takes at least a byte or waits, so a blocking socket sends all
 * and a nonblocking one what fits. An error after some bytes returns them. */
ssize_t send(int descriptor, const void *buffer, size_t length, int flags) {
  if ((flags & ~(MSG_DONTWAIT | MSG_NOSIGNAL)) != 0) return status(-ENOTSUP);
  size_t sent = 0;
  do {
    const size_t chunk = length - sent > 65536 ? 65536 : length - sent;
    dolly_process_io_result response;
    const int64_t result = socket_call(DOLLY_SOCKET_SEND, descriptor,
        flags & MSG_DONTWAIT ? DOLLY_SOCKET_DONTWAIT : 0,
        (const unsigned char *)buffer + sent, chunk, &response, sizeof(response));
    if (result != sizeof(response) || response.size > chunk) {
      if (sent != 0) break;
      if (result == -EPIPE && !(flags & MSG_NOSIGNAL)) raise(SIGPIPE);
      return status(result < 0 ? result : -EIO);
    }
    sent += response.size;
  } while (sent < length);
  return (ssize_t)sent;
}

ssize_t recv(int descriptor, void *buffer, size_t length, int flags) {
  if ((flags & ~MSG_DONTWAIT) != 0) return status(-ENOTSUP);
  const int64_t result = socket_call(DOLLY_SOCKET_RECEIVE, descriptor,
      flags & MSG_DONTWAIT ? DOLLY_SOCKET_DONTWAIT : 0, NULL, 0, buffer,
      length > DOLLY_PROCESS_PACKET_LIMIT ? DOLLY_PROCESS_PACKET_LIMIT : length);
  return result < 0 ? status(result) : (ssize_t)result;
}

/* A stream is connected: it takes no destination and reports no source. */
ssize_t sendto(int descriptor, const void *buffer, size_t length, int flags,
               const struct sockaddr *address, socklen_t address_length) {
  (void)address_length;
  return address != NULL ? status(-EISCONN) : send(descriptor, buffer, length, flags);
}

ssize_t recvfrom(int descriptor, void *buffer, size_t length, int flags,
                 struct sockaddr *address, socklen_t *address_length) {
  if (address != NULL && address_length != NULL) *address_length = 0;
  return recv(descriptor, buffer, length, flags);
}

static size_t vector_size(const struct msghdr *message) {
  size_t size = 0;
  for (int index = 0; index < (int)message->msg_iovlen; ++index) size += message->msg_iov[index].iov_len;
  return size;
}

/* Descriptors and credentials do not travel: control data is refused. */
ssize_t sendmsg(int descriptor, const struct msghdr *message, int flags) {
  if (message->msg_controllen != 0) return status(-ENOTSUP);
  if (message->msg_name != NULL) return status(-EISCONN);
  const size_t size = vector_size(message);
  unsigned char *bytes = malloc(size != 0 ? size : 1);
  if (bytes == NULL) return status(-ENOMEM);
  size_t offset = 0;
  for (int index = 0; index < (int)message->msg_iovlen; ++index) {
    memcpy(bytes + offset, message->msg_iov[index].iov_base, message->msg_iov[index].iov_len);
    offset += message->msg_iov[index].iov_len;
  }
  const ssize_t sent = send(descriptor, bytes, size, flags);
  free(bytes);
  return sent;
}

ssize_t recvmsg(int descriptor, struct msghdr *message, int flags) {
  const size_t size = vector_size(message);
  unsigned char *bytes = malloc(size != 0 ? size : 1);
  if (bytes == NULL) return status(-ENOMEM);
  const ssize_t received = recv(descriptor, bytes, size, flags);
  size_t offset = 0;
  for (int index = 0; received > 0 && offset < (size_t)received; ++index) {
    size_t count = message->msg_iov[index].iov_len;
    if (count > (size_t)received - offset) count = (size_t)received - offset;
    memcpy(message->msg_iov[index].iov_base, bytes + offset, count);
    offset += count;
  }
  free(bytes);
  message->msg_namelen = 0;
  message->msg_controllen = 0;
  message->msg_flags = 0;
  return received;
}

/* Fixed answers about a descriptor the kernel confirms is a socket. */
static int64_t socket_probe(int descriptor) {
  char path[DOLLY_SOCKET_PATH_MAX];
  return socket_call(DOLLY_SOCKET_NAME, descriptor, 0, NULL, 0, path, sizeof(path));
}

int getsockopt(int descriptor, int level, int option, void *value, socklen_t *length) {
  const int64_t probed = socket_probe(descriptor);
  if (probed < 0) return status(probed);
  if (level != SOL_SOCKET || (option != SO_TYPE && option != SO_ERROR)) return status(-ENOPROTOOPT);
  const int answer = option == SO_TYPE ? SOCK_STREAM : 0;
  if (value == NULL || length == NULL || *length < sizeof(answer)) return status(-EINVAL);
  memcpy(value, &answer, sizeof(answer));
  *length = sizeof(answer);
  return 0;
}

int setsockopt(int descriptor, int level, int option, const void *value, socklen_t length) {
  (void)level;
  (void)option;
  (void)value;
  (void)length;
  const int64_t probed = socket_probe(descriptor);
  return status(probed < 0 ? probed : -ENOPROTOOPT);
}
