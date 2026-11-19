/* SPDX-FileCopyrightText: 2026 Dolly
 *
 * SPDX-License-Identifier: GPL-2.0-or-later */

/** \file
 * \ingroup GHOST
 *
 * A drawing context for the GPU module's WebGPU backend on Dolly's gpu@0. It holds no device:
 * the backend opens gpu@0 and draws the window's frame, and presents it when the window's swap
 * buffer is released, through the callback it sets here.
 */

#pragma once

#include "GHOST_Context.hh"

#include <functional>

class GHOST_ContextWebGPU : public GHOST_Context {
 public:
  /** The window's size in pixels; zero for an off-screen context. */
  GHOST_ContextWebGPU(const GHOST_ContextParams &context_params, uint32_t width, uint32_t height)
      : GHOST_Context(context_params), width_(width), height_(height)
  {
  }

  GHOST_TSuccess swapBufferAcquire() override
  {
    return GHOST_kSuccess;
  }
  GHOST_TSuccess swapBufferRelease() override
  {
    if (swap_buffers_callback_) {
      swap_buffers_callback_();
    }
    return GHOST_kSuccess;
  }
  GHOST_TSuccess activateDrawingContext() override
  {
    active_context_ = this;
    return GHOST_kSuccess;
  }
  GHOST_TSuccess releaseDrawingContext() override
  {
    active_context_ = nullptr;
    return GHOST_kSuccess;
  }
  GHOST_TSuccess initializeDrawingContext() override
  {
    active_context_ = this;
    return GHOST_kSuccess;
  }
  GHOST_TSuccess releaseNativeHandles() override
  {
    return GHOST_kSuccess;
  }
  GHOST_TSuccess setWebGPUSwapBuffersCallback(std::function<void(void)> callback) override
  {
    swap_buffers_callback_ = std::move(callback);
    return GHOST_kSuccess;
  }
  GHOST_TSuccess getWebGPUSurfaceSize(uint32_t &r_width, uint32_t &r_height) override
  {
    r_width = width_;
    r_height = height_;
    return width_ ? GHOST_kSuccess : GHOST_kFailure;
  }
  /** The window's new size, which the backend's next frame takes. */
  void setSize(uint32_t width, uint32_t height)
  {
    width_ = width;
    height_ = height;
  }

 private:
  uint32_t width_, height_;
  std::function<void(void)> swap_buffers_callback_;
};
