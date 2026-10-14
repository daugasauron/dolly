// Zig with LLVM installed into a default session: build-exe links through cc,
// the program starts a child, and zig build runs a project's build.zig.
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
    await run("amy install zig-llvm && test \"$(zig version)\" = 0.16.0 && mkdir /tmp/zig-test && cd /tmp/zig-test");
    await run(writeCommand("hello.zig", hello));
    await run('zig build-exe hello.zig && test "$(./hello 2>&1)" = "hello child"');
    await run(writeCommand("build.zig", build));
    await run('zig build && test "$(zig-out/bin/hello 2>&1)" = "hello child"');
    await run("cd / && rm -r /tmp/zig-test");
  });
}
