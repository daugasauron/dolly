DOLLY 3
MODULE llama-core

REQUIRES TOOL cc
REQUIRES TOOL c++
REQUIRES TOOL cmake
REQUIRES TOOL make
REQUIRES TOOL tar
REQUIRES TOOL rm

SOURCE HOST /static/llama/source.tar /tmp/llama-source.tar 5f3ad5d6f0579842ed9911468b521e73f430b3cd1545986a9e849fe3afa49afd
SLOP tar -xf /tmp/llama-source.tar -C /
SLOP cmake -S /tmp/llama -B /tmp/llama/build \
  -DCMAKE_SYSTEM_NAME=Dolly -DCMAKE_SYSTEM_PROCESSOR=wasm64 \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_C_FLAGS_RELEASE=-O1 -DCMAKE_CXX_FLAGS_RELEASE=-O1 \
  -DCMAKE_C_COMPILER=cc -DCMAKE_CXX_COMPILER=c++ -DCMAKE_INSTALL_PREFIX=/usr
SLOP cmake --build /tmp/llama/build --target llama ggml-webgpu
SLOP cmake --install /tmp/llama/build
SLOP rm -rf /tmp/llama /tmp/llama-source.tar

EXPORTS LIB llama /usr/lib/dolly-llm/libllama.a
EXPORTS LIB ggml /usr/lib/dolly-llm/libggml.a
EXPORTS LIB ggml-base /usr/lib/dolly-llm/libggml-base.a
EXPORTS LIB ggml-cpu /usr/lib/dolly-llm/libggml-cpu.a
EXPORTS LIB ggml-webgpu /usr/lib/dolly-llm/libggml-webgpu.a
EXPORTS HEADER llama /usr/include/dolly-llm
EXPORTS FOLDER llama-licenses /usr/share/licenses/dolly-llm
