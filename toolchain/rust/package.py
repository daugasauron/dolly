#!/usr/bin/env python3
"""Stage the exact compiler and standard-library Cargo artifacts for the seed."""
import json
import pathlib
import shutil
import sys

project = pathlib.Path(__file__).resolve().parents[2]
port = project / "build/rustc-port"
if len(sys.argv) != 3:
    raise SystemExit("usage: package.py COMPILER-ARTIFACTS.jsonl SDK-ARTIFACTS.jsonl")
stage = port / "package"
link = stage / "rust-link"
sdk = stage / "rust-sdk/lib/rustlib/wasm64-emscripten-probe/lib"
link.mkdir(parents=True, exist_ok=True)
sdk.mkdir(parents=True, exist_ok=True)
for previous in link.glob("*.a"):
    previous.unlink()
for previous in sdk.glob("*.rlib"):
    previous.unlink()
artifacts = {}
records = pathlib.Path(sys.argv[1])
for line in records.read_text().splitlines():
    record = json.loads(line)
    if record.get("reason") != "compiler-artifact":
        continue
    for name in record["filenames"]:
        if "/wasm64-emscripten-probe/" in name and name.endswith(".rlib"):
            artifacts[pathlib.Path(name)] = record

for source, record in artifacts.items():
    archive = source.with_suffix(".a").name
    shutil.copyfile(source, link / archive)
sdk_records = pathlib.Path(sys.argv[2])
for line in sdk_records.read_text().splitlines():
    record = json.loads(line)
    if record.get("reason") != "compiler-artifact":
        continue
    if ("/toolchain/lib/rustlib/src/" in record["manifest_path"]
            or "rustc-dep-of-std" in record["features"]):
        for name in record["filenames"]:
            if "/wasm64-emscripten-probe/" in name and name.endswith(".rlib"):
                source = pathlib.Path(name)
                shutil.copyfile(source, sdk / source.name)

deps = port / "target/wasm64-emscripten-probe/debug/deps"
# The main object and the allocator shim are distinct translation units.
main, = (p for p in deps.glob("rustc_main-*.o") if ".rcgu." not in p.name)
allocator, = (p for p in deps.glob(main.stem + ".*.rcgu.o") if ".rustc_main." not in p.name)
shutil.copyfile(main, link / "rustc-main.o")
shutil.copyfile(allocator, link / "allocator.o")
shutil.copyfile(port / "wasm64-emscripten-probe.json", stage / "rust-sdk/wasm64-emscripten-probe.json")
shutil.copyfile(port / "wasm64-emscripten-probe.json", sdk.parent / "target.json")
sdk_root = stage / "rust-sdk"
(sdk_root / "bin").mkdir(exist_ok=True)
licenses = sdk_root / "licenses"
licenses.mkdir(exist_ok=True)
for name in ("LICENSE-APACHE", "LICENSE-MIT", "COPYRIGHT"):
    shutil.copyfile(port / "rust" / name, licenses / name)
print(f"Staged {len(artifacts)} compiler archives and {len(list(sdk.glob('*.rlib')))} SDK libraries")

shutil.copytree(port / "libc-186", sdk_root / "src/libc", dirs_exist_ok=True)
shutil.copyfile(port / "llvm-source/llvm/LICENSE.TXT", licenses / "LLVM-LICENSE.TXT")
