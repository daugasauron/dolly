"""Black-box checks of Patti's locked graph and source-cache integrity."""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile

patti = str(Path(sys.argv[1]).resolve())


def lockfile(root, records):
    (root / "Cargo.lock").write_text("version=4\n" + "".join(
        "[[package]]\n" + "".join(f"{key}={json.dumps(value)}\n" for key, value in record.items())
        for record in records))


def fetch(root, *extra, error=None, manifest="Cargo.toml"):
    result = subprocess.run([patti, "fetch", "--offline", "--manifest-path", str(root / manifest),
        "--cache", str(root / "cache"), "--target-dir", str(root / "target"), *extra],
        text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if error:
        assert result.returncode == 1 and error in result.stderr, result
        return
    assert result.returncode == 0, result.stderr
    return json.loads((root / "target/patti-build.json").read_text())


with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    (root / "Cargo.toml").write_text('[package]\nname="app"\nversion="1.0.0"\n'
                                   '[dependencies]\ncrate="1"\n')
    archives = root / "cache/archives"
    archives.mkdir(parents=True)
    archive = archives / "crate-1.0.0.crate"
    record = {"name": "crate", "version": "1.0.0",
              "source": "registry+https://github.com/rust-lang/crates.io-index"}

    def pin():
        record["checksum"] = hashlib.sha256(archive.read_bytes()).hexdigest()
        lockfile(root, [{"name": "app", "version": "1.0.0", "dependencies": ["crate"]}, record])

    for name, kind in [("../escape", tarfile.REGTYPE), ("crate-1.0.0/link", tarfile.SYMTYPE),
                       ("crate-1.0.0/../escape", tarfile.REGTYPE), ("/crate-1.0.0/escape", tarfile.REGTYPE)]:
        with tarfile.open(archive, "w:gz") as output:
            entry = tarfile.TarInfo(name)
            entry.type = kind
            output.addfile(entry)
        pin()
        fetch(root, error="unsupported archive member")
        assert not (root / "cache/sources/escape").exists()
    long_name = "crate-1.0.0/" + "long/" * 40 + "source.rs"
    for archive_format in [tarfile.PAX_FORMAT, tarfile.GNU_FORMAT, tarfile.USTAR_FORMAT]:
        with tarfile.open(archive, "w:gz", format=archive_format) as output:
            entry = tarfile.TarInfo("crate-1.0.0")
            entry.type = tarfile.DIRTYPE
            entry.mtime = 1153704088
            output.addfile(entry)
            files = {"crate-1.0.0/Cargo.toml": b'[package]\nname="crate"\nversion="1.0.0"\n',
                     "crate-1.0.0/source.rs": b"good"}
            if archive_format != tarfile.USTAR_FORMAT:
                files[long_name] = b"long path"
            for name, data in files.items():
                entry = tarfile.TarInfo(name)
                entry.size = len(data)
                entry.mtime = 1153704088
                if archive_format == tarfile.PAX_FORMAT:
                    entry.pax_headers["mtime"] = "1153704088.125"
                output.addfile(entry, io.BytesIO(data))
        pin()
        fetch(root)
        extracted = root / "cache/sources/crate-1.0.0"
        assert extracted.stat().st_mtime_ns == 1153704088000000000
        expected = 1153704088125000000 if archive_format == tarfile.PAX_FORMAT else 1153704088000000000
        for name in files:
            actual = (root / "cache/sources" / name).stat().st_mtime_ns
            assert actual == expected, (name, actual, expected)
        if archive_format != tarfile.USTAR_FORMAT:
            assert (root / "cache/sources" / long_name).read_bytes() == b"long path"
    source = root / "cache/sources/crate-1.0.0/source.rs"
    source.write_text("tampered")
    fetch(root)
    assert source.read_text() == "good"
    archive.write_bytes(b"corrupt")
    fetch(root, error="SHA-256 mismatch")
    archive.unlink()
    fetch(root, error="offline cache miss")

    manifests = {
        "app": '[dependencies]\na={workspace=true,features=["inherited"]}\nb={path="../b",version="1"}\n'
               'renamed={package="a",path="../a",version="1"}\n'
               '[features]\nstrong=["b/forward"]\nb=["unwanted"]\nunwanted=[]\n',
        "a": '[dependencies]\nb={path="../b",version="1",features=["enable"]}\n'
             '[features]\nbase=[]\ninherited=[]\n[lib]\nname="a_api"\n',
        "b": '[dependencies]\nc={path="../c",version="1",optional=true,default-features=false}\n'
             '[features]\ndefault=["c?/extra"]\nenable=["dep:c"]\n'
             'c=["dep:c","marker"]\nmarker=[]\nforward=["c/extra"]\n',
        "c": '[features]\nextra=["browser"]\n'
             '[target.\'cfg(target_os="browser")\'.dependencies]\nbrowser={version="1",optional=true}\n',
    }
    records = [{"name": name, "version": "1.0.0", "dependencies": deps}
               for name, deps in [("app", ["a", "b"]), ("a", ["b"]), ("b", ["c"]), ("c", [])]]
    lockfile(root, records)
    (root / "Cargo.toml").write_text('[workspace]\nmembers=["app","a","b","c"]\n'
        '[workspace.package]\nversion="1.0.0"\nedition="2024"\n'
        '[workspace.dependencies]\na={path="a",version="1",features=["base"]}\n')
    for name, manifest in manifests.items():
        package = root / name
        package.mkdir()
        (package / "Cargo.toml").write_text(f'[package]\nname="{name}"\nversion.workspace=true\nedition.workspace=true\n' + manifest)
    for extra, expected_b in [([], {"default", "enable"}),
                               (["--features", "strong"], {"default", "enable", "forward", "c", "marker"})]:
        report = fetch(root, *extra, manifest="app/Cargo.toml")
        features = {p["name"]: set(p["features"]) for p in report["packages"]}
        assert features["c"] == {"extra", "browser"}
        assert features["a"] == {"base", "inherited"}
        assert features["b"] == expected_b
        assert features["app"] == ({"strong"} if extra else set())
    other = root / "c-v2"
    other.mkdir()
    (other / "Cargo.toml").write_text('[package]\nname="c"\nversion="2.0.0"\n')
    fetch(root, "--patch", f"c={other}", manifest="app/Cargo.toml", error="manifest/lock mismatch")
    fetch(root, "--patch", f"c={other}", "--patch", f"c@1.0.0={root / 'c'}", manifest="app/Cargo.toml")
    # Resolve symlinks before '..', including when output directories do not exist.
    (root / "a/nested").mkdir()
    (root / "alias").symlink_to(root / "a/nested", target_is_directory=True)
    fetch(root, "--patch", f"a={root}/alias/..", "--target-dir", f"{root}/alias/../output", manifest="app/Cargo.toml")
    assert (root / "a/output/patti-build.json").exists()
    path = root / "app/Cargo.toml"
    path.write_text(path.read_text().replace('b={path="../b",version="1"}', 'b={path="../b",version="2"}'))
    fetch(root, manifest="app/Cargo.toml", error="ambiguous or missing locked dependency")

print("PATTI-FIXTURES-PASSED")
