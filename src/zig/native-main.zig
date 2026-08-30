const std = @import("std");
const compiler = @import("compiler");

extern fn dolly_exit(status: c_int) noreturn;
extern fn dolly_getrandom(buffer: *anyopaque, length: usize, flags: c_uint) isize;
extern fn dolly_kill(pid: c_int, signal: c_int) c_int;
extern fn dolly_waitpid(pid: c_int, status: ?*c_int, options: c_int) c_int;
extern fn dolly_execve(path: [*:0]const u8, argv: [*:null]const ?[*:0]const u8, envp: [*:null]const ?[*:0]const u8) c_int;
extern fn dolly_alarm(seconds: c_uint) c_uint;

fn unsupported() c_int {
    std.c._errno().* = @intFromEnum(std.c.E.NOSYS);
    return -1;
}

// Keep unavailable POSIX process and socket operations inside Dolly's typed
// denial boundary.  These definitions satisfy Zig's generic compiler paths
// without adding ambient Emscripten/browser imports to the command module.
export fn exit(status: c_int) callconv(.c) noreturn {
    dolly_exit(status);
}

export fn kill(pid: c_int, signal: c_int) callconv(.c) c_int {
    return dolly_kill(pid, signal);
}

export fn waitpid(pid: c_int, status: ?*c_int, options: c_int) callconv(.c) c_int {
    return dolly_waitpid(pid, status, options);
}

export fn execve(path: [*:0]const u8, argv: [*:null]const ?[*:0]const u8, envp: [*:null]const ?[*:0]const u8) callconv(.c) c_int {
    return dolly_execve(path, argv, envp);
}

export fn getentropy(buffer: *anyopaque, length: usize) callconv(.c) c_int {
    const received = dolly_getrandom(buffer, length, 0);
    return if (received == @as(isize, @intCast(length))) 0 else -1;
}

export fn pthread_self() callconv(.c) usize {
    return 1;
}

export fn getaddrinfo(_: ?[*:0]const u8, _: ?[*:0]const u8, _: ?*const anyopaque, _: *?*anyopaque) callconv(.c) c_int {
    return @intFromEnum(std.c.EAI.FAIL);
}

export fn freeaddrinfo(_: ?*anyopaque) callconv(.c) void {}

export fn if_nametoindex(_: [*:0]const u8) callconv(.c) c_uint {
    return 0;
}

export fn getsockname(_: c_int, _: ?*anyopaque, _: ?*anyopaque) callconv(.c) c_int {
    return unsupported();
}

export fn socketpair(_: c_int, _: c_int, _: c_int, _: *[2]c_int) callconv(.c) c_int {
    return unsupported();
}

export fn socket(_: c_int, _: c_int, _: c_int) callconv(.c) c_int {
    return unsupported();
}

export fn connect(_: c_int, _: *const anyopaque, _: c_uint) callconv(.c) c_int {
    return unsupported();
}

export fn bind(_: c_int, _: *const anyopaque, _: c_uint) callconv(.c) c_int {
    return unsupported();
}

export fn listen(_: c_int, _: c_int) callconv(.c) c_int {
    return unsupported();
}

export fn accept4(_: c_int, _: ?*anyopaque, _: ?*anyopaque, _: c_int) callconv(.c) c_int {
    return unsupported();
}

export fn setsockopt(_: c_int, _: c_int, _: c_int, _: ?*const anyopaque, _: c_uint) callconv(.c) c_int {
    return unsupported();
}

export fn shutdown(_: c_int, _: c_int) callconv(.c) c_int {
    return unsupported();
}

export fn recvmsg(_: c_int, _: *anyopaque, _: c_int) callconv(.c) isize {
    return unsupported();
}

export fn sendmsg(_: c_int, _: *const anyopaque, _: c_int) callconv(.c) isize {
    return unsupported();
}

export fn setrlimit(_: c_int, _: *const anyopaque) callconv(.c) c_int {
    return unsupported();
}

export fn sysctlbyname(_: [*:0]const u8, _: ?*anyopaque, _: ?*usize, _: ?*const anyopaque, _: usize) callconv(.c) c_int {
    return unsupported();
}

// Dolly already provides its separately audited Clang command. Keep `zig cc`
// out of this WebAssembly-only compiler image instead of linking a duplicate
// Clang frontend and its larger ABI surface.
export fn ZigClang_main(_: c_int, _: [*:null]?[*:0]u8) callconv(.c) c_int {
    std.debug.print("zig: use Dolly's /bin/cc for C and C++ sources\n", .{});
    return 1;
}

export fn ZigLlvmAr_main(_: c_int, _: [*:null]?[*:0]u8) callconv(.c) c_int {
    std.debug.print("zig: use Dolly's /bin/ar for archive operations\n", .{});
    return 1;
}

