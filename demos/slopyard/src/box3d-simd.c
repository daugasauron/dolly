// Box3D keys its pthread, clock and Wasm SIMD paths on this name; its unknown-platform path runs each worker loop inline and never returns.
#define __EMSCRIPTEN__ 1
#pragma clang attribute push (__attribute__((target("simd128"))), apply_to = function)
#include DOLLY_BOX3D_TRANSLATION_UNIT
#pragma clang attribute pop
