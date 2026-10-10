import * as B from "./abi.mjs";
import { createLeaseBridge } from "../lease-bridge.mjs";
import { DOLLY_ERRNO as E } from "../../src/process-constants.mjs";
export { DOLLY_BUTTONS_ABI_DIGEST as digest } from "./abi.mjs";

// The device as the lease bridge sees it.
export const lease = { type: "buttons", slots: B.DOLLY_BUTTONS_SLOTS, packetBytes: B.DOLLY_BUTTONS_PACKET_BYTES,
  replyBytes: B.DOLLY_BUTTONS_REPLY_BYTES, open: B.DOLLY_BUTTONS_OPEN, close: B.DOLLY_BUTTONS_CLOSE };

export function browser({ send }) {
  return {
    messages: {
      "buttons-request"(message) {
        send({ type: "buttons-complete", scope: message.scope, sequence: message.sequence, bytes: new Uint8Array(), error: E.ENOSYS });
      },
      "buttons-revoke"(message) { send({ type: "buttons-complete", scope: message.scope, revoked: true }); },
    },
  };
}

export function worker({ send, get }) {
  let bridge;
  return {
    bindings: { "env.dolly_buttons_dispatch": (address, bytes) =>
      bridge ? bridge.dispatch({ address, bytes }) : -E.ENOSYS },
    start({ dolly, memory }) {
      bridge = createLeaseBridge(lease, memory, Number(dolly._dolly_buttons_mailbox_address()), send,
        () => get("runtime").serviceDeferred());
    },
    messages: { "buttons-complete": message => bridge?.acknowledge(message) },
    dispose() { bridge = undefined; },
  };
}
