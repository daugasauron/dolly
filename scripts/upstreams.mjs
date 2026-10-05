import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { escapeHtml } from "./render-dollyfile-view.mjs";
import { CANONICAL_ORIGIN, canonicalPath } from "../src/static-asset.mjs";

// config/upstreams.json names every upstream the catalog builds or bundles.
// "sources" match recipe SOURCE URLs: paths on the canonical origin or full
// URLs, where "*" matches within a path segment and a trailing "/" matches a
// tree. "pins" are config/source-pins.sh keys (DOLLY_GIT_URL and
// DOLLY_GIT_COMMIT are GIT), which also name the seed's and host-built inputs.
// "seed" upstreams are compiled into the runtime every page loads; "prebuilt"
// ones reach recipes as files built outside Dolly, not as source; an "npm" row
// stands for the packages its published node_modules tree ships.
export async function sourcePins(projectDir) {
  const pins = new Map();
  for (const [, key, field, value] of (await readFile(resolve(projectDir, "config/source-pins.sh"), "utf8"))
    .matchAll(/^DOLLY_(\w+?)_(URL|COMMIT|VERSION|IMAGE|SHA256)=['"]?([^'"\n]*)/gm)) {
    pins.set(key, { ...pins.get(key), [field.toLowerCase()]: value });
  }
  return pins;
}

function sourcePattern(entry) {
  const url = /^https?:/.test(entry) ? entry : `${CANONICAL_ORIGIN}/${entry}`;
  const pattern = url.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", "[^/]*");
  return new RegExp(`^${pattern}${url.endsWith("/") ? "" : "$"}`);
}

// The table's rows with the SOURCE URLs of DEFINITIONS that each one matches
// and the images whose own recipe reads them. Every SOURCE needs a row.
export async function upstreamRows(projectDir, definitions) {
  const rows = JSON.parse(await readFile(resolve(projectDir, "config/upstreams.json"), "utf8"))
    .map(row => ({ ...row, patterns: (row.sources ?? []).map(sourcePattern), images: new Set(), locations: new Set() }));
  for (const { image, filename, parsed } of definitions) {
    for (const { location, line } of parsed.sources) {
      const owners = rows.filter(row => row.patterns.some(pattern => pattern.test(location)));
      if (!owners.length) throw new Error(`${filename}:${line}: ${location} has no entry in config/upstreams.json`);
      for (const row of owners) {
        row.images.add(image);
        row.locations.add(location);
      }
    }
  }
  return rows;
}

// The packages a published npm tree ships, from their own package.json.
function* npmPackages(tar) {
  const text = (at, length) => tar.subarray(at, at + length).toString("utf8").replace(/\0.*$/s, "");
  for (let at = 0; at + 512 <= tar.length && tar[at]; ) {
    const size = Number.parseInt(text(at + 124, 12), 8);
    const path = [text(at + 345, 155), text(at, 100)].filter(Boolean).join("/");
    const manifest = /^usr\/lib\/node_modules\/((?:@[^/]+\/)?[^/@]+)\/package\.json$/.exec(path);
    if (manifest) {
      const { name, version, license, repository } = JSON.parse(text(at + 512, size));
      if (name !== manifest[1] || typeof license !== "string") throw new Error(`${path}: no name or licence`);
      const url = (repository?.url ?? repository ?? "").replace(/^git\+/, "").replace(/\.git$/, "");
      yield { name, version, licence: license,
        repository: url.startsWith("https://") ? url : `https://www.npmjs.com/package/${name}` };
    }
    at += 512 + Math.ceil(size / 512) * 512;
  }
}

// One entry per upstream of DEFINITIONS or the runtime: its pinned version,
// the images whose own recipe reads it (images built from those contain it
// too), and what the site serves: its source, those images, or the runtime.
export async function upstreamInventory(projectDir, definitions) {
  const pins = await sourcePins(projectDir);
  const inventory = [];
  for (const row of await upstreamRows(projectDir, definitions)) {
    if (!row.locations.size && !row.seed) continue;
    const locations = [...row.locations];
    const served = [
      ...locations.some(location => canonicalPath(location)) ? [row.prebuilt ? "prebuilt files" : "source"] : [],
      ...row.images.size ? ["images"] : [],
      ...row.seed ? ["runtime"] : [],
    ];
    const entry = { name: row.name, use: row.use, licence: row.licence, repository: row.repository,
      images: [...row.images], served };
    if (row.npm) {
      for (const location of locations) {
        for (const item of npmPackages(await readFile(resolve(projectDir, canonicalPath(location).slice(1))))) {
          inventory.push({ ...entry, ...item });
        }
      }
      continue;
    }
    const pin = pins.get(row.pins?.[0]) ?? {};
    const version = pin.version ?? pin.commit ?? (pin.url && basename(pin.url)) ??
      locations.map(location => /\/([0-9a-f]{40})\//.exec(location)?.[1]).find(Boolean) ?? "";
    inventory.push({ ...entry, version: /^[0-9a-f]{40}$/.test(version) ? version.slice(0, 12) : version });
  }
  return inventory;
}

// The licences page, in the front page's style.
export function renderLicencesPage(menu, inventory) {
  const cell = (value, href) => href ? `<a href="${escapeHtml(href)}">${escapeHtml(value)}</a>` : escapeHtml(value);
  const rows = inventory.map(row => `<tr><th scope="row">${cell(row.name, row.repository)}</th>
  <td>${cell(row.use)}</td><td>${cell(row.licence)}</td><td>${cell(row.version)}</td><td>${row.served.join(", ")}</td>
  <td>${row.images.map(image => cell(image, `../view/${image}/`)).join(", ")}</td></tr>`);
  const main = `<main>
      <p><a href="../">← Dolly</a></p>
      <h1>Licences and sources</h1>
      <p class="lead">Dolly's own code is MIT-licensed, except files marked GPL-2.0-or-later: <a href="https://github.com/daugasauron/dolly">github.com/daugasauron/dolly</a>. These are the upstream projects this site's runtime and images build on. Images keep the licence texts of what they contain, mostly in /usr/share/licenses, and each image's Dollyfile view links the exact source archives this site serves. <a href="../docs/licences.md">The licence audit</a> records what that implies.</p>
      <p>Served: the pinned source (or prebuilt files) recipes download from this site, the images built from it, or the runtime every page loads. Built by: the images whose own recipe reads it; images built from those contain it too.</p>
      <div class="routes"><table class="inventory">
        <thead><tr><th scope="col">Project</th><th scope="col">Used for</th><th scope="col">Licence</th><th scope="col">Version</th><th scope="col">Served</th><th scope="col">Built by</th></tr></thead>
        <tbody>
${rows.join("\n")}
        </tbody>
      </table></div>
    </main>`;
  return menu.replace(/<title>[^<]*<\/title>/, "<title>Licences and sources · Dolly</title>")
    .replace("</style>", ".inventory { table-layout: auto; } .inventory th, .inventory td { white-space: normal; vertical-align: top; }\n    </style>")
    .replace(/<main>[\s\S]*<\/main>/, () => main).replaceAll('"./', '"../');
}
