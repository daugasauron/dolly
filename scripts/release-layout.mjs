export const snapshotPackPath = /^dist\/packs\/[0-9a-f]{64}\.snapshot\.gz$/;

// What a deployment serves at its own path besides pages and snapshot packs;
// every other file is under _dolly/RELEASE/.
export const publicFiles = ["coi-serviceworker.js", ".nojekyll", "robots.txt", "amy-index.txt"];

// A published version's directory and public path: /vX.Y.Z/.
export const versionName = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

// The version a packaged site carries in its src/version.mjs, read as data.
export function releaseVersion(source) {
  const name = `v${/^export const DOLLY_VERSION = "([^"]*)";$/m.exec(source)?.[1]}`;
  if (!versionName.test(name)) throw new Error("the release carries no version");
  return name;
}

export function compareVersions(left, right) {
  const [a, b] = [left, right].map(name => versionName.exec(name).slice(1).map(Number));
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

export function deploymentBase(value) {
  if (!/^\/(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*$/.test(value)) {
    throw new Error("deployment base must be / or a path such as /dolly/v0.1.0/");
  }
  return value;
}

export function renderReleasePage(source, path, digest, files, base = "/") {
  deploymentBase(base);
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error("invalid release ID");
  const directory = path.slice(0, path.lastIndexOf("/") + 1);
  const prefix = `${base}_dolly/${digest}/`;
  const assetBase = prefix + directory;
  return source.replace(/<head>/i, `<head><base href="${assetBase}">`)
    .replace(/(<a\b[^>]*\bhref=")([^"]*)(")/gi, (match, before, href, after) => {
      const target = new URL(href, `http://dolly.invalid${assetBase}`);
      if (target.origin !== "http://dolly.invalid" || !target.pathname.startsWith(prefix)) return match;
      const path = target.pathname.slice(prefix.length);
      const page = files.has(path) ? path.endsWith(".html")
        : files.has(`${path.replace(/\/+$/, "")}/index.html`) || (path === "" && files.has("index.html"));
      // Navigation stays public; source links and resources retain their release.
      return page ? `${before}${base}${path}${target.search}${target.hash}${after}` : match;
    });
}
