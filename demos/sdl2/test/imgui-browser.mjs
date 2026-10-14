// The imgui package on `system`: upstream's SDL2 and SDL_Renderer example draws
// ImGui's windows over its clear colour and ends at Ctrl+C.
// Usage: node demos/sdl2/test/imgui-browser.mjs
import assert from "node:assert/strict";
import { demoTest, installProbe } from "../../browser.mjs";

for (const browser of ["chromium", "firefox"]) {
  await demoTest("imgui", { image: "imgui", browser, timeout: 600_000 }, async ({ open }) => {
    const { page, start } = await open(await installProbe("imgui"));
    const demo = start("imgui-demo");
    await page.waitForFunction(() => __dolly.transport.graphicsActive());
    // The example clears to (0.45, 0.55, 0.60); its windows draw over part of it.
    await page.waitForFunction(() => {
      const canvas = document.querySelector("canvas");
      const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      let clear = 0, other = 0;
      for (let index = 0; index < pixels.length; index += 4 * 97) {
        const [r, g, b] = pixels.subarray(index, index + 3);
        if (Math.abs(r - 115) <= 1 && Math.abs(g - 140) <= 1 && Math.abs(b - 153) <= 1) clear += 1; else other += 1;
      }
      return clear > 100 && other > 100;
    }, null, { timeout: 120_000 });
    await page.keyboard.press("Control+C");
    assert.equal(await demo.done, 0);
  });
}
