import { HttpError } from "./policy.mjs";
import { DOLLY_ERRNO } from "../../dist/dolly-errno.mjs";

function reservedLocalURL(url) {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  return host === "dolly.invalid" || host.endsWith(".dolly.invalid");
}

// Review all local authority here. Remote rules never grant these services;
// absent services (including in build workers) fail closed, not to Fetch.
// A service owns one reserved origin and admits a request by returning its
// limits from authorize(url, method, bytes). Enabled modules add theirs once
// the image ENTRY starts: build@0 (host/build/build.mjs) and packages@0
// (host/packages/packages.mjs).
export function localServicesTransport(remotePolicy, services = {}, remoteFetch = globalThis.fetch.bind(globalThis)) {
  function localRule(url, method, bytes) {
    const service = Object.values(services).find(candidate => candidate.origin === url.origin);
    const rule = !url.username && !url.password && !url.search && !url.hash
      ? service?.authorize(url, method, bytes) : undefined;
    if (!rule) throw new HttpError(DOLLY_ERRNO.EACCES, "Browser-local service request denied");
    return [service, rule];
  }
  return {
    policy: { authorize(url, method, headers, bytes) {
      if (!reservedLocalURL(url)) return remotePolicy.authorize(url, method, headers, bytes);
      const [, rule] = localRule(url, method, bytes);
      for (const name of [...headers.keys()]) headers.delete(name);
      return rule;
    } },
    fetchRequest: (url, init) => {
      url = new URL(url);
      if (!reservedLocalURL(url)) return remoteFetch(url, init);
      const [service] = localRule(url, init.method, init.body?.byteLength ?? 0);
      return service.fetch(url, { ...init, headers: new Headers() });
    },
  };
}
