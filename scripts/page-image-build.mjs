// Runs in a page of the app at BASE (pass its source to page.evaluate): builds
// IMAGE, or "custom" from CUSTOM, after its missing dependencies, with the
// app's own image builder and HTTP broker. Logs through the exposed
// dollyBuildLog(text), keeps the snapshot in globalThis.dollySnapshot and
// returns { inputs, dependenciesBuilt }.
export async function buildImageInPage(base, image, custom) {
  const log = text => void globalThis.dollyBuildLog(text);
  const [registry, policy, transport, builder, graph] = await Promise.all([
    "dist/dolly-images.mjs", "host/http/policy.mjs", "host/http/local-services.mjs",
    "src/image-builder.mjs", "src/image-build.mjs",
  ].map(path => import(new URL(path, base).href)));
  const sources = [
    ...registry.DOLLY_IMAGES.map(definition => ({ path: `/${definition.dollyfile}`, byteLength: definition.byteLength })),
    ...registry.DOLLY_STATIC_SOURCES,
  ];
  const network = transport.localServicesTransport(policy.consumeDollyHttpPolicy(globalThis, sources, new URL(base)));
  const build = (name, artifacts) => builder.buildImage(name, artifacts, { http: { network } }, log,
    { customSource: name === "custom" ? custom : undefined });
  let dependenciesBuilt = 0;
  const dependencies = await graph.prepareImageArtifacts(image, custom, (name, artifacts) => {
    dependenciesBuilt++;
    return build(name, artifacts);
  }, text => log(`${text}\n`));
  const { bytes, inputs } = await build(image, dependencies);
  globalThis.dollySnapshot = new Uint8Array(bytes);
  return { inputs, dependenciesBuilt };
}
