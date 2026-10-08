#!/usr/bin/env python3
"""Stage verified sources for offline Cargo image builds; compile nothing."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile

project = Path(__file__).resolve().parents[2]
name, = sys.argv[1:]
pin = json.loads((project / "demos/rust/config/sources.json").read_text())[name]
from rust_sources import cargo_config, crate_licences, download, lock_sdk_libc, vendor


stage = project / "build/rust-sources" / name
shutil.rmtree(stage, ignore_errors=True)
stage.mkdir(parents=True)
with tarfile.open(download(pin["url"], pin["sha256"])) as archive:
    archive.extractall(stage, filter="data")
source = stage / pin["directory"]
if name == "ripgrep":
    (source / "HomebrewFormula").unlink()


def apply(directory, patch):
    subprocess.run(["patch", "--batch", "--fuzz=0", "-p1", "-d", str(directory),
                    "-i", str(project / "demos/rust" / patch)], check=True)


if name == "cargo":
    # No TLS, SSH or HTTP/2 library in Wasm: the browser carries HTTPS.
    apply(source, "config/patches/cargo-features.patch")
    # What a Rust source tarball carries for `cargo --version`: the pinned
    # commit, its short form and its date, as the 1.98.1 release prints them.
    commit = pin["directory"].removeprefix("cargo-")
    (source / "git-commit-info").write_text(f"{commit}\n{commit[:9]}\n2026-08-05\n")
    for link in [path for path in source.rglob("*") if path.is_symlink()]:
        target = link.resolve()
        link.unlink()
        if target.is_dir():
            shutil.copytree(target, link)
        else:
            shutil.copyfile(target, link)
libc = lock_sdk_libc(source / "Cargo.lock")
archives = vendor(source / "Cargo.lock", stage / "vendor", stage / "archives")
adapted = {
    "fd": [("nix-0.31.3", "config/patches/nix-hostname.patch"),
           ("jiff-0.2.29", "config/patches/jiff-timezone.patch")],
    "cargo": [("socket2-0.6.4", "config/patches/socket2.patch"),
              ("zlib-rs-0.6.4", "config/patches/zlib-rs.patch"),
              ("is_executable-1.0.6", "config/patches/is_executable.patch"),
              ("git2-curl-0.22.0", "config/patches/git2-curl.patch"),
              ("jiff-0.2.31", "config/patches/jiff-timezone.patch"),
              ("jobserver-0.1.34", "toolchain/jobserver.patch"),
              ("jobserver-0.1.34", "config/patches/jobserver-in-process.patch")],
}
for crate, patch in [libc, *adapted.get(name, [])]:
    apply(stage / "vendor" / crate, patch)
extra = project / "demos/rust/config" / f"{name}.toml"
cargo_config(source, f"/tmp/{name}/vendor", extra.read_text() if extra.exists() else "")

output = project / "build/rust-sources" / f"{name}.tar.gz"
subprocess.run(["node", str(project / "scripts/build-source-tar.mjs"), str(output),
                str(source), f"/tmp/{name}/source", str(stage / "vendor"), f"/tmp/{name}/vendor",
                *map(str, crate_licences(archives, stage, f"/usr/share/licenses/{name}/crates"))], check=True)
print(output)
