"""Artifact planning, source builds, and installation for Dolly's Bonnie.

Networking stays in Bonnie's C executable so every request crosses Dolly's
single HTTP broker.  This helper only interprets PyPI metadata and installs a
artifact already present in WasmFS.  It uses the packaging and PEP 517 frontend
bundled with CPython's pinned pip wheel, avoiding ambient package-manager
networking or a second host capability.
"""

from __future__ import annotations

import configparser
import glob
import hashlib
import importlib.metadata
import json
import os
import posixpath
import re
import shutil
import sys
import tarfile
import tempfile
import tomllib
import zipfile
from collections import deque
from email.parser import BytesParser


MAX_INSTALLED_BYTES = 256 * 1024 * 1024


def _sync_pythonpath() -> None:
    """Apply command-local PYTHONPATH in Dolly's reused CPython instance."""
    previous = getattr(sys, "_dolly_bonnie_pythonpath", ())
    for path in previous:
        while path in sys.path:
            sys.path.remove(path)
    current = tuple(
        path for path in os.environ.get("PYTHONPATH", "").split(":") if path
    )
    for path in reversed(current):
        sys.path.insert(0, path)
    sys._dolly_bonnie_pythonpath = current


_sync_pythonpath()


def _load_packaging():
    try:
        from pip._vendor.packaging.markers import default_environment
        from pip._vendor.packaging.requirements import Requirement
        from pip._vendor.packaging.specifiers import SpecifierSet
        from pip._vendor.packaging.utils import canonicalize_name, parse_wheel_filename
        from pip._vendor.packaging.version import Version
    except ImportError:
        wheels = glob.glob(
            "/usr/lib/python*/ensurepip/_bundled/pip-*-py3-none-any.whl"
        )
        if not wheels:
            raise RuntimeError("CPython's bundled packaging library is unavailable")
        sys.path.insert(0, max(wheels))
        from pip._vendor.packaging.markers import default_environment
        from pip._vendor.packaging.requirements import Requirement
        from pip._vendor.packaging.specifiers import SpecifierSet
        from pip._vendor.packaging.utils import canonicalize_name, parse_wheel_filename
        from pip._vendor.packaging.version import Version

    return {
        "default_environment": default_environment,
        "Requirement": Requirement,
        "SpecifierSet": SpecifierSet,
        "canonicalize_name": canonicalize_name,
        "parse_wheel_filename": parse_wheel_filename,
        "Version": Version,
    }


PACKAGING = _load_packaging()


def _python_compatible(value: str | None) -> bool:
    if not value:
        return True
    try:
        current = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
        return PACKAGING["SpecifierSet"](value).contains(current, prereleases=True)
    except Exception:
        return False


def _compatible_wheel(file: dict) -> bool:
    filename = file.get("filename", "")
    if file.get("packagetype") != "bdist_wheel" or not filename.endswith(".whl"):
        return False
    if not _python_compatible(file.get("requires_python")):
        return False
    try:
        _, _, _, tags = PACKAGING["parse_wheel_filename"](filename)
    except Exception:
        return False
    interpreters = {
        "py3",
        f"py{sys.version_info.major}",
        f"cp{sys.version_info.major}{sys.version_info.minor}",
    }
    native_interpreter = f"cp{sys.version_info.major}{sys.version_info.minor}"
    return any(
        (tag.platform == "any" and tag.abi == "none" and
         tag.interpreter in interpreters) or
        (tag.platform == "dolly_0_wasm64" and
         tag.interpreter == native_interpreter and
         tag.abi in {native_interpreter, "abi3"})
        for tag in tags)


def _source_distribution(file: dict) -> bool:
    filename = file.get("filename", "")
    return (
        file.get("packagetype") == "sdist" and
        _python_compatible(file.get("requires_python")) and
        (filename.endswith(".tar.gz") or filename.endswith(".zip"))
    )


def _artifact_kind(file: dict) -> str:
    return "wheel" if _compatible_wheel(file) else "sdist"


