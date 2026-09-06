import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import vm from "node:vm";

test("display text packets and copied selections preserve literal UTF-8", async () => {
  const source = await readFile(new URL("../src/browser.mjs", import.meta.url), "utf8");
  const Display = vm.runInNewContext(`
    const encoder = new TextEncoder();
    ${source.match(/^const textDecoder = .*;$/m)[0]}
    ${source.slice(source.indexOf("class DisplayTransport {"), source.indexOf("class FramebufferPresenter {"))}
    DisplayTransport;
  `, { TextEncoder, TextDecoder, SharedArrayBuffer });
  const buffer = new SharedArrayBuffer(4096);
  const transport = new Display(buffer, 0, 128, 8, 2048, 3072, 1024);
  for (const padding of [0, 1, 84, 85, 86, 87, 88, 89, 175]) {
    transport.words.fill(0);
    const text = "a".repeat(padding) + "\uFEFF日本語😀";
    assert.equal(transport.pushText(text), true);
    const packets = [];
    for (let index = 0; index < transport.words[Display.eventWrite]; index++) {
      const offset = Display.headerSize + index * 128;
      const length = new DataView(buffer, offset, 128).getUint16(36, true);
      packets.push(Buffer.from(buffer, offset + 40, length));
    }
    assert.deepEqual(Buffer.concat(packets), Buffer.from(text), `packet boundary after ${padding} bytes`);
    const bytes = Buffer.from(text);
    transport.bytes.set(bytes, transport.copyAddress);
    transport.words[Display.copyFlags] = Display.copyAvailable;
    transport.words[Display.copyLength] = bytes.length;
    assert.equal(transport.copySelection(), text, "selection text must remain literal");
  }
});

test("terminal UI compaction preserves input order across wrap and producer publication", async () => {
  const project = resolve(import.meta.dirname, "..");
  const runtime = await readFile(join(project, "src/dolly.c"), "utf8");
  const start = runtime.indexOf("int dolly_terminal_present_pending(void)");
  const end = runtime.indexOf("\nstatic void echo_byte", start);
  assert.ok(start > 0 && end > start);
  const scratch = await mkdtemp(join(tmpdir(), "dolly-terminal-ring-"));
  try {
    await writeFile(join(scratch, "probe.c"), `
#include <dolly/display.h>
#include <assert.h>
#include <errno.h>
#include <string.h>
static dolly_display_mailbox display_mailbox;
static struct { unsigned generation; } display_lease;
static unsigned seen, append, appended;
static int handle(const dolly_input_event *event, unsigned char *out, size_t capacity, size_t *length) {
  assert(capacity == 0);
  *length = 0;
  if (!event) return 0;
  assert(event->action == seen * 3);
  ++seen;
  if (append && !appended) {
    uint32_t write = display_mailbox.event_write;
    display_mailbox.events[write & 255] = (dolly_input_event){.type = DOLLY_INPUT_EVENT_TEXT, .action = 1000};
    atomic_store(&display_mailbox.event_write, write + 1);
    appended = 1;
  }
  return 0;
}
static const dolly_display_driver_v3 driver = {.handle_event = handle};
static const dolly_display_driver_v3 *display_driver = &driver;
${runtime.slice(start, end)}
int main(void) {
  for (unsigned wrap = 0; wrap < 2; ++wrap) {
    for (unsigned count = 0; count <= 256; ++count) {
      for (append = 0; append < 2; ++append) {
        if (append && count == 256) continue;
        memset(&display_mailbox, 0, sizeof(display_mailbox));
        uint32_t base = wrap ? UINT32_MAX - 128 : 0;
        display_mailbox.event_read = base;
        display_mailbox.event_write = base + count;
        for (unsigned i = 0; i < count; ++i) {
          display_mailbox.events[(base + i) & 255] = (dolly_input_event){
            .type = i % 3 ? DOLLY_INPUT_EVENT_TEXT : DOLLY_INPUT_EVENT_SCROLL, .action = i};
        }
        seen = appended = 0;
        assert(dolly_terminal_present_pending() == 0);
        assert(seen == (count + 2) / 3);
        assert(display_mailbox.event_read == base + seen);
        assert(display_mailbox.event_write == base + count + appended);
        uint32_t cursor = display_mailbox.event_read;
        for (unsigned i = 0; i < count; ++i) if (i % 3) {
          assert(display_mailbox.events[cursor++ & 255].action == i);
        }
        if (appended) assert(display_mailbox.events[cursor++ & 255].action == 1000);
        assert(cursor == display_mailbox.event_write);
      }
    }
  }
  display_lease.generation = 1;
  display_mailbox.event_read = 0;
  display_mailbox.event_write = 1;
  display_mailbox.events[0].type = DOLLY_INPUT_EVENT_POINTER;
  seen = 0;
  assert(dolly_terminal_present_pending() == 0 && seen == 0 && display_mailbox.event_read == 0);
  return 0;
}
`);
    const run = promisify(execFile);
    await run("cc", ["-std=c11", "-I", join(project, "include"), join(scratch, "probe.c"), "-o", join(scratch, "probe")]);
    await run(join(scratch, "probe"), []);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
