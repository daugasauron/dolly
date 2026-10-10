import assert from "node:assert/strict";
import test from "node:test";
import { worker } from "../host/microphone/microphone.mjs";
import { DOLLY_ERRNO as E } from "../src/process-constants.mjs";
import { createDollyfileGraphLoader } from "../scripts/dollyfile-graph.mjs";

test("microphone module binds the bridge, publishes a reply of samples and revokes", () => {
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 2, shared: true });
  const mailbox = 64, address = 32768, sent = [];
  const module = worker({ send: (message, transfer) => sent.push({ message, transfer }),
    get: () => ({ serviceDeferred() {} }) });
  const dispatch = module.bindings["env.dolly_microphone_dispatch"];
  assert.equal(dispatch(BigInt(address), 32n), -E.ENOSYS);
  module.start({ dolly: { _dolly_microphone_mailbox_address: () => BigInt(mailbox) }, memory });
  const view = new DataView(memory.buffer, address, 40);
  view.setUint32(4, 1, true); view.setUint32(8, 1, true); view.setUint32(16, 1, true);
  assert.equal(dispatch(BigInt(address), 41n), -E.EINVAL, "a packet longer than a READ");
  assert.equal(dispatch(BigInt(address), 32n), 0);
  assert.equal(sent[0].message.type, "microphone-request");
  const reply = Uint8Array.from({ length: 16392 }, (_, i) => i);
  module.messages["microphone-complete"]({ scope: 1, sequence: 1, error: 0, bytes: reply });
  assert.deepEqual([...new Int32Array(memory.buffer, mailbox, 5)], [1, 1, 1, 0, 16392]);
  assert.deepEqual(new Uint8Array(memory.buffer, mailbox + 64, 16392), reply);
  assert.equal(dispatch(0n, 1n), 0);
  assert.deepEqual(sent[1].message, { type: "microphone-revoke", scope: 1 });
  module.dispose();
  assert.equal(dispatch(BigInt(address), 32n), -E.ENOSYS);
});

test("only the audio SDK declares the microphone", async () => {
  const graph = createDollyfileGraphLoader(new URL("../", import.meta.url).pathname);
  assert.ok((await graph("Dollyfile-audio-sdk")).root.hostRequirements.includes("microphone@0"));
  assert.ok(!(await graph("Dollyfile")).root.hostRequirements.includes("microphone@0"));
});
