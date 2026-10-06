import assert from "node:assert/strict";
import test from "node:test";
import { DisplayTransport as Display, FramebufferPresenter } from "../host/display/display.mjs";

test("copied selections preserve literal UTF-8", () => {
  const buffer = new SharedArrayBuffer(4096);
  const transport = new Display(buffer, 64, 3072, { copyCapacity: 1024 });
  const word = field => transport.word + field;
  const text = "﻿日本語😀";
  const bytes = Buffer.from(text);
  transport.bytes.set(bytes, transport.copyAddress);
  transport.words[word(Display.copyFlags)] = Display.copyAvailable;
  transport.words[word(Display.copyLength)] = bytes.length;
  assert.equal(transport.copySelection(), text, "selection text must remain literal");
  for (const [address, copyAddress] of [[0, 3072], [66, 3072], [4096 - 64, 3072], [64, 3073]]) {
    assert.throws(() => new Display(buffer, address, copyAddress, { copyCapacity: 1024 }), /invalid display mailbox/);
  }
});

test("the surface is published between two steps of its sequence", () => {
  const transport = new Display(new SharedArrayBuffer(4096), 64, 3072, { copyCapacity: 1024 });
  const word = field => transport.words[transport.word + field];
  transport.publishSurface(1280.4, 720, 1.5);
  assert.deepEqual([Display.surfaceSequence, Display.surfaceWidth, Display.surfaceHeight, Display.surfaceScaleMilli].map(word),
    [2, 1280, 720, 1500]);
});

test("the presenter refuses a malformed published frame", () => {
  const buffer = new SharedArrayBuffer(16384);
  const transport = new Display(buffer, 64, 3072, { copyCapacity: 1024 });
  const presenter = new FramebufferPresenter({ getContext: () => ({}) }, buffer, [8192, 16350], 1024,
    transport, () => {});
  const word = field => transport.word + field;
  // index, width, height, stride: bad buffer, stride, empty, over capacity, past the memory.
  for (const [index, width, height, stride] of [[2, 4, 4, 16], [0, 4, 4, 12], [0, 0, 4, 0], [0, 16, 32, 64], [1, 4, 4, 16]]) {
    transport.words[word(Display.frameIndex)] = index;
    transport.words[word(Display.frameWidth)] = width;
    transport.words[word(Display.frameHeight)] = height;
    transport.words[word(Display.frameStride)] = stride;
    transport.words[word(Display.frameSequence)] += 1;
    assert.throws(() => presenter.paint(), /invalid framebuffer/, `${index} ${width}x${height} stride ${stride}`);
  }
});
