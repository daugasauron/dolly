import { DOLLY_ERRNO } from "../../src/process-constants.mjs";
import { CANONICAL_ORIGIN } from "../../src/static-asset.mjs";

export class HttpError extends Error {
  constructor(errno, message) { super(message); this.errno = errno; }
}

const credentialHeaderNames = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "x-api-key",
  "api-key",
  "x-goog-api-key",
]);

// Fetch owns these transport headers. Forwarding native libcurl values is not
// merely ineffective: engines disagree about whether to discard them or turn
// the request into a CORS preflight. In particular Firefox preflights a
// caller-supplied User-Agent, which makes otherwise CORS-enabled PyPI GETs
// fail. Normalize that browser variance at Dolly's broker boundary.
const browserOwnedTransportHeaderNames = new Set([
  "accept-encoding",
  "connection",
  "content-length",
  "host",
  "transfer-encoding",
  "user-agent",
]);

export function isDollyCredentialHeader(name) {
  return credentialHeaderNames.has(String(name).toLowerCase());
}

export function stripDollyBrowserOwnedHeaders(headers) {
  for (const name of browserOwnedTransportHeaderNames) headers.delete(name);
  return headers;
}

const defaultLimits = Object.freeze({
  maxRequests: 256,
  maxRequestBytes: 8 * 1024 * 1024,
  maxResponseBytes: Infinity,
  timeoutMilliseconds: 600_000,
});

function positiveInteger(value, fallback, name) {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result <= 0) {
    throw new TypeError(`invalid Dolly HTTP policy ${name}`);
  }
  return result;
}

function normalizeRule(rule) {
  if (rule === null || typeof rule !== "object") {
    throw new TypeError("invalid Dolly HTTP policy rule");
  }
  const origin = new URL(rule.origin).origin;
  if (origin !== rule.origin || !/^https?:$/.test(new URL(origin).protocol)) {
    throw new TypeError("Dolly HTTP policy origins must be exact HTTP(S) origins");
  }
  if (rule.path !== undefined && rule.pathPrefix !== undefined) {
    throw new TypeError("Dolly HTTP policy rules cannot combine path and pathPrefix");
  }
  const path = rule.path === undefined ? null : String(rule.path);
  const pathPrefix = rule.pathPrefix ?? "/";
  if (path !== null && !path.startsWith("/")) {
    throw new TypeError("Dolly HTTP policy paths must start with /");
  }
  if (typeof pathPrefix !== "string" || !pathPrefix.startsWith("/")) {
    throw new TypeError("Dolly HTTP policy path prefixes must start with /");
  }
  const methods = new Set((rule.methods ?? ["GET", "HEAD"]).map((method) => {
    if (typeof method !== "string" || !/^[A-Z]+$/.test(method)) {
      throw new TypeError("Dolly HTTP policy methods must be uppercase tokens");
    }
    return method;
  }));
  if (rule.credential !== undefined) {
    throw new TypeError(
      "Dolly HTTP credentials belong inside the sandbox; use credentialHeaders",
    );
  }
  const credentialHeaders = new Set((rule.credentialHeaders ?? []).map((value) => {
    const name = String(value).toLowerCase();
    if (!credentialHeaderNames.has(name)) {
      throw new TypeError(`invalid Dolly HTTP credential header: ${name}`);
    }
    return name;
  }));
  return Object.freeze({
    origin,
    path,
    pathPrefix,
    methods,
    credentialHeaders,
    maxRequestBytes: positiveInteger(
      rule.maxRequestBytes,
      defaultLimits.maxRequestBytes,
      "maxRequestBytes",
    ),
    maxResponseBytes: rule.maxResponseBytes == null ? Infinity :
      positiveInteger(rule.maxResponseBytes, undefined, "maxResponseBytes"),
    timeoutMilliseconds: positiveInteger(
      rule.timeoutMilliseconds,
      defaultLimits.timeoutMilliseconds,
      "timeoutMilliseconds",
    ),
  });
}

// Whole segments only: "/v1" admits "/v1" and "/v1/x", never "/v1-admin".
// Encoded separators could re-segment the path on the server.
function pathWithin(pathname, prefix) {
  if (/%(?:2f|5c)/i.test(pathname)) return false;
  return pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
}

