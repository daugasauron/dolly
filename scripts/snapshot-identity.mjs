import { createHash } from "node:crypto";
import { recipeRecords } from "./dollyfile-graph.mjs";
import { decodeSnapshotEnvironment, validateSnapshotEntry } from "./system-snapshot-format.mjs";

const decoder = new TextDecoder("utf-8", { fatal: true });
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function verifySnapshotIdentity(definition, graph, parsed, processContract, processAbiDigest) {
  const image = definition.image;
  const recipes = recipeRecords(graph);
  const selected = decoder.decode(parsed.files.get("/etc/dolly/image") ?? new Uint8Array());
  if (selected !== image) throw new Error(`snapshot selected image ${selected}, expected ${image}`);
  const expectedLock = "DOLLY-RECIPES 1\n" +
    recipes.map((recipe) => `${recipe.locator} ${recipe.sha256}\n`).join("");
  const actualLock = decoder.decode(parsed.files.get("/etc/dolly/recipes.lock") ?? new Uint8Array());
  if (actualLock !== expectedLock) throw new Error("snapshot recipe lock does not match source");
  const sourceByPath = new Map(graph.records.map((record) => [`/${record.relative}`, record.source]));
  for (const recipe of recipes) {
    const embedded = parsed.files.get(recipe.retainedPath);
    if (!embedded || sha256(embedded) !== recipe.sha256 ||
        decoder.decode(embedded) !== sourceByPath.get(recipe.sourcePath)) {
      throw new Error(`snapshot did not retain the exact ${recipe.sourcePath}`);
    }
  }
  const selectedBytes = parsed.files.get("/etc/dolly/Dollyfile");
  if (!selectedBytes || decoder.decode(selectedBytes) !== definition.source) {
    throw new Error("snapshot canonical Dollyfile does not match the selected recipe");
  }
  const environment = decodeSnapshotEnvironment(parsed.files.get("/etc/dolly/environment"));
  const expectedEnvironment = [...graph.exporters.values()]
    .map(({ exported }) => exported).filter(({ type }) => type === "ENV");
  if (environment.size !== expectedEnvironment.length) {
    throw new Error("snapshot environment does not match image exports");
  }
  for (const exported of expectedEnvironment) {
    const [operation, appended] = exported.details;
    const append = exported.details.length === 2 && operation === "APPEND";
    if (!environment.has(exported.name) ||
        (!append && environment.get(exported.name) !== operation) ||
        (append && !environment.get(exported.name).split(":").includes(appended))) {
      throw new Error(`snapshot environment does not match ENV ${exported.name}`);
    }
  }
  const entry = validateSnapshotEntry(parsed, processContract, processAbiDigest);
  if (JSON.stringify(entry) !== JSON.stringify(definition.parsed.entry)) {
    throw new Error("snapshot ENTRY does not match the selected recipe");
  }
  return entry;
}
