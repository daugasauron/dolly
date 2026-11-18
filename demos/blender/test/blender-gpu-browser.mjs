// Blender's window on gpu@0, on a real adapter, on the private X display DISPLAY names: Chrome on
// Vulkan, or the installed Firefox (docs/gpu.md). Blender opens its default layout; a script of
// its own reads the window's frame back (Firefox under Xvfb shows no WebGPU canvas) and says what
// it drew; the test then presses K, which the script's key map item takes, and Blender quits.
// Usage: [DOLLY_BROWSER=firefox] node demos/blender/test/blender-gpu-browser.mjs
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { composed, launchInstalledFirefox } from "../../../test/browser.mjs";
import { startBrowserServer } from "../../../test/browser-server.mjs";
import { browsers } from "../../browsers.mjs";
import { writeCommand } from "../../browser.mjs";

// The window's frame once the layout has drawn: its size, the share of the interface's greys and
// of light pixels (text, icons), and the backend; the wall clock of the 3D view's first draw;
// redraws of the window, the 3D view and a header (what a hover redraws), each timed by
// Blender's redraw timer; then a key map item on K, which quits. Blender quits by itself after
// four minutes (its Python takes the terminal's interrupt).
const check = `import array, bpy, gpu, time, traceback

class DOLLY_OT_key(bpy.types.Operator):
    bl_idname = "wm.dolly_key"
    bl_label = "Dolly key"

    def execute(self, context):
        print("KEY", flush=True)
        bpy.app.timers.register(lambda: bpy.ops.wm.quit_blender() and None, first_interval=0.2)
        return {'FINISHED'}

bpy.utils.register_class(DOLLY_OT_key)

drawn = []
def first_draw():
    if not drawn:
        drawn.append(time.time())
        print("FIRSTDRAW", round(drawn[0], 3), flush=True)
handler = bpy.types.SpaceView3D.draw_handler_add(first_draw, (), 'WINDOW', 'POST_PIXEL')

def redraw(kind, area=None, region_type='WINDOW', iterations=10):
    window = bpy.context.window_manager.windows[0]
    override = {"window": window, "screen": window.screen}
    if area:
        override.update(area=area, region=[r for r in area.regions if r.type == region_type][0])
    with bpy.context.temp_override(**override):
        started = time.perf_counter()
        bpy.ops.wm.redraw_timer(type=kind, iterations=iterations)
        return round((time.perf_counter() - started) / iterations * 1000, 1)

def frame():
    window = bpy.context.window_manager.windows[0]
    with bpy.context.temp_override(window=window, screen=window.screen):
        bpy.ops.screen.screenshot(filepath="/tmp/frame.png")
    image = bpy.data.images.load("/tmp/frame.png")
    width, height = image.size
    pixels = array.array("f", [0.0]) * (width * height * 4)
    image.pixels.foreach_get(pixels)
    grey = light = 0
    for i in range(0, width * height, 7):
        r, g, b = pixels[4 * i], pixels[4 * i + 1], pixels[4 * i + 2]
        if abs(r - g) < 0.03 and abs(g - b) < 0.03 and 0.08 < r < 0.45:
            grey += 1
        if r > 0.7 and g > 0.7 and b > 0.7:
            light += 1
    samples = (width * height + 6) // 7
    print("BACKEND", gpu.platform.backend_type_get(), flush=True)
    print("FRAME", width, height, round(grey / samples, 3), round(light / samples, 4), flush=True)
    view = next(area for area in window.screen.areas if area.type == 'VIEW_3D')
    print("REDRAW window", redraw('DRAW_WIN_SWAP'), "view3d", redraw('DRAW', view),
          "header", redraw('DRAW', view, 'HEADER'), flush=True)
    print("READY", flush=True)

def text():
    """Words drawn on the GPU against the same words drawn by Blender's font library on the
    CPU into an image: the share of the CPU's lit pixels the GPU also lit, and of the GPU's."""
    import blf, imbuf
    from mathutils import Matrix
    w, h, words = 200, 40, "Dolly 0123 Blender"
    blf.size(0, 20)
    offscreen = gpu.types.GPUOffScreen(w, h)
    with offscreen.bind():
        framebuffer = gpu.state.active_framebuffer_get()
        framebuffer.clear(color=(0.0, 0.0, 0.0, 1.0))
        with gpu.matrix.push_pop(), gpu.matrix.push_pop_projection():
            gpu.matrix.load_identity()
            gpu.matrix.load_projection_matrix(
                Matrix.Diagonal((2 / w, 2 / h, 1, 1)) @ Matrix.Translation((-w / 2, -h / 2, 0)))
            blf.color(0, 1, 1, 1, 1)
            blf.position(0, 4, 12, 0)
            blf.draw(0, words)
        drawn = framebuffer.read_color(0, 0, w, h, 4, 0, 'UBYTE')
    offscreen.free()
    image = imbuf.new((w, h))
    with blf.bind_imbuf(0, image):
        blf.color(0, 1, 1, 1, 1)
        blf.position(0, 4, 12, 0)
        blf.draw_buffer(0, words)
    imbuf.write(image, filepath="/tmp/text.png")
    reference = bpy.data.images.load("/tmp/text.png").pixels[:]
    on_gpu = on_cpu = both = 0
    for y in range(h):
        for x in range(w):
            g = drawn[y][x][0] > 127
            c = reference[4 * (y * w + x)] * reference[4 * (y * w + x) + 3] > 0.5
            on_gpu += g
            on_cpu += c
            both += g and c
    print("TEXT", on_cpu, round(both / max(on_cpu, 1), 3), round(both / max(on_gpu, 1), 3), flush=True)

def checked():
    try:
        text()
    except Exception:
        print("ERROR", traceback.format_exc(), flush=True)
    try:
        frame()
    except Exception:
        print("ERROR", traceback.format_exc(), flush=True)
    keymap = bpy.context.window_manager.keyconfigs.addon.keymaps.new(name="Window", space_type="EMPTY")
    keymap.keymap_items.new("wm.dolly_key", "K", "PRESS")

bpy.app.timers.register(lambda: checked() and None, first_interval=3.0)
bpy.app.timers.register(lambda: bpy.ops.wm.quit_blender() and None, first_interval=240.0)
`;

