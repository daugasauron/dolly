import { open, rm } from "node:fs/promises";
import { MAX_SNAPSHOT_BYTES } from "../src/snapshot-records.mjs";

// Runs in a page (pass its source to page.evaluate): builds IMAGE of the image
// directory at IMAGES, or "custom" from CUSTOM, after its missing dependencies,
// with the builder and HTTP broker of the runtime at RUNTIME; on Dolly's site
// both are the site. Logs through the exposed dollyBuildLog(text), keeps the
// snapshot in globalThis.dollySnapshot and returns { inputs, dependenciesBuilt }.
export async function buildImageInPage(runtime, images, image, custom) {
  const log = text => void globalThis.dollyBuildLog(text);
  const [registry, policy, transport, builder, graph] = await Promise.all([
    "src/images.mjs", "host/http/policy.mjs", "host/http/local-services.mjs",
    "src/image-builder.mjs", "src/image-build.mjs",
  ].map(path => import(new URL(path, runtime).href)));
  await registry.loadImages(images);
  const network = { ...transport.localServicesTransport(new policy.DollyHttpPolicy(globalThis.DOLLY_HTTP_POLICY,
    registry.bootstrapSources(), new URL(images))), site: images };
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

// Copies the snapshot buildImageInPage left in PAGE to the new file OUTPUT, in
// pieces. Not by the page's fetch: Playwright keeps the body of every request a
// page sends, so an upload held the whole snapshot a second time.
export async function savePageSnapshot(page, output) {
  const length = await page.evaluate(() => globalThis.dollySnapshot.length), piece = 16 * 1024 * 1024;
  if (length <= 0 || length > MAX_SNAPSHOT_BYTES) throw new Error("invalid snapshot size");
  const file = await open(output, "wx");
  try {
    for (let offset = 0; offset < length; offset += piece) {
      const bytes = Buffer.from(await page.evaluate(([offset, piece]) =>
        globalThis.dollySnapshot.subarray(offset, offset + piece).toBase64(), [offset, piece]), "base64");
      await file.write(bytes, 0, bytes.length, offset);
    }
  } catch (error) {
    await rm(output, { force: true });
    throw error;
  } finally {
    await file.close();
  }
  return length;
}
