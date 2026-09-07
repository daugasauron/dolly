---
description: Create a small custom image that prints a greeting and opens Slop
---
Create my first custom image. Run this command with the bash tool (it uses Slop):

```sh
sed 's/Hello from my custom Dolly image!/Welcome to my agent workshop!/' /usr/share/dollyfile-studio/examples/Dollyfile-hello > /workspace/Dollyfile-hello && dollyfile-lint /workspace/Dollyfile-hello && cat /workspace/Dollyfile-hello
```

Then briefly explain: the pin was preserved; lint checks syntax, not a full build;
I can paste the resulting file into the site's Run a Dollyfile page to build it.
Do not edit the installed example, execute the recipe here, or download files to
my device. The dollyfiles skill is available for further customization.
