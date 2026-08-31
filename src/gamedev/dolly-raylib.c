#include "dolly-raylib.h"

#include <errno.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
#include <termios.h>
#include <time.h>

// Upstream PLATFORM_MEMORY polls a Unix tty and optionally sleeps after each
// frame. Dolly supplies input through dolly_display_next_event(), which already
// provides the frame wait, so satisfy those unreachable backend hooks locally
// instead of growing the command ABI with a second input path.
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

int nanosleep(const struct timespec *duration, struct timespec *remaining) {
  (void)duration;
  if (remaining != NULL) memset(remaining, 0, sizeof(*remaining));
  return 0;
}

int dolly_raylib_open(dolly_raylib *context, const char *title) {
  if (context == NULL) return -EINVAL;
  memset(context, 0, sizeof(*context));
  int status = dolly_display_acquire(&context->surface);
  if (status != 0) return status;

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

int dolly_raylib_end_frame(dolly_raylib *context) {
  if (context == NULL || !context->open) return -EINVAL;
  EndDrawing();

  Image image = LoadImageFromScreen();
  if (!IsImageValid(image) || image.format != PIXELFORMAT_UNCOMPRESSED_R8G8B8A8 ||
      image.width != (int)context->surface.width ||
      image.height != (int)context->surface.height) {
    if (IsImageValid(image)) UnloadImage(image);
    return -EIO;
  }

  dolly_display_frame frame;
  int status = dolly_display_begin_frame(context->surface.generation, &frame);
  size_t length = (size_t)image.width * (size_t)image.height * 4;
  if (status == 0 && frame.pixel_format == DOLLY_DISPLAY_PIXEL_RGBA8 &&
      frame.width == context->surface.width &&
      frame.height == context->surface.height && length <= frame.capacity) {
    memcpy(frame.pixels, image.data, length);
    status = dolly_display_present(context->surface.generation,
                                   frame.buffer_index);
  } else if (status == 0) {
    status = -EIO;
  }
  UnloadImage(image);
  return status;
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
