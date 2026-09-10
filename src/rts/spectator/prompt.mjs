// SPDX-License-Identifier: GPL-2.0-or-later
export function ask(label, { secret = false, fallback = "" } = {}) {
  return new Promise((resolve, reject) => {
    let value = "", escape = "", pasted = false;
    const stdin = process.stdin, raw = stdin.isRaw;
    const prefix = `${label}${fallback ? ` [${fallback}]` : ""}: `;
    process.stdout.write(prefix);
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    const finish = error => {
      stdin.removeListener("data", data); stdin.removeListener("end", end);
      stdin.setRawMode(raw); stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error); else resolve(value.trim() || fallback);
    };
    const end = () => finish(Error("Input closed"));
    const data = chunk => {
      for (const character of String(chunk)) {
        if (escape || character === "\x1b") {
          escape += character;
          if (escape.length > 1 && escape !== "\x1b[" && /[A-Za-z~]$/.test(escape)) {
            if (escape === "\x1b[200~") pasted = true;
            if (escape === "\x1b[201~") pasted = false;
            escape = "";
          } else if (escape.length > 32) escape = "";
          continue;
        }
        if (character === "\x03" || character === "\x04") return finish(Error("Cancelled"));
        if (character === "\r" || character === "\n") { if (!pasted) return finish(); else continue; }
        if (character === "\x7f" || character === "\b") value = [...value].slice(0, -1).join("");
        else if (character >= " " && value.length < 4096) value += character;
        if (!secret) process.stdout.write(`\r\x1b[2K${prefix}${value}`);
      }
    };
    stdin.on("end", end); stdin.on("data", data); stdin.resume();
  });
}
