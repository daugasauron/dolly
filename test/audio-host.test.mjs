import assert from "node:assert/strict";
import test from "node:test";
import { worker } from "../host/audio/audio.mjs";
import { DOLLY_ERRNO as E } from "../dist/dolly-errno.mjs";
import { createDollyfileGraphLoader } from "../scripts/dollyfile-graph.mjs";

test("audio module binds the bridge, acknowledges replies, revokes and disposes", () => {
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 2, shared: true });
  const mailbox = 64, address = 1024, sent = [];
  let serviced = 0;
  const module = worker({ send: (message, transfer) => sent.push({ message, transfer }),
    get: name => { assert.equal(name, "runtime"); return { serviceDeferred() { ++serviced; } }; } });
  const dispatch = module.bindings["env.dolly_audio_dispatch"];
  assert.equal(dispatch(BigInt(address), 32n), -E.ENOSYS);
  module.start({ dolly: { _dolly_audio_mailbox_address: () => BigInt(mailbox) }, memory });
  const packet = new Uint8Array(memory.buffer, address, 32), view = new DataView(packet.buffer, address, 32);
  view.setUint32(4, 1, true); view.setUint32(8, 1, true); view.setUint32(16, 1, true);
  assert.equal(dispatch(BigInt(address), 32n), 0);
  const { message, transfer } = sent[0];
  assert.equal(message.type, "audio-request");
  assert.deepEqual(transfer, [message.packet.buffer]);
  packet.fill(255);
  assert.equal(new DataView(message.packet.buffer).getUint32(4, true), 1);
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
  module.dispose();
  assert.equal(dispatch(BigInt(address), 32n), -E.ENOSYS);
});

test("the audio SDK declares playback without requiring threads", async () => {
  const root = new URL("../", import.meta.url).pathname;
  const graph = createDollyfileGraphLoader(root);
  const requirements = (await graph("Dollyfile-audio-sdk")).root.hostRequirements;
  assert.ok(requirements.includes("audio@0"));
  assert.ok(!requirements.includes("threads@0"));
  assert.ok(!(await graph("Dollyfile")).root.hostRequirements.includes("audio@0"));
});
