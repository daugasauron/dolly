const credentialHeaderNames = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "x-api-key",
  "api-key",
  "x-goog-api-key",
]);

export function isDollyCredentialHeader(name) {
  return credentialHeaderNames.has(String(name).toLowerCase());
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

export class DollyHttpPolicy {
  constructor(configuration) {
    this.hardened = configuration !== undefined;
    this.rules = this.hardened
      ? Object.freeze((configuration.rules ?? []).map(normalizeRule))
      : Object.freeze([]);
    this.maxRequests = positiveInteger(
      configuration?.maxRequests,
      defaultLimits.maxRequests,
      "maxRequests",
    );
    this.requests = 0;
  }

  authorize(target, method, headers, requestBytes) {
    if (++this.requests > this.maxRequests) {
      throw new Error("Dolly HTTP request quota exceeded");
    }
    const upperMethod = method.toUpperCase();
    let rule;
    if (this.hardened) {
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

export function consumeDollyHttpPolicy(globalObject = globalThis) {
  const configuration = globalObject.DOLLY_HTTP_POLICY;
  Reflect.deleteProperty(globalObject, "DOLLY_HTTP_POLICY");
  return new DollyHttpPolicy(configuration);
}
