/* Private game/viewer IPC. SPDX-License-Identifier: MIT */
#ifndef CLASSICUBE_CONTROL_H
#define CLASSICUBE_CONTROL_H
#include <stdint.h>
enum { CONTROL_PAUSED, CONTROL_HUMAN, CONTROL_AGENT };
enum { HUMAN_KEY = 1, HUMAN_MOTION, HUMAN_BUTTON, HUMAN_WHEEL, HUMAN_TEXT };
typedef struct { uint32_t generation, owner; } GameControl;
typedef struct { uint32_t generation, count; } HumanBatch;
typedef struct { uint32_t kind; int32_t a, b, c; char text[32]; } HumanEvent;
#endif
