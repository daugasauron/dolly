// sockets@0 kernel side: local stream sockets. A connection is two sockets,
// each holding the bytes the other wrote until they are read. An address is a
// file the bound socket keeps open; connect finds a listener by its inode.
#include "process-kernel.h"

#include <dolly/process.h>
#include <dolly/sockets.h>
#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

enum {
  DOLLY_SOCKET_LIMIT = 128,        /* Sockets in the kernel, in any state. */
  DOLLY_SOCKET_BACKLOG = 16,       /* Connections one listener holds unaccepted. */
  DOLLY_SOCKET_BUFFER = 64 * 1024, /* Unread bytes one connected socket holds. */
  DOLLY_SOCKET_UNCONNECTED = 0,
  DOLLY_SOCKET_LISTENING,
  DOLLY_SOCKET_CONNECTED,
};

typedef struct dolly_socket {
  dolly_kernel_socket shared; /* First: the kernel's descriptor table names it. */
  int state;
  struct dolly_socket *peer; /* The other end; NULL once it closed. */
  unsigned char read_shut, write_shut;
  unsigned char *bytes; /* Received and unread: a ring of DOLLY_SOCKET_BUFFER. */
  size_t offset, size;
  int node; /* The bound file, open so that its inode stays this socket's. */
  ino_t inode;
  char *path; /* The address as bound, or the listener's for an accepted socket. */
  uint32_t backlog, pending_count;
  struct dolly_socket *pending[DOLLY_SOCKET_BACKLOG];
} dolly_socket;

static dolly_socket *sockets[DOLLY_SOCKET_LIMIT];

static int socket_new(dolly_socket **created) {
  for (size_t index = 0; index < DOLLY_SOCKET_LIMIT; ++index) {
    if (sockets[index] != NULL) continue;
    dolly_socket *socket = calloc(1, sizeof(*socket));
    if (socket == NULL) return -ENOMEM;
    socket->node = -1;
    *created = sockets[index] = socket;
    return 0;
  }
  return -ENFILE;
}

/* Connects two unconnected sockets. */
static int socket_join(dolly_socket *left, dolly_socket *right) {
  unsigned char *buffers[2] = {malloc(DOLLY_SOCKET_BUFFER), malloc(DOLLY_SOCKET_BUFFER)};
  if (buffers[0] == NULL || buffers[1] == NULL) {
    free(buffers[0]);
    free(buffers[1]);
    return -ENOMEM;
  }
  left->bytes = buffers[0];
  right->bytes = buffers[1];
  left->peer = right;
  right->peer = left;
  left->state = right->state = DOLLY_SOCKET_CONNECTED;
  return 0;
}

/* The last descriptor went, or the socket never had one. The peer reads what
 * it was sent and then end of file; connections nobody accepted end too. The
 * bound file stays, as a path nobody listens at. */
void dolly_kernel_socket_close(dolly_kernel_socket *closing) {
  dolly_socket *socket = (dolly_socket *)closing;
  if (socket->peer != NULL) socket->peer->peer = NULL;
  for (uint32_t index = 0; index < socket->pending_count; ++index) {
    dolly_kernel_socket_close(&socket->pending[index]->shared);
  }
  for (size_t index = 0; index < DOLLY_SOCKET_LIMIT; ++index) {
    if (sockets[index] == socket) sockets[index] = NULL;
  }
  if (socket->node >= 0) close(socket->node);
  free(socket->path);
  free(socket->bytes);
  free(socket);
}

int64_t dolly_kernel_socket_receive(dolly_kernel_socket *shared, unsigned char *bytes,
                                    size_t size, int wait) {
  dolly_socket *socket = (dolly_socket *)shared;
  if (socket->state != DOLLY_SOCKET_CONNECTED) return -ENOTCONN;
  if (size == 0) return 0;
  if (socket->size == 0) {
    if (socket->read_shut || socket->peer == NULL || socket->peer->write_shut) return 0;
    return wait && !shared->nonblocking ? DOLLY_PROCESS_DISPATCH_DEFERRED : -EAGAIN;
  }
  if (size > socket->size) size = socket->size;
  size_t first = DOLLY_SOCKET_BUFFER - socket->offset;
  if (first > size) first = size;
  memcpy(bytes, socket->bytes + socket->offset, first);
  memcpy(bytes + first, socket->bytes, size - first);
  socket->offset = (socket->offset + size) % DOLLY_SOCKET_BUFFER;
  socket->size -= size;
  dolly_kernel_wake();
  return (int64_t)size;
}