def _candidate_files(files: list[dict], exact: bool) -> list[dict]:
    compatible = [
        file for file in files
        if _compatible_wheel(file) or _source_distribution(file)
    ]
    ordinary = [file for file in compatible if not file.get("yanked")]
    candidates = ordinary or (compatible if exact else [])
    return sorted(candidates, key=lambda file: (
        0 if _compatible_wheel(file) else 1,
        0 if file.get("filename", "").endswith(".tar.gz") else 1,
        file.get("filename", ""),
    ))


def _select(specification: str, metadata: dict) -> tuple[object, object]:
    requirement = PACKAGING["Requirement"](specification)
    if requirement.url is not None:
        raise ValueError("direct references must be passed as wheel URLs")
    exact = str(requirement.specifier).startswith("==") and "*" not in str(
        requirement.specifier
    )
    candidates = []
    for raw_version, files in metadata.get("releases", {}).items():
        try:
            version = PACKAGING["Version"](raw_version)
        except Exception:
            continue
        if not requirement.specifier.contains(version, prereleases=None):
            continue
        if _candidate_files(files, exact):
            candidates.append(version)
    if not candidates and not requirement.specifier.prereleases:
        for raw_version, files in metadata.get("releases", {}).items():
            try:
                version = PACKAGING["Version"](raw_version)
            except Exception:
                continue
            if requirement.specifier.contains(version, prereleases=True) and \
                    _candidate_files(files, exact):
                candidates.append(version)
    if not candidates:
        raise ValueError(
            f"no compatible Python {sys.version_info.major}.{sys.version_info.minor} "
            f"wheel or source distribution satisfies {specification}"
        )
    return requirement, max(candidates)


def _write_line(stream, key: str, value: str) -> None:
    if "\n" in value or "\r" in value:
        raise ValueError(f"invalid newline in {key}")
    stream.write(f"{key} {value}\n")


def select(specification: str, metadata_path: str, output_path: str) -> None:
    with open(metadata_path, "r", encoding="utf-8") as source:
        metadata = json.load(source)
    requirement, version = _select(specification, metadata)
    with open(output_path, "w", encoding="utf-8", newline="\n") as output:
        output.write("BONNIE 1\n")
        _write_line(output, "name", PACKAGING["canonicalize_name"](requirement.name))
        _write_line(output, "version", str(version))


def combine(left: str, right: str, output_path: str) -> None:
    requirements = [PACKAGING["Requirement"](left), PACKAGING["Requirement"](right)]
    names = {PACKAGING["canonicalize_name"](item.name) for item in requirements}
    if len(names) != 1:
        raise ValueError("cannot combine constraints for different projects")
    if any(item.url is not None for item in requirements):
        raise ValueError("direct references cannot be combined with constraints")
    if any(item.marker is not None for item in requirements):
        raise ValueError("markers are evaluated before project constraints are combined")
    extras = sorted(set().union(*(item.extras for item in requirements)))
    specification = next(iter(names))
    if extras:
        specification += "[" + ",".join(extras) + "]"
    specifiers = [str(item.specifier) for item in requirements if item.specifier]
    if specifiers:
        specification += ",".join(specifiers)
    # Parse once more before returning the canonical intersection to C.
    PACKAGING["Requirement"](specification)
    with open(output_path, "w", encoding="utf-8", newline="\n") as output:
        output.write(specification + "\n")


def _requirement_without_marker(requirement) -> str:
    extras = ""
    if requirement.extras:
        extras = "[" + ",".join(sorted(requirement.extras)) + "]"
    result = requirement.name + extras + str(requirement.specifier)
    if requirement.url is not None:
        result += " @ " + requirement.url
    return result


def _dependencies(raw_dependencies: list[str] | None, extras: set[str]) -> list[str]:
    environment = PACKAGING["default_environment"]()
    requested_extras = sorted(extras) or [""]
    dependencies: list[str] = []
    for raw_dependency in raw_dependencies or []:
        dependency = PACKAGING["Requirement"](raw_dependency)
        if dependency.marker is not None and not any(
            dependency.marker.evaluate({**environment, "extra": extra})
            for extra in requested_extras
        ):
            continue
        rendered = _requirement_without_marker(dependency)
        if rendered not in dependencies:
            dependencies.append(rendered)
    return dependencies


