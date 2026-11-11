// The site's routes, on boot()'s run (browser.mjs): an image rebuilt from its
// recipe (mode "rebuild"), the custom images the site builds ("custom"), and a
// saved session (`loadSession`), which snapshot@0 selects. Building happens
// here and in the site's runtime Worker (build-worker.mjs), never in a page
// that only runs images: their code is imported by the routes that build or
// run a custom image.
import { buildHost } from "../host/modules.mjs";
import { hostManifests } from "../host/manifests.mjs";
import { run } from "./browser.mjs";
import { imageDefinition, loadImages } from "./images.mjs";

// The modules a route's page has (the registry loads those alone): an image of
// the directory run from its packs has its own and what they depend on; a route
// that builds, one that learns its image later (a custom image, a saved
// session) and an image that enables modules itself (nena@0) have every module
// this repository builds. A test may name fewer (named).
async function pageModules({ image, mode, loadSession, images, named }) {
  await loadImages(images);
  const declared = imageDefinition(image)?.hostRequirements;
  const own = mode === "snapshot" && !loadSession && declared && !declared.includes("nena@0") ? new Set(declared) : null;
  for (const value of own ?? []) {
    for (const dependency of hostManifests.find(({ name, version }) => `${name}@${version}` === value)?.dependencies ?? []) own.add(dependency);
  }
  return hostManifests.filter(({ name, version }) => (!own || own.has(`${name}@${version}`)) && (!named || named.includes(`${name}@${version}`)))
    .map(({ url }) => url);
}

export async function bootRoute(mount, { image: route, mode = "snapshot", loadSession = false, named, ...options }) {
  // A directory that does not load names every module; run() then says why it failed.
  const modules = await pageModules({ image: route, mode, loadSession, images: options.images, named })
    .catch(() => hostManifests.map(({ url }) => url));
  return run(mount, { ...options, modules }, async registry => {
    if (!["snapshot", "rebuild"].includes(mode) || typeof loadSession !== "boolean") {
      throw new Error("invalid Dolly boot options");
    }
    // A module may select what boots: a saved session names its image, its
    // module and the custom image record it was saved from.
    const selected = await registry.selectBoot({ image: route, mode, loadSession });
    const image = selected?.image ?? route;
    if (!(imageDefinition(image) || image === "custom")) {
      throw new Error("invalid Dolly boot options");
    }
    // The custom image this tab runs: its Dollyfile and, in snapshot mode, the
    // completed artifact and what the tab inherits from the page that built it.
    const customImages = image === "custom" ? await import("./custom-image.mjs") : undefined;
    const custom = image === "custom" ? selected?.custom ?? customImages.storedCustomImage() : undefined;
    if (image === "custom" && !custom) {
      throw new Error("No uploaded Dollyfile is available in this tab. Return to the Dolly menu.");
    }
    const source = custom?.source;
    const rebuild = mode === "rebuild";
    const recipe = source === undefined ? imageDefinition(image) : (await import("./dollyfile-view.mjs")).inspectDollyfile(source);
    const runnable = recipe.entry !== null;
    if (!runnable && !rebuild) throw new Error(`${image} has no ENTRY; it only builds`);
    // An image declares its modules itself; nothing is inherited from what it is built from.
    const required = [...recipe.hostRequirements, ...selected ? [selected.module] : []];
    // The completed custom image this tab restores, or the identity of the one it rebuilt.
    let customArtifact, rebuilt = null;
    return {
      image,
      label: selected?.label ?? (rebuild ? "REBUILD FROM SOURCE" : "PRECOMPILED SYSTEM"),
      // An image without ENTRY is built with the build host alone and never runs.
      required: runnable ? required : [],
      enabled: runnable ? [...required, ...rebuild ? buildHost : []] : registry.buildHostFor(required),
      configuration: selected?.configuration,
      inherited: rebuild ? undefined : custom,
      worker: rebuild || image === "custom" ? new URL("./build-worker.mjs", import.meta.url) : undefined,
      async start(host, report) {
        // The site's builds have every module it builds, whatever the page enables.
        const site = hostManifests.map(({ url }) => url);
        // Only a rebuild builds: an image without ENTRY never runs (above).
        const [{ buildImage }, { prepareImageArtifacts }] = rebuild
          ? await Promise.all([import("./image-builder.mjs"), import("./image-build.mjs")]) : [{}, {}];
        const build = (name, inputs) => buildImage(name, inputs, host.builder, report, { modules: site });
        const artifacts = rebuild ? await prepareImageArtifacts(image, source, build, text => report(`${text}\n`)) : [];
        if (!runnable) {
          // An image without ENTRY has no program to run: keep the complete log and report the result.
          const built = await buildImage(image, artifacts, host.builder, report, { modules: site, customSource: source });
          report(`\nBUILT ${source === undefined ? image : recipe.image} · ${(built.byteLength / 1024 / 1024).toFixed(1)} MiB · sha256 ${built.sha256}\n`);
          return null;
        }
        // A saved session is the whole filesystem: its custom image is not loaded.
        if (image === "custom" && !rebuild && !selected) customArtifact = await customImages.loadCustomImage(source, custom.artifact);
        return {
          message: { mode, artifacts, ...source === undefined ? {} : { customSource: source },
            ...customArtifact === undefined ? {} : { customArtifact } },
          transfers: [],
        };
      },
      message(message) {
        if (message.type === "image-built") rebuilt = message.artifact;
      },
      // A save of a custom image carries its recipe and what the tab inherited.
      async running(host) {
        const page = { get builtImage() { return rebuilt; } };
        if (image !== "custom") return { page };
        const { buildId, recipeSha256, sha256: digest, byteLength, inputs } = customArtifact ?? rebuilt ?? custom.artifact;
        return { page, context: { custom: { source, artifact: { buildId, recipeSha256, sha256: digest, byteLength, inputs }, ...host.inherited } } };
      },
    };
  });
}
