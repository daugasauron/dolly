export async function buildLogProof() {
  const {buildLog} = await import(new URL("../src/build-log.mjs", document.baseURI));
  const element = document.createElement("pre"), log = buildLog(element);
  log.append("\x1b[1;3");
  log.append("2mbuilding 日本語\x1b[0m\r");
  log.append("\n\x1b[38:2:1:2:3mdone");
  log.append("\x1b[m <script>text</script>");
  if (element.textContent !== "building 日本語\ndone <script>text</script>" || element.children.length) {
    throw new Error("Split compiler output lost text or created HTML");
  }
  log.append("x".repeat(1024 * 1024));
  log.append("tail");
  if (element.textContent.length !== 1024 * 1024 || !element.textContent.endsWith("tail")) {
    throw new Error("Build output exceeded its bound or lost the tail");
  }
  log.clear(); log.append("retry");
  if (element.textContent !== "retry") throw new Error("Build retry retained old output");
  return true;
}

export async function buildBufferReuse() {
  const base = new URL("../", document.baseURI);
  const [registry, policy, transport, builder, graph, artifactStore] = await Promise.all([
    "dist/dolly-images.mjs", "host/http/policy.mjs", "host/http/local-services.mjs",
    "src/image-builder.mjs", "src/image-build.mjs", "src/image-artifact.mjs",
  ].map(path => import(new URL(path, base).href)));
  const definition = registry.DOLLY_IMAGES.find(image => image.image === "system-build");
  const source = `DOLLY 6\nAPPLICATION buffer-proof\nREQUIRES HOST runtime@0\nREQUIRES HOST display@0\nREQUIRES HOST download@0\nREQUIRES HOST http@0\nREQUIRES HOST snapshot@0\nREQUIRES HOST upload@0\nFROM https://daugasauron.com/${definition.dollyfile} ${definition.sha256}\nENTRY /bin/slop\n`;
  const sources = [...registry.DOLLY_IMAGES.map(image => ({ path: `/${image.dollyfile}`, byteLength: image.byteLength })),
    ...registry.DOLLY_STATIC_SOURCES];
  const network = transport.localServicesTransport(policy.consumeDollyHttpPolicy({}, sources, base));
  const build = (image, inputs, customSource) => builder.buildImage(image, inputs, { http: { network } }, () => {}, { customSource });
  const inputs = await graph.prepareImageArtifacts("custom", source, build, () => {});
  let digest;
  for (const text of [source, source.replace("ENTRY", "SLOP false\nENTRY"), source]) {
    let result, failure;
    try { result = await build("custom", inputs, text); }
    catch (error) { failure = error.message; }
    for (const input of inputs) {
      if (input.bytes.byteLength !== input.byteLength || await artifactStore.sha256(input.bytes) !== input.sha256) {
        throw new Error("Build did not return its input buffers intact");
      }
    }
    if (text !== source) {
      if (!failure?.includes("bootstrap failed")) throw new Error("Invalid recipe did not fail its build");
    } else {
      if (failure) throw new Error(failure);
      const actual = await artifactStore.sha256(result.bytes);
      if (digest && actual !== digest) throw new Error("Reusing build buffers changed output");
      digest = actual;
    }
  }
  return digest;
}