export fn ZigLLDLinkCOFF(_: c_int, _: [*:null]const ?[*:0]const u8, _: bool, _: bool) callconv(.c) bool {
    return false;
}

export fn ZigLLDLinkELF(_: c_int, _: [*:null]const ?[*:0]const u8, _: bool, _: bool) callconv(.c) bool {
    return false;
}

export fn _Exit(status: c_int) callconv(.c) noreturn {
    dolly_exit(status);
}

export fn __cxa_atexit(_: usize, _: usize, _: usize) callconv(.c) c_int {
    return 0;
}

export fn alarm(seconds: c_uint) callconv(.c) c_uint {
    return dolly_alarm(seconds);
}

export fn dlopen(_: ?[*:0]const u8, _: c_int) callconv(.c) ?*anyopaque {
    _ = unsupported();
    return null;
}

export fn dlclose(_: ?*anyopaque) callconv(.c) c_int {
    return unsupported();
}

export fn dlsym(_: ?*anyopaque, _: [*:0]const u8) callconv(.c) ?*anyopaque {
    _ = unsupported();
    return null;
}

export fn dlerror() callconv(.c) ?[*:0]const u8 {
    return "dynamic loading is unavailable inside the native Zig command";
}

export fn emscripten_futex_wait(_: *const i32, _: i32, _: f64) callconv(.c) c_int {
    return -1;
}

export fn emscripten_futex_wake(_: *const i32, _: c_int) callconv(.c) c_int {
    return 0;
}

export fn feclearexcept(_: c_int) callconv(.c) c_int {
    return 0;
}

export fn getpwnam_r(_: [*:0]const u8, _: *anyopaque, _: [*]u8, _: usize, _: *?*anyopaque) callconv(.c) c_int {
    return @intFromEnum(std.c.E.NOSYS);
}

export fn getpwuid_r(_: c_uint, _: *anyopaque, _: [*]u8, _: usize, _: *?*anyopaque) callconv(.c) c_int {
    return @intFromEnum(std.c.E.NOSYS);
}

export fn getrusage(_: c_int, _: *anyopaque) callconv(.c) c_int {
    return unsupported();
}

export fn mallinfo(_: *anyopaque) callconv(.c) void {}

export fn posix_madvise(_: *anyopaque, _: usize, _: c_int) callconv(.c) c_int {
    return 0;
}

export fn posix_spawn(_: *c_int, _: [*:0]const u8, _: ?*const anyopaque, _: ?*const anyopaque, _: [*:null]const ?[*:0]const u8, _: [*:null]const ?[*:0]const u8) callconv(.c) c_int {
    return @intFromEnum(std.c.E.NOSYS);
}

export fn posix_spawn_file_actions_init(_: *anyopaque) callconv(.c) c_int {
    return @intFromEnum(std.c.E.NOSYS);
}

export fn posix_spawn_file_actions_addopen(_: *anyopaque, _: c_int, _: [*:0]const u8, _: c_int, _: c_int) callconv(.c) c_int {
    return @intFromEnum(std.c.E.NOSYS);
}

export fn posix_spawn_file_actions_adddup2(_: *anyopaque, _: c_int, _: c_int) callconv(.c) c_int {
    return @intFromEnum(std.c.E.NOSYS);
}

export fn posix_spawn_file_actions_destroy(_: *anyopaque) callconv(.c) c_int {
    return 0;
}

export fn pthread_mutexattr_init(_: *anyopaque) callconv(.c) c_int {
    return 0;
}
export fn pthread_mutexattr_destroy(_: *anyopaque) callconv(.c) c_int {
    return 0;
}
export fn pthread_mutexattr_settype(_: *anyopaque, _: c_int) callconv(.c) c_int {
    return 0;
}
export fn pthread_mutex_init(_: *anyopaque, _: ?*const anyopaque) callconv(.c) c_int {
    return 0;
}
export fn pthread_mutex_destroy(_: *anyopaque) callconv(.c) c_int {
    return 0;
}
export fn pthread_mutex_lock(_: *anyopaque) callconv(.c) c_int {
    return 0;
}
export fn pthread_mutex_unlock(_: *anyopaque) callconv(.c) c_int {
    return 0;
}
export fn pthread_cond_wait(_: *anyopaque, _: *anyopaque) callconv(.c) c_int {
    return 0;
}
export fn pthread_cond_broadcast(_: *anyopaque) callconv(.c) c_int {
    return 0;
}
export fn pthread_cond_destroy(_: *anyopaque) callconv(.c) c_int {
    return 0;
}

export fn sigaltstack(_: ?*const anyopaque, _: ?*anyopaque) callconv(.c) c_int {
    return unsupported();
}

export fn wait(_: ?*c_int) callconv(.c) c_int {
    return unsupported();
}

export fn wait4(_: c_int, _: ?*c_int, _: c_int, _: ?*anyopaque) callconv(.c) c_int {
    return unsupported();
}

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
