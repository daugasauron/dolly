// SPDX-License-Identifier: GPL-2.0-or-later
export function createPicker(ui, title, items, select, cancel, note = "", initialValue) {
  const yellow = text => `\x1b[33m${text}\x1b[39m`, plain = text => text;
  const theme = { selectedPrefix: yellow, selectedText: yellow, description: plain,
    scrollInfo: plain, noMatch: () => "  No matches — edit your search" };
  const input = new ui.Input();
  let matches, list, visible = 8;
  const rebuild = () => {
    matches = ui.fuzzyFilter(items, input.getValue(), item => item.search ?? `${item.value} ${item.label}`);
    list = new ui.SelectList(matches, visible, theme, { minPrimaryColumnWidth: 24, maxPrimaryColumnWidth: 65 });
  };
  rebuild();
  if (initialValue !== undefined) list.setSelectedIndex(items.findIndex(item => item.value === initialValue));
  input.onSubmit = () => { const item = list.getSelectedItem(); if (item) select(item); };
  input.onEscape = cancel;
  return {
    get focused() { return input.focused; },
    set focused(value) { input.focused = value; },
    invalidate() { input.invalidate(); list.invalidate(); },
    handleInput(data) {
      const kb = ui.getKeybindings();
      if (kb.matches(data, "tui.select.up") || kb.matches(data, "tui.select.down")) list.handleInput(data);
      else {
        const previous = input.getValue();
        input.handleInput(data);
        if (input.getValue() !== previous) rebuild();
      }
    },
    render(width) {
      const notes = note ? new ui.Text(note, 0, 0).render(width) : [];
      const rows = Math.max(1, Math.min(8, (process.stdout.rows || 24) - 12 - notes.length));
      if (rows !== visible) {
        const selected = list.getSelectedItem();
        visible = rows; rebuild(); list.setSelectedIndex(matches.indexOf(selected));
      }
      const line = text => ui.truncateToWidth(text, width);
      return [line(yellow(title)), line("Type to search · ↑/↓ select · Enter confirm · Esc back"),
        ...notes, "", ...input.render(width), "",
        ...list.render(width), "", line(`${matches.length} / ${items.length} matches`),
        ...new ui.Text(list.getSelectedItem()?.detail ?? "", 0, 0).render(width)];
    },
  };
}

export async function dialog(create) {
  const ui = await import("/usr/lib/node_modules/@earendil-works/pi-tui/dist/index.js");
  const terminal = new ui.ProcessTerminal();
  const tui = new ui.TuiAltScreen(terminal, true, undefined, { mouse: false });
  let end;
  try {
    return await new Promise((resolve, reject) => {
      const component = create(ui, resolve, () => resolve(undefined));
      end = () => reject(Error("Input closed"));
      process.stdin.once("end", end);
      tui.addChild(component); tui.setFocus(component); tui.start();
    });
  } finally {
    process.stdin.removeListener("end", end);
    tui.stop(); process.stdin.pause();
  }
}

export const pick = (title, items, note, initialValue) =>
  dialog((ui, select, cancel) => createPicker(ui, title, items, select, cancel, note, initialValue));
