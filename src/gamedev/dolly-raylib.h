#ifndef DOLLY_RAYLIB_H
#define DOLLY_RAYLIB_H

#include <dolly/display.h>
#include <raylib.h>

typedef struct {
  dolly_display_surface surface;
  int open;
} dolly_raylib;

// PLATFORM_MEMORY renders wholly inside Wasm. This adapter leases Dolly's
// visible framebuffer and copies each completed raylib frame into it.
int dolly_raylib_open(dolly_raylib *context, const char *title);
int dolly_raylib_end_frame(dolly_raylib *context);
int dolly_raylib_next_event(dolly_raylib *context, dolly_input_event *event,
                            double timeout_milliseconds);
int dolly_raylib_close(dolly_raylib *context);
int dolly_raylib_code_is(const dolly_input_event *event, const char *code);

#endif
