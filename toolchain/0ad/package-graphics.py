"""Package selected official maps and their visual/audio dependency closures."""
from pathlib import Path
import fnmatch
import json
import re
import shutil
import struct
import sys
import tarfile
import xml.etree.ElementTree as ET
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED


def scenario_assets(archive, scenario, civ=None):
    names = set(archive.namelist())
    selected, visited = set(), set()

    def add(name):
        candidates = [name + suffix for suffix in ('', '.cached.dds', '.cached.pmd', '.cached.psa')]
        actual = next((path for path in candidates if path in names), None)
        if actual is None:
            raise ValueError('Missing asset: ' + name)
        selected.add(actual)

    def actor(path):
        if '{' in path:
            pattern = re.sub(r'\{[^}]+\}', '*', path)
            matches = sorted(fnmatch.filter(names, pattern))
            if not matches:
                raise ValueError('Missing actor variants: ' + path)
            for match in matches:
                actor(match)
            return
        if path in visited:
            return
        visited.add(path)
        add(path)
        for node in ET.fromstring(archive.read(path)).iter():
            if node.tag == 'texture':
                add('art/textures/skins/' + node.attrib['file'])
            elif node.tag == 'mesh':
                add('art/meshes/' + node.text)
            elif node.tag == 'animation' and node.get('file'):
                add('art/animation/' + node.attrib['file'])
            elif node.tag == 'variant' and node.get('file'):
                actor('art/variants/' + node.attrib['file'])
            elif node.tag == 'prop' and node.get('actor'):
                actor('art/actors/' + node.attrib['actor'])
            elif node.tag == 'actor' and node.get('file'):
                actor('art/actors/' + node.attrib['file'])

    def sound(path):
        if '{' in path:
            pattern = re.sub(r'\{[^}]+\}', '*', path)
            matches = sorted(fnmatch.filter(names, pattern))
            if not matches:
                raise ValueError('Missing sound variants: ' + path)
            for match in matches:
                sound(match)
            return
        if path in visited:
            return
        visited.add(path)
        add(path)
        group = ET.fromstring(archive.read(path))
        for node in group.findall('Sound'):
            add(str(Path(group.findtext('Path', '')) / node.text))

    def template(name):
        if name.startswith('actor|'):
            actor('art/actors/' + name[6:])
            return
        name = name.split('|')[-1]
        candidates = [prefix + name + '.xml' for prefix in (
            'simulation/templates/', 'simulation/templates/mixins/', 'simulation/templates/special/filter/')]
        path = next(path for path in candidates if path in names)
        if path in visited:
            return
        visited.add(path)
        root = ET.fromstring(archive.read(path))
        for parent in root.get('parent', '').split('|'):
            if parent:
                template(parent)
        for node in root.findall('.//Actor') + root.findall('.//FoundationActor'):
            if node.text:
                actor('art/actors/' + node.text)
        for node in root.findall('.//SpawnEntityOnDeath'):
            if node.text:
                template(node.text)
        for node in root.findall('.//SoundGroups/*'):
            if node.text:
                sound('audio/' + node.text)

    for node in ET.fromstring(archive.read(scenario + '.xml')).findall('.//Template'):
        template(node.text)
    selected.update(path for path in names if path.startswith(scenario + '.'))
    if civ:
        for path in sorted(names):
            if path.startswith((f'simulation/templates/units/{civ}/', f'simulation/templates/structures/{civ}/')) and path.endswith('.xml'):
                template(path.removeprefix('simulation/templates/').removesuffix('.xml'))
    for name in ('special/target_marker.xml', 'props/units/standards/formation.xml'):
        actor('art/actors/' + name)
    # Release 28 PMP: 12-byte header, u32 patch count, u16 height grid,
    # then a u32 count and length-prefixed terrain names. A patch is 16 tiles.
    data = archive.read(scenario + '.pmp')
    assert data[:8] == b'PSMP\x07\0\0\0'
    side = struct.unpack_from('<I', data, 12)[0] * 16 + 1
    offset = 16 + side * side * 2
    count = struct.unpack_from('<I', data, offset)[0]
    offset += 4
    for _ in range(count):
        size = struct.unpack_from('<I', data, offset)[0]
        offset += 4
        name = data[offset:offset + size].decode()
        offset += size
        matches = [path for path in names if path.startswith('art/terrains/') and path.endswith('/' + name + '.xml')]
        assert len(matches) == 1, (name, matches)
        for node in ET.fromstring(archive.read(matches[0])).iter('texture'):
            add('art/textures/terrain/' + node.attrib['file'])
    return selected


