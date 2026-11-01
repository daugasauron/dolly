import { DOLLY_ERRNO as E, DOLLY_HTML_OPEN, DOLLY_HTML_ANSWER, DOLLY_HTML_CLOSE, DOLLY_HTML_DOCUMENT_MAX,
  DOLLY_HTML_FIELDS_MAX } from "./abi.mjs";
export { DOLLY_HTML_ABI_DIGEST as digest } from "./abi.mjs";

// After the user closes a popup, the next is refused for this long, so the
// user reaches the terminal (and Ctrl+C) before a program shows another.
const quietMilliseconds = 2000;

// The popup's look is the page's: an embedding sets these on boot()'s element
// (or above it) in its own style sheet; unset, they are Dolly's. A font file,
// --dolly-html-font-file: url(…), is the font the first family names.
const themeProperties = Object.freeze({
  "--dolly-html-background": "#262626",
  "--dolly-html-color": "#e8e3d7",
  "--dolly-html-accent": "#f2d45c",
  "--dolly-html-font": "ui-monospace, monospace",
  "--dolly-html-color-scheme": "dark",
});

// The popup's document: a program's styles are left out, so this is all of it.
const popupStyle = `
  :root { color-scheme: var(--dolly-html-color-scheme); accent-color: var(--dolly-html-accent);
    --line: color-mix(in srgb, var(--dolly-html-color) 35%, var(--dolly-html-background));
    --panel: color-mix(in srgb, var(--dolly-html-color) 9%, var(--dolly-html-background));
    color: var(--dolly-html-color); background: var(--dolly-html-background); font: 16px/1.5 var(--dolly-html-font); }
  body { margin: 0; padding: 1.25rem 1.5rem; overflow-wrap: anywhere; }
  body > :first-child { margin-top: 0; }
  h1, h2, h3, h4, h5, h6 { margin: 1.4em 0 0.5em; color: var(--dolly-html-accent); font-size: 1rem; line-height: 1.3; }
  h1 { font-size: 1.5rem; } h2 { font-size: 1.25rem; } h3 { font-size: 1.1rem; }
  p, ul, ol, dl, pre, blockquote, table, fieldset, details, figure { margin: 0 0 1rem; }
  ul, ol { padding-left: 1.6rem; } dt { font-weight: bold; } dd { margin-left: 1.6rem; }
  table { border-collapse: collapse; } caption { padding-bottom: 0.4rem; text-align: left; }
  th, td { padding: 0.3rem 0.7rem; border: 1px solid var(--line); text-align: left; vertical-align: top; }
  th { background: var(--panel); }
  pre, code, kbd, samp { font-family: inherit; } pre { padding: 0.7rem 0.9rem; overflow: auto; background: var(--panel); }
  blockquote { margin-left: 0; padding-left: 1rem; border-left: 3px solid var(--line); }
  hr { border: 0; border-top: 1px solid var(--line); }
  mark { color: var(--dolly-html-background); background: var(--dolly-html-accent); }
  summary { cursor: pointer; }
  fieldset { padding: 0.75rem 1rem; border: 1px solid var(--line); } legend { padding: 0 0.4rem; }
  label { display: inline-block; margin: 0.2rem 0; }
  input, select, textarea, button { margin: 0.2rem 0; padding: 0.3rem 0.5rem; color: inherit; background: var(--panel);
    border: 1px solid var(--line); border-radius: 0; font: inherit; }
  input[type=checkbox], input[type=radio], input[type=range], input[type=color] { padding: 0; }
  textarea { display: block; width: 100%; box-sizing: border-box; }
  button, input[type=submit], input[type=reset] { padding: 0.35rem 1.1rem; cursor: pointer; }
  button:not([type=reset]):not([type=button]), input[type=submit] { border-color: var(--dolly-html-accent); }
  :focus-visible { outline: 2px solid var(--dolly-html-accent); outline-offset: 1px; }
  :user-invalid { border-color: #e07a5f; }
`;

