import { createHttpAdmission, HttpMailbox, NetworkTransport } from "./broker.mjs";
import { DollyHttpPolicy, httpPolicyConfigurations, restrictDollyHttpPolicy } from "./policy.mjs";
import { localServicesTransport } from "./local-services.mjs";
export { DOLLY_HTTP_ABI_DIGEST as digest } from "./abi.mjs";

// The page takes the embedding's policy once, with the image directory's
// trusted sources and, in a custom tab, the policies it inherited; a builder or
// headless host is given its network instead. Modules depending on http@0 add
// their local services to `services`.
export function browser({ applicationBase, configuration, send, ask }) {
  let transport, admission, network = configuration.network;
  const services = {};
  const instance = {
    services,
    get transport() { return transport; },
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
      transport = new NetworkTransport(mailbox, network.policy, { fetchRequest: network.fetchRequest, site: network.site });
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
  if (!network) {
    // A custom tab intersects the policy of the page that built it with its
    // own; a missing inheritance fails closed.
    const { embedding, sources, inherited } = configuration;
    let policy = new DollyHttpPolicy(embedding?.policy, sources, applicationBase, embedding?.relays);
    if (inherited) policy = restrictDollyHttpPolicy(policy, inherited.policies, sources, applicationBase);
    // A site path names a file of this page's site.
    const site = new URL(applicationBase).href;
    network = { ...localServicesTransport(policy, services), site };
    // Builders inherit the policy and no local service; an opened result tab
    // or restored session inherits the policy configurations.
    instance.builder = { network: { ...localServicesTransport(policy), site } };
    instance.inherited = { policies: httpPolicyConfigurations(policy) };
  }
  return instance;
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
  };
}
