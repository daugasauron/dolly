// Private game/player IPC in the shared Wasm filesystem, not a browser ABI.
// SPDX-License-Identifier: GPL-2.0-or-later
#ifndef DOLLY_RTS_INPUT_H
#define DOLLY_RTS_INPUT_H
#include <stdint.h>

#define RTS_INPUT_MAGIC 0x31535452u
#define RTS_INPUT_VERSION 1u
#define RTS_INPUT_MAX_ACTIONS 16u
#define RTS_INPUT_MAX_MILLISECONDS 2000u

enum RtsInputKind { RTS_MOVE = 1, RTS_CLICK, RTS_KEY, RTS_DRAG, RTS_WAIT };
enum RtsInputModifier { RTS_SHIFT = 1, RTS_CONTROL = 2, RTS_ALT = 4 };

// All integers are little-endian; each action is 64 bytes.
typedef struct {
    uint32_t kind, x, y, end_x, end_y, button, milliseconds, modifiers;
    char key[32];
} RtsInputAction;

// Exactly count actions follow this 16-byte header.
typedef struct {
    uint32_t magic, version, id, count;
} RtsInputRequest;

// Exactly png_size PNG bytes follow this 32-byte header. Status is an errno;
// a failed or cancelled batch has no image. Times are relative to game launch.
typedef struct {
    uint32_t magic, version, id, status, frame, milliseconds, png_size, reserved;
} RtsInputResponse;

#ifdef __cplusplus
static_assert(sizeof(RtsInputAction) == 64, "RTS action layout");
static_assert(sizeof(RtsInputRequest) == 16, "RTS request layout");
static_assert(sizeof(RtsInputResponse) == 32, "RTS response layout");
struct SDL_Window;
struct SDL_Renderer;
void dolly_rts_input(SDL_Window *, uint32_t frame);
void dolly_rts_frame(SDL_Renderer *, uint32_t frame);
void dolly_rts_input_close(uint32_t frame);
#endif
#endif
