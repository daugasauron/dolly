import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { alphabetical } from "../src/alphabetical.mjs";

// Menu descriptions are the "- `IMAGE`: description" items of README.md
// (core images) and demos/DEMO/README.md (that demo's images). An item may
// continue on indented lines, as Markdown wraps it.
export async function imageDescriptions(projectDir) {
  const readmes = ["README.md", ...(await readdir(resolve(projectDir, "demos"), { withFileTypes: true }))
    .filter(entry => entry.isDirectory()).map(entry => `demos/${entry.name}/README.md`)];
  const descriptions = new Map();
  for (const readme of readmes) {
    const text = await readFile(resolve(projectDir, readme), "utf8").catch(error => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    for (const [, image, description] of text.matchAll(/^- `([a-z][a-z0-9]*(?:-[a-z0-9]+|\.[0-9]+)*)`: (.+(?:\n  +\S.*)*)$/gm)) {
      descriptions.set(image, description.replace(/\n +/g, " "));
    }
  }
  return descriptions;
}

// What an image draws and computes with, by the host modules its recipe
// declares: a program reaches a GPU only through gpu@0, so an image without
// it does everything on the CPU. An image that cannot be opened and declares
// no gpu@0 says nothing.
export function graphics({ entry, hostRequirements }) {
  if (hostRequirements.includes("gpu@0")) return "gpu";
  return entry && hostRequirements.includes("display@0") ? "cpu" : "";
}
const graphicsLabels = {
  gpu: '<abbr title="Needs WebGPU (gpu@0). Its page names the adapter it gets: a GPU, or a software adapter on the CPU.">GPU</abbr>',
  cpu: '<abbr title="No GPU module (gpu@0): everything it draws and computes is done on the CPU.">CPU</abbr>',
  "": "",
};

// An image's row; parsed is its recipe. An image without ENTRY or display
// cannot be opened, only rebuilt.
export function menuRow({ image, description, parsed }) {
  const interactive = parsed.entry && parsed.hostRequirements.includes("display@0"), uses = graphics(parsed);
  const name = interactive ? `<a href="./${image}/">${image}</a>` : image;
  const open = interactive ? `<a href="./${image}/">open →</a>`
    : '<span class="unavailable" title="This image only builds; rebuild it instead">open →</span>';
  return `<tr class="image" data-image="${image}" data-graphics="${uses}"><th scope="row">${name}</th>
  <td>${graphicsLabels[uses]}</td><td class="description">${description}</td><td><div class="image-links">${open}<a href="./${image}/rebuild/">rebuild</a><a href="./view/${image}/">Dollyfile</a></div></td></tr>`;
}

// A group of the menu: its heading, then its images by name.
export const menuGroup = (heading, images) => [`<tr class="group"><th colspan="4">${heading}</th></tr>`,
  ...[...images].sort((left, right) => alphabetical(left.image, right.image)).map(menuRow)].join("\n");

// The menu's table body: the groups by heading.
const heading = group => /^<tr class="group"><th colspan="4">([^<]*)</.exec(group)[1];
export const menuBody = groups => [...groups].sort((left, right) => alphabetical(heading(left), heading(right))).join("\n");
// The groups of a table body menuBody wrote.
export const menuGroups = body => body.split(/\n(?=<tr class="group">)/).filter(group => group.trim());

// The pages scripts/generate-routes.mjs writes from terminal.html, at their
// served paths. Each image is { image, openable }.
export function pageRoutes(images, primaryImage) {
  return [
    ...images.flatMap(({ image, openable }) => [
      ...(openable ? [{ path: `${image}/index.html`, image, mode: "snapshot" }] : []),
      { path: `${image}/rebuild/index.html`, image, mode: "rebuild" },
    ]),
    { path: "custom/rebuild/index.html", image: "custom", mode: "rebuild" },
    { path: "custom/run/index.html", image: "custom", mode: "snapshot" },
    { path: "rebuild/index.html", image: primaryImage, mode: "rebuild" },
    // One page opens every saved session: /session/?name=NAME.
    { path: "session/index.html", image: primaryImage, mode: "snapshot", loadSession: true },
  ];
}
