---
description: Create an image with a small C command compiled inside Dolly
---
Create an image with a C command, and test its C source. Run this command with
the bash tool (it uses Slop):

```sh
cp /usr/share/dollyfile-studio/examples/Dollyfile-tool /workspace/Dollyfile-tool && dollyfile-lint /workspace/Dollyfile-tool || exit
studio_scratch=$(mktemp -d) || exit
sed -n 's/^    //p' /workspace/Dollyfile-tool > "$studio_scratch/hello.c"
cc -std=c17 -O1 "$studio_scratch/hello.c" -o "$studio_scratch/hello" && "$studio_scratch/hello" agent
studio_status=$?
rm -rf "$studio_scratch"
exit "$studio_status"
```

Then explain that the full recipe builds /usr/bin/hello, which EXPORTS TOOL
retains on PATH. The scratch run is not a full image build: I can paste the
recipe into the site's Run a Dollyfile page for that. Do not alter the installed
example, execute the recipe here, or download files to my device.
