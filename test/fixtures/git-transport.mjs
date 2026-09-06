import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Native Git is only the remote HTTP reference server. Every client command
// below runs through Slop in browser Wasm, including pack decoding and checkout.
export function createGitTransportFixture() {
  const directory = mkdtempSync(join(tmpdir(), "dolly-git-http-"));
  const environment = {
    ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_AUTHOR_NAME: "Dolly", GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_NAME: "Dolly", GIT_COMMITTER_EMAIL: "fixture@example.invalid",
    GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
  };
  delete environment.GIT_DIR;
  delete environment.GIT_WORK_TREE;
  delete environment.GIT_INDEX_FILE;
  delete environment.GIT_CONFIG_COUNT;
  const requests = [];
  const cancellation = { started: false, closed: false };
  const pushCancellation = { started: false, closed: false };
  let corruptions = 0;
  const responses = new Set();
  const dispose = () => {
    for (const response of responses) response.destroy();
    rmSync(directory, { recursive: true, force: true });
  };
  function git(args, input, protocol = "") {
    const result = spawnSync("git", ["-c", "maintenance.auto=false", ...args], {
      cwd: directory, env: { ...environment, GIT_PROTOCOL: protocol }, input,
      maxBuffer: 4 * 1024 * 1024, timeout: 15000,
    });
    assert.equal(result.status, 0, `${args.join(" ")}: ${result.error ?? result.stderr}`);
    return result.stdout;
  }
  function commit(name, contents) {
    writeFileSync(join(directory, name), contents);
    git(["add", name]);
    git(["commit", "-qm", name]);
    return git(["rev-parse", "HEAD"]).toString().trim();
  }
  try {
    git(["init", "-q", "-b", "main"]);
    const contents = Buffer.alloc(192 * 1024);
    for (let offset = 0; offset < contents.length; offset += 32) {
      createHash("sha256").update(`dolly-pack-${offset}`).digest().copy(contents, offset);
    }
    const initial = commit("large.bin", contents);
    const second = commit("second.txt", "second\n");
    git(["branch", "feature", initial]);
    git(["fsck", "--full"]);
    const blob = git(["hash-object", "large.bin"]).toString().trim();
    const pack = git(["pack-objects", "--stdout", "--all"]);
    assert.ok(pack.length > 65536, "fixture must exceed the kernel pipe capacity");
    git(["config", "receive.denyNonFastForwards", "true"]);
    const pushData = Buffer.alloc(192 * 1024);
    for (let offset = 0; offset < pushData.length; offset += 32) {
      createHash("sha256").update(`dolly-push-${offset}`).digest().copy(pushData, offset);
    }
    return {
      initial, second, blob, requests, cancellation, pushCancellation, dispose,
      get corruptions() { return corruptions; },
      pushedBlob() { return git(["show", "refs/heads/from-dolly:pushed.bin"]); },
      pushHead() { return git(["rev-parse", "refs/heads/from-dolly"]).toString().trim(); },
      verify() { git(["fsck", "--full"]); },
      advance() {
        const third = commit("third.txt", "third\n");
        git(["branch", "-f", "feature", third]);
        return third;
      },
      async serve(request, response, url) {
        if (url.pathname === "/fixture/git-transport/push-data") {
          response.writeHead(200, {"content-type": "application/octet-stream"}).end(pushData);
          return true;
        }
        const match = /^\/fixture\/git-transport\/(repo|error|corrupt|cancel|reject-push|cancel-push)\/(info\/refs|git-upload-pack|git-receive-pack)$/.exec(url.pathname);
        if (!match) return false;
        const [, variant, operation] = match;
        const protocol = request.headers["git-protocol"] ?? "";
        assert.ok(["", "version=0", "version=2"].includes(protocol));
        if (variant === "error") {
          response.writeHead(503).end("fixture unavailable\n");
          return true;
        }
        const advertisement = operation === "info/refs";
        const service = advertisement ? url.searchParams.get("service") : operation;
        assert.ok(["git-upload-pack", "git-receive-pack"].includes(service));
        assert.equal(request.method, advertisement ? "GET" : "POST");
        const chunks = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          assert.ok(size <= 1024 * 1024);
          chunks.push(chunk);
        }
        const input = Buffer.concat(chunks);
        requests.push({ protocol, operation, body: input.toString() });
        if (!advertisement && service === "git-receive-pack" && variant === "reject-push") {
          response.writeHead(403).end("fixture refuses push\n");
          return true;
        }
        if (!advertisement && service === "git-receive-pack" && variant === "cancel-push") {
          pushCancellation.started = input.includes("PACK");
          responses.add(response);
          response.once("close", () => {
            pushCancellation.closed = true;
            responses.delete(response);
          });
          response.writeHead(200, {"content-type": "application/x-git-receive-pack-result"});
          response.flushHeaders();
          return true;
        }
        const body = git([service.slice(4), "--stateless-rpc",
          ...(advertisement ? ["--advertise-refs"] : []), "."], input, protocol);
        const packOffset = body.indexOf("PACK");
        if (variant === "corrupt" && !advertisement && packOffset >= 0) {
          body[packOffset + 16] ^= 0xff;
          corruptions++;
        }
        response.writeHead(200, {
          "cache-control": "no-store",
          "content-type": `application/x-${service}-${advertisement ? "advertisement" : "result"}`,
        });
        if (advertisement && (service === "git-receive-pack" || protocol !== "version=2")) {
          const prefix = `# service=${service}\n`;
          response.write(`${(Buffer.byteLength(prefix) + 4).toString(16).padStart(4, "0")}${prefix}0000`);
        }
        if (variant === "cancel" && !advertisement && /(?:command=fetch|want [0-9a-f])/.test(input.toString())) {
          cancellation.started = true;
          responses.add(response);
          response.once("close", () => {
            cancellation.closed = true;
            responses.delete(response);
          });
          response.write(body.subarray(0, 64));
        } else response.end(body);
        return true;
      },
      pushData,
    };
  } catch (error) { dispose(); throw error; }
}

