"""0 A.D.'s data release, a tar stream on standard input, made into what the game
reads here: in OUTPUT all content in archives below the site's file limit, with
data.patch applied and the SPIR-V shaders translated to WGSL by NAGA (kept in
SHADERS too), and as the archive HEADLESS the scripts and maps of a game
without graphics or sound. SOURCE holds what only the source release has: the
engine's translations (l10n) and the licences.
usage: package-data.py SOURCE NAGA OUTPUT HEADLESS SHADERS < RELEASE.tar"""
from io import BytesIO
import json
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import tarfile
from tempfile import TemporaryDirectory
import zlib
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

from shaders import translate

tools = Path(__file__).parent


def read_release(stream):
    """The mods' archives, kept in this process's memory (3.6 GB that the
    filesystem then never holds), and the configuration files."""
    mods, config = {}, {}
    with tarfile.open(fileobj=stream, mode='r|') as release:
        for member in release:
            parts = PurePosixPath(member.name).parts[1:]
            if member.isfile() and parts[:3] == ('binaries', 'data', 'mods') and parts[4:] == (f'{parts[3]}.zip',):
                # One allocation of the archive's size, which writing then fills.
                mods[parts[3]] = archive = BytesIO()
                archive.seek(member.size - 1)
                archive.write(b'\0')
                archive.seek(0)
                shutil.copyfileobj(release.extractfile(member), archive, 16 << 20)
            elif member.isfile() and parts[:3] == ('binaries', 'data', 'config'):
                config[parts[3]] = release.extractfile(member).read()
    return mods, config


def headless(mods, config, source, output, tar):
    patch = (tools / 'data.patch').read_text()
    patch_paths = [line[6:] for line in patch.splitlines() if line.startswith('+++ b/')]
    with TemporaryDirectory() as directory, ZipFile(mods['public']) as upstream:
        for name in patch_paths:
            target = Path(directory) / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(upstream.read(name))
        subprocess.run(['patch', '-p1', '-d', directory], input=patch.encode(), check=True)
        patched = {name: (Path(directory) / name).read_bytes() for name in patch_paths}

    for mod in ('mod', 'public'):
        destination = output / 'data/mods' / mod
        destination.mkdir(parents=True)
        with ZipFile(mods[mod]) as upstream, ZipFile(
            destination / f'{mod}.zip', 'w', compression=ZIP_DEFLATED, compresslevel=6
        ) as archive:
            for entry in upstream.infolist():
                name = entry.filename
                if mod == 'mod':
                    keep = not name.startswith(('art/textures/', 'fonts/', 'audio/', 'shaders/spirv/'))
                else:
                    keep = name.startswith((
                        'simulation/', 'globalscripts/', 'gamesettings/', 'autostart/',
                        'gui/', 'art/terrains/', 'art/materials/', 'maps/scripts/',
                        'maps/scenarios/combat_demo.', 'maps/skirmishes/temperate_roadway_2p.'
                    )) or name in ('mod.json', 'art/LICENSE.txt', 'audio/LICENSE.txt')
                if keep:
                    content = patched[name] if mod == 'public' and name in patched else upstream.read(name)
                    entry.compress_type = ZIP_DEFLATED
                    archive.writestr(entry, content)

    (output / 'data/config').mkdir()
    for name, content in config.items():
        (output / 'data/config' / name).write_bytes(content)
    shutil.copytree(source / 'l10n', output / 'data/l10n')
    (output / 'data/icu').mkdir()
    shutil.copy2(tools / 'icudt68l.dat', output / 'data/icu/icudt68l.dat')
    (output / 'licenses').mkdir()
    for name in ('LICENSE.md', 'license_gpl-2.0.txt', 'license_lgpl-2.1.txt', 'license_mit.txt'):
        shutil.copy2(source / name, output / 'licenses' / name)

    tar.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(tar, 'w', format=tarfile.USTAR_FORMAT) as archive:
        for path in sorted(output.rglob('*')):
            if path.is_file():
                entry = archive.gettarinfo(str(path), arcname=str(path.relative_to(output)))
                entry.uid = entry.gid = entry.mtime = 0
                entry.uname = entry.gname = ''
                entry.mode = 0o644
                with path.open('rb') as stream:
                    archive.addfile(entry, stream)
    print(f'headless: {tar.stat().st_size} bytes', flush=True)


