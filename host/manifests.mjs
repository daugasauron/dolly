// The host modules this repository builds. Each host/<name>/module.json names the
// module's files; the build, packaging and tests read only these, and the site's
// pages give the registry (modules.mjs) all of them.
const hostModuleNames = Object.freeze(["runtime", "display", "input", "touch", "http", "gpu", "audio", "microphone",
  "download", "upload", "snapshot", "threads", "dso", "sockets", "pty", "build", "packages", "nena"]);

export const hostModuleUrls = Object.freeze(hostModuleNames.map(name => new URL(`./${name}/module.json`, import.meta.url).href));

export const hostManifests = Object.freeze(await Promise.all(hostModuleUrls.map(async (url, index) => {
  const { default: manifest } = await import(url, { with: { type: "json" } });
  if (manifest.name !== hostModuleNames[index]) throw new Error(`host/${hostModuleNames[index]}/module.json names ${manifest.name}`);
  return Object.freeze({ ...manifest, url });
})));

// A runtime is a module that provides the kernel (README.md); an image
// declares exactly one, by the same line as any module.
export const runtimes = Object.freeze(hostManifests.filter(manifest => manifest.provides === "kernel")
  .map(({ name, version }) => `${name}@${version}`));
