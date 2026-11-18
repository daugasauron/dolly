import { DollyHttpPolicy, httpPolicyConfigurations, restrictDollyHttpPolicy } from "./http-policy.mjs";
import { refusalNotices } from "./http-refusals.mjs";
import { boundedAssetBlob } from "./static-asset.mjs";

// The page's network: the HTTP policy the embedding gives boot() (`http`:
// { policy, relays }), which a custom tab intersects with the policies it
// inherited, and every page with the policy its image declares (`declared`, its
// recipe's HTTP rows as the page or the catalog read them from the recipe's text,
// never from anything the guest wrote). Every host module's page side receives it (host/README.md), so one
// policy judges and counts what leaves the page for the guest: its requests
// through the broker (http@0) and the files a module reads for it (packages@0's
// other directories). Each refusal is a line in the console and a notice in
// MOUNT. `site` resolves a site path; `fetchRequest`, when given, fetches what
// the policy admits (an embedding's relay), by default the browser's fetch.
export function pageNetwork({ embedding = {}, inherited, declared, applicationBase, mount, keyboard, fetchRequest }) {
  let policy = new DollyHttpPolicy(embedding.policy, embedding.relays);
  // A tab that inherits and holds no policies fails closed.
  if (inherited) policy = restrictDollyHttpPolicy(policy, inherited.policies);
  if (declared) policy = restrictDollyHttpPolicy(policy, [declared]);
  return network(policy, new URL(applicationBase).href, fetchRequest, refusalNotices(mount, keyboard));
}

function network(policy, site, fetchRequest, notices) {
  const { refused } = notices;
  // A GET a host module makes for the guest, judged and counted as the guest's
  // own requests are and shown as theirs when refused: the rule that admits it.
  function admit(url) {
    try {
      return policy.authorize(url, "GET", new Headers(), 0);
    } catch (error) {
      refused({ method: "GET", target: url, reason: error.message });
      throw error;
    }
  }
  return {
    policy, site, fetchRequest, refused, admit,
    // A file the page fetches for a build (a SOURCE row's URL): admitted as
    // above, without credentials, at most LIMIT bytes and the rule's, in its
    // time. A Blob.
    async fetch(url, limit) {
      const target = new URL(url), rule = admit(target);
      const response = await (fetchRequest ?? globalThis.fetch)(rule.relay ? new URL(rule.relay) : target, {
        credentials: "omit", referrerPolicy: "no-referrer", redirect: "error",
        signal: AbortSignal.timeout(rule.timeoutMilliseconds) });
      return boundedAssetBlob(response, Math.min(limit, rule.maxResponseBytes));
    },
    claimsKey: notices.claimsKey,
    // What an opened result tab or a restored session inherits: trusted browser
    // state, never Wasm data.
    inherited: () => ({ policies: httpPolicyConfigurations(policy) }),
    // A child build host's: the same policy and count, refusals in the console.
    builder: () => network(policy, site, fetchRequest, refusalNotices()),
    dispose: notices.dispose,
  };
}

// Answers the fetches WORKER asks of the page's network ({ type:
// "network-fetch", url, limit, id }: a build's SOURCE files, site/build-worker.mjs).
export function serveNetworkFetches(network, worker) {
  worker.addEventListener("message", ({ data }) => {
    if (data?.type !== "network-fetch") return;
    network.fetch(data.url, data.limit).then(bytes => worker.postMessage({ type: "network-fetched", id: data.id, bytes }),
      error => worker.postMessage({ type: "network-fetched", id: data.id, error: error.message }));
  });
}
