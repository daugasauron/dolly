DOLLY 3
MODULE local-llm-weights

REQUIRES TOOL cat
REQUIRES TOOL sha256sum
REQUIRES TOOL cut
REQUIRES TOOL test
REQUIRES TOOL rm
REQUIRES TOOL mkdir

# Each input also fits builders from the original 512 MiB bootstrap seed.
SOURCE HOST /static/llama/model-0.part /tmp/llm-model-0.part b0bd8d29eaaf8080c157d9f7d291e14ccc1409c940a1a8a6b6640436a27c9fba
SOURCE HOST /static/llama/model-1.part /tmp/llm-model-1.part c009889f741d967d6ae7d100dc5d5752d25258eaefacd614aad4aa4b44e8b0b3
SOURCE HOST /static/llama/model-2.part /tmp/llm-model-2.part cdfbb8d66dceee37dc549d83631693674575a34e24798ad1a56ca41d3702430c
SLOP mkdir -p /usr/share/dolly/llm
SLOP cat /tmp/llm-model-0.part /tmp/llm-model-1.part /tmp/llm-model-2.part > /usr/share/dolly/llm/Qwen3.5-0.8B.gguf
SLOP test "$(sha256sum /usr/share/dolly/llm/Qwen3.5-0.8B.gguf | cut -d ' ' -f 1)" = fb044e93939a70469c905781334f5de1e6c8b608ced6cbc8c9249bd4127d9526
SLOP rm /tmp/llm-model-0.part /tmp/llm-model-1.part /tmp/llm-model-2.part

EXPORTS FILE local-model-weights /usr/share/dolly/llm/Qwen3.5-0.8B.gguf
