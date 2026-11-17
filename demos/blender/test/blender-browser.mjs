// Blender in default, as a person installs it: its Python on the default
// scene (a mesh added and arrayed, a .blend saved and loaded again), and
// the scene rendered by Cycles to a PNG, which Blender loads back to compare
// the cube at the frame's centre with the background at its corner.
// Usage: node demos/blender/test/blender-browser.mjs [chromium|firefox ...]
import { demoTest, writeCommand } from "../../browser.mjs";

const browsers = process.argv.length > 2 ? process.argv.slice(2) : ["chromium", "firefox"];
const scene = `import bpy
assert [o.name for o in bpy.data.objects] == ["Camera", "Cube", "Light"]
bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, location=(3, 0, 0))
sphere = bpy.context.object
sphere.modifiers.new("Array", "ARRAY").count = 3
evaluated = sphere.evaluated_get(bpy.context.evaluated_depsgraph_get())
assert (len(sphere.data.vertices), len(evaluated.data.vertices)) == (114, 342)
bpy.ops.wm.save_as_mainfile(filepath="/tmp/blender-test/scene.blend")
bpy.ops.wm.open_mainfile(filepath="/tmp/blender-test/scene.blend")
assert len(bpy.data.objects) == 4 and bpy.data.objects["Sphere"].modifiers[0].count == 3
print("scene ok")`;
const render = `import bpy
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 8
scene.render.resolution_percentage = 10
scene.render.filepath = "/tmp/blender-test/render.png"
bpy.ops.render.render(write_still=True)
image = bpy.data.images.load("/tmp/blender-test/render.png")
assert tuple(image.size) == (192, 108)
pixels = list(image.pixels)
at = lambda x, y: pixels[(y * 192 + x) * 4]
assert at(96, 54) > at(2, 2) + 0.1, (at(96, 54), at(2, 2))
print("render ok")`;

for (const browser of browsers) {
  await demoTest("blender", { image: "default", timeout: 900_000, browser }, async ({ open }) => {
    const { run } = await open();
    await run("amy install blender");
    await run("blender --version | grep -q '^Blender 5.3.0'");
    await run(`mkdir /tmp/blender-test && cd /tmp/blender-test && ${writeCommand("scene.py", scene)} && ` +
      "blender -b --python-exit-code 1 --python scene.py | grep -q '^scene ok'");
    await run(`cd /tmp/blender-test && ${writeCommand("render.py", render)} && ` +
      "blender -b --python-exit-code 1 --python render.py | grep -q '^render ok'");
  });
}
