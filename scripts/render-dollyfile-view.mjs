function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function objectId(type, name) {
  return `export-${type.toLowerCase()}-${encodeURIComponent(name)}`;
}

function moduleHref(current, target, fragment = "") {
  if (current.kind === "image") return `modules/${target.name}/${fragment}`;
  if (current === target) return fragment || "./";
  return `../${target.name}/${fragment}`;
}

function rawHref(record, location) {
  const appBase = record.kind === "image" ? "../../" : "../../../../";
  return location.startsWith("/") ? `${appBase}${location.slice(1)}` : location;
}

function link(label, href, className = "") {
  return `<a${className ? ` class="${className}"` : ""} href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

function renderRequirement(record, row, prefix, spacing, rest) {
  const requirement = record.requirements.find((item) => item.line === row.line);
  const edge = record.dependencies.find((item) => item.requirement === requirement);
  if (!edge) return escapeHtml(`${prefix}${row.directive}${spacing}${rest}`);
  const typePosition = rest.indexOf(requirement.type);
  const namePosition = rest.indexOf(requirement.name, typePosition + requirement.type.length);
  if (typePosition < 0 || namePosition < 0) {
    return escapeHtml(`${prefix}${row.directive}${spacing}${rest}`);
  }
  return `${escapeHtml(prefix)}<b>${row.directive}</b>${escapeHtml(spacing)}` +
    `${escapeHtml(rest.slice(0, typePosition))}` +
    `<span class="type">${escapeHtml(requirement.type)}</span>` +
    `${escapeHtml(rest.slice(typePosition + requirement.type.length, namePosition))}` +
    link(requirement.name, moduleHref(record, edge.provider, `#${objectId(edge.exported.type, edge.exported.name)}`)) +
    `${escapeHtml(rest.slice(namePosition + requirement.name.length))}`;
}

function renderExport(record, row, prefix, spacing, rest) {
  const exported = record.exports.find((item) => item.line === row.line);
  if (!exported) return escapeHtml(`${prefix}${row.directive}${spacing}${rest}`);
  const typePosition = rest.indexOf(exported.type);
  const namePosition = rest.indexOf(exported.name, typePosition + exported.type.length);
  if (typePosition < 0 || namePosition < 0) {
    return escapeHtml(`${prefix}${row.directive}${spacing}${rest}`);
  }
  return `${escapeHtml(prefix)}<b>${row.directive}</b>${escapeHtml(spacing)}` +
    `${escapeHtml(rest.slice(0, typePosition))}` +
    `<span class="type">${escapeHtml(exported.type)}</span>` +
    `${escapeHtml(rest.slice(typePosition + exported.type.length, namePosition))}` +
    `<span id="${objectId(exported.type, exported.name)}">${escapeHtml(exported.name)}</span>` +
    `${escapeHtml(rest.slice(namePosition + exported.name.length))}`;
}

function renderUse(record, row, prefix, spacing, rest, graph) {
  const use = record.uses.find((item) => item.line === row.line);
  const selected = graph.modules.find((module) => module.location === use?.location);
  if (!use || !selected) return escapeHtml(`${prefix}${row.directive}${spacing}${rest}`);
  const locationPosition = rest.indexOf(use.location);
  const hashPosition = rest.lastIndexOf(use.sha256);
  if (locationPosition < 0 || hashPosition < locationPosition + use.location.length) {
    return escapeHtml(`${prefix}${row.directive}${spacing}${rest}`);
  }
  return `${escapeHtml(prefix)}<b>${row.directive}</b>${escapeHtml(spacing)}` +
    `${escapeHtml(rest.slice(0, locationPosition))}` +
    `${link(use.location, moduleHref(record, selected))}` +
    `${escapeHtml(rest.slice(locationPosition + use.location.length, hashPosition))}` +
    `${escapeHtml(use.sha256)}`;
}

