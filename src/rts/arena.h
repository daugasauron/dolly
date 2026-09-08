// Seven Kingdoms local multiplayer adapter. SPDX-License-Identifier: GPL-2.0-or-later
#ifndef DOLLY_RTS_ARENA_H
#define DOLLY_RTS_ARENA_H
#include <stdint.h>
int dolly_rts_prepare();
uint32_t dolly_rts_player();
void dolly_rts_configure();
void dolly_rts_poll();
void dolly_rts_run();
int dolly_rts_send(uint32_t to, const void *bytes, uint32_t size);
char *dolly_rts_receive(uint32_t *from, uint32_t *size, int *system_messages);
void dolly_rts_transport_failed();
void dolly_rts_finish(int winner, int destroyed, int surrendered, int retired);
#endif
