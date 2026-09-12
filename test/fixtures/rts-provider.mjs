// A scripted HTTP fixture, never a substitute for the live OpenRouter test.
import assert from "node:assert/strict";

export function rtsProvider() {
  const requests = [];
  const firstModels = new Set();
  let releaseFirst;
  const bothStarted = new Promise(resolve => { releaseFirst = resolve; });
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
    if (!firstModels.has(payload.model)) {
      firstModels.add(payload.model);
      if (firstModels.size === 2) releaseFirst();
      let timeout;
      try {
        await Promise.race([bothStarted, new Promise((_, reject) => {
          timeout = setTimeout(() => reject(Error("RTS players did not start overlapping HTTP streams")), 30000);
        })]);
      } finally { clearTimeout(timeout); }
    }
    await new Promise(resolve => setTimeout(resolve, payload.model === "rts-test-fast" ? 30 : 4000));
    if (response.destroyed) return;
    const send = (delta, finish_reason = null) => response.write(`data: ${JSON.stringify({
      id, object: "chat.completion.chunk", created: 0, model: payload.model,
      choices: [{ index: 0, delta, finish_reason }],
    })}\n\n`);
    send({ role: "assistant", reasoning_content: "RTS-FIXTURE-THINKING: scripted integration test, not a real model.\n" });
    send({ content: "RTS-FIXTURE-INTENT: I will compare the next view after these inputs.\n" });
    if (requests.filter(request => request.model === payload.model).length === 2) {
      send({}, "stop");
      response.end("data: [DONE]\n\n");
      return;
    }
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
    assert.equal(firstModels.size, 2, "Both players must start HTTP before either initial response finishes");
    const fast = requests.filter(request => request.model === "rts-test-fast");
    const slow = requests.filter(request => request.model === "rts-test-slow");
    assert.ok(fast.length >= 2 && slow.length >= 2, "Both actual Pi sessions must complete tool/provider cycles");
    assert.notEqual(fast[0].images[0], slow[0].images[0], "Players must not share their initial observation");
    for (const sequence of [fast, slow]) {
      assert.ok(sequence.some(request => request.messages.some(message => message.role === "tool")), "Tool history must reach the next request");
      assert.ok(sequence.some(request => request.messages.filter(message => message.role === "user" &&
        JSON.stringify(message.content).includes("Play from this view.")).length >= 2),
        "a text-only response must settle before the supervisor continues the same session");
      assert.ok(sequence.every(request => request.images.length <= 2), "Keep at most two recent screenshots in model context");
      assert.ok(sequence.some(request => request.images.length === 2), "Include before/after feedback");
      assert.ok(sequence.slice(1).every(request => request.messages.some(message => message.role === "assistant" &&
        JSON.stringify(message.content).includes("RTS-FIXTURE-INTENT"))), "Ordinary assistant intent must reach subsequent requests");
      assert.ok(sequence.some(request => request.images[0] !== sequence[0].images[0]), "Fresh tool screenshots must reach the provider");
    }
    return { fast: fast.length, slow: slow.length, overlappingPlayers: firstModels.size };
  }
  return { handle, verify };
}
