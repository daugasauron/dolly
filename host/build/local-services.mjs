import { HttpError } from "../http/policy.mjs";
import { DOLLY_ERRNO } from "../../dist/dolly-errno.mjs";
import { BUILD_ORIGIN, BUILD_LIMITS } from "./service.mjs";

function reservedLocalURL(url) {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  return host === "dolly.invalid" || host.endsWith(".dolly.invalid");
}

// Review all local authority here. Remote rules never grant these services;
// absent services (including in build workers) fail closed, not to Fetch.
// The page adds services.build only for an enabled build@0 after ENTRY starts.
export function localServicesTransport(remotePolicy, services = {}, remoteFetch = globalThis.fetch.bind(globalThis)) {
  function localRule(url, method, bytes) {
    const { build } = services;
    if (!url.username && !url.password && !url.search && !url.hash) {
      if (build && url.origin === BUILD_ORIGIN && bytes <= BUILD_LIMITS.maxRequestBytes && method === "POST" &&
          url.pathname === "/v1/builds") return [build, BUILD_LIMITS];
    }
    throw new HttpError(DOLLY_ERRNO.EACCES, "Browser-local service request denied");
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