source = Path(sys.argv[1]) / 'binaries/data'
output = Path('build/0ad/graphics')
if output.exists():
    shutil.rmtree(output)
shutil.copytree('build/0ad/headless', output)
for mod in ('mod', 'public'):
    with ZipFile(source / f'mods/{mod}/{mod}.zip') as upstream, ZipFile(
        output / f'data/mods/{mod}/{mod}.zip', 'a', compression=ZIP_DEFLATED, compresslevel=6
    ) as archive:
        selected = scenario_assets(upstream, 'maps/scenarios/combat_demo') if mod == 'public' else set()
        if mod == 'public':
            selected.update(scenario_assets(upstream, 'maps/skirmishes/temperate_roadway_2p', 'athen'))
            music = json.loads(upstream.read('simulation/data/civs/athen.json'))['Music']
            selected.update('audio/music/' + track['File'] for track in music)
            selected.update('audio/music/' + name for name in re.findall(
                r'"([^"/]+\.ogg)"', upstream.read('gui/common/music.js').decode()))
            for path in upstream.namelist():
                if path.startswith('gui/') and path.endswith('.js'):
                    selected.update(re.findall(r'["\'](audio/[^"\']+\.ogg)["\']', upstream.read(path).decode()))
            assert selected <= set(upstream.namelist()), selected - set(upstream.namelist())
        prefixes = ('fonts/', 'art/textures/', 'audio/') if mod == 'mod' else (
            'art/skeletons/', 'art/particles/', 'art/textures/ui/', 'art/textures/misc/',
            'art/textures/particles/', 'art/textures/skies/', 'art/textures/terrain/alphamaps/',
            'art/textures/cursors/', 'art/textures/selection/', 'art/textures/animated/', 'shaders/effects/',
            'audio/interface/')
        existing = set(archive.namelist())
        for entry in upstream.infolist():
            if entry.filename not in existing and (entry.filename in selected or entry.filename.startswith(prefixes)):
                content = upstream.read(entry.filename)
                entry.compress_type = ZIP_DEFLATED
                archive.writestr(entry, content)
        base = Path(f'build/0ad/shaders/{mod}')
        for path in sorted(base.rglob('*')):
            if path.is_file():
                entry = ZipInfo(str(path.relative_to(base)), (1980, 1, 1, 0, 0, 0))
                entry.compress_type = ZIP_DEFLATED
                entry.external_attr = 0o100644 << 16
                archive.writestr(entry, path.read_bytes())

(output / 'data/config/local.cfg').write_text('''rendererbackend = "dolly"
cursorbackend = "system"
windowed = true
xres = 1024
yres = 768
adaptivefps.session = 120
textures.quality = 0
shadows = false
silhouettes = false
watereffects = false
waterfancyeffects = false
waterrealdepth = false
waterrefraction = false
waterreflection = false
postproc = false
antialiasing = "disabled"
''')
with tarfile.open('build/0ad/graphics-data.tar', 'w', format=tarfile.USTAR_FORMAT) as archive:
    for path in sorted(output.rglob('*')):
        if path.is_file():
            entry = archive.gettarinfo(str(path), arcname=str(path.relative_to(output)))
            entry.uid = entry.gid = entry.mtime = 0
            entry.uname = entry.gname = ''
            entry.mode = 0o644
            with path.open('rb') as stream:
                archive.addfile(entry, stream)
print(Path('build/0ad/graphics-data.tar').stat().st_size)