// Recipes name a published file by its canonical URL; the embedding fetches it
// from its own release (applicationBase), the canonical origin's mirror.
function normalizeTrustedSource(source, applicationBase) {
  if (source === null || typeof source !== "object" ||
      typeof source.path !== "string" || !source.path.startsWith("/") ||
      !Number.isSafeInteger(source.byteLength) || source.byteLength <= 0) {
    throw new TypeError("invalid trusted Dolly bootstrap source");
  }
  const mirror = new URL(source.path.slice(1), applicationBase);
  if (!/^https?:$/.test(mirror.protocol) || mirror.search || mirror.hash) {
    throw new TypeError("invalid trusted Dolly bootstrap source URL");
  }
  return Object.freeze({
    href: new URL(`${CANONICAL_ORIGIN}${source.path}`).href,
    mirror: mirror.href,
    bootstrap: true,
    maxRequestBytes: 1,
    maxResponseBytes: source.byteLength,
    timeoutMilliseconds: defaultLimits.timeoutMilliseconds,
    credentialHeaders: new Set(),
  });
}

// A relay is the embedding's transport for an origin whose responses the
// browser will not let a page read (no CORS headers). The policy still judges
// the real destination; an admitted request is then fetched from
// `through` + host + path + query. The relay sees the whole request, so it gets
// no credential header the embedding did not name for it.
function normalizeRelay(relay) {
  if (relay === null || typeof relay !== "object") throw new TypeError("invalid Dolly HTTP relay");
  const origin = new URL(relay.origin).origin;
  const through = new URL(relay.through);
  if (origin !== relay.origin || !/^https?:$/.test(new URL(origin).protocol) ||
      through.href !== relay.through || !/^https?:$/.test(through.protocol) ||
      !through.pathname.endsWith("/") || through.search || through.hash ||
      through.username || through.password) {
    throw new TypeError("a Dolly HTTP relay maps an exact origin to an HTTP(S) URL prefix ending in /");
  }
  const credentialHeaders = new Set((relay.credentialHeaders ?? []).map((value) => {
    const name = String(value).toLowerCase();
    if (!credentialHeaderNames.has(name)) throw new TypeError(`invalid Dolly HTTP credential header: ${name}`);
    return name;
  }));
  return [origin, Object.freeze({ through: through.href, credentialHeaders })];
}

// Where an admitted request for a relayed origin is fetched from.
function relayUrl(relays, target, headers) {
  const relay = relays.get(target.origin);
  if (!relay) return undefined;
  for (const name of credentialHeaderNames) {
    if (!relay.credentialHeaders.has(name)) headers.delete(name);
  }
  return `${relay.through}${target.host}${target.pathname}${target.search}`;
}

export class DollyHttpPolicy {
  constructor(configuration, trustedSources = [], applicationBase = globalThis.location?.href, relays = []) {
    if (!Array.isArray(relays) || relays.length > 64) throw new TypeError("invalid Dolly HTTP relays");
    this.relays = new Map(relays.map(normalizeRelay));
    this.hardened = configuration !== undefined;
    this.rules = this.hardened
      ? Object.freeze((configuration.rules ?? []).map(normalizeRule))
      : Object.freeze([]);
    this.maxRequests = this.hardened ? positiveInteger(
      configuration?.maxRequests,
      defaultLimits.maxRequests,
      "maxRequests",
    ) : Infinity;
    this.trustedSources = new Map(trustedSources.map((source) => {
      const rule = normalizeTrustedSource(source, applicationBase);
      return [rule.href, rule];
    }));
    // Each exact build input may be fetched a few times per page, not endlessly.
    this.maxBootstrapRequests = this.hardened ? 4 * this.trustedSources.size : Infinity;
    this.requests = 0;
    this.bootstrapRequests = 0;
  }

