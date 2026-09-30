#!/usr/bin/env node
// Local development inference service; never part of Dolly's browser host.
import Anthropic from "@anthropic-ai/sdk";
import { randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { once } from "node:events";
import { createRelay, relayArguments, serveRelay } from "./local-relay.mjs";

const currentModels = ["claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1", "claude-haiku-4-5"];
const clientHeaders = ["accept", "content-type", "x-api-key", "anthropic-version", "anthropic-beta", "anthropic-dangerous-direct-browser-access"];

export function piModel(model) {
  const effort = model.capabilities?.effort;
  // Adaptive models reject disabled thinking and sampling parameters; effort is their only control.
  const adaptive = model.capabilities?.thinking?.types?.adaptive?.supported === true && {
    thinkingLevelMap: Object.fromEntries(["off", "minimal", "low", "medium", "high", "xhigh", "max"]
      .map(level => [level, effort?.[level]?.supported ? level : null])),
    compat: { forceAdaptiveThinking: true, supportsTemperature: false } };
  return { id: model.id, name: model.display_name, input: ["text", "image"], reasoning: true, ...adaptive,
    contextWindow: model.max_input_tokens, maxTokens: Math.min(model.max_tokens, 64000),
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
}

export function createClaudeRelay({ token, origins, models, client }) {
  return createRelay({ path: "/v1/messages", origins, models, capability: ["x-api-key", token],
    allowHeader: name => clientHeaders.includes(name) || name.startsWith("x-stainless-"),
    async forward({ request, response, body, signal, fail }) {
      const beta = request.headers["anthropic-beta"];
      let stream;
      try {
        stream = await client.messages.create({ ...body, stream: true },
          { signal, maxRetries: 0, fetchOptions: { redirect: "error" }, headers: beta ? { "anthropic-beta": beta } : {} });
      } catch (error) {
        if (!(error instanceof Anthropic.APIError && error.status)) throw error;
        const retry = error.headers?.get("retry-after");
        if (retry) response.setHeader("retry-after", retry).setHeader("access-control-expose-headers", "retry-after");
        return fail(error.status, `Claude API: ${error.error?.error?.message ?? error.status}`);
      }
      response.writeHead(200, { "content-type": "text/event-stream" });
      const send = (type, data) => response.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
      try {
        for await (const event of stream) if (!send(event.type, event)) await once(response, "drain", { signal });
      } catch (error) {
        if (!(error instanceof Anthropic.APIError && error.error)) throw error;
        send("error", error.error);
      }
      response.end();
    } });
}

// The SDK's own resolution comes first; otherwise one private file holding the key.
async function savedKey() {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return undefined;
  const path = resolve(homedir(), ".config/dolly/claude-relay.env");
  const file = await stat(path).catch(() => undefined);
  if (!file) return undefined;
  if (file.mode & 0o077) throw Error(`Refusing ${path}: run chmod 600 ${path}`);
  return (await readFile(path, "utf8")).trim().replace(/^ANTHROPIC_API_KEY=/, "");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { port, origins } = relayArguments("claude-relay.mjs", 9003);
  const client = new Anthropic({ apiKey: await savedKey() });
  const models = [];
  try {
    for await (const model of client.models.list()) if (currentModels.includes(model.id.replace(/-\d{8}$/, ""))) models.push(model);
  } catch (error) {
    throw Error(`Claude credentials were rejected or unavailable (${error.status ?? "none found"}): set ANTHROPIC_API_KEY`);
  }
  if (!models.length) throw Error("These credentials list no current Claude models");
  const token = randomBytes(32).toString("base64url");
  await serveRelay({ server: createClaudeRelay({ token, origins, client, models: models.map(model => model.id) }),
    port, origins, provider: "claude-local", title: "Claude API relay",
    config: { api: "anthropic-messages", apiKey: token, models: models.map(piModel) },
    notice: "Requests are billed to the Anthropic account behind these credentials." });
}
