"""Verified source downloads shared by the Rust image preparation scripts."""
import hashlib
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile

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



def crate_licences(archives, stage, destination):
    """Map each crate archive's own licence and notice files to DESTINATION/CRATE-VERSION."""
    licences = stage / "crate-licences"
    for archive in sorted(archives.glob("*.crate")):
        with tarfile.open(archive) as crate:
            for member in crate.getmembers():
                if member.isfile() and re.fullmatch(r"[^/]+/(?i:licen[cs]e|copying|copyright|notice|unlicense)[^/]*", member.name):
                    crate.extract(member, licences, filter="data")
    return [licences, destination]
