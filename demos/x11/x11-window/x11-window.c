// A program's window on Dolly's X server, giving input@0's records
// (x11-window.h).
#include "x11-window.h"

#include <X11/Xatom.h>
#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/cursorfont.h>
#include <X11/keysym.h>
#include <dolly/display-abi.h>
#include <errno.h>
#include <poll.h>
#include <stdlib.h>
#include <string.h>

struct x11_window {
  Display *display;
  Window window;
  GC gc;
  Atom delete_window;
  uint32_t width, height;
  // The last frame, the server's byte order (blue first), shown again on Expose.
  XImage *frame;
  Cursor cursor;
  uint32_t cursor_shape;
};

// The code a browser's KeyboardEvent gives each key, by its evdev number: the
// X server's keycode less 8 (Dolly's Xsdl uses the evdev keymap).
static const char *const codes[] = {
  [1] = "Escape", [2] = "Digit1", [3] = "Digit2", [4] = "Digit3", [5] = "Digit4", [6] = "Digit5",
  [7] = "Digit6", [8] = "Digit7", [9] = "Digit8", [10] = "Digit9", [11] = "Digit0", [12] = "Minus",
  [13] = "Equal", [14] = "Backspace", [15] = "Tab", [16] = "KeyQ", [17] = "KeyW", [18] = "KeyE",
  [19] = "KeyR", [20] = "KeyT", [21] = "KeyY", [22] = "KeyU", [23] = "KeyI", [24] = "KeyO",
  [25] = "KeyP", [26] = "BracketLeft", [27] = "BracketRight", [28] = "Enter", [29] = "ControlLeft",
  [30] = "KeyA", [31] = "KeyS", [32] = "KeyD", [33] = "KeyF", [34] = "KeyG", [35] = "KeyH",
  [36] = "KeyJ", [37] = "KeyK", [38] = "KeyL", [39] = "Semicolon", [40] = "Quote", [41] = "Backquote",
  [42] = "ShiftLeft", [43] = "Backslash", [44] = "KeyZ", [45] = "KeyX", [46] = "KeyC", [47] = "KeyV",
  [48] = "KeyB", [49] = "KeyN", [50] = "KeyM", [51] = "Comma", [52] = "Period", [53] = "Slash",
  [54] = "ShiftRight", [55] = "NumpadMultiply", [56] = "AltLeft", [57] = "Space", [58] = "CapsLock",
  [59] = "F1", [60] = "F2", [61] = "F3", [62] = "F4", [63] = "F5", [64] = "F6", [65] = "F7",
  [66] = "F8", [67] = "F9", [68] = "F10", [69] = "NumLock", [70] = "ScrollLock", [71] = "Numpad7",
  [72] = "Numpad8", [73] = "Numpad9", [74] = "NumpadSubtract", [75] = "Numpad4", [76] = "Numpad5",
  [77] = "Numpad6", [78] = "NumpadAdd", [79] = "Numpad1", [80] = "Numpad2", [81] = "Numpad3",
  [82] = "Numpad0", [83] = "NumpadDecimal", [86] = "IntlBackslash", [87] = "F11", [88] = "F12",
  [96] = "NumpadEnter", [97] = "ControlRight", [98] = "NumpadDivide", [99] = "PrintScreen",
  [100] = "AltRight", [102] = "Home", [103] = "ArrowUp", [104] = "PageUp", [105] = "ArrowLeft",
  [106] = "ArrowRight", [107] = "End", [108] = "ArrowDown", [109] = "PageDown", [110] = "Insert",
  [111] = "Delete", [119] = "Pause", [125] = "MetaLeft", [126] = "MetaRight", [127] = "ContextMenu",
};

