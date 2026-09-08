import assert from "node:assert/strict";
import test from "node:test";
import { ImageBuildService, BUILD_ORIGIN, BUILD_LIMITS } from "../src/image-build-service.mjs";
import { DollyHttpPolicy, httpPolicyConfigurations, restrictDollyHttpPolicy } from "../src/http-policy.mjs";
import { localServicesTransport } from "../src/local-services.mjs";
import { checkedCustomArtifact } from "../src/custom-image.mjs";
import { describeImageArtifact, sha256 } from "../src/image-artifact.mjs";
import { encodeSnapshotRecords } from "../src/snapshot-records.mjs";

const encoder = new TextEncoder(), decoder = new TextDecoder();
const source = "DOLLY 3\nIMAGE proof\nENTRY /bin/slop\n";
const url = new URL(BUILD_ORIGIN + "/v1/builds");
const request = (text = source, signal) => ({ method: "POST", body: encoder.encode(text), signal });
const event = async reader => JSON.parse(decoder.decode((await reader.read()).value));

test("opened results intersect parent and embedding HTTP authority, limits and credential rules", () => {
  const origin = "https://example.com", target = new URL(origin + "/allowed");
  const parent = new DollyHttpPolicy({ maxRequests: 3, rules: [{ origin, path: "/allowed", methods: ["POST"],
    credentialHeaders: ["authorization"], maxRequestBytes: 50, maxResponseBytes: 100, timeoutMilliseconds: 1000 }] });
  const policies = httpPolicyConfigurations(parent);
  assert.deepEqual(httpPolicyConfigurations(restrictDollyHttpPolicy(parent, policies)), policies);
  const child = restrictDollyHttpPolicy(new DollyHttpPolicy(), policies);
  assert.throws(() => child.authorize(new URL(origin + "/other"), "POST", new Headers(), 0), /denied/);
  assert.equal(child.authorize(target, "POST", new Headers(), 25).maxResponseBytes, 100);
  assert.throws(() => child.authorize(target, "POST", new Headers(), 51), /size limit/);
  assert.throws(() => child.authorize(target, "POST", new Headers(), 1), /quota/);
  const stricterPage = new DollyHttpPolicy({ rules: [{ origin, path: "/allowed", methods: ["POST"],
    maxResponseBytes: 10, timeoutMilliseconds: 50 }] });
  const intersected = restrictDollyHttpPolicy(stricterPage, policies);
  const headers = new Headers({ authorization: "sandbox-secret" });
  assert.deepEqual(intersected.authorize(target, "POST", headers, 1), {
    maxRequestBytes: 50, maxResponseBytes: 10, timeoutMilliseconds: 50, followRedirects: false,
  });
  assert.equal(headers.has("authorization"), false);
  for (const invalid of [null, [], {}, Array(17).fill(null)]) assert.throws(() => restrictDollyHttpPolicy(parent, invalid));
});

test("build authority has exact routes, independent policy, and no ambient credentials or recursive service", async () => {
  let received, remoteCalls = 0;
  const service = { fetch(url, init) { received = { url, init }; return new Response("local"); } };
  const remote = () => { remoteCalls++; return new Response("remote"); };
  const allowed = localServicesTransport(new DollyHttpPolicy({ rules: [] }), { build: service }, remote);
  const headers = new Headers({ authorization: "sandbox-key", cookie: "browser-cookie" });
  assert.equal(allowed.policy.authorize(url, "POST", headers, 100), BUILD_LIMITS);
  assert.deepEqual([...headers], []);
  await allowed.fetchRequest(url, { ...request(), headers: new Headers({ authorization: "bypass" }) });
  assert.equal(received.url.href, url.href);
  assert.deepEqual([...received.init.headers], []);
  for (const [address, method, size] of [
    [url, "GET", 0], [url, "POST", BUILD_LIMITS.maxRequestBytes + 1],
    [url + "?open=1", "POST", 1], [url + "#x", "POST", 1], [url + "/more", "POST", 1],
    [url + "/open", "POST", 1],
    ["http://build.dolly.invalid/v1/builds", "POST", 1],
    ["https://build.dolly.invalid./v1/builds", "POST", 1],
    ["https://name@build.dolly.invalid/v1/builds", "POST", 1],
    ["https://other.dolly.invalid/v1/builds", "POST", 1],
    ["https://webgpu.dolly.invalid/v1/models", "GET", 0],
  ]) assert.throws(() => allowed.policy.authorize(new URL(address), method, new Headers(), size), /denied/);
  assert.throws(() => allowed.policy.authorize(new URL("https://example.com"), "GET", new Headers(), 0), /denied/);
  const builder = localServicesTransport(new DollyHttpPolicy(), undefined, remote);
  for (const address of [url, "https://webgpu.dolly.invalid/v1/models", "https://dolly.invalid/"]) {
    assert.throws(() => builder.fetchRequest(address, request()), /denied/);
  }
  assert.equal(remoteCalls, 0);
});

