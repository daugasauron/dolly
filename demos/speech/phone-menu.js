// This is a Pi extension for pi-phone: Pi's menu on Dolly's page (html@0),
// built from Pi's own state each time it opens. voice's one button types F12,
// which this takes for itself; what a choice needs of voice (listening,
// pressing Enter, its arrow keys) goes down the pipe voice gives Pi.
import { writeSync } from "node:fs";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { showHtml } from "./ask-user.js";

const menuKey = "\x1b[24~";
const voice = Number(process.env.VOICE_CONTROL_FD);
const tell = (line) => writeSync(voice, `${line}\n`);

// Pi's built-in commands, as its own editor completes them.
const builtinCommands = async () =>
  (await import(`${process.env.PI_PACKAGE_DIR}/dist/core/slash-commands.js`)).BUILTIN_SLASH_COMMANDS;
// The menu's own sections do these, and these are no use without a keyboard or a desktop.
const elsewhere = new Set(["model", "thinking", "login", "quit", "hotkeys", "copy", "share", "bug", "import"]);
// These open a list of Pi's that waits for the arrow keys.
const lists = new Set(["settings", "tree", "scoped-models", "fork", "resume", "logout", "login"]);

const escape = (text) => String(text).replace(/[&<>"]/g, (character) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
const button = (name, value, label, detail) =>
  `<button name="${name}" value="${escape(value)}">${escape(label)}${detail ? `<small>${escape(detail)}</small>` : ""}</button>`;
const section = (summary, body) => `<details><summary>${escape(summary)}</summary>${body}</details>`;
const group = (items, by) => items.reduce((groups, item) =>
  groups.set(by(item), [...groups.get(by(item)) ?? [], item]), new Map());

function menu(pi, ctx, builtins) {
  const model = ctx.model, level = pi.getThinkingLevel(), draft = ctx.ui.getEditorText().trim();
  const usage = ctx.getContextUsage();
  const state = [model ? ctx.modelRegistry.getProviderDisplayName(model.provider) : "Sign in to a provider below",
    `thinking ${level}`, usage?.percent != null ? `${Math.round(usage.percent)}% of context` : null].filter(Boolean).join(" · ");

  const actions = [button("do", "speak", "Speak"), draft && button("do", "send", "Send"),
    !ctx.isIdle() && button("do", "stop", "Stop"), draft && button("do", "clear", "Clear"),
    button("do", "keys", "Arrow keys")].filter(Boolean).join("");

  // OpenRouter's hundreds of models are grouped again by the maker the id begins with.
  const available = ctx.modelRegistry.getAvailable();
  const models = [...group(available, (each) => each.provider)].map(([provider, items]) => {
    const name = (each) => (each === model ? "✓ " : "") + each.id.slice(each.id.indexOf("/") + 1);
    const makers = group(items, (each) => each.id.includes("/") ? each.id.slice(0, each.id.indexOf("/")) : "");
    const list = (each) => `<nav>${each.map((item) => button("model", `${item.provider}/${item.id}`, name(item))).join("")}</nav>`;
    const body = makers.size > 1 ? [...makers].map(([maker, each]) => section(maker, list(each))).join("") : list(items);
    return section(`${ctx.modelRegistry.getProviderDisplayName(provider)} (${items.length})`, body);
  }).join("");

  const levels = model ? getSupportedThinkingLevels(model) : [level];
  const thinking = `<nav>${levels.map((each) => button("thinking", each, (each === level ? "✓ " : "") + each)).join("")}</nav>`;

  const commands = [...group([
    ...builtins.filter((each) => !elsewhere.has(each.name)).map((each) => ({ ...each, source: "Pi" })),
    ...pi.getCommands().map((each) => ({ ...each, source: { extension: "Extensions", prompt: "Prompts", skill: "Skills" }[each.source] ?? each.source })),
  ], (each) => each.source)].map(([source, items]) => section(source,
    `<nav>${items.map((each) => button("command", each.name, `/${each.name}`, each.description)).join("")}</nav>`)).join("");

  const providers = [...new Set(ctx.modelRegistry.getAll().map((each) => each.provider))].sort();
  const signIn = `<nav>${providers.map((provider) => button("login", provider,
    (ctx.modelRegistry.getProviderAuthStatus(provider).configured ? "✓ " : "") +
    ctx.modelRegistry.getProviderDisplayName(provider))).join("")}</nav>`;

  return `<h1>${escape(model?.id ?? "Pi")}</h1><p>${escape(state)}</p>${draft ? `<blockquote>${escape(draft)}</blockquote>` : ""}` +
    `<form><nav>${actions}</nav>` +
    (available.length ? section(`Model: ${model?.id ?? "none"}`, models) : "") +
    section(`Thinking: ${level}`, thinking) + section("Commands", commands) + section("Sign in", signIn) + "</form>";
}

// A command runs as typed: its name in the editor, then voice's Enter. One
// that wants an argument waits there for it, said or typed.
function run(ctx, builtins, name) {
  const builtin = builtins.find((each) => each.name === name);
  ctx.ui.setEditorText(`/${name}${builtin?.argumentHint ? " " : ""}`);
  if (builtin?.argumentHint) return;
  tell("type \\r");
  if (lists.has(name)) tell("page keys");
}

async function open(pi, ctx) {
  const builtins = await builtinCommands();
  const fields = await showHtml(menu(pi, ctx, builtins));
  if (!fields) return;
  const [[name, value] = []] = fields;
  if (name === "do") {
    if (value === "speak") tell("speak");
    if (value === "send") tell("type \\r");
    if (value === "stop") ctx.abort();
    if (value === "clear") ctx.ui.setEditorText("");
    if (value === "keys") tell("page keys");
  } else if (name === "model") {
    const [provider, ...id] = value.split("/");
    const model = ctx.modelRegistry.find(provider, id.join("/"));
    if (model && await pi.setModel(model)) ctx.ui.notify(`Model: ${value}`);
  } else if (name === "thinking") {
    pi.setThinkingLevel(value);
    ctx.ui.notify(`Thinking level: ${value}`);
  } else if (name === "command") run(ctx, builtins, value);
  else if (name === "login") {
    ctx.ui.setEditorText(`/login ${value}`);
    tell("type \\r");
    tell("page keys");
  }
}

export default function phoneMenu(pi) {
  if (!Number.isInteger(voice)) return;
  let unsubscribe, opened = false;
  pi.on("session_start", (_event, ctx) => {
    unsubscribe?.();
    unsubscribe = ctx.ui.onTerminalInput((data) => {
      if (data !== menuKey) return undefined;
      if (!opened) {
        opened = true;
        open(pi, ctx).catch((error) => ctx.ui.notify(`Menu: ${error.message}`, "error")).finally(() => { opened = false; });
      }
      return { consume: true };
    });
  });
}
