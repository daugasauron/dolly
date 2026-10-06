import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { InputTransport as Input } from "../host/input/input.mjs";
import { stagedIncludeDirectory } from "../scripts/host-modules.mjs";

const transportOf = (eventCapacity = 8) => new Input(new SharedArrayBuffer(4096), 64, 2048, { eventCapacity, pasteCapacity: 1024 });
// The records of a transport's ring, oldest first.
function records(transport) {
  const view = transport.view, read = transport.words[transport.word + Input.eventRead];
  return Array.from({ length: transport.words[transport.word + Input.eventWrite] - read }, (_, index) => {
    const offset = transport.address + Input.headerSize + ((read + index) & (transport.eventCapacity - 1)) * 128;
    const text = view.getUint16(offset + 36, true);
    return { type: view.getUint32(offset, true), action: view.getUint32(offset + 4, true), y: view.getInt32(offset + 20, true),
      text: Buffer.from(transport.bytes.buffer, offset + 40 + view.getUint16(offset + 32, true) + view.getUint16(offset + 34, true), text) };
  });
}

test("text records preserve literal UTF-8 across record boundaries", () => {
  for (const padding of [0, 1, 84, 85, 86, 87, 88, 89, 175]) {
    const transport = transportOf(), text = "a".repeat(padding) + "﻿日本語😀";
    assert.equal(transport.pushText(text), true);
    assert.deepEqual(Buffer.concat(records(transport).map(record => record.text)), Buffer.from(text),
      `record boundary after ${padding} bytes`);
  }
  const transport = transportOf();
  assert.equal(transport.pushText("x".repeat(88 * 7 + 1)), false, "text larger than the free ring");
  assert.deepEqual(records(transport).map(record => record.type), [Input.droppedEvent], "a refused text sends no partial records");
  for (const [address, capacity] of [[64, 0], [64, 1], [64, 12], [0, 8], [64, 64]]) {
    assert.throws(() => new Input(new SharedArrayBuffer(4096), address, 2048, { eventCapacity: capacity, pasteCapacity: 1024 }),
      /invalid input mailbox/);
  }
});

test("a full ring marks where it lost records, once, in its last slot", () => {
  const counted = [], transport = new Input(new SharedArrayBuffer(4096), 64, 2048,
    { eventCapacity: 8, pasteCapacity: 1024, dropped: count => counted.push(count) });
  const key = () => transport.pushSyntheticKey("k", "KeyK");
  for (let record = 0; record < 7; record++) assert.equal(key(), true);
  assert.equal(key(), false);
  assert.equal(key(), false);
  assert.deepEqual(counted, [1, 2]);
  assert.deepEqual(records(transport).map(record => [record.type, record.action]),
    [...Array(7).fill([Input.keyEvent, 1]), [Input.droppedEvent, 1]]);
  // The reader takes three records: later keys follow the mark, and a second loss is marked after them.
  transport.words[transport.word + Input.eventRead] += 3;
  assert.equal(key(), true);
  assert.equal(key(), true);
  assert.equal(key(), false);
  assert.deepEqual(records(transport).map(record => record.type),
    [...Array(4).fill(Input.keyEvent), Input.droppedEvent, Input.keyEvent, Input.keyEvent, Input.droppedEvent]);
  assert.equal(records(transport).at(-1).action, 3);
});

test("a wheel delta keeps its unit; a paste goes to the buffer or, under a lease, into text", () => {
  const transport = transportOf();
  assert.equal(transport.pushScroll(-1.5, 1), true);
  assert.equal(transport.pushScroll(0.0001, 0), true, "a delta below a thousandth sends nothing");
  assert.deepEqual(records(transport).map(({ type, action, y }) => [type, action, y]), [[Input.scrollEvent, 1, -1500]]);
  assert.equal(transport.pushPaste("pasted"), true);
  assert.equal(transport.pushPaste("second"), false, "one paste is in flight");
  assert.equal(Buffer.from(transport.bytes.buffer, transport.pasteAddress, 6).toString(), "pasted");
  assert.equal(records(transport).at(-1).type, Input.pasteEvent);
  transport.words[transport.word + Input.flags] = 1;
  assert.equal(transport.pushPaste("leased"), true);
  assert.equal(records(transport).at(-1).text.toString(), "leased");
});

