/* SPDX-FileCopyrightText: 2026 Dolly
 *
 * SPDX-License-Identifier: GPL-2.0-or-later */

/** \file
 * \ingroup GHOST
 */

#include "GHOST_SystemDolly.hh"
#include "GHOST_ContextNone.hh"
#include "GHOST_ContextWebGPU.hh"
#include "GHOST_WindowDolly.hh"
#include "GHOST_WindowManager.hh"

#include "GHOST_EventButton.hh"
#include "GHOST_EventCursor.hh"
#include "GHOST_EventKey.hh"
#include "GHOST_EventWheel.hh"
#include "GHOST_TimerManager.hh"

#include <dolly/clipboard.h>
#include <dolly/display.h>
#include <dolly/input.h>

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>

GHOST_SystemDolly::GHOST_SystemDolly(bool background) : background_(background) {}

GHOST_SystemDolly::~GHOST_SystemDolly()
{
  if (clipboard_) {
    dolly_clipboard_release(clipboard_);
  }
  if (input_) {
    dolly_input_release(input_);
  }
  if (display_) {
    dolly_display_release(display_);
  }
}

GHOST_TSuccess GHOST_SystemDolly::init()
{
  return GHOST_System::init();
}

/* The page is taken by the first window: a background process (`blender -b`) never shows one. */
bool GHOST_SystemDolly::acquirePage()
{
  if (display_) {
    return true;
  }
  dolly_display_surface surface;
  int error = dolly_display_acquire(&surface);
  if (error != 0) {
    fprintf(stderr, "GHOST: Dolly's display: %s.\n", strerror(-error));
    return false;
  }
  display_ = surface.generation;
  screen_width_ = surface.width;
  screen_height_ = surface.height;
  error = dolly_input_acquire(&input_);
  if (error != 0) {
    fprintf(stderr, "GHOST: Dolly's input: %s.\n", strerror(-error));
    input_ = 0;
  }
  /* Without clipboard@0, or beside a program that holds it, the clipboard is Blender's own. */
  if (dolly_clipboard_acquire(&clipboard_) != 0) {
    clipboard_ = 0;
  }
  error = dolly_display_set_size(display_, screen_width_, screen_height_, &surface);
  if (error != 0) {
    fprintf(stderr, "GHOST: Dolly's display at %ux%u: %s.\n", screen_width_, screen_height_,
            strerror(-error));
  }
  return true;
}

GHOST_IWindow *GHOST_SystemDolly::createWindow(const char *title,
                                               int32_t /*left*/,
                                               int32_t /*top*/,
                                               uint32_t /*width*/,
                                               uint32_t /*height*/,
                                               GHOST_TWindowState state,
                                               GHOST_GPUSettings gpu_settings,
                                               const bool /*exclusive*/,
                                               const bool is_dialog,
                                               const GHOST_IWindow * /*parent_window*/)
{
  if (background_ || !acquirePage()) {
    return nullptr;
  }
  /* Every window is the page's size: the page has one surface. */
  GHOST_WindowDolly *window = new GHOST_WindowDolly(this,
                                                    title,
                                                    screen_width_,
                                                    screen_height_,
                                                    state,
                                                    is_dialog,
                                                    gpu_settings.context_type,
                                                    GHOST_CONTEXT_PARAMS_FROM_GPU_SETTINGS(
                                                        gpu_settings));
  if (!window->getValid()) {
    delete window;
    return nullptr;
  }
  stack_.push_back(window);
  window_manager_->addWindow(window);
  window_manager_->setActiveWindow(window);
  pushEvent(std::make_unique<GHOST_Event>(getMilliSeconds(), GHOST_kEventWindowSize, window));
  return window;
}

GHOST_WindowDolly *GHOST_SystemDolly::shownWindow() const
{
  return stack_.empty() ? nullptr : stack_.back();
}

/* The window below takes the page again and draws, as a desktop's would on its exposure. */
void GHOST_SystemDolly::windowClosed(GHOST_WindowDolly *window)
{
  const bool shown = window == shownWindow();
  stack_.erase(std::remove(stack_.begin(), stack_.end(), window), stack_.end());
  GHOST_WindowDolly *below = shownWindow();
  if (shown && below) {
    window_manager_->setActiveWindow(below);
    pushEvent(std::make_unique<GHOST_Event>(getMilliSeconds(), GHOST_kEventWindowActivate, below));
    pushEvent(std::make_unique<GHOST_Event>(getMilliSeconds(), GHOST_kEventWindowUpdate, below));
  }
}

