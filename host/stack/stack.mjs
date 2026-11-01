export { DOLLY_STACK_ABI_DIGEST as digest } from "./abi.mjs";

// The provider (process.mjs) runs inside the process Worker of an executable
// that records stack@0. This side fetches its bundle once, as the supervisor
// fetches the process Worker: starting a program makes no request.
export function worker({ get, runtimeBase }) {
  return {
    async start() {
      const response = await fetch(new URL("dist/dolly-process-stack.mjs", runtimeBase), {
        cache: "no-store", credentials: "same-origin", redirect: "error",
      });
      if (!response.ok) throw new Error(`Dolly dolly-process-stack.mjs returned HTTP ${response.status}`);
      get("runtime").serveInProcess("stack@0", {
        bundle: new Blob([await response.arrayBuffer()], { type: "text/javascript" }), configuration: {} });
    },
    disabled() { get("runtime").serveInProcess("stack@0"); },
  };
}
