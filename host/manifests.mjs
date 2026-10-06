// The one list of trusted host modules. Each host/<name>/module.json names the
// module's files; the registry, build, packaging and tests read only these.
export const hostModuleNames = Object.freeze(["runtime", "display", "input", "http", "gpu", "audio",
  "download", "upload", "snapshot", "threads", "dso", "build", "packages"]);

export const hostManifests = Object.freeze(await Promise.all(hostModuleNames.map(async name => {
  const url = new URL(`./${name}/module.json`, import.meta.url);
  const { default: manifest } = await import(url.href, { with: { type: "json" } });
  if (manifest.name !== name) throw new Error(`host/${name}/module.json names ${manifest.name}`);
  return Object.freeze({ ...manifest, url: url.href });
})));

// A runtime is a module that provides the kernel (README.md); an image
// declares exactly one, by the same line as any module.
export const runtimes = Object.freeze(hostManifests.filter(manifest => manifest.provides === "kernel")
  .map(({ name, version }) => `${name}@${version}`));
