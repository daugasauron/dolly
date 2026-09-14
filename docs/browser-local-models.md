# Local models inside Dolly

`pi-local` and Dollyfile Studio run upstream llama.cpp as an ordinary Wasm64
process. Janis runs Pi's provider, conversation formatting and model downloader.
The executable owns tokenization, model loading, sampling and inference
scheduling. Only generic buffers, WGSL pipelines and command packets cross the
[Dolly GPU ABI](gpu.md); the browser has no model engine or local inference HTTP
service. No native server or remote inference fallback is involved.

Open `/pi-local/` and use Pi's `/model` picker. Qwen3.5-0.8B is the default;
its verified weights are included in Pi-local and Studio. The first prompt
checks the GPU and loads the model from `/usr/share/dolly/llm` without a model
download. Pi's status line shows generation speed. Escape interrupts a turn;
the next turn reloads the model. `/local-unload` releases its process and GPU
resources. Pi executes complete validated tool calls using ordinary Dolly tools.

| Model | Q4_K_M weights | Context / maximum output |
| --- | ---: | ---: |
| Qwen3.5-0.8B (included) | 580 MB | 8,192 / 2,048 tokens |
| Qwen3.5-2B | 1.40 GB | 8,192 / 2,048 tokens |
| Qwen3.5-4B | 3.01 GB | 8,192 / 2,048 tokens |

These are file sizes, not total RAM or VRAM requirements. Each tab holds
weights in the Wasm filesystem, the inference process and GPU allocations.
Small Qwen models can use tools but are not dependable autonomous coding models.
Thinking and image input are disabled in this first adapter.

## Browser and storage requirements

Use HTTPS or localhost and a WebGPU adapter exposing `shader-f16`. Missing GPU
support fails before downloading weights. Optional subgroups are used when
available. This backend requires f16 and does not select CPU-only inference when the GPU
is unavailable. Upstream scheduling can still assign unsupported operations to
the Wasm CPU backend.

On the tested Linux desktop Firefox exposes `shader-f16` with WebGPU enabled.
The isolated Chrome test uses Vulkan and
`--enable-dawn-features=vulkan_enable_f16_on_nvidia`; Chrome otherwise hides f16
on this NVIDIA adapter. This is an experimental Dawn testing option, not a
portable requirement or a setting changed in personal browser profiles.
See [Dawn's toggle definitions](https://dawn.googlesource.com/dawn/+/refs/heads/main/src/dawn/native/Toggles.cpp).

For a separate Chrome profile on this Linux desktop, with the preview server
running on port 9097:

```sh
google-chrome --user-data-dir=/tmp/dolly-local-llm \
  --ozone-platform=x11 --enable-unsafe-webgpu --use-angle=vulkan \
  --enable-features=Vulkan,VulkanFromANGLE \
  --enable-dawn-features=vulkan_enable_f16_on_nvidia \
  http://127.0.0.1:9097/pi-local/
```


The default weights arrive with the image and use its existing IndexedDB image
cache. Refresh and session restore recover them from that base; unchanged model
bytes are excluded from saved filesystem deltas. Pi-local is 822 MB and Studio
858 MB before compression. The initial image load includes the weights.

Optional 2B/4B weights download through Dolly's normal network broker, verify
SHA-256, and live in volatile `/run/dolly-llm`. They survive model unload/restart
in the same tab, but need downloading again after refresh or session restore.
Settings, conversation logs and workspace files are saved normally.
Engine diagnostics are in `~/.cache/dolly-llm/engine.log`.

## Build and interface

[`Dollyfile-llama-build`](../Dollyfile-llama-build) builds unchanged pinned
llama.cpp sources and WGSL inside Dolly with its C/C++ compiler and CMake.
[`Dollyfile-local-llm-build`](../Dollyfile-local-llm-build) links the small Dolly
WebGPU C adapter and command against those cached libraries.
[`Dollyfile-pi-local`](../Dollyfile-pi-local) copies the executable into Pi and
installs the provider and pinned 0.8B weights. Editing the adapter or provider
reuses the compiler and upstream-library images. The core build took 159 seconds
here; rebuilding the command took 13 seconds. Including the weights took 27
seconds for Pi-local and 16 seconds for Studio.

`scripts/prepare-local-llm.sh` only fetches verified source archives and official
Dawn C/C++ headers, then packages them. It compiles no native inference code.
Source revisions and hashes are in `config/source-pins.sh`; model revisions,
lengths and hashes are in `src/local-llm/models.json`. The C adapter implements
only the WebGPU functions exercised by this upstream backend. It does not
include Dawn's JavaScript runtime or provide ambient browser capabilities.

`dolly-llama --check` reports GPU availability. For direct use:

```sh
dolly-llama /usr/share/dolly/llm/Qwen3.5-0.8B.gguf 8192
```

Stdin accepts one JSON object per line with `prompt`, `max_tokens`,
`temperature`, `top_p` and `seed`. Stdout emits a ready record, token byte arrays
and completion timing/usage, or an error. Stderr holds diagnostics. The process
keeps weights loaded between requests and resets inference state for each full
conversation. Pi uses pipes, not HTTP, and only admits one turn at a time.
Cancellation terminates that private process; the kernel retires its GPU scope.

Weight downloads use verified 32 MiB HTTP ranges, within the existing per-request
response bound. They remain subject to the embedding's normal destination,
redirect and quota policy. Local inference makes no network requests once its
weights are loaded.

Build with `npm run image -- pi-local`; run the opt-in real-model check with
`node test/local-llm-browser.mjs`. Real browser evidence, measurements and
remaining limitations are recorded in the
[inference checkpoint](../tasks/20260914-150636-llm-in-image/TASK.md) and
[bundled model task](../tasks/20260914-153257-llm-bundled-weights/TASK.md).
