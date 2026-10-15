// libxev's poll backend as Ghostty uses it: an Async notified from another
// thread, a timer, a Stream's queued write read back through the loop, and a
// child's exit code through Process. Prints XEV-POLL-OK.
const std = @import("std");
// The backend libxev's default selects on Dolly, named so the check also builds elsewhere.
const xev = @import("xev").Poll;

const State = struct {
    woken: bool = false,
    timer_fired: bool = false,
    written: usize = 0,
    read_back: usize = 0,
    exit_code: ?u32 = null,
};

fn notifier(async_: *xev.Async) void {
    _ = std.c.nanosleep(&.{ .sec = 0, .nsec = 50 * std.time.ns_per_ms }, null);
    async_.notify() catch |err| std.debug.panic("notify: {t}", .{err});
}

pub fn main(init: std.process.Init) !void {
    if (@import("builtin").os.tag == .emscripten and @import("xev").backend != .poll) @compileError("expected the poll backend");
    var state: State = .{};
    var loop = try xev.Loop.init(.{});
    defer loop.deinit();

    var async_ = try xev.Async.init();
    defer async_.deinit();
    var c_async: xev.Completion = .{};
    async_.wait(&loop, &c_async, State, &state, (struct {
        fn cb(s: ?*State, _: *xev.Loop, _: *xev.Completion, r: xev.Async.WaitError!void) xev.CallbackAction {
            r catch |err| std.debug.panic("async: {t}", .{err});
            s.?.woken = true;
            return .disarm;
        }
    }).cb);
    const thread = try std.Thread.spawn(.{}, notifier, .{&async_});

    var timer = try xev.Timer.init();
    defer timer.deinit();
    var c_timer: xev.Completion = .{};
    timer.run(&loop, &c_timer, 20, State, &state, (struct {
        fn cb(s: ?*State, _: *xev.Loop, _: *xev.Completion, r: xev.Timer.RunError!void) xev.CallbackAction {
            r catch |err| std.debug.panic("timer: {t}", .{err});
            s.?.timer_fired = true;
            return .disarm;
        }
    }).cb);

    var fds: [2]std.c.fd_t = undefined;
    if (std.c.pipe(&fds) != 0) return error.Pipe;
    var stream = xev.Stream.initFd(fds[1]);
    var queue: xev.WriteQueue = .{};
    var request: xev.WriteRequest = undefined;
    stream.queueWrite(&loop, &queue, &request, .{ .slice = "through the poll loop" }, State, &state, (struct {
        fn cb(s: ?*State, _: *xev.Loop, _: *xev.Completion, _: xev.Stream, _: xev.WriteBuffer, r: xev.WriteError!usize) xev.CallbackAction {
            s.?.written = r catch |err| std.debug.panic("write: {t}", .{err});
            return .disarm;
        }
    }).cb);
    var reader = xev.Stream.initFd(fds[0]);
    var c_read: xev.Completion = .{};
    var buffer: [64]u8 = undefined;
    reader.read(&loop, &c_read, .{ .slice = &buffer }, State, &state, (struct {
        fn cb(s: ?*State, _: *xev.Loop, _: *xev.Completion, _: xev.Stream, _: xev.ReadBuffer, r: xev.ReadError!usize) xev.CallbackAction {
            s.?.read_back = r catch |err| std.debug.panic("read: {t}", .{err});
            return .disarm;
        }
    }).cb);

    const child = try std.process.spawn(init.io, .{ .argv = &.{ "sh", "-c", "exit 42" } });
    var process = try xev.Process.init(child.id.?);
    defer process.deinit();
    var c_process: xev.Completion = .{};
    process.wait(&loop, &c_process, State, &state, (struct {
        fn cb(s: ?*State, _: *xev.Loop, _: *xev.Completion, r: xev.Process.WaitError!u32) xev.CallbackAction {
            s.?.exit_code = r catch |err| std.debug.panic("process: {t}", .{err});
            return .disarm;
        }
    }).cb);

    try loop.run(.until_done);
    thread.join();
    std.debug.print("woken={} timer={} written={d} read={d} exit={?d}\n", .{
        state.woken, state.timer_fired, state.written, state.read_back, state.exit_code,
    });
    if (!state.woken or !state.timer_fired or state.written != 21 or state.read_back != 21 or state.exit_code != 42)
        return error.CheckFailed;
    std.debug.print("XEV-POLL-OK\n", .{});
}
