export const MAX_DOLLYFILE_BYTES = 128 * 1024;

const objectTypes = new Set([
  "TOOL", "LIB", "ENV", "FILE", "FOLDER", "HEADER",
]);
const sha256Pattern = /^[0-9a-f]{64}$/;

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
    else if (character === "#" && (index === 0 || /\s/.test(value[index - 1]))) {
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

function directives(source, label) {
  const physical = source.split("\n");
  const result = [];
  for (let index = 0; index < physical.length; index += 1) {
    const raw = physical[index];
    const line = index + 1;
    let logical = raw.trim();
    while (/\\\s*$/.test(logical)) {
      logical = logical.replace(/\\\s*$/, "");
      index += 1;
      if (index >= physical.length) fail(label, line, "unterminated continuation");
      logical += ` ${physical[index].trim()}`;
    }
    logical = stripComment(logical).trim();
    if (logical === "") continue;
    const match = /^(\S+)(?:\s+(.*))?$/.exec(logical);
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
  return value.startsWith("/") && value.length > 1 && value.length <= 4096 &&
    !value.includes("\\") && !value.includes("//") &&
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
  if (tokens[0] !== "ENV" && !/^(?:[a-zA-Z][a-zA-Z0-9._+-]*|\[)$/.test(tokens[1])) {
    fail(label, item.line, `invalid ${directive}`);
  }
}

function inspectVersion2(source, label, rows) {
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
  const selectedModules = new Set();
  const requiredObjects = new Set();
  let moduleForm = null;

  for (const item of rows.slice(1)) {
    const tokens = words(item.args, label, item.line);
    if (!image && !moduleName && !["IMAGE", "MODULE"].includes(item.directive)) {
      fail(label, item.line, "expected IMAGE or MODULE");
    }
    if (entry) fail(label, item.line, "ENTRY must be the final declaration");
    if (image && !["USE", "ENTRY"].includes(item.directive)) {
      fail(label, item.line, "IMAGE may only declare USE and ENTRY");
    }
    if (moduleName && item.directive === "REQUIRES" && moduleForm !== null) {
      fail(label, item.line, "REQUIRES must precede module composition and build declarations");
    }
    if (moduleName && item.directive === "USE") {
      if (moduleForm === "leaf") {
        fail(label, item.line, "a leaf MODULE cannot also USE child modules");
      }
      moduleForm = "aggregate";
    }
    if (moduleName && ["SOURCE", "FILE", "FOLDER", "SLOP"].includes(item.directive)) {
      if (moduleForm === "aggregate") {
        fail(label, item.line, "an aggregate MODULE cannot contain build steps");
      }
      moduleForm = "leaf";
    }
    if (moduleName && item.directive === "EXPORTS" && moduleForm === null) {
      moduleForm = "leaf";
    }
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
        if (selectedModules.has(tokens[1])) {
          fail(label, item.line, `duplicate USE ${tokens[1]}`);
        }
        selectedModules.add(tokens[1]);
        uses.push({ transport: tokens[0].toLowerCase(), location: tokens[1], sha256: tokens[2], line: item.line });
        break;
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
        if (image || tokens.length !== 2) fail(label, item.line, "invalid REQUIRES");
        if (requiredObjects.has(`${tokens[0]}:${tokens[1]}`)) {
          fail(label, item.line, `duplicate REQUIRES ${tokens[0]} ${tokens[1]}`);
        }
        requiredObjects.add(`${tokens[0]}:${tokens[1]}`);
        requirements.push({ type: tokens[0], name: tokens[1], line: item.line });
        break;
      case "EXPORTS": {
        assertObject(tokens, label, item, "EXPORTS");
        const [type, name, ...details] = tokens;
        if (uses.length !== 0) {
          if (details.length !== 0) fail(label, item.line, "aggregate EXPORTS inherits its object");
        } else if (type === "TOOL") {
          if (details.length !== 0 && (details.length !== 1 || !sha256Pattern.test(details[0]))) fail(label, item.line, "invalid TOOL export");
        } else if (["LIB", "FILE", "FOLDER"].includes(type)) {
          if (details.length !== 1 || !validAbsolutePath(details[0]) ||
              forbiddenKeep(details[0])) fail(label, item.line, `invalid ${type} export`);
        } else if (type === "HEADER") {
          if (details.length !== 1 || !validAbsolutePath(details[0]) ||
              forbiddenKeep(details[0])) fail(label, item.line, "invalid HEADER export");
        } else if (type === "ENV") {
          if ((details.length !== 1 || details[0] === "APPEND") &&
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
        entry = tokens;
        break;
      case "DOLLY":
        fail(label, item.line, "DOLLY may only appear on the first line");
        break;
      default:
        fail(label, item.line, `unknown Dollyfile 2 directive ${item.directive}`);
    }
  }
  if (!image && !moduleName) throw new Error(`${label}: missing IMAGE or MODULE`);
  if (moduleName && entry) throw new Error(`${label}: MODULE may not declare ENTRY`);
  if (image && !entry) throw new Error(`${label}: IMAGE is missing ENTRY`);
  const names = new Set();
  for (const item of exports) {
    const key = `${item.type}:${item.name}`;
    if (names.has(key)) fail(label, item.line, `duplicate export ${item.type} ${item.name}`);
    names.add(key);
  }
  return {
    version: 2, kind: image ? "image" : "module", name: image ?? moduleName,
    image, module: moduleName, entry, uses, requirements, exports,
    sources, slops, files, folders, rows, source,
  };
}

export function inspectDollyfile(input, label = "Dollyfile") {
  const source = normalize(input, label);
  const rows = directives(source, label);
  if (rows.length === 0 || rows[0].directive !== "DOLLY" || rows[0].args !== "2") {
    throw new Error(`${label}:1: first declaration must be DOLLY 2`);
  }
  return inspectVersion2(source, label, rows);
}

export function sourceLink(source, applicationBase) {
  if (source.transport === "host") {
    if (!source.location.startsWith("/")) throw new Error("HOST source path must start with /");
    return new URL(source.location.slice(1), applicationBase).href;
  }
  return source.location;
}