function renderSourceReference(record, row, prefix, spacing, rest) {
  const source = record.sources.find((item) => item.line === row.line);
  if (!source) return escapeHtml(`${prefix}${row.directive}${spacing}${rest}`);
  const location = source.location;
  const before = rest.slice(0, rest.indexOf(location));
  const after = rest.slice(rest.indexOf(location) + location.length);
  return `${escapeHtml(prefix)}<b>${row.directive}</b>${escapeHtml(spacing + before)}` +
    `${link(location, rawHref(record, location))}${escapeHtml(after)}`;
}

function renderSlop(record, row, prefix, spacing, rest) {
  const slop = record.slops.find((item) => item.line === row.line);
  if (!slop) return escapeHtml(`${prefix}${row.directive}${spacing}${rest}`);
  const tool = slop.command[0];
  const edge = record.dependencies.find((item) =>
    item.requirement.type === "TOOL" && item.requirement.name === tool);
  const position = rest.indexOf(tool);
  if (!edge || position < 0) return `${escapeHtml(prefix)}<b>${row.directive}</b>${escapeHtml(spacing + rest)}`;
  return `${escapeHtml(prefix)}<b>${row.directive}</b>${escapeHtml(spacing + rest.slice(0, position))}` +
    link(tool, moduleHref(record, edge.provider, `#${objectId("TOOL", tool)}`)) +
    escapeHtml(rest.slice(position + tool.length));
}

function renderSource(record, graph) {
  const rows = new Map(record.rows.map((row) => [row.line, row]));
  return record.source.split("\n").map((value, index) => {
    const number = index + 1;
    const row = rows.get(number);
    let body = escapeHtml(value);
    if (row) {
      const match = /^(\s*)([A-Z][A-Z-]*)(\s+|$)(.*)$/.exec(value);
      if (match) {
        const [, prefix, directive, spacing, rest] = match;
        if (directive === "USE") body = renderUse(record, row, prefix, spacing, rest, graph);
        else if (directive === "REQUIRES") body = renderRequirement(record, row, prefix, spacing, rest);
        else if (directive === "EXPORTS") body = renderExport(record, row, prefix, spacing, rest);
        else if (directive === "SOURCE") body = renderSourceReference(record, row, prefix, spacing, rest);
        else if (directive === "SLOP") body = renderSlop(record, row, prefix, spacing, rest);
        else body = `${escapeHtml(prefix)}<b>${directive}</b>${escapeHtml(spacing + rest)}`;
      }
    } else if (/^\s*#/.test(value)) {
      body = `<span class="comment">${escapeHtml(value)}</span>`;
    }
    return `<span class="line" id="L${number}"><i>${number}</i>${body}</span>`;
  }).join("");
}

export function renderDollyfilePage(record, graph) {
  const appBase = record.kind === "image" ? "../../" : "../../../../";
  const title = record.kind === "image" ? record.image : record.name;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>${escapeHtml(title)} · Dollyfile</title>
  <style>
    @font-face { font-family: Dolly; src: url("${appBase}dist/IosevkaTerm-SemiBold.woff2"); font-weight: 600; }
    :root { color: #e8e3d7; background: #262626; font: 600 15px/1.5 Dolly, monospace; }
    * { box-sizing: border-box; } body { margin: 0; } a { color: #f2d45c; text-underline-offset: .2em; }
    main { width: 100%; }
    .type { color: #8fc5d8; } pre { overflow: auto; margin: 0; background: inherit; }
    code { display: block; min-width: max-content; } .line { display: block; min-height: 1.5em; padding-right: 1rem; }
    .line:target { background: #393621; } .line i { display: inline-block; width: 4rem; margin-right: 1rem; color: #77736c; font-style: normal; text-align: right; user-select: none; }
    b { color: #f2d45c; } .comment { color: #77736c; }
  </style>
</head>
<body><main><pre aria-label="${escapeHtml(record.relative)} source"><code>${renderSource(record, graph)}</code></pre></main></body></html>\n`;
}