def plan(specification: str, metadata_path: str, output_path: str) -> None:
    with open(metadata_path, "r", encoding="utf-8") as source:
        metadata = json.load(source)
    requirement = PACKAGING["Requirement"](specification)
    version = PACKAGING["Version"](metadata["info"]["version"])
    if not requirement.specifier.contains(version, prereleases=True):
        raise ValueError(f"PyPI returned {version}, which does not satisfy {specification}")
    files = _candidate_files(metadata.get("urls", []), exact=True)
    if not files:
        raise ValueError(
            f"no compatible wheel or source distribution is available for "
            f"{requirement.name}=={version}"
        )
    selected = files[0]

    dependencies = _dependencies(
        metadata.get("info", {}).get("requires_dist"), requirement.extras
    )

    with open(output_path, "w", encoding="utf-8", newline="\n") as output:
        output.write("BONNIE 1\n")
        _write_line(output, "name", PACKAGING["canonicalize_name"](requirement.name))
        _write_line(output, "version", str(version))
        _write_line(output, "kind", _artifact_kind(selected))
        _write_line(output, "url", selected["url"])
        _write_line(output, "filename", selected["filename"])
        digest = selected.get("digests", {}).get("sha256")
        if digest:
            _write_line(output, "sha256", digest)
        for dependency in dependencies:
            _write_line(output, "requirement", dependency)


def _verify_sha256(wheel_path: str, expected_sha256: str) -> None:
    if expected_sha256 == "-":
        return
    if len(expected_sha256) != 64 or any(
            byte not in "0123456789abcdef" for byte in expected_sha256):
        raise ValueError("wheel has an invalid expected SHA256")
    digest = hashlib.sha256()
    with open(wheel_path, "rb") as wheel:
        for chunk in iter(lambda: wheel.read(1024 * 1024), b""):
            digest.update(chunk)
    actual = digest.hexdigest()
    if actual != expected_sha256:
        raise ValueError(
            f"wheel SHA256 mismatch: expected {expected_sha256}, received {actual}"
        )


def _safe_archive_name(name: str) -> list[str]:
    parts = name.replace("\\", "/").split("/")
    if not parts or parts[0] == "" or any(part in {"", ".", ".."} for part in parts):
        raise ValueError(f"source distribution contains unsafe path {name!r}")
    return parts


def _sdist_documents(archive_path: str) -> tuple[bytes, bytes | None]:
    documents: dict[str, bytes] = {}
    total = 0
    if archive_path.endswith(".tar.gz"):
        with tarfile.open(archive_path, mode="r:gz") as archive:
            for member in archive.getmembers():
                parts = _safe_archive_name(member.name.rstrip("/"))
                if member.issym() or member.islnk() or member.isdev():
                    raise ValueError("source distribution contains a link or device")
                if not member.isfile():
                    continue
                total += member.size
                if member.size > MAX_INSTALLED_BYTES or total > MAX_INSTALLED_BYTES:
                    raise ValueError("source distribution expands beyond Bonnie's limit")
                if parts[-1] not in {"PKG-INFO", "pyproject.toml"}:
                    continue
                source = archive.extractfile(member)
                if source is None:
                    raise ValueError(f"could not read {member.name}")
                documents["/".join(parts)] = source.read()
    elif archive_path.endswith(".zip"):
        with zipfile.ZipFile(archive_path) as archive:
            for member in archive.infolist():
                parts = _safe_archive_name(member.filename.rstrip("/"))
                if member.is_dir():
                    continue
                total += member.file_size
                if member.file_size > MAX_INSTALLED_BYTES or total > MAX_INSTALLED_BYTES:
                    raise ValueError("source distribution expands beyond Bonnie's limit")
                if parts[-1] in {"PKG-INFO", "pyproject.toml"}:
                    documents["/".join(parts)] = archive.read(member)
    else:
        raise ValueError("source distribution must be .tar.gz or .zip")

    metadata_names = sorted(
        (name for name in documents if name.endswith("/PKG-INFO")),
        key=lambda name: (name.count("/"), ".egg-info/" in name, name),
    )
    if not metadata_names:
        raise ValueError("source distribution has no PKG-INFO metadata")
    metadata_name = metadata_names[0]
    root = metadata_name.split("/", 1)[0]
    pyproject = documents.get(f"{root}/pyproject.toml")
    return documents[metadata_name], pyproject