void GHOST_SystemDolly::setCursor(uint32_t cursor) const
{
  if (display_) {
    dolly_display_set_cursor(display_, cursor);
  }
}

GHOST_IWindow *GHOST_SystemDolly::getWindowUnderCursor(int32_t /*x*/, int32_t /*y*/)
{
  return shownWindow();
}

GHOST_IContext *GHOST_SystemDolly::createOffscreenContext(GHOST_GPUSettings gpu_settings)
{
  const GHOST_ContextParams params = GHOST_CONTEXT_PARAMS_FROM_GPU_SETTINGS_OFFSCREEN(
      gpu_settings);
  GHOST_Context *context = nullptr;
  if (gpu_settings.context_type == GHOST_kDrawingContextTypeWebGPU) {
    context = new GHOST_ContextWebGPU(params, 0, 0);
  }
  else if (gpu_settings.context_type == GHOST_kDrawingContextTypeNone) {
    context = new GHOST_ContextNone(params);
  }
  if (context && context->initializeDrawingContext()) {
    return context;
  }
  delete context;
  return nullptr;
}

GHOST_TSuccess GHOST_SystemDolly::disposeContext(GHOST_IContext *context)
{
  delete context;
  return GHOST_kSuccess;
}

uint64_t GHOST_SystemDolly::getMilliSeconds() const
{
  timespec now;
  clock_gettime(CLOCK_MONOTONIC, &now);
  return uint64_t(now.tv_sec) * 1000 + uint64_t(now.tv_nsec) / 1000000;
}

void GHOST_SystemDolly::getMainDisplayDimensions(uint32_t &width, uint32_t &height) const
{
  width = screen_width_;
  height = screen_height_;
}

void GHOST_SystemDolly::getAllDisplayDimensions(uint32_t &width, uint32_t &height) const
{
  getMainDisplayDimensions(width, height);
}

GHOST_TSuccess GHOST_SystemDolly::getCursorPosition(int32_t &x, int32_t &y) const
{
  x = cursor_x_;
  y = cursor_y_;
  return GHOST_kSuccess;
}

/* Bits 0 to 7 of modifiers_ are GHOST's modifier keys, from the keys' own records. */
GHOST_TSuccess GHOST_SystemDolly::getModifierKeys(GHOST_ModifierKeys &keys) const
{
  for (int key = GHOST_kModifierKeyLeftShift; key <= GHOST_kModifierKeyRightOS; key++) {
    keys.set(GHOST_TModifierKey(key), (modifiers_ >> key) & 1);
  }
  return GHOST_kSuccess;
}

GHOST_TSuccess GHOST_SystemDolly::getButtons(GHOST_Buttons &buttons) const
{
  for (int button = GHOST_kButtonMaskLeft; button <= GHOST_kButtonMaskButton5; button++) {
    buttons.set(GHOST_TButton(button), (buttons_ >> button) & 1);
  }
  return GHOST_kSuccess;
}

GHOST_TCapabilityFlag GHOST_SystemDolly::getCapabilities() const
{
  return GHOST_TCapabilityFlag(
      GHOST_CAPABILITY_FLAG_ALL &
      ~(GHOST_kCapabilityWindowPosition | GHOST_kCapabilityCursorWarp |
        GHOST_kCapabilityClipboardPrimary | GHOST_kCapabilityClipboardImage |
        GHOST_kCapabilityDesktopSample | GHOST_kCapabilityInputIME |
        GHOST_kCapabilityWindowDecorationStyles | GHOST_kCapabilityKeyboardHyperKey |
        GHOST_kCapabilityCursorRGBA | GHOST_kCapabilityCursorGenerator |
        GHOST_kCapabilityMultiMonitorPlacement | GHOST_kCapabilityWindowPath |
        GHOST_kCapabilityGPUReadFrontBuffer | GHOST_kCapabilityTrackpadPhysicalDirection |
        GHOST_kCapabilityWindowDecorationServerSide));
}

