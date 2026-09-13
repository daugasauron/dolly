# Separate compiler build bases from the interactive system image

- STATUS: CLOSED
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

## Progress

Snapshot export now uses the existing headless image-build worker instead of
booting the terminal and ENTRY after compilation. Chrome exported the default
image in 3.11 seconds; all 154,337,413 bytes match the published snapshot
(SHA256 `758ba8912bf12e891dc984f604cb7412582fce34baac46165871b9068c7b55f1`).
This removes the exporter dependency on DISPLAY; recipe separation remains open.

The compiler base now contains bootstrap/core-tools/tar/make/C++. Rust SDK adds
zlib/gzip and the Rust seed; rust-build adds curl/Patti. Ghostty builds separately
from the compiler base. System composes its interactive utilities, display and
rg/fd artifacts. Codex derives from system; rust-tools combines system with the
finished Rust SDK/Patti so its interactive utilities remain available.

Actual builds caught rustc.sh's undeclared dirname dependency; shell expansion
now locates the SDK without a subprocess. gzip is its own module instead of
pulling Git-dependent agent-tools into the compiler build.

Verified on 2026-09-13 in the isolated core-iteration worktree:

- Compiler base: 123,117,597 bytes, 15.3 s browser build. Rust SDK: 375,495,528
  bytes, 17.9 s. Patti layer: 376,133,210 bytes, 10.1 s.
- Ripgrep: 112.6 s; fd: 154.0 s, entirely through Patti inside Chrome. No Git,
  Ghostty or default-startup recipes occur in either producer's dependency graph.
- Default: 154,278,999 bytes. Every retained non-recipe file is byte-identical to
  deployed main. Recipe records changed; one redundant /usr/include/c++ parent
  directory record disappeared, while all C++ headers remain and compile.
- Chrome process-smoke: 17.93 s, including C++23, shared files/environment,
  fresh invocations, HTTP, pipes/poll and C/C++ DSOs.
- Interactive rust-tools: 14.97 s for real proc-macro builds, Cargo workspace
  compilation via Patti and reuse with --resume.
- New headless build page: cancel/retry and verified cached compiler artifact
  under /dolly/ prefix, 15.81 s. Static menu/layout checks pass.
- Two isolated cold rust-build builds plus one cached build produced identical
  bytes: SHA256 35d66e56ea4ae058101ec4ec510ec433d371c8d38b85d095c653bdf09f3c77af.
- All 333 Node tests pass in 5.33 s with the rebuilt default/rust-tools selection;
  the graph/module pair passes independently.

Pi and Studio rebuilt successfully from the new system. Chrome verified Pi's
actual upstream ensureTool/grep/find paths for system rg/fd, without download
warnings. Studio's 10.67 s browser check launches Pi, exercises its prompts and
literal filenames, and checks visible Neovim highlighting/lint recovery.
Chrome and Firefox also pass default rg/fd behavior in the new core gate.
All 53 artifact checks pass for the rebuilt core/Pi/Studio selection.

Resolved in 2c441d4. CMake still inherits display and Rust tools through system;
its measured 1,320-second rebuild motivates the separately tracked follow-up
[compiler consumer dependencies](../20260913-130851-codex-18/TASK.md).
