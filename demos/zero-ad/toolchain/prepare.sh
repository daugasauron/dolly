#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/../../.."
source config/source-pins.sh
project_dir="$PWD"
cache="$PWD/.cache/0ad"
mkdir -p "$cache/downloads" "$cache/host-tools/bin" "$cache/host-tools/lib" "$cache/bin"
fetch() { bash scripts/fetch-verified-file.sh "$1" "$2" "$3" >/dev/null; }
fetch "$DOLLY_0AD_SOURCE_URL" "$DOLLY_0AD_SOURCE_SHA256" "$cache/0ad-$DOLLY_0AD_VERSION-unix-build.tar.xz"
source_dir="$cache/0ad-$DOLLY_0AD_VERSION"
if [[ ! -d "$source_dir" ]]; then
  tar -xf "$cache/0ad-$DOLLY_0AD_VERSION-unix-build.tar.xz" -C "$cache"
fi
sm="$source_dir/libraries/source/spidermonkey/mozjs-128.13.0"
patch_key="$(sha256sum demos/zero-ad/toolchain/spidermonkey.patch | cut -d' ' -f1)"
if [[ ! -d "$sm" ]]; then
  tar -xf "$sm.tar.xz" -C "$(dirname -- "$sm")"
  (cd "$sm" && sh ../patches/patch.sh)
  patch --batch --fuzz=0 -d "$sm" -p1 < demos/zero-ad/toolchain/spidermonkey.patch
elif [[ ! -f "$sm/.dolly-patch" ]]; then
  patch --reverse --dry-run --batch --fuzz=0 -d "$sm" -p1 < demos/zero-ad/toolchain/spidermonkey.patch
elif [[ "$(cat "$sm/.dolly-patch")" != "$patch_key" ]]; then
  echo "SpiderMonkey patch changed; prepare a fresh $sm directory." >&2
  exit 1
fi
printf '%s\n' "$patch_key" > "$sm/.dolly-patch"

# Reuse the repository's pinned native Rust bootstrap and target libc patches.
rust_key="$(sha256sum demos/rust/toolchain/bootstrap-sources.json demos/rust/toolchain/std.patch demos/rust/toolchain/libc-*.patch | sha256sum | cut -d' ' -f1)"
if [[ ! -f "$cache/toolchain/.0ad-inputs" || "$(cat "$cache/toolchain/.0ad-inputs")" != "$rust_key" ]]; then
  while read -r name url checksum; do
    fetch "$url" "$checksum" "$cache/downloads/$name"
    tar -xf "$cache/downloads/$name" -C "$cache/downloads"
    "$cache/downloads/${name%.tar.xz}/install.sh" --prefix="$cache/toolchain" --disable-ldconfig
    rm -rf -- "$cache/downloads/${name%.tar.xz}"
  done < <(python3 - <<'PY'
import json
for package in json.load(open('demos/rust/toolchain/bootstrap-sources.json')):
    print(package['name'], package['url'], package['sha256'])
PY
  )
  patch --batch --fuzz=0 -d "$cache/toolchain/lib/rustlib/src/rust" -p1 < demos/rust/toolchain/std.patch
  while read -r version directory checksum; do
    fetch "https://static.crates.io/crates/libc/libc-$version.crate" "$checksum" "$cache/downloads/libc-$version.crate"
    mkdir -p "$cache/$directory"
    tar -xf "$cache/downloads/libc-$version.crate" --strip-components=1 -C "$cache/$directory"
    patch --batch --fuzz=0 -d "$cache/$directory" -p1 < "demos/rust/toolchain/libc-$version.patch"
  done <<'PINS'
0.2.185 libc 52ff2c0fe9bc6cb6b14a0592c2ff4fa9ceb83eea9db979b0487cd054946a2b8f
0.2.186 libc-186 68ab91017fe16c622486840e4c83c9a37afeff978bd239b5293d61ece587de66
PINS
  printf '%s\n' "$rust_key" > "$cache/toolchain/.0ad-inputs"
fi

export CARGO_HOME="$cache/cargo-home" RUSTC="$cache/toolchain/bin/rustc" RUSTC_BOOTSTRAP=1
if [[ ! -x "$cache/host-tools/bin/cbindgen" ]]; then
  systemd-run --user --scope --quiet -p MemoryMax=4G -p MemorySwapMax=0 \
    "$cache/toolchain/bin/cargo" install --locked --version 0.26.0 --root "$cache/host-tools" cbindgen -j2
fi
# These are build tools only. The guest never imports native host libraries.
for tool in m4 pkg-config; do
  binary="$(command -v "$tool")"
  output="$cache/bin/$tool"
  [[ "$tool" != pkg-config ]] || output+=.real
  cp "$binary" "$output"
  while read -r library; do cp -L "$library" "$cache/host-tools/lib/"; done < <(
    ldd "$binary" | awk '$2 == "=>" && $3 ~ /^\// && $1 !~ /^lib(c|m|dl|rt|pthread)\.so/ {print $3}')
done
cat > "$cache/bin/pkg-config" <<'SH'
#!/usr/bin/env bash
export LD_LIBRARY_PATH=/src/.cache/0ad/host-tools/lib
export PKG_CONFIG_LIBDIR=/src/.cache/0ad/sysroot/lib/pkgconfig
exec /src/.cache/0ad/bin/pkg-config.real "$@"
SH
chmod +x "$cache/bin/pkg-config"

mkdir -p "$cache/rust-bootstrap/src"
cp demos/zero-ad/toolchain/rust-bootstrap.toml "$cache/rust-bootstrap/Cargo.toml"
printf 'pub fn pointer_bytes() -> usize { std::mem::size_of::<usize>() }\n' > "$cache/rust-bootstrap/src/lib.rs"
export CARGO_TARGET_DIR="$cache/rust-target" RUSTFLAGS='-C relocation-model=pic -C embed-bitcode=yes'
systemd-run --user --scope --quiet -p MemoryMax=4G -p MemorySwapMax=0 \
  "$cache/toolchain/bin/cargo" build --manifest-path "$cache/rust-bootstrap/Cargo.toml" \
  --release --target "$project_dir/demos/rust/toolchain/wasm64-emscripten-probe.json" \
  --message-format=json-render-diagnostics -Zbuild-std=std,panic_abort -Zjson-target-spec \
  --config "patch.crates-io.libc.path=\"$cache/libc-186\"" \
  --config 'patch.crates-io.libc-std.package="libc"' \
  --config "patch.crates-io.libc-std.path=\"$cache/libc\"" -j2 > "$cache/rust-bootstrap.jsonl"
python3 - "$cache" <<'PY'
import json, pathlib, shutil, sys
root = pathlib.Path(sys.argv[1])
libraries = []
for line in (root / 'rust-bootstrap.jsonl').read_text().splitlines():
    artifact = json.loads(line)
    if artifact.get('reason') == 'compiler-artifact':
        libraries.extend(pathlib.Path(f) for f in artifact['filenames'] if f.endswith('.rlib'))
assert len(libraries) >= 20, 'Incomplete Rust standard library build'
destination = root / 'toolchain/lib/rustlib/wasm64-emscripten-probe/lib'
destination.mkdir(parents=True, exist_ok=True)
for old in destination.glob('*.rlib'):
    old.unlink()
for library in libraries:
    shutil.copy2(library, destination / library.name)
PY
if [[ ! -d "$cache/zlib" ]]; then
  cp -a "$(bash scripts/fetch-pinned-checkout.sh zlib)" "$cache/zlib"
fi