/* The page's clipboard while Blender holds it (clipboard@0); its own otherwise. The caller
 * frees the copy. */
char *GHOST_SystemDolly::getClipboard(bool selection) const
{
  if (selection) {
    return nullptr;
  }
  if (clipboard_) {
    char *text = static_cast<char *>(malloc(DOLLY_CLIPBOARD_CAPACITY + 1));
    const int64_t length = dolly_clipboard_read(clipboard_, text, DOLLY_CLIPBOARD_CAPACITY);
    if (length >= 0) {
      text[std::min<int64_t>(length, DOLLY_CLIPBOARD_CAPACITY)] = '\0';
      return text;
    }
    free(text);
  }
  return strdup(own_clipboard_.c_str());
}

void GHOST_SystemDolly::putClipboard(const char *buffer, bool selection) const
{
  if (selection) {
    return;
  }
  own_clipboard_ = buffer;
  if (clipboard_) {
    const int error = dolly_clipboard_write(
        clipboard_, buffer, std::min<size_t>(strlen(buffer), DOLLY_CLIPBOARD_CAPACITY));
    if (error != 0) {
      fprintf(stderr, "GHOST: the clipboard took no copy: %s.\n", strerror(-error));
    }
  }
}

/* A browser KeyboardEvent's code, which names the key's place on a US keyboard. */
static GHOST_TKey key_from_code(const char *code)
{
  struct Name {
    const char *code;
    GHOST_TKey key;
  };
  static const Name names[] = {
      {"Backspace", GHOST_kKeyBackSpace},
      {"Tab", GHOST_kKeyTab},
      {"Enter", GHOST_kKeyEnter},
      {"Escape", GHOST_kKeyEsc},
      {"Space", GHOST_kKeySpace},
      {"Quote", GHOST_kKeyQuote},
      {"Comma", GHOST_kKeyComma},
      {"Minus", GHOST_kKeyMinus},
      {"Period", GHOST_kKeyPeriod},
      {"Slash", GHOST_kKeySlash},
      {"Semicolon", GHOST_kKeySemicolon},
      {"Equal", GHOST_kKeyEqual},
      {"BracketLeft", GHOST_kKeyLeftBracket},
      {"BracketRight", GHOST_kKeyRightBracket},
      {"Backslash", GHOST_kKeyBackslash},
      {"Backquote", GHOST_kKeyAccentGrave},
      {"IntlBackslash", GHOST_kKeyGrLess},
      {"ShiftLeft", GHOST_kKeyLeftShift},
      {"ShiftRight", GHOST_kKeyRightShift},
      {"ControlLeft", GHOST_kKeyLeftControl},
      {"ControlRight", GHOST_kKeyRightControl},
      {"AltLeft", GHOST_kKeyLeftAlt},
      {"AltRight", GHOST_kKeyRightAlt},
      {"MetaLeft", GHOST_kKeyLeftOS},
      {"MetaRight", GHOST_kKeyRightOS},
      {"ContextMenu", GHOST_kKeyApp},
      {"CapsLock", GHOST_kKeyCapsLock},
      {"NumLock", GHOST_kKeyNumLock},
      {"ScrollLock", GHOST_kKeyScrollLock},
      {"ArrowLeft", GHOST_kKeyLeftArrow},
      {"ArrowRight", GHOST_kKeyRightArrow},
      {"ArrowUp", GHOST_kKeyUpArrow},
      {"ArrowDown", GHOST_kKeyDownArrow},
      {"PrintScreen", GHOST_kKeyPrintScreen},
      {"Pause", GHOST_kKeyPause},
      {"Insert", GHOST_kKeyInsert},
      {"Delete", GHOST_kKeyDelete},
      {"Home", GHOST_kKeyHome},
      {"End", GHOST_kKeyEnd},
      {"PageUp", GHOST_kKeyUpPage},
      {"PageDown", GHOST_kKeyDownPage},
      {"NumpadDecimal", GHOST_kKeyNumpadPeriod},
      {"NumpadEnter", GHOST_kKeyNumpadEnter},
      {"NumpadAdd", GHOST_kKeyNumpadPlus},
      {"NumpadSubtract", GHOST_kKeyNumpadMinus},
      {"NumpadMultiply", GHOST_kKeyNumpadAsterisk},
      {"NumpadDivide", GHOST_kKeyNumpadSlash},
      {"MediaPlayPause", GHOST_kKeyMediaPlay},
      {"MediaStop", GHOST_kKeyMediaStop},
      {"MediaTrackPrevious", GHOST_kKeyMediaFirst},
      {"MediaTrackNext", GHOST_kKeyMediaLast},
  };
  if (strncmp(code, "Key", 3) == 0 && code[3] >= 'A' && code[3] <= 'Z' && !code[4]) {
    return GHOST_TKey(GHOST_kKeyA + (code[3] - 'A'));
  }
  if (strncmp(code, "Digit", 5) == 0 && code[5] >= '0' && code[5] <= '9' && !code[6]) {
    return GHOST_TKey(GHOST_kKey0 + (code[5] - '0'));
  }
  if (strncmp(code, "Numpad", 6) == 0 && code[6] >= '0' && code[6] <= '9' && !code[7]) {
    return GHOST_TKey(GHOST_kKeyNumpad0 + (code[6] - '0'));
  }
  if (code[0] == 'F' && code[1] >= '1' && code[1] <= '9') {
    const int number = atoi(code + 1);
    if (number >= 1 && number <= 24) {
      return GHOST_TKey(GHOST_kKeyF1 + number - 1);
    }
  }
  for (const Name &name : names) {
    if (strcmp(code, name.code) == 0) {
      return name.key;
    }
  }
  return GHOST_kKeyUnknown;
}

