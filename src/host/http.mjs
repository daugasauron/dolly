import { createHttpAdmission, NetworkTransport } from "../http-broker.mjs";
import { DOLLY_HTTP_MAILBOX_VERSION, DOLLY_HTTP_SLOT_COUNT } from "./http-abi.mjs";

export const contract = Object.freeze({ name: "http", version: 0, header: "dolly/http.h",
  abi: ["dolly-http-0"], dependencies: ["runtime@0"], phase: "kernel",
  imports: ["env.dolly_http_dispatch"] });

export function browser({ send, network }) {
  let transport, admission;
  return {
    get transport() { return transport; },
    start(message) {
      if (transport || message.version !== DOLLY_HTTP_MAILBOX_VERSION || message.slots !== DOLLY_HTTP_SLOT_COUNT ||
          !(message.admission instanceof SharedArrayBuffer) || message.admission.byteLength !== 8) {
        throw new Error("invalid HTTP provider handshake");
      }
      admission = new Int32Array(message.admission);
      transport = new NetworkTransport(message.memory, message.address, message.capacity,
        network.policy, { fetchRequest: network.fetchRequest });
    },
    messages: {
      async "http-request"(message) {
        if (!transport) throw new Error("HTTP request before provider initialization");
        const result = await transport.dispatch(message);
        Atomics.store(admission, 1, result);
        Atomics.store(admission, 0, 0);
        Atomics.notify(admission, 0);
      },
    },
    dispose() { transport?.close(); },
  };
}

export function worker({ send, get }) {
  const admission = createHttpAdmission(request => send({ type: "http-request", ...request }));
  return {
    bindings: { "env.dolly_http_dispatch": (method, methodSize, url, urlSize, headers, headersSize,
      body, bodySize, flags, sequence) => admission.dispatch({ memory: get("runtime").memory.buffer,
        method, methodSize, url, urlSize, headers, headersSize, body, bodySize, flags, sequence }) },
    start({ dolly, memory }) {
      return { admission: admission.control.buffer, memory: memory.buffer,
        address: Number(dolly._dolly_http_mailbox_address()), capacity: dolly._dolly_http_chunk_capacity(),
        slots: dolly._dolly_http_slot_count(), version: dolly._dolly_http_mailbox_version() };
    },
  };
}
