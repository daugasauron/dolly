DOLLY 5
MODULE local-llm
REQUIRES HOST gpu@0

REQUIRES TOOL janis
REQUIRES TOOL tar
REQUIRES TOOL sha256sum
REQUIRES TOOL curl
REQUIRES TOOL dolly-llama

SOURCE https://daugasauron.com/dist/static/llama/provider.tar 398921d2c85ab545f8f793e661c1846769250df0a1e816d9a3ca0db6aebceaab /tmp/llm-provider.tar
SLOP tar -xf /tmp/llm-provider.tar -C /

FILE /home/dolly/.pi/agent/settings.json
    {"enableInstallTelemetry":false,"images":{"autoResize":false},"shellPath":"/bin/slop","theme":"dolly","defaultProvider":"webgpu","defaultModel":"qwen3.5-2b","compaction":{"reserveTokens":4096,"keepRecentTokens":6144}}

EXPORTS FOLDER local-llm /usr/lib/dolly-llm
EXPORTS FOLDER local-llm-models /usr/share/dolly/llm
EXPORTS FILE local-model-provider /home/dolly/.pi/agent/extensions/local-model-provider.js