/* The key a record names: a letter by the layout's letter (an AZERTY keyboard's A is A), as
 * GHOST's X11 system takes it from the key's symbol, anything else by its place. */
static GHOST_TKey key_of(const char *key, const char *code)
{
  if (key[0] && !key[1] && ((key[0] >= 'a' && key[0] <= 'z') || (key[0] >= 'A' && key[0] <= 'Z')))
  {
    return GHOST_TKey(GHOST_kKeyA + ((key[0] | 0x20) - 'a'));
  }
  return key_from_code(code);
}

static int modifier_bit(GHOST_TKey key)
{
  switch (key) {
    case GHOST_kKeyLeftShift:
      return GHOST_kModifierKeyLeftShift;
    case GHOST_kKeyRightShift:
      return GHOST_kModifierKeyRightShift;
    case GHOST_kKeyLeftControl:
      return GHOST_kModifierKeyLeftControl;
    case GHOST_kKeyRightControl:
      return GHOST_kModifierKeyRightControl;
    case GHOST_kKeyLeftAlt:
      return GHOST_kModifierKeyLeftAlt;
    case GHOST_kKeyRightAlt:
      return GHOST_kModifierKeyRightAlt;
    case GHOST_kKeyLeftOS:
      return GHOST_kModifierKeyLeftOS;
    case GHOST_kKeyRightOS:
      return GHOST_kModifierKeyRightOS;
    default:
      return -1;
  }
}

/* A record's modifier bits clear the sides of a modifier no longer held (its release may have
 * gone to another page while this one had no focus). */
void GHOST_SystemDolly::setModifiers(uint32_t modifiers)
{
  struct Pair {
    uint32_t bit;
    int left, right;
  };
  static const Pair pairs[] = {
      {DOLLY_INPUT_MOD_SHIFT, GHOST_kModifierKeyLeftShift, GHOST_kModifierKeyRightShift},
      {DOLLY_INPUT_MOD_CONTROL, GHOST_kModifierKeyLeftControl, GHOST_kModifierKeyRightControl},
      {DOLLY_INPUT_MOD_ALT, GHOST_kModifierKeyLeftAlt, GHOST_kModifierKeyRightAlt},
      {DOLLY_INPUT_MOD_META, GHOST_kModifierKeyLeftOS, GHOST_kModifierKeyRightOS},
  };
  for (const Pair &pair : pairs) {
    if (!(modifiers & pair.bit)) {
      modifiers_ &= ~((1u << pair.left) | (1u << pair.right));
    }
    else if (!(modifiers_ & ((1u << pair.left) | (1u << pair.right)))) {
      modifiers_ |= 1u << pair.left;
    }
  }
}

