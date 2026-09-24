#!/usr/bin/env python3
"""Translate the pinned release's non-bindless, non-shadow graphics shaders."""
import hashlib
import json
import re
from pathlib import Path, PurePosixPath
import shutil
import struct
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from zipfile import ZipFile


def split_samplers(data):
    # SPIR-V combined image samplers have no WGSL counterpart. Preserve the
    # image at binding 2*n, add its sampler at 2*n+1, and rebuild each sampled load.
    if len(data) % 4 or len(data) < 20:
        raise ValueError("Invalid SPIR-V length")
    words = list(struct.unpack(f"<{len(data)//4}I", data))
    if words[0] != 0x07230203:
        raise ValueError("Invalid SPIR-V magic")
    header, instructions, at = words[:5], [], 5
    while at < len(words):
        count = words[at] >> 16
        if not count or at + count > len(words):
            raise ValueError("Invalid SPIR-V instruction")
        instructions.append(words[at:at + count])
        at += count
    sampled = {i[1]: i[2] for i in instructions if i[0] & 65535 == 27}  # OpTypeSampledImage
    pointers = {i[1]: i[3] for i in instructions if i[0] & 65535 == 32 and i[2] == 0 and i[3] in sampled}
    variables = {i[2]: i[1] for i in instructions if i[0] & 65535 == 59 and i[1] in pointers}
    if not variables:
        return data
    next_id = header[3]

    def allocate():
        nonlocal next_id
        result = next_id
        next_id += 1
        return result

    def inst(op, *args):
        return [((len(args) + 1) << 16) | op, *args]

    sampler_type, sampler_pointer = allocate(), allocate()
    samplers = {v: allocate() for v in variables}
    annotations = []
    for i in instructions:
        if i[0] & 65535 == 71 and i[1] in variables:  # OpDecorate
            if i[2] == 34:  # DescriptorSet
                annotations += inst(71, samplers[i[1]], 34, i[3])
            if i[2] == 33:  # Binding
                annotations += inst(71, samplers[i[1]], 33, i[3] * 2 + 1)
                i[3] *= 2
    output = []
    inserted_annotations = inserted_types = False
    for i in instructions:
        op = i[0] & 65535
        if not inserted_annotations and 19 <= op <= 39:
            output += annotations
            inserted_annotations = True
        if not inserted_types and op == 59:
            output += inst(26, sampler_type) + inst(32, sampler_pointer, 0, sampler_type)
            inserted_types = True
        if op == 32 and i[1] in pointers:
            i[3] = sampled[i[3]]
        if op == 15:  # OpEntryPoint interface list follows its NUL-terminated name.
            end = 3
            while b"\0" not in struct.pack("<I", i[end]):
                end += 1
            i += [samplers[v] for v in i[end + 1:] if v in samplers]
            i[0] = (len(i) << 16) | op
        if op == 61 and i[1] in sampled:  # OpLoad -> two loads and OpSampledImage
            if len(i) != 4 or i[3] not in variables:
                raise ValueError("Unsupported combined sampler access")
            image_id, sampler_id = allocate(), allocate()
            output += inst(61, sampled[i[1]], image_id, i[3])
            output += inst(61, sampler_type, sampler_id, samplers[i[3]])
            output += inst(86, i[1], i[2], image_id, sampler_id)
        else:
            output += i
        if op == 59 and i[2] in variables:
            output += inst(59, sampler_pointer, samplers[i[2]], 0)
    header[3] = next_id
    return struct.pack(f"<{len(header)+len(output)}I", *(header + output))


