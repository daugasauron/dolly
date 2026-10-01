// The one list of trusted host modules. Each host/<name>/module.json names the
// module's files; the registry, build, packaging and tests read only these.
export const hostModuleNames = Object.freeze(["runtime", "display", "http", "gpu", "audio",
  "download", "upload", "snapshot", "threads", "build", "packages"]);

export const hostManifests = Object.freeze(await Promise.all(hostModuleNames.map(async name => {
  const url = new URL(`./${name}/module.json`, import.meta.url);
  const { default: manifest } = await import(url.href, { with: { type: "json" } });
  if (manifest.name !== name) throw new Error(`host/${name}/module.json names ${manifest.name}`);
  return Object.freeze({ ...manifest, url: url.href });
})));
