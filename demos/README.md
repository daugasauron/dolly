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
- [javascript](javascript/README.md): QuickJS-ng, Janis and TypeScript.
- [llvm](llvm/README.md): LLVM, Clang and LLD built inside Dolly by its own `cc`, and the resulting compiler.
- [local-llm](local-llm/README.md): llama.cpp and model packages for Pi.
- [neovim](neovim/README.md): Neovim with Lua and Tree-sitter parsers.
- [pi](pi/README.md): the Pi coding agent.
- [python](python/README.md): CPython and stock pip over the HTTP broker.
- [rts](rts/README.md): Seven Kingdoms matches between two Pi players.
- [rust](rust/README.md): the Rust compiler seed, Patti, ripgrep and fd.
- [sdl2](sdl2/README.md): SDL2 over the Dolly framebuffer.
- [slopyard](slopyard/README.md): Slopyard and the raylib/Box3D gamedev SDK.
- [studio](studio/README.md): Dollyfile Studio.
- [sysroot](sysroot/README.md): the libraries every program links, rebuilt inside Dolly and held against the seed's.
- [wine](wine/README.md): Wine 4.0.4 as one wasm64 process: a desktop with Notepad, WineMine and ReactOS Paint, and an interpreter for small x86-64 Windows programs.
- [zero-ad](zero-ad/README.md): 0 A.D. Release 28 and its OpenAL build.
