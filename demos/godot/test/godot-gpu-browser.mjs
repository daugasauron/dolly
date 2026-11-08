// Godot's RenderingDevice on gpu@0, on a real adapter, on the private X display DISPLAY names:
// Chrome on Vulkan, or the installed Firefox (docs/gpu.md). A 2D scene on the Mobile renderer
// (godot), a 3D scene with a sky, light and shadow on Mobile (godot-editor running it) and on
// Forward+ (godot), and the editor itself each read their own frame back, as Firefox under Xvfb
// shows no WebGPU canvas; Truck Town's menu, its cars turning in 3D viewports, runs 600 frames.
// Usage: node demos/godot/test/godot-gpu-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { chromium, firefox } from "playwright-core";
import { composed } from "../../../test/browser.mjs";
import { startBrowserServer } from "../../../test/browser-server.mjs";
import { writeCommand } from "../../browser.mjs";

const browsers = process.argv.length > 2 ? process.argv.slice(2) : ["chromium", "firefox"];
const mobile = '[rendering]\nrenderer/rendering_method="mobile"\n';
// The 2D scene of godot-browser.mjs, on the Mobile renderer.
const scene2d = {
  "project.godot": `config_version=5\n[application]\nrun/main_scene="res://main.tscn"\n[display]\nwindow/size/viewport_width=640\nwindow/size/viewport_height=360\n${mobile}`,
  ".godot/global_script_class_cache.cfg": "list=[]\n",
  "main.tscn": `[gd_scene format=3]
[ext_resource type="Script" path="res://main.gd" id="1"]
[node name="Main" type="Node2D"]
script = ExtResource("1")
[node name="Background" type="ColorRect" parent="."]
offset_right = 640.0
offset_bottom = 360.0
color = Color(0.1, 0.2, 0.4, 1)
[node name="Sprite" type="Sprite2D" parent="."]
position = Vector2(320, 180)
scale = Vector2(2, 2)
[node name="Label" type="Label" parent="."]
offset_left = 20.0
offset_top = 20.0
`,
  "main.gd": `extends Node2D

var frames := 0
var started := 0

func _ready() -> void:
    var image := Image.create(64, 64, false, Image.FORMAT_RGBA8)
    for y in 64:
        for x in 64:
            image.set_pixel(x, y, Color(x / 63.0, y / 63.0, 0.5))
    $Sprite.texture = ImageTexture.create_from_image(image)
    print("ADAPTER ", RenderingServer.get_video_adapter_name())

func _process(_delta: float) -> void:
    frames += 1
    $Label.text = "frame %d" % frames
    if frames == 60:
        started = Time.get_ticks_msec()
    if frames == 300:
        print("FPS ", snappedf(240 / ((Time.get_ticks_msec() - started) / 1000.0), 0.1))
        var frame := get_viewport().get_texture().get_image()
        print("BACKGROUND ", frame.get_pixel(5, 5).to_html(false))
        print("SPRITE ", frame.get_pixel(320, 180).to_html(false))
        var text := 0
        for y in range(20, 45):
            for x in range(20, 120):
                if frame.get_pixel(x, y).r > 0.6:
                    text += 1
        print("LABEL ", text)
        get_tree().quit()
`,
};
// A box on a floor under a procedural sky, lit by a sun whose shadow falls on the box's side
// the camera sees: Mobile's shadow atlas is compared and filtered. The editor opens it with a
// plugin that reads the editor's frame back.
const scene3d = {
  "project.godot": `config_version=5\n[application]\nrun/main_scene="res://main.tscn"\n[display]\nwindow/size/viewport_width=640\nwindow/size/viewport_height=360\n${mobile}[editor_plugins]\nenabled=PackedStringArray("res://addons/check/plugin.cfg")\n`,
  ".godot/global_script_class_cache.cfg": "list=[]\n",
  "main.tscn": `[gd_scene format=3]
[ext_resource type="Script" path="res://main.gd" id="1"]
[sub_resource type="BoxMesh" id="box"]
[sub_resource type="StandardMaterial3D" id="red"]
albedo_color = Color(0.8, 0.1, 0.1, 1)
[sub_resource type="PlaneMesh" id="plane"]
size = Vector2(12, 12)
[sub_resource type="ProceduralSkyMaterial" id="sky_material"]
[sub_resource type="Sky" id="sky"]
sky_material = SubResource("sky_material")
[sub_resource type="Environment" id="environment"]
background_mode = 2
sky = SubResource("sky")
[node name="Main" type="Node3D"]
script = ExtResource("1")
[node name="Environment" type="WorldEnvironment" parent="."]
environment = SubResource("environment")
[node name="Sun" type="DirectionalLight3D" parent="."]
shadow_enabled = true
[node name="Box" type="MeshInstance3D" parent="."]
mesh = SubResource("box")
surface_material_override/0 = SubResource("red")
[node name="Floor" type="MeshInstance3D" parent="."]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, -0.5, 0)
mesh = SubResource("plane")
[node name="Camera" type="Camera3D" parent="."]
`,
  "main.gd": `extends Node3D

var frames := 0
var started := 0

func _ready() -> void:
    $Camera.look_at_from_position(Vector3(3, 2.5, 4), Vector3(0, 0, 0))
    $Sun.rotation_degrees = Vector3(-50, -60, 0)
    print("ADAPTER ", RenderingServer.get_video_adapter_name(), " ", RenderingServer.get_current_rendering_method())

func _process(_delta: float) -> void:
    frames += 1
    if frames == 60:
        started = Time.get_ticks_msec()
    if frames == 300:
        print("FPS ", snappedf(240 / ((Time.get_ticks_msec() - started) / 1000.0), 0.1))
        var frame := get_viewport().get_texture().get_image()
        var camera: Camera3D = $Camera
        var at := func(point: Vector3) -> String:
            return frame.get_pixelv(Vector2i(camera.unproject_position(point))).to_html(false)
        print("SKY ", frame.get_pixel(320, 10).to_html(false))
        print("BOX ", at.call(Vector3(0, 0.3, 0)))
        print("FLOOR ", at.call(Vector3(2.5, -0.5, 2.5)))
        print("SHADOW ", at.call(Vector3(0.9, -0.5, -0.2)))
        get_tree().quit()
`,
  "addons/check/plugin.cfg": `[plugin]\nname="check"\ndescription="Reads the editor's frame back"\nauthor="Dolly"\nversion="1"\nscript="plugin.gd"\n`,
  "addons/check/plugin.gd": `@tool
extends EditorPlugin

var frames := 0

func _process(_delta: float) -> void:
    frames += 1
    if frames != 240:
        return
    var image := EditorInterface.get_base_control().get_viewport().get_texture().get_image()
    var red := 0
    var light := 0
    for y in range(0, image.get_height(), 2):
        for x in range(0, image.get_width(), 2):
            var c := image.get_pixel(x, y)
            if c.r > 0.5 and c.g < 0.25 and c.b < 0.25:
                red += 1
            if c.r > 0.8 and c.g > 0.8 and c.b > 0.8:
                light += 1
    print("EDITOR %dx%d red %d light %d" % [image.get_width(), image.get_height(), red, light])
    EditorInterface.get_base_control().get_tree().quit()
`,
};
const color = (lines, key) => {
  const hex = lines.match(new RegExp(`^${key} ([0-9a-f]{6})$`, "m"))?.[1];
  assert.ok(hex, `${key} is printed`);
  return [0, 2, 4].map(at => parseInt(hex.slice(at, at + 2), 16));
};
const near = (actual, expected, label) =>
  assert.ok(actual.every((value, i) => Math.abs(value - expected[i]) <= 3), `${label} is ${actual}, not ${expected}`);

