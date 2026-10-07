#pragma once
#include <stdint.h>
#include <dolly/sockets-abi.h>

/* The packets of dolly-sockets-0.wat. Programs use <sys/socket.h>: the libc
 * implements socket, socketpair, bind, listen, accept, connect, shutdown,
 * send and recv over these for AF_UNIX stream sockets and refuses every
 * other family, type and protocol itself. */
typedef struct { uint32_t descriptor, argument; } dolly_socket_request;
typedef struct { uint32_t first, second; } dolly_socket_descriptors;
