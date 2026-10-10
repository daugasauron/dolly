#include <dolly/display.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

// Holds the display and shows each cursor the contract names for 0.4 s, in
// order, then asks for one it does not name.
int main(void) {
  dolly_display_surface surface;
  dolly_display_frame frame;
  if (dolly_display_acquire(&surface) != 0) return 1;
  if (dolly_display_begin_frame(surface.generation, &frame) != 0) return 2;
  memset(frame.pixels, 0x60, (size_t)frame.stride * frame.height);
  if (dolly_display_present(surface.generation, frame.buffer_index) != 0) return 3;
  for (uint32_t cursor = 0; cursor <= DOLLY_DISPLAY_CURSOR_HELP; ++cursor) {
    if (dolly_display_set_cursor(surface.generation, cursor) != 0) return 4;
    usleep(400000);
  }
  int refused = dolly_display_set_cursor(surface.generation, DOLLY_DISPLAY_CURSOR_HELP + 1) == -EINVAL;
  if (dolly_display_release(surface.generation) != 0) return 5;
  puts(refused ? "CURSORS-SHOWN" : "CURSOR-NOT-REFUSED");
  return !refused;
}
