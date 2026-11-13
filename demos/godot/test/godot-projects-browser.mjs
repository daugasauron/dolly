// Godot's editor on the two games' projects as a newcomer meets them, on a real adapter, on the
// private X display DISPLAY names: Chrome on Vulkan, or the installed Firefox (docs/gpu.md).
// godot-airtime and godot-lantern-drift start their game; Q leaves the shell, where the editor
// opens the copy of the project with its main scene, the world the game builds standing in its 3D
// view (a probe plugin counts its meshes and the colours of the view). The eye beside the HUD in
// the Scene dock hides it, F5 runs the game so and Ctrl+S saves the scene. Copy and paste are the
// page's (clipboard@0): a node's name copied in its rename field is the browser's and pastes into
// another node's, and the browser's text pastes as a third's. The editor's log holds no error.
// Usage: node demos/godot/test/godot-projects-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { chromium, firefox } from "playwright-core";
import { startBrowserServer } from "../../../test/browser-server.mjs";
import { writeCommand } from "../../browser.mjs";

const browsers = process.argv.length > 2 ? process.argv.slice(2) : ["chromium", "firefox"];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// Each game: its image, its project's copy, its HUD node, and the nodes renamed by copy and paste.
const games = [
  { image: "godot-airtime", project: "airtime", hud: "Hud", copied: "Camera", into: "Pads" },
  { image: "godot-lantern-drift", project: "lantern-drift", hud: "HUD", copied: "Camera", into: "Sound" },
];
// Prints what the editor shows once the scene has stood a while: the edited scene, the meshes
// under it (the tool scripts' too) and how many colours the 3D view has.
const probe = {
  "addons/probe/plugin.cfg": `[plugin]\nname="probe"\ndescription="What the editor shows"\nauthor="Dolly"\nversion="1"\nscript="plugin.gd"\n`,
  "addons/probe/plugin.gd": `@tool
extends EditorPlugin

func _enter_tree() -> void:
    await get_tree().create_timer(40.0).timeout
    var root := EditorInterface.get_edited_scene_root()
    var meshes := 0
    var pending := []
    if root:
        pending.append(root)
    while pending:
        var node: Node = pending.pop_back()
        if node is MeshInstance3D or node is MultiMeshInstance3D:
            meshes += 1
        pending.append_array(node.get_children())
    var image := EditorInterface.get_editor_viewport_3d(0).get_texture().get_image()
    var colours := {}
    for y in range(0, image.get_height(), 4):
        for x in range(0, image.get_width(), 4):
            var c := image.get_pixel(x, y)
            colours[Vector3i(c.r8 / 8, c.g8 / 8, c.b8 / 8)] = true
    print("SHOWN %s meshes %d colours %d" % [root.scene_file_path if root else "none", meshes, colours.size()])
`,
};

