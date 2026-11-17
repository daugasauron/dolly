import { createHttpAdmission, HttpMailbox, NetworkTransport } from "./broker.mjs";
import { localServicesTransport } from "./local-services.mjs";
export { DOLLY_HTTP_ABI_DIGEST as digest } from "./abi.mjs";

// The guest's requests, judged by the page's network (its policy, which the
// page takes once at load: page/network.mjs). Modules depending on http@0 add
// their local services to `services`; a child build host has none.
export function browser({ network, send, ask }) {
  let transport, admission;
  const services = {}, local = localServicesTransport(network.policy, services, network.fetchRequest);
  return {
    services,
    page: {
      get httpActive() { return transport?.active ?? false; },
      get httpRequestCount() { return transport?.requestCount ?? 0; },
      get httpCompletedRequestCount() { return transport?.completedRequestCount ?? 0; },
    },
    start(message) {
      if (transport || !(message.admission instanceof SharedArrayBuffer) || message.admission.byteLength !== 8) {
        throw new Error("invalid HTTP provider handshake");
      }
      admission = new Int32Array(message.admission);
      // The Worker writes the records into the guest's slots.
      const mailbox = { publish: record => ask({ type: "http-publish", ...record }, [record.bytes.buffer]),
        fail: ending => send({ type: "http-fail", ...ending }) };
      transport = new NetworkTransport(mailbox, local.policy, { fetchRequest: local.fetchRequest, site: network.site,
        refused: network.refused });
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

// The Worker copies each request out of kernel memory for the page to judge,
// and writes the page's records into the slots.
export function worker({ send, get }) {
  const admission = createHttpAdmission(request => send({ type: "http-request", ...request }));
  let mailbox;
  return {
    bindings: { "env.dolly_http_dispatch": (method, methodSize, url, urlSize, headers, headersSize,
      body, bodySize, flags, sequence) => admission.dispatch(mailbox.admission(get("runtime").memory.buffer,
        { method, methodSize, url, urlSize, headers, headersSize, body, bodySize, flags, sequence })) },
    messages: { "http-publish": record => mailbox.publish(record), "http-fail": ending => mailbox.fail(ending) },
    start({ kernel, memory }) {
      mailbox = new HttpMailbox(memory.buffer, Number(kernel.dolly_http_mailbox_address()));
      return { admission: admission.control.buffer };
    },
    // Switched off (nena@0): a program waiting on a transfer is told it ended.
    disabled() { mailbox?.cancelAll(); },
  };
}
