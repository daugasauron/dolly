#!/usr/bin/env python3
"""Stage verified source archives for offline Patti image builds; compile nothing."""
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import tomllib

project = Path(__file__).resolve().parents[2]
name, = sys.argv[1:]
pin = json.loads((project / "demos/rust/config/sources.json").read_text())[name]
from rust_sources import crate_licences, download


stage = project / "build/rust-sources" / name
shutil.rmtree(stage, ignore_errors=True)
stage.mkdir(parents=True)
with tarfile.open(download(pin["url"], pin["sha256"])) as archive:
    archive.extractall(stage, filter="data")
source = stage / pin["directory"]
lock = source / "Cargo.lock"
if name in {"ripgrep", "fd"}:
    # Use the same libc source/layout as the wasm64 standard library.
    version = {"ripgrep": "177", "fd": "189"}[name]
    text, count = re.subn(
        rf'(name = "libc"\n)version = "0\.2\.{version}"\nsource = "[^"\n]+"\nchecksum = "[^"\n]+"\n',
        r'\1version = "0.2.186"\n', lock.read_text())
    if count != 1:
        raise ValueError(f"{name}'s locked libc version changed")
    lock.write_text(text)
    if name == "ripgrep":
        (source / "HomebrewFormula").unlink()
archives = stage / "archives"
archives.mkdir()
for package in tomllib.loads(lock.read_text())["package"]:
    if "checksum" not in package:
        continue
    filename = f'{package["name"]}-{package["version"]}.crate'
    url = f'https://static.crates.io/crates/{package["name"]}/{filename}'
    shutil.copyfile(download(url, package["checksum"]), archives / filename)
mappings = [source, f"/tmp/{name}/source", archives, f"/tmp/{name}/cache/archives",
            *crate_licences(archives, stage, f"/usr/share/licenses/{name}/crates")]


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
    for unused in ["tests", "benches"]:
        shutil.rmtree(source / unused)
    for link in [path for path in source.rglob("*") if path.is_symlink()]:
        data = link.read_bytes()
        link.unlink()
        link.write_bytes(data)
adapted = {
    "fd": [("nix-0.31.3", "config/patches/nix-hostname.patch"),
           ("jiff-0.2.29", "config/patches/jiff-timezone.patch")],
    "cargo": [("socket2-0.6.4", "config/patches/socket2.patch"),
              ("zlib-rs-0.6.4", "config/patches/zlib-rs.patch"),
              ("is_executable-1.0.6", "config/patches/is_executable.patch"),
              ("git2-curl-0.22.0", "config/patches/git2-curl.patch"),
              ("jiff-0.2.31", "config/patches/jiff-timezone.patch"),
              ("jobserver-0.1.34", "toolchain/jobserver.patch"),
              ("jobserver-0.1.34", "config/patches/jobserver-configure.patch")],
}
for crate, patch in adapted.get(name, []):
    if not (stage / crate).exists():
        with tarfile.open(archives / f"{crate}.crate") as archive:
            archive.extractall(stage, filter="data")
        mappings += [stage / crate, f"/tmp/{name}/{crate}"]
    apply(stage / crate, patch)

output = project / "build/rust-sources" / f"{name}.tar"
subprocess.run(["node", str(project / "scripts/build-source-tar.mjs"), str(output),
                *map(str, mappings)], check=True)
print(output)
