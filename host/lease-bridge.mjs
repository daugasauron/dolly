import { DOLLY_ERRNO as E } from "../src/process-constants.mjs";

// The Worker side of a device leased per process (src/device-lease.c). Each
// packet a process submits goes to the page as `TYPE-request`; the page's
// `TYPE-complete` is published in the lease's reply slot, a 64-byte header and
// `replyBytes`. `open` and `close` are the device's operation numbers.
export function createLeaseBridge({ type, slots: count, packetBytes, replyBytes, open, close }, memory, mailbox, send, complete) {
  const slots = new Array(count), stride = 64 + replyBytes;
  if (!Number.isSafeInteger(mailbox) || mailbox <= 0 || mailbox % 4 ||
      mailbox > memory.buffer.byteLength - count * stride) throw new Error(`Invalid ${type} mailbox`);
  function acknowledge(message) {
    const slot = (message.scope - 1) % count, entry = slots[slot];
    if (!entry || entry.scope !== message.scope) return;
    if (message.revoked) slots[slot] = undefined;
    else if (entry.sequence === message.sequence) {
      const valid = message.bytes instanceof Uint8Array && message.bytes.byteLength <= replyBytes &&
        Number.isInteger(message.error) && message.error >= 0 && message.error <= 4095;
      const error = valid ? message.error : E.EIO, bytes = valid && !error ? message.bytes : new Uint8Array();
      const words = new Int32Array(memory.buffer, mailbox + slot * stride, 16);
      new Uint8Array(memory.buffer, mailbox + slot * stride + 64, bytes.length).set(bytes);
      Atomics.store(words, 1, entry.scope); Atomics.store(words, 2, entry.sequence);
      Atomics.store(words, 3, error); Atomics.store(words, 4, bytes.length); Atomics.store(words, 0, 1);
      entry.pending = false;
      if (!entry.released && (entry.operation === close || (entry.operation === open && error))) slots[slot] = undefined;
    }
    complete();
  }
  function dispatch({address: addressValue, bytes: sizeValue}) {
    const address = Number(addressValue), size = Number(sizeValue);
    if (!Number.isSafeInteger(address) || !Number.isSafeInteger(size) || address < 0 || size <= 0) return -E.EINVAL;
    if (!address) {
      if (size > 0xffffffff) return -E.EINVAL;
      const entry = slots[(size - 1) % count];
      if (entry?.scope === size && !entry.released) {
        entry.released = true; send({type: `${type}-revoke`, scope: size});
      }
      return 0;
    }
    if (size < 32 || size > packetBytes || address > memory.buffer.byteLength - size) return -E.EINVAL;
    const packet = new Uint8Array(memory.buffer, address, size).slice();
    const view = new DataView(packet.buffer), scope = view.getUint32(8, true), sequence = view.getUint32(16, true);
    const operation = view.getUint32(4, true);
    if (!scope || !sequence || view.getUint32(12, true) || view.getUint32(20, true)) return -E.EINVAL;
    const slot = (scope - 1) % count, entry = slots[slot];
    if (entry?.pending || entry?.released) return -E.EBUSY;
    if (entry && operation === open) return -E.EBUSY;
    if (entry && entry.scope !== scope) return -E.EBUSY;
    if (!entry && operation !== open) return -E.EBADF;
    if (entry && sequence <= entry.sequence) return -E.ESTALE;
    slots[slot] = {scope, sequence, operation, pending: true, released: false};
    send({type: `${type}-request`, scope, sequence, packet}, [packet.buffer]);
    return 0;
  }
  return {dispatch, acknowledge};
}
