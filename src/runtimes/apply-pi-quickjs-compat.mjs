// Apply Dolly's finite Pi/QuickJS syntax boundary to target-emitted source in
// WasmFS. This is a target-side build step; it has no browser or network API.
import { lowerPiQuickJs } from "/usr/lib/pi/quickjs-compat.mjs";

if (scriptArgs.length !== 1) {
  throw new Error("usage: apply-pi-quickjs-compat.mjs FILE");
}
const path = scriptArgs[0];
Dolly.writeFile(path, lowerPiQuickJs(Dolly.readFile(path), "source"));