/* A stream has no record boundaries: takes what fits, at least one byte. */
int64_t dolly_kernel_socket_send(dolly_kernel_socket *shared, const unsigned char *bytes,
                                 size_t size, int wait) {
  dolly_socket *socket = (dolly_socket *)shared, *peer = socket->peer;
  if (socket->state != DOLLY_SOCKET_CONNECTED) return -ENOTCONN;
  if (socket->write_shut || peer == NULL || peer->read_shut) return -EPIPE;
  if (size == 0) return 0;
  const size_t room = DOLLY_SOCKET_BUFFER - peer->size;
  if (room == 0) return wait && !shared->nonblocking ? DOLLY_PROCESS_DISPATCH_DEFERRED : -EAGAIN;
  if (size > room) size = room;
  const size_t tail = (peer->offset + peer->size) % DOLLY_SOCKET_BUFFER;
  size_t first = DOLLY_SOCKET_BUFFER - tail;
  if (first > size) first = size;
  memcpy(peer->bytes + tail, bytes, first);
  memcpy(peer->bytes, bytes + first, size - first);
  peer->size += size;
  dolly_kernel_wake();
  return (int64_t)size;
}

/* As Linux reports a stream socket: readable also at end of file, hung up
 * once the peer closed, and an unconnected one writable and hung up. */
uint16_t dolly_kernel_socket_poll(const dolly_kernel_socket *shared, uint16_t requested) {
  const dolly_socket *socket = (const dolly_socket *)shared, *peer = socket->peer;
  if (socket->state == DOLLY_SOCKET_LISTENING) {
    return socket->pending_count != 0 ? requested & DOLLY_PROCESS_POLL_READ : 0;
  }
  if (socket->state == DOLLY_SOCKET_UNCONNECTED) {
    return DOLLY_PROCESS_POLL_HANGUP | (requested & DOLLY_PROCESS_POLL_WRITE);
  }
  uint16_t events = 0;
  if (socket->size != 0 || socket->read_shut || peer == NULL || peer->write_shut) {
    events |= DOLLY_PROCESS_POLL_READ;
  }
  if (peer != NULL && !socket->write_shut && !peer->read_shut &&
      peer->size < DOLLY_SOCKET_BUFFER) events |= DOLLY_PROCESS_POLL_WRITE;
  return (events & requested) | (peer == NULL ? DOLLY_PROCESS_POLL_HANGUP : 0);
}

static int64_t socket_create(int pid, int pair, const dolly_socket_request *request,
                             unsigned char *mailbox, uintptr_t response_capacity) {
  if (request->descriptor != 0 ||
      (request->argument & ~(DOLLY_SOCKET_CLOEXEC | DOLLY_SOCKET_NONBLOCK)) != 0 ||
      response_capacity < sizeof(dolly_socket_descriptors)) return -EINVAL;
  dolly_socket *ends[2] = {NULL, NULL};
  int result = socket_new(&ends[0]);
  if (result == 0 && pair) result = socket_new(&ends[1]);
  if (result == 0 && pair) result = socket_join(ends[0], ends[1]);
  uint32_t descriptors[2] = {0, 0};
  dolly_kernel_socket *const opened[2] = {(dolly_kernel_socket *)ends[0],
                                          (dolly_kernel_socket *)ends[1]};
  if (result == 0) {
    result = dolly_kernel_socket_open(pid, opened, pair ? 2 : 1,
        (request->argument & DOLLY_SOCKET_CLOEXEC) != 0, descriptors);
  }
  for (int end = 0; end < 2 && ends[end] != NULL; ++end) {
    if (result != 0) dolly_kernel_socket_close(opened[end]);
    else opened[end]->nonblocking = (request->argument & DOLLY_SOCKET_NONBLOCK) != 0;
  }
  if (result != 0) return result;
  const dolly_socket_descriptors response = {descriptors[0], descriptors[1]};
  return dolly_kernel_respond(mailbox, &response, sizeof(response));
}