for (const name of browsers) {
  assert.ok(["chromium", "firefox"].includes(name));
  for (const game of games) {
    const server = await startBrowserServer(new URL("../../..", import.meta.url).pathname, game.image);
    const browser = name === "firefox"
      ? await firefox.launch({ channel: "moz-firefox", headless: false,
        firefoxUserPrefs: { "dom.webgpu.enabled": true, "dom.events.testing.asyncClipboard": true } })
      : await chromium.launch({ channel: "chrome", headless: false,
        args: ["--no-sandbox", "--ozone-platform=x11", "--enable-unsafe-webgpu", "--use-angle=vulkan", "--enable-features=Vulkan,VulkanFromANGLE"] });
    const deadline = setTimeout(() => void browser.close(), 900_000);
    try {
      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      if (name === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: server.origin });
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(0);
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.text().startsWith("Dolly GPU:")) errors.push(message.text()); });
      await page.goto(`${server.origin}/${game.image}/`);
      await page.waitForFunction(() => window.__dolly?.gpu?.active, null, { polling: 250, timeout: 180_000 });
      await sleep(10_000);
      await page.keyboard.press("q");
      await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
      const run = async command => assert.equal(await page.evaluate(text => __dolly.submit(text), command), 0, command);
      const text = () => page.evaluate(() => __dolly.visibleTerminalText());
      const directory = `~/${game.project}`;
      for (const [file, body] of Object.entries(probe)) {
        await run(`mkdir -p $(dirname ${directory}/${file})`);
        await run(writeCommand(`${directory}/${file}`, body));
      }
      await run(`printf '\\n[editor_plugins]\\nenabled=PackedStringArray("res://addons/probe/plugin.cfg")\\n' >> ${directory}/project.godot`);

      // The editor on the page; its Filter Nodes field shows the text cursor once it is laid out.
      const editing = page.evaluate(text => __dolly.submit(text), `godot-editor -e --path ${directory} > /tmp/editor.log 2>&1`);
      editing.catch(() => {});
      await page.waitForFunction(() => __dolly.gpu?.active, null, { polling: 250, timeout: 180_000 });
      // A move to where the pointer already is reaches no program: it steps a pixel each time.
      for (let tries = 0; ; tries++) {
        await page.mouse.move(150 + tries % 2, 95);
        if (await page.evaluate(() => document.querySelector("#display").style.cursor === "text")) break;
        assert.ok(tries < 120, "the editor's Scene dock is laid out");
        await sleep(1000);
      }
      await sleep(25_000);
      // The Scene dock's filter shows the node asked for alone, in its first row.
      const node = async label => {
        await page.mouse.click(150, 95);
        await page.keyboard.press("Control+a");
        await page.keyboard.type(label);
        await sleep(1000);
        await page.mouse.click(90, 135);
        await sleep(500);
      };
      // The HUD's eye hides it; F5 runs the game so; Ctrl+S saves.
      await node(game.hud);
      await page.mouse.click(266, 135);
      await sleep(1000);
      await page.keyboard.press("F5");
      await sleep(30_000);
      if (name === "chromium") await page.screenshot({ path: `build/godot-${game.project}-${name}-run.png` });
      // The game has the page until it quits (Q), and the editor has it back.
      await page.keyboard.press("q");
      await sleep(8000);
      await page.keyboard.press("Control+s");
      await sleep(3000);

      // A node's name copied in its rename field is the browser's clipboard's...
      const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
      await node(game.copied);
      await page.keyboard.press("F2");
      await sleep(500);
      await page.keyboard.press("Control+c");
      await page.waitForFunction(copied => document.documentElement.dataset.clipboardCopy === "copied", null, { timeout: 10_000 });
      assert.equal(await clipboard(), game.copied);
      await page.keyboard.press("Escape");
      // ...pastes into another's, and the browser's text pastes as the HUD's.
      await node(game.into);
      await page.keyboard.press("F2");
      await sleep(500);
      await page.keyboard.press("Control+v");
      await page.keyboard.type("Rig");
      await page.keyboard.press("Enter");
      await sleep(1000);
      await page.evaluate(() => navigator.clipboard.writeText("Overlay"));
      await node(game.hud);
      await page.keyboard.press("F2");
      await sleep(500);
      await page.keyboard.press("Control+v");
      await page.keyboard.press("Enter");
      await sleep(1000);
      await page.keyboard.press("Control+s");
      await sleep(3000);
      if (name === "chromium") await page.screenshot({ path: `build/godot-${game.project}-${name}-renamed.png` });
      await page.keyboard.press("Control+q");
      assert.equal(await editing, 0, await text());

      await run("clear; grep -E '^SHOWN' /tmp/editor.log");
      const [, scene, meshes, colours] = (await text()).match(/SHOWN (\S+) meshes (\d+) colours (\d+)/) ?? [];
      assert.equal(scene, "res://main.tscn", "the editor opens the main scene");
      assert.ok(Number(meshes) > 20, `the world stands in the scene: ${meshes} meshes`);
      assert.ok(Number(colours) > 100, `the 3D view shows it: ${colours} colours`);
      // The game ran from the editor (a second engine's banner), with the HUD hidden and saved.
      await run("test $(grep -c '^Godot Engine v' /tmp/editor.log) -ge 2");
      await run(`sed -n '/name="Overlay"/,/^$/p' ${directory}/main.tscn | grep -qx 'visible = false'`);
      await run(`grep -q 'node name="${game.copied}Rig"' ${directory}/main.tscn`);
      // Nothing a step needs failed: no error, and none of the warnings of the owner's log.
      await run("! grep -E '^ERROR|TCP|Debug adapter|language server|Keeping screen on|Clipboard is not supported' /tmp/editor.log");
      assert.deepEqual(errors, [], `${name}: no WebGPU or page errors`);
      console.log(`godot-projects: ${game.image} in ${name} passed (${meshes} meshes, ${colours} colours)`);
    } finally {
      clearTimeout(deadline);
      await browser.close();
      await server.close();
    }
  }
}
