// What tests and recordings read a terminal page with, over the page APIs of
// display@0, input@0 and the runtime: the screen's text is the terminal's own
// selection of every cell, made with pointer records.
export function terminalText(page) {
  async function waitFor(predicate, description, attempts = 500) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (await predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error(`timed out waiting for ${description}`);
  }

  // Selects the whole screen and reads the published selection. The press
  // drops an earlier selection, so the text read after it is this one's.
  async function visibleTerminalText() {
    const { transport, inputTransport } = page;
    const geometry = transport.geometry();
    const dimensions = transport.dimensions();
    if (!geometry.cellWidth || !geometry.cellHeight || !dimensions.cols || !dimensions.rows) return "";
    const x = geometry.paddingX + Math.floor(geometry.cellWidth / 4);
    const y = geometry.paddingY + Math.floor(geometry.cellHeight / 2);
    const endX = x + (dimensions.cols - 1) * geometry.cellWidth, endY = y + (dimensions.rows - 1) * geometry.cellHeight;
    let selected;
    inputTransport.pushPointer(x, y, 1, {});
    await waitFor(() => transport.copySelection() === null, "terminal selection reset");
    inputTransport.pushPointer(endX, endY, 2, {});
    inputTransport.pushPointer(endX, endY, 0, {});
    await waitFor(() => (selected = transport.copySelection()) !== null, "terminal selection publication");
    return selected;
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
    inputTransport.pushPointer(x, y, 1, {});
    inputTransport.pushPointer(x, y, 0, {});
    await waitFor(() => inputTransport.inputIdle(), "terminal selection cleanup");
    return pid;
  }

  return { visibleTerminalText, waitForInteractiveTerminal };
}
