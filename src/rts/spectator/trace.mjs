// SPDX-License-Identifier: GPL-2.0-or-later
export function traceText(event) {
  switch (event.type) {
    case "start": return `Player ${event.player}: ${event.model}\nWaiting for Pi. Thinking is shown only when the provider exposes it.\n\n`;
    case "configuration": return `\n[model: ${event.model}; thinking: ${event.thinking}]\n`;
    case "observation": return `\n[view: frame ${event.frame}, ${event.milliseconds} ms]\n`;
    case "thinking": return "\n[thinking]\n";
    case "text": return "\n[assistant]\n";
    case "thinking_delta": case "text_delta": return event.delta;
    case "tool": return `\n[${event.name}] ${JSON.stringify(event.args)}\n`;
    case "tool_result": return `\n[${event.isError ? "input rejected" : "result"}] ${JSON.stringify(event.isError ? event.feedback : event.details)}\n`;
    case "usage": return `\n[reported match cost: $${event.reportedUSD.toFixed(4)} / $${event.limitUSD}]\n`;
    case "provider_error": return `\n[provider error] ${event.message}\n`;
    case "retry": return `\n[retry ${event.attempt}: ${event.delayMs} ms]\n`;
    case "compaction_start": return "\n[summarizing older history]\n";
    default: return "";
  }
}
