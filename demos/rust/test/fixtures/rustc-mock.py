#!/usr/bin/env python3
"""A stand-in for Dolly's rustc when Patti runs natively.

It records each compiler command in ../../rustc.log, writes the requested
artifact and a rustc-style dep-info file naming the source and every
include_str!/include_bytes! input. A binary's artifact is its source run by
/bin/sh, so a fixture build.rs is a shell script printing cargo: instructions.
"""
import json
import os
import re
import sys

arguments = sys.argv[1:]
if "--print" in arguments:
    print('panic="abort"\ntarget_arch="wasm64"\ntarget_os="emscripten"\n'
          'target_pointer_width="64"\nunix')
    sys.exit(0)
if "--version" in arguments:
    print("rustc 1.0.0-mock\nhost: wasm64-unknown-emscripten")
    sys.exit(0)

with open(os.path.join(os.path.dirname(__file__), "../../rustc.log"), "a") as log:
    log.write(json.dumps(arguments) + "\n")
value = lambda option: arguments[arguments.index(option) + 1]
source = arguments[arguments.index("--crate-name") + 2]  # Patti passes the source after the name.
output = value("-o")
with open(source) as stream:
    text = stream.read()
inputs = [source] + [os.path.normpath(os.path.join(os.path.dirname(source), path))
                     for path in re.findall(r'include_(?:str|bytes)!\("([^"]+)"\)', text)]
with open(output, "w") as stream:
    stream.write("#!/bin/sh\n" + text if value("--crate-type") == "bin" else text)
os.chmod(output, 0o755)
depinfo = value("--emit").split("dep-info=", 1)[1]
escaped = [path.replace(" ", "\\ ") for path in inputs]
with open(depinfo, "w") as stream:
    stream.write(f"{output}: {' '.join(escaped)}\n\n" + "".join(f"{path}:\n" for path in escaped))
