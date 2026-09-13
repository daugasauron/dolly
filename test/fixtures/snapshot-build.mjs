export async function buildSnapshot(applicationBase, image, customSource) {
  const log = document.querySelector("#bootstrap-log");
  document.documentElement.dataset.dollyStatus = "building";
  const report = text => { log.textContent = (log.textContent + text).slice(-8192); };
  try {
    const [registry, policy, transport, builder, graph] = await Promise.all([
      "dist/dolly-images.mjs", "src/http-policy.mjs", "src/local-services.mjs",
      "src/image-builder.mjs", "src/image-build.mjs",
    ].map(path => import(new URL(path, applicationBase).href)));
    const sources = [
      ...registry.DOLLY_IMAGES.map(definition => ({
        path: `/${definition.dollyfile}`, byteLength: definition.byteLength,
      })),
      ...registry.DOLLY_STATIC_SOURCES,
    ];
    const network = transport.localServicesTransport(
      policy.consumeDollyHttpPolicy(globalThis, sources, new URL(applicationBase)));
    const build = (name, artifacts) => builder.buildImage(name, artifacts, network, report,
      { customSource: name === "custom" ? customSource : undefined });
    const artifacts = await graph.prepareImageArtifacts(image, customSource, build,
      text => report(`${text}\n`));
    const result = await build(image, artifacts);
    globalThis.__dolly = { systemSnapshot: result.bytes, systemInputs: result.inputs };
    document.documentElement.dataset.snapshotBytes = String(result.bytes.byteLength);
    document.documentElement.dataset.dollyStatus = "ready";
  } catch (error) {
    report(`\n${error.stack ?? error}\n`);
    document.documentElement.dataset.dollyStatus = "failed";
  }
}
