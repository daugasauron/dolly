import { inspectDollyfile, recipeFileName, imageFileName } from "./dollyfile-view.mjs";
import { sha256 } from "./static-asset.mjs";

const key = object => `${object.type}:${object.name}`;
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

// The recipe graph of one image, as /bin/dollyfile reads it: the root and the
// FROM/INSTALL/COPY images it imports, each with its own imports. `read(url)`
// returns a recipe's bytes; this checks every pin. It is an inspection graph,
// not a dependency solver: runtime assertions may resolve against files and
// environment that recipes do not declare. Pass the same `recipes` cache to
// reuse parsed recipes across graphs.
export async function loadRecipeGraph(read, rootLocation, recipes = new Map()) {
  const records = [], edges = [], artifacts = [];
  const active = new Set(), images = new Map(), imageNames = new Map();

  function parse(location) {
    if (!recipes.has(location)) {
      recipes.set(location, (async () => {
        const bytes = await read(location);
        return { ...inspectDollyfile(decoder.decode(bytes), location), sha256: await sha256(bytes) };
      })());
    }
    return recipes.get(location);
  }

  async function load(location, expected, root) {
    if (active.has(location)) throw new Error(`${location}: recipe cycle`);
    const parsed = await parse(location);
    if (expected && parsed.sha256 !== expected) throw new Error(`${location}: stale recipe pin`);
    // An uploaded root is labeled "Dollyfile"; every site path names its recipe's file.
    const file = recipeFileName(location);
    if (file !== "" && imageFileName(file) !== parsed.name) {
      throw new Error(`${location}: ${parsed.role.toUpperCase()} ${parsed.name} must match its file name`);
    }
    if ((imageNames.get(parsed.name) ?? location) !== location) {
      throw new Error(`${location}: image ${parsed.name} is already ${imageNames.get(parsed.name)}`);
    }
    imageNames.set(parsed.name, location);
    if (!root && images.has(location)) return images.get(location);
    active.add(location);
    const record = { ...parsed, location, dependencies: [], imports: new Map(), artifactTargets: [] };
    records.push(record);
    const visible = new Map();
    const published = new Map();
    const operations = [
      ...record.artifacts,
      ...record.requirements.map(value => ({ ...value, operation: "requirement" })),
      ...record.exports.map(value => ({ ...value, operation: "export" })),
    ].sort((a, b) => a.line - b.line);
    for (const operation of operations) {
      if (["from", "install", "copy"].includes(operation.operation)) {
        const target = await load(operation.location, operation.sha256, false);
        if (operation.operation === "from" ? target.role === "package"
            : operation.operation === "install" && target.role !== "package") {
          throw new Error(`${location}:${operation.line}: ${target.name} is a ${target.role}: ` +
            "FROM takes an application or toolchain, INSTALL a package");
        }
        // Host requirements are never inherited: a package's must be declared here.
        if (operation.operation === "install") {
          const missing = target.hostRequirements.filter(name => !record.hostRequirements.includes(name));
          if (missing.length) {
            throw new Error(`${location}:${operation.line}: ${target.name} needs REQUIRES HOST ${missing.join(", ")}`);
          }
        }
        record.artifactTargets.push({ reference: operation, target });
        if (root) artifacts.push({ ...operation, image: target.image });
        // A package keeps nothing of its base; COPY takes files only.
        const imports = operation.operation === "from" ? record.role !== "package" : operation.operation === "install";
        if (operation.operation !== "copy") {
          for (const [name, provider] of target.scopeExporters) {
            visible.set(name, provider);
            if (imports) published.set(name, provider);
          }
        }
      } else if (operation.operation === "export") {
        if (operation.details.length !== 0 || !visible.has(key(operation))) {
          visible.set(key(operation), { module: record, exported: operation });
        }
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
    // A recipe's own exports describe its completed state and win over imported
    // ones. Bare TOOL and ENV names resolve against the last provider seen: a
    // package, an inherited base, or runtime state.
    for (const exported of record.exports) {
      const provider = visible.get(key(exported));
      const resolved = (exported.details.length === 0 || exported.type === "ENV") && provider && provider.module !== record
        ? { ...exported, details: provider.exported.details } : exported;
      published.set(key(exported), { module: record, exported: resolved });
    }
    record.scopeExporters = published;
    if (!root) images.set(location, record);
    active.delete(location);
    return record;
  }

  const root = await load(rootLocation, null, true);
  return { root, records, edges, exporters: root.scopeExporters, artifacts };
}
