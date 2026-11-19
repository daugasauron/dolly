#include <dolly/display.h>
#include <dolly/gpu.h>
#include <dolly/input.h>
#include <dolly/touch.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* pointer display|gpu RELEASES: holds the display and input leases and shows one frame of the
   surface's size, drawn by display@0 or by gpu@0, which a later layout of the page leaves as it
   is, as PhotoCraft's; after the first release it shows a button of touch@0, which brings the
   page's bar below the canvas. After RELEASES releases it prints where each press was, three
   to a line as POINTERS X,Y X,Y X,Y, few lines for a terminal of few rows, and the size the last
   SURFACE record gave, as SURFACE WIDTH HEIGHT. */
static void check(int ok, const char *what) {
  if (ok) return;
  printf("POINTER-FAILED %s\n", what);
  exit(1);
}

static const char shader[] =
  "@group(0) @binding(0) var<uniform> tint: vec4f;\n"
  "@vertex fn vertex_main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {\n"
  "  let p = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));\n"
  "  return vec4f(p[i], 0, 1);\n"
  "}\n"
  "@fragment fn fragment_main() -> @location(0) vec4f { return tint; }\n";

int main(int argc, char **argv) {
  check(argc == 3, "usage: pointer display|gpu RELEASES");
  dolly_display_surface surface;
  uint64_t input, touch;
  check(dolly_display_acquire(&surface) == 0, "display");
  check(dolly_input_acquire(&input) == 0, "input");
  check(dolly_touch_acquire(&touch) == 0, "touch");
  if (!strcmp(argv[1], "gpu")) {
    static dolly_gpu gpu;
    check(dolly_gpu_open(&gpu, surface.width, surface.height) >= 0, "gpu");
    const float tint[4] = {0.2f, 0.5f, 0.8f, 1};
    const uint64_t buffers[] = {1}, sizes[] = {sizeof(tint)};
    dolly_gpu_begin(&gpu);
    dolly_gpu_buffer(&gpu, 1, sizeof(tint), 64 | 8);
    dolly_gpu_write(&gpu, 1, tint, sizeof(tint));
    dolly_gpu_shader(&gpu, 2, shader);
    dolly_gpu_pipeline(&gpu, 3, 2, "vertex_main", "fragment_main", 0);
    dolly_gpu_group(&gpu, 4, 3, 1, buffers, sizes);
    dolly_gpu_draw(&gpu, 3, 4, 3, 1, surface.width, surface.height, 1);
    dolly_gpu_submit(&gpu);
    check(dolly_gpu_batch(&gpu) >= 0, "a frame");
  } else {
    dolly_display_frame frame;
    check(dolly_display_begin_frame(surface.generation, &frame) == 0, "a frame");
    for (uint32_t y = 0; y < frame.height; ++y) {
      uint32_t *row = (uint32_t *)(frame.pixels + (size_t)y * frame.stride);
      for (uint32_t x = 0; x < frame.width; ++x) row[x] = 0xff804020;
    }
    check(dolly_display_present(surface.generation, frame.buffer_index) == 0, "present");
  }
  const char *const bar[] = {"Bar"};
  int presses = 0, x[64], y[64], width = 0, height = 0;
  for (int released = 0, releases = atoi(argv[2]); released < releases;) {
    dolly_input_event event;
    if (dolly_input_next_event(input, &event, -1) != 1) continue;
    if (event.type == DOLLY_INPUT_EVENT_SURFACE) width = event.x, height = event.y;
    if (event.type != DOLLY_INPUT_EVENT_POINTER) continue;
    if (event.action == DOLLY_POINTER_ACTION_PRESS && presses < 64) x[presses] = event.x, y[presses++] = event.y;
    if (event.action == DOLLY_POINTER_ACTION_RELEASE && !released++) check(dolly_touch_buttons(touch, bar, 1) == 0, "a button");
  }
  for (int press = 0; press < presses; ++press) printf(press % 3 ? " %d,%d" : press ? "\nPOINTERS %d,%d" : "POINTERS %d,%d", x[press], y[press]);
  printf("\nSURFACE %d %d\n", width, height);
  return 0;
}
