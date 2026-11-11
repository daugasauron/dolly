// What the HTTP policy refuses, for whoever runs the page: each refusal is a line in the
// browser's console, and a notice in boot()'s element that stays until the user closes it.
// Refusals of one method and URL are one notice with a count; the newest few show, with a
// line for the rest and Close all. A URL is shown without its query, which may hold a key.
const shownAtOnce = 5;

const style = `
  #http-refusals { position: absolute; left: 0.6rem; top: 0.6rem; z-index: 7; width: min(34rem, calc(100% - 1.2rem));
    margin: 0; padding: 0.35rem 0.35rem 0; list-style: none; color: #e8e3d7; background: #262626; font-size: 14px; line-height: 1.4; }
  #http-refusals[hidden] { display: none; }
  #http-refusals li { display: flex; gap: 0.5rem; align-items: baseline; margin-bottom: 0.35rem; padding: 0.4rem 0.5rem;
    background: #262626; border: 1px solid #e98773; overflow-wrap: anywhere; }
  #http-refusals li span { flex: 1; }
  #http-refusals li.rest { border-color: #77736c; }
  #http-refusals button { color: inherit; background: #333; border: 1px solid #77736c; font: inherit; cursor: pointer; }
`;

export function refusalNotices(mount, keyboard) {
  const notices = new Map();
  let list, look;
  if (mount) {
    look = new CSSStyleSheet();
    look.replaceSync(style);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, look];
    list = mount.appendChild(Object.assign(document.createElement("ul"), { id: "http-refusals", hidden: true }));
    list.setAttribute("role", "status");
    list.setAttribute("aria-label", "Requests the HTTP policy refused");
  }
  const button = (label, name, press) => {
    const element = Object.assign(document.createElement("button"), { type: "button", textContent: label });
    element.setAttribute("aria-label", name);
    element.addEventListener("click", () => {
      press();
      render();
      keyboard?.focus({ preventScroll: true });
    });
    return element;
  };
  function render() {
    const newest = [...notices].reverse(), shown = newest.slice(0, shownAtOnce);
    list.replaceChildren(...shown.map(([key, { text, count }]) => {
      const item = document.createElement("li"), words = document.createElement("span");
      words.textContent = `The HTTP policy refused ${text}${count > 1 ? ` (${count} times)` : ""}`;
      item.append(words, button("×", `Close: ${text}`, () => notices.delete(key)));
      return item;
    }));
    if (notices.size > 1) {
      const rest = document.createElement("li"), words = document.createElement("span");
      rest.className = "rest";
      const hidden = notices.size - shown.length;
      words.textContent = hidden ? `${hidden} more refused (the console lists every one)` : "";
      rest.append(words, button("Close all", "Close all refusals", () => notices.clear()));
      list.append(rest);
    }
    list.hidden = notices.size === 0;
  }
  return {
    refused({ method, target, reason }) {
      const text = `${method} ${target.origin}${target.pathname}`;
      console.warn(`${reason}: ${text}`);
      if (!list) return;
      const notice = notices.get(text);
      notices.delete(text);
      notices.set(text, { text, count: (notice?.count ?? 0) + 1 });
      render();
    },
    claimsKey: event => list?.contains(event.target) ?? false,
    dispose() {
      list?.remove();
      if (look) document.adoptedStyleSheets = document.adoptedStyleSheets.filter(sheet => sheet !== look);
    },
  };
}