def _sdist_metadata(specification: str, archive_path: str):
    metadata_bytes, pyproject_bytes = _sdist_documents(archive_path)
    metadata = BytesParser().parsebytes(metadata_bytes)
    name = metadata.get("Name")
    raw_version = metadata.get("Version")
    if not name or not raw_version:
        raise ValueError("source metadata is missing Name or Version")
    canonical_name = PACKAGING["canonicalize_name"](name)
    version = PACKAGING["Version"](raw_version)
    requirement = PACKAGING["Requirement"](specification)
    if PACKAGING["canonicalize_name"](requirement.name) != canonical_name or \
            not requirement.specifier.contains(version, prereleases=True):
        raise ValueError(
            f"source metadata {canonical_name}=={version} does not satisfy {requirement}"
        )

    if pyproject_bytes is None:
        build_requirements = ["setuptools>=40.8.0"]
    else:
        project = tomllib.loads(pyproject_bytes.decode("utf-8"))
        build_system = project.get("build-system", {})
        build_requirements = build_system.get("requires", ["setuptools>=40.8.0"])
        if not isinstance(build_requirements, list) or not all(
                isinstance(item, str) for item in build_requirements):
            raise ValueError("pyproject build-system.requires must be a string array")
    normalized_build_requirements = []
    environment = PACKAGING["default_environment"]()
    for raw in build_requirements:
        requirement_item = PACKAGING["Requirement"](raw)
        if requirement_item.marker is not None and not requirement_item.marker.evaluate(
                {**environment, "extra": ""}):
            continue
        rendered = _requirement_without_marker(requirement_item)
        if rendered not in normalized_build_requirements:
            normalized_build_requirements.append(rendered)
    return (
        canonical_name,
        version,
        _dependencies(metadata.get_all("Requires-Dist"), requirement.extras),
        normalized_build_requirements,
    )


def _write_sdist_plan(specification: str, archive_path: str, output_path: str) -> None:
    name, version, dependencies, build_requirements = _sdist_metadata(
        specification, archive_path
    )
    with open(output_path, "w", encoding="utf-8", newline="\n") as output:
        output.write("BONNIE 1\n")
        _write_line(output, "name", name)
        _write_line(output, "version", str(version))
        _write_line(output, "kind", "sdist")
        for dependency in dependencies:
            _write_line(output, "requirement", dependency)
        for requirement in build_requirements:
            _write_line(output, "build-requirement", requirement)


def _wheel_metadata(wheel: zipfile.ZipFile):
    metadata_names = [
        name for name in wheel.namelist()
        if name.count("/") == 1 and name.endswith(".dist-info/METADATA")
    ]
    if len(metadata_names) != 1:
        raise ValueError("wheel must contain exactly one dist-info/METADATA file")
    metadata = BytesParser().parsebytes(wheel.read(metadata_names[0]))
    name = metadata.get("Name")
    version = metadata.get("Version")
    if not name or not version:
        raise ValueError("wheel metadata is missing Name or Version")
    dist_info = metadata_names[0].rsplit("/", 1)[0]
    return (
        metadata,
        PACKAGING["canonicalize_name"](name),
        PACKAGING["Version"](version),
        dist_info,
    )


def _console_scripts(wheel: zipfile.ZipFile, dist_info: str):
    path = f"{dist_info}/entry_points.txt"
    try:
        contents = wheel.read(path).decode("utf-8")
    except KeyError:
        return []
    parser = configparser.ConfigParser(interpolation=None)
    parser.optionxform = str
    parser.read_string(contents)
    if not parser.has_section("console_scripts"):
        return []
    scripts = []
    for raw_name, raw_target in parser.items("console_scripts"):
        name = raw_name.strip()
        target = raw_target.split("[", 1)[0].strip()
        module, separator, function = target.partition(":")
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", name) or \
                not separator or \
                not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.]*", module) or \
                not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.]*", function):
            raise ValueError(f"unsupported console script entry {raw_name}={raw_target}")
        scripts.append((name, module, function))
    scripts.sort()
    return scripts


