import { holdIndicators, indicatorCorner } from "./page-indicators.mjs";

// What the HTTP policy refuses, for whoever runs the page: each refusal is a line in the
// browser's console, and a notice in boot()'s element that stays until the user closes it.
// Refusals of one method and URL are one notice with a count; the newest few show, with a
// line for the rest and Close all. A URL is shown without its query, which may hold a key.
// The list is one of the page's indicators, in the top right corner with the alert's border,
// and holds them shown while it has a notice; its words let the pointer through to the
// program, and only its buttons take a click.
const shownAtOnce = 5;

export function refusalNotices(mount, keyboard) {
  const notices = new Map();
  let list;
  if (mount) {
    list = indicatorCorner(mount, "top-right").appendChild(document.createElement("ul"));
    Object.assign(list, { id: "http-refusals", className: "page-indicator", hidden: true });
    Object.assign(list.style, { borderColor: "var(--dolly-ui-alert)", maxWidth: "min(34rem, 100%)" });
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
      words.style.color = "var(--dolly-ui-quiet)";
      rest.append(words, button("Close all", "Close all refusals", () => notices.clear()));
      list.append(rest);
    }
    list.hidden = notices.size === 0;
    holdIndicators("http-refusals", !list.hidden);
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
      if (list) holdIndicators("http-refusals", false);
      list?.remove();
    },
  };
}
