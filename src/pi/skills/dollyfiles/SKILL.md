---
name: dollyfiles
description: Create, edit, lint and build custom Dollyfile images in Dollyfile Studio, using Pi and Neovim inside the browser sandbox.
---

# Create a Dolly image

Work on recipes in `/workspace`. This image has Pi, Neovim, a C/C++ compiler,
Git and Slop. The shell tool is called `bash` for Pi compatibility, but executes
Slop. Check `command -v TOOL` before assuming another tool is installed. There
are no native host processes or sockets, and the image does not include Zig.

Use `/usr/share/dollyfile-studio/dollyfile.md` for language details when needed.
Start with the relevant example, not every installed source:
`/usr/share/dollyfile-studio/examples/Dollyfile-hello` is a
greeting plus shell; `Dollyfile-tool` compiles a separate C executable.
These examples contain the current release's real system-image pin.

## Authoring workflow

1. Pick the smallest existing base that supplies the requested tools. Start
   from an example or inspect `/etc/dolly/recipes/*.Dollyfile` and
   `/etc/dolly/recipes/modules/*.dm` for the installed image's provenance.
2. Use Pi's `read`, `write`, and `edit` tools to work on a new `/workspace`
   recipe. Preserve files the user already edited. Do not overwrite their
   running `/etc/dolly/Dollyfile` or startup scripts to test a draft.
3. Run `dollyfile-lint /workspace/Dollyfile`. This uses the same inspection
   parser as the browser uploader. It checks syntax only: a successful lint
   does not prove pins, URLs, compiler commands, exports or startup behavior.
4. Check a new program with an ordinary small build/run in a scratch directory
   when possible, and clean that directory. The complete image still needs a
   fresh sandbox build. Do not run `/bin/dollyfile` against the active Pi session:
   its FROM and retention operations deliberately replace image state.
5. Run `dollyfile-build /workspace/Dollyfile` to submit a fresh sandbox build.
   The browser shows the recipe for user approval; logs stream back to the tool.
   A nonzero exit is failure: inspect the compiler/builder error, edit the draft,
   and retry. Lint and a scratch compilation are not a successful image build.
   Paths in build errors belong to the disposable builder. Edit the matching
   FILE body or SLOP line in your recipe, not that builder's `/tmp` path in Studio.
   Use `dollyfile-build --open /workspace/Dollyfile` when the user wants to run it:
   **Build and open** reserves a tab on their approval click and launches the
   verified result when ready. Otherwise **Open image** is offered after success.
   Ctrl+C or the browser's Cancel stops only the build, not this Studio session.

The build service accepts raw recipe text at
`https://build.dolly.invalid/v1/builds` (POST), or `/v1/builds/open`. It uses the
existing HTTP broker, not a native compiler/server. Builds use the same network
policy, cannot call browser-local services, and are limited to one at a time,
128 KiB recipes, 8 MiB logs and 45 minutes. For protocol details, read
`/usr/share/dollyfile-studio/build-service.md`. No credentials or files from the
active Studio session are automatically copied into the fresh build.

When exporting a recipe, use Pi's `download` tool or `download /workspace/Dollyfile`.
The site's **Run a Dollyfile** page also accepts pasted/uploaded recipes.

Custom uploads are tab-local and cannot currently be saved as named sessions.
Keep the recipe itself. Ctrl+Shift+S saves the Studio session's files in this
browser; it does not publish a new image. `upload /workspace/input` requests a
file chooser for one PC file; the user must choose it, and existing targets
are never overwritten. No host path is exposed to Pi.

## Important language details

- Start with `DOLLY 3`, then `IMAGE name`. ENTRY is mandatory and final.
- `FROM HOST /Dollyfile-system HASH` must be the first image operation. HASH
  is SHA-256 of the exact referenced recipe bytes, not an image name, snapshot
  digest or placeholder. For this installed base, calculate it with
  `sha256sum /etc/dolly/recipes/system.Dollyfile`.
- Only images/modules and HOST inputs published by this site can be referenced.
  A locally created `.dm` file cannot become a new `USE HOST` dependency just
  by hashing it. For a self-contained upload, inline its steps in one Dollyfile.
  Consult the source viewer when selecting another published base; do not
  invent a hash or assume an old release's pin is still accepted.
- `SOURCE URL https://... /destination HASH` fetches exact external bytes.
  Browser CORS and broker policy still apply. Obtain and verify the digest;
  never guess one or use a moving URL for a supposedly reproducible input.
  SOURCE does not extract archives: include a suitable tool and a SLOP step.
- A FILE body has **four leading spaces on every line**, including blank
  content lines. Those four spaces are removed. Body text is literal.
- SLOP executes sequentially and fails on command errors. Put multi-step
  logic in a FILE shell script when it makes quoting easier to review.
  Use conventional Slop/POSIX syntax, not Bash arrays or process substitution.
- Compile `/tmp/build/tool.c` to `/usr/bin/tool`, then `EXPORTS TOOL tool`.
  TOOL is a name resolved through PATH, not an absolute path. No chmod step
  is necessary. COPY FROM copies files, not environment or named exports.
- Keep shipped assets under `/usr/share`, source under `/usr/src`, and build
  scratch under a module-owned `/tmp` directory. Do not retain `/workspace`,
  credentials, or agent session history in an image. Clean scratch when done.
- Startup and recovery are ordinary image scripts. A foreground application
  may quit; include a Slop fallback if that is the intended experience. The
  browser does not automatically choose a recovery shell. See the hello
  example and this image's `/etc/dolly/init.slop`.

## Neovim in this image

For **interactive editing**, the user leaves Pi using Ctrl+D on an empty input
(or `/exit`) and runs `nvim /workspace/Dollyfile` at the Slop prompt. `i` enters
insert mode; Escape returns to normal; `:w` saves, `:q` quits, `:wq` does both.
Run `pi` at the shell to return. Do not launch interactive nvim through Pi's
captured `bash` tool: it does not own an interactive terminal there.

The built-in Dollyfile plugin recognizes Dollyfile, Dollyfile-* and *.dm.
It highlights syntax, sets four-space indentation and lints on save.
`:DollyLint` checks the current buffer without saving it. Diagnostics point to
the failing line; `:lua vim.diagnostic.open_float()` explains it. There is no
LSP, and linting never runs SLOP, downloads sources, or alters the image.

Pi can use `nvim --headless -l SCRIPT.lua` for deterministic editor operations;
it skips user configuration/plugins and exits after the script. To load the
Studio plugin, use `nvim --headless -S SCRIPT.lua` and quit explicitly in the
script. Prefer normal edit/write tools for simple changes. `:!COMMAND` runs
Slop; PTY `:terminal`, detached jobs and LuaJIT FFI are not supported by this port.

## Models and starting prompts

The Studio defaults to the WebGPU Qwen3.5 2B provider. The user first opens
Ctrl+Shift+L and explicitly loads the model. No API key is required. `/model`
selects a loaded local model or a configured remote provider; `/login` can
configure supported remote providers. Pi cannot download GPU weights or bypass
browser policy itself. Unsupported GPUs/browsers need a remote provider.

`/dolly-hello`, `/dolly-tool` and `/dolly-fix` are installed prompt templates.
They perform small, inspectable tasks with these examples. Local models are
limited: make one change at a time, preserve known-good pins, inspect diffs,
and use lint/build results instead of trusting generated explanations.