def _wheel_destinations(wheel: zipfile.ZipFile, target: str):
    destinations = []
    seen = set()
    total = 0
    for member in wheel.infolist():
        parts = member.filename.split("/")
        if parts[-1] == "":
            continue
        total += member.file_size
        if member.file_size > MAX_INSTALLED_BYTES or total > MAX_INSTALLED_BYTES:
            raise ValueError("wheel expands beyond Bonnie's installation limit")
        base = target
        relative = parts
        if parts[0].endswith(".data"):
            if len(parts) < 3:
                raise ValueError("wheel contains an invalid .data path")
            scheme = parts[1]
            relative = parts[2:]
            if scheme in {"purelib", "platlib"}:
                base = target
            elif scheme == "scripts":
                base = "/usr/bin" if target.startswith("/usr/lib/python") else \
                    posixpath.join(target, "bin")
            elif scheme == "headers":
                base = "/usr/include" if target.startswith("/usr/lib/python") else \
                    posixpath.join(target, "include")
            elif scheme == "data":
                base = "/usr" if target.startswith("/usr/lib/python") else target
            else:
                raise ValueError(f"wheel uses unsupported install scheme {scheme}")
        destination = _safe_destination(base, relative)
        if destination in seen:
            raise ValueError(f"wheel contains duplicate destination {destination}")
        seen.add(destination)
        destinations.append((member, destination))
    return destinations


def verify(specification: str, artifact_path: str, expected_sha256: str,
           kind: str, output_path: str) -> None:
    if kind == "sdist":
        _verify_sha256(artifact_path, expected_sha256)
        _write_sdist_plan(specification, artifact_path, output_path)
        return
    if kind != "wheel":
        raise ValueError(f"unsupported artifact kind {kind}")
    wheel_path = artifact_path
    _verify_sha256(wheel_path, expected_sha256)
    extras = set()
    with zipfile.ZipFile(wheel_path) as wheel:
        metadata, name, version, dist_info = _wheel_metadata(wheel)
        if specification != "-":
            requirement = PACKAGING["Requirement"](specification)
            if requirement.url is not None:
                raise ValueError("named direct references are unsupported")
            if PACKAGING["canonicalize_name"](requirement.name) != name or \
                    not requirement.specifier.contains(version, prereleases=True):
                raise ValueError(
                    f"wheel metadata {name}=={version} does not satisfy {requirement}"
                )
            extras = requirement.extras
        destinations = _wheel_destinations(
            wheel, "/usr/lib/python3.14/site-packages"
        )
        # Reading every member now verifies its CRC before the transaction can
        # modify the real target directory.
        for member, _ in destinations:
            with wheel.open(member, "r") as source:
                while source.read(1024 * 1024):
                    pass
        scripts = _console_scripts(wheel, dist_info)
    dependencies = _dependencies(metadata.get_all("Requires-Dist"), extras)
    with open(output_path, "w", encoding="utf-8", newline="\n") as output:
        output.write("BONNIE 1\n")
        _write_line(output, "name", name)
        _write_line(output, "version", str(version))
        _write_line(output, "kind", "wheel")
        for dependency in dependencies:
            _write_line(output, "requirement", dependency)
        for script, module, function in scripts:
            _write_line(output, "entrypoint", f"{script}\t{module}\t{function}")


def inspect(wheel_path: str, output_path: str) -> None:
    verify("-", wheel_path, "-", "wheel", output_path)


def _build_failure_diagnostic(
        log_path: str, tail_lines: int = 40) -> tuple[list[str], list[str]]:
    tail: deque[str] = deque(maxlen=tail_lines)
    summary: list[str] = []
    with open(log_path, "r", encoding="utf-8", errors="replace") as log:
        for raw_line in log:
            line = raw_line.rstrip()
            tail.append(line)
            lower = line.lower()
            if (" error:" in lower or "fatal:" in lower or
                    "exception:" in lower or "failed with status" in lower or
                    "not found or not executable" in lower) and \
                    line not in summary:
                summary.append(line)
    if len(summary) > 28:
        summary = summary[:14] + ["..."] + summary[-13:]
    return list(tail), summary