// The key a browser names a keysym that writes no character.
static const struct { KeySym keysym; const char *key; } named[] = {
  {XK_Escape, "Escape"}, {XK_Return, "Enter"}, {XK_KP_Enter, "Enter"}, {XK_Tab, "Tab"},
  {XK_ISO_Left_Tab, "Tab"}, {XK_BackSpace, "Backspace"}, {XK_Delete, "Delete"}, {XK_KP_Delete, "Delete"},
  {XK_Insert, "Insert"}, {XK_KP_Insert, "Insert"}, {XK_Home, "Home"}, {XK_KP_Home, "Home"},
  {XK_End, "End"}, {XK_KP_End, "End"}, {XK_Page_Up, "PageUp"}, {XK_KP_Page_Up, "PageUp"},
  {XK_Page_Down, "PageDown"}, {XK_KP_Page_Down, "PageDown"}, {XK_Left, "ArrowLeft"},
  {XK_KP_Left, "ArrowLeft"}, {XK_Right, "ArrowRight"}, {XK_KP_Right, "ArrowRight"}, {XK_Up, "ArrowUp"},
  {XK_KP_Up, "ArrowUp"}, {XK_Down, "ArrowDown"}, {XK_KP_Down, "ArrowDown"}, {XK_KP_Begin, "Clear"},
  {XK_Shift_L, "Shift"}, {XK_Shift_R, "Shift"}, {XK_Control_L, "Control"}, {XK_Control_R, "Control"},
  {XK_Alt_L, "Alt"}, {XK_Alt_R, "Alt"}, {XK_Meta_L, "Meta"}, {XK_Meta_R, "Meta"}, {XK_Super_L, "Meta"},
  {XK_Super_R, "Meta"}, {XK_ISO_Level3_Shift, "AltGraph"}, {XK_Caps_Lock, "CapsLock"},
  {XK_Num_Lock, "NumLock"}, {XK_Scroll_Lock, "ScrollLock"}, {XK_Pause, "Pause"}, {XK_Print, "PrintScreen"},
  {XK_Menu, "ContextMenu"}, {XK_F1, "F1"}, {XK_F2, "F2"}, {XK_F3, "F3"}, {XK_F4, "F4"}, {XK_F5, "F5"},
  {XK_F6, "F6"}, {XK_F7, "F7"}, {XK_F8, "F8"}, {XK_F9, "F9"}, {XK_F10, "F10"}, {XK_F11, "F11"},
  {XK_F12, "F12"},
};

// The X cursor font's shape for each DOLLY_DISPLAY_CURSOR_*, by value; hidden is a blank cursor.
static const unsigned cursor_shapes[] = {
  [DOLLY_DISPLAY_CURSOR_TEXT] = XC_xterm, [DOLLY_DISPLAY_CURSOR_DEFAULT] = XC_left_ptr,
  [DOLLY_DISPLAY_CURSOR_CROSSHAIR] = XC_crosshair, [DOLLY_DISPLAY_CURSOR_POINTER] = XC_hand2,
  [DOLLY_DISPLAY_CURSOR_NS_RESIZE] = XC_sb_v_double_arrow, [DOLLY_DISPLAY_CURSOR_EW_RESIZE] = XC_sb_h_double_arrow,
  [DOLLY_DISPLAY_CURSOR_NWSE_RESIZE] = XC_bottom_right_corner, [DOLLY_DISPLAY_CURSOR_NESW_RESIZE] = XC_bottom_left_corner,
  [DOLLY_DISPLAY_CURSOR_MOVE] = XC_fleur, [DOLLY_DISPLAY_CURSOR_WAIT] = XC_watch,
  [DOLLY_DISPLAY_CURSOR_PROGRESS] = XC_watch, [DOLLY_DISPLAY_CURSOR_NOT_ALLOWED] = XC_X_cursor,
  [DOLLY_DISPLAY_CURSOR_HELP] = XC_question_arrow,
};

const char *x11_window_display(void) {
  const char *display = getenv("DISPLAY");
  return display != NULL && strchr(display, ':') != NULL ? display : NULL;
}

x11_window *x11_window_open(const char *title, uint32_t width, uint32_t height) {
  if (x11_window_display() == NULL) {
    errno = ENOENT;
    return NULL;
  }
  Display *display = XOpenDisplay(NULL);
  if (display == NULL) {
    errno = ECONNREFUSED;
    return NULL;
  }
  x11_window *window = calloc(1, sizeof(*window));
  if (window == NULL) {
    XCloseDisplay(display);
    errno = ENOMEM;
    return NULL;
  }
  const int screen = DefaultScreen(display);
  window->display = display;
  window->width = width;
  window->height = height;
  window->cursor_shape = DOLLY_DISPLAY_CURSOR_DEFAULT;
  // Centred on the screen, a place the window manager takes as the user's (USPosition), as SDL's
  // X11 driver places a window: twm would otherwise have the user place it.
  XSizeHints hints = {0};
  hints.flags = USPosition | USSize;
  hints.width = (int)width;
  hints.height = (int)height;
  hints.x = DisplayWidth(display, screen) > (int)width ? (DisplayWidth(display, screen) - (int)width) / 2 : 0;
  hints.y = DisplayHeight(display, screen) > (int)height ? (DisplayHeight(display, screen) - (int)height) / 2 : 0;
  window->window = XCreateSimpleWindow(display, RootWindow(display, screen), hints.x, hints.y, width, height, 0,
                                       BlackPixel(display, screen), BlackPixel(display, screen));
  XSetWMNormalHints(display, window->window, &hints);
  XSelectInput(display, window->window, KeyPressMask | KeyReleaseMask | ButtonPressMask |
               ButtonReleaseMask | PointerMotionMask | EnterWindowMask | LeaveWindowMask |
               FocusChangeMask | StructureNotifyMask | ExposureMask);
  window->delete_window = XInternAtom(display, "WM_DELETE_WINDOW", False);
  XSetWMProtocols(display, window->window, &window->delete_window, 1);
  window->gc = XCreateGC(display, window->window, 0, NULL);
  x11_window_set_title(window, title);
  XMapWindow(display, window->window);
  XFlush(display);
  return window;
}

