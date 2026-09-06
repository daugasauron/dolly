export const MAX_DOLLYFILE_BYTES = 128 * 1024;

const objectTypes = new Set([
  "TOOL", "LIB", "ENV", "FILE", "FOLDER", "HEADER",
]);
const sha256Pattern = /^[0-9a-f]{64}$/;
const whitespace = /[ \t\r\n\v\f]/;
const trim = value => value.replace(/^[ \t\r\n\v\f]+|[ \t\r\n\v\f]+$/g, "");
const byteLength = value => new TextEncoder().encode(value).byteLength;

function fail(label, line, message) {
  throw new Error(`${label}:${line}: ${message}`);
}

function normalize(source, label) {
  if (typeof source !== "string") throw new TypeError(`${label}: Dollyfile must be text`);
  if (new TextEncoder().encode(source).byteLength > MAX_DOLLYFILE_BYTES || source.includes("\0")) {
    throw new Error(`${label}: invalid Dollyfile text`);
  }
  return source.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function stripComment(value) {
  let quote = "";
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) escaped = false;
    else if (character === "\\" && quote !== "'") escaped = true;
    else if (quote) {
      if (character === quote) quote = "";
    } else if (character === "'" || character === '"') quote = character;
    else if (character === "#" && (index === 0 || whitespace.test(value[index - 1]))) {
      return value.slice(0, index);
    }
  }
  return value;
}