def _source_build_backend(sdist_path: str) -> str:
    _, pyproject_bytes = _sdist_documents(sdist_path)
    if pyproject_bytes is None:
        return "setuptools.build_meta:__legacy__"
    project = tomllib.loads(pyproject_bytes.decode("utf-8"))
    backend = project.get("build-system", {}).get("build-backend", "")
    return backend if isinstance(backend, str) else ""


def build(sdist_path: str, wheel_path: str) -> None:
    bundled = glob.glob("/usr/lib/python*/ensurepip/_bundled/pip-*-py3-none-any.whl")
    if not bundled:
        raise RuntimeError("CPython's bundled pip frontend is unavailable")
    sys.path.insert(0, max(bundled))
    from pip._internal.cli.main import main as pip_main

    directory = tempfile.mkdtemp(prefix="bonnie-wheel-", dir="/tmp")
    log_path = posixpath.join(directory, "pip.log")
    pip_arguments = [
        "wheel",
        "--verbose",
        "--disable-pip-version-check",
        "--no-cache-dir",
        "--no-clean",
        "--no-input",
        "--no-index",
        "--no-deps",
        "--no-build-isolation",
        "--log", log_path,
        "--progress-bar", "off",
        "--wheel-dir", directory,
    ]
    if _source_build_backend(sdist_path).split(":", 1)[0] == "mesonpy":
        pip_arguments.extend([
            "--config-settings",
            f"build-dir={posixpath.join(directory, 'meson-build')}",
        ])
    pip_arguments.append(sdist_path)
    previous_tempdir = tempfile.tempdir
    previous_build_flags = {
        name: os.environ.get(name) for name in ("CFLAGS", "CXXFLAGS")
    }
    # Keep every PEP 517 frontend temporary inside Bonnie's transaction.  On a
    # failure, --no-clean leaves backend diagnostics available long enough to
    # report them; the outer finally removes the complete transaction either
    # way, so package builds never leak process-global /tmp state.
    tempfile.tempdir = directory
    # Dolly source builds optimize for bounded browser build time. Packages
    # that genuinely need optimized native code can explicitly override these
    # command-local environment variables.
    os.environ.setdefault("CFLAGS", "-O0 -fno-sanitize-coverage")
    os.environ.setdefault("CXXFLAGS", "-O0 -fno-sanitize-coverage")
    try:
        try:
            status = pip_main(pip_arguments)
        finally:
            tempfile.tempdir = previous_tempdir
        if status != 0:
            logs = [("frontend", log_path)]
            logs.extend(
                ("Meson", path) for path in sorted(glob.glob(
                    posixpath.join(directory, "**", "meson-log.txt"),
                    recursive=True,
                ))[:4]
            )
            for label, path in logs:
                try:
                    tail, summary = _build_failure_diagnostic(
                        path, 100 if label == "Meson" else 40
                    )
                    if tail:
                        print(f"bonnie: {label} build log tail:", file=sys.stderr)
                        print("\n".join(tail), file=sys.stderr)
                    if summary:
                        print(f"bonnie: {label} error summary:", file=sys.stderr)
                        print("\n".join(summary), file=sys.stderr)
                except OSError:
                    pass
            raise RuntimeError(f"PEP 517 frontend exited with status {status}")
        wheels = glob.glob(posixpath.join(directory, "*.whl"))
        if len(wheels) != 1:
            raise RuntimeError(f"source build produced {len(wheels)} wheels")
        if os.path.exists(wheel_path):
            os.unlink(wheel_path)
        os.replace(wheels[0], wheel_path)
    finally:
        tempfile.tempdir = previous_tempdir
        for name, value in previous_build_flags.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
        shutil.rmtree(directory, ignore_errors=True)


def satisfies(specification: str, version: str) -> None:
    requirement = PACKAGING["Requirement"](specification)
    if requirement.url is not None:
        raise ValueError("direct references cannot constrain a resolved project")
    selected = PACKAGING["Version"](version)
    if not requirement.specifier.contains(selected, prereleases=True):
        raise ValueError(f"{requirement} does not accept resolved version {selected}")


