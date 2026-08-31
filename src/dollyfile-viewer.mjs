import { DOLLY_IMAGES } from "../dist/dolly-images.mjs";

const configuration = globalThis.DOLLY_VIEW;
const definition = DOLLY_IMAGES.find((candidate) => candidate.image === configuration?.image);
if (!definition) throw new Error("unknown Dolly image");

const title = document.querySelector("#title");
const output = document.querySelector("#source");
const error = document.querySelector("#error");
title.textContent = `${definition.dollyfile} · ${definition.image}`;
document.title = `${definition.dollyfile} · Dolly`;

function text(value, className) {
  const node = document.createElement("span");
  node.textContent = value;
  if (className) node.className = className;
  return node;
}

function renderLine(value, number) {
  const line = document.createElement("span");
  line.className = "line";
  line.dataset.line = String(number);
  if (/^\s*#/.test(value)) {
    line.append(text(value, "comment"));
    return line;
  }
  const directive = /^(\s*)([A-Z][A-Z-]*)(\s+|$)/.exec(value);
  if (!directive) {
    line.textContent = value;
    return line;
  }
  line.append(directive[1], text(directive[2], "directive"), directive[3]);
  const rest = value.slice(directive[0].length);
  if (directive[2] === "SOURCE") {
    const source = /^(HOST|URL)\s+(BIN|TXT)\s+(\S+)(.*)$/.exec(rest);
    if (source) {
      line.append(`${source[1]} ${source[2]} `);
      const anchor = document.createElement("a");
      anchor.textContent = source[3];
      anchor.href = source[1] === "HOST"
        ? new URL(source[3].slice(1), new URL(configuration.base, location.href)).href
        : source[3];
      if (source[2] === "BIN") anchor.download = source[3].split("/").at(-1) || "source.bin";
      line.append(anchor, source[4]);
      return line;
    }
  } else if (directive[2] === "EXTENDS") {
    const parent = DOLLY_IMAGES.find((candidate) => candidate.image === rest.trim());
    if (parent) {
      const anchor = document.createElement("a");
      anchor.textContent = rest.trim();
      anchor.href = new URL(`view/${parent.image}/`, new URL(configuration.base, location.href)).href;
      line.append(anchor);
      return line;
    }
  }
  line.append(rest);
  return line;
}

try {
  const base = new URL(configuration.base, location.href);
  const response = await fetch(new URL(definition.dollyfile, base), {
    cache: "no-store",
    credentials: "same-origin",
    redirect: "error",
  });
  if (!response.ok) throw new Error(`${definition.dollyfile} returned HTTP ${response.status}`);
  const source = await response.text();
  const fragment = document.createDocumentFragment();
  source.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n")
    .forEach((line, index) => fragment.append(renderLine(line, index + 1)));
  output.append(fragment);
} catch (cause) {
  error.hidden = false;
  error.textContent = cause instanceof Error ? cause.message : String(cause);
}
