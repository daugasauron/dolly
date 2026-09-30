// build_options for zig2: upstream bootstrap.c's config, but only the C backend
// (dev = .cbe) for the one host target (skip_non_native). Without LLVM this is
// the backend that yields Dolly wasm64 PIC objects, through Dolly's cc.
pub const have_llvm = false;
pub const llvm_has_m68k = false;
pub const llvm_has_csky = false;
pub const llvm_has_arc = false;
pub const llvm_has_xtensa = false;
pub const version: [:0]const u8 = "0.16.0";
pub const semver = @import("std").SemanticVersion.parse(version) catch unreachable;
pub const enable_debug_extensions = false;
pub const enable_logging = false;
pub const enable_link_snapshots = false;
pub const enable_tracy = false;
pub const value_tracing = false;
pub const skip_non_native = true;
pub const debug_gpa = false;
pub const dev = .cbe;
pub const io_mode: enum { threaded, evented } = .threaded;
pub const value_interpret_mode = .direct;
