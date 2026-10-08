import assert from "node:assert/strict";
import test from "node:test";
import { consumeDollyHttpPolicy, DollyHttpPolicy, isDollyCredentialHeader, httpPolicyConfigurations, restrictDollyHttpPolicy } from "../host/http/policy.mjs";

test("response quotas are optional and finite inherited quotas cannot be widened", () => {
  const target = new URL("https://models.example/weights");
  const unlimited = new DollyHttpPolicy({ rules: [{ origin: target.origin }] });
  const finite = new DollyHttpPolicy({ rules: [{ origin: target.origin, maxResponseBytes: 1234 }] });
  const authorize = policy => policy.authorize(target, "GET", new Headers(), 0).maxResponseBytes;
  assert.equal(authorize(new DollyHttpPolicy()), Infinity);
  assert.equal(authorize(unlimited), Infinity);
  const restored = JSON.parse(JSON.stringify(httpPolicyConfigurations(unlimited)));
  assert.equal(authorize(restrictDollyHttpPolicy(new DollyHttpPolicy(), restored)), Infinity);
  for (const [parent, child] of [[finite, unlimited], [unlimited, finite]]) {
    assert.equal(authorize(restrictDollyHttpPolicy(child, httpPolicyConfigurations(parent))), 1234);
  }
  for (const maxResponseBytes of [0, -1, 1.5, Infinity, NaN, "unlimited"]) {
    assert.throws(() => new DollyHttpPolicy({ rules: [{ origin: target.origin, maxResponseBytes }] }), TypeError);
  }
});

test("the browser HTTP policy owns destination authority while credentials stay in Wasm", () => {
  const policy = new DollyHttpPolicy({
    maxRequests: 2,
    rules: [{
      origin: "https://models.example",
      pathPrefix: "/v1/",
      methods: ["POST"],
      credentialHeaders: ["authorization"],
      maxRequestBytes: 128,
      maxResponseBytes: 256,
      timeoutMilliseconds: 1000,
    }],
  });
  const headers = new Headers({
    authorization: "Bearer compromised-wasm",
    cookie: "ambient=bad",
    "content-type": "application/json",
  });
  const rule = policy.authorize(
    new URL("https://models.example/v1/chat/completions"),
    "POST",
    headers,
    32,
  );
  assert.equal(headers.get("authorization"), "Bearer compromised-wasm");
  assert.equal(headers.has("cookie"), false);
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(rule.maxResponseBytes, 256);
  assert.throws(
    () => policy.authorize(
      new URL("https://models.example/v2/chat/completions"),
      "POST",
      new Headers(),
      0,
    ),
    /denied/,
  );
  assert.throws(
    () => policy.authorize(
      new URL("https://models.example/v1/chat/completions"),
      "POST",
      new Headers(),
      0,
    ),
    /quota/,
  );
  assert.equal(isDollyCredentialHeader("Authorization"), true);
  assert.equal(isDollyCredentialHeader("content-type"), false);
});

test("the no-configuration HTTP policy permits destinations and credentials without a lifetime quota", () => {
  const policy = new DollyHttpPolicy();
  const headers = new Headers({
    authorization: "Bearer sandbox-key",
    "x-api-key": "sandbox-api-key",
  });
  policy.authorize(new URL("https://models.example/v1/models"), "GET", headers, 0);
  assert.equal(headers.get("authorization"), "Bearer sandbox-key");
  assert.equal(headers.get("x-api-key"), "sandbox-api-key");
  assert.doesNotThrow(() => policy.authorize(
    new URL("http://source.example/archive.tar.gz"),
    "POST",
    new Headers(),
    0,
  ));
  for (let index = 0; index < 300; index++) {
    assert.equal(policy.authorize(new URL("https://models.example/v1/models"), "GET", headers, 0).followRedirects, true);
  }
});

test("the browser consumes credential policy without exposing it as page state", () => {
  const page = {
    DOLLY_HTTP_POLICY: {
      rules: [{
        origin: "https://models.example",
        pathPrefix: "/v1/",
        methods: ["POST"],
      }],
    },
  };
  const policy = consumeDollyHttpPolicy(page);
  assert.equal("DOLLY_HTTP_POLICY" in page, false);
  assert.equal(policy.hardened, true);
});

test("exact HTTP policy paths cannot be widened by a matching prefix", () => {
  const policy = new DollyHttpPolicy({
    rules: [{
      origin: "https://models.example",
      path: "/v1/chat/completions",
      methods: ["POST"],
    }],
  });
  assert.throws(
    () => policy.authorize(
      new URL("https://models.example/v1/chat/completions/redirect"),
      "POST",
      new Headers(),
      0,
    ),
    /denied/,
  );
});

test("bootstrap sources are exact read-only broker capabilities", () => {
  // The site at /app/ names the file /static/tool.tar; its release holds the copy.
  const release = `https://dolly.example/app/_dolly/${"a".repeat(64)}/`;
  const policy = new DollyHttpPolicy(
    { maxRequests: 8, rules: [] },
    [{ path: "/static/tool.tar", byteLength: 1234 }],
    release,
  );
  const headers = new Headers({ authorization: "Bearer sandbox-secret" });
  const rule = policy.authorize(
    new URL("https://dolly.example/app/static/tool.tar"),
    "GET",
    headers,
    0,
  );
  assert.equal(rule.mirror, `${release}static/tool.tar`, "fetched from this release");
  assert.equal(rule.maxResponseBytes, 1234);
  assert.equal(headers.has("authorization"), false);
  assert.equal(policy.requests, 0, "trusted build inputs do not spend agent quota");
  for (const target of [
    "https://dolly.example/app/static/tool.tar?copy=1",
    "https://dolly.example/app/static/tool.tar/child",
    `${release}static/tool.tar`,
    "https://dolly.example/static/tool.tar",
  ]) {
    assert.throws(
      () => policy.authorize(new URL(target), "GET", new Headers(), 0),
      /denied/,
    );
  }
  assert.throws(
    () => policy.authorize(
      new URL("https://dolly.example/app/static/tool.tar"), "POST", new Headers(), 0,
    ),
    /denied/,
  );
});