void GHOST_SystemDolly::readKey(const dolly_input_event &event)
{
  char key[32] = {}, code[32] = {};
  if (size_t(event.key_length) + event.code_length > sizeof(event.data)) {
    return;
  }
  memcpy(key, event.data, std::min<size_t>(event.key_length, sizeof(key) - 1));
  memcpy(code, event.data + event.key_length, std::min<size_t>(event.code_length, sizeof(code) - 1));
  const GHOST_TKey ghost_key = key_of(key, code);
  const bool pressed = event.action != DOLLY_KEY_ACTION_RELEASE;
  const int bit = modifier_bit(ghost_key);
  setModifiers(event.modifiers);
  if (bit >= 0) {
    modifiers_ = pressed ? modifiers_ | (1u << bit) : modifiers_ & ~(1u << bit);
  }
  /* A key that writes one character carries it; text a composition makes comes as TEXT. */
  char utf8[sizeof(GHOST_TEventKeyData::utf8_buf)] = {};
  const size_t key_length = strlen(key);
  const uint8_t lead = uint8_t(key[0]);
  const size_t character_length = lead < 0x80 ? 1 : lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : 2;
  const bool one_character = key_length > 0 && key_length == character_length;
  if (pressed && one_character && !(event.flags & DOLLY_INPUT_FLAG_COMPOSING) &&
      !(event.modifiers & (DOLLY_INPUT_MOD_CONTROL | DOLLY_INPUT_MOD_META)))
  {
    memcpy(utf8, key, key_length);
  }
  if (ghost_key == GHOST_kKeyUnknown && !utf8[0]) {
    return;
  }
  pushEvent(std::make_unique<GHOST_EventKey>(getMilliSeconds(),
                                             pressed ? GHOST_kEventKeyDown : GHOST_kEventKeyUp,
                                             shownWindow(),
                                             ghost_key,
                                             event.action == DOLLY_KEY_ACTION_REPEAT,
                                             utf8));
}

/* Composed or pasted text: a key press of no key for each character, as GHOST's X11 system
 * sends what an input method commits. */
void GHOST_SystemDolly::readText(const dolly_input_event &event)
{
  const size_t offset = size_t(event.key_length) + event.code_length;
  if (offset + event.text_length > sizeof(event.data)) {
    return;
  }
  const uint8_t *text = event.data + offset;
  for (size_t at = 0; at < event.text_length;) {
    size_t length = 1;
    while (at + length < event.text_length && (text[at + length] & 0xc0) == 0x80) {
      length++;
    }
    char utf8[sizeof(GHOST_TEventKeyData::utf8_buf)] = {};
    if (length <= sizeof(utf8)) {
      memcpy(utf8, text + at, length);
      for (const GHOST_TEventType type : {GHOST_kEventKeyDown, GHOST_kEventKeyUp}) {
        pushEvent(std::make_unique<GHOST_EventKey>(getMilliSeconds(),
                                                   type,
                                                   shownWindow(),
                                                   GHOST_kKeyUnknown,
                                                   false,
                                                   type == GHOST_kEventKeyDown ? utf8 : nullptr));
      }
    }
    at += length;
  }
}

void GHOST_SystemDolly::readPointer(const dolly_input_event &event)
{
  static const GHOST_TButton buttons[] = {GHOST_kButtonMaskLeft,
                                          GHOST_kButtonMaskMiddle,
                                          GHOST_kButtonMaskRight,
                                          GHOST_kButtonMaskButton4,
                                          GHOST_kButtonMaskButton5};
  GHOST_WindowDolly *window = shownWindow();
  setModifiers(event.modifiers);
  if (event.x != cursor_x_ || event.y != cursor_y_) {
    cursor_x_ = event.x;
    cursor_y_ = event.y;
    pushEvent(std::make_unique<GHOST_EventCursor>(getMilliSeconds(),
                                                  GHOST_kEventCursorMove,
                                                  window,
                                                  cursor_x_,
                                                  cursor_y_,
                                                  GHOST_TABLET_DATA_NONE));
  }
  const unsigned button = (event.flags >> 8) & 7;
  if (event.action == DOLLY_POINTER_ACTION_DRAG || button >= std::size(buttons)) {
    return;
  }
  const bool pressed = event.action == DOLLY_POINTER_ACTION_PRESS;
  buttons_ = pressed ? buttons_ | (1u << buttons[button]) : buttons_ & ~(1u << buttons[button]);
  pushEvent(std::make_unique<GHOST_EventButton>(getMilliSeconds(),
                                                pressed ? GHOST_kEventButtonDown :
                                                          GHOST_kEventButtonUp,
                                                window,
                                                buttons[button],
                                                GHOST_TABLET_DATA_NONE));
}

