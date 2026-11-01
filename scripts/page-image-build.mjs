// Runs in a page of the site at BASE (pass its source to page.evaluate): builds
// IMAGE, or "custom" from CUSTOM, after its missing dependencies, with the
// app's own image builder and HTTP broker. Logs through the exposed
// dollyBuildLog(text), keeps the snapshot in globalThis.dollySnapshot and
// returns { inputs, dependenciesBuilt }.
export async function buildImageInPage(base, image, custom) {
  const log = text => void globalThis.dollyBuildLog(text);
  const [registry, policy, transport, builder, graph] = await Promise.all([
    "src/images.mjs", "host/http/policy.mjs", "host/http/local-services.mjs",
    "src/image-builder.mjs", "src/image-build.mjs",
  ].map(path => import(new URL(path, base).href)));
  await registry.loadImages(base);
  const network = { ...transport.localServicesTransport(new policy.DollyHttpPolicy(globalThis.DOLLY_HTTP_POLICY,
    registry.bootstrapSources(), new URL(base))), site: base };
  const build = (name, artifacts, consume) => builder.buildImage(name, artifacts, { http: { network } }, log,
    { customSource: name === "custom" ? custom : undefined, consume });
  let dependenciesBuilt = 0;
  const dependencies = await graph.prepareImageArtifacts(image, custom, (name, artifacts) => {
    dependenciesBuilt++;
    return build(name, artifacts);
  }, text => log(`${text}\n`));
  const { bytes, inputs } = await build(image, dependencies, true);
  globalThis.dollySnapshot = new Uint8Array(bytes);
  return { inputs, dependenciesBuilt };
}
