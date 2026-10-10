import { createAudioProvider } from "./provider.mjs";
import * as A from "./abi.mjs";
import { createLeaseBridge } from "../lease-bridge.mjs";
import { DOLLY_ERRNO as E } from "../../src/process-constants.mjs";
export { DOLLY_AUDIO_ABI_DIGEST as digest } from "./abi.mjs";

// The device as the lease bridge sees it.
export const lease = { type: "audio", slots: A.DOLLY_AUDIO_SLOTS, packetBytes: A.DOLLY_AUDIO_PACKET_BYTES,
  replyBytes: A.DOLLY_AUDIO_REPLY_BYTES, open: A.DOLLY_AUDIO_OPEN, close: A.DOLLY_AUDIO_CLOSE };

export function check() {
  return typeof globalThis.AudioContext === "function" ? null : "Web Audio playback is unavailable in this browser";
}

export function browser({ send }) {
  const provider = createAudioProvider();
  const resume = event => { if (event.isTrusted) provider.resume(); };
  window.addEventListener("keydown", resume, { capture: true });
  window.addEventListener("pointerdown", resume, { capture: true });
  return {
    get status() { return provider.status(); },
    page: { get audio() { return provider.status(); } },
    messages: {
      "audio-request"(message) {
        const result = provider.dispatch(message.packet);
        send({ type: "audio-complete", scope: message.scope, sequence: message.sequence, ...result },
          [result.bytes.buffer]);
      },
      "audio-revoke"(message) {
        provider.release(message.scope);
        send({ type: "audio-complete", scope: message.scope, revoked: true });
      },
    },
    dispose() {
      window.removeEventListener("keydown", resume, { capture: true });
      window.removeEventListener("pointerdown", resume, { capture: true });
      void provider.close();
    },
  };
}

export function worker({ send, get }) {
  let bridge;
  return {
    bindings: { "env.dolly_audio_dispatch": (address, bytes) =>
      bridge ? bridge.dispatch({ address, bytes }) : -E.ENOSYS },
    start({ dolly, memory }) {
      bridge = createLeaseBridge(lease, memory, Number(dolly._dolly_audio_mailbox_address()), send,
        () => get("runtime").serviceDeferred());
    },
    messages: { "audio-complete": message => bridge?.acknowledge(message) },
    dispose() { bridge = undefined; },
  };
}
