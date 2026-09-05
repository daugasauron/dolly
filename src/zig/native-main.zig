const std = @import("std");
const compiler = @import("compiler");

// Dolly already provides separately audited C, C++, and archive commands.
// Keep those frontend modes out of Zig's embedded compiler image instead of
// linking a second Clang driver and broadening the toolchain process surface.
export fn ZigClang_main(_: c_int, _: [*:null]?[*:0]u8) callconv(.c) c_int {
    std.debug.print("zig: use Dolly's /bin/cc for C and C++ sources\n", .{});
    return 1;
}

export fn ZigLlvmAr_main(_: c_int, _: [*:null]?[*:0]u8) callconv(.c) c_int {
    std.debug.print("zig: use Dolly's /bin/ar for archive operations\n", .{});
    return 1;
}

// compiler-main.c selects this entry only for --dolly-toolchain-mode=zig.
// Everything below Zig is ordinary process libc plus dolly-process-0; there
// are no kernel-libc imports or browser fallbacks in this executable.
export fn dolly_main(argc: c_int, argv: [*][*:0]u8) callconv(.c) c_int {
    if (argc < 0) return 1;

    var environment_count: usize = 0;
    while (std.c.environ[environment_count] != null) : (environment_count += 1) {}

    const arguments: []const [*:0]const u8 =
        @ptrCast(argv[0..@as(usize, @intCast(argc))]);
    const environment: [:null]const ?[*:0]const u8 =
        @ptrCast(std.c.environ[0..environment_count :null]);

    compiler.main(.{
        .args = .{ .vector = arguments },
        .environ = .{ .block = .{ .slice = environment } },
    }) catch |err| {
        std.debug.print("zig: {s}\n", .{@errorName(err)});
        return 1;
    };
    return 0;
}
