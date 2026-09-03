import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { inspectDollyfile } from "../src/dollyfile-view.mjs";

function digest(source) {
  return createHash("sha256").update(source).digest("hex");
}

function key(type, name) {
  return `${type}:${name}`;
}

function validateSlopTools(module) {
  const permitted = new Set();
  const events = [
    ...module.requirements
      .filter(({ type }) => type === "TOOL")
      .map((item) => ({ kind: "require", line: item.line, item })),
    ...module.exports
      .filter(({ type }) => type === "TOOL")
      .map((item) => ({ kind: "export", line: item.line, item })),
    ...module.slops.map((item) => ({ kind: "slop", line: item.line, item })),
  ].sort((left, right) => left.line - right.line);

  for (const event of events) {
    if (event.kind === "require") {
      permitted.add(event.item.name);
      continue;
    }
    if (event.kind === "export") {
      permitted.add(event.item.name);
      continue;
    }
    const command = event.item.command[0];
    const name = command.split("/").at(-1);
    if (!permitted.has(name)) {
      throw new Error(
        `${module.relative}:${event.line}: SLOP command ${command} must be ` +
        "declared by an earlier REQUIRES TOOL or EXPORTS TOOL",
      );
    }
  }
}

function validateScratchCleanup(module) {
  const scratchRoots = (value) => [...String(value).matchAll(/\/tmp\/([A-Za-z0-9._-]+)/g)]
    .map((match) => `/tmp/${match[1]}`);
  const roots = new Set(
    [...module.sources.flatMap(({ destination }) => scratchRoots(destination)),
      ...module.files.flatMap(({ path }) => scratchRoots(path)),
      ...module.slops.flatMap(({ cwd, command }) =>
        [cwd, ...command].flatMap(scratchRoots))],
  );
  if (roots.size === 0) return;
  const cleanup = module.slops.at(-1)?.command ?? [];
  if (cleanup[0] !== "rm") {
    throw new Error(`${module.relative}: module must end by removing its build scratch`);
  }
  for (const root of roots) {
    if (!cleanup.includes(root)) {
      throw new Error(`${module.relative}: module does not remove ${root}`);
    }
  }
}

function validateSourceDisposition(module) {
  const retained = [
    ...module.files.map(({ path }) => path).filter((path) => !path.startsWith("/tmp/")),
    ...module.folders.map(({ path }) => path),
    ...module.exports.flatMap(({ type, details }) =>
      type !== "ENV" && type !== "TOOL" && details[0] ? [details[0]] : []),
  ];
  const tools = new Set(
    module.exports.filter(({ type }) => type === "TOOL").map(({ name }) => name),
  );
  const cleanup = (module.slops.at(-1)?.command[0] === "rm"
    ? module.slops.at(-1).command
    : []).filter((word) => word.startsWith("/"));
  const contains = (root, path) => path === root || path.startsWith(`${root}/`);
  for (const source of module.sources.filter(
    ({ destination }) => !destination.startsWith("/tmp/"),
  )) {
    const tool = source.destination.split("/").at(-1);
    const exportedTool = tools.has(tool) &&
      [`/bin/${tool}`, `/usr/bin/${tool}`].includes(source.destination);
    if (retained.some((root) => contains(root, source.destination)) ||
        cleanup.some((root) => contains(root, source.destination)) ||
        exportedTool) continue;
    throw new Error(
      `${module.relative}:${source.line}: SOURCE destination ${source.destination} ` +
      "must be retained or removed by its module",
    );
  }
}

