import { parseWasmInterface } from "../../src/wasm-interface.mjs";
export { DOLLY_DSO_ABI_DIGEST as digest } from "./abi.mjs";

// The loader and the FFI dispatcher (process.mjs) run inside the process Worker
// of an executable that records dso@0. This side fetches their bundle and the
// side-module contract once, as the supervisor fetches the process Worker:
// starting a program makes no request.
export function worker({ get, abi, applicationBase }) {
  return {
    async start() {
      const [contract, bundle] = await Promise.all(["dolly-dso-0.wasm", "dolly-process-dso.mjs"].map(async name => {
        const response = await fetch(new URL(`dist/${name}`, applicationBase), {
          cache: "no-store", credentials: "same-origin", redirect: "error",
        });
        if (!response.ok) throw new Error(`Dolly ${name} returned HTTP ${response.status}`);
        return response.arrayBuffer();
      }));
      // abi is the live set of modules the image admits; a loaded library's
      // own records are checked against it.
      get("runtime").serveInProcess("dso@0", { bundle: new Blob([bundle], { type: "text/javascript" }),
        configuration: { contract: parseWasmInterface(contract, "dolly-dso-0"), hostAbi: abi } });
    },
  };
}
