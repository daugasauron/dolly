import { DOLLY_ERRNO } from "./abi.mjs";

const encoder = new TextEncoder();

// Boot files cross between the Worker and the in-Wasm filesystem through four
// kernel exports, which take paths and bytes copied into kernel memory; a file
// larger than a piece is written once and appended to.
export function bootFiles(kernel, memory) {
  const allocate = size => {
    const address = Number(kernel.malloc(BigInt(Math.max(1, size))));
    if (address === 0) throw new Error("Dolly boot allocation failed");
    return address;
  };
  const withBytes = (bytes, use) => {
    const address = allocate(bytes.length);
    try {
      new Uint8Array(memory.buffer, address, bytes.length).set(bytes);
      return use(BigInt(address));
    } finally { kernel.free(BigInt(address)); }
  };
  const withPath = (path, use) => withBytes(encoder.encode(`${path}\0`), use);
  const put = (operation, path, value) => {
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    if (!(bytes instanceof Uint8Array)) throw new TypeError("invalid Dolly boot file");
    const status = withPath(path, pathAddress => withBytes(bytes, address =>
      operation(pathAddress, address, BigInt(bytes.length))));
    if (status !== 0) throw new Error(`Dolly could not write ${path}: status ${status}`);
  };
  return {
    write(path, value) { put(kernel.dolly_write_file, path, value); },
    append(path, value) { put(kernel.dolly_append_file, path, value); },
    // Guest-writable files are bounded before trusted code copies them.
    read(path, limit) {
      const address = allocate(limit);
      try {
        const size = withPath(path, pathAddress =>
          kernel.dolly_read_file(pathAddress, BigInt(address), BigInt(limit)));
        if (size === -DOLLY_ERRNO.EFBIG || size > limit) throw new Error(`${path} is larger than ${limit} bytes`);
        if (size < 0) throw new Error(`Dolly could not read ${path}: status ${size}`);
        return new Uint8Array(memory.buffer, address, size).slice();
      } finally { kernel.free(BigInt(address)); }
    },
    remove(path) {
      const status = withPath(path, pathAddress => kernel.dolly_remove_file(pathAddress));
      if (status !== 0 && status !== -DOLLY_ERRNO.ENOENT) throw new Error(`Dolly could not remove ${path}: status ${status}`);
    },
  };
}
