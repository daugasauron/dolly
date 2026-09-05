#include "dolly-raylib.h"

#include <rlgl.h>

#include <errno.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
#include <termios.h>

// Upstream PLATFORM_MEMORY polls a Unix tty. Dolly supplies input through
// dolly_display_next_event(), so satisfy those unreachable backend hooks
// locally instead of growing the command ABI with a second input path.
int tcgetattr(int descriptor, struct termios *attributes) {
  (void)descriptor;
  (void)attributes;
  errno = ENOTTY;
  return -1;
}

int tcsetattr(int descriptor, int action, const struct termios *attributes) {
  (void)descriptor;
  (void)action;
  (void)attributes;
  errno = ENOTTY;
  return -1;
}

int getchar(void) { return EOF; }

int dolly_raylib_open_sized(dolly_raylib *context, const char *title,
                            uint32_t max_width, uint32_t max_height) {
  if (context == NULL || max_width == 0 || max_height == 0) return -EINVAL;
  memset(context, 0, sizeof(*context));
  int status = dolly_display_acquire(&context->surface);
  if (status != 0) return status;

  uint32_t width = context->surface.width;
  uint32_t height = context->surface.height;
  if (width > max_width || height > max_height) {
    if ((uint64_t)width * max_height > (uint64_t)height * max_width) {
      height = (uint32_t)((uint64_t)height * max_width / width);
      width = max_width;
    } else {
      width = (uint32_t)((uint64_t)width * max_height / height);
      height = max_height;
    }
    if (width == 0) width = 1;
    if (height == 0) height = 1;
    status = dolly_display_set_size(context->surface.generation, width, height,
                                    &context->surface);
    if (status != 0) {
      dolly_display_release(context->surface.generation);
      memset(context, 0, sizeof(*context));
      return status;
    }
  }

  InitWindow((int)context->surface.width, (int)context->surface.height, title);
  if (!IsWindowReady()) {
    dolly_display_release(context->surface.generation);
    memset(context, 0, sizeof(*context));
    return -EIO;
  }
  SetTraceLogLevel(LOG_WARNING);
  context->open = 1;
  return 0;
}

int dolly_raylib_open(dolly_raylib *context, const char *title) {
  return dolly_raylib_open_sized(context, title, 800, 450);
}

int dolly_raylib_end_frame(dolly_raylib *context) {
  if (context == NULL || !context->open) return -EINVAL;
  // SUPPORT_CUSTOM_FRAME_CONTROL makes EndDrawing flush raylib's render batch
  // without copying into PLATFORM_MEMORY's private presentation buffer or
  // sleeping. Dolly supplies both presentation and pacing below.
  EndDrawing();

  dolly_display_frame frame;
  int status = dolly_display_begin_frame(context->surface.generation, &frame);
  if (status == 0 && frame.pixel_format == DOLLY_DISPLAY_PIXEL_RGBA8 &&
      frame.width == context->surface.width &&
      frame.height == context->surface.height &&
      (size_t)frame.stride * frame.height <= frame.capacity) {
    rlCopyFramebuffer(0, 0, (int)frame.width, (int)frame.height,
                      PIXELFORMAT_UNCOMPRESSED_R8G8B8A8, frame.pixels);
    status = dolly_display_present(context->surface.generation,
                                   frame.buffer_index);
  } else if (status == 0) {
    status = -EIO;
  }
  return status;
}

int dolly_raylib_wait_frame(dolly_raylib *context,
                            double timeout_milliseconds) {
  if (context == NULL || !context->open) return -EINVAL;
  return dolly_display_wait_frame(context->surface.generation,
                                  &context->animation_frame_sequence,
                                  timeout_milliseconds);
}

int dolly_raylib_set_cursor(dolly_raylib *context, uint32_t cursor) {
  if (context == NULL || !context->open) return -EINVAL;
  return dolly_display_set_cursor(context->surface.generation, cursor);
}

int dolly_raylib_next_event(dolly_raylib *context, dolly_input_event *event,
                            double timeout_milliseconds) {
  if (context == NULL || !context->open) return -EINVAL;
  return dolly_display_next_event(context->surface.generation, event,
                                  timeout_milliseconds);
}

int dolly_raylib_close(dolly_raylib *context) {
  if (context == NULL || !context->open) return -EINVAL;
  CloseWindow();
  int status = dolly_display_release(context->surface.generation);
  memset(context, 0, sizeof(*context));
  return status;
}

int dolly_raylib_code_is(const dolly_input_event *event, const char *code) {
  if (event == NULL || code == NULL || event->type != DOLLY_INPUT_EVENT_KEY)
    return 0;
  size_t length = strlen(code);
  return event->code_length == length &&
         memcmp(event->data + event->key_length, code, length) == 0;
}