export async function loadDollyfileGraph(projectDir, rootFilename = "Dollyfile") {
  const rootPath = resolve(projectDir, rootFilename);
  const rootSource = await readFile(rootPath, "utf8");
  const root = {
    ...inspectDollyfile(rootSource, rootFilename),
    path: rootPath,
    relative: rootFilename,
    sha256: digest(rootSource),
  };
  if (root.version !== 2 || root.kind !== "image") {
    throw new Error("Dollyfile 2 image required for the module graph");
  }

  const modules = [];
  const names = new Map();
  const edges = [];
  const declaredWriters = new Map();
  root.dependencies = [];
  root.consumers = [];
  root.children = [];
  root.depth = 0;
  root.imports = new Map();

  async function loadScope(parent) {
    const exporters = new Map(parent.imports);
    const directExporters = new Map();
    const locations = new Set();
    parent.scopeExporters = exporters;
    for (const use of parent.uses) {
      const label = parent.relative;
      if (use.transport !== "host" || !use.location.startsWith("/modules/") ||
          !use.location.endsWith(".dm") || use.location.includes("..")) {
        throw new Error(`${label}:${use.line}: USE must select a HOST /modules/*.dm file`);
      }
      if (locations.has(use.location)) {
        throw new Error(`${label}:${use.line}: duplicate USE ${use.location}`);
      }
      locations.add(use.location);
      const relative = use.location.slice(1);
      const path = resolve(projectDir, relative);
      const source = await readFile(path, "utf8");
      const sha256 = digest(source);
      if (sha256 !== use.sha256) {
        throw new Error(`${label}:${use.line}: stale module pin for ${use.location}`);
      }
      const parsed = inspectDollyfile(source, relative);
      if (parsed.kind !== "module") throw new Error(`${relative}: USE target must be a module`);
      const expectedName = relative.slice("modules/".length, -".dm".length);
      if (parsed.name !== expectedName) {
        throw new Error(`${relative}: MODULE ${parsed.name} must match its filename`);
      }
      const previous = names.get(parsed.name);
      if (previous) {
        throw new Error(
          `${relative}: module ${parsed.name} was already selected by ${previous}; ` +
          "a module may be USEd only once in one Dollyfile graph",
        );
      }
      names.set(parsed.name, label);
      const module = {
        ...parsed, path, relative, location: use.location, sha256, selectedAt: use.line,
        parent, depth: parent.depth + 1, children: [], dependencies: [], consumers: [],
        available: new Map(exporters), imports: new Map(), resolvedExports: new Map(),
      };
      for (const declaration of [
        ...module.sources.map(({ destination, line }) => ({ path: destination, line })),
        ...module.files
          .filter(({ body }) => body !== null)
          .map(({ path, line }) => ({ path, line })),
      ]) {
        const previous = declaredWriters.get(declaration.path);
        if (previous && previous.module !== module.name) {
          throw new Error(
            `${relative}:${declaration.line}: ${declaration.path} is already written by ` +
            `${previous.relative}:${previous.line}`,
          );
        }
        declaredWriters.set(declaration.path, {
          module: module.name, relative, line: declaration.line,
        });
      }
      for (const requirement of module.requirements) {
        const provider = exporters.get(key(requirement.type, requirement.name));
        if (!provider) {
          throw new Error(
            `${relative}:${requirement.line}: ${requirement.type} ${requirement.name} ` +
            `must be exported by an earlier USE in ${label}`,
          );
        }
        const edge = {
          consumer: module, requirement, provider: provider.module, exported: provider.exported,
        };
        module.dependencies.push(edge);
        provider.module.consumers.push(edge);
        edges.push(edge);
        module.imports.set(key(requirement.type, requirement.name), provider);
      }
      parent.children.push(module);
      modules.push(module);
      const childExporters = await loadScope(module);
      module.reexports = new Map();
      if (module.uses.length) {
        for (const exported of module.exports) {
          const object = key(exported.type, exported.name);
          const provider = childExporters.get(object);
          if (!provider) {
            throw new Error(
              `${module.relative}:${exported.line}: aggregate export ${exported.type} ` +
              `${exported.name} must come from a direct child`,
            );
          }
          module.reexports.set(object, provider);
          module.resolvedExports.set(object, {
            ...exported,
            details: provider.exported.details,
            sha256: provider.exported.sha256,
          });
        }
      }
      validateSlopTools(module);
      validateScratchCleanup(module);
      validateSourceDisposition(module);
      for (const exported of module.exports) {
        const object = key(exported.type, exported.name);
        const resolved = module.resolvedExports.get(object) ?? exported;
        if (exporters.has(object)) {
          throw new Error(
            `${module.relative}:${exported.line}: duplicate export ${exported.type} ` +
            `${exported.name} in ${label}`,
          );
        }
        const provider = { module, exported: resolved };
        exporters.set(object, provider);
        directExporters.set(object, provider);
      }
    }
    return directExporters;
  }

  const exporters = await loadScope(root);
  for (const requirement of root.requirements) {
    const provider = exporters.get(key(requirement.type, requirement.name));
    if (!provider) {
      throw new Error(`${root.relative}:${requirement.line}: unresolved ${requirement.type} ${requirement.name}`);
    }
    const edge = { consumer: root, requirement, provider: provider.module, exported: provider.exported };
    root.dependencies.push(edge);
    provider.module.consumers.push(edge);
    edges.push(edge);
  }

  const records = [root, ...modules];
  return { root, modules, records, exporters, edges };
}

export function recipeRecords(graph) {
  const records = [];
  function visit(record) {
    for (const child of record.children) visit(child);
    records.push(record);
  }
  visit(graph.root);
  return records.map((record) => ({
    kind: record.kind,
    name: record.name,
    locator: record.kind === "image" ? `/${record.relative}` : record.location,
    sourcePath: `/${record.relative}`,
    retainedPath: record.kind === "image"
      ? `/etc/dolly/recipes/${record.name}.Dollyfile`
      : `/etc/dolly/recipes/modules/${record.name}.dm`,
    sha256: record.sha256,
    byteLength: Buffer.byteLength(record.source),
  }));
}

export function moduleCacheRecords(graph) {
  const prefix = [];
  const result = [];
  function visit(record) {
    for (const child of record.children) visit(child);
    const locator = record.kind === "image" ? `/${record.relative}` : record.location;
    prefix.push(`${locator} ${record.sha256}\n`);
    if (record.kind === "module" && record.children.length === 0 &&
        record.slops.length !== 0) {
      const hash = createHash("sha256")
        .update("DOLLY-MODULE-CACHE 1\n")
        .update(prefix.join(""))
        .update("DOLLY-MODULE-SCOPE 1\0");
      for (const { exported } of record.available.values()) {
        // The C engine stores a pinned TOOL's digest separately and resolves
        // its path at use time; the parser's third source token is not object
        // detail and must not be hashed a second time.
        const detail = exported.type === "TOOL" ? "" : exported.details.join(" ");
        hash.update(exported.type).update("\0")
          .update(exported.name).update("\0")
          .update(detail).update("\0")
          .update(exported.sha256 ?? "").update("\0");
      }
      const cacheKey = hash.digest("hex");
      result.push({ locator, sha256: record.sha256, cacheKey });
    }
  }
  visit(graph.root);
  return result;
}
