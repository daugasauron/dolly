"""Package complete upstream content in bounded, independently cached archives."""
from pathlib import Path
import json
import shutil
import sys
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

source = Path(sys.argv[1]) / 'binaries/data'
output = Path('build/0ad/graphics')
if output.exists():
    shutil.rmtree(output)
shutil.copytree('build/0ad/headless', output)

renderer_defaults = {
    'rendererbackend': 'dolly', 'cursorbackend': 'system', 'windowed': True,
    'shadows': False, 'silhouettes': False, 'watereffects': False,
    'waterfancyeffects': False, 'waterrealdepth': False, 'waterrefraction': False,
    'waterreflection': False, 'postproc': False, 'antialiasing': 'disabled',
}
unavailable_options = renderer_defaults.keys() | {
    'vsync', 'window.mousegrabinfullscreen', 'window.mousegrabinwindowmode',
}

for mod in ('mod', 'public'):
    destination = output / f'data/mods/{mod}'
    (destination / f'{mod}.zip').unlink()
    with ZipFile(source / f'mods/{mod}/{mod}.zip') as upstream, ZipFile(
        f'build/0ad/headless/data/mods/{mod}/{mod}.zip'
    ) as headless:
        patched = set(headless.namelist())
        shaders = Path(f'build/0ad/shaders/{mod}')
        generated = {str(path.relative_to(shaders)): path for path in shaders.rglob('*') if path.is_file()}
        names = sorted({name for name in upstream.namelist() if not name.startswith('shaders/spirv/')} | generated.keys())
        archive = None
        index = 0
        try:
            for name in names:
                if archive is None or archive.fp.tell() >= 64 * 1024 * 1024:
                    if archive is not None:
                        archive.close()
                    archive = ZipFile(destination / f'{mod}-{index:03}.zip', 'w', compression=ZIP_DEFLATED, compresslevel=6)
                    index += 1
                content = generated[name].read_bytes() if name in generated else (
                    headless.read(name) if name in patched else upstream.read(name))
                if mod == 'public' and name == 'gui/options/options.json':
                    categories = json.loads(content)
                    for category in categories:
                        category['options'] = [option for option in category['options']
                            if option['config'] not in unavailable_options and not any(
                                isinstance(dependency, str) and renderer_defaults.get(dependency) is False
                                for dependency in option.get('dependencies', []))]
                    content = (json.dumps(categories, ensure_ascii=False, indent='\t') + '\n').encode()
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
print(sum(path.stat().st_size for path in output.rglob('*') if path.is_file()))
