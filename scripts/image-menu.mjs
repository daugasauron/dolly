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
