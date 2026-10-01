import { hostRequirement, hostRequirements } from "../host/requirements.mjs";

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

function physicalLines(source, label) {
  if (typeof source !== "string") throw new TypeError(`${label}: Dollyfile must be text`);
  if (byteLength(source) > MAX_DOLLYFILE_BYTES || source.includes("\0")) {
    throw new Error(`${label}: invalid Dollyfile text`);
  }
  return source.split(/\r\n|\r|\n/);
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

function directives(physical, label) {
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
    logical = trim(logical);
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
    result.push({ line, endLine, directive, args, body });
  }
  return result;
}

function validAbsolutePath(value) {
  return value.startsWith("/") && value.length > 1 && byteLength(value) < 4096 &&
    !/[\\\r\n]/.test(value) && !value.endsWith("/") && !value.includes("//") &&
    !value.split("/").some((part) => part === "." || part === "..");
}

// SOURCE takes an absolute http(s) URL without a fragment. FROM, INSTALL, COPY
// and USE URLs also have a path and no query; their file is Dollyfile[-NAME]
// or NAME.dm.
const sourceURL = /^https?:\/\/[^/?#\\ \t\r\n\v\f]+(?:[/?][^#\\ \t\r\n\v\f]*)?$/;
const recipeURL = /^https?:\/\/[^/?#\\ \t\r\n\v\f]+\/[^?#\\ \t\r\n\v\f]*$/;
// A URL parser resolves empty, "." and ".." path segments (also spelled with
// %2e) to another path, so a recipe names only normalized paths.
function normalizedPath(url) {
  const path = url.split("?")[0].replace(/^https?:\/\/[^/]*/, "");
  return !path.includes("//") && !path.split("/").some(segment => /^(?:\.|%2e){1,2}$/i.test(segment));
}
// The file a recipe URL names, or "" when the value is not a recipe URL.
export const recipeFileName = url => recipeURL.test(url) && normalizedPath(url) ? url.slice(url.lastIndexOf("/") + 1) : "";
// Image and module names: [a-z][a-z0-9]*(-[a-z0-9]+|.[0-9]+)*, at most 32 bytes.
export const validName = name => /^[a-z][a-z0-9]*(?:-[a-z0-9]+|\.[0-9]+)*$/.test(name) && name.length <= 32;
// The image name a file "Dollyfile" or "Dollyfile-NAME" declares, or "".
export const imageFileName = file => file === "Dollyfile" ? "default" : file.startsWith("Dollyfile-") ? file.slice(10) : "";
export const moduleFileName = file => file.endsWith(".dm") ? file.slice(0, -3) : "";
const roles = { APPLICATION: "application", TOOLCHAIN: "toolchain", PACKAGE: "package", MODULE: "module" };

// No image retains scratch space or the bundled agent's credentials and sessions.
export function unretainedPath(value) {
  return [
    "/tmp", "/workspace", "/home/dolly/.pi/agent/auth.json",
    "/home/dolly/.pi/agent/sessions",
  ].some((prefix) => value === prefix || value.startsWith(`${prefix}/`));
}

function assertObject(tokens, label, item, directive) {
  if (tokens.length < 2 || !objectTypes.has(tokens[0])) {
    fail(label, item.line, `invalid ${directive}; expected ${directive} <${[...objectTypes].join("|")}> NAME`);
  }
  if (tokens[0] === "ENV" && !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(tokens[1])) {
    fail(label, item.line, `invalid ${directive} environment name`);
  }
  if (tokens[0] !== "ENV" && (tokens[1].length > 128 || !/^(?:[a-zA-Z][a-zA-Z0-9._+-]*|\[)$/.test(tokens[1]))) {
    fail(label, item.line, `invalid ${directive}`);
  }
}

function inspectRecipe(source, label, rows) {
  let role = null;
  let name = null;
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
  const image = () => role !== null && role !== "module";

  for (const item of rows.slice(1)) {
    const tokens = words(item.args, label, item.line);
    if (role === null && !(item.directive in roles)) {
      fail(label, item.line, "expected APPLICATION, TOOLCHAIN, PACKAGE or MODULE");
    }
    if (entry) fail(label, item.line, "ENTRY must be the final declaration");
    switch (item.directive) {
      case "APPLICATION":
      case "TOOLCHAIN":
      case "PACKAGE":
      case "MODULE":
        if (role || tokens.length !== 1 || !validName(tokens[0])) fail(label, item.line, `invalid ${item.directive}`);
        role = roles[item.directive];
        name = tokens[0];
        break;
      case "USE":
        if (tokens.length !== 2 || !validName(moduleFileName(recipeFileName(tokens[0]))) ||
            !sha256Pattern.test(tokens[1])) fail(label, item.line, "invalid USE");
        uses.push({ location: tokens[0], sha256: tokens[1], line: item.line });
        break;
      case "FROM":
      case "INSTALL":
      case "COPY": {
        const operation = item.directive.toLowerCase();
        if (tokens.length !== (operation === "copy" ? 4 : 2) ||
            !validName(imageFileName(recipeFileName(tokens[0]))) || !sha256Pattern.test(tokens[1]) ||
            tokens.slice(2).some(path => path !== "/" && !validAbsolutePath(path))) {
          fail(label, item.line, `invalid ${item.directive}`);
        }
        if (operation === "from" && (!image() || from || rows[2] !== item)) {
          fail(label, item.line, "FROM must be the first image operation");
        }
        const artifact = { location: tokens[0], sha256: tokens[1], line: item.line,
          source: tokens[2] ?? "/", destination: tokens[3] ?? "/", operation };
        artifacts.push(artifact);
        if (operation === "from") from = artifact;
        break;
      }
      case "SOURCE":
        if (tokens.length !== 3 || !sourceURL.test(tokens[0]) || !normalizedPath(tokens[0]) ||
            !sha256Pattern.test(tokens[1]) || !validAbsolutePath(tokens[2])) fail(label, item.line, "invalid SOURCE");
        sources.push({ location: tokens[0], sha256: tokens[1], destination: tokens[2], line: item.line });
        break;
      case "REQUIRES":
        if (tokens[0] === "HOST") {
          if (tokens.length !== 2) fail(label, item.line, "invalid REQUIRES HOST; expected REQUIRES HOST NAME@ABI");
          try { hostRequirement(tokens[1]); } catch (error) { fail(label, item.line, error.message); }
        } else assertObject(tokens, label, item, "REQUIRES");
        if (tokens.length !== 2) fail(label, item.line, "invalid REQUIRES");
        requirements.push({ type: tokens[0], name: tokens[1], line: item.line });
        break;
      case "EXPORTS": {
        assertObject(tokens, label, item, "EXPORTS");
        const [type, object, ...details] = tokens;
        if (type === "TOOL") {
          if (details.length !== 0) fail(label, item.line, "invalid TOOL export");
        } else if (type === "ENV") {
          if (!(details.length === 1 || (details.length === 2 && details[0] === "APPEND"))) {
            fail(label, item.line, "invalid ENV export");
          }
        } else if (details.length !== 1 || !validAbsolutePath(details[0]) || unretainedPath(details[0])) {
          fail(label, item.line, `invalid ${type} export`);
        }
        exports.push({ type, name: object, details, line: item.line });
        break;
      }
      case "FILE":
        if (tokens.length !== 1 || !validAbsolutePath(tokens[0])) fail(label, item.line, "invalid FILE");
        if (unretainedPath(tokens[0]) && !tokens[0].startsWith("/tmp/")) {
          fail(label, item.line, "FILE cannot retain mutable session state");
        }
        files.push({ path: tokens[0], body: item.body, line: item.line, endLine: item.endLine });
        break;
      case "FOLDER":
        if (tokens.length !== 1 || !validAbsolutePath(tokens[0]) ||
            unretainedPath(tokens[0])) fail(label, item.line, "invalid FOLDER");
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
        if (!command[0]) fail(label, item.line, "empty SLOP");
        slops.push({ cwd, command, line: item.line });
        break;
      }
      case "COMPILEC":
        if (tokens.length !== 2 || !tokens.every(path => validAbsolutePath(path))) {
          fail(label, item.line, "invalid COMPILEC");
        }
        break;
      case "ENTRY":
        if (!["application", "toolchain"].includes(role) || tokens.length === 0 || !validAbsolutePath(tokens[0])) {
          fail(label, item.line, "invalid ENTRY");
        }
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
        fail(label, item.line, `unknown directive ${item.directive}`);
    }
  }
  if (role === null) throw new Error(`${label}: missing APPLICATION, TOOLCHAIN, PACKAGE or MODULE`);
  if (role === "application" && !entry) throw new Error(`${label}: APPLICATION is missing ENTRY`);
  let required;
  try { required = hostRequirements(requirements.filter(item => item.type === "HOST").map(item => item.name)); }
  catch (error) { throw new Error(`${label}: ${error.message}`); }
  return {
    hostRequirements: required, role, kind: image() ? "image" : "module", name,
    image: image() ? name : null, entry, uses, requirements, exports, artifacts, from,
    sources, slops, files, folders, rows, source,
  };
}

export function inspectDollyfile(source, label = "Dollyfile") {
  const rows = directives(physicalLines(source, label), label);
  if (rows[0]?.directive !== "DOLLY" || rows[0].args !== "6") {
    throw new Error(`${label}:${rows[0]?.line ?? 1}: first declaration must be DOLLY 6`);
  }
  return inspectRecipe(source, label, rows);
}