test("builds start immediately, stream before completion, and release the lease without opening anything", async () => {
  let finish, runs = 0;
  const service = new ImageBuildService(async (text, report) => {
    runs++;
    assert.equal(text, source);
    report("compile first\n");
    await new Promise(resolve => { finish = resolve; });
    return { sha256: "a".repeat(64) };
  });
  const response = await service.fetch(url, request());
  const reader = response.body.getReader();
  assert.equal(response.url, url.href);
  assert.equal((await event(reader)).type, "status");
  assert.equal(runs, 1);
  assert.equal((await service.fetch(url, request())).status, 409);
  assert.deepEqual(await event(reader), { type: "log", text: "compile first\n" });
  assert.equal(service.state, "building");
  finish();
  assert.equal((await event(reader)).type, "result");
  assert.equal((await reader.read()).done, true);
  assert.equal(service.state, "ready");
  assert.equal(service.active, undefined);
  assert.equal(service.result.source, source);
});

test("UI, consumer and request cancellation release owned state", async () => {
  let runs = 0;
  const service = new ImageBuildService(async (_text, _report, signal) => {
    runs++;
    await new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  });
  let response = await service.fetch(url, request());
  service.cancel();
  assert.equal(runs, 1);
  assert.match(await response.text(), /Image build cancelled/);
  assert.equal(service.active, undefined);
  response = await service.fetch(url, request());
  await response.body.cancel();
  assert.equal(service.active, undefined);
  const controller = new AbortController();
  response = await service.fetch(url, request(source, controller.signal));
  controller.abort("caller stopped");
  assert.match(await response.text(), /caller stopped/);
  assert.equal(service.active, undefined);
  assert.equal(service.state, "error");
  assert.equal(runs, 3);
});

test("malformed/oversize sources never start work; build errors and output floods produce bounded failures", async () => {
  let runs = 0;
  const service = new ImageBuildService(async (_source, report) => { runs++; report("x".repeat(BUILD_LIMITS.maxResponseBytes)); });
  for (const text of ["DOLLY 2\n", "DOLLY 3\nMODULE tool\n", source + "\0", "x".repeat(128 * 1024 + 1)]) {
    assert.equal((await service.fetch(url, request(text))).status, 400);
  }
  assert.equal(runs, 0);
  assert.equal(service.active, undefined);
  const response = await service.fetch(url, request());
  const text = await response.text();
  assert.match(text, /log exceeds/);
  assert.ok(text.length < 1024);
  assert.equal(service.active, undefined);
  assert.equal(service.result, undefined);
  assert.equal(runs, 1);
});

test("custom result restoration binds exact recipe, runtime and complete snapshot bytes", async () => {
  const file = text => ({ kind: 2, data: encoder.encode(text) });
  const bytes = encodeSnapshotRecords(new Map([
    ["/etc/dolly/Dollyfile", file(source)], ["/etc/dolly/artifact", file("proof")],
  ])).buffer;
  const artifact = await describeImageArtifact(bytes, await sha256(encoder.encode(source)));
  assert.equal((await checkedCustomArtifact(source, artifact)).sha256, artifact.sha256);
  for (const candidate of [undefined, { ...artifact, buildId: "old" }, { ...artifact, sha256: "0".repeat(64) },
    { ...artifact, bytes: bytes.slice(0, -1) }, { ...artifact, inputs: [{ recipeSha256: "invalid" }] }]) {
    await assert.rejects(checkedCustomArtifact(source, candidate));
  }
  await assert.rejects(checkedCustomArtifact(source + "\n", artifact));
});
