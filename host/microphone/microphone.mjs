import { createMicrophoneProvider } from "./provider.mjs";
import * as M from "./abi.mjs";
import { DOLLY_ERRNO as E } from "./abi.mjs";
export { DOLLY_MICROPHONE_ABI_DIGEST as digest } from "./abi.mjs";

// The device as the lease bridge sees it.
export const lease = { type: "microphone", version: M.DOLLY_MICROPHONE_VERSION, slots: M.DOLLY_MICROPHONE_SLOTS, packetBytes: M.DOLLY_MICROPHONE_PACKET_BYTES,
  replyBytes: M.DOLLY_MICROPHONE_REPLY_BYTES, open: M.DOLLY_MICROPHONE_OPEN, close: M.DOLLY_MICROPHONE_CLOSE };

// Trusted page DOM over the display, beside the browser's own recording mark:
// shown in the bottom left corner for as long as a program has asked for or
// holds the microphone.
function indicate({ indicators }, state) {
  let element = document.querySelector("#microphone-status");
  if (!element) {
    element = indicators.corner("bottom-left").appendChild(document.createElement("div"));
    element.id = "microphone-status";
    element.className = "page-indicator";
    element.setAttribute("role", "status");
    element.style.borderColor = element.style.color = "var(--dolly-ui-alert)";
  }
  const text = { waiting: "Microphone: waiting for permission", capturing: "Microphone on" }[state];
  element.hidden = !text;
  element.textContent = text ?? "";
  indicators.hold(element, Boolean(text));
}

// A session that enabled the module itself (nena@0, `switched`) captures only
// after the user says yes on the page, once a session: the browser's own
// prompt is per origin and remembered, so it may not ask again.
function asked(mount) {
  return new Promise(resolve => {
    const element = mount.appendChild(document.createElement("div"));
    element.setAttribute("role", "alertdialog");
    element.style.cssText = "position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);z-index:9;padding:0.8rem 1rem;" +
      "background:#262626;border:1px solid #e98773;color:#e8e3d7;font-size:14px;max-width:min(30rem,calc(100% - 2rem))";
    element.textContent = "A program in this session asks to use the microphone.";
    const choice = allowed => () => { element.remove(); resolve(allowed); };
    for (const [label, allowed] of [["Allow", true], ["Refuse", false]]) {
      const button = Object.assign(document.createElement("button"), { type: "button", textContent: label });
      button.style.cssText = "margin:0.6rem 0.6rem 0 0;padding:0.2rem 0.9rem;color:inherit;background:transparent;border:1px solid currentColor";
      button.addEventListener("click", choice(allowed));
      element.append(button);
    }
  });
}

export function browser({ mount, send, indicators, switched }) {
  let consented = !switched;
  const consent = async () => consented ||= await asked(mount);
  const provider = createMicrophoneProvider(() => indicate({ indicators }, provider.status().state), consent);
  return {
    page: { get microphone() { return provider.status(); } },
    messages: {
      "microphone-request"(message) {
        const result = provider.dispatch(message);
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
    start({ kernel }) {
      bridge = get("runtime").leaseBridge(lease, Number(kernel.dolly_microphone_mailbox_address()), send);
    },
    messages: { "microphone-complete": message => bridge?.acknowledge(message) },
    dispose() { bridge?.dispose(); bridge = undefined; },
  };
}
