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

project = Path(__file__).resolve().parents[1]
name, = sys.argv[1:]
pin = json.loads((project / "config/rust/sources.json").read_text())[name]
from rust_sources import download


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
mappings = [source, f"/tmp/{name}/source", archives, f"/tmp/{name}/cache/archives"]
if name == "fd":
    def apply(directory, patch):
        subprocess.run(["patch", "--batch", "--fuzz=0", "-p1", "-d", str(directory),
                        "-i", str(project / "config/rust/patches" / patch)], check=True)

    apply(source, "fd-serial.patch")
    for crate, patch in [("ignore-0.4.31", "ignore-serial-prune.patch"),
                         ("nix-0.31.3", "nix-hostname.patch"),
                         ("jiff-0.2.29", "jiff-timezone.patch")]:
        with tarfile.open(archives / f"{crate}.crate") as archive:
            archive.extractall(stage, filter="data")
        directory = stage / crate
        apply(directory, patch)
        mappings += [directory, f"/tmp/fd/{crate}"]

output = project / "build/rust-sources" / f"{name}.tar"
subprocess.run(["node", str(project / "scripts/build-source-tar.mjs"), str(output),
                *map(str, mappings)], check=True)
print(output)
