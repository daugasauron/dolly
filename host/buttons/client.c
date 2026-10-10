#include <dolly/buttons.h>
#include <dolly/host.h>

DOLLY_HOST_REQUIRE(buttons, 0, DOLLY_BUTTONS_ABI_DIGEST);
#include <dolly/process.h>
#include <errno.h>
#include <string.h>

_Static_assert(sizeof(dolly_button) == 28 && sizeof(dolly_buttons_event) == DOLLY_BUTTONS_REPLY_BYTES &&
               DOLLY_BUTTONS_PACKET_BYTES == 40 + DOLLY_BUTTONS_MAX * 28 + DOLLY_BUTTONS_CAPTION_BYTES,
               "buttons packets differ from dolly-buttons-0.wat");

static int fail(int error) { errno = error; return -1; }
static void u32(void *data, size_t offset, uint32_t n) { memcpy((char *)data + offset, &n, 4); }
static void u64(void *data, size_t offset, uint64_t n) { memcpy((char *)data + offset, &n, 8); }

static int utf8(const char *text, size_t size) {
  const unsigned char *s = (const unsigned char *)text;
  for (size_t i = 0; i < size;) {
    const unsigned char lead = s[i++];
    if (lead < 0x80) continue;
    int more = lead >= 0xf0 ? 3 : lead >= 0xe0 ? 2 : 1;
    const uint32_t least = more == 3 ? 0x10000 : more == 2 ? 0x800 : 0x80;
    uint32_t point = lead & (0x3f >> more);
    if (lead < 0xc2 || lead > 0xf4 || size - i < (size_t)more) return 0;
    while (more--) {
      if ((s[i] & 0xc0) != 0x80) return 0;
      point = point << 6 | (s[i++] & 0x3f);
    }
    if (point < least || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) return 0;
  }
  return 1;
}

/* Returns the reply's length. */
static int64_t call(dolly_buttons *buttons, unsigned operation, size_t bytes, void *reply, size_t capacity) {
  if (!buttons) return fail(EINVAL);
  if (operation != DOLLY_BUTTONS_OPEN && !buttons->scope) return fail(EBADF);
  /* Reserve the last sequence for CLOSE so exhausted buttons can be reopened. */
  if (buttons->sequence >= UINT32_MAX - (operation != DOLLY_BUTTONS_CLOSE)) return fail(EOVERFLOW);
  u32(buttons->packet, 0, DOLLY_BUTTONS_VERSION);
  u32(buttons->packet, 4, operation);
  u64(buttons->packet, 8, buttons->scope);
  u64(buttons->packet, 16, ++buttons->sequence);
  u32(buttons->packet, 24, bytes - 32);
  u32(buttons->packet, 28, 0);
  int64_t result = dolly_process_call(DOLLY_BUTTONS_PROCESS_OP, buttons->packet, bytes, reply, capacity);
  return result < 0 && result >= -4095 ? fail((int)-result) : result;
}

int dolly_buttons_open(dolly_buttons *buttons) {
  if (!buttons) return fail(EINVAL);
  if (buttons->scope) return fail(EBUSY);
  memset(buttons, 0, sizeof(*buttons));
  uint64_t scope;
  int64_t length = call(buttons, DOLLY_BUTTONS_OPEN, 32, &scope, sizeof(scope));
  if (length < 0) return -1;
  if (length != 8 || !scope || scope > UINT32_MAX) return fail(EPROTO);
  buttons->scope = scope;
  return 0;
}

int dolly_buttons_close(dolly_buttons *buttons) {
  int64_t length = call(buttons, DOLLY_BUTTONS_CLOSE, 32, NULL, 0);
  if (length < 0) return -1;
  buttons->scope = 0;
  return length == 0 ? 0 : fail(EPROTO);
}

int dolly_buttons_show(dolly_buttons *buttons, const char *caption, const dolly_button *list, uint32_t count) {
  const char *end = caption ? memchr(caption, 0, DOLLY_BUTTONS_CAPTION_BYTES + 1) : NULL;
  if (!buttons || count > DOLLY_BUTTONS_MAX || (count && !list) || (caption && !end)) return fail(EINVAL);
  const size_t caption_bytes = caption ? (size_t)(end - caption) : 0;
  if (!utf8(caption, caption_bytes)) return fail(EILSEQ);
  unsigned char *body = buttons->packet + 32;
  u32(body, 0, count);
  u32(body, 4, caption_bytes);
  body += 8;
  for (uint32_t i = 0; i < count; ++i, body += 28) {
    end = memchr(list[i].label, 0, DOLLY_BUTTONS_LABEL_BYTES);
    const size_t label = list[i].kind == DOLLY_BUTTON_PASTE ? 0
        : end ? (size_t)(end - list[i].label) : DOLLY_BUTTONS_LABEL_BYTES;
    if (!utf8(list[i].label, label)) return fail(EILSEQ);
    u32(body, 0, list[i].kind);
    memset(body + 4, 0, DOLLY_BUTTONS_LABEL_BYTES);
    memcpy(body + 4, list[i].label, label);
  }
  if (caption_bytes) memcpy(body, caption, caption_bytes);
  uint32_t layout;
  int64_t length = call(buttons, DOLLY_BUTTONS_SHOW, body + caption_bytes - buttons->packet, &layout, sizeof(layout));
  if (length < 0) return -1;
  return length == 4 && layout && layout <= INT32_MAX ? (int)layout : fail(EPROTO);
}

int dolly_buttons_read(dolly_buttons *buttons, dolly_buttons_event *event) {
  if (!event) return fail(EINVAL);
  int64_t length = call(buttons, DOLLY_BUTTONS_READ, 32, event, sizeof(*event));
  if (length <= 0) return (int)length;
  if (length < 20 || event->length > DOLLY_BUTTONS_PASTE_BYTES || length != 20 + (int64_t)event->length ||
      (event->kind != DOLLY_BUTTON_PRESS && event->kind != DOLLY_BUTTON_PASTE) ||
      (event->length && (event->status || event->kind != DOLLY_BUTTON_PASTE)) ||
      !utf8(event->text, event->length)) return fail(EPROTO);
  return 1;
}

int dolly_buttons_type(dolly_buttons *buttons, const char *bytes, uint32_t length) {
  if (!buttons || (length && !bytes) || length > DOLLY_BUTTONS_TYPE_BYTES) return fail(EINVAL);
  if (!buttons->scope) return fail(EBADF);
  if (!length) return 0;
  int64_t result = dolly_process_call(DOLLY_BUTTONS_TYPE_OP, bytes, length, NULL, 0);
  return result < 0 ? fail((int)-result) : 0;
}
