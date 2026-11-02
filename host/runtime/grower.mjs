// Grows a shared memory, the kernel's or a process's, for the runtime Worker
// (runtime.mjs, process-supervisor.mjs), which hands it the memory and a
// control once. A growth is asked while the control's third word is 1: its
// first value, the pages asked, becomes the old size in pages or -1, and the
// word 0. Requests pass through the word, not messages: the kernel's growth
// waits in Atomics.wait, and Chrome keeps a message posted then to a Worker
// that started moments before until its sender's next task.
onmessage = ({ data: { memory, control } }) => {
  const values = new BigInt64Array(control), word = new Int32Array(control);
  postMessage("waiting");
  for (;;) {
    // A notify can be the asker's for a growth done already.
    while (Atomics.load(word, 2) === 0) Atomics.wait(word, 2, 0);
    try { values[0] = BigInt(memory.grow(values[0])); } catch { values[0] = -1n; }
    Atomics.store(word, 2, 0);
    Atomics.notify(word, 2);
  }
};
