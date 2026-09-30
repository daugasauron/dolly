#define _GNU_SOURCE
#include <enet/enet.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>

int main(int argc, char **argv) {
  const int server = argc > 1 && !strcmp(argv[1], "host");
  const int denied = argc > 1 && !strcmp(argv[1], "--deny");
  if (enet_initialize()) return 1;
  ENetAddress address = {.host = ENET_HOST_ANY, .port = 20595};
  ENetHost *host = enet_host_create(server || denied ? &address : NULL, 2, 1, 0, 0);
  if (denied) {
    if (host || errno != EACCES) { fprintf(stderr, "Expected broker denial, got %d\n", errno); return 1; }
    puts("ENet broker denial PASS"); return 0;
  }
  if (!host) { perror("enet_host_create"); return 1; }
  static unsigned char payload[10000];
  for (unsigned i = 0; i < sizeof(payload); ++i) payload[i] = i * 13 + 7;
  if (!server) {
    if (enet_address_set_host(&address, "10.0.0.1") || !enet_host_connect(host, &address, 1, 0)) return 1;
  }
  const enet_uint32 start = enet_time_get();
  int received = 0;
  while (enet_time_get() - start < 15000 && !received) {
    ENetEvent event;
    int result = enet_host_service(host, &event, 10);
    if (result < 0) { perror("enet_host_service"); return 1; }
    if (!result) continue;
    if (event.type == ENET_EVENT_TYPE_CONNECT && !server)
      enet_peer_send(event.peer, 0, enet_packet_create(payload, sizeof(payload), ENET_PACKET_FLAG_RELIABLE));
    if (event.type == ENET_EVENT_TYPE_RECEIVE) {
      if (event.packet->dataLength != sizeof(payload) || memcmp(event.packet->data, payload, sizeof(payload))) return 1;
      if (server) {
        enet_peer_send(event.peer, 0, enet_packet_create(payload, sizeof(payload), ENET_PACKET_FLAG_RELIABLE));
        enet_host_flush(host);
      }
      enet_packet_destroy(event.packet); received = 1;
    }
  }
  printf("ENet %s: %s, %u ms, %u sent / %u received datagrams\n", server ? "host" : "client",
    received ? "PASS" : "TIMEOUT", enet_time_get() - start, host->totalSentPackets, host->totalReceivedPackets);
  enet_host_destroy(host); enet_deinitialize(); return received ? 0 : 1;
}
