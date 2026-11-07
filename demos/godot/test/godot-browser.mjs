// Godot in default, as a person installs it: amy installs the package and
// godot --headless runs a GDScript project: it computes, emits a signal, adds
// a node to the scene tree, sleeps, waits on a timer, writes and reads JSON
// under user://, reads its arguments and quits after ten frames with the
// status it chose. Then a 2D scene draws on the page through the Compatibility
// renderer on Mesa: the canvas shows it, its tone plays on the right channel
// only, a key and a click reach its script, and the script reads pixels of the
// frame it drew.
// Usage: node demos/godot/test/godot-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { demoTest, heardAudio, meterAudio, waitForDisplay, writeCommand } from "../../browser.mjs";

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
var pressed := false
var clicked := false

func _ready() -> void:
    var image := Image.create(64, 64, false, Image.FORMAT_RGBA8)
    for y in 64:
        for x in 64:
            image.set_pixel(x, y, Color(x / 63.0, y / 63.0, 0.5))
    $Sprite.texture = ImageTexture.create_from_image(image)
    print("ADAPTER ", RenderingServer.get_video_adapter_name())
    # A second of a 440 Hz tone on the right channel only, looped.
    var tone := PackedByteArray()
    tone.resize(48000 * 4)
    for frame in 48000:
        tone.encode_s16(frame * 4 + 2, int(16383 * sin(TAU * 440 * frame / 48000.0)))
    var stream := AudioStreamWAV.new()
    stream.format = AudioStreamWAV.FORMAT_16_BITS
    stream.stereo = true
    stream.mix_rate = 48000
    stream.data = tone
    stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
    stream.loop_end = 48000
    var player := AudioStreamPlayer.new()
    player.stream = stream
    add_child(player)
    player.play()
    print("AUDIO ", AudioServer.get_driver_name())
    started = Time.get_ticks_msec()

func _input(event: InputEvent) -> void:
    if event is InputEventKey and event.pressed and event.keycode == KEY_A:
        print("KEY ", char(event.unicode))
        pressed = true
    if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
        print("CLICK %d %d" % [event.position.x, event.position.y])
        clicked = true

func _process(_delta: float) -> void:
    frames += 1
    $Label.text = "frame %d" % frames
    if frames == 30:
        print("FPS ", snappedf(frames / ((Time.get_ticks_msec() - started) / 1000.0), 0.1))
    if pressed and clicked and frames >= 30:
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
    const { page, run, start, text } = await open({ setup: page => page.addInitScript(meterAudio) });
    await run("amy install godot && mkdir -p /tmp/godot-check/.godot");
    for (const [name, text] of Object.entries(project)) await run(writeCommand(`/tmp/godot-check/${name}`, text));
    // A project that never quits runs on, as Godot does natively.
    await run("timeout 60 godot --headless --path /tmp/godot-check -- one two > /tmp/godot-check.out 2>&1", 3);
    for (const line of expected) await run(`grep -qx '${line}' /tmp/godot-check.out`);
    await run("grep -q ERROR /tmp/godot-check.out", 1);

    // Playback may wait for a user interaction; the page has one.
    await page.mouse.click(10, 10);
    await run("mkdir -p /tmp/godot-scene/.godot");
    for (const [name, text] of Object.entries(scene)) await run(writeCommand(`/tmp/godot-scene/${name}`, text));
    const godot = start("timeout 120 godot --path /tmp/godot-scene > /tmp/godot-scene.out 2>&1");
    await page.waitForFunction(() => __dolly.transport.graphicsActive());
    // The background and the sprite's middle, on the page's canvas.
    await waitForDisplay(page, () => {
      const canvas = document.querySelector("canvas");
      const pixel = (x, y) => [...displaySnapshot.getContext("2d").getImageData(x, y, 1, 1).data].slice(0, 3);
      return canvas.width === 640 && canvas.height === 360 &&
        JSON.stringify(pixel(5, 5)) === "[25,51,102]" && pixel(320, 180).every(value => Math.abs(value - 128) < 6);
    });
    await page.keyboard.press("a");
    // The frame's point (160, 90): the page shows the 640 by 360 frame at its
    // own shape in the middle of the canvas.
    const point = await page.evaluate(([x, y]) => {
      const canvas = document.querySelector("#display"), bounds = canvas.getBoundingClientRect();
      const scale = Math.min(bounds.width / canvas.width, bounds.height / canvas.height);
      return [bounds.left + (bounds.width - canvas.width * scale) / 2 + x * scale,
        bounds.top + (bounds.height - canvas.height * scale) / 2 + y * scale];
    }, [160, 90]);
    await page.mouse.click(...point);
    assert.equal(await godot.done, 0);
    // The tone's RMS is .35; a meter's window spans more than the writes it sees.
    const heard = await heardAudio(page);
    assert.ok(heard[0] < 1e-6 && heard[1] > .15, `Wrong stereo playback: ${heard}`);
    for (const line of ["ADAPTER softpipe", "AUDIO Dolly", "KEY a", "CLICK 160 90", "BACKGROUND 193366", "SPRITE true"]) {
      await run(`grep -qx '${line}' /tmp/godot-scene.out`);
    }
    await run("clear; grep FPS /tmp/godot-scene.out");
    const rate = (await text()).match(/^FPS [\d.]+$/m);
    assert.ok(rate, "the scene reports its frame rate");
    console.log(`godot: ${browser} drew the scene at ${rate[0]}`);
  });
}
