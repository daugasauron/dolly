import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { inspectDollyfile } from "../src/dollyfile-view.mjs";

const digest = source => createHash("sha256").update(source).digest("hex");
const key = object => `${object.type}:${object.name}`;

// This is an inspection graph, not a dependency solver. Runtime assertions may
// resolve against files and environment that cannot be inferred from recipes.
export function createDollyfileGraphLoader(projectDir) {
  const recipes = new Map();
  return (rootFilename = "Dollyfile") => loadGraph(projectDir, rootFilename, recipes);
}

async function loadGraph(projectDir, rootFilename, recipes) {
  const modules = [], records = [], edges = [], artifacts = [];
  const active = new Set();
  const seen = new Set();
  const images = new Map();

  async function load(relative, expected, available, image = false, stage = true) {
    const path = resolve(projectDir, relative);
    if (active.has(path)) throw new Error(`${relative}: recipe cycle`);
    if (active.size >= 16) throw new Error(`${relative}: recipe depth exceeds 16`);
    if (!recipes.has(path)) recipes.set(path, readFile(path, "utf8").then(source => ({
      ...inspectDollyfile(source, relative), sha256: digest(source),
    })));
    const parsed = await recipes.get(path);
    const { sha256 } = parsed;
    if (expected && sha256 !== expected) throw new Error(`${relative}: stale recipe pin`);
    if (parsed.kind !== (image ? "image" : "module")) {
      throw new Error(`${relative}: expected ${image ? "IMAGE" : "MODULE"}`);
    }
    if (!image && relative !== `modules/${parsed.name}.dm`) throw new Error(`${relative}: MODULE ${parsed.name} must match its filename`);
    const cached = image && !stage ? images.get(path) : null;
    if (cached) {
      if (active.size + cached.height > 16) throw new Error(`${relative}: recipe depth exceeds 16`);
      return cached;
    }
    active.add(path);
    const record = {
      ...parsed, path, relative, location: `/${relative}`,
      children: [], dependencies: [], imports: new Map(), artifactTargets: [],
    };
    if (!seen.has(relative)) {
      seen.add(relative);
      records.push(record);
      if (!image) modules.push(record);
    }
    const visible = new Map(available);
    const published = new Map();
    const operations = [
      ...record.uses.map(value => ({ ...value, operation: "use" })),
      ...record.artifacts.map(value => ({ ...value, operation: "artifact" })),
      ...record.requirements.map(value => ({ ...value, operation: "requirement" })),
      ...record.exports.map(value => ({ ...value, operation: "export" })),
    ].sort((a, b) => a.line - b.line);
    for (const operation of operations) {
      if (operation.operation === "artifact") {
        const target = await load(operation.location.slice(1), operation.sha256, new Map(), true, false);
        record.artifactTargets.push({ reference: operation, target });
        if (stage) artifacts.push({ ...operation, image: target.image });
        if (!operation.copy) {
          for (const [name, provider] of target.scopeExporters) {
            visible.set(name, provider);
            published.set(name, provider);
          }
        }
      } else if (operation.operation === "use") {
        const child = await load(operation.location.slice(1), operation.sha256, visible, false, stage);
        child.selectedAt = operation.line;
        record.children.push(child);
        for (const [name, provider] of child.scopeExporters) {
          visible.set(name, provider);
          if (image) published.set(name, provider);
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
    // Exports describe the completed module. Bare TOOL and ENV names may
    // resolve against a child, an inherited base, or runtime state.
    for (const exported of record.exports) {
      const provider = visible.get(key(exported));
      let resolved = exported;
      if ((exported.details.length === 0 || exported.type === "ENV") && provider && provider.module !== record) {
        resolved = { ...exported, details: provider.exported.details, sha256: provider.exported.sha256 };
      }
      published.set(key(exported), { module: record, exported: resolved });
    }
    record.scopeExporters = published;
    record.height = 1 + Math.max(0, ...record.children.map(child => child.height),
      ...record.artifactTargets.map(({ target }) => target.height));
    if (image && !stage) images.set(path, record);
    active.delete(path);
    return record;
  }

  const root = await load(rootFilename, null, new Map(), true);
  return { root, modules, records, edges, exporters: root.scopeExporters, artifacts };
}

export function loadDollyfileGraph(projectDir, rootFilename = "Dollyfile") {
  return createDollyfileGraphLoader(projectDir)(rootFilename);
}

export function recipeRecords(graph) {
  const records = [], seen = new Set();
  function visit(record) {
    if (seen.has(record.relative)) return;
    seen.add(record.relative);
    const children = [
      ...record.children.map(target => ({ line: target.selectedAt, target })),
      ...record.artifactTargets.map(({ reference, target }) => ({ line: reference.line, target })),
    ].sort((a, b) => a.line - b.line);
    for (const { target } of children) visit(target);
    records.push({
      kind: record.kind, name: record.name, locator: record.location,
      sourcePath: record.location,
      retainedPath: record.kind === "image"
        ? `/etc/dolly/recipes/${record.name}.Dollyfile`
        : `/etc/dolly/recipes/modules/${record.name}.dm`,
      sha256: record.sha256, byteLength: Buffer.byteLength(record.source),
    });
  }
  visit(graph.root);
  return records;
}
