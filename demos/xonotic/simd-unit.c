// SPDX-License-Identifier: GPL-2.0-or-later
// Compiles one of DarkPlaces' SSE2 units (the software rasterizer, the SSE
// skeletal animation) as Wasm SIMD, unchanged: Emscripten's compat
// <emmintrin.h> maps the intrinsics onto Wasm SIMD, and the pragma enables
// the target feature per function until Dolly's cc accepts -msimd128
// (core/cc-simd). Every browser that runs Dolly's memory64 has SIMD.
#pragma clang attribute push (__attribute__((target("simd128"))), apply_to = function)
#include DOLLY_XONOTIC_TRANSLATION_UNIT
#pragma clang attribute pop
