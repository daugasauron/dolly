import { DOLLY_CONSOLE_TRANSFER_BYTES, DOLLY_ERRNO as E } from "./abi.mjs";

// console@0: terminals the page holds into the session, each with a root
// process started on it (dolly-console-0.wat). The page's openConsole() is an
// embedding's way to give a session to something else, a socket to another
// machine or a second view; nothing of it reaches a program but the bytes
// typed, the size and the hang-up.
const encoder = new TextEncoder();
const checked = result => {
  if (result < 0) throw new Error(`console@0: ${Object.keys(E).find(name => E[name] === -result) ?? `errno ${-result}`}`);
  return result;
};

export function browser({ ask }) {
  // Each console's stream and status until both have ended.
  const consoles = new Map();
  const settle = (id, step) => {
    const entry = consoles.get(id);
    step(entry);
    if (entry.ended && entry.status !== undefined) consoles.delete(id);
  };
  return {
    page: {
      // A console of `columns` by `rows` with argv's program on it. Its
      // `output` is what the programs show; write() types bytes or text and
      // resolves to how many were taken, fewer while the input is full;
      // `exited` is the root process's status.
      async openConsole({ columns = 80, rows = 24, argv } = {}) {
        const id = await ask({ type: "console-open", columns, rows, argv });
        const entry = { ended: false, status: undefined };
        consoles.set(id, entry);
        return {
          output: new ReadableStream({ start(controller) { entry.output = controller; } }),
          exited: new Promise(resolve => { entry.exit = resolve; }),
          write: bytes => ask({ type: "console-write", id, bytes: typeof bytes === "string" ? encoder.encode(bytes) : bytes }),
          resize: (columns, rows) => ask({ type: "console-resize", id, columns, rows }),
          close: () => ask({ type: "console-close", id }),
        };
      },
    },
    messages: {
      "console-output"({ id, bytes }) { consoles.get(id)?.output.enqueue(bytes); },
      "console-ended"({ id }) { settle(id, entry => { entry.ended = true; entry.output.close(); }); },
      "console-exited"({ id, status }) { settle(id, entry => { entry.status = status; entry.exit(status); }); },
    },
  };
}

// The Worker side reads every console on each service tick, after the kernel
// ran: what the programs showed goes to the page, and a console whose slave
// is closed ends and is freed.
export function worker({ send, get }) {
  let kernel, supervisor, address;
  const open = new Set();
  const transfer = () => new Uint8Array(get("runtime").memory.buffer, address, DOLLY_CONSOLE_TRANSFER_BYTES);
  return {
    imageRestored(context) {
      ({ kernel, supervisor } = context);
      address = Number(kernel.dolly_console_transfer_address());
    },
    service() {
      for (const id of open) {
        let count;
        while ((count = Number(kernel.dolly_console_read(id, BigInt(DOLLY_CONSOLE_TRANSFER_BYTES)))) > 0) {
          send({ type: "console-output", id, bytes: transfer().slice(0, count) });
        }
        if (count !== 0) continue;
        open.delete(id);
        kernel.dolly_console_close(id);
        send({ type: "console-ended", id });
      }
    },
    messages: {
      "console-open"({ columns, rows, argv }) {
        if (!Number.isInteger(columns) || !Number.isInteger(rows)) throw new Error("console@0: a size is two integers");
        const id = checked(kernel.dolly_console_open(columns, rows));
        let exited;
        try { exited = supervisor.spawn(argv, { console: id }); }
        catch (error) { kernel.dolly_console_close(id); throw error; }
        open.add(id);
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
      "console-resize"({ id, columns, rows }) {
        checked(kernel.dolly_console_resize(id, columns, rows));
        get("runtime").serviceDeferred();
      },
      "console-close"({ id }) {
        if (!open.delete(id)) return;
        kernel.dolly_console_close(id);
        get("runtime").serviceDeferred();
      },
    },
  };
}
