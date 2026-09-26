DOLLY 4
MODULE local-llm-engine

REQUIRES TOOL cc
REQUIRES HOST gpu@0
REQUIRES TOOL c++
REQUIRES TOOL tar
REQUIRES HEADER llama
REQUIRES LIB llama
REQUIRES LIB ggml
REQUIRES LIB ggml-base
REQUIRES LIB ggml-cpu
REQUIRES LIB ggml-webgpu

SOURCE HOST /static/llama/engine.tar /tmp/llm-engine.tar c02566f90ce915ba83c964e003c4ebb21b250c5ed08bb44d73612941b42b6870
SLOP tar -xf /tmp/llm-engine.tar -C /
SLOP c++ -std=c++20 -O1 -I/usr/include/dolly-llm -I/usr/src/dolly-llm/include \
  /usr/src/dolly-llm/main.cpp /usr/src/dolly-llm/webgpu.cpp \
  -L/usr/lib/dolly-llm -lllama -lggml -lggml-webgpu -lggml-cpu -lggml-base -ldolly-gpu -lm -o /usr/bin/dolly-llama

EXPORTS TOOL dolly-llama
EXPORTS FOLDER local-llm-sources /usr/src/dolly-llm
