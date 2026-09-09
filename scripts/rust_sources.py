"""Verified source downloads shared by the Rust image preparation scripts."""
import hashlib
from pathlib import Path
import subprocess
import tempfile

project = Path(__file__).resolve().parents[1]
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

