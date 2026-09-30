#define _POSIX_C_SOURCE 200809L
#include <enet/enet.h>
#include <dolly/http.h>
#include <errno.h>
#include <stdint.h>
#include <string.h>
#include <time.h>

/* Private ENet platform transport, above Dolly's existing HTTP/process ABI.
   Requests: LE u32 magic,op,lease,arg; SEND adds host:u32,port:u32,datagram.
   Replies: magic,host,port,value; RECEIVE adds value bytes. Host preserves
   ENet's network byte order. The relay assigns hosts and owns routing policy. */
enum { MAGIC = 0x4e594c44, SOCKETS = 8, DATAGRAM = 4096 };
typedef struct { int used; uint32_t lease, last_poll; ENetAddress address; } RelaySocket;
typedef struct { unsigned char data[16 + DATAGRAM]; size_t size; } Reply;
static RelaySocket sockets[SOCKETS];
static uint32_t time_base, local_host;
static int error(int number) { errno = number; return -1; }
static void put(void *data, size_t at, uint32_t n) { memcpy((char *)data + at, &n, 4); }
static uint32_t get(const void *data, size_t at) { uint32_t n; memcpy(&n, (const char *)data + at, 4); return n; }
static RelaySocket *lookup(ENetSocket socket) {
  if (socket < 0 || socket >= SOCKETS || !sockets[socket].used) { errno = EBADF; return NULL; }
  return &sockets[socket];
}
static size_t receive_body(const void *data, size_t size, void *context) {
  Reply *reply = context;
  if (size > sizeof(reply->data) - reply->size) return 0;
  memcpy(reply->data + reply->size, data, size); reply->size += size; return size;
}
static int request(unsigned op, uint32_t lease, uint32_t arg, const void *body, size_t size, Reply *reply) {
  const char *url = getenv("DOLLY_ENET_RELAY");
  if (!url || !*url) return error(ENETUNREACH);
  if (strlen(url) > 2048 || size > DATAGRAM + 8) return error(E2BIG);
  unsigned char packet[24 + DATAGRAM];
  put(packet, 0, MAGIC); put(packet, 4, op); put(packet, 8, lease); put(packet, 12, arg);
  if (size) memcpy(packet + 16, body, size);
  reply->size = 0;
  dolly_http_request req = {.method = "POST", .url = url,
    .headers = "Content-Type: application/octet-stream\r\n", .body = packet, .body_size = 16 + size,
    .flags = DOLLY_HTTP_FAIL_STATUS, .write = receive_body, .write_context = reply};
  dolly_http_response response = {0};
  int result = dolly_http_perform(&req, &response);
  dolly_http_response_dispose(&response);
  if (result < 0) return error(-result);
  if (result > 0) return error(result == 403 ? EACCES : result == 409 ? EADDRINUSE :
    result == 410 ? ECONNRESET : result == 429 ? ENOBUFS : EIO);
  if (reply->size < 16 || get(reply->data, 0) != MAGIC) return error(EPROTO);
  return 0;
}
int enet_initialize(void) { return 0; }
void enet_deinitialize(void) { for (int i = 0; i < SOCKETS; ++i) if (sockets[i].used) enet_socket_destroy(i); }
enet_uint32 enet_host_random_seed(void) { return (uint32_t)time(NULL); }
enet_uint32 enet_time_get(void) {
  struct timespec now; clock_gettime(CLOCK_MONOTONIC, &now);
  return (uint32_t)((uint64_t)now.tv_sec * 1000 + now.tv_nsec / 1000000) - time_base;
}
void enet_time_set(enet_uint32 value) { time_base = enet_time_get() + time_base - value; }
int enet_address_set_host_ip(ENetAddress *address, const char *name) {
  if (inet_pton(AF_INET, name, &address->host) != 1) return error(EINVAL);
  return 0;
}
int enet_address_set_host(ENetAddress *address, const char *name) {
  if (!strcmp(name, "localhost") || !strcmp(name, "127.0.0.1")) {
    if (!local_host) {
      Reply reply; if (request(0, 0, 0, NULL, 0, &reply) < 0) return -1;
      local_host = get(reply.data, 4);
    }
    address->host = local_host; return 0;
  }
  return enet_address_set_host_ip(address, name);
}
int enet_address_get_host_ip(const ENetAddress *address, char *name, size_t size) {
  return inet_ntop(AF_INET, &address->host, name, size) ? 0 : -1;
}
int enet_address_get_host(const ENetAddress *address, char *name, size_t size) { return enet_address_get_host_ip(address, name, size); }
ENetSocket enet_socket_create(ENetSocketType type) {
  if (type != ENET_SOCKET_TYPE_DATAGRAM) return error(ENOTSUP);
  for (int i = 0; i < SOCKETS; ++i) if (!sockets[i].used) { sockets[i] = (RelaySocket){.used = 1}; return i; }
  return error(EMFILE);
}
int enet_socket_bind(ENetSocket socket, const ENetAddress *address) {
  RelaySocket *s = lookup(socket); if (!s) return -1;
  if (s->lease) return error(EINVAL);
  if (address && address->host != ENET_HOST_ANY && address->host != local_host) return error(EADDRNOTAVAIL);
  Reply reply;
  if (request(1, 0, address ? address->port : 0, NULL, 0, &reply) < 0) return -1;
  if (reply.size != 16 || !get(reply.data, 12) || !get(reply.data, 8) || get(reply.data, 8) > 65535) return error(EPROTO);
  s->lease = get(reply.data, 12); s->address.host = local_host = get(reply.data, 4);
  s->address.port = get(reply.data, 8); return 0;
}
int enet_socket_get_address(ENetSocket socket, ENetAddress *address) {
  RelaySocket *s = lookup(socket); if (!s) return -1;
  if (!s->lease && enet_socket_bind(socket, NULL) < 0) return -1;
  *address = s->address; return 0;
}
int enet_socket_send(ENetSocket socket, const ENetAddress *address, const ENetBuffer *buffers, size_t count) {
  RelaySocket *s = lookup(socket); if (!s) return -1;
  if (!address || !address->port || address->host == ENET_HOST_BROADCAST) return error(ENOTSUP);
  if (!s->lease && enet_socket_bind(socket, NULL) < 0) return -1;
  unsigned char body[8 + DATAGRAM]; size_t length = 0;
  put(body, 0, address->host); put(body, 4, address->port);
  for (size_t i = 0; i < count; ++i) {
    if (buffers[i].dataLength > DATAGRAM - length) return error(EMSGSIZE);
    memcpy(body + 8 + length, buffers[i].data, buffers[i].dataLength); length += buffers[i].dataLength;
  }
  Reply reply;
  if (request(2, s->lease, length, body, length + 8, &reply) < 0) return -1;
  return length;
}
int enet_socket_receive(ENetSocket socket, ENetAddress *address, ENetBuffer *buffers, size_t count) {
  RelaySocket *s = lookup(socket); if (!s) return -1;
  if (!s->lease && enet_socket_bind(socket, NULL) < 0) return -1;
  uint32_t now = enet_time_get();
  if (s->last_poll && now - s->last_poll < 10) return 0;
  Reply reply;
  if (request(3, s->lease, 0, NULL, 0, &reply) < 0) return -1;
  const uint32_t size = get(reply.data, 12);
  if (size > DATAGRAM || reply.size != 16 + size || get(reply.data, 8) > 65535) return error(EPROTO);
  if (!size) { s->last_poll = now; return 0; }
  if (address) { address->host = get(reply.data, 4); address->port = get(reply.data, 8); }
  size_t offset = 0;
  for (size_t i = 0; i < count && offset < size; ++i) {
    size_t n = buffers[i].dataLength < size - offset ? buffers[i].dataLength : size - offset;
    memcpy(buffers[i].data, reply.data + 16 + offset, n); offset += n;
  }
  return offset == size ? (int)size : -2;
}
int enet_socket_wait(ENetSocket socket, enet_uint32 *condition, enet_uint32 timeout) {
  if (!lookup(socket)) return -1;
  if (timeout) { struct timespec delay = {0, 1000000}; nanosleep(&delay, NULL); }
  *condition &= ENET_SOCKET_WAIT_RECEIVE | ENET_SOCKET_WAIT_SEND; return 0;
}
int enet_socket_set_option(ENetSocket socket, ENetSocketOption option, int value) {
  if (!lookup(socket)) return -1;
  if ((option == ENET_SOCKOPT_NONBLOCK && value == 1) ||
      ((option == ENET_SOCKOPT_RCVBUF || option == ENET_SOCKOPT_SNDBUF) && value > 0)) return 0;
  return error(ENOTSUP);
}
int enet_socket_get_option(ENetSocket socket, ENetSocketOption option, int *value) {
  if (!lookup(socket)) return -1;
  if (option != ENET_SOCKOPT_ERROR) return error(ENOTSUP);
  *value = 0; return 0;
}
void enet_socket_destroy(ENetSocket socket) {
  RelaySocket *s = lookup(socket); if (!s) return;
  if (s->lease) { Reply reply; (void)request(4, s->lease, 0, NULL, 0, &reply); }
  *s = (RelaySocket){0};
}
int enet_socket_connect(ENetSocket socket, const ENetAddress *address) { return error(ENOTSUP); }
int enet_socket_listen(ENetSocket socket, int backlog) { return error(ENOTSUP); }
ENetSocket enet_socket_accept(ENetSocket socket, ENetAddress *address) { return error(ENOTSUP); }
int enet_socket_shutdown(ENetSocket socket, ENetSocketShutdown how) { return error(ENOTSUP); }
int enet_socketset_select(ENetSocket maximum, ENetSocketSet *read, ENetSocketSet *write, enet_uint32 timeout) { return error(ENOTSUP); }
