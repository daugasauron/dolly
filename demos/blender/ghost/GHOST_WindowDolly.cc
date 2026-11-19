/* SPDX-FileCopyrightText: 2026 Dolly
 *
 * SPDX-License-Identifier: GPL-2.0-or-later */

/** \file
 * \ingroup GHOST
 */

#include "GHOST_WindowDolly.hh"
#include "GHOST_ContextWebGPU.hh"
#include "GHOST_SystemDolly.hh"

#include <dolly/display.h>

GHOST_WindowDolly::GHOST_WindowDolly(GHOST_SystemDolly *system,
                                     const char *title,
                                     uint32_t width,
                                     uint32_t height,
                                     GHOST_TWindowState state,
                                     bool is_dialog,
                                     GHOST_TDrawingContextType type,
                                     const GHOST_ContextParams &context_params)
    : GHOST_Window(width, height, state, context_params, false),
      system_(system),
      title_(title),
      state_(state),
      is_dialog_(is_dialog)
{
  full_screen_width_ = width;
  full_screen_height_ = height;
  setDrawingContextType(type);
}

GHOST_WindowDolly::~GHOST_WindowDolly()
{
  system_->windowClosed(this);
}

GHOST_Context *GHOST_WindowDolly::newDrawingContext(GHOST_TDrawingContextType type)
{
  if (type != GHOST_kDrawingContextTypeWebGPU) {
    return nullptr;
  }
  GHOST_Context *context = new GHOST_ContextWebGPU(
      want_context_params_, full_screen_width_, full_screen_height_);
  if (context->initializeDrawingContext()) {
    return context;
  }
  delete context;
  return nullptr;
}

void GHOST_WindowDolly::resize(uint32_t width, uint32_t height)
{
  full_screen_width_ = width;
  full_screen_height_ = height;
  if (GHOST_ContextWebGPU *context = dynamic_cast<GHOST_ContextWebGPU *>(getContext())) {
    context->setSize(width, height);
  }
}

void GHOST_WindowDolly::getClientBounds(GHOST_Rect &bounds) const
{
  bounds.l_ = 0;
  bounds.t_ = 0;
  bounds.r_ = int32_t(full_screen_width_);
  bounds.b_ = int32_t(full_screen_height_);
}

GHOST_TSuccess GHOST_WindowDolly::swapBufferRelease()
{
  if (system_->shownWindow() != this) {
    return GHOST_kSuccess;
  }
  return GHOST_Window::swapBufferRelease();
}

/* The CSS cursor nearest each of GHOST's, or none (GHOST_kFailure: Blender draws its own). */
static int css_cursor(GHOST_TStandardCursor shape)
{
  switch (shape) {
    case GHOST_kStandardCursorDefault:
    case GHOST_kStandardCursorRightArrow:
    case GHOST_kStandardCursorLeftArrow:
    case GHOST_kStandardCursorDestroy:
    case GHOST_kStandardCursorUpArrow:
    case GHOST_kStandardCursorDownArrow:
      return DOLLY_DISPLAY_CURSOR_DEFAULT;
    case GHOST_kStandardCursorInfo:
    case GHOST_kStandardCursorHelp:
      return DOLLY_DISPLAY_CURSOR_HELP;
    case GHOST_kStandardCursorWait:
      return DOLLY_DISPLAY_CURSOR_WAIT;
    case GHOST_kStandardCursorText:
      return DOLLY_DISPLAY_CURSOR_TEXT;
    case GHOST_kStandardCursorCrosshair:
    case GHOST_kStandardCursorCrosshairA:
    case GHOST_kStandardCursorCrosshairB:
    case GHOST_kStandardCursorCrosshairC:
    case GHOST_kStandardCursorPencil:
    case GHOST_kStandardCursorEraser:
    case GHOST_kStandardCursorKnife:
    case GHOST_kStandardCursorEyedropper:
      return DOLLY_DISPLAY_CURSOR_CROSSHAIR;
    case GHOST_kStandardCursorMove:
    case GHOST_kStandardCursorNSEWScroll:
    case GHOST_kStandardCursorHandOpen:
    case GHOST_kStandardCursorHandClosed:
      return DOLLY_DISPLAY_CURSOR_MOVE;
    case GHOST_kStandardCursorHandPoint:
      return DOLLY_DISPLAY_CURSOR_POINTER;
    case GHOST_kStandardCursorVerticalSplit:
    case GHOST_kStandardCursorEWScroll:
    case GHOST_kStandardCursorLeftRight:
    case GHOST_kStandardCursorLeftSide:
    case GHOST_kStandardCursorRightSide:
      return DOLLY_DISPLAY_CURSOR_EW_RESIZE;
    case GHOST_kStandardCursorHorizontalSplit:
    case GHOST_kStandardCursorNSScroll:
    case GHOST_kStandardCursorUpDown:
    case GHOST_kStandardCursorTopSide:
    case GHOST_kStandardCursorBottomSide:
      return DOLLY_DISPLAY_CURSOR_NS_RESIZE;
    case GHOST_kStandardCursorTopLeftCorner:
    case GHOST_kStandardCursorBottomRightCorner:
      return DOLLY_DISPLAY_CURSOR_NWSE_RESIZE;
    case GHOST_kStandardCursorTopRightCorner:
    case GHOST_kStandardCursorBottomLeftCorner:
      return DOLLY_DISPLAY_CURSOR_NESW_RESIZE;
    case GHOST_kStandardCursorStop:
      return DOLLY_DISPLAY_CURSOR_NOT_ALLOWED;
    default:
      return -1;
  }
}

GHOST_TSuccess GHOST_WindowDolly::hasCursorShape(GHOST_TStandardCursor shape)
{
  return css_cursor(shape) >= 0 ? GHOST_kSuccess : GHOST_kFailure;
}

GHOST_TSuccess GHOST_WindowDolly::setWindowCursorShape(GHOST_TStandardCursor shape)
{
  const int cursor = css_cursor(shape);
  if (cursor < 0) {
    return GHOST_kFailure;
  }
  shape_ = shape;
  if (getCursorVisibility()) {
    system_->setCursor(uint32_t(cursor));
  }
  return GHOST_kSuccess;
}

GHOST_TSuccess GHOST_WindowDolly::setWindowCursorVisibility(bool visible)
{
  system_->setCursor(visible ? uint32_t(css_cursor(shape_)) : DOLLY_DISPLAY_CURSOR_HIDDEN);
  return GHOST_kSuccess;
}
