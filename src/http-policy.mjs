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
  maxResponseBytes: 64 * 1024 * 1024,
  timeoutMilliseconds: 120_000,
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
    maxResponseBytes: positiveInteger(
      rule.maxResponseBytes,
      defaultLimits.maxResponseBytes,
      "maxResponseBytes",
    ),
    timeoutMilliseconds: positiveInteger(
      rule.timeoutMilliseconds,
      defaultLimits.timeoutMilliseconds,
      "timeoutMilliseconds",
    ),
  });
}

function normalizeTrustedSource(source, applicationBase) {
  if (source === null || typeof source !== "object" ||
      typeof source.path !== "string" || !source.path.startsWith("/") ||
      !Number.isSafeInteger(source.byteLength) || source.byteLength <= 0) {
    throw new TypeError("invalid trusted Dolly bootstrap source");
  }
  const target = new URL(source.path.slice(1), applicationBase);
  if (!/^https?:$/.test(target.protocol) || target.search || target.hash) {
    throw new TypeError("invalid trusted Dolly bootstrap source URL");
  }
  return Object.freeze({
    href: target.href,
    maxRequestBytes: 1,
    maxResponseBytes: source.byteLength,
    timeoutMilliseconds: defaultLimits.timeoutMilliseconds,
    credentialHeaders: new Set(),
  });
}

export class DollyHttpPolicy {
  constructor(configuration, trustedSources = [], applicationBase = globalThis.location?.href) {
    this.hardened = configuration !== undefined;
    this.rules = this.hardened
      ? Object.freeze((configuration.rules ?? []).map(normalizeRule))
      : Object.freeze([]);
    this.maxRequests = positiveInteger(
      configuration?.maxRequests,
      defaultLimits.maxRequests,
      "maxRequests",
    );
    this.trustedSources = new Map(trustedSources.map((source) => {
      const rule = normalizeTrustedSource(source, applicationBase);
      return [rule.href, rule];
    }));
    this.requests = 0;
  }

  authorize(target, method, headers, requestBytes) {
    if (++this.requests > this.maxRequests) {
      throw new Error("Dolly HTTP request quota exceeded");
    }
    const upperMethod = method.toUpperCase();
    let rule = upperMethod === "GET" && requestBytes === 0 &&
      target.username === "" && target.password === "" &&
      target.search === "" && target.hash === ""
      ? this.trustedSources.get(target.href)
      : undefined;
    if (rule) {
      // Recipe and source URLs are build inputs selected by the embedding page,
      // not capabilities granted by an untrusted Dollyfile. They are exact,
      // read-only, credential-free URLs with byte-for-byte response limits.
      for (const name of credentialHeaderNames) headers.delete(name);
    } else if (this.hardened) {
      rule = this.rules.find((candidate) =>
        candidate.origin === target.origin &&
        (candidate.path === null
          ? target.pathname.startsWith(candidate.pathPrefix)
          : target.pathname === candidate.path) &&
        candidate.methods.has(upperMethod));
      if (!rule) throw new Error("Dolly HTTP policy denied the request");
    } else {
      if (target.protocol !== "http:" && target.protocol !== "https:") {
        throw new Error("Dolly HTTP policy denied the request");
      }
      rule = {
        credentialHeaders: null,
        maxRequestBytes: defaultLimits.maxRequestBytes,
        maxResponseBytes: defaultLimits.maxResponseBytes,
        timeoutMilliseconds: defaultLimits.timeoutMilliseconds,
      };
    }
    if (requestBytes > rule.maxRequestBytes) {
      throw new Error("Dolly HTTP request exceeds its size limit");
    }

    // Credentials are ordinary sandbox state. Development mode preserves
    // them. A hardened destination rule must explicitly name which common
    // credential headers may leave for that exact destination.
    if (rule.credentialHeaders !== null) {
      for (const name of credentialHeaderNames) {
        if (!rule.credentialHeaders.has(name)) headers.delete(name);
      }
    }
    return rule;
  }
}

export function consumeDollyHttpPolicy(
  globalObject = globalThis,
  trustedSources = [],
  applicationBase = globalObject.location?.href,
) {
  const configuration = globalObject.DOLLY_HTTP_POLICY;
  Reflect.deleteProperty(globalObject, "DOLLY_HTTP_POLICY");
  return new DollyHttpPolicy(configuration, trustedSources, applicationBase);
}
