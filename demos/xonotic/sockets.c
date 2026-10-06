// SPDX-License-Identifier: GPL-2.0-or-later
// Dolly has no sockets. DarkPlaces' lhnet.c calls these for its INET address
// types; each fails with ENOSYS, so the engine reports those ports as
// unavailable and keeps its in-process loopback (LHNETADDRESSTYPE_LOOP).
#include <errno.h>
#include <netdb.h>
#include <sys/socket.h>

static int unsupported(void) {
  errno = ENOSYS;
  return -1;
}

int socket(int domain, int type, int protocol) {
  (void)domain; (void)type; (void)protocol;
  return unsupported();
}

int bind(int fd, const struct sockaddr *address, socklen_t length) {
  (void)fd; (void)address; (void)length;
  return unsupported();
}

int setsockopt(int fd, int level, int name, const void *value, socklen_t length) {
  (void)fd; (void)level; (void)name; (void)value; (void)length;
  return unsupported();
}

int getsockname(int fd, struct sockaddr *address, socklen_t *length) {
  (void)fd; (void)address; (void)length;
  return unsupported();
}

ssize_t recvfrom(int fd, void *buffer, size_t length, int flags, struct sockaddr *address, socklen_t *address_length) {
  (void)fd; (void)buffer; (void)length; (void)flags; (void)address; (void)address_length;
  return unsupported();
}

ssize_t sendto(int fd, const void *buffer, size_t length, int flags, const struct sockaddr *address, socklen_t address_length) {
  (void)fd; (void)buffer; (void)length; (void)flags; (void)address; (void)address_length;
  return unsupported();
}

int getaddrinfo(const char *node, const char *service, const struct addrinfo *hints, struct addrinfo **result) {
  (void)node; (void)service; (void)hints;
  *result = NULL;
  return EAI_FAIL;
}

void freeaddrinfo(struct addrinfo *result) {
  (void)result;
}

struct hostent *gethostbyname(const char *name) {
  (void)name;
  return NULL;
}
