/* The adapter receives framebuffer pixels and emits input events only. SPDX-License-Identifier: MIT */
#ifndef BHOP_AGENT_INPUT_H
#define BHOP_AGENT_INPUT_H
#include <dolly/display.h>
int bh_agent_open(void (*input)(void *, const dolly_input_event *), void *context);
int bh_agent_poll(void);
void bh_agent_tick(void);
int bh_agent_capture_due(void);
int bh_agent_frame(const void *pixels);
void bh_agent_close(void);
#endif
