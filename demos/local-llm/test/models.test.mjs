import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const demo = new URL("../", import.meta.url);
const read = name => readFileSync(new URL(name, demo), "utf8");

test("every model description is installed by the packages it names", () => {
  const provider = read("Dollyfile-pi-llm");
  for (const name of readdirSync(new URL("models/", demo))) {
    const id = name.slice(0, -5), model = JSON.parse(read(`models/${name}`));
    assert.ok(existsSync(new URL(model.source.license, demo)), `${id}: no license ${model.source.license}`);
    const recipes = model.packages.map(image => read(`Dollyfile-${image}`)).join("\n");
    // The weights arrive as parts joined by the recipe.
    for (const file of [...Object.keys(model.files), name]) {
      assert.match(recipes, new RegExp(` /usr/share/dolly/llm/${file.replaceAll(".", "\\.")}$`, "m"), `${id}: no recipe writes ${file}`);
    }
    assert.match(recipes, new RegExp(`^FILE /usr/share/dolly/llm/${name.replaceAll(".", "\\.")}$`, "m"), `${id}: its description is not retained`);
    // /local lists the models pi-llm does not install by the descriptions it holds.
    assert.ok(model.packages.every(image => provider.includes(`/Dollyfile-${image} `)) ||
      provider.split("\n").includes(`FILE /usr/share/dolly/llm/${name}`), `${id}: pi-llm does not list it`);
    assert.ok(model.gpu.f16 > 0 && model.gpu.f32 > 0, `${id}: /local shows the GPU memory measured with each shader kind`);
    assert.ok(model.pi.contextWindow >= 16384, `${id}: Pi's prompt and compaction settings need 16,384 tokens of context`);
  }
});