function words(value, label, line) {
  const result = [];
  let word = "";
  let quote = "";
  let escaped = false;
  let started = false;
  for (const character of value) {
    if (escaped) {
      if (quote === '"' && !['$', '`', '"', "\\"].includes(character)) word += "\\";
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
    } else if (whitespace.test(character)) {
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

function directives(source, label) {
  const physical = source.split("\n");
  const result = [];
  for (let index = 0; index < physical.length; index += 1) {
    const raw = physical[index];
    const line = index + 1;
    let logical = stripComment(raw).replace(/[ \t]+$/, "");
    while (logical.endsWith("\\")) {
      logical = logical.slice(0, -1);
      index += 1;
      if (index >= physical.length || index === physical.length - 1 && physical[index] === "") {
        fail(label, line, "unterminated continuation");
      }
      logical += `${logical.length ? " " : ""}${stripComment(physical[index]).replace(/[ \t]+$/, "")}`;
    }
    if (byteLength(logical) > 64 * 1024) fail(label, line, "logical line is too long");
    logical = trim(stripComment(logical));
    if (logical === "") continue;
    const match = /^([^ \t\r\n\v\f]+)(?:[ \t\r\n\v\f]+(.*))?$/s.exec(logical);
    const directive = match[1];
    const args = match[2] ?? "";
    let body = null;
    let endLine = index + 1;
    if (directive === "FILE") {
      const bodyLines = [];
      while (index + 1 < physical.length && physical[index + 1].startsWith("    ")) {
        index += 1;
        bodyLines.push(physical[index].slice(4));
        endLine = index + 1;
      }
      if (bodyLines.length) body = bodyLines.join("\n") + "\n";
    }
    result.push({ line, endLine, directive, args, body, text: logical });
  }
  return result;
}

function validAbsolutePath(value) {
  return value.startsWith("/") && value.length > 1 && byteLength(value) < 4096 &&
    !/[\\\r\n]/.test(value) && !value.endsWith("/") && !value.includes("//") &&
    !value.split("/").some((part) => part === "." || part === "..");
}

function validModuleLocator(value) {
  return /^\/modules\/[a-z][a-z0-9-]{0,63}\.dm$/.test(value);
}

function forbiddenKeep(value) {
  return [
    "/tmp", "/workspace", "/home/dolly/.pi/agent/auth.json",
    "/home/dolly/.pi/agent/sessions",
  ].some((prefix) => value === prefix || value.startsWith(`${prefix}/`));
}

function assertObject(tokens, label, item, directive) {
  if (tokens.length < 2 || !objectTypes.has(tokens[0])) {
    fail(label, item.line, `invalid ${directive}`);
  }
  if (tokens[0] === "ENV" && !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(tokens[1])) {
    fail(label, item.line, `invalid ${directive} environment name`);
  }
  if (tokens[0] !== "ENV" && (tokens[1].length > 128 || !/^(?:[a-zA-Z][a-zA-Z0-9._+-]*|\[)$/.test(tokens[1]))) {
    fail(label, item.line, `invalid ${directive}`);
  }
}

function inspectVersion3(source, label, rows) {
  let image = null;
  let moduleName = null;
  let entry = null;
  const uses = [];
  const requirements = [];
  const exports = [];
  const sources = [];
  const slops = [];
  const files = [];
  const folders = [];
  const artifacts = [];
  let from = null;

  for (const item of rows.slice(1)) {
    const tokens = words(item.args, label, item.line);
    if (!image && !moduleName && !["IMAGE", "MODULE"].includes(item.directive)) {
      fail(label, item.line, "expected IMAGE or MODULE");
    }
    if (entry) fail(label, item.line, "ENTRY must be the final declaration");
    switch (item.directive) {
      case "IMAGE":
        if (image || moduleName || tokens.length !== 1 ||
            !/^[a-z][a-z0-9-]{0,31}$/.test(tokens[0])) fail(label, item.line, "invalid IMAGE");
        image = tokens[0];
        break;
      case "MODULE":
        if (moduleName || image || tokens.length !== 1 ||
            !/^[a-z][a-z0-9-]{0,63}$/.test(tokens[0])) fail(label, item.line, "invalid MODULE");
        moduleName = tokens[0];
        break;
      case "USE":
        if (tokens.length !== 3 || tokens[0] !== "HOST" ||
            !validModuleLocator(tokens[1]) ||
            !sha256Pattern.test(tokens[2])) fail(label, item.line, "invalid USE");
        uses.push({ transport: tokens[0].toLowerCase(), location: tokens[1], sha256: tokens[2], line: item.line });
        break;
      case "FROM":
      case "COPY": {
        const copy = item.directive === "COPY";
        const args = copy ? tokens.slice(1) : tokens;
        if ((copy && tokens[0] !== "FROM") || args.length !== (copy ? 5 : 3) ||
            args[0] !== "HOST" || !/^\/Dollyfile(?:-[a-z][a-z0-9-]*)?$/.test(args[1]) ||
            !sha256Pattern.test(args[2]) || (copy &&
            args.slice(3).some(path => path !== "/" && !validAbsolutePath(path)))) {
          fail(label, item.line, `invalid ${item.directive}`);
        }
        if (!copy && (!image || from || rows[2] !== item)) {
          fail(label, item.line, "FROM must be the first IMAGE operation");
        }
        const artifact = { location: args[1], sha256: args[2], line: item.line,
          source: copy ? args[3] : "/", destination: copy ? args[4] : "/", copy };
        artifacts.push(artifact);
        if (!copy) from = artifact;
        break;
      }
      case "SOURCE":
        if (tokens.length !== 4 || !["HOST", "URL"].includes(tokens[0]) ||
            (tokens[0] === "HOST" && !validAbsolutePath(tokens[1])) ||
            (tokens[0] === "URL" &&
             (!/^https?:\/\//.test(tokens[1]) || tokens[1].includes("#"))) ||
            !validAbsolutePath(tokens[2]) ||
            !sha256Pattern.test(tokens[3])) fail(label, item.line, "invalid SOURCE");
        sources.push({ transport: tokens[0].toLowerCase(), location: tokens[1], destination: tokens[2], sha256: tokens[3], line: item.line });
        break;
      case "REQUIRES":
        assertObject(tokens, label, item, "REQUIRES");
        if (tokens.length !== 2) fail(label, item.line, "invalid REQUIRES");
        requirements.push({ type: tokens[0], name: tokens[1], line: item.line });
        break;
      case "EXPORTS": {
        assertObject(tokens, label, item, "EXPORTS");
        const [type, name, ...details] = tokens;
        if (type === "TOOL") {
          if (details.length !== 0 && (details.length !== 1 || !sha256Pattern.test(details[0]))) fail(label, item.line, "invalid TOOL export");
        } else if (["LIB", "FILE", "FOLDER", "HEADER"].includes(type)) {
          if (details.length !== 1 || !validAbsolutePath(details[0]) ||
              forbiddenKeep(details[0])) fail(label, item.line, `invalid ${type} export`);
        } else if (type === "ENV") {
          if (details.length > 1 &&
              !(details.length === 2 && details[0] === "APPEND")) {
            fail(label, item.line, "invalid ENV export");
          }
        }
        exports.push({ type, name, details, sha256: type === "TOOL" ? details[0] ?? null : null, line: item.line });
        break;
      }
      case "FILE":
        if (tokens.length !== 1 || !validAbsolutePath(tokens[0])) fail(label, item.line, "invalid FILE");
        if (forbiddenKeep(tokens[0]) && !tokens[0].startsWith("/tmp/")) {
          fail(label, item.line, "FILE cannot retain mutable session state");
        }
        files.push({ path: tokens[0], body: item.body, line: item.line, endLine: item.endLine });
        break;
      case "FOLDER":
        if (tokens.length !== 1 || !validAbsolutePath(tokens[0]) ||
            forbiddenKeep(tokens[0])) fail(label, item.line, "invalid FOLDER");
        folders.push({ path: tokens[0], line: item.line });
        break;
      case "SLOP": {
        let cwd = "/";
        let command = tokens;
        if (tokens[0] === "CWD") {
          if (tokens.length < 3 ||
              (tokens[1] !== "/" && !validAbsolutePath(tokens[1]))) {
            fail(label, item.line, "invalid SLOP CWD");
          }
          cwd = tokens[1];
          command = tokens.slice(2);
        }
        if (command.length === 0) fail(label, item.line, "empty SLOP");
        slops.push({ cwd, command, line: item.line });
        break;
      }
      case "ENTRY":
        if (entry || tokens.length === 0 || !validAbsolutePath(tokens[0])) fail(label, item.line, "invalid ENTRY");
        if (tokens.length > 256 || tokens.some(word => byteLength(word) > 4096) ||
            tokens.reduce((size, word) => size + 4 + byteLength(word), 16) > 64 * 1024) {
          fail(label, item.line, "ENTRY exceeds its record limits");
        }
        entry = tokens;
        break;
      case "DOLLY":
        fail(label, item.line, "DOLLY may only appear on the first line");
        break;
      default:
        fail(label, item.line, `unknown Dollyfile 3 directive ${item.directive}`);
    }
  }
  if (!image && !moduleName) throw new Error(`${label}: missing IMAGE or MODULE`);
  if (moduleName && entry) throw new Error(`${label}: MODULE may not declare ENTRY`);
  if (image && !entry) throw new Error(`${label}: IMAGE is missing ENTRY`);
  return {
    version: 3, kind: image ? "image" : "module", name: image ?? moduleName,
    image, module: moduleName, entry, uses, requirements, exports, artifacts, from,
    sources, slops, files, folders, rows, source,
  };
}

export function inspectDollyfile(input, label = "Dollyfile") {
  const source = normalize(input, label);
  const rows = directives(source, label);
  if (rows.length === 0 || rows[0].directive !== "DOLLY" || rows[0].args !== "3") {
    throw new Error(`${label}:1: first declaration must be DOLLY 3`);
  }
  return inspectVersion3(source, label, rows);
}

export function sourceLink(source, applicationBase) {
  if (source.transport === "host") {
    if (!source.location.startsWith("/")) throw new Error("HOST source path must start with /");
    return new URL(source.location.slice(1), applicationBase).href;
  }
  return source.location;
}
