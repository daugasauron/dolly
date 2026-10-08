"""Package a probe from the same verified library sources used by Codex."""
from pathlib import Path
import shutil
import subprocess
import sys
import tomllib

source = Path("build/codex-sources")
codex = next(source.glob("codex-*/codex-rs"), None)
if codex is None:
    raise SystemExit("run python3 demos/codex/prepare-codex-sources.py first")
stage = Path("build/tokio-fixture")
shutil.rmtree(stage, ignore_errors=True)
probe = stage / "probe"
shutil.copytree("demos/rust/test/fixtures/rust/tokio", probe)
lock = (codex / "Cargo.lock").read_text()
(probe / "Cargo.lock").write_text(lock + '\n[[package]]\nname="dolly-tokio-probe"\nversion="0.0.0"\ndependencies=["crossterm", "libc", "tokio", "zlib-rs 0.5.5"]\n')
records = tomllib.loads(lock)["package"]
selected = {}


def visit(package):
    key = package["name"], package["version"]
    if key in selected:
        return
    selected[key] = package
    for dependency in package.get("dependencies", []):
        edge = dependency.split()
        child, = (p for p in records if p["name"] == edge[0] and (len(edge) == 1 or p["version"] == edge[1]))
        visit(child)


visit(next(p for p in records if p["name"] == "tokio"))
crossterm = next(p for p in records if p["name"] == "crossterm")
visit(crossterm)
visit(next(p for p in records if p["name"] == "zlib-rs" and p["version"] == "0.5.5"))
sys.path.insert(0, "demos/rust")
from rust_sources import cargo_config  # noqa: E402

cargo_config(probe, "/tmp/tokio/vendor")
# Codex's crossterm is a fork: the probe takes the same checkout by path.
checkout, = (path.parent for path in (source / "git").glob("*/Cargo.toml")
             if tomllib.loads(path.read_text()).get("package", {}).get("name") == "crossterm")
mappings = [str(probe), "/tmp/tokio/probe", str(checkout), "/tmp/tokio/crossterm"]
for package in selected.values():
    if "checksum" in package:
        crate = f'{package["name"]}-{package["version"]}'
        mappings.extend([str(source / "vendor" / crate), f"/tmp/tokio/vendor/{crate}"])
subprocess.run(["node", "scripts/build-source-tar.mjs", "build/fixtures/tokio.tar", *mappings], check=True)