test("the terminal's own records are handled ahead of unread input, in order, across wrap and producer publication", async () => {
  const input = resolve(import.meta.dirname, "../host/input");
  const scratch = await mkdtemp(join(tmpdir(), "dolly-input-ring-"));
  try {
    await writeFile(join(scratch, "probe.c"), `
#include "ring.h"
#include <assert.h>
#include <errno.h>
#include <string.h>
static dolly_input_mailbox mailbox;
static unsigned seen, append, appended;
static int record(const dolly_input_event *event, unsigned char *out, size_t capacity, size_t *length) {
  assert(capacity == 0);
  *length = 0;
  assert(event->action == seen * 3);
  ++seen;
  if (append && !appended) {
    uint32_t write = mailbox.event_write;
    mailbox.events[write & 255] = (dolly_input_event){.type = DOLLY_INPUT_EVENT_TEXT, .action = 1000};
    atomic_store(&mailbox.event_write, write + 1);
    appended = 1;
  }
  return 0;
}
static const dolly_input_decoder decoder = {.record = record};
static const dolly_input_ring ring = {&mailbox, &decoder};
int main(void) {
  for (unsigned wrap = 0; wrap < 2; ++wrap) {
    for (unsigned count = 0; count <= 256; ++count) {
      for (append = 0; append < 2; ++append) {
        if (append && count == 256) continue;
        memset(&mailbox, 0, sizeof(mailbox));
        uint32_t base = wrap ? UINT32_MAX - 128 : 0;
        mailbox.event_read = base;
        mailbox.event_write = base + count;
        for (unsigned i = 0; i < count; ++i) {
          mailbox.events[(base + i) & 255] = (dolly_input_event){
            .type = i % 3 ? DOLLY_INPUT_EVENT_TEXT : DOLLY_INPUT_EVENT_SCROLL, .action = i};
        }
        seen = appended = 0;
        assert(dolly_input_ring_service(&ring) == 0);
        assert(seen == (count + 2) / 3);
        assert(mailbox.event_read == base + seen);
        assert(mailbox.event_write == base + count + appended);
        uint32_t cursor = mailbox.event_read;
        for (unsigned i = 0; i < count; ++i) if (i % 3) {
          assert(mailbox.events[cursor++ & 255].action == i);
        }
        if (appended) assert(mailbox.events[cursor++ & 255].action == 1000);
        assert(cursor == mailbox.event_write);
      }
    }
  }
  // Motion, capture, presence and loss marks are nobody's without a lease; keys wait for a reader.
  memset(&mailbox, 0, sizeof(mailbox));
  const uint32_t kinds[] = {DOLLY_INPUT_EVENT_POINTER_MOTION, DOLLY_INPUT_EVENT_KEY, DOLLY_INPUT_EVENT_POINTER_CAPTURE,
    DOLLY_INPUT_EVENT_POINTER_PRESENCE, DOLLY_INPUT_EVENT_FOCUS, DOLLY_INPUT_EVENT_DROPPED, DOLLY_INPUT_EVENT_PASTE};
  for (unsigned i = 0; i < 7; ++i) mailbox.events[i].type = kinds[i];
  mailbox.event_write = 7;
  seen = append = 0;
  assert(dolly_input_ring_service(&ring) == 0 && seen == 0 && mailbox.event_write - mailbox.event_read == 3);
  dolly_input_event taken;
  for (unsigned i = 0; i < 3; ++i) {
    const uint32_t kept[] = {DOLLY_INPUT_EVENT_KEY, DOLLY_INPUT_EVENT_FOCUS, DOLLY_INPUT_EVENT_PASTE};
    assert(dolly_input_ring_take(&ring, &taken) == 1 && taken.type == kept[i]);
  }
  assert(dolly_input_ring_take(&ring, &taken) == 0);
  // A discard drops what a program had not read. The terminal's own pointer
  // and scroll records still reach the decoder unless a lessee's lease ended,
  // and a terminal without a decoder drops them too.
  for (int terminal_ui = 0; terminal_ui < 3; ++terminal_ui) {
    memset(&mailbox, 0, sizeof(mailbox));
    mailbox.event_read = UINT32_MAX - 1;
    mailbox.event_write = UINT32_MAX + 3u;
    const dolly_input_event pending[] = {
      {.type = DOLLY_INPUT_EVENT_KEY, .action = 9}, {.type = DOLLY_INPUT_EVENT_POINTER, .action = 0},
      {.type = DOLLY_INPUT_EVENT_SCROLL, .action = 3}, {.type = DOLLY_INPUT_EVENT_TEXT, .action = 9}};
    for (unsigned i = 0; i < 4; ++i) mailbox.events[(UINT32_MAX - 1 + i) & 255] = pending[i];
    seen = append = 0;
    const dolly_input_ring undecoded = {&mailbox, NULL};
    dolly_input_ring_discard(terminal_ui == 2 ? &undecoded : &ring, terminal_ui);
    assert(mailbox.event_read == mailbox.event_write);
    assert(seen == (terminal_ui == 1 ? 2 : 0));
  }
  mailbox.event_read = 0;
  mailbox.event_write = 257;
  assert(dolly_input_ring_service(&ring) == -EPROTO);
  return 0;
}
`);
    const run = promisify(execFile);
    await run("cc", ["-std=c11", "-I", await stagedIncludeDirectory(), "-I", input, join(scratch, "probe.c"),
      join(input, "ring.c"), "-o", join(scratch, "probe")]);
    await run(join(scratch, "probe"), []);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
