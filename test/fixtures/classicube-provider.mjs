// Scripted integration provider; live tests use OpenRouter separately.
import assert from "node:assert/strict";
export function classicubeProvider() {
  const requests = [];
  let exchanges = 0;
  return {
    requests,
    async handle(request, response, headers) {
      const path = new URL(request.url, "http://fixture").pathname;
      const json = (status, body) => { response.writeHead(status, { ...headers, "content-type": "application/json" }); response.end(JSON.stringify(body)); };
      if (path.endsWith("/models")) {
        const model = { id: "fixture/vision", name: "ClassiCube vision fixture",
          architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
          supported_parameters: ["tools", "reasoning"], context_length: 128000,
          top_provider: { max_completion_tokens: 4096 }, pricing: { prompt: "0.1", completion: "0.2" } };
        return json(200, { data: [model, ...Array.from({length:24},(_,n)=>({...model,id:`fixture/list-${String(n).padStart(2,"0")}`}))] });
      }
      if (path.endsWith("/key")) return json(request.headers.authorization === "Bearer sk-or-v1-classicube-fixture" ? 200 : 401, { data: { usage: 0 } });
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (path.endsWith("/auth/keys")) {
        assert.equal(payload.code, "classicube-authorization-fixture");
        assert.equal(payload.code_challenge_method, "S256"); assert.match(payload.code_verifier, /^[A-Za-z0-9_-]{43}$/);
        exchanges++; return json(200, { key: "sk-or-v1-classicube-fixture" });
      }
      assert.ok(path.endsWith("/chat/completions"));
      assert.equal(request.headers.authorization, "Bearer sk-or-v1-classicube-fixture");
      assert.equal(payload.model, "fixture/vision");
      assert.equal(payload.reasoning?.effort, "low");
      assert.deepEqual(payload.tools.map(tool => tool.function.name), ["game_input"]);
      const images = payload.messages.flatMap(message => Array.isArray(message.content)
        ? message.content.filter(part => part.type === "image_url").map(part => part.image_url.url) : []);
      assert.ok(images.length > 0 && images.length <= 2);
      for (const url of images) {
        const png = Buffer.from(url.split(",")[1], "base64");
        assert.equal(png.readUInt32BE(16), 640); assert.equal(png.readUInt32BE(20), 480);
      }
      const index = requests.length; requests.push({ images, messages: payload.messages });
      response.writeHead(200, { ...headers, "content-type": "text/event-stream" }); response.flushHeaders();
      await new Promise(resolve => setTimeout(resolve, index === 0 ? 6000 : [6,8].includes(index) ? 10000 : 250));
      if (response.destroyed) return;
      const send = (delta, finish_reason = null) => response.write(`data: ${JSON.stringify({ id: `cc-${index}`,
        object: "chat.completion.chunk", created: 0, model: payload.model, choices: [{ index: 0, delta, finish_reason }], ...(finish_reason ? { usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } } : {}) })}\n\n`);
      send({ role: "assistant", reasoning_content: "CLASSICUBE-FIXTURE-THINKING: scripted integration proof.\n" });
      const batches = [
        [{ type: "look", dx: 100, dy: 100 }, { type: "key", key: "D", milliseconds: 200 }],
        [{ type: "look", dy: 350 }, { type: "click", button: "right" }],
        [{ type: "click", x: 320, y: 240, button: "left" }, { type: "click", x: 320, y: 240, button: "right" },
          { type: "key", key: "W", milliseconds: 500 }],
        null,
        [{ type: "look", dx: -200, dy: 0 }, { type: "key", key: "A", milliseconds: 200 }],
      ];
      const actions = [7,9].includes(index) ? [{ type: "key", key: "W", milliseconds: 2000 }] : batches[index];
      send({ content: actions ? "CLASSICUBE-FIXTURE-INTENT: I will act and inspect the resulting view.\n" : "The fixture task is complete.\n" });
      if (actions) send({ tool_calls: [{ index: 0, id: `call_cc_${index}`, type: "function", function: {
        name: "game_input", arguments: JSON.stringify({ actions }),
      } }] });
      send({}, actions ? "tool_calls" : "stop"); response.end("data: [DONE]\n\n");
    },
    verify() {
      assert.equal(exchanges, 1, "PKCE login must exchange its code once");
      assert.ok(requests.length >= 10, "the agent must act, finish and accept a follow-up");
      assert.ok(requests.slice(1).some(item => item.images.at(-1) !== requests[0].images[0]));
      assert.ok(requests.slice(1).every(item => item.messages.some(message => message.role === "tool")));
      assert.ok(requests.some(request => request.messages.some(message => JSON.stringify(message.content).includes("Follow-up proof"))));
    },
  };
}
