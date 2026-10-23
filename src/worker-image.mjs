// What a runtime Worker does around the image it runs: it takes the page's
// configure message, starts the host modules and a kernel, has `image` put the
// image into that kernel, and runs its ENTRY. runtime-worker.mjs restores an
// image of the image directory; the site's build-worker.mjs builds one or
// restores a custom one.
import { DOLLY_BUILD_ID } from "../dist/dolly-build-id.mjs";
import { loadImages } from "./images.mjs";
import { decodeImageEntry } from "./image-entry.mjs";
import { MAX_SNAPSHOT_BYTES } from "./snapshot-records.mjs";
import { terminalFailureReason } from "./process-supervisor.mjs";
import { bootFiles } from "../host/runtime/boot-files.mjs";

const decoder = new TextDecoder("utf-8", { ignoreBOM: true });

// Listen before the host registry loads its manifests: the page's configure
// message may arrive while that import is still pending.
const configured = new Promise((resolve, reject) => {
  const timeout = setTimeout(
    () => reject(new Error("Dolly boot configuration was not provided")), 10_000,
  );
  self.addEventListener("message", function configure(event) {
    if (event.data?.type !== "configure") return;
    self.removeEventListener("message", configure);
    clearTimeout(timeout);
    resolve(event.data);
  });
});
const { hostRegistry } = await import("../host/modules.mjs");

// The runtime's own files: the kernel and the contracts beside this module.
export const runtimeBase = new URL("../", import.meta.url);
export const kernelArtifact = path => {
  if (path !== "dolly.wasm" && path !== "dolly.data") throw new Error("unknown fixed kernel artifact");
  return new URL(`dist/${path}`, runtimeBase).href;
};

export function checkedMemoryRange(memory, addressValue, sizeValue) {
  const address = Number(addressValue);
  const size = Number(sizeValue);
  if (!Number.isSafeInteger(address) || !Number.isSafeInteger(size) ||
      address <= 0 || size <= 0 || size > MAX_SNAPSHOT_BYTES ||
      address > memory.buffer.byteLength - size) {
    throw new Error("Wasm published an invalid system snapshot memory range");
  }
  return { address, size };
}

const stage = text => self.postMessage({ type: "bootstrap", text: `${text}\n`, error: false });

function acknowledged(type, failure) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(failure)), 10_000);
    self.addEventListener("message", function acknowledge(event) {
      if (event.data?.type !== type) return;
      self.removeEventListener("message", acknowledge);
      clearTimeout(timeout);
      resolve();
    });
  });
}

// `image(config, host)` checks what the page asked for and returns its steps:
// prepare({ kernel, memory, files, stage }) before the kernel's modules start,
// restore({ kernel, memory, files, stage }) to { status, supervisor? },
// and an optional finish({ kernel, stage }) once the supervisor runs; `name` is
// the image the route asked for ("custom" names none).
export async function runImage(image) {
  let host;
  self.addEventListener("message", event => { void host?.handle(event.data).catch(error => {
    host.dispose();
    self.postMessage({ type: "error", message: error.message });
  }); });
  try {
    const config = await configured;
    if (!Array.isArray(config.modules) || config.modules.length > 64 ||
        !config.modules.every(url => typeof url === "string")) throw new Error("invalid host module list");
    if (typeof config.images !== "string") throw new Error("invalid image directory");
    await loadImages(config.images);
    host = await (await hostRegistry(config.modules)).createHost("worker", config.hostModules, {
      send: (message, transfers = []) => self.postMessage(message, transfers),
      configuration: config.hostConfiguration,
      resources: { runtimeBase },
    });
    const steps = await image(config, host);
    stage("creating wasm64 userspace kernel...");
    const memory = host.kernel.memory;
    await host.kernel.growing;
    // Fixed deployment input, never a filename or URL supplied by Wasm.
    const kernelModule = await WebAssembly.compileStreaming(fetch(kernelArtifact("dolly.wasm")));
    const kernel = new WebAssembly.Instance(kernelModule, host.imports(kernelModule)).exports;
    kernel._initialize();
    const files = bootFiles(kernel, memory);
    await steps.prepare({ kernel, memory, files, stage });
    stage("Dolly runtime loaded");
    await host.start("kernel", { kernel, memory });
    const restored = await steps.restore({ kernel, memory, files, stage });
    if (restored.status !== 0) throw new Error(`Dolly bootstrap failed with status ${restored.status}`);
    if (config.buildOnly) {
      self.close();
      return;
    }
    const supervisor = restored.supervisor ?? await host.kernel.supervisor(kernel);
    await steps.finish?.({ kernel, stage });

    await host.imageRestored({ kernel, supervisor, stage, files, image: steps.name });
    if (kernel.dolly_bootstrap_environment() !== 0) throw new Error("Dolly image environment is invalid");
    await host.start("image", { kernel, memory });
    const runtimeImage = decoder.decode(files.read("/etc/dolly/image", 256));
    if (steps.name !== "custom" && runtimeImage !== steps.name) {
      throw new Error(`Dollyfile selected image ${runtimeImage}, expected ${steps.name}`);
    }
    stage("starting image entry...");
    const entryReady = acknowledged("entry-ready-ack", "browser did not acknowledge image startup");
    self.postMessage({ type: "ready", image: runtimeImage, routeImage: steps.name, buildId: DOLLY_BUILD_ID,
      hostModules: host.enabled });
    await entryReady;

    // The image ends with its ENTRY process, however that ended: a program that
    // failed or could not start is the image's ending, not the runtime's failure.
    const entry = async () => supervisor.spawn(decodeImageEntry(files.read("/etc/dolly/entry", 64 * 1024)), { foreground: true });
    const ending = await entry().catch(error => {
      console.error(error);
      return { status: 126, signal: 0, failure: error.reason ?? terminalFailureReason(error) };
    });
    // The modules' Worker sides let go first: display@0 gives the page its last frame.
    host.dispose();
    self.postMessage({ type: "exited", ...ending });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? "" : "",
    });
  } finally {
    host?.dispose();
  }
}
