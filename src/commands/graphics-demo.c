#include <dolly/display.h>

#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum {
  FRAME_DELAY_MS = 40,
};

static const uint32_t BACKGROUND_RGBA = UINT32_C(0xff1d1a16);
static const uint32_t ACCENT_RGBA = UINT32_C(0xff5cd4f2);

static void fill(uint32_t *pixels, size_t count, uint32_t color) {
  for (size_t index = 0; index < count; ++index) pixels[index] = color;
}

static void rectangle(dolly_display_frame *frame, int x, int y,
                      int width, int height, uint32_t color) {
  if (x < 0) {
    width += x;
    x = 0;
  }
  if (y < 0) {
    height += y;
    y = 0;
  }
  if (x + width > (int)frame->width) width = (int)frame->width - x;
  if (y + height > (int)frame->height) height = (int)frame->height - y;
  if (width <= 0 || height <= 0) return;
  for (int row = 0; row < height; ++row) {
    uint32_t *destination =
        (uint32_t *)(frame->pixels + (size_t)(y + row) * frame->stride) + x;
    fill(destination, (size_t)width, color);
  }
}

static void render(dolly_display_frame *frame, uint32_t tick,
                   int pointer_x, int pointer_y) {
  fill((uint32_t *)frame->pixels, frame->capacity / sizeof(uint32_t),
       BACKGROUND_RGBA);

  const int unit = (int)(frame->height / 24u) < 4
      ? 4 : (int)(frame->height / 24u);
  const int inset = unit * 2;
  rectangle(frame, inset, inset, (int)frame->width - inset * 2, unit,
            ACCENT_RGBA);
  rectangle(frame, inset, (int)frame->height - inset - unit,
            (int)frame->width - inset * 2, unit, ACCENT_RGBA);
  rectangle(frame, inset, inset, unit, (int)frame->height - inset * 2,
            ACCENT_RGBA);
  rectangle(frame, (int)frame->width - inset - unit, inset, unit,
            (int)frame->height - inset * 2, ACCENT_RGBA);

  const int track_width = (int)frame->width - inset * 6;
  const int moving_x = inset * 3 +
      (track_width > unit ? (int)(tick % (uint32_t)(track_width - unit)) : 0);
  rectangle(frame, moving_x, (int)frame->height / 2 - unit / 2,
            unit, unit, ACCENT_RGBA);

  if (pointer_x < 0 || pointer_y < 0) {
    pointer_x = (int)frame->width / 2;
    pointer_y = (int)frame->height / 2;
  }
  rectangle(frame, pointer_x - unit * 2, pointer_y - unit / 4,
            unit * 4, unit / 2 + 1, ACCENT_RGBA);
  rectangle(frame, pointer_x - unit / 4, pointer_y - unit * 2,
            unit / 2 + 1, unit * 4, ACCENT_RGBA);
}

static int code_is(const dolly_input_event *event, const char *expected) {
  const size_t expected_length = strlen(expected);
  return event->type == DOLLY_INPUT_EVENT_KEY &&
         event->code_length == expected_length &&
         memcmp(event->data + event->key_length, expected,
                expected_length) == 0;
}

static int should_quit(const dolly_input_event *event) {
  if (event->type == DOLLY_INPUT_EVENT_KEY &&
      event->action != DOLLY_KEY_ACTION_RELEASE &&
      (code_is(event, "KeyQ") || code_is(event, "Escape"))) {
    return 1;
  }
  return event->type == DOLLY_INPUT_EVENT_TEXT && event->text_length == 1 &&
         (event->data[0] == 'q' || event->data[0] == 'Q');
}

static int usage(const char *program, int status) {
  fprintf(status == 0 ? stdout : stderr,
          "usage: %s [--frames COUNT]\n"
          "lease Dolly's framebuffer; press Q/Escape to return or Ctrl-C "
          "to interrupt\n",
          program);
  return status;
}

int main(int argc, char **argv) {
  unsigned long frame_limit = 0;
  if (argc == 2 && strcmp(argv[1], "--help") == 0) return usage(argv[0], 0);
  if (argc == 3 && strcmp(argv[1], "--frames") == 0) {
    char *end = NULL;
    errno = 0;
    frame_limit = strtoul(argv[2], &end, 10);
    if (errno != 0 || end == argv[2] || *end != '\0' || frame_limit == 0) {
      return usage(argv[0], 2);
    }
  } else if (argc != 1) {
    return usage(argv[0], 2);
  }

  dolly_display_surface surface;
  int status = dolly_display_acquire(&surface);
  if (status != 0) {
    fprintf(stderr, "graphics-demo: acquire failed: %s\n", strerror(-status));
    return 1;
  }

  int result = 0;
  int pointer_x = -1;
  int pointer_y = -1;
  uint32_t tick = 0;
  unsigned long rendered = 0;
  while (frame_limit == 0 || rendered < frame_limit) {
    dolly_display_frame frame;
    status = dolly_display_begin_frame(surface.generation, &frame);
    if (status != 0 || frame.pixel_format != DOLLY_DISPLAY_PIXEL_RGBA8) {
      result = 1;
      break;
    }
    render(&frame, tick, pointer_x, pointer_y);
    status = dolly_display_present(surface.generation, frame.buffer_index);
    if (status != 0) {
      result = 1;
      break;
    }
    ++rendered;
    tick += 7;
    if (frame_limit != 0 && rendered == frame_limit) break;

    dolly_input_event event;
    status = dolly_display_next_event(surface.generation, &event,
                                      FRAME_DELAY_MS);
    if (status < 0) {
      result = 1;
      break;
    }
    if (status == 1) {
      if (should_quit(&event)) break;
      if (event.type == DOLLY_INPUT_EVENT_POINTER &&
          event.action != DOLLY_POINTER_ACTION_RELEASE) {
        pointer_x = (int)event.width_css_px;
        pointer_y = (int)event.height_css_px;
      }
    }
  }

  status = dolly_display_release(surface.generation);
  if (status != 0) result = 1;
  if (result == 0) puts("graphics-demo: terminal restored");
  return result;
}
