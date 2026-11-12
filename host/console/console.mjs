import { DOLLY_CONSOLE_TRANSFER_BYTES, DOLLY_ERRNO as E } from "./abi.mjs";

// console@0: the standard streams of a program the page starts in the
// session (dolly-console-0.wat), a terminal or three pipes. The page's
// openConsole() is an embedding's way to give a session to something else, a
// socket to another machine or a second view, or to run a program on input it
// has; nothing of it reaches a program but the bytes, the size and the end.
const encoder = new TextEncoder();
const checked = result => {
  if (result < 0) throw new Error(`console@0: ${Object.keys(E).find(name => E[name] === -result) ?? `errno ${-result}`}`);
  return result;
};

// What the page holds of a console's output before the Worker stops reading
// it: a reader that does not read leaves the program waiting, not the page
// growing.
const WINDOW_BYTES = 4 * 1024 * 1024;

export function browser({ ask, send }) {
  // Each console's streams and status until all have ended.
  const consoles = new Map();
  const settle = (id, step) => {
    const entry = consoles.get(id);
    step(entry);
    if (entry.open === 0 && entry.status !== undefined) consoles.delete(id);
  };
  return {
    page: {
      // argv's program on a terminal of `columns` by `rows`, or with `pipes`
      // on three pipes. Its `output` (and a pipe console's `errors`) is what
      // the programs write; write() takes bytes or text, Ctrl+C included at a
      // terminal, and resolves to how many it took, fewer while the input is
      // full; endInput() ends a pipe console's input; `exited` is the
      // program's status.
      async openConsole({ columns = 80, rows = 24, argv, pipes = false } = {}) {
        const id = await ask({ type: "console-open", columns, rows, argv, pipes });
        const entry = { streams: [], open: pipes ? 2 : 1, status: undefined, full: new Set() };
        consoles.set(id, entry);
        const stream = descriptor => new ReadableStream({
          start(controller) { entry.streams[descriptor] = controller; },
          pull() {
            if (entry.full?.delete(descriptor)) send({ type: "console-resume", id, descriptor });
          },
        }, new ByteLengthQueuingStrategy({ highWaterMark: WINDOW_BYTES }));
        return {
          output: stream(1),
          ...pipes ? { errors: stream(2), endInput: () => ask({ type: "console-end-input", id }) } : {},
          exited: new Promise(resolve => { entry.exit = resolve; }),
          write: bytes => ask({ type: "console-write", id, bytes: typeof bytes === "string" ? encoder.encode(bytes) : bytes }),
          resize: (columns, rows) => ask({ type: "console-resize", id, columns, rows }),
          close: () => ask({ type: "console-close", id }),
        };
      },
    },
    messages: {
      "console-output"({ id, descriptor, bytes }) {
        const entry = consoles.get(id);
        if (!entry) return;
        const stream = entry.streams[descriptor];
        stream.enqueue(bytes);
        if (stream.desiredSize <= 0 && !entry.full.has(descriptor)) {
          entry.full.add(descriptor);
          send({ type: "console-pause", id, descriptor });
        }
      },
      "console-ended"({ id, descriptor }) { settle(id, entry => { entry.open--; entry.streams[descriptor].close(); }); },
      "console-exited"({ id, status }) { settle(id, entry => { entry.status = status; entry.exit(status); }); },
    },
  };
}

// The Worker side reads every console on each service tick, after the kernel
// ran: what the programs wrote goes to the page, and once they have closed
// all a console's output it ends and is freed.
export function worker({ send, get }) {
  let kernel, supervisor, address;
  // Each open console's descriptors still read: [1] for a terminal, [1, 2] for pipes;
  // and those the page asked to pause until its reader catches up.
  const open = new Map(), paused = new Set();
  const transfer = () => new Uint8Array(get("runtime").memory.buffer, address, DOLLY_CONSOLE_TRANSFER_BYTES);
  return {
    imageRestored(context) {
      ({ kernel, supervisor } = context);
      address = Number(kernel.dolly_console_transfer_address());
    },
    service() {
      for (const [id, descriptors] of open) {
        for (const descriptor of [...descriptors]) {
          if (paused.has(`${id}:${descriptor}`)) continue;
          let count;
          while ((count = Number(kernel.dolly_console_read(id, descriptor, BigInt(DOLLY_CONSOLE_TRANSFER_BYTES)))) > 0) {
            send({ type: "console-output", id, descriptor, bytes: transfer().slice(0, count) });
          }
          if (count !== 0) continue;
          descriptors.delete(descriptor);
          send({ type: "console-ended", id, descriptor });
        }
        if (descriptors.size !== 0) continue;
        open.delete(id);
        for (const descriptor of [1, 2]) paused.delete(`${id}:${descriptor}`);
        kernel.dolly_console_close(id);
      }
    },
    messages: {
      "console-open"({ columns, rows, argv, pipes }) {
        if (!pipes && (!Number.isInteger(columns) || !Number.isInteger(rows))) throw new Error("console@0: a size is two integers");
        const id = checked(pipes ? kernel.dolly_console_open_pipes() : kernel.dolly_console_open(columns, rows));
        let exited;
        try { exited = supervisor.spawn(argv, { start: size => kernel.dolly_console_spawn(id, size) }); }
        catch (error) { kernel.dolly_console_close(id); throw error; }
        open.set(id, new Set(pipes ? [1, 2] : [1]));
        exited.then(({ status }) => send({ type: "console-exited", id, status }),
          () => send({ type: "console-exited", id, status: -1 }));
        return id;
      },
      "console-write"({ id, bytes }) {
        if (!(bytes instanceof Uint8Array)) throw new Error("console@0: write takes bytes");
        const length = Math.min(bytes.length, DOLLY_CONSOLE_TRANSFER_BYTES);
        transfer().set(bytes.subarray(0, length));
        const taken = Number(kernel.dolly_console_write(id, BigInt(length)));
        get("runtime").serviceDeferred();
        return taken === -E.EAGAIN ? 0 : checked(taken);
      },
      "console-end-input"({ id }) {
        checked(kernel.dolly_console_end_input(id));
        get("runtime").serviceDeferred();
      },
      "console-resize"({ id, columns, rows }) {
        checked(kernel.dolly_console_resize(id, columns, rows));
        get("runtime").serviceDeferred();
      },
      "console-pause"({ id, descriptor }) { paused.add(`${id}:${descriptor}`); },
      "console-resume"({ id, descriptor }) {
        paused.delete(`${id}:${descriptor}`);
        get("runtime").serviceDeferred();
      },
      "console-close"({ id }) {
        const descriptors = open.get(id);
        if (!descriptors) return;
        open.delete(id);
        for (const descriptor of [1, 2]) paused.delete(`${id}:${descriptor}`);
        kernel.dolly_console_close(id);
        for (const descriptor of descriptors) send({ type: "console-ended", id, descriptor });
        get("runtime").serviceDeferred();
      },
    },
  };
}
