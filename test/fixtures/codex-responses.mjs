// A deterministic Responses API fixture. Codex executes the tool in Dolly.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

export const demoMarker = "DOLLY-CODEX-TOOL-PROOF";
export const demoPath = "/workspace/codex-demo/proof.txt";

export function demoFixture(directory) {
  let completed = false, requests = 0;
  const callId = "dolly_demo_shell_1";
  return {
    handle(request, response) {
      if (request.url !== "/demo/v1/responses") return false;
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.setHeader("Access-Control-Allow-Headers", "*");
      response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      if (request.method === "OPTIONS") { response.writeHead(204).end(); return true; }
      if (request.method !== "POST") { response.writeHead(405).end(); return true; }
      (async () => {
        const chunks = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 8 * 1024 * 1024) throw new Error("demo request exceeds 8 MiB");
          chunks.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString());
        requests++;
        if (directory) await writeFile(`${directory}/demo-request-${requests}.json`, JSON.stringify(body, null, 2));
        const output = body.input?.find(item => item.type === "function_call_output" && item.call_id === callId);
        let item;
        if (!output) {
          const tools = (body.tools ?? []).flatMap(tool => tool.type === "namespace"
            ? tool.tools.map(entry => ({ ...entry, namespace: tool.name })) : [tool]);
          const tool = ["exec_command", "shell_command", "shell"]
            .map(name => tools.find(tool => tool.name === name)).find(Boolean);
          assert.ok(tool, "Codex did not offer a supported shell tool");
          const script = String.raw`printf '${demoMarker}\n' > ${demoPath}; cat ${demoPath}`;
          const args = tool.name === "exec_command"
            ? { cmd: script, shell: "/bin/sh", login: false, workdir: "/workspace/codex-demo" }
            : tool.name === "shell_command"
              ? { command: script, login: false, workdir: "/workspace/codex-demo" }
              : { command: ["/bin/sh", "-c", script], workdir: "/workspace/codex-demo" };
          item = { type: "function_call", call_id: callId, name: tool.name, arguments: JSON.stringify(args) };
          if (tool.namespace) item.namespace = tool.namespace;
        } else {
          const text = typeof output.output === "string" ? output.output
            : output.output.filter(item => item.type === "input_text").map(item => item.text).join("\n");
          assert.match(text, /^(Process exited with code 0|Exit code: 0)$/m);
          assert.equal(text.split("\nOutput:\n")[1]?.trimEnd(), demoMarker,
            "Codex must return the exact successful shell output before the fixture completes");
          item = { type: "message", role: "assistant", id: "dolly_demo_answer",
            content: [{ type: "output_text", text: `Created ${demoPath} and verified its contents by running a shell command inside Dolly.` }] };
          completed = true;
        }
        const id = `dolly_demo_response_${requests}`;
        const events = [
          { type: "response.created", response: { id } },
          { type: "response.output_item.done", item },
          { type: "response.completed", response: { id, usage: { input_tokens: 0,
            input_tokens_details: null, output_tokens: 0, output_tokens_details: null, total_tokens: 0 } } },
        ];
        response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
        response.end(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""));
      })().catch(error => {
        console.error("CODEX-DEMO-FIXTURE-ERROR", error);
        response.writeHead(500).end(String(error));
      });
      return true;
    },
    verify() {
      assert.ok(completed, "Codex did not complete the fixture's tool round trip");
      assert.equal(requests, 2);
      console.log("CODEX-DEMO-TOOL-ROUND-TRIP-PASSED");
    },
  };
}
