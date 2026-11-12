#ifndef DOLLY_CLIPBOARD_H
#define DOLLY_CLIPBOARD_H

#include <stddef.h>
// The mailbox's _Atomic needs nothing in C++ (Clang), where before C++23
// <stdatomic.h> would cover std::atomic's functions with C's macros.
#ifndef __cplusplus
#include <stdatomic.h>
#endif
#include <stdint.h>
#include <dolly/clipboard-abi.h>

#ifdef __cplusplus
extern "C" {
#endif

// The words before the text are little-endian atomic u32 values
// (dolly-clipboard-0.wat).
typedef struct {
  _Atomic uint32_t copy;
  _Atomic uint32_t length;
  _Atomic uint32_t holder;
  _Atomic uint32_t enabled;
  unsigned char text[DOLLY_CLIPBOARD_CAPACITY];
} dolly_clipboard_mailbox;

#ifdef __cplusplus
#define DOLLY_CLIPBOARD_LAYOUT(condition, name) static_assert(condition, name)
#else
#define DOLLY_CLIPBOARD_LAYOUT(condition, name) _Static_assert(condition, name)
#endif
DOLLY_CLIPBOARD_LAYOUT(offsetof(dolly_clipboard_mailbox, text) == DOLLY_CLIPBOARD_HEADER_SIZE,
                       "clipboard mailbox layout changed");

// The page's clipboard, as text. Only the foreground command or a descendant
// may hold it; a descendant takes it over from the holder, which has it back
// when the descendant releases it or exits. While a program holds it and the
// input lease, the user's paste reaches it as the paste chord's keys
// (Ctrl+V), and the pasted text is the clipboard's to read. Operations return
// zero on success or a negative errno value: acquire is ENOSYS where no page
// listens, EPERM for a process that is not the foreground command or its
// descendant, EBUSY for the holder itself or past four holders; write and
// read are EBUSY for a holder a descendant has taken it over from. write
// makes length bytes of UTF-8 (at most DOLLY_CLIPBOARD_CAPACITY) the
// clipboard's, which the page also offers to the browser's clipboard while
// the user acts on the page. read copies at most capacity bytes of the
// clipboard's text and returns its whole length. Exit releases the clipboard;
// its text stays.
int dolly_clipboard_acquire(uint64_t *generation);
int dolly_clipboard_write(uint64_t generation, const void *text, size_t length);
int64_t dolly_clipboard_read(uint64_t generation, void *text, size_t capacity);
int dolly_clipboard_release(uint64_t generation);

// Process packets of the DOLLY_CLIPBOARD_* operations. ACQUIRE has an empty
// request, WRITE and RELEASE an empty response. WRITE's request is followed
// by its text, READ's response by the text that fits.
typedef struct {
  uint64_t generation;
} dolly_clipboard_generation;

typedef struct {
  uint64_t generation;
  uint32_t length;
  uint32_t reserved;
} dolly_clipboard_write_request;

typedef struct {
  uint32_t length;
  uint32_t reserved;
} dolly_clipboard_read_response;

DOLLY_CLIPBOARD_LAYOUT(sizeof(dolly_clipboard_generation) == 8, "dolly_clipboard_generation");
DOLLY_CLIPBOARD_LAYOUT(sizeof(dolly_clipboard_write_request) == 16, "dolly_clipboard_write_request");
DOLLY_CLIPBOARD_LAYOUT(sizeof(dolly_clipboard_read_response) == 8, "dolly_clipboard_read_response");
#undef DOLLY_CLIPBOARD_LAYOUT

#ifdef __cplusplus
}
#endif

#endif
