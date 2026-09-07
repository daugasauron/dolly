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
4. Run `dollyfile-build --open RECIPE`. The user reviews the recipe and clicks
   **Build and open**; logs stream back while a fresh sandbox builds the image.
   The reserved tab opens the verified result only after a successful build.
5. On a build error, fix the corresponding FILE body or SLOP command **in the
   recipe**, lint and retry. Error paths belong to the disposable builder, not
   this Studio filesystem. A successful lint or local compilation is not a
   successful image build. Report the actual build/test results.

Use `dollyfile-build RECIPE` without `--open` when only a build is requested.
Do not invoke `/bin/dollyfile` directly in Studio: it replaces the running image.
The build does not inherit Studio's files or credentials. Ctrl+C cancels it
without discarding Studio. The existing HTTP broker mediates approval and network
policy; protocol details are in `/usr/share/dollyfile-studio/build-service.md`.

## Important language details

- `DOLLY 3`, then `IMAGE name`; FROM is the first image operation.
- FILE body lines start with **four spaces**, including blank content lines.
  The example shows this indentation. FILE is not a shell heredoc: no `<<EOF`.
- Compile with `cc`; write executables to `/usr/bin`. `EXPORTS TOOL name`
  takes only the command's PATH name, not an extra path. No chmod is needed.
- SLOP executes ordinary shell commands sequentially and fails on errors.
  For stdin tests, pipe text: `printf 'input\n' | tool`. `< PATH` reads a file;
  it does not supply inline text. Check results with `test "$(COMMAND)" = EXPECTED`.
- Own and remove build scratch under `/tmp`. Do not retain credentials or agent
  history. A local `.dm` is not a published HOST dependency; inline its steps.
- ENTRY is mandatory and final. The tool example enters a Slop prompt.
  COPY FROM copies files, not environment or named exports.

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
