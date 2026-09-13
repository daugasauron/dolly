import { DOLLY_IMAGES, DOLLY_STATIC_SOURCES } from "../dist/dolly-images.mjs";
import { consumeDollyHttpPolicy } from "./http-policy.mjs";
import { localServicesTransport } from "./local-services.mjs";
import { prepareImageArtifacts } from "./image-build.mjs";
import { buildImage } from "./image-builder.mjs";

const image = document.body.dataset.image;
const button = document.querySelector("#build"), cancel = document.querySelector("#cancel");
const status = document.querySelector("#status"), log = document.querySelector("#bootstrap-log");
const sources = [
  ...DOLLY_IMAGES.map(definition => ({ path: `/${definition.dollyfile}`, byteLength: definition.byteLength })),
  ...DOLLY_STATIC_SOURCES,
];
const network = localServicesTransport(consumeDollyHttpPolicy(globalThis, sources, new URL("../", import.meta.url)));
let controller;
const report = text => { log.textContent = (log.textContent + text).slice(-8192); };
cancel.addEventListener("click", () => controller?.abort());
button.addEventListener("click", async () => {
  controller = new AbortController();
  const { signal } = controller;
  button.disabled = true;
  cancel.hidden = false;
  log.textContent = "";
  status.textContent = "Building inside Dolly…";
  document.documentElement.dataset.dollyStatus = "building";
  try {
    const build = (name, artifacts) => buildImage(name, artifacts, network, report, { signal });
    const artifacts = await prepareImageArtifacts(image, undefined, build, text => report(`${text}\n`), signal);
    const result = await build(image, artifacts);
    status.textContent = `Built ${(result.bytes.byteLength / 1024 / 1024).toFixed(1)} MiB.`;
    document.documentElement.dataset.dollyStatus = "ready";
  } catch (error) {
    status.textContent = signal.aborted ? "Build cancelled." : error.message;
    document.documentElement.dataset.dollyStatus = signal.aborted ? "cancelled" : "failed";
  } finally {
    button.disabled = false;
    cancel.hidden = true;
    controller = undefined;
  }
});
button.disabled = false;
if (document.body.dataset.mode === "rebuild") button.click();
