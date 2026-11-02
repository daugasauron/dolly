// Pi's ask_user and show_html (ask-user.js, html@0): a scripted model on an
// origin of its own asks the user three questions; the test answers in the
// popup's form as a user would, and the model plans from the answers. It
// then shows a report the user reads and closes, and asks once more, which
// the user closes unanswered. Usage: node demos/pi/test/ask-user-browser.mjs
// (DOLLY_BROWSER=firefox runs it in Firefox).
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { delay, demoTest } from "../../browser.mjs";
import { siteReference } from "../../../src/static-asset.mjs";
import { DOLLY_IMAGES } from "../../../dist/dolly-images.mjs";

let pageOrigin;
const cors = request => ({ "access-control-allow-origin": pageOrigin, vary: "origin", "access-control-allow-methods": "POST",
  "access-control-allow-headers": request.headers["access-control-request-headers"] ?? "" });
const trip = { title: "Your trip", questions: [{ question: "Where to?" },
  { question: "How do you travel?", choices: ["train", "plane"] },
  { question: "What do you pack?", choices: ["umbrella", "camera", "tent"], multiple: true }] };
const report = "<h1>Trip report</h1><table><tr><th>Where</th><td>Kyoto</td></tr><tr><th>By</th><td>train</td></tr></table>";
// The model: per request of the user, its next tool call from the results so far, or its answer.
const scripts = [
  { says: "Plan my trip.", next(results) {
    if (!results.length) return { call: ["ask_user", trip] };
    if (results.length === 1) {
      const [where, by, pack] = JSON.parse(results[0]).map(({ answer }) => answer);
      return { call: ["bash", { command: `printf '%s\\n' '${where} by ${by} with ${pack.join(" and ")}' > /workspace/plan.txt` }] };
    }
    return { answer: "Planned the trip." };
  } },
  { says: "Show me the report.", next: results => !results.length ? { call: ["show_html", { html: report }] }
    : { answer: /closed it/.test(results[0]) ? "You have read the report." : "The report was not shown." } },
  { says: "Ask me again.", next: results => !results.length ? { call: ["ask_user", { title: "Again", questions: [{ question: "Anything else?" }] }] }
    : { answer: /closed the form/.test(results[0]) ? "You closed the form; nothing more to do." : "Unexpected answer." } },
];
const results = [];
const provider = createServer(async (request, response) => {
  if (request.method === "OPTIONS") return response.writeHead(204, cors(request)).end();
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const { messages } = JSON.parse(Buffer.concat(chunks).toString());
  const text = ({ content }) => typeof content === "string" ? content : (content ?? []).map(part => part.text ?? "").join("");
  const asked = messages.findLastIndex(({ role }) => role === "user");
  const script = scripts.find(({ says }) => text(messages[asked]).includes(says));
  const toolResults = messages.slice(asked).filter(({ role }) => role === "tool").map(text);
  results.push(...toolResults.slice(-1));
  const { call, answer } = script.next(toolResults);
  const chunk = (delta, finish_reason = null) =>
    `data: ${JSON.stringify({ id: "chatcmpl-scripted", object: "chat.completion.chunk", created: 0, model: "scripted",
      choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
  response.writeHead(200, { ...cors(request), "content-type": "text/event-stream; charset=utf-8" }).end((call
    ? chunk({ role: "assistant", tool_calls: [{ index: 0, id: `call_${toolResults.length}`, type: "function",
      function: { name: call[0], arguments: JSON.stringify(call[1]) } }] }) + chunk({}, "tool_calls")
    : chunk({ role: "assistant", content: answer }) + chunk({}, "stop")) + "data: [DONE]\n\n");
});
await new Promise(resolve => provider.listen(0, "127.0.0.1", resolve));
const llm = `http://127.0.0.1:${provider.address().port}`;

const base = DOLLY_IMAGES.find(({ image }) => image === "pi-runtime");
const file = (path, text) => [`FILE ${path}`, ...text.trim().split("\n").map(line => `    ${line}`)];
const recipe = ["DOLLY 7", "APPLICATION trip-agent", ...base.hostRequirements.map(module => `REQUIRES HOST ${module}`),
  `FROM ${siteReference(base.dollyfile)} ${base.sha256}`,
  ...file("/home/dolly/.pi/agent/models.json", JSON.stringify({ providers: { scripted: { baseUrl: `${llm}/v1`,
    api: "openai-completions", apiKey: "scripted", models: [{ id: "scripted", name: "Scripted", reasoning: false, input: ["text"],
      contextWindow: 32_000, maxTokens: 4_096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } }, null, 2)),
  ...file("/etc/agent/start.slop", `
mkdir -p /workspace && cd /workspace
pi --offline --no-session --provider scripted --model scripted
/bin/foreground -i /bin/slop`),
  "ENTRY /bin/foreground -i /bin/slop /etc/agent/start.slop", ""].join("\n");

await demoTest("pi ask-user", { image: "pi-runtime", timeout: 300_000, browser: process.env.DOLLY_BROWSER ?? "chromium" }, async ({ server, open }) => {
  pageOrigin = server.origin;
  const policy = { rules: [{ origin: llm, path: "/v1/chat/completions", methods: ["POST"] }] };
  const { page, input, run, prompt, waitText } = await open({ policy, path: "/custom/rebuild/", prompt: /pi \/ DOLLY/,
    setup: page => page.addInitScript(recipe => sessionStorage.setItem("dolly-custom-source", recipe), recipe) });
  const popup = page.locator("#html-popup"), form = page.frameLocator("#html-popup iframe");
  const say = async words => { await page.keyboard.type(words); await page.keyboard.press("Enter"); };

  await say(scripts[0].says);
  await form.getByText("Where to?").waitFor({ timeout: 120_000 });
  await form.locator("textarea").fill("Kyoto");
  await form.getByLabel("train").check();
  await form.getByLabel("umbrella").check();
  await form.getByLabel("camera").check();
  await form.getByRole("button", { name: "Send answers" }).click();
  await waitText(/Planned the trip\./, 120_000);
  assert.deepEqual(JSON.parse(results[0]).map(({ answer }) => answer), ["Kyoto", "train", ["umbrella", "camera"]]);

  await say(scripts[1].says);
  await form.getByRole("heading", { name: "Trip report" }).waitFor({ timeout: 120_000 });
  assert.equal(await form.locator("td").first().textContent(), "Kyoto");
  assert.equal(await form.locator("h1").evaluate(heading => getComputedStyle(heading).color), "rgb(242, 212, 92)",
    "the report is drawn in the page's style");
  await popup.getByRole("button", { name: "Close" }).click();
  await waitText(/You have read the report\./, 120_000);

  // For two seconds after a close no popup shows (host/html/html.mjs).
  await delay(2100);
  await say(scripts[2].says);
  await form.getByText("Anything else?").waitFor({ timeout: 120_000 });
  await popup.getByRole("button", { name: "Close" }).click();
  await waitText(/You closed the form; nothing more to do\./, 120_000);

  // The model's plan is a file of the session, written from the user's answers.
  await input("\x04");
  await prompt(/dolly:[^\n]*\$\s*$/);
  await run(`test "$(cat /workspace/plan.txt)" = 'Kyoto by train with umbrella and camera'`);
});
provider.close();
