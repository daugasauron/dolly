// A scripted HTTP fixture, never a substitute for the live OpenRouter test.
import assert from "node:assert/strict";

export function rtsProvider() {
  const requests = [];
  async function handle(request, response, headers) {
    assert.equal(request.method, "POST");
    assert.equal(request.headers.authorization, "Bearer rts-fixture-only");
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    assert.ok(["rts-test-fast", "rts-test-slow"].includes(payload.model));
    assert.deepEqual(payload.tools.map(tool => tool.function.name), ["game_input"]);
    const images = payload.messages.flatMap(message => Array.isArray(message.content)
      ? message.content.filter(part => part.type === "image_url").map(part => part.image_url.url) : []);
    assert.ok(images.length, "Pi must send the real player's image to the provider");
    assert.ok(images.every(image => image.startsWith("data:image/png;base64,iVBOR")));
    requests.push({ model: payload.model, images, messages: payload.messages });
    const id = `rts-fixture-${requests.length}`;
    response.writeHead(200, { ...headers, "content-type": "text/event-stream" });
    response.flushHeaders();
    await new Promise(resolve => setTimeout(resolve, payload.model === "rts-test-fast" ? 30 : 650));
    if (response.destroyed) return;
    const send = (delta, finish_reason = null) => response.write(`data: ${JSON.stringify({
      id, object: "chat.completion.chunk", created: 0, model: payload.model,
      choices: [{ index: 0, delta, finish_reason }],
    })}\n\n`);
    send({ role: "assistant", reasoning_content: "RTS-FIXTURE-THINKING: scripted integration test, not a real model.\n" });
    const key = payload.model === "rts-test-fast" ? "Right" : "Left";
    send({ tool_calls: [{ index: 0, id: `call_${id}`, type: "function", function: {
      name: "game_input", arguments: JSON.stringify({ actions: [
        { type: "key", key, milliseconds: 16 }, { type: "key", key: "Down", milliseconds: 16 },
      ] }),
    } }] });
    send({}, "tool_calls");
    response.end("data: [DONE]\n\n");
  }
  function verify() {
    const fast = requests.filter(request => request.model === "rts-test-fast");
    const slow = requests.filter(request => request.model === "rts-test-slow");
    assert.ok(fast.length >= 2 && slow.length >= 2, "Both actual Pi sessions must complete tool/provider cycles");
    assert.notEqual(fast[0].images[0], slow[0].images[0], "Players must not share their initial observation");
    for (const sequence of [fast, slow]) {
      assert.ok(sequence.some(request => request.messages.some(message => message.role === "tool")), "Tool history must reach the next request");
      assert.ok(sequence.every(request => request.images.length === 1), "Only the newest screenshot belongs in model context");
      assert.ok(sequence.some(request => request.images[0] !== sequence[0].images[0]), "Fresh tool screenshots must reach the provider");
    }
    return { fast: fast.length, slow: slow.length };
  }
  return { handle, verify };
}