for (const name of browsers) {
  assert.ok(["chromium", "firefox"].includes(name));
  const server = await startBrowserServer(new URL("../../..", import.meta.url).pathname, "system");
  const browser = name === "firefox"
    ? await firefox.launch({ channel: "moz-firefox", headless: false, firefoxUserPrefs: { "dom.webgpu.enabled": true } })
    : await chromium.launch({ channel: "chrome", headless: false,
      args: ["--no-sandbox", "--ozone-platform=x11", "--enable-unsafe-webgpu", "--use-angle=vulkan", "--enable-features=Vulkan,VulkanFromANGLE"] });
  const deadline = setTimeout(() => void browser.close(), 1_500_000);
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }), errors = [];
    page.setDefaultTimeout(0);
    page.on("pageerror", error => errors.push(error.message));
    // WebGPU's validation errors reach the page's console after their batch is answered.
    page.on("console", message => { if (message.text().startsWith("Dolly GPU:")) errors.push(message.text()); });
    const image = await composed(["gpu", "audio", "display", "input", "threads"], ["godot", "godot-editor", "truck-town"], { base: "system" });
    await image.setup(page);
    await page.goto(server.origin + image.path);
    await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus), null, { timeout: 300_000 });
    await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
    const run = async command => assert.equal(await page.evaluate(text => __dolly.submit(text), command), 0, command);
    const output = async path => {
      await run(`clear; cat ${path}`);
      return page.evaluate(() => __dolly.visibleTerminalText());
    };
    for (const [project, files] of [["scene2d", scene2d], ["scene3d", scene3d]]) {
      for (const [file, text] of Object.entries(files)) {
        await run(`mkdir -p $(dirname /tmp/${project}/${file})`);
        await run(writeCommand(`/tmp/${project}/${file}`, text));
      }
    }
    // Each prints what the checks read, and gpu@0 refused no batch of its.
    await run("godot --path /tmp/scene2d > /tmp/scene2d.out 2>&1");
    await run("godot-editor --path /tmp/scene3d > /tmp/scene3d.out 2>&1");
    await run("godot --rendering-method forward_plus --path /tmp/scene3d > /tmp/forward.out 2>&1");
    await run("godot-editor -e --path /tmp/scene3d > /tmp/editor.out 2>&1");
    await run("truck-town --quit-after 600 > /tmp/truck.out 2>&1");
    await run("! grep -q 'refused a batch' /tmp/scene2d.out /tmp/scene3d.out /tmp/forward.out /tmp/editor.out /tmp/truck.out");

    const lines2d = await output("/tmp/scene2d.out | grep -E '^(ADAPTER|FPS|BACKGROUND|SPRITE|LABEL) '");
    assert.match(lines2d, /^ADAPTER WebGPU$/m);
    near(color(lines2d, "BACKGROUND"), [0x19, 0x33, 0x66], "the background");
    near(color(lines2d, "SPRITE"), [0x80, 0x80, 0x7f], "the sprite's middle");
    assert.ok(Number(lines2d.match(/^LABEL (\d+)$/m)?.[1]) > 100, "the label's text is drawn");

    const scenes3d = [];
    for (const [file, method] of [["scene3d", "mobile"], ["forward", "forward_plus"]]) {
      const lines = await output(`/tmp/${file}.out | grep -E '^(ADAPTER|FPS|SKY|BOX|FLOOR|SHADOW) '`);
      assert.match(lines, new RegExp(`^ADAPTER WebGPU ${method}$`, "m"));
      near(color(lines, "SKY"), [0x88, 0x91, 0x9c], `${method}'s sky`);
      near(color(lines, "BOX"), [0xcb, 0x2c, 0x30], `${method}'s box`);
      near(color(lines, "FLOOR"), [0xbc, 0xc1, 0xc8], `${method}'s lit floor`);
      near(color(lines, "SHADOW"), [0x52, 0x5e, 0x6e], `${method}'s shadow`);
      scenes3d.push(lines);
    }

    const editor = await output("/tmp/editor.out | grep '^EDITOR '");
    const [, red, light] = editor.match(/^EDITOR 1152x648 red (\d+) light (\d+)$/m) ?? [];
    assert.ok(Number(red) > 1000 && Number(light) > 40, `the editor draws its 3D view and text: ${editor}`);
    assert.equal(await page.evaluate(() => __dolly.gpu.isFallbackAdapter), false);
    assert.deepEqual(errors, []);
    for (const line of [lines2d, ...scenes3d].join("\n").split("\n").filter(line => line.startsWith("FPS"))) console.log(name, line);
    console.log(`godot-gpu: ${name} passed`);
  } finally {
    clearTimeout(deadline);
    await browser.close();
    await server.close();
  }
}
