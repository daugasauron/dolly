#!/usr/bin/env python3
"""Prepare PhotoCraft's pinned sources, its git dependencies and its crates for an offline Cargo
build; all compilation happens in Dolly."""
import gzip
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import tomllib

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "rust"))
from rust_sources import cargo_config, crate_licences, download, inputs_key, keep, kept, lock_sdk_libc, project, vendor  # noqa: E402

config = Path("demos/photocraft/config")
parts = Path("build/photocraft-source-parts")
platform = project / "demos/photocraft/platform"
key = inputs_key(Path(__file__), project / config, platform)
if kept(parts, key):
    sys.exit()
stage = Path("build/photocraft-sources")
shutil.rmtree(stage, ignore_errors=True)
stage.mkdir(parents=True)
pins = json.loads((config / "sources.json").read_text())


def unpack(pin, destination):
    temporary = stage / "unpack"
    temporary.mkdir()
    with tarfile.open(download(pin["url"], pin["sha256"])) as archive:
        archive.extractall(temporary, filter="data")
    root, = temporary.iterdir()
    root.rename(destination)
    temporary.rmdir()


def apply(directory, patch):
    subprocess.run(["patch", "--batch", "--fuzz=0", "-p1", "-d", str(directory),
                    "-i", str(patch.resolve())], check=True)


photocraft = stage / "photocraft"
unpack(pins["photocraft"], photocraft)
lock_path = photocraft / "Cargo.lock"
revisions = {p.get("source", "").partition("#")[2] for p in tomllib.loads(lock_path.read_text())["package"]}
git = stage / "git"
git.mkdir()
for pin in pins["git"]:
    assert pin["revision"] in revisions
    unpack(pin, git / pin["revision"])
winit, = (git / pin["revision"] for pin in pins["git"] if "/storytold/winit/" in pin["url"])


# Cargo fetches a git dependency even when a patch stands in for it. Each reference to a pinned
# revision, in any manifest and whatever keys sit beside it, becomes its package's path in that
# checkout, and the lock names the packages as paths. Other revisions are of crates outside the
# lock's graph.
def checkout(match):
    entry = match["entry"]
    name = re.search(r'package = "([\w-]+)"', entry)
    name = name[1] if name else match["name"]
    revision = re.search(r'rev = "([0-9a-f]{40})"', entry)[1]
    if not (git / revision).is_dir():
        return match[0]
    manifest, = (path for path in (git / revision).rglob("Cargo.toml")
                 if tomllib.loads(path.read_text()).get("package", {}).get("name") == name)
    directory = "/tmp/photocraft-sources/git/" + manifest.parent.relative_to(git).as_posix()
    entry = re.sub(r'git = "[^"\n]+"', f'path = "{directory}"', entry)
    entry = re.sub(r',? ?rev = "[0-9a-f]{40}"', "", entry)
    return f'{match["name"]} = {entry}'


references = re.compile(r'^(?P<name>[\w-]+) = (?P<entry>\{[^}\n]*git = "[^"\n]+"[^}\n]*\})$', re.M)
for manifest in [photocraft / "Cargo.toml", *sorted(git.rglob("Cargo.toml"))]:
    manifest.write_text(references.sub(checkout, manifest.read_text()))
assert 'git = "' not in (photocraft / "Cargo.toml").read_text()
lock_path.write_text(re.sub(r'\nsource = "git\+[^"\n]+"| \(git\+[^)"\n]+\)', "", lock_path.read_text()))

libc = lock_sdk_libc(lock_path)
archives = vendor(lock_path, stage / "vendor", stage / "archives")
apply(stage / "vendor" / libc[0], project / "demos/rust" / libc[1])
# Dolly's target in crates that do not know it yet, as Codex's are patched
# (demos/rust/config/patches), for the versions this lock names; ring's applies as it is.
for patch in [*sorted((config / "patches").glob("*.patch")), project / "demos/rust/config/patches/ring.patch"]:
    directory, = (stage / "vendor").glob(f"{patch.stem}-[0-9]*")
    apply(directory, patch)
# Dolly's platforms in winit and wgpu, as Godot's is in Godot: display@0 and input@0 for a window,
# gpu@0 for the browser's WebGPU, and the window handle that names one to the other.
shutil.copytree(platform / "winit", winit / "src/platform_impl/dolly", ignore=shutil.ignore_patterns("*.patch"))
apply(winit, platform / "winit/winit.patch")
wgpu, = (stage / "vendor").glob("wgpu-[0-9]*")
shutil.copytree(platform / "wgpu", wgpu / "src/backend/dolly")
# Locked on every platform and compiled on none of Dolly's: Windows bindings keep their manifest
# and an empty library.
for directory in (stage / "vendor").iterdir():
    if re.match(r"(winapi|windows)[-_]", directory.name):
        for path in directory.iterdir():
            if path.name not in {"Cargo.toml", ".cargo-checksum.json"}:
                shutil.rmtree(path) if path.is_dir() else path.unlink()
        (directory / "src").mkdir()
        (directory / "src/lib.rs").touch()
cargo_config(photocraft, "/tmp/photocraft-sources/vendor")

mappings = [(photocraft, "/tmp/photocraft-sources/photocraft"), (git, "/tmp/photocraft-sources/git"),
            (stage / "vendor", "/tmp/photocraft-sources/vendor"),
            tuple(crate_licences(archives, stage, "/usr/share/licenses/photocraft/crates"))]
for directory, _ in mappings:
    for path in directory.rglob("*") if directory.is_dir() else []:
        if path.is_symlink():
            target = path.resolve()
            if not target.is_relative_to(stage.resolve()) or not target.is_file():
                raise ValueError(f"unsupported source link: {path}")
            data = target.read_bytes()
            path.unlink()
            path.write_bytes(data)
archive = Path("build/photocraft-sources.tar")
subprocess.run(["node", "scripts/build-source-tar.mjs", str(archive),
                *[str(value) for mapping in mappings for value in mapping]], check=True)
compressed = archive.with_suffix(".tar.gz")
with archive.open("rb") as source, compressed.open("wb") as file:
    with gzip.GzipFile(filename="", mode="wb", fileobj=file, mtime=0) as output:
        shutil.copyfileobj(source, output)
shutil.rmtree(parts, ignore_errors=True)
parts.mkdir()
with compressed.open("rb") as source:
    number = 0
    while data := source.read(40 * 1024 * 1024):
        (parts / f"sources-{number:02d}.part").write_bytes(data)
        number += 1
keep(parts, key)
print(f"PhotoCraft sources: {number} parts, {compressed.stat().st_size} bytes")