void x11_window_close(x11_window *window) {
  if (window == NULL) return;
  if (window->frame) XDestroyImage(window->frame);
  if (window->cursor) XFreeCursor(window->display, window->cursor);
  XFreeGC(window->display, window->gc);
  XDestroyWindow(window->display, window->window);
  XCloseDisplay(window->display);
  free(window);
}

void x11_window_set_title(x11_window *window, const char *title) {
  const int length = (int)strlen(title);
  XStoreName(window->display, window->window, title);
  XChangeProperty(window->display, window->window, XInternAtom(window->display, "_NET_WM_NAME", False),
                  XInternAtom(window->display, "UTF8_STRING", False), 8, PropModeReplace,
                  (const unsigned char *)title, length);
  XFlush(window->display);
}

void x11_window_resize(x11_window *window, uint32_t width, uint32_t height) {
  XResizeWindow(window->display, window->window, width, height);
  XFlush(window->display);
}

void x11_window_size(const x11_window *window, uint32_t *width, uint32_t *height) {
  *width = window->width;
  *height = window->height;
}

void x11_window_screen_size(const x11_window *window, uint32_t *width, uint32_t *height) {
  const int screen = DefaultScreen(window->display);
  *width = (uint32_t)DisplayWidth(window->display, screen);
  *height = (uint32_t)DisplayHeight(window->display, screen);
}

void x11_window_set_cursor(x11_window *window, uint32_t shape) {
  if (shape == window->cursor_shape || shape >= sizeof(cursor_shapes) / sizeof(*cursor_shapes)) return;
  Cursor cursor;
  if (shape == DOLLY_DISPLAY_CURSOR_HIDDEN) {
    static const char blank[1] = {0};
    Pixmap pixmap = XCreateBitmapFromData(window->display, window->window, blank, 1, 1);
    XColor black = {0};
    cursor = XCreatePixmapCursor(window->display, pixmap, pixmap, &black, &black, 0, 0);
    XFreePixmap(window->display, pixmap);
  } else {
    cursor = XCreateFontCursor(window->display, cursor_shapes[shape]);
  }
  XDefineCursor(window->display, window->window, cursor);
  if (window->cursor) XFreeCursor(window->display, window->cursor);
  window->cursor = cursor;
  window->cursor_shape = shape;
  XFlush(window->display);
}

static void show_frame(x11_window *window) {
  if (window->frame == NULL) return;
  XPutImage(window->display, window->window, window->gc, window->frame, 0, 0, 0, 0,
            window->frame->width, window->frame->height);
  XFlush(window->display);
}

int x11_window_present(x11_window *window, const void *pixels, uint32_t width, uint32_t height,
                       size_t stride, int rgba) {
  if (width == 0 || height == 0 || stride < (size_t)width * 4) return -EINVAL;
  XImage *frame = window->frame;
  if (frame == NULL || (uint32_t)frame->width != width || (uint32_t)frame->height != height) {
    if (frame) XDestroyImage(frame);
    window->frame = NULL;
    char *data = malloc((size_t)width * height * 4);
    if (data == NULL) return -ENOMEM;
    const int screen = DefaultScreen(window->display);
    frame = XCreateImage(window->display, DefaultVisual(window->display, screen), 24, ZPixmap, 0, data,
                         width, height, 32, (int)width * 4);
    if (frame == NULL) {
      free(data);
      return -ENOMEM;
    }
    window->frame = frame;
  }
  // The server's pixels are words of its visual's masks, least significant byte first: red
  // first where red is the low byte (Dolly's Xsdl, on the page's RGBA surface), blue first else.
  const int same = rgba == (frame->red_mask == 0xff);
  for (uint32_t y = 0; y < height; y++) {
    const unsigned char *from = (const unsigned char *)pixels + y * stride;
    unsigned char *to = (unsigned char *)frame->data + (size_t)y * width * 4;
    if (same) {
      memcpy(to, from, (size_t)width * 4);
      continue;
    }
    for (uint32_t x = 0; x < width; x++, from += 4, to += 4) {
      to[0] = from[2];
      to[1] = from[1];
      to[2] = from[0];
      to[3] = from[3];
    }
  }
  show_frame(window);
  return 0;
}