def installed_satisfies(specification: str) -> bool:
    requirement = PACKAGING["Requirement"](specification)
    if requirement.url is not None:
        return False
    canonical = PACKAGING["canonicalize_name"](requirement.name)
    installed = _installed_distributions().get(canonical)
    if installed is None:
        return False
    return requirement.specifier.contains(
        PACKAGING["Version"](installed[1]), prereleases=True
    )


def _safe_destination(base: str, parts: list[str]) -> str:
    if not parts or any(part in {"", ".", ".."} for part in parts):
        raise ValueError("wheel contains an invalid path")
    destination = posixpath.normpath(posixpath.join(base, *parts))
    normalized_base = posixpath.normpath(base)
    if destination == normalized_base or not destination.startswith(normalized_base + "/"):
        raise ValueError("wheel path escapes its installation directory")
    return destination


def install(wheel_path: str, target: str, expected_sha256: str) -> None:
    _verify_sha256(wheel_path, expected_sha256)
    os.makedirs(target, exist_ok=True)
    with zipfile.ZipFile(wheel_path) as wheel:
        for member, destination in _wheel_destinations(wheel, target):
            os.makedirs(posixpath.dirname(destination), exist_ok=True)
            with wheel.open(member, "r") as source, open(destination, "wb") as output:
                while chunk := source.read(1024 * 1024):
                    output.write(chunk)


def _validate_stage_root(root: str) -> None:
    if not re.fullmatch(r"/tmp/bonnie-stage-[0-9]+", root):
        raise ValueError("invalid Bonnie stage directory")


def stage_reset(root: str) -> None:
    _validate_stage_root(root)
    shutil.rmtree(root, ignore_errors=True)
    os.makedirs(posixpath.join(root, "site-packages"))


def stage_remove(root: str) -> None:
    _validate_stage_root(root)
    shutil.rmtree(root, ignore_errors=True)


def _installed_distributions():
    installed = {}
    for distribution in importlib.metadata.distributions():
        name = distribution.metadata.get("Name")
        version = distribution.version
        if not name or not version:
            continue
        location = str(distribution.locate_file(""))
        # _load_packaging() temporarily adds CPython's bundled pip wheel to
        # this helper's sys.path. It supplies parser code but is not installed
        # in Dolly's environment and must not appear in list/freeze output.
        if any(part.endswith(".whl") for part in location.split("/")):
            continue
        canonical = PACKAGING["canonicalize_name"](name)
        installed[canonical] = (name, version, distribution)
    return installed


def list_installed(freeze: bool = False) -> None:
    installed = _installed_distributions()
    if freeze:
        for canonical, (_, version, _) in sorted(installed.items()):
            print(f"{canonical}=={version}")
        return
    print("Package Version")
    print("------- -------")
    for _, (name, version, _) in sorted(installed.items()):
        print(f"{name} {version}")


def show_installed(names: list[str]) -> None:
    installed = _installed_distributions()
    missing = []
    shown = 0
    for requested in names:
        canonical = PACKAGING["canonicalize_name"](requested)
        item = installed.get(canonical)
        if item is None:
            missing.append(requested)
            continue
        name, version, distribution = item
        if shown:
            print("---")
        shown += 1
        dependencies = []
        for raw in distribution.requires or []:
            try:
                dependency = PACKAGING["Requirement"](raw)
            except Exception:
                continue
            normalized = PACKAGING["canonicalize_name"](dependency.name)
            if normalized not in dependencies:
                dependencies.append(normalized)
        print(f"Name: {name}")
        print(f"Version: {version}")
        print(f"Summary: {distribution.metadata.get('Summary', '')}")
        print(f"Location: {distribution.locate_file('')}")
        print(f"Requires: {', '.join(sorted(dependencies))}")
    if missing:
        raise ValueError(f"package not installed: {', '.join(missing)}")


