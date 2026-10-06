#include <dolly/display.h>
#include <stdio.h>
#include <string.h>

// A program with its own controls in the bottom corners: it draws a frame,
// then reports the bottom presses and the key codes it reads until Escape;
// status 5 when its input ends another way.
int main(void) {
  dolly_display_surface surface;
  dolly_display_frame frame;
  if (dolly_display_acquire(&surface) != 0) return 1;
  if (dolly_display_begin_frame(surface.generation, &frame) != 0) return 2;
  memset(frame.pixels, 0x60, (size_t)frame.stride * frame.height);
  if (dolly_display_present(surface.generation, frame.buffer_index) != 0) return 3;
  char report[1024] = "";
  size_t length = 0;
  dolly_input_event event;
  int status = 5;
  while (length < sizeof(report) - 64 && dolly_display_next_event(surface.generation, &event, 30000) == 1) {
    const char *code = (const char *)event.data + event.key_length;
    if (event.type == DOLLY_INPUT_EVENT_POINTER && event.action == 1 && event.height_css_px > surface.height / 2) {
      length += (size_t)snprintf(report + length, 64, " %s", event.width_css_px < surface.width / 2 ? "left" : "right");
    } else if (event.type == DOLLY_INPUT_EVENT_KEY && event.action == DOLLY_KEY_ACTION_PRESS) {
      if (event.code_length == 6 && memcmp(code, "Escape", 6) == 0) { status = 0; break; }
      length += (size_t)snprintf(report + length, 64, " %.*s", (int)(event.code_length < 32 ? event.code_length : 32), code);
    }
  }
  if (dolly_display_release(surface.generation) != 0) return 4;
  printf("CORNERS%s END\n", report);
  return status;
}
