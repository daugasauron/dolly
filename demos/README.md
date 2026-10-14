# Demos

Applications built on the core runtime and userspace. Each directory keeps its
`Dollyfile-*` recipes, sources, `prepare-sources.sh` hook, tests and
README. Demos may use each other; the core never uses a demo.

- [bhop](bhop/README.md): Airtime's Foundry strafe course with an optional agent.
- [classicube](classicube/README.md): ClassiCube block world with Pi agents.
- [closed-source-agent](closed-source-agent/README.md): Claude Code, downloaded from npm into the session after a notice.
- [cmake](cmake/README.md): CMake and libuv, a base for C/C++ ports.
- [codex](codex/README.md): the Codex CLI built from Rust source inside Dolly.
- [emacs](emacs/README.md): GNU Emacs for the terminal, as a package and an application.
- [game-agent](game-agent/README.md): agent code and the Codex relay shared by the games.
- [gpu-fluid](gpu-fluid/README.md): an upstream WebGPU fluid solver.
- [javascript](javascript/README.md): QuickJS-ng, Janis and TypeScript, each a package.
- [llvm](llvm/README.md): LLVM, Clang and LLD built inside Dolly by its own `cc`, and the resulting compiler.
- [local-llm](local-llm/README.md): llama.cpp and model packages for Pi.
- [mojo](mojo/README.md): the Mojo compiler built inside Dolly, as the package `mojo`; its programs run there, and in `mojo-gpu` with kernels on WebGPU.
- [neovim](neovim/README.md): Neovim with Lua and Tree-sitter parsers.
- [pi](pi/README.md): the Pi coding agent.
- [python](python/README.md): CPython and stock pip over the HTTP broker.
- [rts](rts/README.md): Seven Kingdoms matches between two Pi players.
- [rust](rust/README.md): rustc and Cargo built inside Dolly, ripgrep and fd.
- [sdl2](sdl2/README.md): SDL2 over the Dolly framebuffer.
- [slopyard](slopyard/README.md): Slopyard and the raylib/Box3D gamedev SDK.
- [speech](speech/README.md): speech to text from the microphone, and Pi on a phone with speech and buttons in place of a keyboard.
- [studio](studio/README.md): Dollyfile Studio.
- [tmux](tmux/README.md): tmux on pseudo-terminals, as a package and an application with two panes; libevent and NetBSD's terminfo library as packages.
- [tools](tools/README.md): SQLite, jq, the xz, zstd, bzip2, lz4 and pigz compressors, zip and unzip, tree, bc, xxd, base64, Meson, yacc and flex, wabt, mandoc, toybox's grep and sed, a tar that writes archives, a small vi and the dte editor, as packages built from their release archives.
- [wine](wine/README.md): Wine 4.0.4 as one wasm64 process: a desktop that is a folder, with Notepad, WineMine, ReactOS Paint, GIMP 2.2, the NetSurf browser (fetching through libcurl), a Command Prompt, and an interpreter for small x86-64 Windows programs with TinyCC to compile them.
- [xonotic](xonotic/README.md): Xonotic 0.8.6 on the DarkPlaces engine, built inside Dolly and drawn by its software rasterizer.
- [zig](zig/README.md): Zig 0.16 with its LLVM backend, built inside Dolly against LLVM 21.
- [zero-ad](zero-ad/README.md): 0 A.D. Release 28 and its OpenAL build.
