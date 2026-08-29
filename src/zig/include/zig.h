#ifndef DOLLY_ZIG_COMPAT_HEADER
#define DOLLY_ZIG_COMPAT_HEADER

/*
 * Compatibility definitions for C emitted by Zig's stage1 backend.
 *
 * Zig uses return addresses only as opaque allocator/debug metadata here.
 * Clang lowers __builtin_return_address on Emscripten to a JavaScript import,
 * which is outside Dolly's ABI and provides no useful information for a
 * separately loaded filesystem module. A zero return address has the same
 * release-build semantics without granting another browser capability.
 */
#if defined(__wasm__) && defined(__STDC_NO_ATOMICS__)
/*
 * Zig's header selects C11 atomics when either C11 atomics are enabled or a
 * stdatomic.h file merely exists. Clang's resource directory contains that
 * header in Dolly, so __STDC_NO_ATOMICS__ alone does not select Zig's GNU
 * __atomic_* fallback. Hide __has_include while the upstream header makes
 * that one feature decision. The C17 language headers Zig needs are selected
 * by __STDC_VERSION__, independently of this probe.
 */
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wbuiltin-macro-redefined"
#undef __has_include
#endif

#include_next <zig.h>

#if defined(__wasm__) && defined(__STDC_NO_ATOMICS__)
#pragma clang diagnostic pop
#endif

#if defined(__wasm__)
#undef zig_return_address
#define zig_return_address() ((uintptr_t)0)
#endif

#endif
