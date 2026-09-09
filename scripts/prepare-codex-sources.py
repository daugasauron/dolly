#!/usr/bin/env python3
"""Prepare pinned Codex sources and crate archives; all compilation happens in Dolly."""
import gzip
import json
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tomllib
from rust_sources import download

stage = Path("build/codex-sources")
shutil.rmtree(stage, ignore_errors=True)
stage.mkdir(parents=True)
pin = json.loads(Path("config/rust/sources.json").read_text())["codex"]
with tarfile.open(download(pin["url"], pin["sha256"])) as archive:
    archive.extractall(stage, filter="data")
codex = stage / pin["directory"] / "codex-rs"


def apply(directory, patch):
    subprocess.run(["patch", "--batch", "--fuzz=0", "-p1", "-d", str(directory),
                    "-i", str(patch.resolve())], check=True)


for name in ["arg0", "rustls-client", "sqlite-options", "process", "protoc", "clipboard",
             "hardening", "installation-id", "filesystem-walk", "tui-events", "device-login"]:
    apply(codex, Path(f"config/codex/{name}.patch"))
manifest = tomllib.loads((codex / "Cargo.toml").read_text())
lock_path = codex / "Cargo.lock"
original = tomllib.loads(lock_path.read_text())
versions = {}
for path in codex.rglob("Cargo.toml"):
    package = tomllib.loads(path.read_text()).get("package")
    if package is None:
        continue
    version = package["version"]
    versions[package["name"]] = manifest["workspace"]["package"]["version"] if isinstance(version, dict) else version


def reconcile(match):
    block = match.group()
    package = tomllib.loads(block)["package"][0]
    if "source" not in package and package["name"] in versions:
        block = re.sub(r'^version = ".*"$', f'version = "{versions[package["name"]]}"', block, flags=re.M)
    return block


lock_path.write_text(re.sub(r'\[\[package\]\].*?(?=\[\[package\]\]|\Z)', reconcile, lock_path.read_text(), flags=re.S))
records = tomllib.loads(lock_path.read_text())["package"]
assert [p for p in original["package"] if "source" in p] == [p for p in records if "source" in p]
adapted = []
for name, version in [("tokio", "1.52.3"), ("socket2", "0.6.3"), ("mio", "1.2.0"), ("zlib-rs", "0.5.5"), ("zlib-rs", "0.6.3"), ("cc", "1.2.55"),
                      ("ring", "0.17.14"), ("reqwest", "0.12.28"),
                      ("nix", "0.28.0"), ("nix", "0.30.1"), ("sqlx-sqlite", "0.9.0"), ("serial2", "0.2.33")]:
    record, = (p for p in records if p["name"] == name and p["version"] == version)
    source_archive = download(f'https://static.crates.io/crates/{name}/{name}-{version}.crate', record["checksum"])
    directory = stage / f'{name}-{record["version"]}'
    shutil.rmtree(directory, ignore_errors=True)
    with tarfile.open(source_archive) as source:
        source.extractall(stage, filter="data")
    if name == "nix":
        # Only errno uses the Linux variant names; values come from Emscripten libc.
        path = directory / "src/errno.rs"
        source = path.read_text()
        source = source.replace("linux_android", 'any(linux_android, target_os = "emscripten")')
        source = source.replace('all(target_os = "linux", not(target_arch = "mips"))',
                                'any(all(target_os = "linux", not(target_arch = "mips")), target_os = "emscripten")')
        source = source.replace('target_os = "redox",\n',
                                'target_os = "redox",\n                        target_os = "emscripten",\n', 1)
        path.write_text(source)
        path = directory / "src/sys/mod.rs"
        path.write_text(path.read_text().replace("pub mod ioctl;", """pub mod ioctl;
#[cfg(all(target_os = "emscripten", feature = "ioctl"))]
#[macro_use]
pub mod ioctl;"""))
        path = directory / "src/sys/ioctl/mod.rs"
        path.write_text(path.read_text().replace("linux_android", 'any(linux_android, target_os = "emscripten")'))
        path = directory / "src/sys/ioctl/linux.rs"
        path.write_text(path.read_text().replace('target_os = "android"',
                                                'any(target_os = "android", target_os = "emscripten")'))
        path = directory / "src/sys/signal.rs"
        call = "let res = unsafe { libc::sigwait(&self.sigset as *const libc::sigset_t, signum.as_mut_ptr()) };"
        path.write_text(path.read_text().replace(call, call + """
        #[cfg(target_os = "emscripten")]
        if res != 0 { return Err(Errno::from_raw(res)); }"""))
    elif name == "tokio":
        for suffix in ["target", "signal-pipe", "memory-fs"]:
            apply(directory, Path(f"config/rust/patches/tokio-{suffix}.patch"))
    else:
        subprocess.run(["patch", "--batch", "--forward", "--fuzz=0", "-p1", "-d", str(directory),
                        "-i", str(Path(f"config/rust/patches/{name}.patch").resolve())], check=True)
    if name == "reqwest":
        shutil.copyfile("config/rust/patches/reqwest-broker.rs", directory / "src/async_impl/dolly.rs")
    adapted.append(directory)

