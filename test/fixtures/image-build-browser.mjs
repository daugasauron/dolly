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
  // Shown, the log follows its end a frame later until its reader scrolls up,
  // and a flood of lines costs no layout each (Chrome took 246 s for these).
  const shown = Object.assign(document.createElement("pre"),
    { style: "position:fixed;top:0;left:0;width:200px;height:100px;overflow:auto;margin:0" });
  document.body.append(shown);
  const followed = buildLog(shown), frame = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve)));
  const started = performance.now();
  for (let line = 0; line < 20000; line++) followed.append(`line ${line} ${"x".repeat(90)}\n`);
  if (performance.now() - started > 2000) throw new Error("Appending build output took over two seconds");
  await frame();
  if (shown.scrollHeight - shown.scrollTop - shown.clientHeight >= 24) throw new Error("The build log did not follow its end");
  shown.scrollTop = 0;
  await frame();
  followed.append("more\n");
  await frame();
  if (shown.scrollTop !== 0) throw new Error("The build log moved a reader who scrolled up");
  shown.remove();
  return true;
}

// Three builds from the same inputs, one of them failing: the inputs stay
// intact and the built image is the same each time; its Blob holds what its
// identity says.
export async function buildInputReuse() {
  const base = new URL("../", document.baseURI);
  const [registry, policy, transport, builder, graph, artifactStore, { siteReference }, { hostModuleUrls: modules }] = await Promise.all([
    "src/images.mjs", "host/http/policy.mjs", "host/http/local-services.mjs",
    "src/image-builder.mjs", "src/image-build.mjs", "src/image-artifact.mjs", "src/static-asset.mjs", "host/manifests.mjs",
  ].map(path => import(new URL(path, base).href)));
  await registry.loadImages(base);
  const definition = registry.DOLLY_IMAGES.find(image => image.image === "system-build");
  const source = `DOLLY 7\nAPPLICATION buffer-proof\nREQUIRES HOST runtime@0\nREQUIRES HOST display@0\nREQUIRES HOST input@0\nREQUIRES HOST download@0\nREQUIRES HOST http@0\nREQUIRES HOST snapshot@0\nREQUIRES HOST upload@0\nFROM ${siteReference(definition.dollyfile)} ${definition.sha256}\nENTRY /bin/slop\n`;
  const network = { ...transport.localServicesTransport(new policy.DollyHttpPolicy(undefined, registry.bootstrapSources(), base)),
    site: base.href };
  const build = (image, inputs, customSource) => builder.buildImage(image, inputs, { http: { network } }, () => {}, { modules, customSource });
  const inputs = await graph.prepareImageArtifacts("custom", source, build, () => {});
  const digestOf = async artifact => (await artifactStore.describeImageArtifact(artifact.bytes, artifact.recipeSha256)).sha256;
  let digest;
  for (const text of [source, source.replace("ENTRY", "SLOP false\nENTRY"), source]) {
    let result, failure;
    try { result = await build("custom", inputs, text); }
    catch (error) { failure = error.message; }
    for (const input of inputs) {
      if (input.bytes.size !== input.byteLength || await digestOf(input) !== input.sha256) {
        throw new Error("A build changed its inputs");
      }
    }
    if (text !== source) {
      if (!failure?.includes("bootstrap failed")) throw new Error("Invalid recipe did not fail its build");
    } else {
      if (failure) throw new Error(failure);
      if (result.bytes.size !== result.byteLength || await digestOf(result) !== result.sha256) {
        throw new Error("The built image's bytes do not match its identity");
      }
      if (digest && result.sha256 !== digest) throw new Error("Reusing build inputs changed output");
      digest = result.sha256;
    }
  }
  return digest;
}
