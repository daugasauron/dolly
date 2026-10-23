import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { createDollyfileGraphLoader } from "../scripts/dollyfile-graph.mjs";
import { discoverImageDefinitions } from "../scripts/image-definitions.mjs";
import { siteReference } from "../src/static-asset.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const loadProjectGraph = createDollyfileGraphLoader(projectDir);

test("redistributed upstream programs retain their licenses", async () => {
  const expected = new Map([
    ["system-build", ["/usr/share/licenses/make/COPYING", "/usr/share/licenses/libcxx/LICENSE", "/usr/share/licenses/libcxxabi/LICENSE"]],
    ["system-tools", ["/usr/share/licenses/samurai/LICENSE", "/usr/share/licenses/awk/LICENSE",
      "/usr/share/licenses/sbase/LICENSE"]], ["git", ["/usr/share/licenses/git/COPYING"]],
    ["zlib", ["/usr/share/licenses/zlib/LICENSE"]], ["curl", ["/usr/share/licenses/curl/COPYING"]],
    ["zig-build", ["/usr/share/licenses/zig/LICENSE"]],
    ["less", ["/usr/share/licenses/less/LICENSE", "/usr/share/licenses/termcap/COPYING"]],
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

test("a package that brings a command brings its manual page", async () => {
  const under = (root, path) => path === root || path.startsWith(`${root}/`);
  for (const definition of await discoverImageDefinitions(projectDir)) {
    const recipe = (await loadProjectGraph(definition.filename)).root;
    if (recipe.role !== "package" || !recipe.exports.some(({ type }) => type === "TOOL")) continue;
    const retained = [...recipe.files, ...recipe.folders].map(({ path }) => path);
    assert.ok(retained.some(path => under("/usr/share/man", path)), `${definition.image}: no page under /usr/share/man`);
  }
});

// amy reads /etc/dolly/installed. A package that only keeps files of its base
// (cc of system-build) is held by every image built on that base, so an image
// with amy installs it too, and its record says what it holds.
test("an image with amy records the packages its base holds", async () => {
  const definitions = await discoverImageDefinitions(projectDir);
  const byLocation = new Map(definitions.map(definition => [siteReference(definition.filename), definition]));
  const rows = (definition, operation) => definition.parsed.artifacts
    .filter(artifact => artifact.operation === operation).map(({ location }) => byLocation.get(location));
  const base = definition => rows(definition, "from")[0];
  const installed = definition => {
    const names = new Set();
    const visit = image => rows(image, "install").filter(({ image }) => !names.has(image))
      .forEach(row => { names.add(row.image); visit(row); });
    for (let image = definition; image; image = base(image)) visit(image);
    return names;
  };
  const kept = definitions.filter(({ parsed }) => parsed.role === "package" && !parsed.sources.length &&
    !parsed.slops.length && parsed.artifacts.length === 1);
  for (const definition of definitions.filter(definition => installed(definition).has("amy"))) {
    const bases = [];
    for (let image = base(definition); image; image = base(image)) bases.push(image.image);
    for (const name of kept.filter(slice => bases.includes(base(slice).image)).map(({ image }) => image)) {
      assert.ok(installed(definition).has(name), `${definition.image} holds ${name} but does not install it`);
    }
  }
});
