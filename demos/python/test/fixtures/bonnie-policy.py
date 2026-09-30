import importlib.util
import io
import os
import sys
import tarfile
import zipfile

helper, root = sys.argv[1:3]
spec = importlib.util.spec_from_file_location("bonnie", helper)
bonnie = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bonnie)

backend = '''import os, zipfile
def build_wheel(wheel_directory, config_settings=None, metadata_directory=None):
    assert config_settings == {"flavor": "test value", "setup-args": ["one", "two"]}, config_settings
    name = "bonnie_probe-1.0-py3-none-any.whl"
    with zipfile.ZipFile(os.path.join(wheel_directory, name), "w") as wheel:
        wheel.writestr("bonnie_probe.py", "VALUE = 42\\n")
        wheel.writestr("bonnie_probe-1.0.dist-info/METADATA", "Metadata-Version: 2.4\\nName: bonnie-probe\\nVersion: 1.0\\n")
        wheel.writestr("bonnie_probe-1.0.dist-info/WHEEL", "Wheel-Version: 1.0\\nGenerator: Dolly fixture\\nRoot-Is-Purelib: true\\nTag: py3-none-any\\n")
        wheel.writestr("bonnie_probe-1.0.dist-info/RECORD", "")
    return name
'''
sdist = root + "/bonnie-probe-1.0.tar.gz"
with tarfile.open(sdist, "w:gz") as archive:
    for name, text in {
        "PKG-INFO": "Metadata-Version: 2.4\nName: Bonnie_Probe\nVersion: 1.0\n",
        "pyproject.toml": '[build-system]\nrequires = []\nbuild-backend = "backend"\nbackend-path = ["."]\n',
        "backend.py": backend,
    }.items():
        data = text.encode()
        member = tarfile.TarInfo("bonnie-probe-1.0/" + name)
        member.size = len(data)
        archive.addfile(member, io.BytesIO(data))

policy = root + "/build.toml"
valid = '[bonnie-probe]\nflavor = "test value"\nsetup-args = ["one", "two"]\n'
expected = ["--config-settings", "flavor=test value", "--config-settings", "setup-args=one", "--config-settings", "setup-args=two"]
with open(policy, "w") as stream:
    stream.write(valid)
assert bonnie._source_build_config_settings(sdist, policy) == expected
assert bonnie._source_build_config_settings(sdist, root + "/missing.toml") == []
for invalid in ['[Bonnie_Probe]\nx="a"', '[bonnie-probe]\nx=1', '[bonnie-probe]\nx=[]',
                '[bonnie-probe]\nx=["a", false]', 'bonnie-probe="wrong type"', '[bonnie-probe]\n"a=b"="c"']:
    with open(policy, "w") as stream:
        stream.write(invalid)
    try:
        bonnie._source_build_config_settings(sdist, policy)
        raise AssertionError("invalid policy accepted: " + invalid)
    except ValueError:
        pass

if "--build" in sys.argv[3:]:
    installed_policy = "/etc/bonnie/build.toml"
    with open(installed_policy, "rb") as stream:
        previous = stream.read()
    before_tmp = set(os.listdir("/tmp"))
    before_environment = dict(os.environ)
    try:
        with open(installed_policy, "w") as stream:
            stream.write(valid)
        wheel = root + "/result.whl"
        bonnie.build(sdist, wheel)
        with zipfile.ZipFile(wheel) as result:
            assert result.read("bonnie_probe.py") == b"VALUE = 42\n"
        with open(wheel, "rb") as stream:
            previous_wheel = stream.read()
        assert not (set(os.listdir("/tmp")) - before_tmp), "build left temporary state"
        replace = os.replace
        def fail_publication(source, destination):
            if destination == wheel:
                raise OSError("fixture publication failure")
            return replace(source, destination)
        os.replace = fail_publication
        try:
            bonnie.build(sdist, wheel)
            raise AssertionError("publication failure was ignored")
        except OSError as error:
            assert str(error) == "fixture publication failure", error
        finally:
            os.replace = replace
        leaked = set(os.listdir("/tmp")) - before_tmp
        assert not leaked, f"failed publication left temporary state: {sorted(leaked)}"
        with open(wheel, "rb") as stream:
            assert stream.read() == previous_wheel, "failed publication removed the previous wheel"
        with open(installed_policy, "w") as stream:
            stream.write('[bonnie-probe]\nx=1')
        try:
            bonnie.build(sdist, wheel)
            raise AssertionError("invalid build policy succeeded")
        except ValueError:
            pass
        assert not (set(os.listdir("/tmp")) - before_tmp), "invalid policy left temporary state"
        with open(wheel, "rb") as stream:
            assert stream.read() == previous_wheel, "failed build replaced a completed wheel"
    finally:
        with open(installed_policy, "wb") as stream:
            stream.write(previous)
    assert dict(os.environ) == before_environment, "build changed the caller's environment"
print("BONNIE-POLICY PASS: generic settings, validation, and owned build state", flush=True)
