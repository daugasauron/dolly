"""Verified downloads and Cargo's offline layout, shared by the Rust image preparation scripts."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile
import tomllib

project = Path(__file__).resolve().parents[2]
cache = project / ".cache/rust-sources"
cache.mkdir(parents=True, exist_ok=True)


def download(url, checksum):
    path = cache / checksum
    if not path.exists():
        with tempfile.NamedTemporaryFile(dir=cache, delete=False) as file:
            temporary = Path(file.name)
        subprocess.run(["curl", "--fail", "--location", "--silent", "--show-error",
                        "--retry", "3", url, "-o", str(temporary)], check=True)
        if hashlib.sha256(temporary.read_bytes()).hexdigest() != checksum:
            raise ValueError(f"source checksum mismatch: {url}")
        temporary.replace(path)
    if hashlib.sha256(path.read_bytes()).hexdigest() != checksum:
        raise ValueError(f"cached source checksum mismatch: {url}")
    return path


# Every project compiles the libc source the wasm64 standard library uses.
LIBC = ("0.2.186", "68ab91017fe16c622486840e4c83c9a37afeff978bd239b5293d61ece587de66")


def lock_sdk_libc(lock):
    """Point LOCK's libc at the version the Rust SDK patches."""
    text, count = re.subn(
        r'(name = "libc"\nversion = )"[^"\n]+"(\nsource = "registry[^"\n]+"\nchecksum = )"[^"\n]+"',
        rf'\1"{LIBC[0]}"\2"{LIBC[1]}"', lock.read_text())
    if count != 1:
        raise ValueError(f"{lock} does not lock one libc")
    lock.write_text(text)
    return f"libc-{LIBC[0]}", f"toolchain/libc-{LIBC[0]}.patch"


def vendor(lock, destination, archives):
    """Extract LOCK's registry crates to DESTINATION/NAME-VERSION, as Cargo's directory source reads them."""
    archives.mkdir()
    destination.mkdir()
    for package in tomllib.loads(lock.read_text())["package"]:
        if "checksum" not in package:
            continue
        crate = f'{package["name"]}-{package["version"]}'
        url = f'https://static.crates.io/crates/{package["name"]}/{crate}.crate'
        shutil.copyfile(download(url, package["checksum"]), archives / f"{crate}.crate")
        with tarfile.open(archives / f"{crate}.crate") as source:
            # Prebuilt Windows import libraries: most of the bytes, never read here.
            members = [m for m in source.getmembers() if not m.name.endswith((".a", ".lib"))]
            source.extractall(destination, members=members, filter="data")
        # No file checksums: an adapted crate keeps its archive's identity.
        (destination / crate / ".cargo-checksum.json").write_text(
            json.dumps({"files": {}, "package": package["checksum"]}))
    return archives


def cargo_config(source, vendored, extra=""):
    """From SOURCE down, Cargo takes crates from VENDORED and builds as the Rust seed is built."""
    config = source / ".cargo/config.toml"
    config.parent.mkdir(exist_ok=True)
    # Upstream's own configuration serves its developers' commands, not a build.
    config.write_text(f'''[source.crates-io]
replace-with = "vendored-sources"

[source.vendored-sources]
directory = "{vendored}"

[profile.dev]
opt-level = 1
debug = 0
panic = "abort"
debug-assertions = false
overflow-checks = false
codegen-units = 16
{extra}''')


def crate_licences(archives, stage, destination):
    """Map each crate archive's own licence and notice files to DESTINATION/CRATE-VERSION."""
    licences = stage / "crate-licences"
    for archive in sorted(archives.glob("*.crate")):
        with tarfile.open(archive) as crate:
            for member in crate.getmembers():
                if member.isfile() and re.fullmatch(r"[^/]+/(?i:licen[cs]e|copying|copyright|notice|unlicense)[^/]*", member.name):
                    crate.extract(member, licences, filter="data")
    return [licences, destination]
