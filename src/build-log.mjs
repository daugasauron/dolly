// Keep compiler output as text, bounded even when a guest floods stdout.
export function buildLog(element) {
  const maximum = 1024 * 1024;
  let length = 0, escape = "", carriageReturn = false;
  return {
    clear() { element.replaceChildren(); length = 0; escape = ""; carriageReturn = false; },
    append(text) {
      const follow = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
      text = escape + String(text);
      escape = /\x1b(?:\[[0-9;:]{0,128})?$/.exec(text)?.[0] ?? "";
      if (escape) text = text.slice(0, -escape.length);
      text = text.replace(/\x1b\[[0-9;:]*m/g, "");
      if (!text) return;
      if (carriageReturn && text.startsWith("\n")) text = text.slice(1);
      carriageReturn = text.endsWith("\r");
      text = text.replace(/\r\n?/g, "\n").slice(-maximum);
      if (!text) return;
      if (element.lastChild && element.lastChild.length + text.length <= 4096) {
        element.lastChild.appendData(text);
      } else element.append(element.ownerDocument.createTextNode(text));
      length += text.length;
      while (length > maximum) {
        const first = element.firstChild, excess = length - maximum;
        if (first.length <= excess) { length -= first.length; first.remove(); }
        else { first.deleteData(0, excess); length -= excess; }
      }
      if (follow) element.scrollTop = element.scrollHeight;
    },
  };
}
