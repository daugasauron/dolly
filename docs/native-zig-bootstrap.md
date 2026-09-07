# Native Zig bootstrap notes

The historical standalone Zig side-module design documented here was replaced
by private process executables. Clang/LLD live in
`/usr/libexec/dolly/process-bin/compiler`; Zig and its LLVM/LLD support live in
`/usr/bin/zig` in the `ghostty-build` image. Both use `dolly-process-0`, with
fresh memory on every invocation. No LLVM or
Zig bridge function remains in the resident kernel contract.

For the current implementation, file map, source adaptations, reproducibility
rules, and browser proof, see [Native Zig and Ghostty](zig-ghostty.md). For the
reason this follows the process shape of a Linux toolchain, see
[the process model](process-model.md).
