/* Timed keyboard and relative pointer inputs; independent of game state. SPDX-License-Identifier: MIT */
#ifndef BHOP_TIMELINE_H
#define BHOP_TIMELINE_H
#include <stdint.h>

enum { BH_INPUT_MAGIC = 0x31504842, BH_INPUT_VERSION = 1, BH_INPUT_ACTIONS = 128, BH_INPUT_TICKS = 3000 };
enum { BH_W = 1, BH_A = 2, BH_S = 4, BH_D = 8, BH_SPACE = 16, BH_LEFT = 32, BH_RIGHT = 64, BH_RESTART = 128 };
typedef struct { uint32_t magic, version, id, generation, count, reserved; } bh_request;
typedef struct { uint32_t ticks, keys; int32_t mouse_x, mouse_y, wheel; uint32_t reserved; } bh_action;
_Static_assert(sizeof(bh_request) == 24 && sizeof(bh_action) == 24, "bhop input wire layout");

static inline int bh_actions_valid(const bh_action *actions, uint32_t count) {
    uint32_t ticks = 0;
    if (count > BH_INPUT_ACTIONS) return 0;
    for (uint32_t i = 0; i < count; ++i) {
        const bh_action *a = actions + i;
        if (!a->ticks || a->ticks > BH_INPUT_TICKS || a->keys > 255 || a->reserved ||
            a->mouse_x < -16000000 || a->mouse_x > 16000000 || a->mouse_y < -16000000 || a->mouse_y > 16000000 ||
            a->wheel < -1 || a->wheel > 1 || (ticks += a->ticks) > BH_INPUT_TICKS) return 0;
    }
    return 1;
}

/* Spread thousandths of a CSS pixel over fixed 10 ms ticks, preserving the exact sum. */
static inline int32_t bh_mouse_step(int32_t total, uint32_t tick, uint32_t duration) {
    return (int64_t)total * (tick + 1) / duration - (int64_t)total * tick / duration;
}
#endif
