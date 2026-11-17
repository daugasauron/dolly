// Godot's editor in default, as a person installs it: it imports an SVG into a
// project and exports the project's pack, which godot runs. Then Dodge the
// Creeps, which the editor exported when its package was built, shows its title
// on the page and starts on Enter: its score counts. Last the editor opens its
// own window on the page, changes its view at a click and opens a script at a double click.
// Usage: [DOLLY_BROWSER=firefox] node demos/godot/test/godot-editor-browser.mjs
import assert from "node:assert/strict";
import { browsers } from "../../browsers.mjs";
import { demoTest, framePoint, waitForDisplay, writeCommand } from "../../browser.mjs";

const project = {
  "project.godot": `config_version=5
[application]
run/main_scene="res://main.tscn"
`,
  "export_presets.cfg": `[preset.0]
name="Dolly"
platform="Linux"
runnable=true
export_filter="all_resources"
[preset.0.options]
custom_template/release=""
`,
  "icon.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#4080ff"/></svg>
`,
  "main.tscn": `[gd_scene format=3]
[ext_resource type="Script" path="res://main.gd" id="1"]
[node name="Main" type="Node"]
script = ExtResource("1")
`,
  // Indented with spaces: the terminal takes a typed tab for completion.
  "main.gd": `extends Node
func _ready() -> void:
    var icon: Texture2D = load("res://icon.svg")
    print("ICON ", icon.get_size(), " ", icon.get_image().get_pixel(8, 8).to_html(false))
    get_tree().quit()
`,
};

for (const browser of browsers) {
  await demoTest("godot editor", { image: "default", timeout: 1_200_000, browser }, async ({ open }) => {
    const { page, run, start } = await open();
    await run("amy install godot-editor dodge-the-creeps && mkdir -p /tmp/editor-check");
    for (const [name, text] of Object.entries(project)) await run(writeCommand(`/tmp/editor-check/${name}`, text));
    await run("cd /tmp/editor-check && godot-editor --headless --import > /dev/null 2>&1 && " +
      "godot-editor --headless --export-pack Dolly /tmp/editor-check.pck > /dev/null 2>&1");
    await run("cd /tmp && godot --headless --main-pack /tmp/editor-check.pck > /tmp/editor-check.out 2>&1");
    await run("grep -qx 'ICON (16.0, 16.0) 4080ff' /tmp/editor-check.out");

    const game = start("dodge-the-creeps");
    await page.waitForFunction(() => __dolly.transport.graphicsActive());
    // The title on the game's background; then the score, at the top, counts.
    const title = await waitForDisplay(page, () => {
      const canvas = document.querySelector("canvas");
      const pixels = (x, y, width, height) => [...displaySnapshot.getContext("2d").getImageData(x, y, width, height).data].join();
      return canvas.width === 480 && canvas.height === 720 && pixels(5, 700, 1, 1) === "56,95,97,255" && pixels(200, 10, 80, 60);
    });
    await page.keyboard.press("Enter");
    await waitForDisplay(page, title =>
      [...displaySnapshot.getContext("2d").getImageData(200, 10, 80, 60).data].join() !== title, title, { timeout: 60_000 });
    await page.keyboard.press("Control+c");
    assert.equal(await game.done, 130);
    await page.waitForFunction(() => !__dolly.transport.graphicsActive());

    // The editor's own window, windowed at 1152 by 648 (maximized, it fills the
    // page): the project opens in the 3D view, whose ground is brown; a click on
    // the 2D tab, at the frame's (443, 16), shows the 2D view's grey.
    const editor = start("cd /tmp/editor-check && godot-editor --editor --windowed --resolution 1152x648 --path . > /dev/null 2>&1");
    await page.waitForFunction(() => __dolly.transport.graphicsActive());
    const ground = () => {
      const canvas = document.querySelector("canvas");
      const [r, g, b] = displaySnapshot.getContext("2d").getImageData(700, 450, 1, 1).data;
      return canvas.width === 1152 && canvas.height === 648 && r > g && g > b;
    };
    const grey = () => [...displaySnapshot.getContext("2d").getImageData(700, 450, 1, 1).data].slice(0, 3).join() === "77,77,77";
    await waitForDisplay(page, ground, undefined, { timeout: 300_000 });
    // The editor draws its view before it takes clicks, so the click repeats.
    for (let attempt = 1; ; attempt++) {
      await page.mouse.click(...await framePoint(page, 443, 16));
      try {
        await waitForDisplay(page, grey, undefined, { timeout: 10_000 });
        break;
      } catch (error) {
        if (attempt === 12) throw error;
      }
    }
    // A double click on main.gd in the FileSystem dock, two clicks 90 ms apart as a hand's, opens
    // it in the script editor, whose page is dark grey there. The editor draws a frame a second
    // here: where one comes between the presses, they are timed by when they came.
    const script = await framePoint(page, 64, 505);
    for (const pause of [90, 0]) {
      await page.mouse.click(...script);
      await new Promise(resolve => setTimeout(resolve, pause));
    }
    await waitForDisplay(page, () => [...displaySnapshot.getContext("2d").getImageData(700, 450, 1, 1).data].slice(0, 3).join() === "26,26,26");
    // The editor's Ctrl+C is Copy (it clears ISIG while it has the page); Ctrl+Q quits it. One
    // pressed at once after the click is not taken, so it repeats.
    while (await page.evaluate(() => __dolly.transport.graphicsActive())) {
      await page.keyboard.press("Control+q");
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    assert.equal(await editor.done, 0);
  });
}
