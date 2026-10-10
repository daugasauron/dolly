import { createMicrophoneProvider } from "./provider.mjs";
import * as M from "./abi.mjs";
import { createLeaseBridge } from "../lease-bridge.mjs";
import { holdIndicators } from "../../src/page-indicators.mjs";
import { DOLLY_ERRNO as E } from "../../src/process-constants.mjs";
export { DOLLY_MICROPHONE_ABI_DIGEST as digest } from "./abi.mjs";

// The device as the lease bridge sees it.
export const lease = { type: "microphone", slots: M.DOLLY_MICROPHONE_SLOTS, packetBytes: M.DOLLY_MICROPHONE_PACKET_BYTES,
  replyBytes: M.DOLLY_MICROPHONE_REPLY_BYTES, open: M.DOLLY_MICROPHONE_OPEN, close: M.DOLLY_MICROPHONE_CLOSE };

export function check() {
  return typeof navigator.mediaDevices?.getUserMedia === "function" && typeof globalThis.AudioWorkletNode === "function"
    ? null : "Microphone capture is unavailable in this browser";
}

// Trusted page DOM over the display, beside the browser's own recording mark:
// shown for as long as a program has asked for or holds the microphone.
function indicate(state) {
  let element = document.querySelector("#microphone-status");
  if (!element) {
    element = document.body.appendChild(document.createElement("div"));
    element.id = "microphone-status";
    element.className = "page-indicator";
    element.setAttribute("role", "status");
    element.style.cssText = "position:fixed;left:0.5rem;bottom:2rem;z-index:8;max-width:calc(100vw - 1rem);" +
      "padding:0.15rem 0.45rem;background:#262626;border:1px solid #e98773;color:#e98773;font-size:13px;pointer-events:none";
  }
  const text = { waiting: "Microphone: waiting for permission", capturing: "Microphone on" }[state];
  element.hidden = !text;
  element.textContent = text ?? "";
  holdIndicators(element, Boolean(text));
}

export function browser({ send }) {
  const provider = createMicrophoneProvider(() => indicate(provider.status().state));
  return {
    page: { get microphone() { return provider.status(); } },
    messages: {
      "microphone-request"(message) {
        const result = provider.dispatch(message.packet);
        send({ type: "microphone-complete", scope: message.scope, sequence: message.sequence, ...result },
          [result.bytes.buffer]);
      },
      "microphone-revoke"(message) {
        provider.release(message.scope);
        send({ type: "microphone-complete", scope: message.scope, revoked: true });
      },
    },
    dispose() { provider.close(); },
  };
}

export function worker({ send, get }) {
  let bridge;
  return {
    bindings: { "env.dolly_microphone_dispatch": (address, bytes) =>
      bridge ? bridge.dispatch({ address, bytes }) : -E.ENOSYS },
    start({ dolly, memory }) {
      bridge = createLeaseBridge(lease, memory, Number(dolly._dolly_microphone_mailbox_address()), send,
        () => get("runtime").serviceDeferred());
    },
    messages: { "microphone-complete": message => bridge?.acknowledge(message) },
    dispose() { bridge = undefined; },
  };
}