export async function runGitTransport({ submit, origin, fixture }) {
  const scratch = "/tmp/dolly-git-transport-test";
  const remote = `${origin}/fixture/git-transport/repo`;
  const check = async command => assert.equal(await submit(command), 0, command);
  const equals = (command, expected) => check(`test "$(${command})" = ${expected}`);
  try {
    await check(`mkdir -p ${scratch}`);
    for (const protocol of [0, 2]) {
      const base = `git -c protocol.version=${protocol}`;
      const clone = `${scratch}/clone-${protocol}`;
      const shallow = `${scratch}/shallow-${protocol}`;
      await check(`timeout 15 ${base} ls-remote ${remote} > ${scratch}/refs`);
      await check(`grep -q '${fixture.second}.*refs/heads/main' ${scratch}/refs`);
      await check(`timeout 30 ${base} clone ${remote} ${clone}`);
      await equals(`git -C ${clone} rev-parse HEAD`, fixture.second);
      await equals(`git -C ${clone} hash-object large.bin`, fixture.blob);
      await check(`git -C ${clone} fsck --full`);
      await check(`git -C ${clone} checkout feature`);
      await equals(`git -C ${clone} rev-parse HEAD`, fixture.initial);
      await check(`timeout 30 ${base} clone --depth=1 --branch=main ${remote} ${shallow}`);
      await equals(`git -C ${shallow} rev-list --count HEAD`, 1);
      await check(`timeout 30 ${base} -C ${shallow} fetch --deepen=1`);
      await equals(`git -C ${shallow} rev-list --count HEAD`, 2);
      assert.equal(await submit(`git -C ${clone} add absent-file`), 128);
      await check(`test ! -e ${clone}/.git/index.lock`);
    }
    const third = fixture.advance();
    for (const protocol of [0, 2]) {
      const clone = `${scratch}/clone-${protocol}`;
      await check(`timeout 30 git -c protocol.version=${protocol} -C ${clone} fetch origin`);
      await equals(`git -C ${clone} rev-parse origin/main`, third);
      await equals(`git -C ${clone} rev-parse origin/feature`, third);
      await check(`git -C ${clone} checkout -B main origin/main`);
      await check(`grep -q third ${clone}/third.txt`);
    }
    assert.equal(await submit(`timeout 15 git clone ${origin}/fixture/git-transport/error ${scratch}/error`), 128);
    assert.equal(await submit(`timeout 30 git clone ${origin}/fixture/git-transport/corrupt ${scratch}/corrupt`), 128);
    assert.equal(fixture.corruptions, 1, "Git must reject a damaged pack, not merely fail discovery");
    assert.equal(await submit(`timeout 5 git clone ${origin}/fixture/git-transport/cancel ${scratch}/cancel`), 124);
    assert.equal(fixture.cancellation.started, true, "cancellation must interrupt a real pack response");
    for (let attempt = 0; !fixture.cancellation.closed && attempt < 100; ++attempt) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(fixture.cancellation.closed, true, "cancelled Git must release the HTTP response");
    const push = `${scratch}/clone-2`;
    await check(`curl -fsS ${origin}/fixture/git-transport/push-data -o ${push}/pushed.bin`);
    await check(`git -C ${push} add pushed.bin && git -C ${push} commit -qm browser-push`);
    await check(`timeout 30 git -C ${push} push origin HEAD:refs/heads/from-dolly`);
    assert.deepEqual(fixture.pushedBlob(), fixture.pushData);
    const firstPush = fixture.pushHead();
    await equals(`git -C ${push} rev-parse HEAD`, firstPush);
    await check(`echo next > ${push}/next.txt && git -C ${push} add next.txt && git -C ${push} commit -qm next-push`);
    await check(`timeout 30 git -C ${push} push origin HEAD:refs/heads/from-dolly`);
    const secondPush = fixture.pushHead();
    assert.notEqual(secondPush, firstPush);
    assert.equal(await submit(`timeout 30 git -C ${push} push --force origin ${firstPush}:refs/heads/from-dolly`), 1);
    assert.equal(fixture.pushHead(), secondPush, "server rejection must preserve the remote ref");
    await check(`echo pending > ${push}/pending.txt && git -C ${push} add pending.txt && git -C ${push} commit -qm pending-push`);
    assert.notEqual(await submit(`timeout 15 git -C ${push} push ${origin}/fixture/git-transport/reject-push HEAD:refs/heads/from-dolly`), 0);
    assert.equal(fixture.pushHead(), secondPush);
    assert.equal(await submit(`timeout 5 git -C ${push} push ${origin}/fixture/git-transport/cancel-push HEAD:refs/heads/from-dolly`), 124);
    assert.equal(fixture.pushCancellation.started, true, "push cancellation must interrupt a real pack exchange");
    for (let attempt = 0; !fixture.pushCancellation.closed && attempt < 100; ++attempt) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(fixture.pushCancellation.closed, true);
    assert.equal(fixture.pushHead(), secondPush);
    await check(`timeout 30 git -C ${push} push origin HEAD:refs/heads/from-dolly`);
    fixture.verify();
    await check(`timeout 15 git ls-remote ${remote} > ${scratch}/after-cancel`);
    await check(`test -z "$(find /tmp -maxdepth 1 -name 'git-fetch-pack-*')"`);
    await check(`test -z "$(find /tmp -maxdepth 1 -name 'git-send-pack-*')"`);
    for (const protocol of ["", "version=2"]) {
      assert.ok(fixture.requests.some(request => request.protocol === protocol &&
        request.operation === "git-upload-pack" && /want [0-9a-f]/.test(request.body)));
    }
  } finally { await check(`rm -rf ${scratch}`); }
}