def check_installed() -> int:
    installed = _installed_distributions()
    environment = PACKAGING["default_environment"]()
    broken = 0
    for _, (name, version, distribution) in sorted(installed.items()):
        for raw in distribution.requires or []:
            try:
                requirement = PACKAGING["Requirement"](raw)
            except Exception as error:
                print(f"{name} {version} has an invalid requirement {raw!r}: {error}")
                broken += 1
                continue
            if requirement.marker is not None and not requirement.marker.evaluate(
                    {**environment, "extra": ""}):
                continue
            dependency_name = PACKAGING["canonicalize_name"](requirement.name)
            dependency = installed.get(dependency_name)
            if dependency is None:
                print(
                    f"{name} {version} requires {requirement}, "
                    "which is not installed."
                )
                broken += 1
                continue
            dependency_version = PACKAGING["Version"](dependency[1])
            if requirement.specifier and not requirement.specifier.contains(
                    dependency_version, prereleases=True):
                print(
                    f"{name} {version} requires {requirement}, but "
                    f"{dependency[0]} {dependency[1]} is installed."
                )
                broken += 1
    if broken == 0:
        print("No broken requirements found.")
    return 1 if broken else 0


def main(arguments: list[str]) -> int:
    if not arguments or arguments[0] in {"-h", "--help"}:
        print("usage: bonnie.py select SPEC METADATA OUTPUT", file=sys.stderr)
        print("       bonnie.py combine LEFT RIGHT OUTPUT", file=sys.stderr)
        print("       bonnie.py plan SPEC METADATA OUTPUT", file=sys.stderr)
        print("       bonnie.py inspect WHEEL OUTPUT", file=sys.stderr)
        print("       bonnie.py verify SPEC ARTIFACT SHA256 KIND OUTPUT", file=sys.stderr)
        print("       bonnie.py build SDIST WHEEL", file=sys.stderr)
        print("       bonnie.py satisfies SPEC VERSION", file=sys.stderr)
        print("       bonnie.py installed SPEC", file=sys.stderr)
        print("       bonnie.py install WHEEL TARGET SHA256", file=sys.stderr)
        print("       bonnie.py stage-reset ROOT", file=sys.stderr)
        print("       bonnie.py stage-remove ROOT", file=sys.stderr)
        print("       bonnie.py list", file=sys.stderr)
        print("       bonnie.py freeze", file=sys.stderr)
        print("       bonnie.py show PACKAGE...", file=sys.stderr)
        print("       bonnie.py check", file=sys.stderr)
        return 2
    try:
        if arguments[0] == "select" and len(arguments) == 4:
            select(arguments[1], arguments[2], arguments[3])
        elif arguments[0] == "combine" and len(arguments) == 4:
            combine(arguments[1], arguments[2], arguments[3])
        elif arguments[0] == "plan" and len(arguments) == 4:
            plan(arguments[1], arguments[2], arguments[3])
        elif arguments[0] == "inspect" and len(arguments) == 3:
            inspect(arguments[1], arguments[2])
        elif arguments[0] == "verify" and len(arguments) == 6:
            verify(arguments[1], arguments[2], arguments[3], arguments[4], arguments[5])
        elif arguments[0] == "build" and len(arguments) == 3:
            build(arguments[1], arguments[2])
        elif arguments[0] == "satisfies" and len(arguments) == 3:
            satisfies(arguments[1], arguments[2])
        elif arguments[0] == "installed" and len(arguments) == 2:
            return 0 if installed_satisfies(arguments[1]) else 1
        elif arguments[0] == "install" and len(arguments) == 4:
            install(arguments[1], arguments[2], arguments[3])
        elif arguments[0] == "stage-reset" and len(arguments) == 2:
            stage_reset(arguments[1])
        elif arguments[0] == "stage-remove" and len(arguments) == 2:
            stage_remove(arguments[1])
        elif arguments[0] == "list" and len(arguments) == 1:
            list_installed()
        elif arguments[0] == "freeze" and len(arguments) == 1:
            list_installed(freeze=True)
        elif arguments[0] == "show" and len(arguments) >= 2:
            show_installed(arguments[1:])
        elif arguments[0] == "check" and len(arguments) == 1:
            return check_installed()
        else:
            raise ValueError("invalid Bonnie helper arguments")
    except Exception as error:
        print(f"bonnie: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
