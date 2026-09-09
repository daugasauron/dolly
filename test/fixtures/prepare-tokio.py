"""Package a probe from the same verified library sources used by Codex."""
from pathlib import Path
import shutil
import subprocess
import tomllib

source = Path("build/codex-sources")
codex = next(source.glob("codex-*/codex-rs"), None)
if codex is None:
    raise SystemExit("run python3 scripts/prepare-codex-sources.py first")
stage = Path("build/tokio-fixture")
shutil.rmtree(stage, ignore_errors=True)
probe = stage / "probe"
shutil.copytree("test/fixtures/rust/tokio", probe)
lock = (codex / "Cargo.lock").read_text()
(probe / "Cargo.lock").write_text(lock + '\n[[package]]\nname="dolly-tokio-probe"\nversion="0.0.0"\ndependencies=["libc", "tokio", "zlib-rs 0.5.5"]\n')
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
visit(next(p for p in records if p["name"] == "zlib-rs" and p["version"] == "0.5.5"))
archives = stage / "archives"
archives.mkdir()
for package in selected.values():
    if "checksum" in package:
        name = f'{package["name"]}-{package["version"]}.crate'
        shutil.copyfile(source / "archives" / name, archives / name)
mappings = [str(probe), "/tmp/tokio/probe", str(archives), "/tmp/tokio/cache/archives"]
for name in ["tokio-1.52.3", "mio-1.2.0", "socket2-0.6.3", "zlib-rs-0.5.5"]:
    mappings.extend([str(source / name), "/tmp/tokio/" + name])
subprocess.run(["node", "scripts/build-source-tar.mjs", "build/fixtures/tokio.tar", *mappings], check=True)
