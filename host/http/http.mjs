import { createHttpAdmission, NetworkTransport } from "./broker.mjs";
import { consumeDollyHttpPolicy, httpPolicyConfigurations, restrictDollyHttpPolicy } from "./policy.mjs";
import { localServicesTransport } from "./local-services.mjs";
import { publicURL } from "../../src/static-asset.mjs";
export { DOLLY_HTTP_ABI_DIGEST as digest } from "./abi.mjs";

// The page consumes the embedding's policy once; a builder or headless host is
// given its network in configuration. Modules depending on http@0 add their
// local services to `services`.
export function browser({ applicationBase, bootstrapSources, inherited, configuration }) {
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
      transport = new NetworkTransport(message.memory, message.address, network.policy,
        { fetchRequest: network.fetchRequest, site: network.site });
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
    let policy = consumeDollyHttpPolicy(window, bootstrapSources, applicationBase);
    if (inherited) policy = restrictDollyHttpPolicy(policy, inherited.policies, bootstrapSources, applicationBase);
    // A path names a file of this page's site; a builder has no site.
    network = { ...localServicesTransport(policy, services), site: publicURL("", applicationBase).href };
    // Builders inherit the policy and no local service; an opened result tab
    // or restored session inherits the policy configurations.
    instance.builder = { network: localServicesTransport(policy) };
    instance.inherited = { policies: httpPolicyConfigurations(policy) };
  }
  return instance;
}

export function worker({ send, get }) {
  const admission = createHttpAdmission(request => send({ type: "http-request", ...request }));
  return {
    bindings: { "env.dolly_http_dispatch": (method, methodSize, url, urlSize, headers, headersSize,
      body, bodySize, flags, sequence) => admission.dispatch({ memory: get("runtime").memory.buffer,
        method, methodSize, url, urlSize, headers, headersSize, body, bodySize, flags, sequence }) },
    start({ dolly, memory }) {
      return { admission: admission.control.buffer, memory: memory.buffer,
        address: Number(dolly._dolly_http_mailbox_address()) };
    },
  };
}
