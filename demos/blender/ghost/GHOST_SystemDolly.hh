/* SPDX-FileCopyrightText: 2026 Dolly
 *
 * SPDX-License-Identifier: GPL-2.0-or-later */

/** \file
 * \ingroup GHOST
 *
 * GHOST on Dolly: the page's surface is the one screen (display@0), its keys, pointer and wheel
 * are input@0's records, its clipboard is clipboard@0's. Every window fills the page; the newest
 * is shown and takes input, the one below it again when it closes. Frames are drawn by the GPU
 * module's WebGPU backend on gpu@0 (GHOST_ContextWebGPU).
 */

#pragma once

#include "GHOST_System.hh"

#include <dolly/input.h>

#include <string>
#include <vector>

class GHOST_WindowDolly;

class GHOST_SystemDolly : public GHOST_System {
 public:
  GHOST_SystemDolly(bool background);
  ~GHOST_SystemDolly() override;

  bool processEvents(bool waitForEvent) override;
  bool setConsoleWindowState(GHOST_TConsoleWindowState /*action*/) override
  {
    return false;
  }
  GHOST_TSuccess getModifierKeys(GHOST_ModifierKeys &keys) const override;
  GHOST_TSuccess getButtons(GHOST_Buttons &buttons) const override;
  GHOST_TCapabilityFlag getCapabilities() const override;
  char *getClipboard(bool selection) const override;
  void putClipboard(const char *buffer, bool selection) const override;
  uint64_t getMilliSeconds() const override;
  uint8_t getNumDisplays() const override
  {
    return 1;
  }
  GHOST_TSuccess getCursorPosition(int32_t &x, int32_t &y) const override;
  GHOST_TSuccess setCursorPosition(int32_t /*x*/, int32_t /*y*/) override
  {
    /* A browser does not move the pointer. */
    return GHOST_kFailure;
  }
  void getMainDisplayDimensions(uint32_t &width, uint32_t &height) const override;
  void getAllDisplayDimensions(uint32_t &width, uint32_t &height) const override;
  GHOST_IContext *createOffscreenContext(GHOST_GPUSettings gpu_settings) override;
  GHOST_TSuccess disposeContext(GHOST_IContext *context) override;
  GHOST_IWindow *getWindowUnderCursor(int32_t x, int32_t y) override;

  /** The window shown on the page: the newest. */
  GHOST_WindowDolly *shownWindow() const;
  void windowClosed(GHOST_WindowDolly *window);
  void setCursor(uint32_t cursor) const;

 private:
  GHOST_TSuccess init() override;
  GHOST_IWindow *createWindow(const char *title,
                              int32_t left,
                              int32_t top,
                              uint32_t width,
                              uint32_t height,
                              GHOST_TWindowState state,
                              GHOST_GPUSettings gpu_settings,
                              const bool exclusive = false,
                              const bool is_dialog = false,
                              const GHOST_IWindow *parent_window = nullptr) override;

  /** display@0, input@0 and clipboard@0, taken as the first window opens. */
  bool acquirePage();
  void readEvent(const dolly_input_event &event);
  void readKey(const dolly_input_event &event);
  void readText(const dolly_input_event &event);
  void readPointer(const dolly_input_event &event);
  void readScroll(const dolly_input_event &event);
  void resizePage(uint32_t width, uint32_t height);
  void setModifiers(uint32_t modifiers);

  bool background_;
  uint64_t display_ = 0, input_ = 0, clipboard_ = 0;
  uint32_t screen_width_ = 0, screen_height_ = 0;
  /** The clipboard without clipboard@0, or beside a program that holds it. */
  mutable std::string own_clipboard_;
  std::vector<GHOST_WindowDolly *> stack_;
  int32_t cursor_x_ = 0, cursor_y_ = 0;
  uint32_t modifiers_ = 0, buttons_ = 0;
  /** A wheel's movement that has not made a whole step. */
  float wheel_steps_ = 0.0f;
};