test("path prefixes match whole segments and reject encoded separators", () => {
  const policy = new DollyHttpPolicy({ maxRequests: 100, rules: [{ origin: "https://models.example", pathPrefix: "/v1", methods: ["GET"] }] });
  const allowed = path => {
    try { policy.authorize(new URL(path, "https://models.example"), "GET", new Headers(), 0); return true; }
    catch { return false; }
  };
  assert.deepEqual(["/v1", "/v1/", "/v1/models", "/v1/a/%2e%2e/b"].map(allowed), [true, true, true, true]);
  assert.deepEqual(["/v1-admin", "/v1%2F..", "/v1/..%2fadmin", "/v1/%5c..", "/v2", "/v1/../admin"].map(allowed),
    [false, false, false, false, false, false]);
});

test("the default policy admits every HTTP(S) destination, the page origin included", () => {
  const policy = new DollyHttpPolicy(undefined, [], "https://dolly.example/app/");
  for (const target of ["https://dolly.example/app/any/file", "https://other.example/", "http://127.0.0.1:8080/"]) {
    assert.equal(policy.authorize(new URL(target), "GET", new Headers(), 0).followRedirects, true, target);
  }
});

test("bootstrap sources have a bounded hardened quota separate from agent requests", () => {
  const policy = new DollyHttpPolicy({ maxRequests: 1, rules: [] },
    [{ path: "/static/tool.tar", byteLength: 1234 }], "https://dolly.example/app/");
  const fetchSource = () => policy.authorize(new URL("https://dolly.example/app/static/tool.tar"), "GET", new Headers(), 0);
  for (let index = 0; index < 4; index++) fetchSource();
  assert.throws(fetchSource, /quota/);
  assert.equal(policy.requests, 0);
});

test("a relay is transport for a destination the policy admits, with no credentials of its own", () => {
  const relays = [{ origin: "https://forge.example", through: "https://page.example/relay/" }];
  const policy = new DollyHttpPolicy({ rules: [
    { origin: "https://forge.example", pathPrefix: "/team", methods: ["GET", "POST"], credentialHeaders: ["authorization"] },
    { origin: "https://other.example" },
  ] }, [], "https://page.example/", relays);
  const headers = new Headers({ authorization: "Bearer sandbox-key" });
  const rule = policy.authorize(new URL("https://forge.example/team/repo/info/refs?service=git-upload-pack"), "GET", headers, 0);
  assert.equal(rule.relay, "https://page.example/relay/forge.example/team/repo/info/refs?service=git-upload-pack");
  assert.equal(rule.followRedirects, false);
  assert.equal(headers.has("authorization"), false, "the relay was not named as a credential recipient");
  // The policy judges the real destination: the relay admits nothing by itself.
  assert.throws(() => policy.authorize(new URL("https://forge.example/elsewhere"), "GET", new Headers(), 0), /policy denied/);
  assert.equal(policy.authorize(new URL("https://other.example/"), "GET", new Headers(), 0).relay, undefined);

  const trusted = new DollyHttpPolicy(undefined, [], "https://page.example/",
    [{ ...relays[0], credentialHeaders: ["authorization"] }]);
  const kept = new Headers({ authorization: "Bearer sandbox-key", cookie: "ambient=no" });
  assert.ok(trusted.authorize(new URL("https://forge.example:443/x"), "POST", kept, 0).relay.endsWith("/relay/forge.example/x"));
  assert.equal(kept.get("authorization"), "Bearer sandbox-key");
  assert.equal(kept.has("cookie"), false);
  // An inherited policy narrows what is admitted and keeps this page's relay.
  const narrowed = restrictDollyHttpPolicy(policy, [{ rules: [{ origin: "https://forge.example", pathPrefix: "/team/repo" }] }], [], "https://page.example/");
  assert.ok(narrowed.authorize(new URL("https://forge.example/team/repo/x"), "GET", new Headers(), 0).relay);
  assert.throws(() => narrowed.authorize(new URL("https://forge.example/team/other"), "GET", new Headers(), 0), /policy denied/);

  for (const invalid of [{ origin: "https://forge.example/", through: "https://page.example/relay/" },
    { origin: "https://forge.example", through: "https://page.example/relay" },
    { origin: "https://forge.example", through: "https://user@page.example/relay/" },
    { origin: "https://forge.example", through: "https://page.example/relay/?next=" },
    { origin: "https://forge.example", through: "file:///relay/" },
    { origin: "https://forge.example", through: "https://page.example/relay/", credentialHeaders: ["x-custom"] }]) {
    assert.throws(() => new DollyHttpPolicy(undefined, [], "https://page.example/", [invalid]), TypeError);
  }
  const page = { DOLLY_HTTP_RELAYS: relays, location: { href: "https://page.example/" } };
  assert.equal(consumeDollyHttpPolicy(page).relays.size, 1);
  assert.equal("DOLLY_HTTP_RELAYS" in page, false, "the page must not keep the relay configuration");
});
