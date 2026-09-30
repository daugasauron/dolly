from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import shutil
import subprocess
import sys
import tarfile
from tempfile import TemporaryDirectory

source = Path(sys.argv[1])
data = source / 'binaries/data'
output = Path('build/0ad/headless')
if output.exists():
    shutil.rmtree(output)

patch = Path('demos/zero-ad/toolchain/data.patch').read_text()
patch_paths = [line[6:] for line in patch.splitlines() if line.startswith('+++ b/')]
with TemporaryDirectory() as directory, ZipFile(data / 'mods/public/public.zip') as upstream:
    for name in patch_paths:
        target = Path(directory) / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(upstream.read(name))
    subprocess.run(['patch', '--batch', '--fuzz=0', '-p1', '-d', directory], input=patch.encode(), check=True)
    patched = {name: (Path(directory) / name).read_bytes() for name in patch_paths}

for mod in ('mod', 'public'):
    destination = output / 'data/mods' / mod
    destination.mkdir(parents=True)
    with ZipFile(data / f'mods/{mod}/{mod}.zip') as upstream, ZipFile(
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

for directory in ('config', 'l10n'):
    shutil.copytree(data / directory, output / 'data' / directory)
icu = Path('.cache/emscripten/ports/icu/icu')
(output / 'data/icu').mkdir()
shutil.copy2(icu / 'source/data/in/icudt68l.dat', output / 'data/icu/icudt68l.dat')
(output / 'licenses').mkdir()
for name in ('LICENSE.md', 'license_gpl-2.0.txt', 'license_lgpl-2.1.txt', 'license_mit.txt'):
    shutil.copy2(source / name, output / 'licenses' / name)
shutil.copy2(icu / 'LICENSE', output / 'licenses/ICU-LICENSE')
shutil.copy2(Path('.cache/0ad/openal-source.path').read_text().strip() + '/COPYING', output / 'licenses/OpenAL-Soft-COPYING')

with tarfile.open('build/0ad/headless-data.tar', 'w', format=tarfile.USTAR_FORMAT) as archive:
    for path in sorted(output.rglob('*')):
        if path.is_file():
            entry = archive.gettarinfo(str(path), arcname=str(path.relative_to(output)))
            entry.uid = entry.gid = entry.mtime = 0
            entry.uname = entry.gname = ''
            entry.mode = 0o644
            with path.open('rb') as stream:
                archive.addfile(entry, stream)
print(Path('build/0ad/headless-data.tar').stat().st_size)
