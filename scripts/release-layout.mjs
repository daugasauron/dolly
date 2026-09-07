export const snapshotPackPath = /^dist\/packs\/[0-9a-f]{64}\.snapshot\.gz$/;

export function deploymentBase(value) {
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(value)) {
    throw new Error("deployment base must be / or a path such as /dolly/");
  }
  return value;
}

export function renderReleasePage(source, path, digest, files, base = "/") {
  deploymentBase(base);
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error("invalid release ID");
  const directory = path === "session/open.html" ? "" : path.slice(0, path.lastIndexOf("/") + 1);
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
