import * as N from "./abi.mjs";
import { createLeaseBridge } from "../lease-bridge.mjs";
import { bootFiles } from "../runtime/boot-files.mjs";
import { hostRequirements } from "../requirements.mjs";
import { DOLLY_ERRNO as E } from "../../src/process-constants.mjs";
export { DOLLY_NENA_ABI_DIGEST as digest } from "./abi.mjs";

// The device as the lease bridge sees it.
export const lease = { type: "nena", slots: N.DOLLY_NENA_SLOTS, packetBytes: N.DOLLY_NENA_PACKET_BYTES,
  replyBytes: N.DOLLY_NENA_REPLY_BYTES, open: N.DOLLY_NENA_OPEN, close: N.DOLLY_NENA_CLOSE };
// The session's own record of the modules it enabled, one name@version a line.
// The Worker writes it after every switch and the page enables what it lists
// when the session is loaded again; the recipe engine reads it for amy.
const record = "/etc/dolly/enabled";

const encoder = new TextEncoder(), decoder = new TextDecoder("utf-8", { fatal: true });
const fail = errno => { throw Object.assign(new Error("nena request failed"), { errno }); };
// A NUL-terminated text field, cut at a whole character.
const text = (bytes, offset, size, value) => void encoder.encodeInto(value, bytes.subarray(offset, offset + size - 1));

// The page side: `modules` is the registry's list and its two switches
// (host/modules.mjs), which only this provider is given. Every answer is the
// page's; a packet names a module and never a file, URL or provider.
export function browser({ send, modules, showStatus }) {
  const requirement = ({ name, version }) => `${name}@${version}`;
  function moduleRecord(module, reason) {
    const bytes = new Uint8Array(N.DOLLY_NENA_REPLY_BYTES), view = new DataView(bytes.buffer);
    text(bytes, 0, N.DOLLY_NENA_NAME_BYTES, module.name);
    view.setUint32(32, module.version, true);
    view.setUint32(36, (module.enabled ? N.DOLLY_NENA_ENABLED : 0) | (module.declared ? N.DOLLY_NENA_DECLARED : 0) |
      (module.fixed ? N.DOLLY_NENA_FIXED : 0), true);
    text(bytes, 40, N.DOLLY_NENA_GIVES_BYTES, module.gives);
    text(bytes, 40 + N.DOLLY_NENA_GIVES_BYTES, N.DOLLY_NENA_REASON_BYTES, reason ?? module.fixed);
    return bytes;
  }
  // What the session enabled beyond what the page started with: its record.
  const enabledSince = () => modules.list().filter(module => module.enabled && !module.declared).map(requirement);
  async function dispatch(packet) {
    if (!(packet instanceof Uint8Array) || packet.byteLength < 32 || packet.byteLength > N.DOLLY_NENA_PACKET_BYTES) fail(E.EINVAL);
    const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
    const operation = view.getUint32(4, true), scope = view.getUint32(8, true);
    if (view.getUint32(0, true) !== N.DOLLY_NENA_VERSION || view.getUint32(12, true) || view.getUint32(20, true) ||
        !scope || view.getUint32(24, true) !== packet.length - 32 || view.getUint32(28, true)) fail(E.EINVAL);
    const sized = bytes => { if (packet.length !== bytes) fail(E.EINVAL); };
    if (operation === N.DOLLY_NENA_OPEN) {
      sized(32);
      const reply = new Uint8Array(8);
      new DataView(reply.buffer).setBigUint64(0, BigInt(scope), true);
      return { bytes: reply };
    }
    if (operation === N.DOLLY_NENA_CLOSE) { sized(32); return { bytes: new Uint8Array() }; }
    if (operation === N.DOLLY_NENA_MODULE) {
      sized(40);
      if (view.getUint32(36, true)) fail(E.EINVAL);
      return { bytes: moduleRecord(modules.list()[view.getUint32(32, true)] ?? fail(E.ENOENT)) };
    }
    if (operation !== N.DOLLY_NENA_ENABLE && operation !== N.DOLLY_NENA_DISABLE) fail(E.EINVAL);
    sized(72);
    const field = packet.subarray(32, 32 + N.DOLLY_NENA_NAME_BYTES), end = field.indexOf(0);
    if (end < 1 || field.subarray(end).some(byte => byte) || view.getUint32(68, true)) fail(E.EINVAL);
    let name;
    try { name = decoder.decode(field.subarray(0, end)); } catch { fail(E.EINVAL); }
    const version = view.getUint32(64, true), enabling = operation === N.DOLLY_NENA_ENABLE;
    const found = () => modules.list().find(module => module.name === name && module.version === version) ?? fail(E.ENOENT);
    const value = requirement(found());
    // The session gives the privilege up: answered first, since the answer
    // travels through the provider that the switch takes away.
    if (!enabling && name === "nena") return { bytes: moduleRecord({ ...found(), enabled: false }), after: () => modules.disable(value) };
    const refusal = await (enabling ? modules.enable(value) : modules.disable(value));
    return { bytes: moduleRecord(found(), refusal ?? undefined), enabled: enabledSince() };
  }
  return {
    messages: {
      async "nena-request"(message) {
        let result;
        try { result = await dispatch(message.packet); }
        catch (error) { result = { error: error.errno ?? E.EIO, bytes: new Uint8Array() }; }
        if (result.enabled) send({ type: "nena-record", enabled: result.enabled });
        send({ type: "nena-complete", scope: message.scope, sequence: message.sequence, error: result.error ?? 0,
          bytes: result.bytes }, [result.bytes.buffer]);
        await result.after?.();
      },
      "nena-revoke"(message) { send({ type: "nena-complete", scope: message.scope, revoked: true }); },
    },
    // A loaded session has the modules its record lists again, before its
    // ENTRY. One the page cannot enable now is said so, with the command that
    // tries again.
    async start({ enabled }) {
      for (const value of enabled) {
        const refusal = await modules.enable(value);
        if (refusal) showStatus(`${value} is not enabled: ${refusal}. nena enable ${value.split("@")[0]} tries again.`, true);
      }
      send({ type: "nena-record", enabled: enabledSince() });
    },
  };
}

export function worker({ send, get }) {
  let bridge, files;
  return {
    bindings: { "env.dolly_nena_dispatch": (address, bytes) =>
      bridge ? bridge.dispatch({ address, bytes }) : -E.ENOSYS },
    // After the image and a saved session are restored: the record names what
    // the page enables again. The file is the session's own, so it is bounded
    // and parsed as requirements; a malformed one enables nothing.
    start({ dolly, memory, kernelExports }) {
      bridge = createLeaseBridge(lease, memory, Number(dolly._dolly_nena_mailbox_address()), send,
        () => get("runtime").serviceDeferred());
      files = bootFiles(kernelExports, memory);
      let enabled = [];
      try { enabled = hostRequirements(decoder.decode(files.read(record, 4096)).split("\n").filter(Boolean)); } catch {}
      return { enabled };
    },
    messages: {
      "nena-complete": message => bridge?.acknowledge(message),
      "nena-record"({ enabled }) {
        if (enabled.length) files.write(record, `${enabled.join("\n")}\n`); else files.remove(record);
      },
    },
    dispose() { bridge?.dispose(); bridge = undefined; },
  };
}
