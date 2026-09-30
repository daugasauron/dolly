/* Private application IPC in Dolly's filesystem. SPDX-License-Identifier: MIT */
#ifndef DOLLY_CLASSICUBE_INPUT_H
#define DOLLY_CLASSICUBE_INPUT_H
#include <SDL.h>
struct Bitmap;
void DollyAgent_Poll(SDL_Window *window);
void DollyAgent_Frame(struct Bitmap *bitmap);
#endif