/* A BIND or CONNECT payload as a path and the directory it starts from. */
static int socket_path(int pid, const unsigned char *bytes, size_t size,
                       char path[DOLLY_SOCKET_PATH_MAX + 1], int *directory) {
  if (size == 0 || size > DOLLY_SOCKET_PATH_MAX || memchr(bytes, 0, size) != NULL) return -EINVAL;
  memcpy(path, bytes, size);
  path[size] = 0;
  *directory = path[0] == '/' ? AT_FDCWD : dolly_kernel_process_directory(pid);
  return 0;
}

static int socket_bind(dolly_socket *socket, int directory, const char *path) {
  if (socket->state != DOLLY_SOCKET_UNCONNECTED || socket->node >= 0) return -EINVAL;
  char *address = strdup(path);
  if (address == NULL) return -ENOMEM;
  const int node = openat(directory, path, O_RDONLY | O_CREAT | O_EXCL, 0666);
  struct stat file;
  if (node < 0 || fchmod(node, S_ISVTX | 0666) != 0 || fstat(node, &file) != 0) {
    const int error = errno == EEXIST ? EADDRINUSE : errno;
    if (node >= 0) {
      close(node);
      unlinkat(directory, path, 0);
    }
    free(address);
    return -error;
  }
  socket->node = node;
  socket->inode = file.st_ino;
  socket->path = address;
  return 0;
}

static int socket_connect(dolly_socket *socket, int directory, const char *path) {
  if (socket->state == DOLLY_SOCKET_CONNECTED) return -EISCONN;
  if (socket->state != DOLLY_SOCKET_UNCONNECTED) return -EINVAL;
  struct stat file;
  if (fstatat(directory, path, &file, 0) != 0) return -errno;
  dolly_socket *listener = NULL;
  for (size_t index = 0; index < DOLLY_SOCKET_LIMIT && listener == NULL; ++index) {
    if (sockets[index] != NULL && sockets[index]->state == DOLLY_SOCKET_LISTENING &&
        sockets[index]->inode == file.st_ino) listener = sockets[index];
  }
  if (listener == NULL || !dolly_kernel_socket_node(file.st_mode)) return -ECONNREFUSED;
  if (listener->pending_count >= listener->backlog) return -EAGAIN;
  dolly_socket *accepted = NULL;
  int result = socket_new(&accepted);
  if (result == 0 && (accepted->path = strdup(listener->path)) == NULL) result = -ENOMEM;
  if (result == 0) result = socket_join(socket, accepted);
  if (result != 0) {
    if (accepted != NULL) dolly_kernel_socket_close(&accepted->shared);
    return result;
  }
  listener->pending[listener->pending_count++] = accepted;
  dolly_kernel_wake();
  return 0;
}

static int64_t socket_accept(int pid, dolly_socket *listener, uint32_t flags,
                             unsigned char *mailbox, uintptr_t response_capacity) {
  if ((flags & ~(DOLLY_SOCKET_CLOEXEC | DOLLY_SOCKET_NONBLOCK)) != 0 ||
      response_capacity < sizeof(dolly_socket_descriptors) ||
      listener->state != DOLLY_SOCKET_LISTENING) return -EINVAL;
  if (listener->pending_count == 0) {
    return listener->shared.nonblocking ? -EAGAIN : DOLLY_PROCESS_DISPATCH_DEFERRED;
  }
  dolly_socket *accepted = listener->pending[0];
  dolly_kernel_socket *const opened = &accepted->shared;
  dolly_socket_descriptors response = {0, 0};
  const int result = dolly_kernel_socket_open(pid, &opened, 1,
      (flags & DOLLY_SOCKET_CLOEXEC) != 0, &response.first);
  if (result != 0) return result;
  accepted->shared.nonblocking = (flags & DOLLY_SOCKET_NONBLOCK) != 0;
  --listener->pending_count;
  memmove(listener->pending, listener->pending + 1,
          listener->pending_count * sizeof(*listener->pending));
  dolly_kernel_wake();
  return dolly_kernel_respond(mailbox, &response, sizeof(response));
}

