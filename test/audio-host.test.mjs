import assert from "node:assert/strict";
import test from "node:test";
import { worker } from "../host/audio/audio.mjs";
import { DOLLY_ERRNO as E } from "../src/process-constants.mjs";
import { createLeaseBridge } from "../host/runtime/lease-bridge.mjs";

test("audio module binds the bridge, acknowledges replies, revokes and disposes", () => {
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 2, shared: true });
  const mailbox = 64, address = 1024, sent = [];
  let serviced = 0;
  const module = worker({ send: (message, transfer) => sent.push({ message, transfer }),
    get: name => { assert.equal(name, "runtime");
      return { leaseBridge: (lease, address, send) => createLeaseBridge(lease, memory, address, send, () => ++serviced) }; } });
  const dispatch = module.bindings["env.dolly_audio_dispatch"];
  assert.equal(dispatch(BigInt(address), 32n), -E.ENOSYS);
  module.start({ kernel: { dolly_audio_mailbox_address: () => BigInt(mailbox) }, memory });
  const packet = new Uint8Array(memory.buffer, address, 32), view = new DataView(packet.buffer, address, 32);
  view.setUint32(4, 1, true); view.setUint32(8, 1, true); view.setUint32(16, 1, true);
  // The whole header is checked here: version, body length and the reserved words.
  for (const [offset, value] of [[0, 1], [12, 1], [20, 1], [24, 4], [28, 1]]) {
    view.setUint32(offset, value, true);
    assert.equal(dispatch(BigInt(address), 32n), -E.EINVAL, `a header altered at ${offset}`);
    view.setUint32(offset, 0, true);
  }
  assert.equal(dispatch(BigInt(address), 32n), 0);
  const { message, transfer } = sent[0];
  assert.deepEqual([message.type, message.operation, message.body.length], ["audio-request", 1, 0]);
  assert.deepEqual(transfer, [message.body.buffer]);
  packet.fill(255);
  assert.equal(new DataView(message.body.buffer).getUint32(4, true), 1);
  const words = new Int32Array(memory.buffer, mailbox, 16);
  module.messages["audio-complete"]({ scope: 1, sequence: 2, error: 0, bytes: new Uint8Array(16) });
  assert.equal(Atomics.load(words, 0), 0, "a stale reply must not complete a request");
  memory.grow(1);
  const reply = Uint8Array.from({ length: 16 }, (_, i) => i);
  module.messages["audio-complete"]({ scope: 1, sequence: 1, error: 0, bytes: reply });
  assert.deepEqual([...new Int32Array(memory.buffer, mailbox, 5)], [1, 1, 1, 0, 16]);
  assert.deepEqual(new Uint8Array(memory.buffer, mailbox + 64, 16), reply);
  assert.ok(serviced > 0);
  assert.equal(dispatch(0n, 1n), 0);
  assert.equal(dispatch(0n, 1n), 0);
  assert.equal(sent.length, 2, "revocation must be bounded");
  assert.deepEqual(sent[1].message, { type: "audio-revoke", scope: 1 });
  module.messages["audio-complete"]({ scope: 1, revoked: true });
  // A call still waiting for the page when the module goes is answered ENOSYS.
  packet.fill(0);
  view.setUint32(4, 1, true); view.setUint32(8, 5, true); view.setUint32(16, 1, true);
  assert.equal(dispatch(BigInt(address), 32n), 0);
  module.dispose();
  assert.deepEqual([...new Int32Array(memory.buffer, mailbox, 5)], [1, 5, 1, E.ENOSYS, 0]);
  assert.equal(dispatch(BigInt(address), 32n), -E.ENOSYS);
});
