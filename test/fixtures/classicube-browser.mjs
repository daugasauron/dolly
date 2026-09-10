import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function runClassiCubeProof({ send, evaluate, wait, key, projectDir }) {
  assert.equal(await wait("document.documentElement?.dataset.dollyStatus",
    value => value === "ready" || value === "failed", "ClassiCube boot"), "ready");
  await wait("__dolly.graphicsActive", Boolean, "ClassiCube framebuffer");
  await wait("__dolly.transport.relativePointerRequested()", Boolean, "generated single-player world");
  const screenshot = async name => {
    const result = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(resolve(projectDir, `build/classicube-${name}.png`), result.data, "base64");
  };
  const point = await evaluate(`(() => {
    const r = document.querySelector('#display').getBoundingClientRect();
    return {x: r.x + r.width / 2, y: r.y + r.height / 2};
  })()`);
  const click = async (button = "left") => {
    await send("Input.dispatchMouseEvent", {type: "mousePressed", ...point, button, buttons: button === "right" ? 2 : 1, clickCount: 1});
    await send("Input.dispatchMouseEvent", {type: "mouseReleased", ...point, button, buttons: 0, clickCount: 1});
  };
  const view = () => evaluate(`(() => {
    const c = document.querySelector('#display');
    const data = c.getContext('2d').getImageData(80, 80, 480, 280).data;
    let hash = 2166136261;
    for (const b of data) hash = Math.imul(hash ^ b, 16777619);
    return hash >>> 0;
  })()`);
  assert.equal(await evaluate("document.pointerLockElement"), null);
  await evaluate("document.querySelector('#display').dispatchEvent(new PointerEvent('pointerdown', {button:0}))");
  assert.equal(await evaluate("document.pointerLockElement"), null, "synthetic input cannot grant capture");
  await click();
  await wait("document.pointerLockElement?.id", value => value === "display", "user click captures mouse");
  await delay(1500);
  await screenshot("world");
  const colors = await evaluate(`(() => {
    const c = document.querySelector('#display'), colors = new Set();
    const p = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < p.length; i += 4) colors.add((p[i] << 16) | (p[i+1] << 8) | p[i+2]);
    return colors.size;
  })()`);
  assert.ok(colors > 256, `textures did not load (${colors} distinct colors)`);
  assert.equal(await evaluate("__dolly.httpRequestCount"), 0, "offline gameplay needs no network broker requests");
  const initial = await view();
  await send("Input.dispatchKeyEvent", {type: "keyDown", key: "w", code: "KeyW", windowsVirtualKeyCode: 87});
  await delay(1000);
  await send("Input.dispatchKeyEvent", {type: "keyUp", key: "w", code: "KeyW", windowsVirtualKeyCode: 87});
  assert.notEqual(await view(), initial, "walking changes the world view");
  const walked = await view();
  await send("Input.dispatchMouseEvent", {type: "mouseMoved", x: point.x + 45, y: point.y + 60, buttons: 0});
  await delay(400);
  assert.notEqual(await view(), walked, "relative mouse movement changes the camera");
  const frame = await evaluate("Number(document.documentElement.dataset.frameSequence)");
  const started = performance.now();
  await delay(3000);
  const fps = (await evaluate("Number(document.documentElement.dataset.frameSequence)") - frame) * 1000 / (performance.now() - started);
  assert.ok(fps >= 10, `software rendering stalled at ${fps.toFixed(1)} FPS`);
  await key({key: "Escape", code: "Escape", windowsVirtualKeyCode: 27});
  await wait("document.pointerLockElement", value => value === null, "Escape releases capture");
  await delay(300);
  await screenshot("menu");
  const menuClick = async (x, y) => {
    const position = await evaluate(`(() => {
      const r = document.querySelector('#display').getBoundingClientRect();
      return {x:r.x+r.width*${x}/640, y:r.y+r.height*${y}/480};
    })()`);
    await send("Input.dispatchMouseEvent", {type:"mousePressed", ...position, button:"left", buttons:1, clickCount:1});
    await send("Input.dispatchMouseEvent", {type:"mouseReleased", ...position, button:"left", buttons:0, clickCount:1});
    await delay(200);
  };
  await menuClick(480, 190);
  await menuClick(200, 340);
  await wait("__dolly.transport.relativePointerRequested()", Boolean, "flat world generation");
  await delay(1300);
  await click();
  await wait("document.pointerLockElement?.id", value => value === "display", "flat world capture");
  await send("Input.dispatchMouseEvent", {type:"mouseMoved", x:point.x, y:point.y+350, buttons:0});
  await delay(300);
  const saveMap = async name => {
    await key({key:"Escape", code:"Escape", windowsVirtualKeyCode:27});
    await wait("document.pointerLockElement", value => value === null, "save releases capture");
    await delay(200);
    await menuClick(480, 290);
    await key({key:"End", code:"End", windowsVirtualKeyCode:35});
    for (let i = 0; i < 32; i++) await key({key:"Backspace", code:"Backspace", windowsVirtualKeyCode:8});
    await evaluate(`__dolly.input(${JSON.stringify(name)})`);
    await key({key:"Enter", code:"Enter", windowsVirtualKeyCode:13});
    await delay(500);
  };
  await click("right");
  await delay(350);
  await screenshot("placed");
  await saveMap("placed");
  await menuClick(320, 435);
  await delay(1300);
  await click();
  await wait("document.pointerLockElement?.id", value => value === "display", "resume after save");
  await click("left");
  await delay(350);
  await screenshot("broken");
  await saveMap("classicube-proof");
  await screenshot("saved");
  await menuClick(605, 455);
  await wait("__dolly.graphicsActive", value => !value, "normal Quit game releases display");
  await evaluate("__dolly.waitForInteractiveTerminal(/dolly:[^\\n]*\\$\\s*$/, 'recovery shell')");
  assert.equal(await evaluate("__dolly.submit('cd /home/dolly/classicube')"), 0);
  assert.equal(await evaluate("__dolly.submit('test -s maps/classicube-proof.cw')"), 0);
  assert.equal(await evaluate("__dolly.submit('echo CLASSICUBE-SURVIVED > classicube-proof.txt')"), 0);
  await evaluate("__dolly.saveSession('classicube-proof')");
  const maps = await evaluate(`(async () => {
    const browser = performance.getEntriesByType('resource').find(e => e.name.endsWith('/src/browser.mjs')).name;
    const store = await import(new URL('session-store.mjs', browser));
    const buffer = await store.decodeSessionSnapshot(await store.loadStoredSession('classicube-proof'));
    const view = new DataView(buffer), bytes = new Uint8Array(buffer), result = {};
    let offset = 16;
    for (let i = 0; i < view.getUint32(12, true); i++) {
      const nameLength = view.getUint32(offset+4, true), size = Number(view.getBigUint64(offset+8, true));
      offset += 16;
      const name = new TextDecoder().decode(bytes.subarray(offset, offset+nameLength));
      offset += nameLength;
      if (name.endsWith('.cw')) result[name] = Array.from(bytes.subarray(offset, offset+size));
      offset += size;
    }
    return result;
  })()`);
  const blockCount = name => {
    const data = gunzipSync(Buffer.from(maps['/home/dolly/classicube/maps/' + name + '.cw']));
    const tag = Buffer.from([7, 0, 10, ...Buffer.from('BlockArray')]);
    const offset = data.indexOf(tag) + tag.length;
    assert.ok(offset >= tag.length, 'saved ClassicWorld contains BlockArray');
    const length = data.readUInt32BE(offset);
    assert.equal(length, 128 * 64 * 128);
    return data.subarray(offset+4, offset+4+length).reduce((n, block) => n + (block !== 0), 0);
  };
  assert.equal(blockCount('placed'), 128 * 32 * 128 + 1, 'right click added one block');
  assert.equal(blockCount('classicube-proof'), 128 * 32 * 128, 'left click removed the placed block');
  await evaluate("window.__classicubeResult = null; void __dolly.submit('classicube maps/classicube-proof.cw').then(status => window.__classicubeResult = status); true");
  await wait("__dolly.graphicsActive", Boolean, "saved map reopens");
  await wait("__dolly.transport.relativePointerRequested()", Boolean, "saved map is playable");
  await delay(500);
  await screenshot("reloaded");
  await key({key: "c", code: "KeyC", modifiers: 2, windowsVirtualKeyCode: 67});
  assert.ok([0, 130].includes(await wait("window.__classicubeResult", value => value !== null, "game cancellation")));
  await wait("__dolly.graphicsActive", value => !value, "cancellation releases display");
  await evaluate("__dolly.waitForInteractiveTerminal(/dolly:[^\\n]*\\$\\s*$/, 'recovery shell')");
  assert.equal(await evaluate("__dolly.submit('grep -q CLASSICUBE-SURVIVED classicube-proof.txt && test -s maps/classicube-proof.cw')"), 0);
  console.log(`browser: ClassiCube textures, walking, capture/look/Escape, block placement/removal in saved world data, save/reload, normal exit and cancellation recovery passed; ${fps.toFixed(1)} presented FPS at 640x480`);
}