  authorize(target, method, headers, requestBytes) {
    const upperMethod = method.toUpperCase();
    let rule = upperMethod === "GET" && requestBytes === 0 &&
      target.username === "" && target.password === "" &&
      target.search === "" && target.hash === ""
      ? this.trustedSources.get(target.href)
      : undefined;
    if (rule) {
      // Canonical recipe and source URLs are build inputs selected by the
      // embedding page and fetched from its mirror, not capabilities granted
      // by an untrusted Dollyfile. They are exact, read-only, credential-free
      // URLs with byte-for-byte response limits and their own quota, so a
      // large source graph cannot exhaust agent requests.
      if (++this.bootstrapRequests > this.maxBootstrapRequests) {
        throw new HttpError(DOLLY_ERRNO.EDQUOT, "Dolly bootstrap source quota exceeded");
      }
      for (const name of credentialHeaderNames) headers.delete(name);
    } else {
      if (++this.requests > this.maxRequests) {
        throw new HttpError(DOLLY_ERRNO.EDQUOT, "Dolly HTTP request quota exceeded");
      }
      if (this.hardened) {
        rule = this.rules.find((candidate) =>
          candidate.origin === target.origin &&
          (candidate.path === null
            ? pathWithin(target.pathname, candidate.pathPrefix)
            : target.pathname === candidate.path) &&
          candidate.methods.has(upperMethod));
        if (!rule) throw new HttpError(DOLLY_ERRNO.EACCES, "Dolly HTTP policy denied the request");
      } else {
        rule = {
          followRedirects: true,
          credentialHeaders: null,
          maxRequestBytes: defaultLimits.maxRequestBytes,
          maxResponseBytes: defaultLimits.maxResponseBytes,
          timeoutMilliseconds: defaultLimits.timeoutMilliseconds,
        };
      }
    }
    if (requestBytes > rule.maxRequestBytes) {
      throw new HttpError(DOLLY_ERRNO.E2BIG, "Dolly HTTP request exceeds its size limit");
    }

    // Credentials are ordinary sandbox state. Development mode preserves
    // them. A hardened destination rule must explicitly name which common
    // credential headers may leave for that exact destination.
    if (rule.credentialHeaders !== null) {
      for (const name of credentialHeaderNames) {
        if (!rule.credentialHeaders.has(name)) headers.delete(name);
      }
    }
    const relay = rule.bootstrap ? undefined : relayUrl(this.relays, target, headers);
    return relay ? { ...rule, followRedirects: false, relay } : rule;
  }
}

export function consumeDollyHttpPolicy(
  globalObject = globalThis,
  trustedSources = [],
  applicationBase = globalObject.location?.href,
) {
  const configuration = globalObject.DOLLY_HTTP_POLICY, relays = globalObject.DOLLY_HTTP_RELAYS;
  Reflect.deleteProperty(globalObject, "DOLLY_HTTP_POLICY");
  Reflect.deleteProperty(globalObject, "DOLLY_HTTP_RELAYS");
  return new DollyHttpPolicy(configuration, trustedSources, applicationBase, relays);
}

// Trusted browser state for an explicitly opened result tab, never Wasm data.
export function httpPolicyConfigurations(policy) {
  if (policy.configurations) return policy.configurations;
  return [policy.hardened ? { maxRequests: policy.maxRequests, rules: policy.rules.map(rule => ({
    origin: rule.origin, ...(rule.path === null ? { pathPrefix: rule.pathPrefix } : { path: rule.path }),
    methods: [...rule.methods], credentialHeaders: [...rule.credentialHeaders],
    maxRequestBytes: rule.maxRequestBytes,
    ...(Number.isFinite(rule.maxResponseBytes) ? { maxResponseBytes: rule.maxResponseBytes } : {}),
    timeoutMilliseconds: rule.timeoutMilliseconds,
  })) } : null];
}

export function restrictDollyHttpPolicy(policy, inherited, trustedSources, applicationBase) {
  if (!Array.isArray(inherited) || inherited.length === 0 || inherited.length > 16 ||
      new TextEncoder().encode(JSON.stringify(inherited)).byteLength > 65536) {
    throw new Error("Invalid inherited image HTTP policy");
  }
  const configurations = [...new Set([...httpPolicyConfigurations(policy), ...inherited].map(value => JSON.stringify(value)))].map(value => JSON.parse(value));
  const policies = configurations.map(configuration => new DollyHttpPolicy(configuration ?? undefined, trustedSources, applicationBase));
  return {
    configurations,
    // Relays are this page's transport, not inherited authority.
    relays: policy.relays,
    authorize(target, method, headers, bytes) {
      // Every policy must allow it. Sequential header stripping intersects
      // credentials too; neither the parent nor the new embedding can widen it.
      const rules = policies.map(policy => policy.authorize(target, method, headers, bytes));
      // Every policy maps the same trusted sources to the same mirror.
      const bootstrap = rules.every(rule => rule.bootstrap === true);
      const relay = bootstrap ? undefined : relayUrl(policy.relays, target, headers);
      return {
        bootstrap,
        ...(bootstrap && { mirror: rules[0].mirror }),
        ...(relay && { relay }),
        followRedirects: !relay && rules.every(rule => rule.followRedirects === true),
        maxRequestBytes: Math.min(...rules.map(rule => rule.maxRequestBytes)),
        maxResponseBytes: Math.min(...rules.map(rule => rule.maxResponseBytes)),
        timeoutMilliseconds: Math.min(...rules.map(rule => rule.timeoutMilliseconds)),
      };
    },
  };
}
