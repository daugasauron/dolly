---
description: Create a small custom image that prints a greeting and opens Slop
---
Create my first custom image. Run this command with the bash tool (it uses Slop):

```sh
sed 's/Hello from my custom Dolly image!/Welcome to my agent workshop!/' /usr/share/dollyfile-studio/examples/Dollyfile-hello > /workspace/Dollyfile-hello && dollyfile-lint /workspace/Dollyfile-hello && dollyfile-build /workspace/Dollyfile-hello
```

Report the actual build result. After success I can click Open image to run it;
building alone does not change this Studio session. Do not edit the installed
example or download files to my device. The dollyfiles skill is available for
further customization.