static uint32_t modifiers(unsigned state) {
  return (state & ShiftMask ? DOLLY_INPUT_MOD_SHIFT : 0) | (state & ControlMask ? DOLLY_INPUT_MOD_CONTROL : 0) |
         (state & Mod1Mask ? DOLLY_INPUT_MOD_ALT : 0) | (state & Mod4Mask ? DOLLY_INPUT_MOD_META : 0) |
         (state & LockMask ? DOLLY_INPUT_MOD_CAPS_LOCK : 0) | (state & Mod2Mask ? DOLLY_INPUT_MOD_NUM_LOCK : 0);
}

// Appends a string to the record's data; zero when it does not fit.
static int append(dolly_input_event *event, size_t *used, const char *text, size_t length) {
  if (*used + length > sizeof(event->data)) return 0;
  memcpy(event->data + *used, text, length);
  *used += length;
  return 1;
}

// A keysym's character as UTF-8, or zero bytes for none: Latin-1 keysyms are
// their character, and 0x01000000 plus a code point is that code point.
static size_t keysym_utf8(KeySym keysym, char out[4]) {
  uint32_t point = keysym >= 0x20 && keysym <= 0x7e ? keysym
      : keysym >= 0xa0 && keysym <= 0xff ? keysym
      : (keysym & 0xff000000) == 0x01000000 ? (uint32_t)(keysym & 0x00ffffff) : 0;
  if (keysym >= XK_KP_0 && keysym <= XK_KP_9) point = '0' + (uint32_t)(keysym - XK_KP_0);
  if (keysym == XK_KP_Decimal) point = '.';
  if (keysym == XK_KP_Add) point = '+';
  if (keysym == XK_KP_Subtract) point = '-';
  if (keysym == XK_KP_Multiply) point = '*';
  if (keysym == XK_KP_Divide) point = '/';
  if (keysym == XK_KP_Space) point = ' ';
  if (point == 0 || point > 0x10ffff) return 0;
  if (point < 0x80) { out[0] = (char)point; return 1; }
  if (point < 0x800) { out[0] = (char)(0xc0 | point >> 6); out[1] = (char)(0x80 | (point & 0x3f)); return 2; }
  if (point < 0x10000) {
    out[0] = (char)(0xe0 | point >> 12); out[1] = (char)(0x80 | (point >> 6 & 0x3f));
    out[2] = (char)(0x80 | (point & 0x3f));
    return 3;
  }
  out[0] = (char)(0xf0 | point >> 18); out[1] = (char)(0x80 | (point >> 12 & 0x3f));
  out[2] = (char)(0x80 | (point >> 6 & 0x3f)); out[3] = (char)(0x80 | (point & 0x3f));
  return 4;
}

static void key_record(XKeyEvent *key, uint32_t action, dolly_input_event *event) {
  memset(event, 0, sizeof(*event));
  event->type = DOLLY_INPUT_EVENT_KEY;
  event->action = action;
  event->modifiers = modifiers(key->state);
  KeySym keysym = NoSymbol;
  char latin1[8];
  XLookupString(key, latin1, sizeof(latin1), &keysym, NULL);
  const char *name = NULL;
  for (size_t i = 0; i < sizeof(named) / sizeof(*named) && name == NULL; i++) {
    if (named[i].keysym == keysym) name = named[i].key;
  }
  char character[4];
  const size_t character_length = name ? 0 : keysym_utf8(keysym, character);
  size_t used = 0;
  if (name) append(event, &used, name, strlen(name));
  else if (character_length) append(event, &used, character, character_length);
  else append(event, &used, "Unidentified", 12);
  event->key_length = (uint16_t)used;
  const unsigned evdev = key->keycode >= 8 ? key->keycode - 8 : 0;
  const char *code = evdev < sizeof(codes) / sizeof(*codes) && codes[evdev] ? codes[evdev] : "Unidentified";
  append(event, &used, code, strlen(code));
  event->code_length = (uint16_t)(used - event->key_length);
}

static void pointer_record(int x, int y, unsigned state, uint32_t action, unsigned button, dolly_input_event *event) {
  memset(event, 0, sizeof(*event));
  event->type = DOLLY_INPUT_EVENT_POINTER;
  event->action = action;
  event->modifiers = modifiers(state);
  event->flags = button << 8;
  event->x = x < 0 ? 0 : x;
  event->y = y < 0 ? 0 : y;
}

