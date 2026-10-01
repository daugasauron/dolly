import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Menu descriptions are the "- `IMAGE`: description" lines of README.md
// (core images) and demos/DEMO/README.md (that demo's images).
export async function imageDescriptions(projectDir) {
  const readmes = ["README.md", ...(await readdir(resolve(projectDir, "demos"), { withFileTypes: true }))
    .filter(entry => entry.isDirectory()).map(entry => `demos/${entry.name}/README.md`)];
  const descriptions = new Map();
  for (const readme of readmes) {
    const text = await readFile(resolve(projectDir, readme), "utf8").catch(error => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    for (const [, image, description] of text.matchAll(/^- `([a-z][a-z0-9]*(?:-[a-z0-9]+|\.[0-9]+)*)`: (.+)$/gm)) {
      descriptions.set(image, description);
    }
  }
  return descriptions;
}

// An image without ENTRY or display cannot be opened, only rebuilt.
export function menuRow(image, description, interactive) {
  const name = interactive ? `<a href="./${image}/">${image}</a>` : image;
  const open = interactive ? `<a href="./${image}/">open →</a>`
    : '<span class="unavailable" title="This image only builds; rebuild it instead">open →</span>';
  return `<tr class="image" data-image="${image}"><th scope="row">${name}</th>
  <td class="description">${description}</td><td><div class="image-links">${open}<a href="./${image}/rebuild/">rebuild</a><a href="./view/${image}/">Dollyfile</a></div></td></tr>`;
}