def border_sampling(text):
    textures = re.findall(
        r"@group\(1\) @binding\((\d+)\)\s+var (\w+): texture_(2d|cube)<f32>;", text)
    changed = False
    for binding, name, dimension in textures:
        if int(binding) % 2 or int(binding) >= 16:
            raise ValueError("Unexpected texture binding " + binding)
        sample = "dolly_sample_cube" if dimension == "cube" else "dolly_sample"
        for builtin, replacement in (("textureSample", sample), ("textureSampleLevel", sample + "_level")):
            text, count = re.subn(r"\b" + builtin + r"\(" + name + r",",
                f"{replacement}(dolly_samplers[{int(binding)//2}], {name},", text)
            changed |= count > 0
    if changed:
        text = Path(__file__).with_name("border-sampler.wgsl").read_text() + "\n" + text
    return text, changed


def main(source, naga, output):
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    manifest = {"translator": subprocess.check_output([naga, "--version"], text=True).strip(), "mods": {}}
    excluded = {"USE_DESCRIPTOR_INDEXING", "USE_SHADOW", "USE_SHADOW_SAMPLER"}
    with tempfile.TemporaryDirectory(prefix="0ad-shaders-") as temporary:
        spv = Path(temporary) / "input.spv"
        for mod in ("mod", "public"):
            destination = output / mod / "shaders/wgsl"
            destination.mkdir(parents=True)
            converted, borders, variants = {}, {}, 0
            with ZipFile(source / f"binaries/data/mods/{mod}/{mod}.zip") as archive:
                for name in sorted(archive.namelist()):
                    if not name.startswith("shaders/spirv/") or not name.endswith(".xml"):
                        continue
                    root = ET.fromstring(archive.read(name))
                    if root.tag != "programs":
                        continue
                    for program in list(root):
                        defines = {d.attrib["name"] for d in program.find("defines")}
                        metadata = ET.fromstring(archive.read("shaders/" + program.attrib["file"]))
                        if excluded & defines or metadata.find("compute") is not None:
                            root.remove(program)
                            continue
                        program.set("type", "wgsl")
                        program.set("file", program.attrib["file"].replace("spirv/", "wgsl/"))
                        metadata.set("type", "wgsl")
                        for stage in metadata:
                            original = stage.attrib["file"]
                            filename = PurePosixPath(original).name.replace(".spv", ".wgsl")
                            if original not in converted:
                                spv.write_bytes(split_samplers(archive.read("shaders/" + original)))
                                target = destination / filename
                                result = subprocess.run([naga, str(spv), str(target)], capture_output=True, text=True)
                                if result.returncode:
                                    raise RuntimeError(f"{mod}/{original}: {result.stderr}")
                                text = target.read_text().replace("var<immediate>", "@group(2) @binding(0) var<uniform>")
                                text, borders[original] = border_sampling(text)
                                # Upstream SPIR-V permits implicit derivatives after alpha-test discard.
                                text = "diagnostic(off, derivative_uniformity);\n" + text
                                target.write_text(text)
                                result = subprocess.run([naga, str(target)], capture_output=True, text=True)
                                if result.returncode:
                                    raise RuntimeError(f"{target}: {result.stderr}")
                                converted[original] = hashlib.sha256(target.read_bytes()).hexdigest()
                            stage.set("file", "wgsl/" + filename)
                            if borders[original]:
                                stage.set("dolly_border", "true")
                            for binding in stage.findall("descriptor_sets/descriptor_set/binding"):
                                if binding.attrib["type"].startswith("sampler"):
                                    number = int(binding.attrib["binding"]) * 2
                                    binding.set("binding", str(number))
                                    binding.set("sampler_binding", str(number + 1))
                        ET.ElementTree(metadata).write(destination / PurePosixPath(program.attrib["file"]).name, encoding="utf-8", xml_declaration=True)
                        variants += 1
                    if len(root):
                        ET.ElementTree(root).write(destination / PurePosixPath(name).name, encoding="utf-8", xml_declaration=True)
            manifest["mods"][mod] = {"variants": variants, "shaders": converted}
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    print(json.dumps({mod: {"variants": value["variants"], "shaders": len(value["shaders"])} for mod, value in manifest["mods"].items()}))


if __name__ == "__main__":
    main(Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3]))
