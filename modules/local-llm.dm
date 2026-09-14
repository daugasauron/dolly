DOLLY 3
MODULE local-llm

REQUIRES TOOL janis
REQUIRES TOOL tar
REQUIRES TOOL sha256sum
REQUIRES TOOL dolly-llama

SOURCE HOST /static/llama/provider.tar /tmp/llm-provider.tar a5ddf7db518a0f9d4cfb82b83b98035abc10ff9a00f667ab2f5bd3ded233882c
SLOP tar -xf /tmp/llm-provider.tar -C /

FILE /home/dolly/.pi/agent/settings.json
    {"enableInstallTelemetry":false,"images":{"autoResize":false},"shellPath":"/bin/slop","theme":"dolly","defaultProvider":"webgpu","defaultModel":"Qwen3.5-2B"}

EXPORTS FOLDER local-llm /usr/lib/dolly-llm
EXPORTS FOLDER local-llm-models /usr/share/dolly/llm
EXPORTS FILE local-model-provider /home/dolly/.pi/agent/extensions/local-model-provider.js
