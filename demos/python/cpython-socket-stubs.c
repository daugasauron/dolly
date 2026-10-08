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

int dolly_py_poll(struct pollfd *descriptors, nfds_t count, int timeout) {
  return poll(descriptors, count, timeout);
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
  return "Dolly resolves no host names";
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
