# Separate compiler build bases from the interactive system image

- STATUS: OPEN
- PRIORITY: 350
- TAGS: audit,core,build

## Evidence

Reviewed deployed main `ff633f7` on 2026-09-13. Its default build has eight images:

```text
ghostty-build -> system-build -> rust-sdk -> rust-tools -> ripgrep
                                                      -> fd-build
system-build + ripgrep + fd-build -> system -> default
```

Here arrows mean build dependency to consumer. [system-build](https://github.com/daugasauron/dolly/blob/ff633f72f5f6c28439196d61fe573730c2739ed8/Dollyfile-system-build)
imports the whole default C/C++ userspace, Git and Ghostty. Rust builders therefore
depend on interactive-system utilities and display/font packaging.

Experiment: copy only Dollyfile* and modules/*.dm to temporary directories,
normalize with updateRecipePins, append a comment to one module, repin, and compare
recipe bytes. Git changes **31/32** image identities, Ghostty **32/32**, ripgrep
**25/32**. Even startup-default affects default and Codex: Codex derives from the
interactive default recipe. These are measured identity changes; cold rebuild
times were not measured. Exact source provenance should still retain comments.

The actual default snapshot is **147.19 MiB**, with a 74.71 MiB compiler, 4.20 MiB rg,
and 3.77 MiB fd. It retains neither Rust SDK/build trees nor /tmp or /workspace.
All eight ancestor snapshots passed recipe/entry identity and byte digest checks.
Together those full snapshots occupy 2,175.78 MiB and duplicate their retained bases.
C/C++ compilation is intentional functionality, so stripping the compiler is not the proposed shortcut.

## Done when

- Define a compiler/build base containing the actual prerequisites of upstream builds; compose interactive utilities, display and application startup above it.
- Measure actual Rust build command requirements before choosing that base; avoid a new general-purpose dependency framework.
- Keep source-built rg/fd, licenses, provenance and working C/C++ in the default system; verify them and Pi/Studio consumers in a browser.
- A startup edit must not rebuild tool producers; unrelated Git or display edits must not rebuild Rust compilers/tools.
- Document the small image DAG and validate exported-file/dependency closure using existing retention checks.
