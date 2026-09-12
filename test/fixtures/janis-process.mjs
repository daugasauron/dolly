import { spawn, spawnSync, execFile } from 'node:child_process';
import fs from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.argv[2];
const origin = process.argv[3];
const failures = [];
function assert(value, message) { if (!value) throw new Error(message); }
async function check(name, operation) {
  try { await operation(); console.log(`JANIS-PROCESS PASS: ${name}`); }
  catch (error) { failures.push(name); console.log(`JANIS-PROCESS FAIL: ${name}: ${error.stack ?? error}`); }
}
function completion(child) {
  let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), error;
  child.stdout?.on('data', chunk => { stdout = Buffer.concat([stdout, Buffer.from(chunk)]); });
  child.stderr?.on('data', chunk => { stderr = Buffer.concat([stderr, Buffer.from(chunk)]); });
  child.on('error', value => { error = value; });
  return new Promise(resolve => child.once('close', (status, signal) => resolve({ status, signal, stdout, stderr, error })));
}

await check('real PID, immediate launch and nonblocking event loop', async () => {
  const child = spawn('/bin/slop', ['-c', `/bin/echo started > ${root}/started; /bin/sleep 1`]);
  const done = completion(child);
  try {
    assert(child.pid > 2 && child.pid !== process.pid, `fake child PID ${child.pid}`);
    await delay(200);
    assert(fs.existsSync(`${root}/started`), 'child has not started');
    assert(child.exitCode === null, 'event loop blocked until exit');
  } finally { child.kill('SIGKILL'); await done; }
});
await check('creation-time cwd, exact environment, argv and sync input', async () => {
  const before = process.cwd();
  const result = spawnSync('/bin/slop', ['-c', '/bin/pwd; /bin/printf "%s:%s" "$VALUE" "$0"', 'argument'],
    { cwd: root, env: { VALUE: 'custom' }, encoding: 'utf8' });
  assert(result.status === 0 && result.stdout === `${root}\ncustom:argument`, String(result.stdout));
  assert(process.cwd() === before, 'spawn changed parent cwd');
  const identity = spawnSync('/usr/bin/janis', ['-e', 'console.log(process.pid + ":" + process.ppid)'], { encoding: 'utf8' });
  assert(identity.status === 0 && identity.stdout.trim() === `${identity.pid}:${process.pid}`, 'child/parent PID mismatch');
  const bytes = Buffer.from([0, 255, 1, 128]);
  const cat = spawnSync('/bin/cat', [], { input: bytes });
  assert(cat.status === 0 && cat.stdout.equals(bytes), 'binary sync input was lost');
});
await check('concurrent ESM adapters have independent scratch and cleanup', async () => {
  const source = `${root}/parallel-esm.mjs`;
  fs.writeFileSync(source, `import fs from 'node:fs'; import path from 'node:path';
    const own = fs.readdirSync('/tmp').filter(name => name.startsWith('janis-' + process.pid + '-'));
    if (own.length !== 1) throw Error('missing process-owned module directory');
    await new Promise(resolve => setTimeout(resolve, Number(process.argv[2])));
    if (!fs.existsSync(path.join('/tmp', own[0]))) throw Error('another process removed my adapters');
    console.log(own[0]);`);
  const children = [50, 300, 500].map(ms => spawn('/usr/bin/janis', ['-m', source, String(ms)]));
  const completions = children.map(completion);
  try {
    const results = await Promise.all(completions);
    assert(results.every(result => result.status === 0), results.map(result => result.stderr.toString()).join('\n'));
    const directories = results.map(result => result.stdout.toString().trim());
    assert(new Set(directories).size === 3, 'module directories overlap');
    assert(directories.every(directory => !fs.existsSync('/tmp/' + directory)), 'module scratch survived normal exit');
  } finally {
    for (const child of children) child.kill('SIGKILL');
    await Promise.all(completions);
    fs.rmSync(source, { force: true });
  }
});
await check('recursive mkdir tolerates another process winning directory creation', async () => {
  const directory = `${root}/mkdir-race`;
  const mkdir = Dolly.fsMkdir;
  Dolly.fsMkdir = path => { if (path === directory) mkdir(path); return mkdir(path); };
  try {
    fs.mkdirSync(directory, { recursive: true });
    assert(fs.statSync(directory).isDirectory(), 'concurrent creation was not accepted');
  } finally {
    Dolly.fsMkdir = mkdir;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
await check('bounded pipes carry binary stdin and both output streams', async () => {
  const child = spawn('/usr/bin/janis', ['-e', 'let x; while ((x=Dolly.readStdin(4096)).length) { Dolly.fsWrite(1,x,0,x.length); Dolly.fsWrite(2,x,0,x.length); }']);
  const done = completion(child);
  const bytes = Buffer.alloc(256 * 1024);
  for (let i = 0; i < bytes.length; ++i) bytes[i] = i & 255;
  child.stdin.end(bytes);
  const result = await done;
  assert(result.status === 0 && result.stdout.equals(bytes) && result.stderr.equals(bytes), 'pipe bytes were lost');
});
await check('a piped stdin data listener starts flowing without explicit resume', async () => {
  const child = spawn('/usr/bin/janis', ['-e',
    'process.stdin.on("data", chunk => process.stdout.write(chunk)); process.stdin.on("end", () => console.log("EOF"));']);
  const done = completion(child);
  child.stdin.end('rpc input\n');
  const result = await done;
  assert(result.status === 0 && result.stdout.toString() === 'rpc input\nEOF\n', 'stdin listener exited without consuming its pipe');
});
await check('paused output stays in the kernel pipe until resumed', async () => {
  const child = spawn('/bin/slop', ['-c', '/bin/echo prefix; /bin/sleep .2; /bin/echo suffix']);
  const done = completion(child);
  let count = 0;
  child.stdout.on('data', () => { count++; });
  child.stdout.pause();
  await delay(100);
  assert(count === 0, 'paused stdout kept flowing');
  child.stdout.resume();
  const result = await done;
  assert(result.status === 0 && result.stdout.toString() === 'prefix\nsuffix\n', 'resume lost pipe data');
});
await check('live stdout and real signal termination', async () => {
  const child = spawn('/bin/slop', ['-c', '/bin/echo prefix; /bin/sleep 2']);
  const done = completion(child);
  const prefix = new Promise(resolve => child.stdout.once('data', resolve));
  await prefix;
  assert(child.exitCode === null, 'prefix delayed until exit');
  const started = Date.now();
  assert(child.kill('SIGTERM'), 'kill rejected a live child');
  const result = await done;
  assert(Date.now() - started < 700 && result.status === null && result.signal === 'SIGTERM', 'kill did not stop work with a signal exit');
  assert(!child.kill(), 'kill accepted a reaped child');
  assert(spawnSync('/bin/slop', ['-c', 'exit 130']).status === 130, 'normal exit mistaken for signal');
});
await check('child abort and deadlines stop work', async () => {
  const controller = new AbortController();
  const child = spawn('/bin/slop', ['-c', '/bin/sleep 2'], { signal: controller.signal });
  const done = completion(child);
  setTimeout(() => controller.abort(), 50);
  const started = Date.now();
  const result = await done;
  assert(Date.now() - started < 700 && result.signal === 'SIGTERM' && result.error?.name === 'AbortError', 'abort did not stop child');
  const timed = spawn('/bin/slop', ['-c', '/bin/sleep 2'], { timeout: 50 });
  const timeoutResult = await completion(timed);
  assert(timeoutResult.signal === 'SIGTERM', 'child timeout did not deliver its kill signal');
  const sync = spawnSync('/bin/sleep', ['2'], { timeout: 50 });
  assert(sync.signal === 'SIGTERM' && sync.error?.code === 'ETIMEDOUT', 'sync timeout was not reported');
  const execError = await new Promise(resolve => execFile('/bin/sleep', ['2'], { timeout: 50 }, resolve));
  assert(execError?.signal === 'SIGTERM', 'execFile reported success for a signal exit');
  const missing = await new Promise(resolve => execFile('/does-not-exist', [], resolve));
  assert(missing?.code === 'ENOENT', 'execFile did not report spawn failure');
});
await check('QuickJS CPU-loop polling preserves SIGTERM', async () => {
  const child = spawn('/usr/bin/qjs', ['-e', 'print("ready"); for (;;) {}']);
  const done = completion(child);
  try {
    await new Promise(resolve => child.stdout.once('data', resolve));
    assert(child.kill('SIGTERM'), 'SIGTERM rejected');
    const result = await done;
    assert(result.status === null && result.signal === 'SIGTERM', 'interpreter consumed SIGTERM without terminating');
  } finally { child.kill('SIGKILL'); await done; }
});
await check('unsupported child options fail explicitly', async () => {
  for (const options of [{ detached: true }, { uid: 1 }, { stdio: ['pipe', 'pipe', 'pipe', 'pipe'] }]) {
    const child = spawn('/bin/true', [], options);
    const result = await completion(child);
    assert(child.pid === undefined && result.error?.code === 'ENOTSUP',
      `unsupported options accepted: ${JSON.stringify(options)}`);
  }
});
if (fs.existsSync('/home/dolly/.pi/agent/extensions/dolly-tools.js')) await check('Pi extension tool and user shell operations propagate abort', async () => {
  const { default: install } = await import('/home/dolly/.pi/agent/extensions/dolly-tools.js');
  const tools = new Map(), handlers = new Map();
  install({ on: (name, handler) => handlers.set(name, handler), registerTool: tool => tools.set(tool.name, tool), registerCommand() {} });
  for (const userShell of [false, true]) {
    const controller = new AbortController();
    const command = '/bin/echo prefix; /bin/sleep 2';
    let prefix = false, error;
    const timer = setTimeout(() => controller.abort(), 150);
    try {
      if (userShell) await handlers.get('user_bash')().operations.exec(command, root,
        { signal: controller.signal, onData: data => { prefix ||= String(data).includes('prefix'); } });
      else await tools.get('bash').execute('probe', { command }, controller.signal,
        update => { prefix ||= update.content[0].text.includes('prefix'); }, { cwd: root });
    } catch (value) { error = value; }
    finally { clearTimeout(timer); }
    assert(prefix && error?.name === 'AbortError', `Pi ${userShell ? 'user shell' : 'tool'} did not stream/cancel`);
  }
});
await check('HTTP policy errors retain code, errno and request identity', async () => {
  let error;
  try { await fetch(`${origin}/not-allowed`); } catch (value) { error = value; }
  assert(error?.code === 'EACCES' && error.errno < 0 && error.requestId > 0,
    'HTTP policy denial lost its typed details');
  assert(/policy denied/.test(error.message), 'HTTP policy denial became a connection error');
  try { await fetch(`${origin}/${'x'.repeat(8192)}`); } catch (value) { error = value; }
  assert(error?.code === 'E2BIG' && /byte limit/.test(error.message), 'HTTP admission lost its byte-limit error');
});
await check('fetch preserves binary uploads, byte views and queued input ownership', async () => {
  const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
  const padded = new Uint8Array(260);
  padded.set(bytes, 2);
  for (const body of [bytes, bytes.buffer, padded.subarray(2, 258),
    new DataView(padded.buffer, 2, 256), new Uint16Array(bytes.buffer),
    Buffer.from(bytes), new Uint8Array(), '日本語\0😀']) {
    const expected = typeof body === 'string' ? new TextEncoder().encode(body) :
      ArrayBuffer.isView(body) ? new Uint8Array(body.buffer, body.byteOffset, body.byteLength) : new Uint8Array(body);
    const response = await fetch(`${origin}/fixture/bytes`, { method: 'POST', body });
    const actual = new Uint8Array(await response.arrayBuffer());
    assert(actual.length === expected.length && actual.every((byte, index) => byte === expected[index]),
      `upload changed bytes for ${body.constructor.name}`);
  }
  const owned = bytes.slice();
  const pending = fetch(`${origin}/fixture/bytes`, { method: 'POST', body: owned });
  owned.fill(0);
  const actual = new Uint8Array(await (await pending).arrayBuffer());
  assert(actual.every((byte, index) => byte === bytes[index]), 'queued fetch borrowed mutable input');
  assert(typeof Dolly.http === 'undefined', 'unused synchronous HTTP adapter remains');
});
await check('HTTP process upload limit includes UTF-8 metadata and packet header', async () => {
  const url = `${origin}/fixture/bytes`;
  const headers = { 'x-byte-test': 'metadata' };
  const capacity = 1024 * 1024 - 24 - new TextEncoder().encode(`POST${url}x-byte-test: metadata\r\n`).length;
  const body = new Uint8Array(capacity).fill(0xa5);
  const response = await fetch(url, { method: 'POST', headers, body });
  const actual = new Uint8Array(await response.arrayBuffer());
  assert(actual.length === capacity && actual.every(byte => byte === 0xa5), 'exact packet-limit upload failed');
  let error;
  try { await fetch(url, { method: 'POST', headers, body: new Uint8Array(capacity + 1) }); }
  catch (value) { error = value; }
  assert(error?.code === 'E2BIG' && error.requestId === 0, 'oversize upload was not rejected before dispatch');
});
await check('two fetches reach the server before either response completes', async () => {
  const responses = await Promise.all(Array.from({ length: 2 }, async (_, index) => {
    const response = await fetch(`${origin}/fixture/http-overlap?group=janis&request=${index}`);
    assert(response.ok, `HTTP status ${response.status}`);
    return response.text();
  }));
  assert(responses.every(body => body === 'OVERLAP-OK\n'), 'requests did not overlap at the server');
});
await check('queued HTTP abort never starts or cancels another request', async () => {
  const first = fetch(`${origin}/fixture/http.txt`).then(response => response.text());
  const controller = new AbortController();
  const reason = new Error('cancel queued fetch');
  const queued = fetch(`${origin}/fixture/never-requested`, { signal: controller.signal })
    .catch(error => error);
  controller.abort(reason);
  assert(await queued === reason, 'queued abort lost its reason');
  assert((await first).length > 0, 'queued abort cancelled the active request');
});
await check('an unread in-Wasm HTTP request does not block another fetch', async () => {
  const sequence = Dolly.httpStart('GET', `${origin}/fixture/http.txt`, '', null);
  const queued = fetch(`${origin}/fixture/http.txt`).then(response => response.text());
  try {
    assert((await queued).length > 0, 'another request blocked on an unread mailbox');
  } finally { Dolly.httpCancel(sequence); }
});
await check('requests from different processes overlap at the server', async () => {
  const children = Array.from({ length: 2 }, (_, index) => spawn('/usr/bin/janis', ['-e',
    `fetch(${JSON.stringify(`${origin}/fixture/http-overlap?group=children&request=${index}`)}).then(r=>r.text()).then(console.log)`]));
  const results = await Promise.all(children.map(completion));
  assert(results.every(result => result.status === 0 && result.stdout.toString().includes('OVERLAP-OK')),
    'child HTTP requests were serialized');
});
await check('pool saturation queues requests without stopping active transfers', async () => {
  const responses = await Promise.all(Array.from({ length: 18 }, async (_, index) => {
    const response = await fetch(`${origin}/fixture/http-overlap?group=saturation&request=${index}`);
    return response.status === 200 && await response.text() === 'OVERLAP-OK\n';
  }));
  assert(responses.every(Boolean), 'queued requests stopped the HTTP pump');
});
await check('killing a process cancels all its requests without cancelling a peer', async () => {
  const urls = ['child-one', 'child-two'].map(name => `${origin}/fixture/abort/${name}`);
  const child = spawn('/usr/bin/janis', ['-e',
    `Promise.all(${JSON.stringify(urls)}.map(async url=>{const r=await fetch(url);console.log('HEADERS');return r.text();})).then(console.log)`]);
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  const done = completion(child);
  try {
    const deadline = Date.now() + 5000;
    while (output.split('HEADERS').length < 3 && Date.now() < deadline) await delay(10);
    assert(output.split('HEADERS').length === 3, 'child did not start both streams');
    const peer = await fetch(`${origin}/fixture/abort/peer`);
    child.kill('SIGKILL');
    const result = await done;
    assert(result.signal === 'SIGKILL', 'child was not forcibly terminated');
    assert(await peer.text() === 'prefixsuffix', 'process cleanup cancelled a peer transfer');
  } finally { child.kill('SIGKILL'); await done; }
});
await check('HTTP deadline cancels before headers', async () => {
  const started = Date.now();
  let error;
  try { await fetch(`${origin}/fixture/abort/before`, { signal: AbortSignal.timeout(100) }); }
  catch (value) { error = value; }
  assert(error?.name === 'TimeoutError' && Date.now() - started < 1000, 'HTTP timeout did not expire');
});
await check('HTTP abort after headers errors the live body', async () => {
  const controller = new AbortController();
  const response = await fetch({ url: `${origin}/fixture/abort/body`, signal: controller.signal });
  const reader = response.body.getReader();
  assert(!((await reader.read()).done), 'no body prefix');
  controller.abort();
  let error;
  try { await reader.read(); } catch (value) { error = value; }
  assert(error?.name === 'AbortError', 'body continued after abort');
});
await check('reader cancellation releases the HTTP request', async () => {
  const response = await fetch(`${origin}/fixture/abort/cancel`);
  const reader = response.body.getReader();
  await reader.read();
  await reader.cancel();
});
await check('combined signals and timer promises abort mid-wait', async () => {
  const first = new AbortController(), second = new AbortController();
  const signal = AbortSignal.any([first.signal, second.signal]);
  const reason = new Error('selected reason');
  setTimeout(() => second.abort(reason), 20);
  let error;
  try { await delay(200, undefined, { signal }); } catch (value) { error = value; }
  assert(signal.reason === reason && error?.name === 'AbortError' && error.cause === reason, 'timer ignored mid-wait abort');
});
if (failures.length) throw new Error(`${failures.length} Janis process/abort groups failed`);
console.log('JANIS-PROCESS-OK');
