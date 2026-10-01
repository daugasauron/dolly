DOLLY 5
MODULE local-llm-engine

REQUIRES TOOL cc
REQUIRES TOOL c++
REQUIRES TOOL tar
REQUIRES HEADER llama
REQUIRES LIB llama
REQUIRES LIB ggml
REQUIRES LIB ggml-base
REQUIRES LIB ggml-cpu
REQUIRES LIB ggml-webgpu

SOURCE https://daugasauron.com/dist/static/llama/engine.tar 8ea6c9f9bfe8c0d82b09ceef945a6d0821c4466ed774256d6c97de76bf2db988 /tmp/llm-engine.tar
SLOP tar -xf /tmp/llm-engine.tar -C /
SLOP c++ -std=c++20 -O1 -I/usr/include/dolly-llm -I/usr/src/dolly-llm/include \
  /usr/src/dolly-llm/main.cpp /usr/src/dolly-llm/webgpu.cpp \
  -L/usr/lib/dolly-llm -lllama -lggml -lggml-webgpu -lggml-cpu -lggml-base -ldolly-gpu -lm -o /usr/bin/dolly-llama

EXPORTS TOOL dolly-llama
EXPORTS FOLDER local-llm-sources /usr/src/dolly-llm
