DOLLY 3
MODULE local-llm

REQUIRES TOOL janis
REQUIRES TOOL tar
REQUIRES TOOL sha256sum
REQUIRES TOOL dolly-llama

SOURCE HOST /static/llama/provider.tar /tmp/llm-provider.tar d0f3efaa3c8e6eb2700587758a1c7ba3e28be6972df1da3ac4f2013089bd108c
SLOP tar -xf /tmp/llm-provider.tar -C /

FILE /home/dolly/.pi/agent/settings.json
    {"enableInstallTelemetry":false,"images":{"autoResize":false},"shellPath":"/bin/slop","theme":"dolly","defaultProvider":"webgpu","defaultModel":"Qwen3.5-0.8B"}

EXPORTS FOLDER local-llm /usr/lib/dolly-llm
EXPORTS FOLDER local-llm-models /usr/share/dolly/llm
EXPORTS FILE local-model-provider /home/dolly/.pi/agent/extensions/local-model-provider.js
EXPORTS FILE local-model-license /usr/share/licenses/dolly-llm/Qwen-LICENSE
