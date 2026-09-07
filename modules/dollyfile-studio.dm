DOLLY 3
MODULE dollyfile-studio

REQUIRES TOOL pi
REQUIRES TOOL nvim
REQUIRES TOOL qjs
REQUIRES TOOL tar
REQUIRES TOOL slop
REQUIRES TOOL sha256sum
REQUIRES TOOL sed

SOURCE HOST /static/studio/studio.tar /tmp/dollyfile-studio/source.tar dbe8a2a65d5caeeeb2598a1a4c27bf256702115f0940566baaacabe17f963031
SLOP tar -xf /tmp/dollyfile-studio/source.tar -C /
SLOP slop -e /usr/share/dollyfile-studio/install.slop
SLOP dollyfile-lint /usr/share/dollyfile-studio/examples/Dollyfile-hello
SLOP dollyfile-lint /usr/share/dollyfile-studio/examples/Dollyfile-tool
SLOP rm -rf /tmp/dollyfile-studio

EXPORTS TOOL dollyfile-lint
FOLDER /usr/share/dollyfile-studio
FOLDER /home/dolly/.pi/agent/skills/dollyfiles
FOLDER /home/dolly/.pi/agent/prompts
FILE /home/dolly/.pi/agent/extensions/dollyfile-studio.js
FOLDER /home/dolly/.config/nvim

FILE /home/dolly/.pi/agent/settings.json
    {
      "npmCommand": ["/bin/echo"],
      "enableInstallTelemetry": false,
      "images": {"autoResize": false},
      "shellPath": "/bin/slop",
      "theme": "dolly",
      "defaultProvider": "webgpu",
      "defaultModel": "Qwen3.5-2B-q4f16_1-MLC"
    }

FILE /home/dolly/.dollyrc
    if test ! -f /workspace/Dollyfile; then
      cp /usr/share/dollyfile-studio/examples/Dollyfile-hello /workspace/Dollyfile
    fi
    printf '\033[33mDOLLY / DOLLYFILE STUDIO\033[0m\n'
    printf 'Start with /dolly-hello, /dolly-tool or /dolly-fix in Pi.\n'
    printf 'Ctrl+Shift+L: load local Qwen; /model: select it or a remote provider.\n'
    printf 'Leave Pi with Ctrl+D on an empty prompt, then: nvim /workspace/Dollyfile\n'
    printf 'dollyfile-lint checks syntax. download exports; the Custom Dollyfile page builds.\n\n'
