import { DOLLY_ERRNO } from "../../src/process-constants.mjs";

const encoder = new TextEncoder();

// Boot files cross between the Worker and the in-Wasm filesystem through three
// kernel exports, which take paths and bytes copied into kernel memory.
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
  return {
    write(path, value) {
      const bytes = typeof value === "string" ? encoder.encode(value) : value;
      if (!(bytes instanceof Uint8Array)) throw new TypeError("invalid Dolly boot file");
      const status = withPath(path, pathAddress => withBytes(bytes, address =>
        kernel.dolly_write_file(pathAddress, address, BigInt(bytes.length))));
      if (status !== 0) throw new Error(`Dolly could not write ${path}: status ${status}`);
    },
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
