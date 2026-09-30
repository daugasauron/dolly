DOLLY 4
MODULE dollyfile-studio

REQUIRES TOOL pi
REQUIRES TOOL nvim
REQUIRES TOOL qjs
REQUIRES TOOL janis
REQUIRES TOOL tar
REQUIRES TOOL slop
REQUIRES TOOL sha256sum
REQUIRES TOOL sed
# dollyfile-build starts disposable image builds through the page.
REQUIRES HOST build@0

SOURCE HOST /static/studio/studio.tar /tmp/dollyfile-studio/source.tar f5d09a81bfc2a245a9122831696bc425e3490fb9b55664f1bc2e92b3d7b5b82a
SLOP tar -xf /tmp/dollyfile-studio/source.tar -C /
SLOP slop -e /usr/share/dollyfile-studio/install.slop
SLOP dollyfile-lint /usr/share/dollyfile-studio/examples/Dollyfile-hello
SLOP dollyfile-lint /usr/share/dollyfile-studio/examples/Dollyfile-tool
SLOP rm -rf /tmp/dollyfile-studio

EXPORTS TOOL dollyfile-lint
EXPORTS TOOL dollyfile-build
FOLDER /usr/share/dollyfile-studio
FOLDER /home/dolly/.pi/agent/skills/dollyfiles
FOLDER /home/dolly/.pi/agent/prompts
FILE /home/dolly/.pi/agent/extensions/dollyfile-studio.js
FOLDER /home/dolly/.config/nvim

FILE /home/dolly/.pi/agent/settings.json
    {
      "enableInstallTelemetry": false,
      "images": {"autoResize": false},
      "shellPath": "/bin/slop",
      "theme": "dolly",
      "defaultProvider": "webgpu",
      "defaultModel": "Qwen3.5-0.8B"
    }

FILE /home/dolly/.dollyrc
    if test ! -f /workspace/Dollyfile; then
      cp /usr/share/dollyfile-studio/examples/Dollyfile-hello /workspace/Dollyfile
    fi
    printf '\033[33mDOLLY / DOLLYFILE STUDIO\033[0m\n'
    printf 'Start with /dolly-hello, /dolly-tool or /dolly-fix in Pi.\n'
    printf '/model: select local Qwen or a remote provider. The first prompt loads local weights.\n'
    printf 'Leave Pi with Ctrl+D on an empty prompt, then: nvim /workspace/Dollyfile\n'
    printf 'dollyfile-build streams a test build; click Open image when finished.\n\n'
