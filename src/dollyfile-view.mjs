export const MAX_DOLLYFILE_BYTES = 128 * 1024;

function fail(label, line, message) {
  throw new Error(`${label}:${line}: ${message}`);
}

function logicalLines(source, label) {
  if (typeof source !== "string") throw new TypeError(`${label}: Dollyfile must be text`);
  if (new TextEncoder().encode(source).byteLength > MAX_DOLLYFILE_BYTES || source.includes("\0")) {
    throw new Error(`${label}: invalid Dollyfile text`);
  }
  const physical = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const lines = [];
  let pending = "";
  let pendingLine = 0;
  for (let index = 0; index < physical.length; index += 1) {
    const raw = physical[index];
    if (!pending && /^\s*(?:#.*)?$/.test(raw)) continue;
    if (!pending) pendingLine = index + 1;
    const continued = /\\\s*$/.test(raw);
    const part = continued ? raw.replace(/\\\s*$/, "") : raw;
    pending += `${pending ? " " : ""}${part.trim()}`;
    if (!continued) {
      lines.push({ line: pendingLine, text: pending });
      pending = "";
    }
  }
  if (pending) fail(label, pendingLine, "unterminated continuation");
  return lines;
}

function words(value, label, line) {
  const result = [];
  let word = "";
  let quote = "";
  let escaped = false;
  let started = false;
  for (const character of value) {
    if (escaped) {
      word += character;
      escaped = false;
      started = true;
    } else if (character === "\\" && quote !== "'") {
      escaped = true;
      started = true;
    } else if (quote) {
      if (character === quote) quote = "";
      else word += character;
      started = true;
    } else if (character === "'" || character === '"') {
      quote = character;
      started = true;
    } else if (/\s/.test(character)) {
      if (started) {
        result.push(word);
        word = "";
        started = false;
      }
    } else {
      word += character;
      started = true;
    }
  }
  if (escaped || quote) fail(label, line, "unterminated quoted word");
  if (started) result.push(word);
  return result;
}

export function inspectDollyfile(source, label = "Dollyfile") {
  const lines = logicalLines(source, label);
  if (lines.length === 0 || lines[0].text !== "DOLLY 1") {
    throw new Error(`${label}:1: first declaration must be DOLLY 1`);
  }
  let image = null;
  let extendsImage = null;
  const sources = [];
  for (const item of lines.slice(1)) {
    const match = /^(\S+)(?:\s+(.*))?$/.exec(item.text);
    const directive = match[1];
    const args = match[2] ?? "";
    if (directive === "IMAGE") {
      if (image || !/^[a-z][a-z0-9-]{0,31}$/.test(args)) {
        fail(label, item.line, "invalid IMAGE");
      }
      image = args;
    } else if (directive === "EXTENDS") {
      if (extendsImage || !/^[a-z][a-z0-9-]{0,31}$/.test(args)) {
        fail(label, item.line, "invalid EXTENDS");
      }
      extendsImage = args;
    } else if (directive === "SOURCE") {
      const tokens = words(args, label, item.line);
      if (tokens.length !== 6 || !["HOST", "URL"].includes(tokens[0]) ||
          !["BIN", "TXT"].includes(tokens[1]) || tokens[4] !== "SHA256" ||
          !/^[0-9a-f]{64}$/.test(tokens[5])) {
        fail(label, item.line, "invalid SOURCE metadata");
      }
      sources.push({
        transport: tokens[0].toLowerCase(),
        media: tokens[1].toLowerCase(),
        location: tokens[2],
        destination: tokens[3],
        sha256: tokens[5],
        line: item.line,
      });
    } else if (directive === "DECLARE") {
      fail(label, item.line, "DECLARE is not part of Dollyfile version 1");
    }
  }
  if (!image) throw new Error(`${label}: missing IMAGE`);
  return { image, extends: extendsImage, sources, source };
}

export function sourceLink(source, applicationBase) {
  if (source.transport === "host") {
    if (!source.location.startsWith("/")) throw new Error("HOST source path must start with /");
    return new URL(source.location.slice(1), applicationBase).href;
  }
  return source.location;
}
