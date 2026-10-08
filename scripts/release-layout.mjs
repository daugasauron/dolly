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

// The robots.txt at a host's root, for the versions it serves: the newest
// version's llms.txt as comments, without its Markdown marks and with its
// links as that version's paths, then one rule per version for its bulk
// (dist/: packs, sources, the runtime). A rule is an exact prefix, which
// every crawler reads and which matches no page.
export function robotsText(about, names) {
  const base = `https://site.invalid/${[...names].sort(compareVersions).at(-1)}/`;
  const comments = about.trimEnd().split("\n").map(line => `# ${line.replace(/^(#+|>) ?/, "")
    .replace(/\[([^\]]+)\]\((\S+)\)/g, (_, label, target) => {
      const url = new URL(target, base);
      return `${label} ${url.origin === "https://site.invalid" ? url.pathname + url.hash : url.href}`;
    })}`.trimEnd());
  return [...comments, "", "User-agent: *", ...names.map(name => `Disallow: /${name}/dist/`), ""].join("\n");
}
