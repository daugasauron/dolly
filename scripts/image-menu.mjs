import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { alphabetical } from "../src/alphabetical.mjs";

// An image is described by one "- `IMAGE`: description" item of the README
// beside its recipe: README.md for the core's, demos/DEMO/README.md for a
// demo's. An item may continue on indented lines, as Markdown wraps it. The
// description is what the menu shows and what amy list prints for a package.
export async function imageDescriptions(projectDir, definitions) {
  const descriptions = new Map(), readmes = new Map();
  for (const { image, filename } of definitions) {
    const readme = join(dirname(filename), "README.md");
    if (!readmes.has(readme)) {
      readmes.set(readme, await readFile(resolve(projectDir, readme), "utf8").catch(error => {
        if (error.code === "ENOENT") return "";
        throw error;
      }));
    }
    const items = [...readmes.get(readme).matchAll(/^- `([^`\n]+)`: (.+(?:\n  +\S.*)*)$/gm)].filter(([, name]) => name === image);
    if (items.length > 1) throw new Error(`${readme}: ${image} is described ${items.length} times`);
    if (!items.length) throw new Error(`${filename}: describe it as "- \`${image}\`: …" in ${readme}`);
    descriptions.set(image, items[0][2].replace(/\n +/g, " "));
  }
  return descriptions;
}

// An image's row; parsed is its recipe. An image without ENTRY or display
// cannot be opened, only rebuilt.
export function menuRow({ image, description, parsed }) {
  const interactive = parsed.entry && parsed.hostRequirements.includes("display@0");
  const name = interactive ? `<a href="./${image}/">${image}</a>` : image;
  const open = interactive ? `<a href="./${image}/">open →</a>`
    : `<span class="unavailable" title="${parsed.role === "package" ? `A package: amy install ${image} adds it to a running image`
      : "This image only builds; rebuild it instead"}">open →</span>`;
  return `<tr class="image" data-image="${image}"><th scope="row">${name}</th>
  <td class="description">${description}</td><td><div class="image-links">${open}<a href="./${image}/rebuild/">rebuild</a><a href="./view/${image}/">Dollyfile</a></div></td></tr>`;
}

// A group of the menu: its heading, then its images by name.
export const menuGroup = (heading, images) => [`<tr class="group"><th colspan="3">${heading}</th></tr>`,
  ...[...images].sort((left, right) => alphabetical(left.image, right.image)).map(menuRow)].join("\n");

// The menu's table body: the groups by heading.
const heading = group => /^<tr class="group"><th colspan="3">([^<]*)</.exec(group)[1];
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
