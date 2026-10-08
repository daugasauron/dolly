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