revisions = {p.get("source", "").partition("#")[2] for p in records}
git = stage / "git"
git.mkdir()
for pin in json.loads(Path("config/rust/codex-git.json").read_text()):
    revision = pin["revision"]
    assert revision in revisions
    unpack = stage / "git-unpack"
    unpack.mkdir()
    with tarfile.open(download(pin["url"], pin["sha256"])) as archive:
        archive.extractall(unpack, filter="data")
    root, = unpack.iterdir()
    root.rename(git / revision)
    unpack.rmdir()
    if patch := pin.get("patch"):
        apply(git / revision, Path(f"config/rust/patches/{patch}.patch"))

archives = stage / "archives"
archives.mkdir()
for package in records:
    if "checksum" not in package:
        continue
    filename = f'{package["name"]}-{package["version"]}.crate'
    path = download(f'https://static.crates.io/crates/{package["name"]}/{filename}', package["checksum"])
    shutil.copyfile(path, archives / filename)

mappings = [(codex, "/tmp/codex-sources/codex-rs"), (git, "/tmp/codex-sources/git"),
            (archives, "/tmp/patti-cache/archives")]
mappings += [(path, f"/tmp/codex-sources/{path.name}") for path in adapted]
mappings += [(codex.parent / name, f"/tmp/codex-sources/{name}") for name in ["LICENSE", "NOTICE"]]
for directory, _ in mappings:
    for path in directory.rglob("*") if directory.is_dir() else []:
        if path.is_symlink():
            target = path.resolve()
            if not target.is_relative_to(stage.resolve()) or not target.is_file():
                raise ValueError(f"unsupported source link: {path}")
            data = target.read_bytes()
            path.unlink()
            path.write_bytes(data)
archive = Path("build/codex-sources.tar")
subprocess.run(["node", "scripts/build-source-tar.mjs", str(archive), "--exclude-suffix=.snap",
                *[str(value) for mapping in mappings for value in mapping]], check=True)
compressed = archive.with_suffix(".tar.gz")
with archive.open("rb") as source, compressed.open("wb") as file:
    with gzip.GzipFile(filename="", mode="wb", fileobj=file, mtime=0) as output:
        shutil.copyfileobj(source, output)
parts = Path("build/codex-source-parts")
shutil.rmtree(parts, ignore_errors=True)
parts.mkdir()
with compressed.open("rb") as source:
    number = 0
    while data := source.read(40 * 1024 * 1024):
        (parts / f"sources-{number:02d}.part").write_bytes(data)
        number += 1
print(f"Codex sources: {number} parts, {compressed.stat().st_size} bytes")
