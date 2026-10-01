DOLLY 5
MODULE local-llm
REQUIRES HOST gpu@0

REQUIRES TOOL janis
REQUIRES TOOL tar
REQUIRES TOOL sha256sum
REQUIRES TOOL dolly-llama

SOURCE https://daugasauron.com/dist/static/llama/provider.tar 4c6f7ed4e0341f8100c560819e8435fc3fb5855cacdf0f4f1096b63407bc84f9 /tmp/llm-provider.tar
SLOP tar -xf /tmp/llm-provider.tar -C /

FILE /home/dolly/.pi/agent/settings.json
    {"enableInstallTelemetry":false,"images":{"autoResize":false},"shellPath":"/bin/slop","theme":"dolly","defaultProvider":"webgpu","defaultModel":"Qwen3.5-0.8B"}

EXPORTS FOLDER local-llm /usr/lib/dolly-llm
EXPORTS FOLDER local-llm-models /usr/share/dolly/llm
EXPORTS FILE local-model-provider /home/dolly/.pi/agent/extensions/local-model-provider.js
EXPORTS FILE local-model-license /usr/share/licenses/dolly-llm/Qwen-LICENSE
