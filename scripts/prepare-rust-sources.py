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
if name == "ripgrep":
    # Use the same libc source/layout as the wasm64 standard library.
    text, count = re.subn(
        r'(name = "libc"\n)version = "0\.2\.177"\nsource = "[^"\n]+"\nchecksum = "[^"\n]+"\n',
        r'\1version = "0.2.186"\n', lock.read_text())
    if count != 1:
        raise ValueError("ripgrep's locked libc version changed")
    lock.write_text(text)
    (source / "HomebrewFormula").unlink()
archives = stage / "archives"
archives.mkdir()
for package in tomllib.loads(lock.read_text())["package"]:
    if "checksum" not in package:
        continue
    filename = f'{package["name"]}-{package["version"]}.crate'
    url = f'https://static.crates.io/crates/{package["name"]}/{filename}'
    shutil.copyfile(download(url, package["checksum"]), archives / filename)
output = project / "build/rust-sources" / f"{name}.tar"
subprocess.run(["node", str(project / "scripts/build-source-tar.mjs"), str(output),
                str(source), f"/tmp/{name}/source",
                str(archives), f"/tmp/{name}/cache/archives"], check=True)
print(output)
