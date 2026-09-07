---
description: Learn Dollyfile linting by fixing a deliberately invalid version
---
Demonstrate a Dollyfile syntax error and its repair. Run this command with the
bash tool (it uses Slop). The first lint error is intentional:

```sh
sed '1s/DOLLY 3/DOLLY 2/' /usr/share/dollyfile-studio/examples/Dollyfile-hello > /workspace/Dollyfile-fix
if dollyfile-lint /workspace/Dollyfile-fix; then echo 'Expected a version error'; exit 1; fi
cp /usr/share/dollyfile-studio/examples/Dollyfile-hello /workspace/Dollyfile-fix && dollyfile-lint /workspace/Dollyfile-fix && cat /workspace/Dollyfile-fix
```

Explain why DOLLY 3 fixes it and how :DollyLint checks unsaved text in Neovim.
Do not alter the installed example or execute the recipe against this image.