// The page's one script in the popup's frame, given the document as a string
// and run before anything else there. It builds the popup from the document's
// text and the elements and attributes below, copied into new elements of its
// own: the document is never parsed in a page that could load or navigate,
// and nothing else of it exists in the popup. It reports a submitted form's
// fields and Escape to the page.
function popup({ source, theme, font, origin }) {
  const shown = new Set(("h1 h2 h3 h4 h5 h6 p br hr div span section article header footer main aside nav " +
    "blockquote pre code kbd samp var em strong b i u s small mark sub sup abbr cite q dfn time data del ins " +
    "figure figcaption address ul ol li dl dt dd table caption colgroup col thead tbody tfoot tr th td " +
    "details summary form fieldset legend label input button select option optgroup textarea output progress meter")
    .split(" "));
  // Shown without the element: an unknown element's text stays, these go with theirs.
  const dropped = new Set("head title script style template noscript iframe object embed video audio canvas datalist".split(" "));
  const attributes = {
    "*": ["id", "title", "lang", "dir"],
    ol: ["start", "reversed", "type"], li: ["value"], col: ["span"], colgroup: ["span"],
    th: ["colspan", "rowspan", "headers", "scope", "abbr"], td: ["colspan", "rowspan", "headers"],
    time: ["datetime"], data: ["value"], del: ["datetime"], ins: ["datetime"], details: ["open"],
    form: ["novalidate"], fieldset: ["name", "disabled"], label: ["for"], output: ["name", "for", "form"],
    input: ["type", "name", "value", "checked", "disabled", "readonly", "required", "min", "max", "step",
      "minlength", "maxlength", "placeholder", "size", "multiple", "inputmode", "form"],
    button: ["type", "name", "value", "disabled", "form"], select: ["name", "multiple", "required", "disabled", "size", "form"],
    option: ["value", "selected", "disabled", "label"], optgroup: ["label", "disabled"],
    textarea: ["name", "rows", "cols", "placeholder", "required", "readonly", "disabled", "minlength", "maxlength", "wrap", "form"],
    progress: ["value", "max"], meter: ["value", "min", "max", "low", "high", "optimum"],
  };
  // Controls of other types are left out: a password field would invite the
  // browser to fill one in, a file field to choose a file, an image to load
  // one, and a plain button does nothing without a script.
  const types = { input: new Set(("text search email url tel number range date month week time datetime-local " +
    "color checkbox radio hidden submit reset").split(" ")), button: new Set(["submit", "reset"]) };
  const copy = (from, to) => {
    for (const node of from.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) to.append(node.data);
      if (node.nodeType !== Node.ELEMENT_NODE || node.namespaceURI !== "http://www.w3.org/1999/xhtml" ||
          dropped.has(node.localName)) continue;
      if (!shown.has(node.localName)) { copy(node, to); continue; }
      const type = node.getAttribute("type")?.toLowerCase();
      if (types[node.localName] && type !== undefined && !types[node.localName].has(type)) continue;
      const element = document.createElement(node.localName);
      for (const name of [...attributes["*"], ...attributes[node.localName] ?? []]) {
        if (node.hasAttribute(name)) element.setAttribute(name, node.getAttribute(name));
      }
      copy(node, element);
      to.append(element);
    }
  };
  document.currentScript.remove();
  copy(new DOMParser().parseFromString(source, "text/html").body, document.body);
  for (const [name, value] of Object.entries(theme)) document.documentElement.style.setProperty(name, value);
  if (font) document.fonts.add(new FontFace(theme["--dolly-html-font"].split(",")[0].trim().replace(/^(["'])(.*)\1$/, "$2"),
    Uint8Array.from(atob(font), character => character.charCodeAt(0))));
  document.addEventListener("submit", event => {
    event.preventDefault();
    parent.postMessage({ fields: String(new URLSearchParams(new FormData(event.target, event.submitter))) }, origin);
  });
  addEventListener("keydown", event => { if (event.key === "Escape") parent.postMessage({ close: true }, origin); });
  document.querySelector("input:not([type=hidden]), select, textarea, button")?.focus();
}

// The frame: an opaque origin (no allow-same-origin) that may run the page's
// script (its nonce) and submit forms to it, and fetches nothing, as its
// policy says. Without allow-popups, allow-top-navigation or allow-modals it
// opens nothing and navigates no other page.
function frameSource({ source, theme, font }) {
  const nonce = crypto.randomUUID();
  const policy = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; form-action 'none'; base-uri 'none'`;
  const literal = JSON.stringify({ source, theme, font, origin: location.origin }).replaceAll("<", "\\u003c");
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy}">` +
    `<style nonce="${nonce}">${popupStyle}</style></head><body><script nonce="${nonce}">(${popup})(${literal})</script></body></html>`;
}

const pageStyle = `
  #html-popup { position: absolute; inset: 0; z-index: 8; display: flex; align-items: center; justify-content: center;
    padding: 1rem; background: rgb(0 0 0 / 0.55); }
  #html-popup > div { display: flex; flex-direction: column; width: min(56rem, 100%); height: 100%; max-height: 48rem;
    background: var(--dolly-html-background, ${themeProperties["--dolly-html-background"]});
    border: 1px solid var(--dolly-html-accent, ${themeProperties["--dolly-html-accent"]}); }
  #html-popup button { align-self: flex-end; margin: 0.3rem; padding: 0.2rem 0.9rem;
    color: var(--dolly-html-color, ${themeProperties["--dolly-html-color"]}); background: transparent;
    border: 1px solid currentColor; font: 14px/1.5 var(--dolly-html-font, ${themeProperties["--dolly-html-font"]}); cursor: pointer; }
  #html-popup iframe { flex: 1; width: 100%; border: 0; }
`;

// The embedding's font file, as base64, fetched once by the page: the popup fetches nothing.
const fontFiles = new Map();
function fontFile(style) {
  const location = /^url\(\s*(["']?)(.+)\1\s*\)$/.exec(style.getPropertyValue("--dolly-html-font-file").trim())?.[2];
  if (!location) return null;
  const url = new URL(location, document.baseURI).href;
  if (!fontFiles.has(url)) fontFiles.set(url, fetch(url).then(response => response.ok ? response.arrayBuffer() : null).then(buffer => {
    if (!buffer) return null;
    const bytes = new Uint8Array(buffer);
    let text = "";
    for (let offset = 0; offset < bytes.length; offset += 32768) text += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return btoa(text);
  }).catch(() => null));
  return fontFiles.get(url);
}

// The page shows one popup in boot()'s element, over the terminal, until the
// user submits a form of it or closes it (its Close button, or Escape), or
// the program withdraws it.
export function browser({ mount, keyboard, send }) {
  const look = document.head.appendChild(Object.assign(document.createElement("style"), { textContent: pageStyle }));
  let shown = null;
  function remove() {
    shown?.element?.remove();
    shown = null;
    keyboard?.focus({ preventScroll: true });
  }
  function answer(fields) {
    send({ type: "html-answer", popup: shown.popup, fields });
    remove();
  }
  function received(event) {
    if (!shown?.frame || event.source !== shown.frame.contentWindow) return;
    const { fields, close } = event.data ?? {};
    if (close === true) answer(null);
    else if (typeof fields === "string" && fields.length <= DOLLY_HTML_FIELDS_MAX) answer(fields);
  }
  addEventListener("message", received);
  return {
    messages: {
      async "html-show"({ popup, document: source }) {
        if (!Number.isSafeInteger(popup) || typeof source !== "string") throw new Error("Dolly supplied an invalid popup");
        if (shown) remove();
        const style = getComputedStyle(mount);
        const theme = Object.fromEntries(Object.entries(themeProperties)
          .map(([name, fallback]) => [name, style.getPropertyValue(name).trim() || fallback]));
        // The program may withdraw the popup while the font is fetched.
        shown = { popup };
        const font = await fontFile(style);
        if (shown?.popup !== popup) return;
        const element = document.createElement("div"), box = document.createElement("div");
        const close = Object.assign(document.createElement("button"), { type: "button", textContent: "Close" });
        const frame = Object.assign(document.createElement("iframe"), { title: "A page a program in Dolly shows" });
        element.id = "html-popup";
        element.setAttribute("role", "dialog");
        element.setAttribute("aria-label", "A page a program in Dolly shows");
        frame.setAttribute("sandbox", "allow-scripts allow-forms");
        frame.srcdoc = frameSource({ source, theme, font });
        close.addEventListener("click", () => answer(null));
        element.addEventListener("keydown", event => { if (event.key === "Escape") answer(null); });
        box.append(close, frame);
        element.append(box);
        shown = { popup, element, frame };
        mount.append(element);
        frame.focus();
      },
      "html-close"({ popup }) { if (shown?.popup === popup) remove(); },
    },
    // The popup's keys are its own; Ctrl+C there still interrupts the program.
    claimsKey: event => shown?.element?.contains(event.target) ? "interrupt" : false,
    dispose() { shown?.element?.remove(); shown = null; look.remove(); removeEventListener("message", received); },
  };
}

// The Worker holds the popup shown and what the user did with it, which the
// kernel's ANSWER takes once.
export function worker({ send, get }) {
  const decode = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  const encode = new TextEncoder();
  let shown = null, popups = 0, quietUntil = 0;
  return {
    messages: {
      "html-answer"({ popup, fields }) {
        if (shown?.popup !== popup || "fields" in shown || fields !== null && typeof fields !== "string") return;
        shown.fields = fields;
        if (fields === null) quietUntil = performance.now() + quietMilliseconds;
        get("runtime").serviceDeferred();
      },
    },
    bindings: { "env.dolly_html_dispatch": (operation, address, length) => {
      const memory = get("runtime").memory.buffer;
      const [start, size] = [address, length].map(Number);
      if (![start, size].every(Number.isSafeInteger) || start < 0 || size < 0 ||
          start > memory.byteLength - size) return -E.EINVAL;
      if (operation === DOLLY_HTML_OPEN) {
        if (size < 1 || size > DOLLY_HTML_DOCUMENT_MAX) return -E.EINVAL;
        if (shown) return -E.EBUSY;
        if (performance.now() < quietUntil) return -E.ECANCELED;
        let document;
        try { document = decode.decode(new Uint8Array(memory, start, size).slice()); }
        catch { return -E.EILSEQ; }
        shown = { popup: ++popups };
        send({ type: "html-show", popup: shown.popup, document });
        return 0;
      }
      if (!shown) return -E.EBADF;
      if (operation === DOLLY_HTML_ANSWER) {
        if (!("fields" in shown)) return -E.EAGAIN;
        const { fields } = shown;
        shown = null;
        if (fields === null) return -E.ECANCELED;
        const bytes = encode.encode(fields);
        if (bytes.length > Math.min(size, DOLLY_HTML_FIELDS_MAX)) return -E.EMSGSIZE;
        new Uint8Array(memory, start, bytes.length).set(bytes);
        return bytes.length;
      }
      if (operation !== DOLLY_HTML_CLOSE || size !== 0) return -E.EINVAL;
      send({ type: "html-close", popup: shown.popup });
      shown = null;
      return 0;
    } },
  };
}
