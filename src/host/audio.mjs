import { createAudioProvider } from "../audio-provider.mjs";
import { createAudioBridge } from "../audio-bridge.mjs";
import { DOLLY_ERRNO as E } from "../../dist/dolly-errno.mjs";

export const contract = Object.freeze({ name: "audio", version: 0, header: "dolly/audio.h",
  abi: ["dolly-audio-0"], dependencies: ["runtime@0"], phase: "kernel",
  imports: ["env.dolly_audio_dispatch"] });

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
      bridge = createAudioBridge(memory, Number(dolly._dolly_audio_mailbox_address()), send,
        () => get("runtime").serviceDeferred());
    },
    messages: { "audio-complete": message => bridge?.acknowledge(message) },
    dispose() { bridge = undefined; },
  };
}
