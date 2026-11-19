/* SPDX-FileCopyrightText: 2026 Dolly
 *
 * SPDX-License-Identifier: GPL-2.0-or-later */

/** \file
 * \ingroup GHOST
 *
 * A window of GHOST_SystemDolly: the page's whole surface, drawn while it is the newest.
 */

#pragma once

#include "GHOST_Window.hh"

#include <string>

class GHOST_SystemDolly;

class GHOST_WindowDolly : public GHOST_Window {
 public:
  GHOST_WindowDolly(GHOST_SystemDolly *system,
                    const char *title,
                    uint32_t width,
                    uint32_t height,
                    GHOST_TWindowState state,
                    bool is_dialog,
                    GHOST_TDrawingContextType type,
                    const GHOST_ContextParams &context_params);
  ~GHOST_WindowDolly() override;

  bool isDialog() const override
  {
    return is_dialog_;
  }
  void setTitle(const char *title) override
  {
    title_ = title;
  }
  std::string getTitle() const override
  {
    return title_;
  }
  void getWindowBounds(GHOST_Rect &bounds) const override
  {
    getClientBounds(bounds);
  }
  void getClientBounds(GHOST_Rect &bounds) const override;
  GHOST_TSuccess setClientWidth(uint32_t /*width*/) override
  {
    return GHOST_kFailure;
  }
  GHOST_TSuccess setClientHeight(uint32_t /*height*/) override
  {
    return GHOST_kFailure;
  }
  GHOST_TSuccess setClientSize(uint32_t /*width*/, uint32_t /*height*/) override
  {
    return GHOST_kFailure;
  }
  void screenToClient(int32_t inX, int32_t inY, int32_t &outX, int32_t &outY) const override
  {
    outX = inX;
    outY = inY;
  }
  void clientToScreen(int32_t inX, int32_t inY, int32_t &outX, int32_t &outY) const override
  {
    outX = inX;
    outY = inY;
  }
  GHOST_TWindowState getState() const override
  {
    return state_;
  }
  GHOST_TSuccess setState(GHOST_TWindowState state) override
  {
    state_ = state;
    return GHOST_kSuccess;
  }
  GHOST_TSuccess setOrder(GHOST_TWindowOrder /*order*/) override
  {
    return GHOST_kSuccess;
  }
  GHOST_TSuccess invalidate() override
  {
    invalid_ = true;
    return GHOST_kSuccess;
  }
  /** Whether the window asked to be drawn since the last call. */
  bool takeInvalidation()
  {
    const bool invalid = invalid_;
    invalid_ = false;
    return invalid;
  }
  /** The page's new size: the window and its drawing context take it. */
  void resize(uint32_t width, uint32_t height);
  /** Only the window shown presents its frame. */
  GHOST_TSuccess swapBufferRelease() override;

 protected:
  GHOST_Context *newDrawingContext(GHOST_TDrawingContextType type) override;
  GHOST_TSuccess setWindowCursorVisibility(bool visible) override;
  GHOST_TSuccess setWindowCursorShape(GHOST_TStandardCursor shape) override;
  GHOST_TSuccess hasCursorShape(GHOST_TStandardCursor shape) override;
  GHOST_TSuccess setWindowCustomCursorShape(const uint8_t * /*bitmap*/,
                                            const uint8_t * /*mask*/,
                                            const int /*size*/[2],
                                            const int /*hot_spot*/[2],
                                            bool /*can_invert_color*/) override
  {
    /* The page shows CSS's cursors only. */
    return GHOST_kFailure;
  }

 private:
  GHOST_SystemDolly *system_;
  std::string title_;
  GHOST_TWindowState state_;
  bool is_dialog_;
  bool invalid_ = false;
  GHOST_TStandardCursor shape_ = GHOST_kStandardCursorDefault;
};
