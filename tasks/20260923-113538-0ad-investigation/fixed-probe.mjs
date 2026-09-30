import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';

// Standalone upstream arithmetic probe; this is not a Dolly process or game.
const bytes = await readFile(process.argv[2]);
const browser = await chromium.launch({channel: 'chrome', headless: true, args: ['--disable-gpu']});
try {
  const page = await browser.newPage();
  const result = await page.evaluate(async bytes => {
    const module = await WebAssembly.compile(new Uint8Array(bytes));
    const {exports: e} = await WebAssembly.instantiate(module);
    let cases = 0;
    const check = (actual, expected) => {
      if (actual !== expected) throw Error(`fixed arithmetic: ${actual} != ${expected}`);
      cases++;
    };
    check(e.pointer_bytes(), 8);
    for (let n = -100; n <= 100; n++) {
      for (let d = 1; d <= 31; d++) {
        check(e.fixed_mul(n, d), n * d);
        const raw = Number(BigInt(n) * 65536n / BigInt(d));
        check(e.fixed_fraction(n, d), raw);
        check(e.fixed_round(n, d), Math.floor(raw / 65536));
      }
    }
    return {cases, pointerBytes: e.pointer_bytes(), imports: WebAssembly.Module.imports(module), exports: WebAssembly.Module.exports(module)};
  }, [...bytes]);
  assert.equal(result.cases, 18694);
  console.log(JSON.stringify({browser: browser.version(), gpuDisabled: true, wasmBytes: bytes.length, ...result}, null, 2));
} finally {
  await browser.close();
}
