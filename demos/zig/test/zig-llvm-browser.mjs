// Zig with LLVM installed into a default session: build-exe links through cc,
// the program starts a child, a threaded program starts a thread, a program
// lists a directory, translate-c reads libc's headers, and zig build runs a
// project's build.zig. Zig names a WebAssembly program NAME.wasm.
// Usage: node demos/zig/test/zig-llvm-browser.mjs
import { demoTest, writeCommand } from "../../browser.mjs";

const hello = `const std = @import("std");

pub fn main(init: std.process.Init) !void {
    var child = try std.process.spawn(init.io, .{ .argv = &.{ "echo", "child" }, .stdout = .pipe });
    var buffer: [64]u8 = undefined;
    var reader = child.stdout.?.readerStreaming(init.io, &buffer);
    const line = try reader.interface.takeDelimiterExclusive('\\n');
    _ = try child.wait(init.io);
    std.debug.print("hello {s}\\n", .{line});
}
`;
// Its Io starts with signal handlers and a processor count; its allocator is libc's.
const threaded = `const std = @import("std");

fn work(answer: *u32) void {
    answer.* = 42;
}

pub fn main(init: std.process.Init) !void {
    var answer: u32 = 0;
    const thread = try std.Thread.spawn(.{}, work, .{&answer});
    thread.join();
    const text = try std.fmt.allocPrint(init.gpa, "thread {d}", .{answer});
    defer init.gpa.free(text);
    std.debug.print("{s}\\n", .{text});
}
`;
const list = `const std = @import("std");

pub fn main(init: std.process.Init) !void {
    var dir = try std.Io.Dir.cwd().openDir(init.io, ".", .{ .iterate = true });
    defer dir.close(init.io);
    var entries = dir.iterate();
    while (try entries.next(init.io)) |entry| {
        if (std.mem.eql(u8, entry.name, "list.zig")) std.debug.print("listed {s}\\n", .{entry.name});
    }
}
`;
const build = `const std = @import("std");

pub fn build(b: *std.Build) void {
    b.installArtifact(b.addExecutable(.{ .name = "hello", .root_module = b.createModule(.{
        .root_source_file = b.path("hello.zig"),
        .target = b.standardTargetOptions(.{}),
        .optimize = b.standardOptimizeOption(.{}),
    }) }));
}
`;
for (const browser of ["chromium", "firefox"]) {
  await demoTest("zig-llvm", { image: "default", browser, timeout: 1_800_000 }, async ({ server, open }) => {
    const { run } = await open({ policy: { rules: [{ origin: server.origin, path: "/amy-index.txt", methods: ["GET"] }] } });
    // A package's environment applies from the next session load: ZIG_LIBC is named here.
    await run("amy install zig-llvm && export ZIG_LIBC=/usr/lib/zig/libc.txt");
    await run("test \"$(zig version)\" = 0.16.0 && mkdir /tmp/zig-test && cd /tmp/zig-test");
    await run(writeCommand("hello.zig", hello));
    await run('zig build-exe hello.zig && test "$(./hello.wasm 2>&1)" = "hello child"');
    await run(writeCommand("threaded.zig", threaded));
    await run('zig build-exe -fno-single-threaded threaded.zig && test "$(./threaded.wasm 2>&1)" = "thread 42"');
    await run(writeCommand("list.zig", list));
    await run('zig build-exe list.zig && test "$(./list.wasm 2>&1)" = "listed list.zig"');
    await run("printf '#include <stdio.h>\\nint answer(void);\\n' > answer.h && zig translate-c -lc answer.h | grep -q 'pub extern fn answer'");
    await run(writeCommand("build.zig", build));
    await run('zig build && test "$(zig-out/bin/hello.wasm 2>&1)" = "hello child"');
    await run("cd / && rm -r /tmp/zig-test");
  });
}
