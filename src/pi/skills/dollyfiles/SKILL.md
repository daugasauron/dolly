---
name: dollyfiles
description: Create, edit, lint and build custom Dollyfile images in Dollyfile Studio, using Pi and Neovim inside the browser sandbox.
---

# Create a Dolly image

Work on recipes in `/workspace` using Pi's read/write/edit tools. This image has
Neovim, `cc`, C++, Git and Slop. Pi's `bash` tool executes Slop, not Bash.
Check `command -v TOOL` before assuming other tools exist; Python and Zig are
not installed. No native host processes or sockets are available.

## Authoring workflow

1. For a new C command, **copy**
   `/usr/share/dollyfile-studio/examples/Dollyfile-tool` to the requested recipe
   path, then read that copy. `Dollyfile-hello` in the same directory is a simpler
   greeting/shell base. Preserve the example's complete FROM line: its path and
   hash are already correct. Do not recreate it from memory. For other bases or
   external sources, read `/usr/share/dollyfile-studio/dollyfile.md` first and
   inspect the published recipes in `/etc/dolly/recipes`.
2. Edit the copy's IMAGE name, FILE contents, compiler command, exports and SLOP
   tests to implement the request. Replace example arguments/tests that no longer
   apply. Put input/output checks **inside the recipe as SLOP lines**, after
   compilation and before scratch cleanup. New commands belong to the built
   image; building it does not install those commands in Studio.
3. Run `dollyfile-lint RECIPE`. This checks syntax, not build success.
4. Run `dollyfile-build RECIPE`. It starts immediately in a fresh sandbox and
   streams logs back; test builds need no user approval. After success the user
   may click **Open image** to launch it in a new tab. Do not wait for that click
   to inspect build results or iterate on the recipe.
5. On a build error, fix the corresponding FILE body or SLOP command **in the
   recipe**, lint and retry. Error paths belong to the disposable builder, not
   this Studio filesystem. A successful lint or local compilation is not a
   successful image build. Report the actual build/test results.

Do not invoke `/bin/dollyfile` directly in Studio: it replaces the running image.
The build does not inherit Studio's files or credentials. Ctrl+C cancels it
without discarding Studio. The existing HTTP broker mediates build limits and network
policy; protocol details are in `/usr/share/dollyfile-studio/build-service.md`.

## Important language details

- `DOLLY 3`, then `IMAGE name`; FROM is the first image operation.
- FILE body lines start with **four spaces**, including blank content lines.
  The example shows this indentation. FILE is not a shell heredoc: no `<<EOF`.
- Compile with `cc`; write executables to `/usr/bin`. `EXPORTS TOOL name`
  takes only the command's PATH name, not an extra path. No chmod is needed.
- SLOP executes ordinary shell commands sequentially and fails on errors.
  Keep each command on one logical line; use `printf 'a\nb\n'` for newlines
  in test data, or put a multiline script in FILE and run it with Slop.
  For stdin tests, pipe text: `printf 'input\n' | tool`. `< PATH` reads a file;
  it does not supply inline text. Check results with `test "$(COMMAND)" = EXPECTED`.
- Own and remove build scratch under `/tmp`. Do not retain credentials or agent
  history. A local `.dm` is not a published HOST dependency; inline its steps.
- ENTRY is mandatory and final. The tool example enters a Slop prompt.
  COPY FROM copies files, not environment or named exports.

## Porting upstream programs

`SOURCE HOST` assets from **other modules and images** can be inspected with
`curl`; they are published web assets, not access to the PC's filesystem.
Read the module recipe under `/etc/dolly/recipes` for the exact path and pin.
The current release's base URL is in `/etc/dolly/host.base`, including any
deployment prefix. For example, inspect QuickJS's recipe and C source without
installing that module:

```sh
base=$(cat /etc/dolly/host.base)
curl -f "${base}modules/quickjs.dm"
curl -f "${base}static/default/runtimes/quickjs-main.c"
```

For archives, download with `curl -f URL -o /tmp/NAME.tar`, compare `sha256sum`
with the recipe pin, then extract with `tar -xf ARCHIVE -C SCRATCH_DIRECTORY`.
Create and clean your scratch directory; Dolly's small tar does not support `-t`.
Use the same published HOST path and pin in the new recipe; do not turn it into
a localhost URL. Reading an archive does not make its tools available in Studio.

Check runtime requirements before writing a large build recipe. PTYs,
`fork`/`forkpty` and local Unix sockets are not implemented: tmux needs platform
work, not just ncurses/libevent archives. Do not replace required libraries with
empty headers or successful no-op functions to claim a working port.

HTTP status 0 means no readable browser response, not proof of an allowlist.
The default site permits HTTP(S) and caller-requested redirects (`curl -L`),
with byte/time limits but no lifetime request quota. Fetch still enforces CORS.
SOURCE downloads require a direct URL. A site operator may
impose additional policy. Changing curl to Git cannot bypass this. Use a
published HOST source or an upstream
CORS-enabled URL; raw.githubusercontent.com can serve binary files too.
Do not invent HOST paths or pins: inspect the published recipes, download an
accessible source once and run `sha256sum` on its bytes. If transport fails,
report the URL and error separately from missing runtime APIs. Preserve the
draft rather than repeatedly trying equivalent download endpoints.

## Editor, models and files

For interactive Neovim, syntax highlighting, linting and headless editing, read
[neovim.md](neovim.md). Interactive nvim needs the shell, not Pi's captured tool.

Ctrl+Shift+L opens the browser model picker; the user must explicitly load a model.
Pi's `/model` selection must match that loaded model. Studio defaults to Qwen 2B;
`/login` also supports configured remote providers. Pi cannot load GPU weights
itself. `/dolly-hello`, `/dolly-tool` and `/dolly-fix` are small starting prompts.

`download RECIPE` exports the draft; the site's **Run a Dollyfile** page accepts
text/file uploads. `upload /workspace/input` asks the user to choose one PC file,
without exposing host paths or overwriting existing targets. Ctrl+Shift+S saves
the Studio session in this browser. Custom result images cannot yet use named
session save/load, so keep their recipes; a result URL is not a portable image.