for (const name of browsers) {
  assert.ok(["chromium", "firefox"].includes(name));
  const server = await startBrowserServer(new URL("../../..", import.meta.url).pathname, "system");
  const browser = name === "firefox"
    ? await launchInstalledFirefox()
    : await chromium.launch({ channel: "chrome", headless: false,
      args: ["--no-sandbox", "--ozone-platform=x11", "--enable-unsafe-webgpu", "--use-angle=vulkan", "--enable-features=Vulkan,VulkanFromANGLE"] });
  const deadline = setTimeout(() => void browser.close(), 900_000);
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }), errors = [];
    page.setDefaultTimeout(0);
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.text().startsWith("Dolly GPU:")) errors.push(message.text()); });
    const image = await composed(["gpu", "display", "input", "threads", "sockets", "clipboard", "http", "dso"], ["blender"], { base: "system" });
    await image.setup(page);
    await page.goto(server.origin + image.path);
    await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus), null, { timeout: 300_000 });
    await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
    const run = async command => assert.equal(await page.evaluate(text => __dolly.submit(text), command), 0, command);
    await run(writeCommand("/tmp/check.py", check));
    const submitted = Date.now() / 1000;
    const blender = page.evaluate(text => __dolly.submit(text), "blender --python /tmp/check.py > /tmp/blender.out 2>&1");
    await page.waitForFunction(() => __dolly.gpu?.active, null, { polling: 200, timeout: 300_000 });
    // The script reads the frame, then takes K: pressed, after Escape for the splash screen,
    // until Blender quits. Chrome's page is kept as it last showed the window (Firefox under
    // Xvfb shows no WebGPU canvas).
    let quit = false, shown = null;
    void blender.then(() => { quit = true; });
    const showing = () => page.evaluate(() => __dolly.gpu?.active === true);
    while (!quit) {
      await page.keyboard.press("Escape");
      await page.keyboard.press("k");
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (name === "chromium" && await showing()) {
        const shot = await page.screenshot();
        if (await showing()) shown = shot;
      }
    }
    if (shown) writeFileSync(new URL("../../../build/blender-gpu-chromium.png", import.meta.url), shown);
    const status = await blender;
    await run("clear; grep -v '^$' /tmp/blender.out | tail -n 20");
    const log = await page.evaluate(() => __dolly.visibleTerminalText());
    assert.equal(status, 0, `Blender ended with ${status}:\n${log}`);
    await run("clear; grep -E '^(BACKEND|TEXT|FRAME|FIRSTDRAW|REDRAW|READY|KEY)' /tmp/blender.out");
    const output = await page.evaluate(() => __dolly.visibleTerminalText());
    assert.match(output, /^BACKEND WEBGPU$/m);
    const [, width, height, grey, light] = output.match(/^FRAME (\d+) (\d+) ([\d.]+) ([\d.]+)$/m) ?? [];
    assert.ok(Number(width) >= 640 && Number(height) >= 400, `the window's frame is ${width} by ${height}`);
    assert.ok(Number(grey) > 0.5, `the interface's greys cover ${grey} of the frame`);
    assert.ok(Number(light) > 0.001, `text and icons cover ${light} of the frame`);
    const [, lit, found, extra] = output.match(/^TEXT (\d+) ([\d.]+) ([\d.]+)$/m) ?? [];
    assert.ok(Number(lit) > 200 && Number(found) > 0.95 && Number(extra) > 0.95,
      `text drawn on the GPU against Blender's drawing on the CPU: ${lit} pixels, ${found} found, ${extra} of the GPU's`);
    assert.match(output, /^KEY$/m, "Blender took the key");
    const firstDraw = Number(output.match(/^FIRSTDRAW ([\d.]+)$/m)?.[1]) - submitted;
    assert.equal(await page.evaluate(() => __dolly.gpu.isFallbackAdapter), false);
    assert.deepEqual(errors, []);
    console.log(name, `first draw of the 3D view ${firstDraw.toFixed(1)} s after the command;`, output.match(/^REDRAW .*$/m)?.[0]);
    console.log(`blender-gpu: ${name} passed`);
  } finally {
    clearTimeout(deadline);
    await browser.close();
    await server.close();
  }
}