renderer_defaults = {
    'rendererbackend': 'dolly', 'cursorbackend': 'system', 'windowed': True,
    'shadows': False, 'silhouettes': False, 'watereffects': False,
    'waterfancyeffects': False, 'waterrealdepth': False, 'waterrefraction': False,
    'waterreflection': False, 'postproc': False, 'antialiasing': 'disabled',
}
unavailable_options = renderer_defaults.keys() | {
    'vsync', 'window.mousegrabinfullscreen', 'window.mousegrabinwindowmode',
}


def graphics(mods, headless, shaders, output):
    """Complete upstream content in bounded, independently cached archives."""
    shutil.copytree(headless, output)
    for mod in ('mod', 'public'):
        destination = output / f'data/mods/{mod}'
        (destination / f'{mod}.zip').unlink()
        with ZipFile(mods[mod]) as upstream, ZipFile(headless / f'data/mods/{mod}/{mod}.zip') as patched_archive:
            patched = set(patched_archive.namelist())
            translated = shaders / mod
            generated = {str(path.relative_to(translated)): path for path in translated.rglob('*') if path.is_file()}
            names = sorted({name for name in upstream.namelist() if not name.startswith('shaders/spirv/')} | generated.keys())
            archive = None
            index = 0
            archive_size = 22
            archive_limit = 24 * 1024 * 1024
            try:
                for name in names:
                    content = generated[name].read_bytes() if name in generated else (
                        patched_archive.read(name) if name in patched else upstream.read(name))
                    if mod == 'public' and name == 'gui/options/options.json':
                        categories = json.loads(content)
                        for category in categories:
                            category['options'] = [option for option in category['options']
                                if option['config'] not in unavailable_options and not any(
                                    isinstance(dependency, str) and renderer_defaults.get(dependency) is False
                                    for dependency in option.get('dependencies', []))]
                        content = (json.dumps(categories, ensure_ascii=False, indent='\t') + '\n').encode()
                    # Include local and central headers; leave room below Pages' 25 MiB
                    # limit for the snapshot record and gzip wrapper around each ZIP.
                    entry_size = len(zlib.compress(content, 6)) + 76 + 2 * len(name.encode('utf-8'))
                    if entry_size + 22 > archive_limit:
                        raise ValueError(f'content file exceeds archive limit: {name}')
                    if archive is None or archive_size + entry_size > archive_limit:
                        if archive is not None:
                            archive.close()
                        archive = ZipFile(destination / f'{mod}-{index:03}.zip', 'w', compression=ZIP_DEFLATED, compresslevel=6)
                        index += 1
                        archive_size = 22
                    archive_size += entry_size
                    entry = ZipInfo(name, (1980, 1, 1, 0, 0, 0))
                    entry.compress_type = ZIP_DEFLATED
                    entry.external_attr = 0o100644 << 16
                    archive.writestr(entry, content)
            finally:
                if archive is not None:
                    archive.close()
            print(f'{mod}: {len(names)} files in {index} archives', flush=True)

    defaults = renderer_defaults | {'xres': 1024, 'yres': 768, 'adaptivefps.session': 120, 'textures.quality': 0}
    (output / 'data/config/local.cfg').write_text(''.join(
        f'{name} = {json.dumps(value)}\n' for name, value in defaults.items()))
    print(f'content: {sum(path.stat().st_size for path in output.rglob("*") if path.is_file())} bytes', flush=True)


source, naga, output, tar, shaders = sys.argv[1:]
mods, config = read_release(sys.stdin.buffer)
with TemporaryDirectory() as directory:
    headless(mods, config, Path(source), Path(directory) / 'headless', Path(tar))
    translate(mods, naga, Path(shaders))
    graphics(mods, Path(directory) / 'headless', Path(shaders), Path(output))
