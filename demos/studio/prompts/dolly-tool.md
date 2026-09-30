---
description: Create an image with a small C command compiled inside Dolly
---
Create and build an image with a C command. Run this command with
the bash tool (it uses Slop):

```sh
cp /usr/share/dollyfile-studio/examples/Dollyfile-tool /workspace/Dollyfile-tool && dollyfile-lint /workspace/Dollyfile-tool && dollyfile-build /workspace/Dollyfile-tool
```

Report the actual build result. After success I can click Open image, then run
`hello agent` there. The executable belongs to the new image, not Studio.
Do not alter the installed example or download files to my device.
