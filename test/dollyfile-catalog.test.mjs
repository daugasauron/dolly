import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { createDollyfileGraphLoader } from "../scripts/dollyfile-graph.mjs";
import { discoverImageDefinitions } from "../scripts/image-definitions.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const loadProjectGraph = createDollyfileGraphLoader(projectDir);

test("redistributed upstream programs retain their licenses", async () => {
  const expected = new Map([
    ["system-build", ["/usr/share/licenses/make/COPYING", "/usr/share/licenses/libcxx/LICENSE", "/usr/share/licenses/libcxxabi/LICENSE"]],
    ["system-tools", ["/usr/share/licenses/samurai/LICENSE", "/usr/share/licenses/git/COPYING",
      "/usr/share/licenses/awk/LICENSE", "/usr/share/licenses/sbase/LICENSE"]],
    ["zlib", ["/usr/share/licenses/zlib/LICENSE"]], ["curl", ["/usr/share/licenses/curl/COPYING"]],
    ["zig-build", ["/usr/share/licenses/zig/LICENSE"]],
    ["ghostty-build", ["/usr/share/licenses/ghostty/LICENSE", "/usr/share/licenses/uucode/LICENSE.md"]],
  ]);
  for (const [image, paths] of expected) {
    const graph = await loadProjectGraph(image === "default" ? "Dollyfile" : `Dollyfile-${image}`);
    const retained = new Set(graph.root.files.map(({ path }) => path));
    for (const path of paths) assert.ok(retained.has(path), `${image} does not retain ${path}`);
  }
});

test("non-temporary SOURCE inputs are retained or explicitly removed by their recipe", async () => {
  const contains = (root, path) => path === root || path.startsWith(`${root}/`);
  for (const definition of await discoverImageDefinitions(projectDir)) {
    const recipe = (await loadProjectGraph(definition.filename)).root;
    const retained = [
      ...recipe.files.map(({ path }) => path).filter((path) => !path.startsWith("/tmp/")),
      ...recipe.folders.map(({ path }) => path),
      ...recipe.exports.flatMap(({ type, details }) => type !== "ENV" && type !== "TOOL" && details[0] ? [details[0]] : []),
    ];
    const tools = new Set(recipe.exports.filter(({ type }) => type === "TOOL").map(({ name }) => name));
    const removed = recipe.slops.filter(({ command }) => command[0] === "rm")
      .flatMap(({ command }) => command.filter((word) => word.startsWith("/")));
    for (const source of recipe.sources.filter(({ destination }) => !destination.startsWith("/tmp/"))) {
      const tool = source.destination.split("/").at(-1);
      const exportedTool = tools.has(tool) && [`/bin/${tool}`, `/usr/bin/${tool}`].includes(source.destination);
      assert.ok(retained.some((root) => contains(root, source.destination)) ||
        removed.some((root) => contains(root, source.destination)) || exportedTool,
        `${definition.image} neither retains nor removes ${source.destination}`);
    }
  }
});

// The kernel names no shell: an image's environment does, where it has one.
test("a recipe that offers Slop names it as SHELL", async () => {
  for (const { image, parsed } of await discoverImageDefinitions(projectDir)) {
    if (!parsed.exports.some(({ type, name }) => type === "TOOL" && name === "slop")) continue;
    assert.ok(parsed.exports.some(({ type, name, details }) => type === "ENV" && name === "SHELL" && details[0] === "/bin/slop"),
      `${image} exports the tool slop without EXPORTS ENV SHELL /bin/slop`);
  }
});
