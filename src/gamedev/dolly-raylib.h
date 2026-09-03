#ifndef DOLLY_RAYLIB_H
#define DOLLY_RAYLIB_H

#include <dolly/display.h>
#include <raylib.h>

typedef struct {
  dolly_display_surface surface;
  uint32_t animation_frame_sequence;
  int open;
} dolly_raylib;

// PLATFORM_MEMORY renders wholly inside Wasm. The adapter copies its completed
// software frame directly into Dolly's inactive buffer without an intermediate
// raylib Image. The default open caps software rendering at 800x450; callers
// can choose another upper bound while retaining the browser viewport ratio.
int dolly_raylib_open(dolly_raylib *context, const char *title);
int dolly_raylib_open_sized(dolly_raylib *context, const char *title,
                            uint32_t max_width, uint32_t max_height);
int dolly_raylib_end_frame(dolly_raylib *context);
int dolly_raylib_wait_frame(dolly_raylib *context, double timeout_milliseconds);
int dolly_raylib_set_cursor(dolly_raylib *context, uint32_t cursor);
int dolly_raylib_next_event(dolly_raylib *context, dolly_input_event *event,
                            double timeout_milliseconds);
int dolly_raylib_close(dolly_raylib *context);
int dolly_raylib_code_is(const dolly_input_event *event, const char *code);

#endif
