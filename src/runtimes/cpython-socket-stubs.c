#define _GNU_SOURCE

#include <arpa/inet.h>
#include <errno.h>
#include <net/if.h>
#include <netdb.h>
#include <poll.h>
#include <stddef.h>
#include <stdint.h>
#include <sys/socket.h>
#include <sys/types.h>

static int unavailable(void) {
  errno = ENOSYS;
  return -1;
}

int dolly_py_accept(int descriptor, struct sockaddr *address,
                    socklen_t *address_length) {
  (void)descriptor;
  (void)address;
  (void)address_length;
  return unavailable();
}

int dolly_py_accept4(int descriptor, struct sockaddr *address,
                     socklen_t *address_length, int flags) {
  (void)flags;
  return dolly_py_accept(descriptor, address, address_length);
}

int dolly_py_bind(int descriptor, const struct sockaddr *address,
                  socklen_t address_length) {
  (void)descriptor;
  (void)address;
  (void)address_length;
  return unavailable();
}

int dolly_py_listen(int descriptor, int backlog) {
  (void)descriptor;
  (void)backlog;
  return unavailable();
}

int dolly_py_getpeername(int descriptor, struct sockaddr *address,
                         socklen_t *address_length) {
  (void)descriptor;
  (void)address;
  (void)address_length;
  return unavailable();
}

int dolly_py_getsockname(int descriptor, struct sockaddr *address,
                         socklen_t *address_length) {
  (void)descriptor;
  (void)address;
  (void)address_length;
  return unavailable();
}

int dolly_py_getsockopt(int descriptor, int level, int option,
                        void *value, socklen_t *value_length) {
  (void)descriptor;
  (void)level;
  (void)option;
  (void)value;
  (void)value_length;
  return unavailable();
}

ssize_t dolly_py_recvfrom(int descriptor, void *buffer, size_t length,
                          int flags, struct sockaddr *address,
                          socklen_t *address_length) {
  (void)descriptor;
  (void)buffer;
  (void)length;
  (void)flags;
  (void)address;
  (void)address_length;
  return (ssize_t)unavailable();
}

ssize_t dolly_py_recvmsg(int descriptor, struct msghdr *message, int flags) {
  (void)descriptor;
  (void)message;
  (void)flags;
  return (ssize_t)unavailable();
}

ssize_t dolly_py_send(int descriptor, const void *buffer, size_t length,
                      int flags) {
  (void)descriptor;
  (void)buffer;
  (void)length;
  (void)flags;
  return (ssize_t)unavailable();
}

ssize_t dolly_py_sendmsg(int descriptor, const struct msghdr *message,
                         int flags) {
  (void)descriptor;
  (void)message;
  (void)flags;
  return (ssize_t)unavailable();
}

ssize_t dolly_py_sendto(int descriptor, const void *buffer, size_t length,
                        int flags, const struct sockaddr *address,
                        socklen_t address_length) {
  (void)descriptor;
  (void)buffer;
  (void)length;
  (void)flags;
  (void)address;
  (void)address_length;
  return (ssize_t)unavailable();
}

int dolly_py_poll(struct pollfd *descriptors, nfds_t count, int timeout) {
  (void)descriptors;
  (void)count;
  (void)timeout;
  return unavailable();
}

int dolly_py_getaddrinfo(const char *node, const char *service,
                         const struct addrinfo *hints,
                         struct addrinfo **result) {
  (void)node;
  (void)service;
  (void)hints;
  if (result != NULL) *result = NULL;
  errno = ENOSYS;
  return EAI_SYSTEM;
}

void dolly_py_freeaddrinfo(struct addrinfo *result) { (void)result; }

const char *dolly_py_gai_strerror(int error) {
  (void)error;
  return "Dolly raw sockets are unavailable";
}

struct hostent *dolly_py_gethostbyaddr(const void *address, socklen_t length,
                                       int type) {
  (void)address;
  (void)length;
  (void)type;
  h_errno = HOST_NOT_FOUND;
  return NULL;
}

int dolly_py_gethostname(char *name, size_t length) {
  (void)name;
  (void)length;
  return unavailable();
}

int dolly_py_getnameinfo(const struct sockaddr *address,
                         socklen_t address_length, char *host,
                         socklen_t host_length, char *service,
                         socklen_t service_length, int flags) {
  (void)address;
  (void)address_length;
  (void)host;
  (void)host_length;
  (void)service;
  (void)service_length;
  (void)flags;
  errno = ENOSYS;
  return EAI_SYSTEM;
}

struct protoent *dolly_py_getprotobyname(const char *name) {
  (void)name;
  return NULL;
}

struct servent *dolly_py_getservbyport(int port, const char *protocol) {
  (void)port;
  (void)protocol;
  return NULL;
}

void dolly_py_if_freenameindex(struct if_nameindex *names) { (void)names; }

char *dolly_py_if_indextoname(unsigned index, char *name) {
  (void)index;
  (void)name;
  errno = ENOSYS;
  return NULL;
}

struct if_nameindex *dolly_py_if_nameindex(void) {
  errno = ENOSYS;
  return NULL;
}

unsigned dolly_py_if_nametoindex(const char *name) {
  (void)name;
  errno = ENOSYS;
  return 0;
}

uint32_t dolly_py_htonl(uint32_t value) { return __builtin_bswap32(value); }

uint32_t dolly_py_ntohl(uint32_t value) { return __builtin_bswap32(value); }

int dolly_py_inet_aton(const char *text, struct in_addr *address) {
  (void)text;
  (void)address;
  errno = ENOSYS;
  return 0;
}

const char *dolly_py_inet_ntop(int family, const void *address, char *text,
                               socklen_t length) {
  (void)family;
  (void)address;
  (void)text;
  (void)length;
  errno = ENOSYS;
  return NULL;
}

int dolly_py_inet_pton(int family, const char *text, void *address) {
  (void)family;
  (void)text;
  (void)address;
  errno = ENOSYS;
  return -1;
}
