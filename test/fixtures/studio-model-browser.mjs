import assert from "node:assert/strict";
import { DEFAULT_LOCAL_MODEL, LOCAL_MODELS } from "../../src/local-model-contract.mjs";

export async function runStudioModelProof({ evaluate, wait, submit, press, modelId = DEFAULT_LOCAL_MODEL.id }) {
  assert.ok(LOCAL_MODELS.some(model => model.id === modelId), "unknown Studio test model");
  const gpu = await evaluate(`(async () => {
    const adapter = await navigator.gpu?.requestAdapter({powerPreference:'high-performance'});
    return adapter ? {description:adapter.info.description, f16:adapter.features.has('shader-f16')} : null;
  })()`);
  assert.ok(gpu?.f16, `WebGPU shader-f16 required: ${JSON.stringify(gpu)}`);
  console.log("browser: Studio GPU", JSON.stringify(gpu));
  await press({ key: "L", code: "KeyL", modifiers: 10, windowsVirtualKeyCode: 76 });
  await evaluate(`document.querySelector('#local-model [data-model="${modelId}"]').click()`);
  const loaded = await wait("({state:document.querySelector('#local-model').dataset.state,detail:document.querySelector('#local-model [role=status]').textContent})",
    value => ["ready", "error"].includes(value.state), "Studio Qwen load", 6000);
  assert.equal(loaded.state, "ready", loaded.detail);
  await press({ key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  const failures = [];
  try {
    for (const task of ["hello", "tool", "fix"]) {
      try {
        console.log(`browser: running real local Pi prompt /dolly-${task}`);
        const status = await submit(`timeout 180 pi --no-session --provider webgpu --model ${modelId} --mode json -p '/dolly-${task}' > /tmp/studio-${task}.jsonl 2>&1`);
        await submit(`tail -5 /tmp/studio-${task}.jsonl`);
        console.log("browser: Studio prompt result", await evaluate("__dolly.visibleTerminalText()"));
        assert.equal(status, 0, `/dolly-${task}`);
        assert.equal(await submit(`janis -m -e 'import fs from "node:fs";
          const events = fs.readFileSync("/tmp/studio-${task}.jsonl", "utf8").trim().split("\\n").map(JSON.parse);
          const end = events.findLast(event => event.type === "agent_end");
          const last = end?.messages.filter(message => message.role === "assistant").at(-1);
          if (last?.stopReason !== "stop") throw new Error(last?.errorMessage ?? "Agent did not complete normally");'`
          .replaceAll("\n", " ")), 0, "Pi exit 0 alone does not prove a successful model response");
        assert.equal(await submit(`dollyfile-lint /workspace/Dollyfile-${task}`), 0);
        if (task === "hello") assert.equal(await submit("grep -q 'Welcome to my agent workshop!' /workspace/Dollyfile-hello"), 0);
        if (task === "tool") assert.equal(await submit("grep -q 'Hello, agent!' /tmp/studio-tool.jsonl"), 0);
        if (task === "fix") assert.equal(await submit("grep -q 'DOLLY 3' /tmp/studio-fix.jsonl"), 0);
        console.log(`browser: /dolly-${task} passed`);
      } catch (error) {
        console.error(`browser: /dolly-${task} failed: ${error.message}`);
        failures.push(error);
      }
    }
    if (failures.length) throw new AggregateError(failures, "Studio local-model starters failed");
    console.log("browser: all three Studio starters completed with local Qwen and produced valid Dollyfiles");
  } finally {
    await submit("rm -f /tmp/studio-hello.jsonl /tmp/studio-tool.jsonl /tmp/studio-fix.jsonl /workspace/Dollyfile-hello /workspace/Dollyfile-tool /workspace/Dollyfile-fix");
    await evaluate("document.querySelector('#local-model [data-action=unload]').click()");
  }
}
