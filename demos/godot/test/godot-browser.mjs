// Godot in default, as a person installs it: amy installs the package and
// godot --headless runs a GDScript project: it computes, emits a signal, adds
// a node to the scene tree, sleeps, waits on a timer, writes and reads JSON
// under user://, reads its arguments and quits after ten frames with the
// status it chose.
// Usage: node demos/godot/test/godot-browser.mjs [chromium|firefox ...]
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
const expected = ["ON Dolly /usr/bin/godot", "PRIMES 2262", "TREE /root/Main/Child", "CLOCK true", "TIMER", "JSON 42.0",
  "ARGS one two", "FRAMES 10"];

for (const browser of browsers) {
  await demoTest("godot", { image: "default", timeout: 900_000, browser }, async ({ open }) => {
    const { run } = await open();
    await run("amy install godot && mkdir -p /tmp/godot-check/.godot");
    for (const [name, text] of Object.entries(project)) await run(writeCommand(`/tmp/godot-check/${name}`, text));
    // A project that never quits runs on, as Godot does natively.
    await run("timeout 60 godot --headless --path /tmp/godot-check -- one two > /tmp/godot-check.out 2>&1", 3);
    for (const line of expected) await run(`grep -qx '${line}' /tmp/godot-check.out`);
    await run("grep -q ERROR /tmp/godot-check.out", 1);
  });
}
