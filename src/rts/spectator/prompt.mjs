// SPDX-License-Identifier: GPL-2.0-or-later
import { dialog } from "./picker.mjs";

export function createPrompt(ui, label, { secret = false, fallback = "", note = "", validate } = {}, select, cancel) {
  const input = new ui.Input(), display = secret ? new ui.Input() : input;
  let error = "";
  input.onSubmit = value => {
    const answer = value.trim() || fallback;
    error = validate?.(answer) || "";
    if (!error) select(answer);
  };
  input.onEscape = cancel;
  return {
    get focused() { return input.focused; },
    set focused(value) { input.focused = display.focused = value; },
    invalidate() { display.invalidate(); },
    handleInput(data) { error = ""; input.handleInput(data); },
    render(width) {
      if (secret) {
        display.setValue("*".repeat(input.getValue().length));
        display.cursor = input.cursor;
      }
      const text = value => new ui.Text(value, 0, 0).render(width);
      return [...text(`\x1b[33m${label}\x1b[39m`),
        ...text("Ctrl+Shift+V paste · Ctrl+U clear · Enter confirm · Esc back"),
        ...(note ? text(note) : []), ...(fallback ? text(`Current: ${fallback} · Enter keeps it`) : []),
        "", ...display.render(width), "", ...(error ? text(error) : [])];
    },
  };
}

export const ask = (label, options) =>
  dialog((ui, select, cancel) => createPrompt(ui, label, options, select, cancel));
