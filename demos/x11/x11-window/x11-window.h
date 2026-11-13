#ifndef X11_WINDOW_H
#define X11_WINDOW_H

// A program's one window on the X server DISPLAY names, as the page's canvas
// is its window through display@0 and input@0: frames of pixels go in, and
// what the user does comes out as input@0's records, keys named as a
// browser's KeyboardEvent names them. A platform that draws on the page so
// draws in an X window with the code it has.

#include <stddef.h>
#include <stdint.h>
#include <dolly/input.h>

#ifdef __cplusplus
extern "C" {
#endif

// Records an X window has beside input@0's: its new size (x and y are the
// width and height), and the window manager asking to close it.
#define X11_WINDOW_EVENT_SIZE 64u
#define X11_WINDOW_EVENT_CLOSE 65u

typedef struct x11_window x11_window;

// The X display DISPLAY names ([host]:display[.screen]), or NULL: Dolly's own
// DISPLAY, the terminal's display library (an absolute path), names none.
const char *x11_window_display(void);
// Opens and maps a window of width by height pixels; NULL with errno set when
// there is no X server (DISPLAY names none: ENOENT).
x11_window *x11_window_open(const char *title, uint32_t width, uint32_t height);
void x11_window_close(x11_window *window);
// The next record, waiting at most timeout milliseconds (a negative timeout
// waits indefinitely): one with a record, zero without, a negative errno once
// the connection is gone. Pointer records are DOLLY_POINTER_ACTION_DRAG for a
// move; text arrives in key records, as one character's key.
int x11_window_next_event(x11_window *window, dolly_input_event *event, double timeout_milliseconds);
// Shows width by height pixels, rows of stride bytes from the top, four bytes
// a pixel: red first when rgba is nonzero, blue first otherwise. The window
// shows the last frame again when it is uncovered.
int x11_window_present(x11_window *window, const void *pixels, uint32_t width, uint32_t height,
                       size_t stride, int rgba);
void x11_window_set_title(x11_window *window, const char *title);
// A DOLLY_DISPLAY_CURSOR_* shape (<dolly/display.h>).
void x11_window_set_cursor(x11_window *window, uint32_t shape);
void x11_window_resize(x11_window *window, uint32_t width, uint32_t height);
// The window's size as the X server last reported it, and its screen's.
void x11_window_size(const x11_window *window, uint32_t *width, uint32_t *height);
void x11_window_screen_size(const x11_window *window, uint32_t *width, uint32_t *height);

#ifdef __cplusplus
}
#endif

#endif
