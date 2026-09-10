/* The Classic protocol is transported only through private in-Wasm files.
 * SPDX-License-Identifier: MIT */
#define Socket_ParseAddress Upstream_Socket_ParseAddress
#define Socket_Create Upstream_Socket_Create
#define Socket_SetNonBlocking Upstream_Socket_SetNonBlocking
#define Socket_Close Upstream_Socket_Close
#define Socket_Connect Upstream_Socket_Connect
#define Socket_Read Upstream_Socket_Read
#define Socket_Write Upstream_Socket_Write
#define Socket_Poll Upstream_Socket_Poll
#include "Platform_Posix.c"
#undef Socket_ParseAddress
#undef Socket_Create
#undef Socket_SetNonBlocking
#undef Socket_Close
#undef Socket_Connect
#undef Socket_Read
#undef Socket_Write
#undef Socket_Poll

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
static unsigned net_in, net_out;
static FILE *net_input;
static int net_open;
static const char *net_directory(void) { return getenv("DOLLY_CLASSICUBE_NET"); }
static void net_path(char *path, const char *direction, unsigned serial) {
    snprintf(path, 1024, "%s/net.%s.%u", net_directory(), direction, serial);
}
cc_result Socket_ParseAddress(const cc_string *address, int port, cc_sockaddr *addrs, int *count) {
    *count = 0;
    if (!net_directory() || port != 25565 || !String_CaselessEqualsConst(address, "127.0.0.1")) return ERR_NOT_SUPPORTED;
    addrs[0].size = 4; memcpy(addrs[0].data, "CCDL", 4); *count = 1; return 0;
}
cc_result Socket_Create(cc_socket *socket, cc_sockaddr *addr) {
    if (!net_directory() || net_open || addr->size != 4 || memcmp(addr->data, "CCDL", 4)) return ERR_NOT_SUPPORTED;
    *socket = 0xCC; net_open = 1; return 0;
}
cc_result Socket_SetNonBlocking(cc_socket socket, cc_bool nonblocking) { return socket == 0xCC && net_open ? 0 : ERR_NOT_SUPPORTED; }
cc_result Socket_Connect(cc_socket socket, const void *address, int length) {
    return socket == 0xCC && net_open && length == 4 && !memcmp(address, "CCDL", 4) ? 0 : ERR_NOT_SUPPORTED;
}
void Socket_Close(cc_socket socket) {
    if (socket != 0xCC) return;
    if (net_input) fclose(net_input);
    net_input = NULL; net_open = 0;
}
cc_result Socket_Read(cc_socket socket, cc_uint8 *data, cc_uint32 count, cc_uint32 *modified) {
    *modified = 0;
    if (socket != 0xCC || !net_open) return ERR_NOT_SUPPORTED;
    char path[1024]; net_path(path, "in", net_in + 1);
    if (!net_input) net_input = fopen(path, "rb");
    if (!net_input) return ReturnCode_SocketWouldBlock;
    *modified = fread(data, 1, count, net_input);
    if (ferror(net_input)) return EIO;
    if (feof(net_input)) { fclose(net_input); net_input = NULL; unlink(path); ++net_in; }
    return *modified ? 0 : ReturnCode_SocketWouldBlock;
}
cc_result Socket_Write(cc_socket socket, const cc_uint8 *data, cc_uint32 count, cc_uint32 *modified) {
    *modified = 0;
    if (socket != 0xCC || !net_open || count > 1024 * 1024) return ERR_NOT_SUPPORTED;
    char path[1024], temporary[1030]; net_path(path, "out", net_out + 1);
    snprintf(temporary, sizeof(temporary), "%s.tmp", path);
    FILE *file = fopen(temporary, "wb");
    if (!file) return errno;
    int okay = fwrite(data, 1, count, file) == count;
    if (fclose(file)) okay = 0;
    if (!okay || rename(temporary, path)) return EIO;
    ++net_out; *modified = count; return 0;
}
cc_result Socket_Poll(cc_socket socket, int timeout, int mode, cc_bool *success) {
    *success = false;
    if (socket != 0xCC || !net_open) return ERR_NOT_SUPPORTED;
    char path[1024]; net_path(path, "in", net_in + 1);
    *success = mode == SOCKET_POLL_WRITE || net_input || access(path, F_OK) == 0;
    return 0;
}
static cc_result Process_RawGetExePath(char* path, int* len) { return ERR_NOT_SUPPORTED; }
