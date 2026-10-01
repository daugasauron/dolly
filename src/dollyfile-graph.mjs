import { inspectDollyfile, recipeFileName, imageFileName, moduleFileName } from "./dollyfile-view.mjs";
import { hostRequirements } from "../host/requirements.mjs";
import { sha256 } from "./static-asset.mjs";

const MAX_USE_DEPTH = 16;
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const key = object => `${object.type}:${object.name}`;

// The recipe graph of one image, as /bin/dollyfile reads it: the root and its
// USE modules, plus the FROM/INSTALL/COPY images it imports. `read(url)`
// returns a recipe's bytes; this checks every pin. It is an inspection graph,
// not a dependency solver: runtime assertions may resolve against files and
// environment that recipes do not declare. Pass the same `recipes` cache to
// reuse parsed recipes across graphs.
export async function loadRecipeGraph(read, rootLocation, recipes = new Map()) {
  const modules = [], records = [], edges = [], artifacts = [];
  const active = new Set(), seen = new Set(), images = new Map(), imageNames = new Map();

  function parse(location) {
    if (!recipes.has(location)) {
      recipes.set(location, (async () => {
        const bytes = await read(location);
        return { ...inspectDollyfile(decoder.decode(bytes), location), sha256: await sha256(bytes) };
      })());
    }
    return recipes.get(location);
  }

  // USE depth counts nested modules within one image. A FROM, INSTALL or COPY
  // target is a separately built image with its own depth.
  async function load(location, expected, available, image, stage, depth) {
    if (active.has(location)) throw new Error(`${location}: recipe cycle`);
    if (depth >= MAX_USE_DEPTH) throw new Error(`${location}: USE nesting exceeds ${MAX_USE_DEPTH} recipes`);
    const parsed = await parse(location);
    if (expected && parsed.sha256 !== expected) throw new Error(`${location}: stale recipe pin`);
    if ((parsed.kind === "image") !== image) {
      throw new Error(`${location}: expected ${image ? "an image role" : "MODULE"}`);
    }
    // An uploaded root is labeled "Dollyfile"; every URL names its recipe's file.
    const file = recipeFileName(location);
    if (file !== "" && (image ? imageFileName(file) : moduleFileName(file)) !== parsed.name) {
      throw new Error(`${location}: ${parsed.role.toUpperCase()} ${parsed.name} must match its file name`);
    }
    if (image && (imageNames.get(parsed.name) ?? location) !== location) {
      throw new Error(`${location}: image ${parsed.name} is already ${imageNames.get(parsed.name)}`);
    }
    if (image) imageNames.set(parsed.name, location);
    if (image && !stage && images.has(location)) return images.get(location);
    active.add(location);
    const record = { ...parsed, location, children: [], dependencies: [], imports: new Map(), artifactTargets: [] };
    if (!seen.has(location)) {
      seen.add(location);
      records.push(record);
      if (!image) modules.push(record);
    }
    const visible = new Map(available);
    const published = new Map();
    const requiredHost = [...record.hostRequirements];
    const operations = [
      ...record.uses.map(value => ({ ...value, operation: "use" })),
      ...record.artifacts,
      ...record.requirements.map(value => ({ ...value, operation: "requirement" })),
      ...record.exports.map(value => ({ ...value, operation: "export" })),
    ].sort((a, b) => a.line - b.line);
    for (const operation of operations) {
      if (["from", "install", "copy"].includes(operation.operation)) {
        const target = await load(operation.location, operation.sha256, new Map(), true, false, 0);
        if (operation.operation === "from" ? target.role === "package"
            : operation.operation === "install" && target.role !== "package") {
          throw new Error(`${location}:${operation.line}: ${target.name} is a ${target.role}: ` +
            "FROM takes an application or toolchain, INSTALL a package");
        }
        record.artifactTargets.push({ reference: operation, target });
        if (stage) artifacts.push({ ...operation, image: target.image });
        // A package keeps nothing of its base; COPY takes files only.
        const imports = operation.operation === "from" ? record.role !== "package" : operation.operation === "install";
        if (imports) requiredHost.push(...target.hostRequirements);
        if (operation.operation !== "copy") {
          for (const [name, provider] of target.scopeExporters) {
            visible.set(name, provider);
            if (imports) published.set(name, provider);
          }
        }
      } else if (operation.operation === "use") {
        const child = await load(operation.location, operation.sha256, visible, false, stage, depth + 1);
        requiredHost.push(...child.hostRequirements);
        child.selectedAt = operation.line;
        record.children.push(child);
        for (const [name, provider] of child.scopeExporters) {
          visible.set(name, provider);
          published.set(name, provider);
        }
      } else if (operation.operation === "export") {
        // A bare TOOL name may resolve against a child, an inherited base, or runtime state.
        const provider = visible.get(key(operation));
        const exported = record.exports.find(item => item.line === operation.line);
        const resolved = exported.details.length === 0 && provider && provider.module !== record
          ? { ...exported, details: provider.exported.details } : exported;
        if (exported.details.length !== 0 || !provider) visible.set(key(operation), { module: record, exported: resolved });
        published.set(key(operation), { module: record, exported: resolved });
      } else if (operation.operation === "requirement") {
        const requirement = record.requirements.find(item => item.line === operation.line);
        const provider = visible.get(key(operation));
        if (provider) {
          const edge = { consumer: record, requirement, provider: provider.module, exported: provider.exported };
          edges.push(edge);
          record.dependencies.push(edge);
          record.imports.set(key(operation), provider);
        }
      }
    }
    try { record.hostRequirements = hostRequirements(requiredHost); }
    catch (error) { throw new Error(`${location}: ${error.message}`); }
    record.scopeExporters = published;
    if (image && !stage) images.set(location, record);
    active.delete(location);
    return record;
  }

  const root = await load(rootLocation, null, new Map(), true, true, 0);
  return { root, modules, records, edges, exporters: root.scopeExporters, artifacts };
}