static int64_t sockets_call(int pid, int tid, uint32_t operation, unsigned char *mailbox,
                            uintptr_t request_size, uintptr_t response_capacity) {
  (void)tid;
  dolly_socket_request request;
  if (request_size < sizeof(request)) return -EINVAL;
  memcpy(&request, mailbox, sizeof(request));
  const unsigned char *payload = mailbox + sizeof(request);
  const size_t payload_size = request_size - sizeof(request);
  const int addressed = operation == DOLLY_SOCKET_BIND || operation == DOLLY_SOCKET_CONNECT;
  if (payload_size != 0 && !addressed && operation != DOLLY_SOCKET_SEND) return -EINVAL;
  if (operation == DOLLY_SOCKET_CREATE || operation == DOLLY_SOCKET_PAIR) {
    return socket_create(pid, operation == DOLLY_SOCKET_PAIR, &request, mailbox, response_capacity);
  }
  dolly_kernel_socket *shared;
  const int found = dolly_kernel_socket_descriptor(pid, request.descriptor, &shared);
  if (found != 0) return found;
  dolly_socket *socket = (dolly_socket *)shared;
  if (addressed) {
    char path[DOLLY_SOCKET_PATH_MAX + 1];
    int directory;
    if (request.argument != 0) return -EINVAL;
    const int invalid = socket_path(pid, payload, payload_size, path, &directory);
    if (invalid != 0) return invalid;
    if (operation == DOLLY_SOCKET_BIND) return socket_bind(socket, directory, path);
    const int result = socket_connect(socket, directory, path);
    /* A full backlog makes room when the listener accepts. */
    return result == -EAGAIN && !shared->nonblocking ? DOLLY_PROCESS_DISPATCH_DEFERRED : result;
  }
  switch (operation) {
    case DOLLY_SOCKET_LISTEN:
      if (socket->state == DOLLY_SOCKET_CONNECTED) return -EINVAL;
      if (socket->node < 0) return -EDESTADDRREQ;
      socket->state = DOLLY_SOCKET_LISTENING;
      socket->backlog = request.argument == 0 ? 1
          : request.argument > DOLLY_SOCKET_BACKLOG ? DOLLY_SOCKET_BACKLOG : request.argument;
      return 0;
    case DOLLY_SOCKET_ACCEPT:
      return socket_accept(pid, socket, request.argument, mailbox, response_capacity);
    case DOLLY_SOCKET_SHUTDOWN:
      if (request.argument == 0 || (request.argument &
          ~(DOLLY_SOCKET_SHUTDOWN_READ | DOLLY_SOCKET_SHUTDOWN_WRITE)) != 0) return -EINVAL;
      if (socket->state != DOLLY_SOCKET_CONNECTED) return -ENOTCONN;
      if (request.argument & DOLLY_SOCKET_SHUTDOWN_READ) socket->read_shut = 1;
      if (request.argument & DOLLY_SOCKET_SHUTDOWN_WRITE) socket->write_shut = 1;
      dolly_kernel_wake();
      return 0;
    case DOLLY_SOCKET_SEND: {
      if ((request.argument & ~DOLLY_SOCKET_DONTWAIT) != 0 ||
          response_capacity < sizeof(dolly_process_io_result)) return -EINVAL;
      const int64_t sent = dolly_kernel_socket_send(shared, payload, payload_size,
          (request.argument & DOLLY_SOCKET_DONTWAIT) == 0);
      if (sent < 0) return sent;
      const dolly_process_io_result response = {(uint64_t)sent};
      return dolly_kernel_respond(mailbox, &response, sizeof(response));
    }
    case DOLLY_SOCKET_RECEIVE:
      if ((request.argument & ~DOLLY_SOCKET_DONTWAIT) != 0) return -EINVAL;
      return dolly_kernel_socket_receive(shared, mailbox, response_capacity,
          (request.argument & DOLLY_SOCKET_DONTWAIT) == 0);
    case DOLLY_SOCKET_NAME: {
      if ((request.argument & ~DOLLY_SOCKET_PEER) != 0) return -EINVAL;
      const dolly_socket *named = socket;
      if (request.argument & DOLLY_SOCKET_PEER) {
        if (socket->state != DOLLY_SOCKET_CONNECTED) return -ENOTCONN;
        named = socket->peer;
      }
      const char *path = named != NULL && named->path != NULL ? named->path : "";
      const size_t size = strlen(path);
      return size > response_capacity ? -ENOBUFS : dolly_kernel_respond(mailbox, path, size);
    }
  }
  return -ENOSYS;
}

const dolly_kernel_module dolly_sockets_kernel = {
    DOLLY_SOCKET_CREATE, DOLLY_SOCKET_NAME, sockets_call, NULL};