/* A wheel step is a line: 26 CSS pixels make one and 30 lines a page, as Dolly's SDL port counts
 * them. The record's y is thousandths of its unit, positive toward later content; GHOST's steps
 * are positive away from the user. */
void GHOST_SystemDolly::readScroll(const dolly_input_event &event)
{
  float steps = event.y / 1000.0f;
  if (event.action == DOLLY_SCROLL_UNIT_PIXEL) {
    steps /= 26.0f;
  }
  else if (event.action == DOLLY_SCROLL_UNIT_PAGE) {
    steps *= 30.0f;
  }
  wheel_steps_ += steps;
  const int32_t whole = int32_t(wheel_steps_);
  if (whole == 0) {
    return;
  }
  wheel_steps_ -= whole;
  pushEvent(std::make_unique<GHOST_EventWheel>(
      getMilliSeconds(), shownWindow(), GHOST_kEventWheelAxisVertical, -whole));
}

void GHOST_SystemDolly::readEvent(const dolly_input_event &event)
{
  GHOST_WindowDolly *window = shownWindow();
  if (!window) {
    return;
  }
  switch (event.type) {
    case DOLLY_INPUT_EVENT_KEY:
      readKey(event);
      break;
    case DOLLY_INPUT_EVENT_TEXT:
      readText(event);
      break;
    case DOLLY_INPUT_EVENT_POINTER:
      readPointer(event);
      break;
    case DOLLY_INPUT_EVENT_SCROLL:
      readScroll(event);
      break;
    case DOLLY_INPUT_EVENT_FOCUS:
      if (event.action) {
        window_manager_->setActiveWindow(window);
        pushEvent(
            std::make_unique<GHOST_Event>(getMilliSeconds(), GHOST_kEventWindowActivate, window));
        /* After a program Blender ran had the page, its last frame shows until Blender draws. */
        pushEvent(
            std::make_unique<GHOST_Event>(getMilliSeconds(), GHOST_kEventWindowUpdate, window));
      }
      else {
        window_manager_->setWindowInactive(window);
        pushEvent(std::make_unique<GHOST_Event>(
            getMilliSeconds(), GHOST_kEventWindowDeactivate, window));
      }
      break;
    case DOLLY_INPUT_EVENT_DROPPED:
      /* Records were lost: let go of what was held. */
      modifiers_ = 0;
      buttons_ = 0;
      break;
  }
}

/* Records, then timers; waiting for either when asked to. */
bool GHOST_SystemDolly::processEvents(bool waitForEvent)
{
  bool any = false;
  do {
    dolly_input_event event;
    if (waitForEvent && input_) {
      const uint64_t next = getTimerManager()->nextFireTime();
      const double timeout = next == GHOST_kFireTimeNever ?
                                 -1.0 :
                                 double(std::max<int64_t>(int64_t(next - getMilliSeconds()), 0));
      if (dolly_input_next_event(input_, &event, timeout) > 0) {
        readEvent(event);
        any = true;
      }
    }
    if (getTimerManager()->fireTimers(getMilliSeconds())) {
      any = true;
    }
    while (input_ && dolly_input_next_event(input_, &event, 0) > 0) {
      readEvent(event);
      any = true;
    }
    for (GHOST_WindowDolly *window : stack_) {
      if (window->takeInvalidation()) {
        pushEvent(
            std::make_unique<GHOST_Event>(getMilliSeconds(), GHOST_kEventWindowUpdate, window));
        any = true;
      }
    }
  } while (waitForEvent && !any && input_);
  return any;
}
