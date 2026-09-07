# Browser-local models

The `pi-local` experiment adds Qwen3.5 through WebLLM 0.2.84. Open
`/pi-local/` and press **Ctrl+Shift+L** to open the hidden Local model menu.
Click a model row, or use arrow keys and Enter, to load that size.
Escape or Ctrl+Shift+L closes the menu and returns focus to the terminal.
Select the same size under `webgpu` in Pi's normal model picker.

| Size | First weight download | Role |
| --- | --- | --- |
| 0.8B | 0.42 GB | Quick experiments; weak at tool use |
| 2B (default) | 1.06 GB | Initial Pi integration default |
| 4B | 2.37 GB | Larger model; needs more GPU memory |

Moving keyboard focus does not download anything. Activating a model row
replaces the idle model; only one worker/model is active per tab. Cached weights
are kept for switching back. GPU memory also includes working buffers and the
16,384-token context; download size is not a GPU memory estimate.
It requires a hardware WebGPU adapter with `shader-f16`; there is no CPU or
cloud fallback. **Stop generation** cancels generation, **Unload** releases its worker,
and **Clear cached models** clears this origin's WebLLM model databases without
network access. Dolly files and saved sessions have separate storage.

The provider extension is an ordinary JavaScript file installed by
[`browser-model-providers.dm`](../modules/browser-model-providers.dm).
[`Dollyfile-pi-local`](../Dollyfile-pi-local) starts from the completed Pi image.
Extension changes rebuild this small leaf; they do not compile Pi or Janis.
Pi discovers all sizes through the provider catalog. Adding a host model or
switching sizes requires no image rebuild.

## Service contract

The browser exposes an OpenAI-compatible subset through Dolly's existing HTTP
broker. These are logical local addresses; they have no DNS or HTTP server:

| Request | Result |
| --- | --- |
| `GET https://webgpu.dolly.invalid/v1/models` | Model IDs and actual configured context/output limits; never loads weights |
| `POST https://webgpu.dolly.invalid/v1/chat/completions` | SSE text, tool calls, finish reason, optional usage, and `[DONE]` |

The protocol accepts one streamed choice, text messages, function tools,
`max_tokens`, `temperature`, `top_p`, and `tool_choice` (`auto`, `none`, or
`required`). Unknown fields and modalities fail explicitly. Input is capped
at 1 MiB, tool schemas at 64 KiB/32 tools, response at 8 MiB, context at 16,384
tokens, and output at 2,048 tokens. WebLLM rejects prompts beyond the configured
context. Local inference stops after two minutes without a worker result;
each completion chunk renews that idle deadline. The browser broker also
enforces a ten-minute total request cap, including downstream stalls. Remote
HTTP keeps its existing limits. Model preparation is a separate user action.

An unloaded or busy model returns HTTP 409 with an actionable message. This
includes requesting a different size from the loaded model: guest requests
never trigger a download or implicitly switch the browser's selection. Invalid
requests return HTTP 400. Engine failures in an established stream produce an
OpenAI error event; an incomplete tool response never executes a partial tool.
The current HTTP mailbox admits one request at a time; overlapping sandbox
HTTP requests receive `EBUSY`. Pi normally finishes inference before executing
its tools. There is no additional request queue.

The independent model worker receives copied JSON and returns completion
chunks. Each worker `next` operation follows downstream demand. Qwen tool
responses use constrained JSON because this WebLLM release's native tool API
does not support Qwen. The small adapter converts that JSON into standard tool
calls and translates tool-result history into Qwen's conversation template.
An explanation before a tool envelope is preserved as assistant text alongside
the call; it does not turn a valid tool call into a plain-text answer.
It buffers at most 128 KiB of structured output and shows the answer/tool call
after that response finishes; ordinary text streams incrementally. It does not
repair malformed output or guess missing calls. Pi executes the resulting
tools in Dolly, using Dolly's filesystem and shell.

## Browser authority and assets

[`local-model-service.mjs`](../src/local-model-service.mjs) composes local and
remote policy independently. All `dolly.invalid` destinations are reserved,
including unknown services, HTTP variants, trailing dots and disabled routes.
They cannot fall through to browser Fetch. Image builders get no local service.
Local requests discard every header, including credentials. The extension's
`dolly-local` API key is a non-secret client placeholder.

[`webgpu-worker.mjs`](../src/webgpu-worker.mjs) owns the accelerator and permits
only the selected model's asset URLs in `config/webgpu-assets.json`, during
loading only. That manifest pins model revisions, model-library revisions,
lengths and SHA-256 digests. Small metadata, tokenizer and model Wasm files ship
as browser assets; identical bundled files are shared by content hash. Weight
shards download from the pinned Hugging Face revision when the user loads the
model. Those asset requests omit credentials and may follow the
model host's CDN redirects; their complete bytes must match the manifest.
Guest requests cannot select URLs, executable code, or engine options.

WebLLM's existing IndexedDB cache retains model assets at revision-stable keys,
independent of Dolly image recipes and release URLs. Model weights and GPU
state are outside `dolly.data` and userspace/session snapshots. Each request
supplies its complete conversation and resets the model's chat state.
Cancellation interrupts WebLLM, waits for it to settle, and terminates the
private worker after two seconds if necessary. Termination also rejects all
pending host promises. Idle models survive Pi restarts; leaving the page
disposes the worker. There is no cross-tab scheduler or service worker model.

The canonical Wasm ABI and its 28 imports are unchanged. The added browser
capability is bounded inference, exposed through `dolly_http_dispatch`, not
ambient Fetch, WebGPU, filesystem access or tool execution in Janis.

## Building and testing

After the normal runtime/image bootstrap:

```sh
npm ci
npm run build:webgpu
npm run image -- pi-local
node --test test/local-model.test.mjs test/http-broker.test.mjs
DOLLY_IMAGE=pi-local DOLLY_BROWSER_MODE=local-model ./scripts/test-browser.sh
npm run publish
npm run serve
```

The real-model browser test opens its own Chrome profile and window. On this
Linux setup it uses X11/Vulkan and explicit WebGPU flags; ordinary headless
Chrome did not expose the NVIDIA adapter. It never disables web security or
uses a native inference server. A GPU is required for this opt-in test.

Qwen 2B is a small integration default, not evidence of reliable autonomous
coding. wllama remains a later adapter, outside this first experiment.

References: [WebLLM worker support](https://webllm.mlc.ai/docs/user/advanced_usage.html),
[pinned WebLLM model catalog](https://github.com/mlc-ai/web-llm/blob/9e572d6ed95e248f29634996cd32cc8f3023d89d/src/config.ts),
[pinned Qwen model](https://huggingface.co/mlc-ai/Qwen3.5-2B-q4f16_1-MLC/tree/dd74e9c8a20c4546df85c844103bff87b6dcacad).
