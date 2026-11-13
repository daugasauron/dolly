// Shared by packaging and browser admission; empty arguments are valid.
export function decodeImageEntry(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 16 || bytes.byteLength > 64 * 1024) {
    throw new TypeError("invalid image ENTRY record");
  }
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (decoder.decode(bytes.subarray(0, 8)) !== "DOLLYENT" || view.getUint32(8, true) !== 1) {
    throw new TypeError("invalid image ENTRY version");
  }
  const count = view.getUint32(12, true);
  if (count === 0 || count > 256) throw new TypeError("invalid image ENTRY count");
  let offset = 16;
  const arguments_ = [];
  for (let index = 0; index < count; ++index) {
    if (offset > bytes.byteLength - 4) throw new TypeError("truncated image ENTRY");
    const size = view.getUint32(offset, true);
    offset += 4;
    if (size > 4096 || offset > bytes.byteLength - size) throw new TypeError("invalid image ENTRY argument");
    const value = decoder.decode(bytes.subarray(offset, offset + size));
    if (value.includes("\0")) throw new TypeError("image ENTRY has a NUL argument");
    arguments_.push(value);
    offset += size;
  }
  if (offset !== bytes.byteLength || !arguments_[0].startsWith("/")) {
    throw new TypeError("invalid image ENTRY payload");
  }
  return arguments_;
}
