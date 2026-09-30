import fs from "node:fs";
import { SessionManager } from "/usr/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js";

const directory = `${process.argv[2]}/sessions`;
for (let index = 0; process.argv[3] !== "verify" && index < 12; index++) {
  const session = SessionManager.create(process.cwd(), directory);
  session.appendMessage({ role: "user", content: `resume prompt ${index} 日本語😀`, timestamp: Date.now() });
  if (fs.existsSync(session.getSessionFile())) throw new Error("empty sessions should not be persisted yet");
  session.appendMessage({ role: "assistant", content: [{ type: "text", text: `resume reply ${index}` }],
    api: "openai-completions", provider: "webgpu", model: "Qwen3.5-2B",
    stopReason: "stop", timestamp: Date.now(), usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
      totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
  session.appendSessionInfo(`DOLLY-RESUME-PROOF-${index}`);
}
const sessions = await SessionManager.list(process.cwd(), directory);
if (sessions.length !== 12) throw new Error(`expected 12 saved Pi sessions, found ${sessions.length}`);
for (const info of sessions) {
  const reopened = SessionManager.open(info.path);
  const messages = reopened.buildSessionContext().messages;
  if (messages.length !== 2 || !info.firstMessage.endsWith("日本語😀") ||
      info.messageCount !== 2 || reopened.getSessionName() !== info.name) throw new Error("Pi session round-trip failed");
}
console.log("PI-SESSIONS-OK: saved, discovered and reopened 12 real Pi sessions");
