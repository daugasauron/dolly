// How the page's handle (docs/embedding.md) reads the terminal, over the page APIs of
// display@0, input@0 and the runtime: the screen's text is the terminal's own
// selection of every cell, made with pointer records.
export function terminalText(page) {
  // Resolves to true once predicate holds. When it never does, throws naming
  // description, or resolves to false without one.
  async function waitFor(predicate, description, attempts = 500) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (await predicate()) return true;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    if (description) throw new Error(`timed out waiting for ${description}`);
    return false;
  }

  // Shift keeps the reader's gestures the terminal's selection while a
  // program has asked for the mouse.
  const shifted = { shiftKey: true };

  // Selects the whole screen and reads the published selection. The press
  // drops an earlier selection, so the text read after it is this one's. A
  // program that enters or leaves the alternate screen between the press and
  // the drag leaves the gesture without a selection (an editor exiting), and
  // one that scrolls a region at the screen's top under it carries the
  // selection's start into the history, leaving more lines than the screen
  // has rows (Pi above voice's buttons). Either way the gesture is made again,
  // each time with a longer wait: a slow frame is not a broken gesture.
  async function visibleTerminalText() {
    const { transport, inputTransport } = page;
    for (const attempts of [25, 50, 100, 325]) {
      const geometry = transport.geometry();
      const dimensions = transport.dimensions();
      if (!geometry.cellWidth || !geometry.cellHeight || !dimensions.cols || !dimensions.rows) return "";
      const x = geometry.paddingX + Math.floor(geometry.cellWidth / 4);
      const y = geometry.paddingY + Math.floor(geometry.cellHeight / 2);
      const endX = x + (dimensions.cols - 1) * geometry.cellWidth, endY = y + (dimensions.rows - 1) * geometry.cellHeight;
      let selected;
      await inputTransport.pushPointer(x, y, 1, shifted);
      await waitFor(async () => await transport.copySelection() === null, "terminal selection reset");
      await inputTransport.pushPointer(endX, endY, 2, shifted);
      await inputTransport.pushPointer(endX, endY, 0, shifted);
      if (await waitFor(async () => (selected = await transport.copySelection()) !== null, null, attempts) &&
          selected.split("\n").length <= transport.dimensions().rows) return selected;
    }
    throw new Error("timed out waiting for a terminal selection of the screen");
  }

  // Resolves to the PID of a new foreground program in raw mode showing text
  // that matches pattern.
  async function waitForInteractiveTerminal(pattern, description, previousPid = 0) {
    const { transport, inputTransport, terminal } = page;
    let pid;
    await waitFor(async () => {
      pid = terminal.foregroundPid();
      if (pid <= 0 || pid === previousPid || terminal.foregroundInterruptible() ||
          transport.graphicsActive() || inputTransport.leased() || !inputTransport.inputIdle()) return false;
      const text = await visibleTerminalText();
      return terminal.foregroundPid() === pid && !terminal.foregroundInterruptible() && pattern.test(text);
    }, description, 6000);
    const geometry = transport.geometry();
    const x = geometry.paddingX + Math.floor(geometry.cellWidth / 2);
    const y = geometry.paddingY + Math.floor(geometry.cellHeight / 2);
    await inputTransport.pushPointer(x, y, 1, shifted);
    await inputTransport.pushPointer(x, y, 0, shifted);
    await waitFor(() => inputTransport.inputIdle(), "terminal selection cleanup");
    return pid;
  }

  return { visibleTerminalText, waitForInteractiveTerminal };
}
