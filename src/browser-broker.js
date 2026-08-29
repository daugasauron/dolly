// Web Crypto deliberately rejects SharedArrayBuffer views. Dolly's userspace
// memory is shared, so the explicit entropy broker fills an unshared buffer
// and then copies the result into Wasm memory.
addToLibrary({
  $initRandomFill: () => (view) => {
    const temporary = new Uint8Array(view.byteLength);
    for (let offset = 0; offset < temporary.length; offset += 65536) {
      crypto.getRandomValues(temporary.subarray(offset, offset + 65536));
    }
    view.set(temporary);
    return 0;
  },
});
