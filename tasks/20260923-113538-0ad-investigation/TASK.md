# Investigate 0 A.D. on the Blockwalker checkpoint

- STATUS: CLOSED
- PRIORITY: 100
- TAGS: research,wasm64,gpu,gamedev

Requested: branch from the Blockwalker checkpoint and investigate what it would
take to run 0 A.D. on Dolly. Completion means a source-grounded feasibility
report with bounded probes, not an implemented game port.

Branch: `codex/0ad-investigation-20260923`.
Base: `aa281009978e41323b93bef88de42d633bc63d56`, explicitly confirmed by the user.
Worktree: `/home/daug/dev/dolly/work/0ad-investigation`.
The original checkout and the main/Blockwalker branch refs were not changed.

## Result

[The report](../../docs/0ad-feasibility.md) covers the target build, dependencies,
SpiderMonkey, threads, renderer/shaders, assets/memory, audio, multiplayer,
agent integration and staged acceptance criteria. Source target: official 0 A.D.
28 archive and tag `v0.28.0` at `a2cae4d69f816e9e9d7eecb6bf88f762afc0c90d`.

- [Unmodified architecture check](architecture-probe.log): wasm64 compilation
  fails at upstream `arch.h:88`.
- [SpiderMonkey configuration](spidermonkey-configure.log): bundled 128.13.0
  rejects `wasm64-unknown-wasi` with `Unknown CPU type: wasm64`. The probe used
  the unpatched nested source archive; inspection of the shipped WFG patch
  series found no addition of wasm64 target detection.
- [Browser arithmetic result](fixed-browser.json): Chrome 151.0.7922.71 passes
  18,694 assertions against the actual upstream fixed-point header after the
  [architecture-only overlay](architecture.patch). `wasm-dis` confirms
  `(memory $0 i64 1)`. No math implementation was changed.

The positive probe has no imports and does not exercise Dolly's process ABI,
shared memory, libc, the whole simulation, rendering or gameplay. It is a small
portability check. No GPU workload was launched. Full game performance and
memory requirements remain unmeasured; the report marks these as future gates.

## Reproduce the architecture and arithmetic probes

Run from this worktree root with Podman and the pinned SDK available. Source
archives and build outputs stay in ignored `.cache`; the source download is
about 165 MB. The game data archive is not needed for these probes.

```sh
task=tasks/20260923-113538-0ad-investigation
cache=.cache/0ad-investigation
mkdir -p "$cache"
curl -fL https://releases.wildfiregames.com/0ad-0.28.0-unix-build.tar.xz \
  -o "$cache/0ad-0.28.0-unix-build.tar.xz"
printf '%s  %s\n' \
  27e217755ef76a922fe58dbf593d96e54b6ed2375d23f548c35619aa6bd5a42a \
  "$cache/0ad-0.28.0-unix-build.tar.xz" | sha256sum -c -
tar -xf "$cache/0ad-0.28.0-unix-build.tar.xz" -C "$cache"
source_dir="$cache/0ad-0.28.0"
sdk=docker.io/emscripten/emsdk:6.0.8@sha256:8714ed3a9fb585e662c931259a996bac36a57a8dd34b81e8277436fd77364475
sdk_run() {
  podman run --rm --pull=never --network=none --memory=1g --memory-swap=1g \
    --userns=keep-id -v "$PWD:/work" -w /work "$sdk" "$@"
}
printf '#include "lib/sysdep/arch.h"\nstatic_assert(sizeof(void*) == 8);\n' \
  > "$cache/architecture.cpp"
sdk_run em++ -m64 -std=c++20 -I"$source_dir/source" \
  -fsyntax-only "$cache/architecture.cpp"
# Expected exit 1: architecture not correctly detected.

mkdir -p "$cache/overlay/lib/sysdep"
cp "$source_dir/source/lib/sysdep/arch.h" "$cache/overlay/lib/sysdep/arch.h"
patch --silent "$cache/overlay/lib/sysdep/arch.h" "$task/architecture.patch"
sdk_run em++ -m64 -std=c++20 -DNDEBUG -O2 \
  -I"$cache/overlay" -I"$source_dir/source" \
  -c "$task/fixed-probe.cpp" -o "$cache/fixed.o"
sdk_run /emsdk/upstream/bin/wasm-ld -mwasm64 --no-entry \
  --export=pointer_bytes --export=fixed_mul --export=fixed_fraction \
  --export=fixed_round "$cache/fixed.o" -o "$cache/fixed.wasm"
sdk_run /emsdk/upstream/bin/wasm-dis "$cache/fixed.wasm"

# Requires this repository's playwright-core dependency and Chrome.
systemd-run --user --scope --quiet -p MemoryMax=1G -p MemorySwapMax=0 \
  timeout 45s node "$task/fixed-probe.mjs" "$cache/fixed.wasm"
```

The browser script launches headless Chrome with `--disable-gpu`. It checks
pointer width, 6,231 integer products, 6,231 signed fractions and 6,231 negative
infinity rounding results against a BigInt reference. These inputs deliberately
avoid overflow/division by zero; this does not replace the upstream math suite.

## Reproduce the early SpiderMonkey configure rejection

The engine source archive contains the nested Mozilla archive. For this early
probe only, omit large tests and vendored Rust code; keep the Python modules
needed to reach target detection. This extraction cannot support a full build.

```sh
mkdir -p "$source_dir/mozjs-source"
tar -xf "$source_dir/libraries/source/spidermonkey/mozjs-128.13.0.tar.xz" \
  -C "$source_dir/mozjs-source" \
  --exclude='*/js/src/tests' --exclude='*/js/src/jit-test' \
  --exclude='*/third_party/rust' --exclude='*/testing' \
  --exclude='*/intl/icu/source/test'
tar -xf "$source_dir/libraries/source/spidermonkey/mozjs-128.13.0.tar.xz" \
  -C "$source_dir/mozjs-source" --wildcards 'mozjs-128.13.0/testing/mozbase/*'
mozjs_dir="$PWD/$source_dir/mozjs-source/mozjs-128.13.0"
mkdir -p "$mozjs_dir/obj-dolly-probe"
(
  export MOZBUILD_STATE_PATH="$PWD/.cache/mozbuild"
  export MACH_BUILD_PYTHON_NATIVE_PACKAGE_SOURCE=none
  cd "$mozjs_dir/obj-dolly-probe"
  timeout 30s /usr/bin/python3 ../configure.py --enable-project=js \
    --target=wasm64-unknown-wasi --disable-jit --disable-shared-js \
    --without-intl-api --disable-tests --disable-js-shell
)
# Expected exit 1: Unknown CPU type: wasm64. Python was 3.10.12.
```

These configure options isolate target detection, not the final game's feature
set. A real target must preserve required Intl/ICU behavior and apply upstream's
WFG fixes. Reaching this error does not demonstrate that the remaining configure
checks, Rust components, compilation or linking succeed.

Verification: source archive digest checked; negative compiler/configure results
recorded; positive probe compiled with the pinned SDK and run in the real browser;
report local links and patch checked. Investigation complete. No implementation
or gameplay milestone is being marked complete by closing this research task.
