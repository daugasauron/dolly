// Upstream's fixpoint in a session: in default with the cc and gzip
// packages and the host modules Dollyfile-ocaml declares (nena enables them, as
// a person would), its rows run again up to its make bootstrap, which fails
// unless the compiler that boot/ocamlc built reproduces itself.
// Usage: node demos/ocaml/test/fixpoint-browser.mjs [chromium|firefox ...]
import { readFile } from "node:fs/promises";
import { demoTest } from "../../browser.mjs";
import { inspectDollyfile } from "../../../src/dollyfile-view.mjs";
import { sitePath } from "../../../src/static-asset.mjs";

const browsers = process.argv.length > 2 ? process.argv.slice(2) : ["chromium", "firefox"];
const recipe = new URL("../Dollyfile-ocaml", import.meta.url);
const { rows, hostRequirements } = inspectDollyfile(await readFile(recipe, "utf8"), recipe.href);
const modules = hostRequirements.filter(module => module !== "runtime@0").map(module => module.replace(/@0$/, ""));
const steps = rows.slice(0, rows.findIndex(row => row.args.includes(" make -j4 bootstrap")) + 1)
  .filter(row => ["SOURCE", "SLOP"].includes(row.directive));

for (const browser of browsers) {
  await demoTest("ocaml fixpoint", { image: "default", timeout: 1_800_000, browser }, async ({ server, open }) => {
    const { run } = await open({ policy: { rules: [{ origin: server.origin, path: "/amy-index.txt", methods: ["GET"] },
      { origin: server.origin, pathPrefix: "/dist/static/ocaml/", methods: ["GET"] }] } });
    await run(`nena enable ${modules.join(" ")} && amy install cc && amy install gzip`);
    for (const { directive, args } of steps) {
      if (directive === "SOURCE") {
        const [source, , path] = args.split(" ");
        await run(`curl -fsS ${server.origin}${sitePath(source)} -o ${path}`);
      } else {
        const [, directory = "/", command] = args.match(/^(?:CWD (\S+) )?(.*)$/s);
        const started = Date.now();
        await run(`cd ${directory} && ${command}`);
        console.log(`${browser}: ${command} in ${Math.round((Date.now() - started) / 1000)} s`);
      }
    }
  });
}