// One X event as a record; zero for an event that is none.
static int translate(x11_window *window, XEvent *x, dolly_input_event *event) {
  switch (x->type) {
    case KeyPress:
      key_record(&x->xkey, DOLLY_KEY_ACTION_PRESS, event);
      return 1;
    case KeyRelease:
      // X repeats a held key as a release and a press of the same time: a repeat.
      if (XEventsQueued(window->display, QueuedAfterReading)) {
        XEvent next;
        XPeekEvent(window->display, &next);
        if (next.type == KeyPress && next.xkey.time == x->xkey.time && next.xkey.keycode == x->xkey.keycode) {
          XNextEvent(window->display, &next);
          key_record(&next.xkey, DOLLY_KEY_ACTION_REPEAT, event);
          return 1;
        }
      }
      key_record(&x->xkey, DOLLY_KEY_ACTION_RELEASE, event);
      return 1;
    case ButtonPress:
    case ButtonRelease: {
      const unsigned button = x->xbutton.button;
      if (button >= 4 && button <= 7) {
        if (x->type == ButtonRelease || button >= 6) return 0;
        memset(event, 0, sizeof(*event));
        event->type = DOLLY_INPUT_EVENT_SCROLL;
        event->action = DOLLY_SCROLL_UNIT_LINE;
        event->modifiers = modifiers(x->xbutton.state);
        event->y = button == 4 ? -1000 : 1000;
        return 1;
      }
      // X's buttons 1, 2, 3, 8 and 9 are a browser's 0 (primary), 1, 2, 3 and 4.
      static const unsigned buttons[] = {0, 0, 1, 2, 0, 0, 0, 0, 3, 4};
      if (button >= sizeof(buttons) / sizeof(*buttons) || (button > 3 && button < 8)) return 0;
      pointer_record(x->xbutton.x, x->xbutton.y, x->xbutton.state,
                     x->type == ButtonPress ? DOLLY_POINTER_ACTION_PRESS : DOLLY_POINTER_ACTION_RELEASE,
                     buttons[button], event);
      return 1;
    }
    case MotionNotify:
      pointer_record(x->xmotion.x, x->xmotion.y, x->xmotion.state, DOLLY_POINTER_ACTION_DRAG, 0, event);
      return 1;
    case EnterNotify:
    case LeaveNotify:
      memset(event, 0, sizeof(*event));
      event->type = DOLLY_INPUT_EVENT_POINTER_PRESENCE;
      event->action = x->type == EnterNotify;
      return 1;
    case FocusIn:
    case FocusOut:
      memset(event, 0, sizeof(*event));
      event->type = DOLLY_INPUT_EVENT_FOCUS;
      event->action = x->type == FocusIn;
      return 1;
    case ConfigureNotify:
      if ((uint32_t)x->xconfigure.width == window->width && (uint32_t)x->xconfigure.height == window->height) return 0;
      window->width = (uint32_t)x->xconfigure.width;
      window->height = (uint32_t)x->xconfigure.height;
      memset(event, 0, sizeof(*event));
      event->type = X11_WINDOW_EVENT_SIZE;
      event->x = (int32_t)window->width;
      event->y = (int32_t)window->height;
      return 1;
    case Expose:
      if (x->xexpose.count == 0) show_frame(window);
      return 0;
    case ClientMessage:
      if ((Atom)x->xclient.data.l[0] != window->delete_window) return 0;
      memset(event, 0, sizeof(*event));
      event->type = X11_WINDOW_EVENT_CLOSE;
      return 1;
  }
  return 0;
}

int x11_window_next_event(x11_window *window, dolly_input_event *event, double timeout_milliseconds) {
  for (;;) {
    while (XPending(window->display)) {
      XEvent x;
      XNextEvent(window->display, &x);
      if (translate(window, &x, event)) return 1;
    }
    if (timeout_milliseconds == 0) return 0;
    struct pollfd connection = {ConnectionNumber(window->display), POLLIN, 0};
    const int ready = poll(&connection, 1, timeout_milliseconds < 0 ? -1 : (int)(timeout_milliseconds + 0.999));
    if (ready < 0 && errno != EINTR) return -errno;
    if (ready == 0) return 0;
    if (connection.revents & (POLLHUP | POLLERR)) return -ECONNRESET;
    // Read what arrived; a timeout ends at the next wait.
    timeout_milliseconds = 0;
    XEventsQueued(window->display, QueuedAfterReading);
    if (!XPending(window->display)) return 0;
  }
}
