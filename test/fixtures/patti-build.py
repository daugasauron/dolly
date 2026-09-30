"""Black-box checks of Patti's compiler commands, run with test/fixtures/rustc-mock.py."""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile

patti, root = str(Path(sys.argv[1]).resolve()), Path(sys.argv[2])
files = {
    "Cargo.toml": '[workspace]\nmembers=["app","native","pre"]\n',
    "shared.txt": "one",
    "app/Cargo.toml": '[package]\nname="app"\nversion="1.0.0"\n'
                      '[dependencies]\nnative={path="../native"}\npre={path="../pre"}\ncrate="1"\n'
                      '[[bin]]\nname="tool"\n',
    "app/src/main.rs": "",
    "app/src/bin/tool.rs": 'const SHARED: &str = include_str!("../../../shared.txt");',
    "native/Cargo.toml": '[package]\nname="native"\nversion="1.0.0"\n',
    "native/build.rs": "echo cargo:rustc-link-search=native=/opt/native-libs",
    "native/src/lib.rs": "",
    "pre/Cargo.toml": '[package]\nname="pre"\nversion="0.1.0-alpha.1"\n',
    "pre/src/lib.rs": "",
}
for name, text in files.items():
    (root / name).parent.mkdir(parents=True, exist_ok=True)
    (root / name).write_text(text)
archive = root / "cache/archives/crate-1.0.0.crate"
archive.parent.mkdir(parents=True)
with tarfile.open(archive, "w:gz") as output:
    for name, text in {"Cargo.toml": '[package]\nname="crate"\nversion="1.0.0"\n', "src/lib.rs": ""}.items():
        entry = tarfile.TarInfo("crate-1.0.0/" + name)
        entry.size = len(text)
        output.addfile(entry, io.BytesIO(text.encode()))
(root / "Cargo.lock").write_text(
    'version=4\n[[package]]\nname="app"\nversion="1.0.0"\ndependencies=["crate","native","pre"]\n'
    '[[package]]\nname="native"\nversion="1.0.0"\n[[package]]\nname="pre"\nversion="0.1.0-alpha.1"\n'
    '[[package]]\nname="crate"\nversion="1.0.0"\n'
    'source="registry+https://github.com/rust-lang/crates.io-index"\n'
    f'checksum="{hashlib.sha256(archive.read_bytes()).hexdigest()}"\n')
log = root / "rustc.log"


def build():
    log.write_text("")
    subprocess.run([patti, "build", "--offline", "--resume", "--manifest-path", str(root / "app/Cargo.toml"),
                    "--bin", "tool", "--cache", str(root / "cache"), "--target-dir", str(root / "target")],
                   check=True, stdout=subprocess.DEVNULL)
    return {command[command.index("--crate-name") + 1]: command
            for command in map(json.loads, log.read_text().splitlines())}


commands = build()
assert commands["tool"][2] == str(root / "app/src/bin/tool.rs"), commands["tool"]
assert "--cap-lints" in commands["crate"]
assert not any("--cap-lints" in commands[name] for name in ["tool", "native", "pre", "build_script_build"])
for name in ["native", "tool"]:
    search = [commands[name][i + 1] for i, argument in enumerate(commands[name]) if argument == "-L"]
    assert "native=/opt/native-libs" in search, (name, search)
assert build() == {}, "an unchanged resumed build recompiled"
(root / "shared.txt").write_text("two")
assert list(build()) == ["tool"], "a changed include_str! input outside the package was reused"
print("PATTI-BUILD-PASSED")
