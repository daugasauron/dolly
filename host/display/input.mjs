// The display's page input: keys, pointer, wheel, focus, IME text, paste and
// size become bounded mailbox records; interpretation stays in Wasm. Listeners
// exist from host creation so F11 works while booting; records flow once the
// display transport starts.
export function displayInput({ mount, canvas, keyboard, showStatus, claimsKey, surfaceSize }) {
  let transport, resizeObserver, selecting = false;
  const heldKeys = new Map();

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      }
    } catch {
      document.documentElement.dataset.fullscreen = "failed";
    }
  }

  function sendResize() {
    if (!transport) return;
    if (!transport.pushResize(mount.clientWidth, mount.clientHeight, devicePixelRatio)) {
      requestAnimationFrame(sendResize);
    }
  }

  function releaseHeldKeys() {
    for (const key of heldKeys.values()) transport?.pushKey({ ...key, type: "keyup",
      ctrlKey: false, shiftKey: false, altKey: false, metaKey: false });
    heldKeys.clear();
  }

  const interruptChord = event => event.type === "keydown" && event.ctrlKey &&
    !event.shiftKey && !event.altKey && !event.metaKey && event.code === "KeyC";

  function handleKeyboardEvent(event) {
    if (event.key === "F11") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type === "keydown" && !event.repeat) void toggleFullscreen();
      return;
    }
    // Module UIs claim their keys first and the terminal lets go of held keys.
    // A UI waiting on the foreground program claims with "interrupt": Ctrl+C
    // still interrupts that program.
    const claim = claimsKey(event);
    if (claim) {
      releaseHeldKeys();
      if (claim === "interrupt" && interruptChord(event)) {
        event.preventDefault();
        transport?.interruptForeground();
      }
      return;
    }
    if (!transport) return;
    if (event.type === "keydown" && event.key === "Escape" && document.pointerLockElement === canvas) {
      document.exitPointerLock();
      event.preventDefault();
      return;
    }
    const clipboardChord = event.ctrlKey && event.shiftKey &&
      !event.altKey && !event.metaKey;
    const graphicsPaste = transport.graphicsActive() && !event.altKey && (
      (event.code === "KeyV" && (event.ctrlKey || event.metaKey)) ||
      (event.code === "Insert" && event.shiftKey && !event.ctrlKey && !event.metaKey));
    if (graphicsPaste || (clipboardChord && event.code === "KeyV")) {
      // Let the browser deliver clipboard bytes through a user-initiated PasteEvent.
      if (graphicsPaste && event.type === "keydown") keyboard.focus({ preventScroll: true });
      return;
    }
    if (clipboardChord && event.code === "KeyC") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type === "keydown") {
        try {
          const text = transport.copySelection();
          if (text !== null) {
            void navigator.clipboard.writeText(text).then(
              () => { document.documentElement.dataset.clipboard = "copied"; },
              () => { document.documentElement.dataset.clipboard = "denied"; },
            );
          } else {
            document.documentElement.dataset.clipboard = "empty";
          }
        } catch (error) {
          document.documentElement.dataset.clipboard = "failed";
          showStatus(`Copy failed: ${error.message}`);
        }
      }
      return;
    }
    if (interruptChord(event) && transport.interruptForeground()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    transport.pushKey(event);
    if (event.type === "keyup") heldKeys.delete(event.code);
    else heldKeys.set(event.code, {key:event.key,code:event.code,type:"keydown",repeat:false,
      ctrlKey:event.ctrlKey,shiftKey:event.shiftKey,altKey:event.altKey,metaKey:event.metaKey});
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  window.addEventListener("keydown", handleKeyboardEvent, { capture: true });
  window.addEventListener("keyup", handleKeyboardEvent, { capture: true });
  // Focus moving into a module UI (a dialog, a panel button) also takes the keyboard.
  document.addEventListener("focusin", event => { if (event.target !== keyboard) releaseHeldKeys(); });

  function pointerPosition(event) {
    const bounds = canvas.getBoundingClientRect();
    const {width,height} = surfaceSize() ?? canvas;
    return {
      x: bounds.width === 0 ? 0 : (event.clientX - bounds.left) * width / bounds.width,
      y: bounds.height === 0 ? 0 : (event.clientY - bounds.top) * height / bounds.height,
    };
  }

  function pushPointer(event, action) {
    const position = pointerPosition(event);
    transport?.pushPointer(position.x, position.y, action, event);
  }

  function pushPointerPresence(inside) {
    if (transport?.graphicsActive()) transport.pushPointerPresence(inside);
  }
  canvas.addEventListener("pointerenter", () => pushPointerPresence(true));
  canvas.addEventListener("pointerleave", () => pushPointerPresence(false));
  window.addEventListener("blur", () => {
    selecting = false;
    pushPointerPresence(false);
    transport?.pushFocus(false);
  });
  window.addEventListener("focus", () => {
    transport?.pushFocus(true);
    pushPointerPresence(canvas.matches(":hover"));
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (!transport || (event.button !== 0 && !transport.graphicsActive())) return;
    if (transport.relativePointerRequested()) {
      keyboard.blur();
      event.preventDefault();
      if (!event.isTrusted) return;
      if (document.pointerLockElement !== canvas) {
        // Browsers may refuse capture; the game then keeps absolute pointer input.
        try { void Promise.resolve(canvas.requestPointerLock()).catch(() => {}); } catch {}
      } else {
        pushPointer(event, 1);
      }
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    if (transport.graphicsActive()) keyboard.blur();
    else keyboard.focus({ preventScroll: true });
    selecting = true;
    pushPointer(event, 1);
    event.preventDefault();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (document.pointerLockElement === canvas) {
      if (transport?.relativePointerRequested()) transport.pushPointerMotion(event);
      event.preventDefault();
      return;
    }
    if (!transport?.graphicsActive() && (!selecting || (event.buttons & 1) === 0)) return;
    pushPointer(event, 2);
    event.preventDefault();
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!transport?.graphicsActive() && (!selecting || event.button !== 0)) return;
    selecting = false;
    pushPointer(event, 0);
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    event.preventDefault();
  });
  canvas.addEventListener("contextmenu", event => {
    if (transport?.graphicsActive()) event.preventDefault();
  });
  canvas.addEventListener("pointercancel", (event) => {
    if (selecting) {
      selecting = false;
      pushPointer(event, 0);
    }
  });
  document.addEventListener("pointerlockchange", () => {
    selecting = false;
    transport?.pushPointerCapture(document.pointerLockElement === canvas);
  });
  canvas.addEventListener("wheel", (event) => {
    if (!transport) return;
    const dimensions = transport.dimensions();
    const cellHeight = Math.max(1, transport.geometry().cellHeight);
    let deltaRows = event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_PIXEL) deltaRows /= cellHeight;
    else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      deltaRows *= Math.max(1, dimensions.rows);
    }
    transport.pushScroll(deltaRows);
    event.preventDefault();
  }, { passive: false });
  document.addEventListener("fullscreenchange", () => {
    document.documentElement.dataset.fullscreen = document.fullscreenElement ? "on" : "off";
    requestAnimationFrame(sendResize);
    // Firefox lets focus leave a modal dialog once the page is fullscreen.
    if (!document.querySelector("dialog[open]")) keyboard.focus({ preventScroll: true });
  });

  keyboard.addEventListener("compositionend", (event) => {
    transport?.pushText(event.data);
    keyboard.value = "";
  });
  window.addEventListener("paste", (event) => {
    if (event.target !== keyboard && (!transport?.graphicsActive() ||
        (event.target !== document.body && event.target !== canvas))) return;
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (text && !transport?.pushPaste(text)) showStatus("Paste not delivered: the program's input buffer is full or too small");
  });

  return {
    connect(displayTransport) { transport = displayTransport; },
    // The initial size, then every change of the terminal area.
    followSize() {
      if (!transport.pushResize(mount.clientWidth, mount.clientHeight, devicePixelRatio)) {
        throw new Error("Dolly display input ring rejected its initial resize");
      }
      resizeObserver = new ResizeObserver(sendResize);
      resizeObserver.observe(mount);
    },
    dispose() { resizeObserver?.disconnect(); },
  };
}
