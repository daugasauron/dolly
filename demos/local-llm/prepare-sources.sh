# Sourced by scripts/prepare-image-sources.sh.
# Stage the weights of each selected model package.
node demos/local-llm/prepare-local-llm-weights.mjs "${static_dir}/llm" $(node scripts/list-images.mjs | cut -f1)
if has_image llama-build; then
  bash demos/local-llm/prepare-local-llm.sh "${static_dir}/llama/source.tar"
fi
if has_image local-llm-build; then
  node scripts/build-source-tar.mjs "${static_dir}/llama/engine.tar" \
    demos/local-llm/main.cpp /usr/src/dolly-llm/main.cpp \
    demos/local-llm/webgpu.cpp /usr/src/dolly-llm/webgpu.cpp \
    host/gpu/gpu.h /usr/src/dolly-llm/include/dolly/gpu.h \
    host/gpu/gpu-abi.h /usr/src/dolly-llm/include/dolly/gpu-abi.h
fi
if has_image pi-local; then
  node scripts/build-source-tar.mjs "${static_dir}/llama/provider.tar" \
    demos/local-llm/client.mjs /usr/lib/dolly-llm/client.mjs \
    demos/local-llm/model.mjs /usr/lib/dolly-llm/model.mjs \
    demos/local-llm/models /usr/share/dolly/llm \
    demos/local-llm/local-model-provider.js /home/dolly/.pi/agent/extensions/local-model-provider.js
fi
