# Sourced by scripts/prepare-image-sources.sh.
# Model packages are images without modules: stage the weights of each selected one.
node demos/local-llm/prepare-local-llm-weights.mjs "${static_dir}/llm" $(node scripts/list-images.mjs | cut -f1)
if has_module llama-core; then
  bash demos/local-llm/prepare-local-llm.sh "${static_dir}/llama/source.tar"
fi
if has_module local-llm-engine; then
  node scripts/build-source-tar.mjs "${static_dir}/llama/engine.tar" \
    demos/local-llm/main.cpp /usr/src/dolly-llm/main.cpp \
    demos/local-llm/webgpu.cpp /usr/src/dolly-llm/webgpu.cpp \
    host/gpu/gpu.h /usr/src/dolly-llm/include/dolly/gpu.h \
    host/gpu/gpu-abi.h /usr/src/dolly-llm/include/dolly/gpu-abi.h
fi
if has_module local-llm; then
  node scripts/build-source-tar.mjs "${static_dir}/llama/provider.tar" \
    demos/local-llm/client.mjs /usr/lib/dolly-llm/client.mjs \
    demos/local-llm/model.mjs /usr/lib/dolly-llm/model.mjs \
    demos/local-llm/qwen.mjs /usr/lib/dolly-llm/qwen.mjs \
    demos/local-llm/minicpm.mjs /usr/lib/dolly-llm/minicpm.mjs \
    demos/local-llm/models.json /usr/share/dolly/llm/models.json \
    demos/local-llm/local-model-provider.js /home/dolly/.pi/agent/extensions/local-model-provider.js
fi
