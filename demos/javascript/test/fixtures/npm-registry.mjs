// Made-up packages served as registry.npmjs.org serves its own: abbreviated
// metadata, and gzipped tarballs whose integrity the metadata states. Their
// tarballs have the shapes npm's have: node-tar's checksum field, a top
// directory not named package, a pax path, "./" inside a path.
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

export const registry = "https://registry.npmjs.org";

function member(name, data, type) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100);
  for (const [offset, field] of [[100, "000644 \0"], [108, "000000 \0"], [116, "000000 \0"],
    [124, `${data.length.toString(8).padStart(11, "0")} `], [136, "00000000000 "]]) header.write(field, offset);
  header.fill(32, 148, 156);
  header.write(type, 156);
  header.write("ustar\u000000", 257);
  header.write(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, "0")} \0`, 148);
  return Buffer.concat([header, data, Buffer.alloc((512 - data.length % 512) % 512)]);
}
// A pax record counts its own digits.
function paxPath(path) {
  const body = ` path=${path}\n`;
  let length = body.length + 1;
  while (String(length).length + body.length !== length) length++;
  return Buffer.from(`${length}${body}`);
}
// files: path -> text; a path ending in / is a directory entry, one starting with pax: is named by a pax header.
function tarball(top, files) {
  const members = Object.entries(files).flatMap(([path, text]) => {
    if (path.endsWith("/")) return [member(`${top}/${path}`, Buffer.alloc(0), "5")];
    const data = Buffer.from(text);
    if (!path.startsWith("pax:")) return [member(`${top}/${path}`, data, "0")];
    return [member("PaxHeader/entry", paxPath(`${top}/${path.slice(4)}`), "x"), member("placeholder", data, "0")];
  });
  return gzipSync(Buffer.concat([...members, Buffer.alloc(1024)]));
}

const shared = version => ({ manifest: { name: "@dolly/shared", version },
  files: { "index.js": 'module.exports = "shared " + require("./package.json").version;\n' } });
// name -> versions, each its package.json and its files; latest is the highest unless tags say.
const packages = {
  "dolly-hello": { tags: { latest: "1.1.0" }, versions: [
    { manifest: { name: "dolly-hello", version: "1.0.0", bin: "bin/hello.js" },
      files: { "bin/hello.js": 'console.log("hello 1.0.0");\n' } },
    { manifest: { name: "dolly-hello", version: "1.1.0", bin: { "dolly-hello": "bin/hello.js" },
      dependencies: { "dolly-left": "^1.0.0", "@dolly/shared": "^2.0.0" },
      optionalDependencies: { "dolly-darwin": "1.0.0", "dolly-addon": "^1" },
      scripts: { postinstall: "echo ran > /tmp/janis-install-postinstall" } },
    files: { "bin/hello.js": 'console.log(`hello ${require("../package.json").version} ${require("dolly-left")} ${require("@dolly/shared")}`);\n' } },
    { manifest: { name: "dolly-hello", version: "2.0.0-beta.1", bin: "bin/hello.js" }, files: { "bin/hello.js": 'console.log("hello beta");\n' } },
  ] },
  "dolly-left": { top: "dolly-left", versions: [{ manifest: { name: "dolly-left", version: "1.0.0", dependencies: { "@dolly/shared": "~1.0.0" } },
    files: { "lib/": "", "pax:lib/index.js": 'module.exports = "left " + require("@dolly/shared");\n', "./main.js": 'module.exports = require("./lib/index.js");\n' },
    main: "main.js" }] },
  "@dolly/shared": { versions: [shared("1.0.0"), shared("1.0.1-rc.1"), shared("2.0.0")] },
  "dolly-darwin": { versions: [{ manifest: { name: "dolly-darwin", version: "1.0.0", os: ["darwin"] }, files: {} }] },
  "dolly-addon": { versions: [{ manifest: { name: "dolly-addon", version: "1.0.0", scripts: { install: "node-gyp rebuild" } },
    files: { "binding.gyp": "{}\n" } }] },
  "dolly-mac": { versions: [{ manifest: { name: "dolly-mac", version: "1.0.0", cpu: ["arm64"], os: ["darwin"] }, files: {} }] },
  "dolly-tampered": { tampered: true, versions: [{ manifest: { name: "dolly-tampered", version: "1.0.0" }, files: { "index.js": "\n" } }] },
  // Its bin would replace the janis command.
  "dolly-clash": { versions: [{ manifest: { name: "dolly-clash", version: "1.0.0", bin: { janis: "index.js" } }, files: { "index.js": "\n" } }] },
  // Served only as a tarball: a recipe pins it with --integrity.
  "dolly-pinned": { unlisted: true, versions: [{ manifest: { name: "dolly-pinned", version: "1.0.0", bin: { "dolly-pinned": "cli.mjs" } },
    files: { "cli.mjs": 'export const pinned = "pinned";\nconsole.log(`${pinned} ${process.argv.slice(2).join(" ")}`);\n' } }] },
};

const integrityOf = bytes => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
// url path -> tarball bytes; name -> abbreviated metadata.
const tarballs = new Map(), metadata = new Map();
export const integrities = {};
for (const [name, { tags = {}, versions, top = "package", tampered, unlisted }] of Object.entries(packages)) {
  const document = { name, "dist-tags": { latest: versions.filter(({ manifest }) => !manifest.version.includes("-")).at(-1).manifest.version, ...tags },
    versions: {}, modified: "2026-10-23T00:00:00.000Z" };
  for (const { manifest, files, main } of versions) {
    const bytes = tarball(top, { "package.json": JSON.stringify({ ...manifest, ...main ? { main } : {} }, null, 2), ...files });
    const path = `/${name}/-/${name.split("/").at(-1)}-${manifest.version}.tgz`;
    tarballs.set(path, tampered ? Buffer.concat([bytes, Buffer.from("tampered")]) : bytes);
    integrities[`${name}@${manifest.version}`] = integrityOf(bytes);
    const { scripts, ...listed } = manifest;
    document.versions[manifest.version] = { ...listed, ...scripts ? { hasInstallScript: true } : {},
      dist: { integrity: integrityOf(bytes), tarball: `${registry}${path}` } };
  }
  if (!unlisted) metadata.set(`/${name}`, document);
}

// The registry's answers under prefix; every request it saw, with its Accept header.
export function npmRegistry(prefix) {
  const requests = [];
  async function handle(request, response, path, headers) {
    if (!path.startsWith(`${prefix}/`)) return false;
    const target = path.slice(prefix.length);
    requests.push({ path: target, accept: request.headers.accept });
    if (metadata.has(target)) {
      response.writeHead(200, { ...headers, "content-type": "application/vnd.npm.install-v1+json" }).end(JSON.stringify(metadata.get(target)));
    } else if (tarballs.has(target)) {
      response.writeHead(200, { ...headers, "content-type": "application/octet-stream" }).end(tarballs.get(target));
    } else {
      response.writeHead(404, { ...headers, "content-type": "application/json" }).end('{"error":"Not found"}');
    }
    return true;
  }
  return { handle, requests };
}
