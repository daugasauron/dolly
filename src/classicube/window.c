/* SPDX-License-Identifier: MIT */
#include "input.h"
#define Window_ProcessEvents Upstream_ProcessEvents
#define Window_DrawFramebuffer Upstream_DrawFramebuffer
#include "Window_SDL2.c"
#undef Window_ProcessEvents
#undef Window_DrawFramebuffer

void Window_ProcessEvents(float delta) {
    DollyAgent_Poll(win_handle);
    Upstream_ProcessEvents(delta);
}

void Window_DrawFramebuffer(Rect2D rect, struct Bitmap *bitmap) {
    Upstream_DrawFramebuffer(rect, bitmap);
    DollyAgent_Frame(bitmap);
}
