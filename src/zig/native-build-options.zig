const std = @import("std");

const IoMode = enum { threaded, evented };
const ValueInterpretMode = enum { direct, by_name };
const DevEnv = enum { bootstrap, core, full };

pub const mem_leak_frames: u32 = 0;
pub const skip_non_native = true;
pub const have_llvm = true;
pub const llvm_has_m68k = false;
pub const llvm_has_csky = false;
pub const llvm_has_arc = false;
pub const llvm_has_xtensa = false;
pub const version: [:0]const u8 = "0.16.0-dolly";
pub const semver = std.SemanticVersion.parse(version) catch unreachable;
pub const enable_debug_extensions = false;
pub const enable_logging = false;
pub const enable_link_snapshots = false;
pub const enable_tracy = false;
pub const enable_tracy_callstack = false;
pub const enable_tracy_allocation = false;
pub const tracy_callstack_depth: u32 = 0;
pub const value_tracing = false;
pub const debug_gpa = false;
pub const dev: DevEnv = .core;
pub const io_mode: IoMode = .threaded;
pub const value_interpret_mode: ValueInterpretMode = .direct;
