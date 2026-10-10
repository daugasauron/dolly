import { createButtonsProvider } from "./provider.mjs";
import * as B from "./abi.mjs";
import { createLeaseBridge } from "../lease-bridge.mjs";
import { DOLLY_ERRNO as E } from "../../src/process-constants.mjs";
export { DOLLY_BUTTONS_ABI_DIGEST as digest } from "./abi.mjs";

// The device as the lease bridge sees it.
export const lease = { type: "buttons", slots: B.DOLLY_BUTTONS_SLOTS, packetBytes: B.DOLLY_BUTTONS_PACKET_BYTES,
  replyBytes: B.DOLLY_BUTTONS_REPLY_BYTES, open: B.DOLLY_BUTTONS_OPEN, close: B.DOLLY_BUTTONS_CLOSE };

// The page's one read of the clipboard: inside the user's click on its own Paste button.
const readClipboard = async () => navigator.clipboard.readText();

// Trusted page DOM below the terminal; terminal.html styles it and ends the
// terminal and the page's indicators above it. A program's caption and labels
// are set as text, and it cannot name the Paste button.
function createStrip(keyboard) {
  const strip = document.body.appendChild(document.createElement("div"));
  const caption = strip.appendChild(document.createElement("p")), grid = strip.appendChild(document.createElement("div"));
  strip.id = "buttons";
  strip.hidden = true;
  const root = document.documentElement.style;
  const resized = new ResizeObserver(() => root.setProperty("--buttons-height", `${strip.offsetHeight}px`));
  resized.observe(strip);
  let number = 0;
  return {
    show(layout) {
      strip.hidden = !layout;
      // The buttons stand in for the on-screen keyboard; a hardware keyboard still types.
      if (layout) keyboard.setAttribute("inputmode", "none"); else keyboard.removeAttribute("inputmode");
      caption.textContent = layout?.caption ?? "";
      caption.hidden = !caption.textContent;
      // Buttons that stay are not rebuilt: a new caption costs no press in progress.
      if (layout?.number === number) return;
      number = layout?.number ?? 0;
      grid.replaceChildren(...(layout?.buttons ?? []).map(({ label, paste }, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = paste ? "Paste" : label;
        button.toggleAttribute("data-paste", paste);
        button.addEventListener("click", () => {
          keyboard.focus({ preventScroll: true });
          if (paste) readClipboard().then(text => layout.press(index, text), () => layout.press(index, null));
          else layout.press(index);
        });
        return button;
      }));
    },
    remove() {
      resized.disconnect();
      strip.remove();
      root.removeProperty("--buttons-height");
      keyboard.removeAttribute("inputmode");
    },
  };
}

export function browser({ send, keyboard }) {
  const strip = createStrip(keyboard), provider = createButtonsProvider(strip.show);
  return {
    page: { get buttons() { return provider.status(); } },
    messages: {
      "buttons-request"(message) {
        const result = provider.dispatch(message.packet);
        send({ type: "buttons-complete", scope: message.scope, sequence: message.sequence, ...result },
          [result.bytes.buffer]);
      },
      "buttons-revoke"(message) {
        provider.release(message.scope);
        send({ type: "buttons-complete", scope: message.scope, revoked: true });
      },
    },
    dispose() { provider.close(); strip.remove(); },
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
