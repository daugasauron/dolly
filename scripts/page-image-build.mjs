import { open, rm } from "node:fs/promises";
import { MAX_SNAPSHOT_BYTES } from "../src/snapshot-records.mjs";

// Runs in a page (pass its source to page.evaluate): builds IMAGE of the image
// directory at IMAGES, or "custom" from CUSTOM, after its missing dependencies,
// with the builder and HTTP broker of the runtime at RUNTIME and the host
// modules whose module.json URLs are MODULES; on Dolly's site both directories
// are the site and the modules every one it builds (host/manifests.mjs). With
// RELAY, a URL prefix of the page's own origin, the broker fetches each remote
// request it admits from RELAY + scheme/host/path?query instead. Logs
// through the exposed dollyBuildLog(text), keeps the snapshot's Blob in
// globalThis.dollySnapshot and returns { inputs, dependenciesBuilt }.
export async function buildImageInPage(runtime, images, image, custom, modules, relay) {
  // What the runtime needs of the browser, said before anything is built.
  if (!crossOriginIsolated) throw new Error("the build page is not cross-origin isolated");
  if (!WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 5, 3, 1, 4, 1]))) {
    throw new Error("this browser has no WebAssembly memory64, which Dolly needs (Chrome 138, Firefox 146 or later)");
  }
  const log = text => void globalThis.dollyBuildLog(text);
  const [registry, policy, transport, builder, graph] = await Promise.all([
    "src/images.mjs", "host/http/policy.mjs", "host/http/local-services.mjs",
    "src/image-builder.mjs", "src/image-build.mjs",
  ].map(path => import(new URL(path, runtime).href)));
  await registry.loadImages(images);
  // A relayed answer is from the URL the relay reached, after its redirects: a program
  // resolves what it links against that, as without a relay, never against the relay's.
  const remoteFetch = relay && (async (url, init) => {
    const response = await fetch(`${relay}${url.protocol.slice(0, -1)}/${url.host}${url.pathname}${url.search}`, init);
    return Object.defineProperty(response, "url", { value: response.headers.get("x-dolly-relay-url") ?? url.href });
  });
  const network = { ...transport.localServicesTransport(new policy.DollyHttpPolicy(globalThis.DOLLY_HTTP_POLICY,
    registry.bootstrapSources(), new URL(images)), {}, remoteFetch), site: images };
  modules ??= (await import(new URL("host/manifests.mjs", runtime).href)).hostModuleUrls;
  const build = (name, artifacts) => builder.buildImage(name, artifacts, { http: { network } }, log,
    { modules, customSource: name === "custom" ? custom : undefined });
  let dependenciesBuilt = 0;
  const dependencies = await graph.prepareImageArtifacts(image, custom, (name, artifacts) => {
    dependenciesBuilt++;
    return build(name, artifacts);
  }, text => log(`${text}\n`));
  const { bytes, inputs } = await build(image, dependencies);
  globalThis.dollySnapshot = bytes;
  return { inputs, dependenciesBuilt };
}

// Copies the snapshot buildImageInPage left in PAGE to the new file OUTPUT, in
// pieces. Not by the page's fetch: Playwright keeps the body of every request a
// page sends, so an upload held the whole snapshot a second time.
export async function savePageSnapshot(page, output) {
  const length = await page.evaluate(() => globalThis.dollySnapshot.size), piece = 16 * 1024 * 1024;
  if (length <= 0 || length > MAX_SNAPSHOT_BYTES) throw new Error("invalid snapshot size");
  const file = await open(output, "wx");
  try {
    for (let offset = 0; offset < length; offset += piece) {
      // A data URL's base64, which every browser the runtime runs in makes.
      const bytes = Buffer.from(await page.evaluate(([offset, piece]) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(",") + 1));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(globalThis.dollySnapshot.slice(offset, offset + piece));
      }), [offset, piece]), "base64");
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
