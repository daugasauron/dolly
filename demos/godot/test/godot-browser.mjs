// Godot in default, as a person installs it: amy installs the package and
// godot --headless runs a GDScript project: it computes, emits a signal, adds
// a node to the scene tree, sleeps, waits on a timer, writes and reads JSON
// under user://, reads its arguments and quits after ten frames with the
// status it chose. Then a 2D scene draws on the page through the Compatibility
// renderer on Mesa, and its script reads pixels of the frame it drew.
// Usage: node demos/godot/test/godot-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { demoTest, writeCommand } from "../../browser.mjs";

const browsers = process.argv.length > 2 ? process.argv.slice(2) : ["chromium", "firefox"];
const project = {
  "project.godot": `config_version=5
[application]
config/name="check"
run/main_scene="res://main.tscn"
`,
  // What the editor writes when it imports a project; an export template
  // reports a project without it. The script is indented with spaces: the
  // terminal takes a typed tab for completion.
  ".godot/global_script_class_cache.cfg": "list=[]\n",
  "main.tscn": `[gd_scene format=3]
[ext_resource type="Script" path="res://main.gd" id="1"]
[node name="Main" type="Node"]
script = ExtResource("1")
`,
  "main.gd": `extends Node

signal counted(total)

var frames := 0
var done := false

func _ready() -> void:
    print("ON ", OS.get_name(), " ", OS.get_executable_path())
    var primes := 0
    for n in range(2, 20000):
        var prime := true
        for d in range(2, int(sqrt(n)) + 1):
            if n % d == 0:
                prime = false
                break
        if prime:
            primes += 1
    counted.connect(func(total): print("PRIMES ", total))
    counted.emit(primes)
    var child := Node2D.new()
    child.name = "Child"
    add_child(child)
    print("TREE ", child.get_path())
    var started := Time.get_ticks_usec()
    OS.delay_usec(250000)
    print("CLOCK ", Time.get_ticks_usec() - started >= 250000)
    await get_tree().create_timer(0.1).timeout
    print("TIMER")
    var file := FileAccess.open("user://state.json", FileAccess.WRITE)
    file.store_string(JSON.stringify({"answer": 42}))
    file.close()
    print("JSON ", JSON.parse_string(FileAccess.get_file_as_string("user://state.json")).answer)
    print("ARGS ", " ".join(OS.get_cmdline_user_args()))
    done = true

func _process(_delta: float) -> void:
    if not done:
        return
    frames += 1
    if frames == 10:
        print("FRAMES ", frames)
        get_tree().quit(3)
`,
};
// A background, a texture made in the script and a label, 640 by 360.
const scene = {
  "project.godot": `config_version=5
[application]
config/name="scene"
run/main_scene="res://main.tscn"
[display]
window/size/viewport_width=640
window/size/viewport_height=360
`,
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
    started = Time.get_ticks_msec()

func _process(_delta: float) -> void:
    frames += 1
    $Label.text = "frame %d" % frames
    if frames == 30:
        print("FPS ", snappedf(frames / ((Time.get_ticks_msec() - started) / 1000.0), 0.1))
        var frame := get_viewport().get_texture().get_image()
        print("BACKGROUND ", frame.get_pixel(5, 5).to_html(false))
        var middle := frame.get_pixel(320, 180)
        print("SPRITE ", absf(middle.r - 0.5) < 0.02 and absf(middle.g - 0.5) < 0.02 and absf(middle.b - 0.5) < 0.02)
        get_tree().quit()
`,
};
const expected = ["ON Dolly /usr/bin/godot", "PRIMES 2262", "TREE /root/Main/Child", "CLOCK true", "TIMER", "JSON 42.0",
  "ARGS one two", "FRAMES 10"];

for (const browser of browsers) {
  await demoTest("godot", { image: "default", timeout: 900_000, browser }, async ({ open }) => {
    const { run, text } = await open();
    await run("amy install godot && mkdir -p /tmp/godot-check/.godot");
    for (const [name, text] of Object.entries(project)) await run(writeCommand(`/tmp/godot-check/${name}`, text));
    // A project that never quits runs on, as Godot does natively.
    await run("timeout 60 godot --headless --path /tmp/godot-check -- one two > /tmp/godot-check.out 2>&1", 3);
    for (const line of expected) await run(`grep -qx '${line}' /tmp/godot-check.out`);
    await run("grep -q ERROR /tmp/godot-check.out", 1);

    await run("mkdir -p /tmp/godot-scene/.godot");
    for (const [name, text] of Object.entries(scene)) await run(writeCommand(`/tmp/godot-scene/${name}`, text));
    await run("timeout 120 godot --path /tmp/godot-scene > /tmp/godot-scene.out 2>&1");
    for (const line of ["ADAPTER softpipe", "BACKGROUND 193366", "SPRITE true"]) await run(`grep -qx '${line}' /tmp/godot-scene.out`);
    await run("clear; grep FPS /tmp/godot-scene.out");
    const rate = (await text()).match(/^FPS [\d.]+$/m);
    assert.ok(rate, "the scene reports its frame rate");
    console.log(`godot: ${browser} drew the scene at ${rate[0]}`);
  });
}
