#!/usr/bin/env python3
"""Stage the sources of rustc, its standard library and its LLVM as the seed's build prepared them; compile nothing."""
from pathlib import Path
import shutil
import subprocess

from rust_sources import cargo_config, crate_licences, vendor

project = Path(__file__).resolve().parents[2]
# demos/rust/toolchain/prepare.sh and build-llvm.sh: pinned, verified, patched.
port = project / "build/rustc-port"
stage = project / "build/rust-sources/rustc"
shutil.rmtree(stage, ignore_errors=True)
stage.mkdir(parents=True)

# The source component carries what the repository archive lacks to build std:
# the backtrace submodule and std's own crates.
library = port / "toolchain/lib/rustlib/src/rust/library"
archives = vendor(port / "rust/Cargo.lock", stage / "vendor", stage / "archives")
for crate in sorted((library / "vendor").iterdir()):
    if not (stage / "vendor" / crate.name).exists():
        shutil.copytree(crate, stage / "vendor" / crate.name)
# The compiler's identity, as the seed's build states it, ends the [env] table.
identity = subprocess.run(
    ["bash", "-c", 'source "$0"; for name in ${!CFG_*} RUSTC_INSTALL_BINDIR; do printf \'%s = "%s"\\n\' "$name" "${!name}"; done',
     str(project / "demos/rust/toolchain/env.sh")], check=True, capture_output=True, text=True).stdout
cargo_config(stage, "/tmp/rustc/vendor", (project / "demos/rust/config/rustc.toml").read_text() + identity)
mappings = [stage / ".cargo", "/tmp/rustc/.cargo", stage / "vendor", "/tmp/rustc/vendor",
            port / "rust/compiler", "/tmp/rustc/source/compiler",
            port / "rust/Cargo.toml", "/tmp/rustc/source/Cargo.toml",
            port / "rust/Cargo.lock", "/tmp/rustc/source/Cargo.lock",
            *crate_licences(archives, stage, "/usr/share/licenses/rust/crates")]
for name in ["libc", "libc-186", "jobserver"]:
    mappings += [port / name, f"/tmp/rustc/{name}"]
mappings += [entry for path in sorted(library.iterdir()) if path.name not in {"vendor", ".cargo"}
             for entry in (path, f"/tmp/rustc/source/library/{path.name}")]
output = project / "build/rust-sources/rustc.tar.gz"
subprocess.run(["node", str(project / "scripts/build-source-tar.mjs"), str(output), *map(str, mappings)], check=True)
print(output)


def tree(name, *skipped):
    return [entry for path in sorted((port / "llvm-source" / name).iterdir()) if path.name not in skipped
            for entry in (path, f"/tmp/rust-llvm/{name}/{path.name}")]


# What CMake configures and rustc's LLVM libraries compile; mlgo-utils links
# three scripts to their real copies.
output = project / "build/rust-sources/rust-llvm.tar.gz"
subprocess.run(["node", str(project / "scripts/build-source-tar.mjs"), str(output), *map(str, [
    *tree("llvm", "test", "unittests", "docs", "examples", "benchmarks", "utils"),
    *tree("llvm/utils", "mlgo-utils", "gn"),
    *tree("llvm/utils/mlgo-utils", "combine_training_corpus.py", "extract_ir.py", "make_corpus.py"),
    *tree("cmake"), *tree("third-party", "benchmark", "unittest")])], check=True)
print(output)
