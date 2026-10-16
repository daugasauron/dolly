const __root = @This();
pub const __builtin = @import("c_builtins");
pub const __helpers = @import("helpers");

pub const intmax_t = c_longlong;
pub const uintmax_t = c_ulonglong;
pub const int_least64_t = c_longlong;
pub const int_least32_t = c_int;
pub const int_least16_t = c_short;
pub const int_least8_t = i8;
pub const uint_least64_t = c_ulonglong;
pub const uint_least32_t = c_uint;
pub const uint_least16_t = c_ushort;
pub const uint_least8_t = u8;
pub const int_fast64_t = c_longlong;
pub const int_fast32_t = c_int;
pub const int_fast16_t = c_short;
pub const int_fast8_t = i8;
pub const uint_fast64_t = c_ulonglong;
pub const uint_fast32_t = c_uint;
pub const uint_fast16_t = c_ushort;
pub const uint_fast8_t = u8;
pub const int128_t = i128;
pub const uint128_t = u128;
pub const int_fast128_t = i128;
pub const uint_fast128_t = u128;
pub const int_least128_t = i128;
pub const uint_least128_t = u128;
pub const ptrdiff_t = c_long;
pub const wchar_t = c_int;
pub const max_align_t = extern struct {
    __aro_max_align_ll: c_longlong,
    __aro_max_align_ld: c_longdouble,
};
pub extern fn malloc(size: usize) ?*anyopaque;
pub extern fn calloc(count: usize, size: usize) ?*anyopaque;
pub extern fn realloc(ptr: ?*anyopaque, size: usize) ?*anyopaque;
pub extern fn free(ptr: ?*anyopaque) void;
pub extern fn memcpy(dst: ?*anyopaque, src: ?*const anyopaque, n: usize) ?*anyopaque;
pub extern fn memmove(dst: ?*anyopaque, src: ?*const anyopaque, n: usize) ?*anyopaque;
pub extern fn memset(b: ?*anyopaque, c: c_int, n: usize) ?*anyopaque;
pub extern fn memcmp(s1: ?*const anyopaque, s2: ?*const anyopaque, n: usize) c_int;
pub extern fn strlen(s: [*c]const u8) usize;
pub extern fn strcmp(s1: [*c]const u8, s2: [*c]const u8) c_int;
pub extern fn strncmp(s1: [*c]const u8, s2: [*c]const u8, n: usize) c_int;
pub fn wuffs_base__cpu_arch__have_arm_crc32() callconv(.c) bool {
    return @"false" != 0;
}
pub fn wuffs_base__cpu_arch__have_arm_neon() callconv(.c) bool {
    return @"false" != 0;
}
pub fn wuffs_base__cpu_arch__have_x86_avx2() callconv(.c) bool {
    return @"false" != 0;
}
pub fn wuffs_base__cpu_arch__have_x86_bmi2() callconv(.c) bool {
    return @"false" != 0;
}
pub fn wuffs_base__cpu_arch__have_x86_sse42() callconv(.c) bool {
    return @"false" != 0;
}
pub fn wuffs_base__strip_const_from_u8_ptr(arg_ptr: [*c]const u8) callconv(.c) [*c]u8 {
    var ptr = arg_ptr;
    _ = &ptr;
    return @ptrCast(@alignCast(@constCast(ptr)));
}
pub fn wuffs_base__strip_const_from_u16_ptr(arg_ptr: [*c]const u16) callconv(.c) [*c]u16 {
    var ptr = arg_ptr;
    _ = &ptr;
    return @ptrCast(@alignCast(@constCast(ptr)));
}
pub fn wuffs_base__strip_const_from_u32_ptr(arg_ptr: [*c]const u32) callconv(.c) [*c]u32 {
    var ptr = arg_ptr;
    _ = &ptr;
    return @ptrCast(@alignCast(@constCast(ptr)));
}
pub fn wuffs_base__strip_const_from_u64_ptr(arg_ptr: [*c]const u64) callconv(.c) [*c]u64 {
    var ptr = arg_ptr;
    _ = &ptr;
    return @ptrCast(@alignCast(@constCast(ptr)));
}
pub const struct_wuffs_base__empty_struct__struct = extern struct {
    private_impl: u8,
};
pub const wuffs_base__empty_struct = struct_wuffs_base__empty_struct__struct;
pub fn wuffs_base__make_empty_struct() callconv(.c) wuffs_base__empty_struct {
    var ret: wuffs_base__empty_struct = undefined;
    _ = &ret;
    ret.private_impl = 0;
    return ret;
}
pub const struct_wuffs_base__utility__struct = extern struct {
    private_impl: u8,
};
pub const wuffs_base__utility = struct_wuffs_base__utility__struct;
pub const struct_wuffs_base__vtable__struct = extern struct {
    vtable_name: [*c]const u8,
    function_pointers: ?*const anyopaque,
};
pub const wuffs_base__vtable = struct_wuffs_base__vtable__struct;
pub const struct_wuffs_base__status__struct = extern struct {
    repr: [*c]const u8,
    pub const wuffs_base__status__is_complete = __root.wuffs_base__status__is_complete;
    pub const wuffs_base__status__is_error = __root.wuffs_base__status__is_error;
    pub const wuffs_base__status__is_note = __root.wuffs_base__status__is_note;
    pub const wuffs_base__status__is_ok = __root.wuffs_base__status__is_ok;
    pub const wuffs_base__status__is_suspension = __root.wuffs_base__status__is_suspension;
    pub const wuffs_base__status__is_truncated_input_error = __root.wuffs_base__status__is_truncated_input_error;
    pub const wuffs_base__status__message = __root.wuffs_base__status__message;
    pub const complete = __root.wuffs_base__status__is_complete;
    pub const @"error" = __root.wuffs_base__status__is_error;
    pub const note = __root.wuffs_base__status__is_note;
    pub const ok = __root.wuffs_base__status__is_ok;
    pub const suspension = __root.wuffs_base__status__is_suspension;
    pub const message = __root.wuffs_base__status__message;
};
pub const wuffs_base__status = struct_wuffs_base__status__struct;
pub const wuffs_base__note__i_o_redirect: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__note__i_o_redirect",
});
pub const wuffs_base__note__end_of_data: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__note__end_of_data",
});
pub const wuffs_base__note__metadata_reported: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__note__metadata_reported",
});
pub const wuffs_base__suspension__even_more_information: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__suspension__even_more_information",
});
pub const wuffs_base__suspension__mispositioned_read: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__suspension__mispositioned_read",
});
pub const wuffs_base__suspension__mispositioned_write: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__suspension__mispositioned_write",
});
pub const wuffs_base__suspension__short_read: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__suspension__short_read",
});
pub const wuffs_base__suspension__short_workbuf: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__suspension__short_workbuf",
});
pub const wuffs_base__suspension__short_write: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__suspension__short_write",
});
pub const wuffs_base__error__bad_i_o_position: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__error__bad_i_o_position",
});
pub const wuffs_base__error__bad_argument_length_too_short: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__error__bad_argument_length_too_short",
});
pub const wuffs_base__error__bad_argument: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__error__bad_argument",
});
pub const wuffs_base__error__bad_call_sequence: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__error__bad_call_sequence",
});
pub const wuffs_base__error__bad_data: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__error__bad_data",
});
pub const wuffs_base__error__bad_receiver: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__error__bad_receiver",
});
pub const wuffs_base__error__bad_restart: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__error__bad_restart",
});
pub const wuffs_base__error__bad_sizeof_receiver: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__error__bad_sizeof_receiver",
});
pub const wuffs_base__error__bad_vtable: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__error__bad_vtable",
});
pub const wuffs_base__error__bad_workbuf_length: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__error__bad_workbuf_length",
});
pub const wuffs_base__error__bad_wuffs_version: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__error__bad_wuffs_version",
});
pub const wuffs_base__error__cannot_return_a_suspension: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__error__cannot_return_a_suspension",
});
pub const wuffs_base__error__disabled_by_wuffs_config_dst_pixel_format_enable_allowlist: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__error__disabled_by_wuffs_config_dst_pixel_format_enable_allowlist",
});
pub const wuffs_base__error__disabled_by_previous_error: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__error__disabled_by_previous_error",
});
pub const wuffs_base__error__initialize_falsely_claimed_already_zeroed: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__error__initialize_falsely_claimed_already_zeroed",
});
pub const wuffs_base__error__initialize_not_called: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__error__initialize_not_called",
});
pub const wuffs_base__error__insufficient_history: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__error__insufficient_history",
});
pub const wuffs_base__error__interleaved_coroutine_calls: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__error__interleaved_coroutine_calls",
});
pub const wuffs_base__error__no_more_information: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__error__no_more_information",
});
pub const wuffs_base__error__not_enough_data: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__error__not_enough_data",
});
pub const wuffs_base__error__out_of_bounds: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__error__out_of_bounds",
});
pub const wuffs_base__error__unsupported_image_dimension: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__error__unsupported_image_dimension",
});
pub const wuffs_base__error__unsupported_method: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__error__unsupported_method",
});
pub const wuffs_base__error__unsupported_option: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__error__unsupported_option",
});
pub const wuffs_base__error__unsupported_pixel_swizzler_option: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__error__unsupported_pixel_swizzler_option",
});
pub const wuffs_base__error__too_much_data: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__error__too_much_data",
});
pub fn wuffs_base__make_status(arg_repr: [*c]const u8) callconv(.c) wuffs_base__status {
    var repr = arg_repr;
    _ = &repr;
    var z: wuffs_base__status = undefined;
    _ = &z;
    z.repr = repr;
    return z;
}
pub fn wuffs_base__status__is_complete(arg_z: [*c]const wuffs_base__status) callconv(.c) bool {
    var z = arg_z;
    _ = &z;
    return (@as(?*anyopaque, @ptrCast(@alignCast(@constCast(z.*.repr)))) == @as(?*anyopaque, null)) or ((@as(c_int, z.*.repr.*) != @as(c_int, '$')) and (@as(c_int, z.*.repr.*) != @as(c_int, '#')));
}
pub fn wuffs_base__status__is_error(arg_z: [*c]const wuffs_base__status) callconv(.c) bool {
    var z = arg_z;
    _ = &z;
    return (z.*.repr != null) and (@as(c_int, z.*.repr.*) == @as(c_int, '#'));
}
pub fn wuffs_base__status__is_note(arg_z: [*c]const wuffs_base__status) callconv(.c) bool {
    var z = arg_z;
    _ = &z;
    return ((z.*.repr != null) and (@as(c_int, z.*.repr.*) != @as(c_int, '$'))) and (@as(c_int, z.*.repr.*) != @as(c_int, '#'));
}
pub fn wuffs_base__status__is_ok(arg_z: [*c]const wuffs_base__status) callconv(.c) bool {
    var z = arg_z;
    _ = &z;
    return @as(?*anyopaque, @ptrCast(@alignCast(@constCast(z.*.repr)))) == @as(?*anyopaque, null);
}
pub fn wuffs_base__status__is_suspension(arg_z: [*c]const wuffs_base__status) callconv(.c) bool {
    var z = arg_z;
    _ = &z;
    return (z.*.repr != null) and (@as(c_int, z.*.repr.*) == @as(c_int, '$'));
}
pub fn wuffs_base__status__is_truncated_input_error(arg_z: [*c]const wuffs_base__status) callconv(.c) bool {
    var z = arg_z;
    _ = &z;
    var p: [*c]const u8 = z.*.repr;
    _ = &p;
    if (!(p != null) or (@as(c_int, p.*) != @as(c_int, '#'))) {
        return @"false" != 0;
    }
    p += 1;
    while (true) {
        if (@as(c_int, p.*) == @as(c_int, 0)) {
            return @"false" != 0;
        } else if (@as(c_int, (blk: {
            const ref = &p;
            const tmp = ref.*;
            ref.* += 1;
            break :blk tmp;
        }).*) == @as(c_int, ':')) {
            break;
        }
    }
    return strcmp(p, " truncated input") == @as(c_int, 0);
}
pub fn wuffs_base__status__message(arg_z: [*c]const wuffs_base__status) callconv(.c) [*c]const u8 {
    var z = arg_z;
    _ = &z;
    if (z.*.repr != null) {
        if (((@as(c_int, z.*.repr.*) == @as(c_int, '$')) or (@as(c_int, z.*.repr.*) == @as(c_int, '#'))) or (@as(c_int, z.*.repr.*) == @as(c_int, '@'))) {
            return z.*.repr + @as(usize, @bitCast(@as(isize, @intCast(@as(c_int, 1)))));
        }
    }
    return z.*.repr;
}
pub const wuffs_base__result_f64 = extern struct {
    status: wuffs_base__status,
    value: f64,
};
pub const wuffs_base__result_i64 = extern struct {
    status: wuffs_base__status,
    value: i64,
};
pub const wuffs_base__result_u64 = extern struct {
    status: wuffs_base__status,
    value: u64,
};
pub const struct_wuffs_base__transform__output__struct = extern struct {
    status: wuffs_base__status,
    num_dst: usize,
    num_src: usize,
};
pub const wuffs_base__transform__output = struct_wuffs_base__transform__output__struct;
pub const wuffs_base__flicks = i64;
pub fn wuffs_base__i8__min(arg_x: i8, arg_y: i8) callconv(.c) i8 {
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    return @truncate(if (@as(c_int, x) < @as(c_int, y)) @as(c_int, x) else @as(c_int, y));
}
pub fn wuffs_base__i8__max(arg_x: i8, arg_y: i8) callconv(.c) i8 {
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    return @truncate(if (@as(c_int, x) > @as(c_int, y)) @as(c_int, x) else @as(c_int, y));
}
pub fn wuffs_base__i16__min(arg_x: i16, arg_y: i16) callconv(.c) i16 {
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    return @truncate(if (@as(c_int, x) < @as(c_int, y)) @as(c_int, x) else @as(c_int, y));
}
pub fn wuffs_base__i16__max(arg_x: i16, arg_y: i16) callconv(.c) i16 {
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    return @truncate(if (@as(c_int, x) > @as(c_int, y)) @as(c_int, x) else @as(c_int, y));
}
pub fn wuffs_base__i32__min(arg_x: i32, arg_y: i32) callconv(.c) i32 {
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    return if (x < y) x else y;
}
pub fn wuffs_base__i32__max(arg_x: i32, arg_y: i32) callconv(.c) i32 {
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    return if (x > y) x else y;
}
pub fn wuffs_base__i64__min(arg_x: i64, arg_y: i64) callconv(.c) i64 {
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    return if (x < y) x else y;
}
pub fn wuffs_base__i64__max(arg_x: i64, arg_y: i64) callconv(.c) i64 {
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    return if (x > y) x else y;
}
pub fn wuffs_base__u8__min(arg_x: u8, arg_y: u8) callconv(.c) u8 {
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    return @bitCast(@as(i8, @truncate(if (@as(c_int, x) < @as(c_int, y)) @as(c_int, x) else @as(c_int, y))));
}
pub fn wuffs_base__u8__max(arg_x: u8, arg_y: u8) callconv(.c) u8 {
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    return @bitCast(@as(i8, @truncate(if (@as(c_int, x) > @as(c_int, y)) @as(c_int, x) else @as(c_int, y))));
}
pub fn wuffs_base__u16__min(arg_x: u16, arg_y: u16) callconv(.c) u16 {
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    return @bitCast(@as(c_short, @truncate(if (@as(c_int, x) < @as(c_int, y)) @as(c_int, x) else @as(c_int, y))));
}
pub fn wuffs_base__u16__max(arg_x: u16, arg_y: u16) callconv(.c) u16 {
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    return @bitCast(@as(c_short, @truncate(if (@as(c_int, x) > @as(c_int, y)) @as(c_int, x) else @as(c_int, y))));
}
pub fn wuffs_base__u32__min(arg_x: u32, arg_y: u32) callconv(.c) u32 {
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    return if (x < y) x else y;
}
pub fn wuffs_base__u32__max(arg_x: u32, arg_y: u32) callconv(.c) u32 {
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    return if (x > y) x else y;
}
pub fn wuffs_base__u64__min(arg_x: u64, arg_y: u64) callconv(.c) u64 {
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    return if (x < y) x else y;
}
pub fn wuffs_base__u64__max(arg_x: u64, arg_y: u64) callconv(.c) u64 {
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    return if (x > y) x else y;
}
pub fn wuffs_base__u8__rotate_left(arg_x: u8, arg_n: u32) callconv(.c) u8 {
    var x = arg_x;
    _ = &x;
    var n = arg_n;
    _ = &n;
    n &= 7;
    return @bitCast(@as(i8, @truncate(@as(c_int, @as(u8, @truncate(@as(u32, @bitCast(@as(c_int, @as(c_int, x)))) << @intCast(n)))) | @as(c_int, @as(u8, @truncate(@as(u32, @bitCast(@as(c_int, @as(c_int, x)))) >> @intCast(@as(u32, 8) -% n)))))));
}
pub fn wuffs_base__u8__rotate_right(arg_x: u8, arg_n: u32) callconv(.c) u8 {
    var x = arg_x;
    _ = &x;
    var n = arg_n;
    _ = &n;
    n &= 7;
    return @bitCast(@as(i8, @truncate(@as(c_int, @as(u8, @truncate(@as(u32, @bitCast(@as(c_int, @as(c_int, x)))) >> @intCast(n)))) | @as(c_int, @as(u8, @truncate(@as(u32, @bitCast(@as(c_int, @as(c_int, x)))) << @intCast(@as(u32, 8) -% n)))))));
}
pub fn wuffs_base__u16__rotate_left(arg_x: u16, arg_n: u32) callconv(.c) u16 {
    var x = arg_x;
    _ = &x;
    var n = arg_n;
    _ = &n;
    n &= 15;
    return @bitCast(@as(c_short, @truncate(@as(c_int, @as(u16, @truncate(@as(u32, @bitCast(@as(c_int, @as(c_int, x)))) << @intCast(n)))) | @as(c_int, @as(u16, @truncate(@as(u32, @bitCast(@as(c_int, @as(c_int, x)))) >> @intCast(@as(u32, 16) -% n)))))));
}
pub fn wuffs_base__u16__rotate_right(arg_x: u16, arg_n: u32) callconv(.c) u16 {
    var x = arg_x;
    _ = &x;
    var n = arg_n;
    _ = &n;
    n &= 15;
    return @bitCast(@as(c_short, @truncate(@as(c_int, @as(u16, @truncate(@as(u32, @bitCast(@as(c_int, @as(c_int, x)))) >> @intCast(n)))) | @as(c_int, @as(u16, @truncate(@as(u32, @bitCast(@as(c_int, @as(c_int, x)))) << @intCast(@as(u32, 16) -% n)))))));
}
pub fn wuffs_base__u32__rotate_left(arg_x: u32, arg_n: u32) callconv(.c) u32 {
    var x = arg_x;
    _ = &x;
    var n = arg_n;
    _ = &n;
    n &= 31;
    return (x << @intCast(n)) | (x >> @intCast(@as(u32, 32) -% n));
}
pub fn wuffs_base__u32__rotate_right(arg_x: u32, arg_n: u32) callconv(.c) u32 {
    var x = arg_x;
    _ = &x;
    var n = arg_n;
    _ = &n;
    n &= 31;
    return (x >> @intCast(n)) | (x << @intCast(@as(u32, 32) -% n));
}
pub fn wuffs_base__u64__rotate_left(arg_x: u64, arg_n: u32) callconv(.c) u64 {
    var x = arg_x;
    _ = &x;
    var n = arg_n;
    _ = &n;
    n &= 63;
    return (x << @intCast(@as(u64, n))) | (x >> @intCast(@as(u64, @as(u32, 64) -% n)));
}
pub fn wuffs_base__u64__rotate_right(arg_x: u64, arg_n: u32) callconv(.c) u64 {
    var x = arg_x;
    _ = &x;
    var n = arg_n;
    _ = &n;
    n &= 63;
    return (x >> @intCast(@as(u64, n))) | (x << @intCast(@as(u64, @as(u32, 64) -% n)));
}
pub fn wuffs_base__u8__sat_add(arg_x: u8, arg_y: u8) callconv(.c) u8 {
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    var res: u8 = @bitCast(@as(i8, @truncate(@as(c_int, x) + @as(c_int, y))));
    _ = &res;
    {
        const ref = &res;
        ref.* = @bitCast(@as(i8, @truncate(@as(c_int, ref.*) | @as(c_int, @as(u8, @bitCast(@as(i8, @truncate(-@as(c_int, @intFromBool(@as(c_int, res) < @as(c_int, x)))))))))));
    }
    return res;
}
pub fn wuffs_base__u8__sat_sub(arg_x: u8, arg_y: u8) callconv(.c) u8 {
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    var res: u8 = @bitCast(@as(i8, @truncate(@as(c_int, x) - @as(c_int, y))));
    _ = &res;
    {
        const ref = &res;
        ref.* = @bitCast(@as(i8, @truncate(@as(c_int, ref.*) & @as(c_int, @as(u8, @bitCast(@as(i8, @truncate(-@as(c_int, @intFromBool(@as(c_int, res) <= @as(c_int, x)))))))))));
    }
    return res;
}
pub fn wuffs_base__u16__sat_add(arg_x: u16, arg_y: u16) callconv(.c) u16 {
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    var res: u16 = @bitCast(@as(c_short, @truncate(@as(c_int, x) + @as(c_int, y))));
    _ = &res;
    {
        const ref = &res;
        ref.* = @bitCast(@as(c_short, @truncate(@as(c_int, ref.*) | @as(c_int, @as(u16, @bitCast(@as(c_short, @truncate(-@as(c_int, @intFromBool(@as(c_int, res) < @as(c_int, x)))))))))));
    }
    return res;
}
pub fn wuffs_base__u16__sat_sub(arg_x: u16, arg_y: u16) callconv(.c) u16 {
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    var res: u16 = @bitCast(@as(c_short, @truncate(@as(c_int, x) - @as(c_int, y))));
    _ = &res;
    {
        const ref = &res;
        ref.* = @bitCast(@as(c_short, @truncate(@as(c_int, ref.*) & @as(c_int, @as(u16, @bitCast(@as(c_short, @truncate(-@as(c_int, @intFromBool(@as(c_int, res) <= @as(c_int, x)))))))))));
    }
    return res;
}
pub fn wuffs_base__u32__sat_add(arg_x: u32, arg_y: u32) callconv(.c) u32 {
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    var res: u32 = x +% y;
    _ = &res;
    res |= @bitCast(@as(c_int, -@as(c_int, @intFromBool(res < x))));
    return res;
}
pub fn wuffs_base__u32__sat_sub(arg_x: u32, arg_y: u32) callconv(.c) u32 {
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    var res: u32 = x -% y;
    _ = &res;
    res &= @bitCast(@as(c_int, -@as(c_int, @intFromBool(res <= x))));
    return res;
}
pub fn wuffs_base__u64__sat_add(arg_x: u64, arg_y: u64) callconv(.c) u64 {
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    var res: u64 = x +% y;
    _ = &res;
    res |= @bitCast(@as(c_longlong, -@as(c_int, @intFromBool(res < x))));
    return res;
}
pub fn wuffs_base__u64__sat_sub(arg_x: u64, arg_y: u64) callconv(.c) u64 {
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    var res: u64 = x -% y;
    _ = &res;
    res &= @bitCast(@as(c_longlong, -@as(c_int, @intFromBool(res <= x))));
    return res;
}
pub const struct_wuffs_base__multiply_u64__output__struct = extern struct {
    lo: u64,
    hi: u64,
};
pub const wuffs_base__multiply_u64__output = struct_wuffs_base__multiply_u64__output__struct;
pub const __uint128_t = u128;
pub fn wuffs_base__multiply_u64(arg_x: u64, arg_y: u64) callconv(.c) wuffs_base__multiply_u64__output {
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    var z: __uint128_t = @as(__uint128_t, x) *% @as(__uint128_t, y);
    _ = &z;
    var o: wuffs_base__multiply_u64__output = undefined;
    _ = &o;
    o.lo = @as(u64, @truncate(z));
    o.hi = @as(u64, @truncate(z >> @intCast(@as(__uint128_t, 64))));
    return o;
}
pub const struct_wuffs_base__bitvec256__struct = extern struct {
    elements_u64: [4]u64,
    pub const wuffs_base__bitvec256__get_u64 = __root.wuffs_base__bitvec256__get_u64;
    pub const @"u64" = __root.wuffs_base__bitvec256__get_u64;
};
pub const wuffs_base__bitvec256 = struct_wuffs_base__bitvec256__struct;
pub fn wuffs_base__make_bitvec256(arg_e00: u64, arg_e01: u64, arg_e02: u64, arg_e03: u64) callconv(.c) wuffs_base__bitvec256 {
    var e00 = arg_e00;
    _ = &e00;
    var e01 = arg_e01;
    _ = &e01;
    var e02 = arg_e02;
    _ = &e02;
    var e03 = arg_e03;
    _ = &e03;
    var res: wuffs_base__bitvec256 = undefined;
    _ = &res;
    res.elements_u64[@as(c_int, 0)] = e00;
    res.elements_u64[@as(c_int, 1)] = e01;
    res.elements_u64[@as(c_int, 2)] = e02;
    res.elements_u64[@as(c_int, 3)] = e03;
    return res;
}
pub fn wuffs_base__bitvec256__get_u64(arg_b: [*c]const wuffs_base__bitvec256, arg_i: u32) callconv(.c) u64 {
    var b = arg_b;
    _ = &b;
    var i = arg_i;
    _ = &i;
    return b.*.elements_u64[i & @as(u32, 3)];
}
pub const struct_wuffs_base__optional_u63__struct = extern struct {
    repr: u64,
    pub const wuffs_base__optional_u63__has_value = __root.wuffs_base__optional_u63__has_value;
    pub const wuffs_base__optional_u63__value = __root.wuffs_base__optional_u63__value;
    pub const wuffs_base__optional_u63__value_or = __root.wuffs_base__optional_u63__value_or;
    pub const value = __root.wuffs_base__optional_u63__has_value;
    pub const @"or" = __root.wuffs_base__optional_u63__value_or;
};
pub const wuffs_base__optional_u63 = struct_wuffs_base__optional_u63__struct;
pub fn wuffs_base__make_optional_u63(arg_has_value: bool, arg_value: u64) callconv(.c) wuffs_base__optional_u63 {
    var has_value = arg_has_value;
    _ = &has_value;
    var value = arg_value;
    _ = &value;
    var res: wuffs_base__optional_u63 = undefined;
    _ = &res;
    res.repr = if (has_value) (value << @intCast(@as(u64, 1))) | @as(u64, 1) else @as(u64, 0);
    return res;
}
pub fn wuffs_base__optional_u63__has_value(arg_o: [*c]const wuffs_base__optional_u63) callconv(.c) bool {
    var o = arg_o;
    _ = &o;
    return o.*.repr != 0;
}
pub fn wuffs_base__optional_u63__value(arg_o: [*c]const wuffs_base__optional_u63) callconv(.c) u64 {
    var o = arg_o;
    _ = &o;
    return o.*.repr >> @intCast(@as(u64, 1));
}
pub fn wuffs_base__optional_u63__value_or(arg_o: [*c]const wuffs_base__optional_u63, arg_default_value: u64) callconv(.c) u64 {
    var o = arg_o;
    _ = &o;
    var default_value = arg_default_value;
    _ = &default_value;
    return if (o.*.repr != 0) o.*.repr >> @intCast(@as(u64, 1)) else default_value;
}
// /tmp/claude-1000/-home-daug-dev-dolly/86b87808-da65-4872-b669-6778327e525c/scratchpad/vtgen/ghostty/zig-pkg/N-V-__8AAP5JWgCGP_AD0teWpa4krRvE9VPZzvviGdbmN4jI/release/c/wuffs-v0.4.c:1325:26: warning: TODO implement function '__builtin_clzl' in std.zig.c_builtins

// /tmp/claude-1000/-home-daug-dev-dolly/86b87808-da65-4872-b669-6778327e525c/scratchpad/vtgen/ghostty/zig-pkg/N-V-__8AAP5JWgCGP_AD0teWpa4krRvE9VPZzvviGdbmN4jI/release/c/wuffs-v0.4.c:1324:1: warning: unable to translate function, demoted to extern
pub extern fn wuffs_base__count_leading_zeroes_u64(arg_u: u64) callconv(.c) u32;
pub fn wuffs_base__peek_u8__no_bounds_check(arg_p: [*c]const u8) callconv(.c) u8 {
    var p = arg_p;
    _ = &p;
    return p[@as(c_int, 0)];
}
pub fn wuffs_base__peek_u16be__no_bounds_check(arg_p: [*c]const u8) callconv(.c) u16 {
    var p = arg_p;
    _ = &p;
    return @bitCast(@as(c_short, @truncate((@as(c_int, @as(u16, p[@as(c_int, 0)])) << @intCast(@as(c_int, 8))) | (@as(c_int, @as(u16, p[@as(c_int, 1)])) << @intCast(@as(c_int, 0))))));
}
pub fn wuffs_base__peek_u16le__no_bounds_check(arg_p: [*c]const u8) callconv(.c) u16 {
    var p = arg_p;
    _ = &p;
    return @bitCast(@as(c_short, @truncate((@as(c_int, @as(u16, p[@as(c_int, 0)])) << @intCast(@as(c_int, 0))) | (@as(c_int, @as(u16, p[@as(c_int, 1)])) << @intCast(@as(c_int, 8))))));
}
pub fn wuffs_base__peek_u24be__no_bounds_check(arg_p: [*c]const u8) callconv(.c) u32 {
    var p = arg_p;
    _ = &p;
    return ((@as(u32, p[@as(c_int, 0)]) << @intCast(@as(u32, 16))) | (@as(u32, p[@as(c_int, 1)]) << @intCast(@as(u32, 8)))) | (@as(u32, p[@as(c_int, 2)]) << @intCast(@as(u32, 0)));
}
pub fn wuffs_base__peek_u24le__no_bounds_check(arg_p: [*c]const u8) callconv(.c) u32 {
    var p = arg_p;
    _ = &p;
    return ((@as(u32, p[@as(c_int, 0)]) << @intCast(@as(u32, 0))) | (@as(u32, p[@as(c_int, 1)]) << @intCast(@as(u32, 8)))) | (@as(u32, p[@as(c_int, 2)]) << @intCast(@as(u32, 16)));
}
pub fn wuffs_base__peek_u32be__no_bounds_check(arg_p: [*c]const u8) callconv(.c) u32 {
    var p = arg_p;
    _ = &p;
    return (((@as(u32, p[@as(c_int, 0)]) << @intCast(@as(u32, 24))) | (@as(u32, p[@as(c_int, 1)]) << @intCast(@as(u32, 16)))) | (@as(u32, p[@as(c_int, 2)]) << @intCast(@as(u32, 8)))) | (@as(u32, p[@as(c_int, 3)]) << @intCast(@as(u32, 0)));
}
pub fn wuffs_base__peek_u32le__no_bounds_check(arg_p: [*c]const u8) callconv(.c) u32 {
    var p = arg_p;
    _ = &p;
    return (((@as(u32, p[@as(c_int, 0)]) << @intCast(@as(u32, 0))) | (@as(u32, p[@as(c_int, 1)]) << @intCast(@as(u32, 8)))) | (@as(u32, p[@as(c_int, 2)]) << @intCast(@as(u32, 16)))) | (@as(u32, p[@as(c_int, 3)]) << @intCast(@as(u32, 24)));
}
pub fn wuffs_base__peek_u40be__no_bounds_check(arg_p: [*c]const u8) callconv(.c) u64 {
    var p = arg_p;
    _ = &p;
    return ((((@as(u64, p[@as(c_int, 0)]) << @intCast(@as(u64, 32))) | (@as(u64, p[@as(c_int, 1)]) << @intCast(@as(u64, 24)))) | (@as(u64, p[@as(c_int, 2)]) << @intCast(@as(u64, 16)))) | (@as(u64, p[@as(c_int, 3)]) << @intCast(@as(u64, 8)))) | (@as(u64, p[@as(c_int, 4)]) << @intCast(@as(u64, 0)));
}
pub fn wuffs_base__peek_u40le__no_bounds_check(arg_p: [*c]const u8) callconv(.c) u64 {
    var p = arg_p;
    _ = &p;
    return ((((@as(u64, p[@as(c_int, 0)]) << @intCast(@as(u64, 0))) | (@as(u64, p[@as(c_int, 1)]) << @intCast(@as(u64, 8)))) | (@as(u64, p[@as(c_int, 2)]) << @intCast(@as(u64, 16)))) | (@as(u64, p[@as(c_int, 3)]) << @intCast(@as(u64, 24)))) | (@as(u64, p[@as(c_int, 4)]) << @intCast(@as(u64, 32)));
}
pub fn wuffs_base__peek_u48be__no_bounds_check(arg_p: [*c]const u8) callconv(.c) u64 {
    var p = arg_p;
    _ = &p;
    return (((((@as(u64, p[@as(c_int, 0)]) << @intCast(@as(u64, 40))) | (@as(u64, p[@as(c_int, 1)]) << @intCast(@as(u64, 32)))) | (@as(u64, p[@as(c_int, 2)]) << @intCast(@as(u64, 24)))) | (@as(u64, p[@as(c_int, 3)]) << @intCast(@as(u64, 16)))) | (@as(u64, p[@as(c_int, 4)]) << @intCast(@as(u64, 8)))) | (@as(u64, p[@as(c_int, 5)]) << @intCast(@as(u64, 0)));
}
pub fn wuffs_base__peek_u48le__no_bounds_check(arg_p: [*c]const u8) callconv(.c) u64 {
    var p = arg_p;
    _ = &p;
    return (((((@as(u64, p[@as(c_int, 0)]) << @intCast(@as(u64, 0))) | (@as(u64, p[@as(c_int, 1)]) << @intCast(@as(u64, 8)))) | (@as(u64, p[@as(c_int, 2)]) << @intCast(@as(u64, 16)))) | (@as(u64, p[@as(c_int, 3)]) << @intCast(@as(u64, 24)))) | (@as(u64, p[@as(c_int, 4)]) << @intCast(@as(u64, 32)))) | (@as(u64, p[@as(c_int, 5)]) << @intCast(@as(u64, 40)));
}
pub fn wuffs_base__peek_u56be__no_bounds_check(arg_p: [*c]const u8) callconv(.c) u64 {
    var p = arg_p;
    _ = &p;
    return ((((((@as(u64, p[@as(c_int, 0)]) << @intCast(@as(u64, 48))) | (@as(u64, p[@as(c_int, 1)]) << @intCast(@as(u64, 40)))) | (@as(u64, p[@as(c_int, 2)]) << @intCast(@as(u64, 32)))) | (@as(u64, p[@as(c_int, 3)]) << @intCast(@as(u64, 24)))) | (@as(u64, p[@as(c_int, 4)]) << @intCast(@as(u64, 16)))) | (@as(u64, p[@as(c_int, 5)]) << @intCast(@as(u64, 8)))) | (@as(u64, p[@as(c_int, 6)]) << @intCast(@as(u64, 0)));
}
pub fn wuffs_base__peek_u56le__no_bounds_check(arg_p: [*c]const u8) callconv(.c) u64 {
    var p = arg_p;
    _ = &p;
    return ((((((@as(u64, p[@as(c_int, 0)]) << @intCast(@as(u64, 0))) | (@as(u64, p[@as(c_int, 1)]) << @intCast(@as(u64, 8)))) | (@as(u64, p[@as(c_int, 2)]) << @intCast(@as(u64, 16)))) | (@as(u64, p[@as(c_int, 3)]) << @intCast(@as(u64, 24)))) | (@as(u64, p[@as(c_int, 4)]) << @intCast(@as(u64, 32)))) | (@as(u64, p[@as(c_int, 5)]) << @intCast(@as(u64, 40)))) | (@as(u64, p[@as(c_int, 6)]) << @intCast(@as(u64, 48)));
}
pub fn wuffs_base__peek_u64be__no_bounds_check(arg_p: [*c]const u8) callconv(.c) u64 {
    var p = arg_p;
    _ = &p;
    return (((((((@as(u64, p[@as(c_int, 0)]) << @intCast(@as(u64, 56))) | (@as(u64, p[@as(c_int, 1)]) << @intCast(@as(u64, 48)))) | (@as(u64, p[@as(c_int, 2)]) << @intCast(@as(u64, 40)))) | (@as(u64, p[@as(c_int, 3)]) << @intCast(@as(u64, 32)))) | (@as(u64, p[@as(c_int, 4)]) << @intCast(@as(u64, 24)))) | (@as(u64, p[@as(c_int, 5)]) << @intCast(@as(u64, 16)))) | (@as(u64, p[@as(c_int, 6)]) << @intCast(@as(u64, 8)))) | (@as(u64, p[@as(c_int, 7)]) << @intCast(@as(u64, 0)));
}
pub fn wuffs_base__peek_u64le__no_bounds_check(arg_p: [*c]const u8) callconv(.c) u64 {
    var p = arg_p;
    _ = &p;
    return (((((((@as(u64, p[@as(c_int, 0)]) << @intCast(@as(u64, 0))) | (@as(u64, p[@as(c_int, 1)]) << @intCast(@as(u64, 8)))) | (@as(u64, p[@as(c_int, 2)]) << @intCast(@as(u64, 16)))) | (@as(u64, p[@as(c_int, 3)]) << @intCast(@as(u64, 24)))) | (@as(u64, p[@as(c_int, 4)]) << @intCast(@as(u64, 32)))) | (@as(u64, p[@as(c_int, 5)]) << @intCast(@as(u64, 40)))) | (@as(u64, p[@as(c_int, 6)]) << @intCast(@as(u64, 48)))) | (@as(u64, p[@as(c_int, 7)]) << @intCast(@as(u64, 56)));
}
pub fn wuffs_base__poke_u8__no_bounds_check(arg_p: [*c]u8, arg_x: u8) callconv(.c) void {
    var p = arg_p;
    _ = &p;
    var x = arg_x;
    _ = &x;
    p[@as(c_int, 0)] = x;
}
pub fn wuffs_base__poke_u16be__no_bounds_check(arg_p: [*c]u8, arg_x: u16) callconv(.c) void {
    var p = arg_p;
    _ = &p;
    var x = arg_x;
    _ = &x;
    p[@as(c_int, 0)] = @bitCast(@as(i8, @truncate(@as(c_int, x) >> @intCast(@as(c_int, 8)))));
    p[@as(c_int, 1)] = @bitCast(@as(i8, @truncate(@as(c_int, x) >> @intCast(@as(c_int, 0)))));
}
pub fn wuffs_base__poke_u16le__no_bounds_check(arg_p: [*c]u8, arg_x: u16) callconv(.c) void {
    var p = arg_p;
    _ = &p;
    var x = arg_x;
    _ = &x;
    p[@as(c_int, 0)] = @bitCast(@as(i8, @truncate(@as(c_int, x) >> @intCast(@as(c_int, 0)))));
    p[@as(c_int, 1)] = @bitCast(@as(i8, @truncate(@as(c_int, x) >> @intCast(@as(c_int, 8)))));
}
pub fn wuffs_base__poke_u24be__no_bounds_check(arg_p: [*c]u8, arg_x: u32) callconv(.c) void {
    var p = arg_p;
    _ = &p;
    var x = arg_x;
    _ = &x;
    p[@as(c_int, 0)] = @truncate(x >> @intCast(@as(u32, 16)));
    p[@as(c_int, 1)] = @truncate(x >> @intCast(@as(u32, 8)));
    p[@as(c_int, 2)] = @truncate(x >> @intCast(@as(u32, 0)));
}
pub fn wuffs_base__poke_u24le__no_bounds_check(arg_p: [*c]u8, arg_x: u32) callconv(.c) void {
    var p = arg_p;
    _ = &p;
    var x = arg_x;
    _ = &x;
    p[@as(c_int, 0)] = @truncate(x >> @intCast(@as(u32, 0)));
    p[@as(c_int, 1)] = @truncate(x >> @intCast(@as(u32, 8)));
    p[@as(c_int, 2)] = @truncate(x >> @intCast(@as(u32, 16)));
}
pub fn wuffs_base__poke_u32be__no_bounds_check(arg_p: [*c]u8, arg_x: u32) callconv(.c) void {
    var p = arg_p;
    _ = &p;
    var x = arg_x;
    _ = &x;
    p[@as(c_int, 0)] = @truncate(x >> @intCast(@as(u32, 24)));
    p[@as(c_int, 1)] = @truncate(x >> @intCast(@as(u32, 16)));
    p[@as(c_int, 2)] = @truncate(x >> @intCast(@as(u32, 8)));
    p[@as(c_int, 3)] = @truncate(x >> @intCast(@as(u32, 0)));
}
pub fn wuffs_base__poke_u32le__no_bounds_check(arg_p: [*c]u8, arg_x: u32) callconv(.c) void {
    var p = arg_p;
    _ = &p;
    var x = arg_x;
    _ = &x;
    p[@as(c_int, 0)] = @truncate(x >> @intCast(@as(u32, 0)));
    p[@as(c_int, 1)] = @truncate(x >> @intCast(@as(u32, 8)));
    p[@as(c_int, 2)] = @truncate(x >> @intCast(@as(u32, 16)));
    p[@as(c_int, 3)] = @truncate(x >> @intCast(@as(u32, 24)));
}
pub fn wuffs_base__poke_u40be__no_bounds_check(arg_p: [*c]u8, arg_x: u64) callconv(.c) void {
    var p = arg_p;
    _ = &p;
    var x = arg_x;
    _ = &x;
    p[@as(c_int, 0)] = @truncate(x >> @intCast(@as(u64, 32)));
    p[@as(c_int, 1)] = @truncate(x >> @intCast(@as(u64, 24)));
    p[@as(c_int, 2)] = @truncate(x >> @intCast(@as(u64, 16)));
    p[@as(c_int, 3)] = @truncate(x >> @intCast(@as(u64, 8)));
    p[@as(c_int, 4)] = @truncate(x >> @intCast(@as(u64, 0)));
}
pub fn wuffs_base__poke_u40le__no_bounds_check(arg_p: [*c]u8, arg_x: u64) callconv(.c) void {
    var p = arg_p;
    _ = &p;
    var x = arg_x;
    _ = &x;
    p[@as(c_int, 0)] = @truncate(x >> @intCast(@as(u64, 0)));
    p[@as(c_int, 1)] = @truncate(x >> @intCast(@as(u64, 8)));
    p[@as(c_int, 2)] = @truncate(x >> @intCast(@as(u64, 16)));
    p[@as(c_int, 3)] = @truncate(x >> @intCast(@as(u64, 24)));
    p[@as(c_int, 4)] = @truncate(x >> @intCast(@as(u64, 32)));
}
pub fn wuffs_base__poke_u48be__no_bounds_check(arg_p: [*c]u8, arg_x: u64) callconv(.c) void {
    var p = arg_p;
    _ = &p;
    var x = arg_x;
    _ = &x;
    p[@as(c_int, 0)] = @truncate(x >> @intCast(@as(u64, 40)));
    p[@as(c_int, 1)] = @truncate(x >> @intCast(@as(u64, 32)));
    p[@as(c_int, 2)] = @truncate(x >> @intCast(@as(u64, 24)));
    p[@as(c_int, 3)] = @truncate(x >> @intCast(@as(u64, 16)));
    p[@as(c_int, 4)] = @truncate(x >> @intCast(@as(u64, 8)));
    p[@as(c_int, 5)] = @truncate(x >> @intCast(@as(u64, 0)));
}
pub fn wuffs_base__poke_u48le__no_bounds_check(arg_p: [*c]u8, arg_x: u64) callconv(.c) void {
    var p = arg_p;
    _ = &p;
    var x = arg_x;
    _ = &x;
    p[@as(c_int, 0)] = @truncate(x >> @intCast(@as(u64, 0)));
    p[@as(c_int, 1)] = @truncate(x >> @intCast(@as(u64, 8)));
    p[@as(c_int, 2)] = @truncate(x >> @intCast(@as(u64, 16)));
    p[@as(c_int, 3)] = @truncate(x >> @intCast(@as(u64, 24)));
    p[@as(c_int, 4)] = @truncate(x >> @intCast(@as(u64, 32)));
    p[@as(c_int, 5)] = @truncate(x >> @intCast(@as(u64, 40)));
}
pub fn wuffs_base__poke_u56be__no_bounds_check(arg_p: [*c]u8, arg_x: u64) callconv(.c) void {
    var p = arg_p;
    _ = &p;
    var x = arg_x;
    _ = &x;
    p[@as(c_int, 0)] = @truncate(x >> @intCast(@as(u64, 48)));
    p[@as(c_int, 1)] = @truncate(x >> @intCast(@as(u64, 40)));
    p[@as(c_int, 2)] = @truncate(x >> @intCast(@as(u64, 32)));
    p[@as(c_int, 3)] = @truncate(x >> @intCast(@as(u64, 24)));
    p[@as(c_int, 4)] = @truncate(x >> @intCast(@as(u64, 16)));
    p[@as(c_int, 5)] = @truncate(x >> @intCast(@as(u64, 8)));
    p[@as(c_int, 6)] = @truncate(x >> @intCast(@as(u64, 0)));
}
pub fn wuffs_base__poke_u56le__no_bounds_check(arg_p: [*c]u8, arg_x: u64) callconv(.c) void {
    var p = arg_p;
    _ = &p;
    var x = arg_x;
    _ = &x;
    p[@as(c_int, 0)] = @truncate(x >> @intCast(@as(u64, 0)));
    p[@as(c_int, 1)] = @truncate(x >> @intCast(@as(u64, 8)));
    p[@as(c_int, 2)] = @truncate(x >> @intCast(@as(u64, 16)));
    p[@as(c_int, 3)] = @truncate(x >> @intCast(@as(u64, 24)));
    p[@as(c_int, 4)] = @truncate(x >> @intCast(@as(u64, 32)));
    p[@as(c_int, 5)] = @truncate(x >> @intCast(@as(u64, 40)));
    p[@as(c_int, 6)] = @truncate(x >> @intCast(@as(u64, 48)));
}
pub fn wuffs_base__poke_u64be__no_bounds_check(arg_p: [*c]u8, arg_x: u64) callconv(.c) void {
    var p = arg_p;
    _ = &p;
    var x = arg_x;
    _ = &x;
    p[@as(c_int, 0)] = @truncate(x >> @intCast(@as(u64, 56)));
    p[@as(c_int, 1)] = @truncate(x >> @intCast(@as(u64, 48)));
    p[@as(c_int, 2)] = @truncate(x >> @intCast(@as(u64, 40)));
    p[@as(c_int, 3)] = @truncate(x >> @intCast(@as(u64, 32)));
    p[@as(c_int, 4)] = @truncate(x >> @intCast(@as(u64, 24)));
    p[@as(c_int, 5)] = @truncate(x >> @intCast(@as(u64, 16)));
    p[@as(c_int, 6)] = @truncate(x >> @intCast(@as(u64, 8)));
    p[@as(c_int, 7)] = @truncate(x >> @intCast(@as(u64, 0)));
}
pub fn wuffs_base__poke_u64le__no_bounds_check(arg_p: [*c]u8, arg_x: u64) callconv(.c) void {
    var p = arg_p;
    _ = &p;
    var x = arg_x;
    _ = &x;
    p[@as(c_int, 0)] = @truncate(x >> @intCast(@as(u64, 0)));
    p[@as(c_int, 1)] = @truncate(x >> @intCast(@as(u64, 8)));
    p[@as(c_int, 2)] = @truncate(x >> @intCast(@as(u64, 16)));
    p[@as(c_int, 3)] = @truncate(x >> @intCast(@as(u64, 24)));
    p[@as(c_int, 4)] = @truncate(x >> @intCast(@as(u64, 32)));
    p[@as(c_int, 5)] = @truncate(x >> @intCast(@as(u64, 40)));
    p[@as(c_int, 6)] = @truncate(x >> @intCast(@as(u64, 48)));
    p[@as(c_int, 7)] = @truncate(x >> @intCast(@as(u64, 56)));
}
pub const wuffs_base__slice_u8 = extern struct {
    ptr: [*c]u8,
    len: usize,
    pub const wuffs_base__slice_u8__overlaps = __root.wuffs_base__slice_u8__overlaps;
    pub const wuffs_base__slice_u8__subslice_i = __root.wuffs_base__slice_u8__subslice_i;
    pub const wuffs_base__slice_u8__subslice_j = __root.wuffs_base__slice_u8__subslice_j;
    pub const wuffs_base__slice_u8__subslice_ij = __root.wuffs_base__slice_u8__subslice_ij;
    pub const wuffs_base__magic_number_guess_fourcc = __root.wuffs_base__magic_number_guess_fourcc;
    pub const wuffs_base__make_io_buffer = __root.wuffs_base__make_io_buffer;
    pub const wuffs_base__slice_u8__reader = __root.wuffs_base__slice_u8__reader;
    pub const wuffs_base__slice_u8__writer = __root.wuffs_base__slice_u8__writer;
    pub const wuffs_base__pixel_palette__closest_element = __root.wuffs_base__pixel_palette__closest_element;
    pub const wuffs_base__parse_number_f64 = __root.wuffs_base__parse_number_f64;
    pub const wuffs_base__parse_number_i64 = __root.wuffs_base__parse_number_i64;
    pub const wuffs_base__parse_number_u64 = __root.wuffs_base__parse_number_u64;
    pub const wuffs_base__render_number_f64 = __root.wuffs_base__render_number_f64;
    pub const wuffs_base__render_number_i64 = __root.wuffs_base__render_number_i64;
    pub const wuffs_base__render_number_u64 = __root.wuffs_base__render_number_u64;
    pub const wuffs_base__base_16__decode2 = __root.wuffs_base__base_16__decode2;
    pub const wuffs_base__base_16__decode4 = __root.wuffs_base__base_16__decode4;
    pub const wuffs_base__base_16__encode2 = __root.wuffs_base__base_16__encode2;
    pub const wuffs_base__base_16__encode4 = __root.wuffs_base__base_16__encode4;
    pub const wuffs_base__base_64__decode = __root.wuffs_base__base_64__decode;
    pub const wuffs_base__base_64__encode = __root.wuffs_base__base_64__encode;
    pub const wuffs_base__utf_8__encode = __root.wuffs_base__utf_8__encode;
    pub const overlaps = __root.wuffs_base__slice_u8__overlaps;
    pub const subslice_i = __root.wuffs_base__slice_u8__subslice_i;
    pub const subslice_j = __root.wuffs_base__slice_u8__subslice_j;
    pub const subslice_ij = __root.wuffs_base__slice_u8__subslice_ij;
    pub const fourcc = __root.wuffs_base__magic_number_guess_fourcc;
    pub const buffer = __root.wuffs_base__make_io_buffer;
    pub const reader = __root.wuffs_base__slice_u8__reader;
    pub const writer = __root.wuffs_base__slice_u8__writer;
    pub const element = __root.wuffs_base__pixel_palette__closest_element;
    pub const @"f64" = __root.wuffs_base__parse_number_f64;
    pub const @"i64" = __root.wuffs_base__parse_number_i64;
    pub const @"u64" = __root.wuffs_base__parse_number_u64;
    pub const decode2 = __root.wuffs_base__base_16__decode2;
    pub const decode4 = __root.wuffs_base__base_16__decode4;
    pub const encode2 = __root.wuffs_base__base_16__encode2;
    pub const encode4 = __root.wuffs_base__base_16__encode4;
    pub const decode = __root.wuffs_base__base_64__decode;
    pub const encode = __root.wuffs_base__base_64__encode;
};
pub const wuffs_base__slice_u16 = extern struct {
    ptr: [*c]u16,
    len: usize,
};
pub const wuffs_base__slice_u32 = extern struct {
    ptr: [*c]u32,
    len: usize,
};
pub const wuffs_base__slice_u64 = extern struct {
    ptr: [*c]u64,
    len: usize,
};
pub const wuffs_base__table_u8 = extern struct {
    ptr: [*c]u8,
    width: usize,
    height: usize,
    stride: usize,
    pub const wuffs_base__table_u8__subtable_ij = __root.wuffs_base__table_u8__subtable_ij;
    pub const subtable_ij = __root.wuffs_base__table_u8__subtable_ij;
};
pub const wuffs_base__table_u16 = extern struct {
    ptr: [*c]u16,
    width: usize,
    height: usize,
    stride: usize,
};
pub const wuffs_base__table_u32 = extern struct {
    ptr: [*c]u32,
    width: usize,
    height: usize,
    stride: usize,
};
pub const wuffs_base__table_u64 = extern struct {
    ptr: [*c]u64,
    width: usize,
    height: usize,
    stride: usize,
};
pub fn wuffs_base__make_slice_u8(arg_ptr: [*c]u8, arg_len: usize) callconv(.c) wuffs_base__slice_u8 {
    var ptr = arg_ptr;
    _ = &ptr;
    var len = arg_len;
    _ = &len;
    var ret: wuffs_base__slice_u8 = undefined;
    _ = &ret;
    ret.ptr = ptr;
    ret.len = len;
    return ret;
}
pub fn wuffs_base__make_slice_u16(arg_ptr: [*c]u16, arg_len: usize) callconv(.c) wuffs_base__slice_u16 {
    var ptr = arg_ptr;
    _ = &ptr;
    var len = arg_len;
    _ = &len;
    var ret: wuffs_base__slice_u16 = undefined;
    _ = &ret;
    ret.ptr = ptr;
    ret.len = len;
    return ret;
}
pub fn wuffs_base__make_slice_u32(arg_ptr: [*c]u32, arg_len: usize) callconv(.c) wuffs_base__slice_u32 {
    var ptr = arg_ptr;
    _ = &ptr;
    var len = arg_len;
    _ = &len;
    var ret: wuffs_base__slice_u32 = undefined;
    _ = &ret;
    ret.ptr = ptr;
    ret.len = len;
    return ret;
}
pub fn wuffs_base__make_slice_u64(arg_ptr: [*c]u64, arg_len: usize) callconv(.c) wuffs_base__slice_u64 {
    var ptr = arg_ptr;
    _ = &ptr;
    var len = arg_len;
    _ = &len;
    var ret: wuffs_base__slice_u64 = undefined;
    _ = &ret;
    ret.ptr = ptr;
    ret.len = len;
    return ret;
}
pub fn wuffs_base__make_slice_u8_ij(arg_ptr: [*c]u8, arg_i: usize, arg_j: usize) callconv(.c) wuffs_base__slice_u8 {
    var ptr = arg_ptr;
    _ = &ptr;
    var i = arg_i;
    _ = &i;
    var j = arg_j;
    _ = &j;
    var ret: wuffs_base__slice_u8 = undefined;
    _ = &ret;
    ret.ptr = @ptrCast(@alignCast(if (ptr != null) @as(?*anyopaque, @ptrCast(@alignCast(ptr + i))) else @as(?*anyopaque, null)));
    ret.len = if (j >= i) j -% i else @as(usize, 0);
    return ret;
}
pub fn wuffs_base__make_slice_u16_ij(arg_ptr: [*c]u16, arg_i: usize, arg_j: usize) callconv(.c) wuffs_base__slice_u16 {
    var ptr = arg_ptr;
    _ = &ptr;
    var i = arg_i;
    _ = &i;
    var j = arg_j;
    _ = &j;
    var ret: wuffs_base__slice_u16 = undefined;
    _ = &ret;
    ret.ptr = @ptrCast(@alignCast(if (ptr != null) @as(?*anyopaque, @ptrCast(@alignCast(ptr + i))) else @as(?*anyopaque, null)));
    ret.len = if (j >= i) j -% i else @as(usize, 0);
    return ret;
}
pub fn wuffs_base__make_slice_u32_ij(arg_ptr: [*c]u32, arg_i: usize, arg_j: usize) callconv(.c) wuffs_base__slice_u32 {
    var ptr = arg_ptr;
    _ = &ptr;
    var i = arg_i;
    _ = &i;
    var j = arg_j;
    _ = &j;
    var ret: wuffs_base__slice_u32 = undefined;
    _ = &ret;
    ret.ptr = @ptrCast(@alignCast(if (ptr != null) @as(?*anyopaque, @ptrCast(@alignCast(ptr + i))) else @as(?*anyopaque, null)));
    ret.len = if (j >= i) j -% i else @as(usize, 0);
    return ret;
}
pub fn wuffs_base__make_slice_u64_ij(arg_ptr: [*c]u64, arg_i: usize, arg_j: usize) callconv(.c) wuffs_base__slice_u64 {
    var ptr = arg_ptr;
    _ = &ptr;
    var i = arg_i;
    _ = &i;
    var j = arg_j;
    _ = &j;
    var ret: wuffs_base__slice_u64 = undefined;
    _ = &ret;
    ret.ptr = @ptrCast(@alignCast(if (ptr != null) @as(?*anyopaque, @ptrCast(@alignCast(ptr + i))) else @as(?*anyopaque, null)));
    ret.len = if (j >= i) j -% i else @as(usize, 0);
    return ret;
}
pub fn wuffs_base__empty_slice_u8() callconv(.c) wuffs_base__slice_u8 {
    var ret: wuffs_base__slice_u8 = undefined;
    _ = &ret;
    ret.ptr = null;
    ret.len = 0;
    return ret;
}
pub fn wuffs_base__empty_slice_u16() callconv(.c) wuffs_base__slice_u16 {
    var ret: wuffs_base__slice_u16 = undefined;
    _ = &ret;
    ret.ptr = null;
    ret.len = 0;
    return ret;
}
pub fn wuffs_base__empty_slice_u32() callconv(.c) wuffs_base__slice_u32 {
    var ret: wuffs_base__slice_u32 = undefined;
    _ = &ret;
    ret.ptr = null;
    ret.len = 0;
    return ret;
}
pub fn wuffs_base__empty_slice_u64() callconv(.c) wuffs_base__slice_u64 {
    var ret: wuffs_base__slice_u64 = undefined;
    _ = &ret;
    ret.ptr = null;
    ret.len = 0;
    return ret;
}
pub fn wuffs_base__make_table_u8(arg_ptr: [*c]u8, arg_width: usize, arg_height: usize, arg_stride: usize) callconv(.c) wuffs_base__table_u8 {
    var ptr = arg_ptr;
    _ = &ptr;
    var width = arg_width;
    _ = &width;
    var height = arg_height;
    _ = &height;
    var stride = arg_stride;
    _ = &stride;
    var ret: wuffs_base__table_u8 = undefined;
    _ = &ret;
    ret.ptr = ptr;
    ret.width = width;
    ret.height = height;
    ret.stride = stride;
    return ret;
}
pub fn wuffs_base__make_table_u16(arg_ptr: [*c]u16, arg_width: usize, arg_height: usize, arg_stride: usize) callconv(.c) wuffs_base__table_u16 {
    var ptr = arg_ptr;
    _ = &ptr;
    var width = arg_width;
    _ = &width;
    var height = arg_height;
    _ = &height;
    var stride = arg_stride;
    _ = &stride;
    var ret: wuffs_base__table_u16 = undefined;
    _ = &ret;
    ret.ptr = ptr;
    ret.width = width;
    ret.height = height;
    ret.stride = stride;
    return ret;
}
pub fn wuffs_base__make_table_u32(arg_ptr: [*c]u32, arg_width: usize, arg_height: usize, arg_stride: usize) callconv(.c) wuffs_base__table_u32 {
    var ptr = arg_ptr;
    _ = &ptr;
    var width = arg_width;
    _ = &width;
    var height = arg_height;
    _ = &height;
    var stride = arg_stride;
    _ = &stride;
    var ret: wuffs_base__table_u32 = undefined;
    _ = &ret;
    ret.ptr = ptr;
    ret.width = width;
    ret.height = height;
    ret.stride = stride;
    return ret;
}
pub fn wuffs_base__make_table_u64(arg_ptr: [*c]u64, arg_width: usize, arg_height: usize, arg_stride: usize) callconv(.c) wuffs_base__table_u64 {
    var ptr = arg_ptr;
    _ = &ptr;
    var width = arg_width;
    _ = &width;
    var height = arg_height;
    _ = &height;
    var stride = arg_stride;
    _ = &stride;
    var ret: wuffs_base__table_u64 = undefined;
    _ = &ret;
    ret.ptr = ptr;
    ret.width = width;
    ret.height = height;
    ret.stride = stride;
    return ret;
}
pub fn wuffs_base__empty_table_u8() callconv(.c) wuffs_base__table_u8 {
    var ret: wuffs_base__table_u8 = undefined;
    _ = &ret;
    ret.ptr = null;
    ret.width = 0;
    ret.height = 0;
    ret.stride = 0;
    return ret;
}
pub fn wuffs_base__empty_table_u16() callconv(.c) wuffs_base__table_u16 {
    var ret: wuffs_base__table_u16 = undefined;
    _ = &ret;
    ret.ptr = null;
    ret.width = 0;
    ret.height = 0;
    ret.stride = 0;
    return ret;
}
pub fn wuffs_base__empty_table_u32() callconv(.c) wuffs_base__table_u32 {
    var ret: wuffs_base__table_u32 = undefined;
    _ = &ret;
    ret.ptr = null;
    ret.width = 0;
    ret.height = 0;
    ret.stride = 0;
    return ret;
}
pub fn wuffs_base__empty_table_u64() callconv(.c) wuffs_base__table_u64 {
    var ret: wuffs_base__table_u64 = undefined;
    _ = &ret;
    ret.ptr = null;
    ret.width = 0;
    ret.height = 0;
    ret.stride = 0;
    return ret;
}
pub fn wuffs_base__slice_u8__overlaps(arg_s: wuffs_base__slice_u8, arg_t: wuffs_base__slice_u8) callconv(.c) bool {
    var s = arg_s;
    _ = &s;
    var t = arg_t;
    _ = &t;
    return ((s.ptr <= t.ptr) and (t.ptr < (s.ptr + s.len))) or ((t.ptr <= s.ptr) and (s.ptr < (t.ptr + t.len)));
}
pub fn wuffs_base__slice_u8__subslice_i(arg_s: wuffs_base__slice_u8, arg_i: u64) callconv(.c) wuffs_base__slice_u8 {
    var s = arg_s;
    _ = &s;
    var i = arg_i;
    _ = &i;
    if ((i <= @as(u64, __SIZE_MAX__)) and (i <= @as(u64, s.len))) {
        return wuffs_base__make_slice_u8(s.ptr + i, @as(usize, @truncate(@as(u64, s.len) -% i)));
    }
    return wuffs_base__empty_slice_u8();
}
pub fn wuffs_base__slice_u8__subslice_j(arg_s: wuffs_base__slice_u8, arg_j: u64) callconv(.c) wuffs_base__slice_u8 {
    var s = arg_s;
    _ = &s;
    var j = arg_j;
    _ = &j;
    if ((j <= @as(u64, __SIZE_MAX__)) and (j <= @as(u64, s.len))) {
        return wuffs_base__make_slice_u8(s.ptr, @as(usize, @truncate(j)));
    }
    return wuffs_base__empty_slice_u8();
}
pub fn wuffs_base__slice_u8__subslice_ij(arg_s: wuffs_base__slice_u8, arg_i: u64, arg_j: u64) callconv(.c) wuffs_base__slice_u8 {
    var s = arg_s;
    _ = &s;
    var i = arg_i;
    _ = &i;
    var j = arg_j;
    _ = &j;
    if (((i <= j) and (j <= @as(u64, __SIZE_MAX__))) and (j <= @as(u64, s.len))) {
        return wuffs_base__make_slice_u8(s.ptr + i, @as(usize, @truncate(j -% i)));
    }
    return wuffs_base__empty_slice_u8();
}
pub fn wuffs_base__table_u8__subtable_ij(arg_t: wuffs_base__table_u8, arg_ix: u64, arg_iy: u64, arg_jx: u64, arg_jy: u64) callconv(.c) wuffs_base__table_u8 {
    var t = arg_t;
    _ = &t;
    var ix = arg_ix;
    _ = &ix;
    var iy = arg_iy;
    _ = &iy;
    var jx = arg_jx;
    _ = &jx;
    var jy = arg_jy;
    _ = &jy;
    if ((((((ix <= jx) and (jx <= @as(u64, __SIZE_MAX__))) and (jx <= @as(u64, t.width))) and (iy <= jy)) and (jy <= @as(u64, __SIZE_MAX__))) and (jy <= @as(u64, t.height))) {
        return wuffs_base__make_table_u8((t.ptr + ix) + (iy *% @as(u64, t.stride)), @as(usize, @truncate(jx -% ix)), @as(usize, @truncate(jy -% iy)), t.stride);
    }
    return wuffs_base__make_table_u8(null, 0, 0, 0);
}
pub fn wuffs_base__table__flattened_length(arg_width: usize, arg_height: usize, arg_stride: usize) callconv(.c) usize {
    var width = arg_width;
    _ = &width;
    var height = arg_height;
    _ = &height;
    var stride = arg_stride;
    _ = &stride;
    if (height == @as(usize, 0)) {
        return 0;
    }
    return ((height -% @as(usize, 1)) *% stride) +% width;
}
pub extern fn wuffs_base__magic_number_guess_fourcc(prefix_data: wuffs_base__slice_u8, prefix_closed: bool) i32;
pub const struct_wuffs_base__range_ie_i32__struct = extern struct {
    min_incl: i32,
    max_excl: i32,
    pub const wuffs_base__range_ie_i32__is_empty = __root.wuffs_base__range_ie_i32__is_empty;
    pub const wuffs_base__range_ie_i32__equals = __root.wuffs_base__range_ie_i32__equals;
    pub const wuffs_base__range_ie_i32__intersect = __root.wuffs_base__range_ie_i32__intersect;
    pub const wuffs_base__range_ie_i32__unite = __root.wuffs_base__range_ie_i32__unite;
    pub const wuffs_base__range_ie_i32__contains = __root.wuffs_base__range_ie_i32__contains;
    pub const wuffs_base__range_ie_i32__contains_range = __root.wuffs_base__range_ie_i32__contains_range;
    pub const wuffs_base__range_ie_i32__length = __root.wuffs_base__range_ie_i32__length;
    pub const empty = __root.wuffs_base__range_ie_i32__is_empty;
    pub const equals = __root.wuffs_base__range_ie_i32__equals;
    pub const intersect = __root.wuffs_base__range_ie_i32__intersect;
    pub const unite = __root.wuffs_base__range_ie_i32__unite;
    pub const contains = __root.wuffs_base__range_ie_i32__contains;
    pub const range = __root.wuffs_base__range_ie_i32__contains_range;
    pub const length = __root.wuffs_base__range_ie_i32__length;
};
pub const wuffs_base__range_ie_i32 = struct_wuffs_base__range_ie_i32__struct;
pub fn wuffs_base__empty_range_ie_i32() callconv(.c) wuffs_base__range_ie_i32 {
    var ret: wuffs_base__range_ie_i32 = undefined;
    _ = &ret;
    ret.min_incl = 0;
    ret.max_excl = 0;
    return ret;
}
pub fn wuffs_base__make_range_ie_i32(arg_min_incl: i32, arg_max_excl: i32) callconv(.c) wuffs_base__range_ie_i32 {
    var min_incl = arg_min_incl;
    _ = &min_incl;
    var max_excl = arg_max_excl;
    _ = &max_excl;
    var ret: wuffs_base__range_ie_i32 = undefined;
    _ = &ret;
    ret.min_incl = min_incl;
    ret.max_excl = max_excl;
    return ret;
}
pub fn wuffs_base__range_ie_i32__is_empty(arg_r: [*c]const wuffs_base__range_ie_i32) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    return r.*.min_incl >= r.*.max_excl;
}
pub fn wuffs_base__range_ie_i32__equals(arg_r: [*c]const wuffs_base__range_ie_i32, arg_s: wuffs_base__range_ie_i32) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    return ((r.*.min_incl == s.min_incl) and (r.*.max_excl == s.max_excl)) or (wuffs_base__range_ie_i32__is_empty(r) and wuffs_base__range_ie_i32__is_empty(&s));
}
pub fn wuffs_base__range_ie_i32__intersect(arg_r: [*c]const wuffs_base__range_ie_i32, arg_s: wuffs_base__range_ie_i32) callconv(.c) wuffs_base__range_ie_i32 {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    var t: wuffs_base__range_ie_i32 = undefined;
    _ = &t;
    t.min_incl = wuffs_base__i32__max(r.*.min_incl, s.min_incl);
    t.max_excl = wuffs_base__i32__min(r.*.max_excl, s.max_excl);
    return t;
}
pub fn wuffs_base__range_ie_i32__unite(arg_r: [*c]const wuffs_base__range_ie_i32, arg_s: wuffs_base__range_ie_i32) callconv(.c) wuffs_base__range_ie_i32 {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    if (wuffs_base__range_ie_i32__is_empty(r)) {
        return s;
    }
    if (wuffs_base__range_ie_i32__is_empty(&s)) {
        return r.*;
    }
    var t: wuffs_base__range_ie_i32 = undefined;
    _ = &t;
    t.min_incl = wuffs_base__i32__min(r.*.min_incl, s.min_incl);
    t.max_excl = wuffs_base__i32__max(r.*.max_excl, s.max_excl);
    return t;
}
pub fn wuffs_base__range_ie_i32__contains(arg_r: [*c]const wuffs_base__range_ie_i32, arg_x: i32) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    var x = arg_x;
    _ = &x;
    return (r.*.min_incl <= x) and (x < r.*.max_excl);
}
pub fn wuffs_base__range_ie_i32__contains_range(arg_r: [*c]const wuffs_base__range_ie_i32, arg_s: wuffs_base__range_ie_i32) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    return wuffs_base__range_ie_i32__equals(&s, wuffs_base__range_ie_i32__intersect(r, s));
}
pub fn wuffs_base__range_ie_i32__length(arg_r: [*c]const wuffs_base__range_ie_i32) callconv(.c) u32 {
    var r = arg_r;
    _ = &r;
    return if (r.*.max_excl > r.*.min_incl) @as(u32, @bitCast(@as(c_int, r.*.max_excl))) -% @as(u32, @bitCast(@as(c_int, r.*.min_incl))) else @as(u32, 0);
}
pub const struct_wuffs_base__range_ie_u32__struct = extern struct {
    min_incl: u32,
    max_excl: u32,
    pub const wuffs_base__range_ie_u32__is_empty = __root.wuffs_base__range_ie_u32__is_empty;
    pub const wuffs_base__range_ie_u32__equals = __root.wuffs_base__range_ie_u32__equals;
    pub const wuffs_base__range_ie_u32__intersect = __root.wuffs_base__range_ie_u32__intersect;
    pub const wuffs_base__range_ie_u32__unite = __root.wuffs_base__range_ie_u32__unite;
    pub const wuffs_base__range_ie_u32__contains = __root.wuffs_base__range_ie_u32__contains;
    pub const wuffs_base__range_ie_u32__contains_range = __root.wuffs_base__range_ie_u32__contains_range;
    pub const wuffs_base__range_ie_u32__length = __root.wuffs_base__range_ie_u32__length;
    pub const empty = __root.wuffs_base__range_ie_u32__is_empty;
    pub const equals = __root.wuffs_base__range_ie_u32__equals;
    pub const intersect = __root.wuffs_base__range_ie_u32__intersect;
    pub const unite = __root.wuffs_base__range_ie_u32__unite;
    pub const contains = __root.wuffs_base__range_ie_u32__contains;
    pub const range = __root.wuffs_base__range_ie_u32__contains_range;
    pub const length = __root.wuffs_base__range_ie_u32__length;
};
pub const wuffs_base__range_ie_u32 = struct_wuffs_base__range_ie_u32__struct;
pub fn wuffs_base__empty_range_ie_u32() callconv(.c) wuffs_base__range_ie_u32 {
    var ret: wuffs_base__range_ie_u32 = undefined;
    _ = &ret;
    ret.min_incl = 0;
    ret.max_excl = 0;
    return ret;
}
pub fn wuffs_base__make_range_ie_u32(arg_min_incl: u32, arg_max_excl: u32) callconv(.c) wuffs_base__range_ie_u32 {
    var min_incl = arg_min_incl;
    _ = &min_incl;
    var max_excl = arg_max_excl;
    _ = &max_excl;
    var ret: wuffs_base__range_ie_u32 = undefined;
    _ = &ret;
    ret.min_incl = min_incl;
    ret.max_excl = max_excl;
    return ret;
}
pub fn wuffs_base__range_ie_u32__is_empty(arg_r: [*c]const wuffs_base__range_ie_u32) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    return r.*.min_incl >= r.*.max_excl;
}
pub fn wuffs_base__range_ie_u32__equals(arg_r: [*c]const wuffs_base__range_ie_u32, arg_s: wuffs_base__range_ie_u32) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    return ((r.*.min_incl == s.min_incl) and (r.*.max_excl == s.max_excl)) or (wuffs_base__range_ie_u32__is_empty(r) and wuffs_base__range_ie_u32__is_empty(&s));
}
pub fn wuffs_base__range_ie_u32__intersect(arg_r: [*c]const wuffs_base__range_ie_u32, arg_s: wuffs_base__range_ie_u32) callconv(.c) wuffs_base__range_ie_u32 {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    var t: wuffs_base__range_ie_u32 = undefined;
    _ = &t;
    t.min_incl = wuffs_base__u32__max(r.*.min_incl, s.min_incl);
    t.max_excl = wuffs_base__u32__min(r.*.max_excl, s.max_excl);
    return t;
}
pub fn wuffs_base__range_ie_u32__unite(arg_r: [*c]const wuffs_base__range_ie_u32, arg_s: wuffs_base__range_ie_u32) callconv(.c) wuffs_base__range_ie_u32 {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    if (wuffs_base__range_ie_u32__is_empty(r)) {
        return s;
    }
    if (wuffs_base__range_ie_u32__is_empty(&s)) {
        return r.*;
    }
    var t: wuffs_base__range_ie_u32 = undefined;
    _ = &t;
    t.min_incl = wuffs_base__u32__min(r.*.min_incl, s.min_incl);
    t.max_excl = wuffs_base__u32__max(r.*.max_excl, s.max_excl);
    return t;
}
pub fn wuffs_base__range_ie_u32__contains(arg_r: [*c]const wuffs_base__range_ie_u32, arg_x: u32) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    var x = arg_x;
    _ = &x;
    return (r.*.min_incl <= x) and (x < r.*.max_excl);
}
pub fn wuffs_base__range_ie_u32__contains_range(arg_r: [*c]const wuffs_base__range_ie_u32, arg_s: wuffs_base__range_ie_u32) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    return wuffs_base__range_ie_u32__equals(&s, wuffs_base__range_ie_u32__intersect(r, s));
}
pub fn wuffs_base__range_ie_u32__length(arg_r: [*c]const wuffs_base__range_ie_u32) callconv(.c) u32 {
    var r = arg_r;
    _ = &r;
    return wuffs_base__u32__sat_sub(r.*.max_excl, r.*.min_incl);
}
pub const struct_wuffs_base__range_ie_u64__struct = extern struct {
    min_incl: u64,
    max_excl: u64,
    pub const wuffs_base__range_ie_u64__is_empty = __root.wuffs_base__range_ie_u64__is_empty;
    pub const wuffs_base__range_ie_u64__equals = __root.wuffs_base__range_ie_u64__equals;
    pub const wuffs_base__range_ie_u64__intersect = __root.wuffs_base__range_ie_u64__intersect;
    pub const wuffs_base__range_ie_u64__unite = __root.wuffs_base__range_ie_u64__unite;
    pub const wuffs_base__range_ie_u64__contains = __root.wuffs_base__range_ie_u64__contains;
    pub const wuffs_base__range_ie_u64__contains_range = __root.wuffs_base__range_ie_u64__contains_range;
    pub const wuffs_base__range_ie_u64__length = __root.wuffs_base__range_ie_u64__length;
    pub const empty = __root.wuffs_base__range_ie_u64__is_empty;
    pub const equals = __root.wuffs_base__range_ie_u64__equals;
    pub const intersect = __root.wuffs_base__range_ie_u64__intersect;
    pub const unite = __root.wuffs_base__range_ie_u64__unite;
    pub const contains = __root.wuffs_base__range_ie_u64__contains;
    pub const range = __root.wuffs_base__range_ie_u64__contains_range;
    pub const length = __root.wuffs_base__range_ie_u64__length;
};
pub const wuffs_base__range_ie_u64 = struct_wuffs_base__range_ie_u64__struct;
pub fn wuffs_base__empty_range_ie_u64() callconv(.c) wuffs_base__range_ie_u64 {
    var ret: wuffs_base__range_ie_u64 = undefined;
    _ = &ret;
    ret.min_incl = 0;
    ret.max_excl = 0;
    return ret;
}
pub fn wuffs_base__make_range_ie_u64(arg_min_incl: u64, arg_max_excl: u64) callconv(.c) wuffs_base__range_ie_u64 {
    var min_incl = arg_min_incl;
    _ = &min_incl;
    var max_excl = arg_max_excl;
    _ = &max_excl;
    var ret: wuffs_base__range_ie_u64 = undefined;
    _ = &ret;
    ret.min_incl = min_incl;
    ret.max_excl = max_excl;
    return ret;
}
pub fn wuffs_base__range_ie_u64__is_empty(arg_r: [*c]const wuffs_base__range_ie_u64) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    return r.*.min_incl >= r.*.max_excl;
}
pub fn wuffs_base__range_ie_u64__equals(arg_r: [*c]const wuffs_base__range_ie_u64, arg_s: wuffs_base__range_ie_u64) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    return ((r.*.min_incl == s.min_incl) and (r.*.max_excl == s.max_excl)) or (wuffs_base__range_ie_u64__is_empty(r) and wuffs_base__range_ie_u64__is_empty(&s));
}
pub fn wuffs_base__range_ie_u64__intersect(arg_r: [*c]const wuffs_base__range_ie_u64, arg_s: wuffs_base__range_ie_u64) callconv(.c) wuffs_base__range_ie_u64 {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    var t: wuffs_base__range_ie_u64 = undefined;
    _ = &t;
    t.min_incl = wuffs_base__u64__max(r.*.min_incl, s.min_incl);
    t.max_excl = wuffs_base__u64__min(r.*.max_excl, s.max_excl);
    return t;
}
pub fn wuffs_base__range_ie_u64__unite(arg_r: [*c]const wuffs_base__range_ie_u64, arg_s: wuffs_base__range_ie_u64) callconv(.c) wuffs_base__range_ie_u64 {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    if (wuffs_base__range_ie_u64__is_empty(r)) {
        return s;
    }
    if (wuffs_base__range_ie_u64__is_empty(&s)) {
        return r.*;
    }
    var t: wuffs_base__range_ie_u64 = undefined;
    _ = &t;
    t.min_incl = wuffs_base__u64__min(r.*.min_incl, s.min_incl);
    t.max_excl = wuffs_base__u64__max(r.*.max_excl, s.max_excl);
    return t;
}
pub fn wuffs_base__range_ie_u64__contains(arg_r: [*c]const wuffs_base__range_ie_u64, arg_x: u64) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    var x = arg_x;
    _ = &x;
    return (r.*.min_incl <= x) and (x < r.*.max_excl);
}
pub fn wuffs_base__range_ie_u64__contains_range(arg_r: [*c]const wuffs_base__range_ie_u64, arg_s: wuffs_base__range_ie_u64) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    return wuffs_base__range_ie_u64__equals(&s, wuffs_base__range_ie_u64__intersect(r, s));
}
pub fn wuffs_base__range_ie_u64__length(arg_r: [*c]const wuffs_base__range_ie_u64) callconv(.c) u64 {
    var r = arg_r;
    _ = &r;
    return wuffs_base__u64__sat_sub(r.*.max_excl, r.*.min_incl);
}
pub const struct_wuffs_base__range_ii_u32__struct = extern struct {
    min_incl: u32,
    max_incl: u32,
    pub const wuffs_base__range_ii_u32__is_empty = __root.wuffs_base__range_ii_u32__is_empty;
    pub const wuffs_base__range_ii_u32__equals = __root.wuffs_base__range_ii_u32__equals;
    pub const wuffs_base__range_ii_u32__intersect = __root.wuffs_base__range_ii_u32__intersect;
    pub const wuffs_base__range_ii_u32__unite = __root.wuffs_base__range_ii_u32__unite;
    pub const wuffs_base__range_ii_u32__contains = __root.wuffs_base__range_ii_u32__contains;
    pub const wuffs_base__range_ii_u32__contains_range = __root.wuffs_base__range_ii_u32__contains_range;
    pub const empty = __root.wuffs_base__range_ii_u32__is_empty;
    pub const equals = __root.wuffs_base__range_ii_u32__equals;
    pub const intersect = __root.wuffs_base__range_ii_u32__intersect;
    pub const unite = __root.wuffs_base__range_ii_u32__unite;
    pub const contains = __root.wuffs_base__range_ii_u32__contains;
    pub const range = __root.wuffs_base__range_ii_u32__contains_range;
};
pub const wuffs_base__range_ii_u32 = struct_wuffs_base__range_ii_u32__struct;
pub fn wuffs_base__empty_range_ii_u32() callconv(.c) wuffs_base__range_ii_u32 {
    var ret: wuffs_base__range_ii_u32 = undefined;
    _ = &ret;
    ret.min_incl = 0;
    ret.max_incl = 0;
    return ret;
}
pub fn wuffs_base__make_range_ii_u32(arg_min_incl: u32, arg_max_incl: u32) callconv(.c) wuffs_base__range_ii_u32 {
    var min_incl = arg_min_incl;
    _ = &min_incl;
    var max_incl = arg_max_incl;
    _ = &max_incl;
    var ret: wuffs_base__range_ii_u32 = undefined;
    _ = &ret;
    ret.min_incl = min_incl;
    ret.max_incl = max_incl;
    return ret;
}
pub fn wuffs_base__range_ii_u32__is_empty(arg_r: [*c]const wuffs_base__range_ii_u32) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    return r.*.min_incl > r.*.max_incl;
}
pub fn wuffs_base__range_ii_u32__equals(arg_r: [*c]const wuffs_base__range_ii_u32, arg_s: wuffs_base__range_ii_u32) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    return ((r.*.min_incl == s.min_incl) and (r.*.max_incl == s.max_incl)) or (wuffs_base__range_ii_u32__is_empty(r) and wuffs_base__range_ii_u32__is_empty(&s));
}
pub fn wuffs_base__range_ii_u32__intersect(arg_r: [*c]const wuffs_base__range_ii_u32, arg_s: wuffs_base__range_ii_u32) callconv(.c) wuffs_base__range_ii_u32 {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    var t: wuffs_base__range_ii_u32 = undefined;
    _ = &t;
    t.min_incl = wuffs_base__u32__max(r.*.min_incl, s.min_incl);
    t.max_incl = wuffs_base__u32__min(r.*.max_incl, s.max_incl);
    return t;
}
pub fn wuffs_base__range_ii_u32__unite(arg_r: [*c]const wuffs_base__range_ii_u32, arg_s: wuffs_base__range_ii_u32) callconv(.c) wuffs_base__range_ii_u32 {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    if (wuffs_base__range_ii_u32__is_empty(r)) {
        return s;
    }
    if (wuffs_base__range_ii_u32__is_empty(&s)) {
        return r.*;
    }
    var t: wuffs_base__range_ii_u32 = undefined;
    _ = &t;
    t.min_incl = wuffs_base__u32__min(r.*.min_incl, s.min_incl);
    t.max_incl = wuffs_base__u32__max(r.*.max_incl, s.max_incl);
    return t;
}
pub fn wuffs_base__range_ii_u32__contains(arg_r: [*c]const wuffs_base__range_ii_u32, arg_x: u32) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    var x = arg_x;
    _ = &x;
    return (r.*.min_incl <= x) and (x <= r.*.max_incl);
}
pub fn wuffs_base__range_ii_u32__contains_range(arg_r: [*c]const wuffs_base__range_ii_u32, arg_s: wuffs_base__range_ii_u32) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    return wuffs_base__range_ii_u32__equals(&s, wuffs_base__range_ii_u32__intersect(r, s));
}
pub const struct_wuffs_base__range_ii_u64__struct = extern struct {
    min_incl: u64,
    max_incl: u64,
    pub const wuffs_base__range_ii_u64__is_empty = __root.wuffs_base__range_ii_u64__is_empty;
    pub const wuffs_base__range_ii_u64__equals = __root.wuffs_base__range_ii_u64__equals;
    pub const wuffs_base__range_ii_u64__intersect = __root.wuffs_base__range_ii_u64__intersect;
    pub const wuffs_base__range_ii_u64__unite = __root.wuffs_base__range_ii_u64__unite;
    pub const wuffs_base__range_ii_u64__contains = __root.wuffs_base__range_ii_u64__contains;
    pub const wuffs_base__range_ii_u64__contains_range = __root.wuffs_base__range_ii_u64__contains_range;
    pub const empty = __root.wuffs_base__range_ii_u64__is_empty;
    pub const equals = __root.wuffs_base__range_ii_u64__equals;
    pub const intersect = __root.wuffs_base__range_ii_u64__intersect;
    pub const unite = __root.wuffs_base__range_ii_u64__unite;
    pub const contains = __root.wuffs_base__range_ii_u64__contains;
    pub const range = __root.wuffs_base__range_ii_u64__contains_range;
};
pub const wuffs_base__range_ii_u64 = struct_wuffs_base__range_ii_u64__struct;
pub fn wuffs_base__empty_range_ii_u64() callconv(.c) wuffs_base__range_ii_u64 {
    var ret: wuffs_base__range_ii_u64 = undefined;
    _ = &ret;
    ret.min_incl = 0;
    ret.max_incl = 0;
    return ret;
}
pub fn wuffs_base__make_range_ii_u64(arg_min_incl: u64, arg_max_incl: u64) callconv(.c) wuffs_base__range_ii_u64 {
    var min_incl = arg_min_incl;
    _ = &min_incl;
    var max_incl = arg_max_incl;
    _ = &max_incl;
    var ret: wuffs_base__range_ii_u64 = undefined;
    _ = &ret;
    ret.min_incl = min_incl;
    ret.max_incl = max_incl;
    return ret;
}
pub fn wuffs_base__range_ii_u64__is_empty(arg_r: [*c]const wuffs_base__range_ii_u64) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    return r.*.min_incl > r.*.max_incl;
}
pub fn wuffs_base__range_ii_u64__equals(arg_r: [*c]const wuffs_base__range_ii_u64, arg_s: wuffs_base__range_ii_u64) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    return ((r.*.min_incl == s.min_incl) and (r.*.max_incl == s.max_incl)) or (wuffs_base__range_ii_u64__is_empty(r) and wuffs_base__range_ii_u64__is_empty(&s));
}
pub fn wuffs_base__range_ii_u64__intersect(arg_r: [*c]const wuffs_base__range_ii_u64, arg_s: wuffs_base__range_ii_u64) callconv(.c) wuffs_base__range_ii_u64 {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    var t: wuffs_base__range_ii_u64 = undefined;
    _ = &t;
    t.min_incl = wuffs_base__u64__max(r.*.min_incl, s.min_incl);
    t.max_incl = wuffs_base__u64__min(r.*.max_incl, s.max_incl);
    return t;
}
pub fn wuffs_base__range_ii_u64__unite(arg_r: [*c]const wuffs_base__range_ii_u64, arg_s: wuffs_base__range_ii_u64) callconv(.c) wuffs_base__range_ii_u64 {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    if (wuffs_base__range_ii_u64__is_empty(r)) {
        return s;
    }
    if (wuffs_base__range_ii_u64__is_empty(&s)) {
        return r.*;
    }
    var t: wuffs_base__range_ii_u64 = undefined;
    _ = &t;
    t.min_incl = wuffs_base__u64__min(r.*.min_incl, s.min_incl);
    t.max_incl = wuffs_base__u64__max(r.*.max_incl, s.max_incl);
    return t;
}
pub fn wuffs_base__range_ii_u64__contains(arg_r: [*c]const wuffs_base__range_ii_u64, arg_x: u64) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    var x = arg_x;
    _ = &x;
    return (r.*.min_incl <= x) and (x <= r.*.max_incl);
}
pub fn wuffs_base__range_ii_u64__contains_range(arg_r: [*c]const wuffs_base__range_ii_u64, arg_s: wuffs_base__range_ii_u64) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    return wuffs_base__range_ii_u64__equals(&s, wuffs_base__range_ii_u64__intersect(r, s));
}
pub const struct_wuffs_base__rect_ie_i32__struct = extern struct {
    min_incl_x: i32,
    min_incl_y: i32,
    max_excl_x: i32,
    max_excl_y: i32,
    pub const wuffs_base__rect_ie_i32__is_empty = __root.wuffs_base__rect_ie_i32__is_empty;
    pub const wuffs_base__rect_ie_i32__equals = __root.wuffs_base__rect_ie_i32__equals;
    pub const wuffs_base__rect_ie_i32__intersect = __root.wuffs_base__rect_ie_i32__intersect;
    pub const wuffs_base__rect_ie_i32__unite = __root.wuffs_base__rect_ie_i32__unite;
    pub const wuffs_base__rect_ie_i32__contains = __root.wuffs_base__rect_ie_i32__contains;
    pub const wuffs_base__rect_ie_i32__contains_rect = __root.wuffs_base__rect_ie_i32__contains_rect;
    pub const wuffs_base__rect_ie_i32__width = __root.wuffs_base__rect_ie_i32__width;
    pub const wuffs_base__rect_ie_i32__height = __root.wuffs_base__rect_ie_i32__height;
    pub const empty = __root.wuffs_base__rect_ie_i32__is_empty;
    pub const equals = __root.wuffs_base__rect_ie_i32__equals;
    pub const intersect = __root.wuffs_base__rect_ie_i32__intersect;
    pub const unite = __root.wuffs_base__rect_ie_i32__unite;
    pub const contains = __root.wuffs_base__rect_ie_i32__contains;
    pub const rect = __root.wuffs_base__rect_ie_i32__contains_rect;
    pub const width = __root.wuffs_base__rect_ie_i32__width;
    pub const height = __root.wuffs_base__rect_ie_i32__height;
};
pub const wuffs_base__rect_ie_i32 = struct_wuffs_base__rect_ie_i32__struct;
pub fn wuffs_base__empty_rect_ie_i32() callconv(.c) wuffs_base__rect_ie_i32 {
    var ret: wuffs_base__rect_ie_i32 = undefined;
    _ = &ret;
    ret.min_incl_x = 0;
    ret.min_incl_y = 0;
    ret.max_excl_x = 0;
    ret.max_excl_y = 0;
    return ret;
}
pub fn wuffs_base__make_rect_ie_i32(arg_min_incl_x: i32, arg_min_incl_y: i32, arg_max_excl_x: i32, arg_max_excl_y: i32) callconv(.c) wuffs_base__rect_ie_i32 {
    var min_incl_x = arg_min_incl_x;
    _ = &min_incl_x;
    var min_incl_y = arg_min_incl_y;
    _ = &min_incl_y;
    var max_excl_x = arg_max_excl_x;
    _ = &max_excl_x;
    var max_excl_y = arg_max_excl_y;
    _ = &max_excl_y;
    var ret: wuffs_base__rect_ie_i32 = undefined;
    _ = &ret;
    ret.min_incl_x = min_incl_x;
    ret.min_incl_y = min_incl_y;
    ret.max_excl_x = max_excl_x;
    ret.max_excl_y = max_excl_y;
    return ret;
}
pub fn wuffs_base__rect_ie_i32__is_empty(arg_r: [*c]const wuffs_base__rect_ie_i32) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    return (r.*.min_incl_x >= r.*.max_excl_x) or (r.*.min_incl_y >= r.*.max_excl_y);
}
pub fn wuffs_base__rect_ie_i32__equals(arg_r: [*c]const wuffs_base__rect_ie_i32, arg_s: wuffs_base__rect_ie_i32) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    return ((((r.*.min_incl_x == s.min_incl_x) and (r.*.min_incl_y == s.min_incl_y)) and (r.*.max_excl_x == s.max_excl_x)) and (r.*.max_excl_y == s.max_excl_y)) or (wuffs_base__rect_ie_i32__is_empty(r) and wuffs_base__rect_ie_i32__is_empty(&s));
}
pub fn wuffs_base__rect_ie_i32__intersect(arg_r: [*c]const wuffs_base__rect_ie_i32, arg_s: wuffs_base__rect_ie_i32) callconv(.c) wuffs_base__rect_ie_i32 {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    var t: wuffs_base__rect_ie_i32 = undefined;
    _ = &t;
    t.min_incl_x = wuffs_base__i32__max(r.*.min_incl_x, s.min_incl_x);
    t.min_incl_y = wuffs_base__i32__max(r.*.min_incl_y, s.min_incl_y);
    t.max_excl_x = wuffs_base__i32__min(r.*.max_excl_x, s.max_excl_x);
    t.max_excl_y = wuffs_base__i32__min(r.*.max_excl_y, s.max_excl_y);
    return t;
}
pub fn wuffs_base__rect_ie_i32__unite(arg_r: [*c]const wuffs_base__rect_ie_i32, arg_s: wuffs_base__rect_ie_i32) callconv(.c) wuffs_base__rect_ie_i32 {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    if (wuffs_base__rect_ie_i32__is_empty(r)) {
        return s;
    }
    if (wuffs_base__rect_ie_i32__is_empty(&s)) {
        return r.*;
    }
    var t: wuffs_base__rect_ie_i32 = undefined;
    _ = &t;
    t.min_incl_x = wuffs_base__i32__min(r.*.min_incl_x, s.min_incl_x);
    t.min_incl_y = wuffs_base__i32__min(r.*.min_incl_y, s.min_incl_y);
    t.max_excl_x = wuffs_base__i32__max(r.*.max_excl_x, s.max_excl_x);
    t.max_excl_y = wuffs_base__i32__max(r.*.max_excl_y, s.max_excl_y);
    return t;
}
pub fn wuffs_base__rect_ie_i32__contains(arg_r: [*c]const wuffs_base__rect_ie_i32, arg_x: i32, arg_y: i32) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    return (((r.*.min_incl_x <= x) and (x < r.*.max_excl_x)) and (r.*.min_incl_y <= y)) and (y < r.*.max_excl_y);
}
pub fn wuffs_base__rect_ie_i32__contains_rect(arg_r: [*c]const wuffs_base__rect_ie_i32, arg_s: wuffs_base__rect_ie_i32) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    return wuffs_base__rect_ie_i32__equals(&s, wuffs_base__rect_ie_i32__intersect(r, s));
}
pub fn wuffs_base__rect_ie_i32__width(arg_r: [*c]const wuffs_base__rect_ie_i32) callconv(.c) u32 {
    var r = arg_r;
    _ = &r;
    return if (r.*.max_excl_x > r.*.min_incl_x) @as(u32, @bitCast(@as(c_int, r.*.max_excl_x))) -% @as(u32, @bitCast(@as(c_int, r.*.min_incl_x))) else @as(u32, 0);
}
pub fn wuffs_base__rect_ie_i32__height(arg_r: [*c]const wuffs_base__rect_ie_i32) callconv(.c) u32 {
    var r = arg_r;
    _ = &r;
    return if (r.*.max_excl_y > r.*.min_incl_y) @as(u32, @bitCast(@as(c_int, r.*.max_excl_y))) -% @as(u32, @bitCast(@as(c_int, r.*.min_incl_y))) else @as(u32, 0);
}
pub const struct_wuffs_base__rect_ie_u32__struct = extern struct {
    min_incl_x: u32,
    min_incl_y: u32,
    max_excl_x: u32,
    max_excl_y: u32,
    pub const wuffs_base__rect_ie_u32__is_empty = __root.wuffs_base__rect_ie_u32__is_empty;
    pub const wuffs_base__rect_ie_u32__equals = __root.wuffs_base__rect_ie_u32__equals;
    pub const wuffs_base__rect_ie_u32__intersect = __root.wuffs_base__rect_ie_u32__intersect;
    pub const wuffs_base__rect_ie_u32__unite = __root.wuffs_base__rect_ie_u32__unite;
    pub const wuffs_base__rect_ie_u32__contains = __root.wuffs_base__rect_ie_u32__contains;
    pub const wuffs_base__rect_ie_u32__contains_rect = __root.wuffs_base__rect_ie_u32__contains_rect;
    pub const wuffs_base__rect_ie_u32__width = __root.wuffs_base__rect_ie_u32__width;
    pub const wuffs_base__rect_ie_u32__height = __root.wuffs_base__rect_ie_u32__height;
    pub const empty = __root.wuffs_base__rect_ie_u32__is_empty;
    pub const equals = __root.wuffs_base__rect_ie_u32__equals;
    pub const intersect = __root.wuffs_base__rect_ie_u32__intersect;
    pub const unite = __root.wuffs_base__rect_ie_u32__unite;
    pub const contains = __root.wuffs_base__rect_ie_u32__contains;
    pub const rect = __root.wuffs_base__rect_ie_u32__contains_rect;
    pub const width = __root.wuffs_base__rect_ie_u32__width;
    pub const height = __root.wuffs_base__rect_ie_u32__height;
};
pub const wuffs_base__rect_ie_u32 = struct_wuffs_base__rect_ie_u32__struct;
pub fn wuffs_base__empty_rect_ie_u32() callconv(.c) wuffs_base__rect_ie_u32 {
    var ret: wuffs_base__rect_ie_u32 = undefined;
    _ = &ret;
    ret.min_incl_x = 0;
    ret.min_incl_y = 0;
    ret.max_excl_x = 0;
    ret.max_excl_y = 0;
    return ret;
}
pub fn wuffs_base__make_rect_ie_u32(arg_min_incl_x: u32, arg_min_incl_y: u32, arg_max_excl_x: u32, arg_max_excl_y: u32) callconv(.c) wuffs_base__rect_ie_u32 {
    var min_incl_x = arg_min_incl_x;
    _ = &min_incl_x;
    var min_incl_y = arg_min_incl_y;
    _ = &min_incl_y;
    var max_excl_x = arg_max_excl_x;
    _ = &max_excl_x;
    var max_excl_y = arg_max_excl_y;
    _ = &max_excl_y;
    var ret: wuffs_base__rect_ie_u32 = undefined;
    _ = &ret;
    ret.min_incl_x = min_incl_x;
    ret.min_incl_y = min_incl_y;
    ret.max_excl_x = max_excl_x;
    ret.max_excl_y = max_excl_y;
    return ret;
}
pub fn wuffs_base__rect_ie_u32__is_empty(arg_r: [*c]const wuffs_base__rect_ie_u32) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    return (r.*.min_incl_x >= r.*.max_excl_x) or (r.*.min_incl_y >= r.*.max_excl_y);
}
pub fn wuffs_base__rect_ie_u32__equals(arg_r: [*c]const wuffs_base__rect_ie_u32, arg_s: wuffs_base__rect_ie_u32) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    return ((((r.*.min_incl_x == s.min_incl_x) and (r.*.min_incl_y == s.min_incl_y)) and (r.*.max_excl_x == s.max_excl_x)) and (r.*.max_excl_y == s.max_excl_y)) or (wuffs_base__rect_ie_u32__is_empty(r) and wuffs_base__rect_ie_u32__is_empty(&s));
}
pub fn wuffs_base__rect_ie_u32__intersect(arg_r: [*c]const wuffs_base__rect_ie_u32, arg_s: wuffs_base__rect_ie_u32) callconv(.c) wuffs_base__rect_ie_u32 {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    var t: wuffs_base__rect_ie_u32 = undefined;
    _ = &t;
    t.min_incl_x = wuffs_base__u32__max(r.*.min_incl_x, s.min_incl_x);
    t.min_incl_y = wuffs_base__u32__max(r.*.min_incl_y, s.min_incl_y);
    t.max_excl_x = wuffs_base__u32__min(r.*.max_excl_x, s.max_excl_x);
    t.max_excl_y = wuffs_base__u32__min(r.*.max_excl_y, s.max_excl_y);
    return t;
}
pub fn wuffs_base__rect_ie_u32__unite(arg_r: [*c]const wuffs_base__rect_ie_u32, arg_s: wuffs_base__rect_ie_u32) callconv(.c) wuffs_base__rect_ie_u32 {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    if (wuffs_base__rect_ie_u32__is_empty(r)) {
        return s;
    }
    if (wuffs_base__rect_ie_u32__is_empty(&s)) {
        return r.*;
    }
    var t: wuffs_base__rect_ie_u32 = undefined;
    _ = &t;
    t.min_incl_x = wuffs_base__u32__min(r.*.min_incl_x, s.min_incl_x);
    t.min_incl_y = wuffs_base__u32__min(r.*.min_incl_y, s.min_incl_y);
    t.max_excl_x = wuffs_base__u32__max(r.*.max_excl_x, s.max_excl_x);
    t.max_excl_y = wuffs_base__u32__max(r.*.max_excl_y, s.max_excl_y);
    return t;
}
pub fn wuffs_base__rect_ie_u32__contains(arg_r: [*c]const wuffs_base__rect_ie_u32, arg_x: u32, arg_y: u32) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    return (((r.*.min_incl_x <= x) and (x < r.*.max_excl_x)) and (r.*.min_incl_y <= y)) and (y < r.*.max_excl_y);
}
pub fn wuffs_base__rect_ie_u32__contains_rect(arg_r: [*c]const wuffs_base__rect_ie_u32, arg_s: wuffs_base__rect_ie_u32) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    return wuffs_base__rect_ie_u32__equals(&s, wuffs_base__rect_ie_u32__intersect(r, s));
}
pub fn wuffs_base__rect_ie_u32__width(arg_r: [*c]const wuffs_base__rect_ie_u32) callconv(.c) u32 {
    var r = arg_r;
    _ = &r;
    return wuffs_base__u32__sat_sub(r.*.max_excl_x, r.*.min_incl_x);
}
pub fn wuffs_base__rect_ie_u32__height(arg_r: [*c]const wuffs_base__rect_ie_u32) callconv(.c) u32 {
    var r = arg_r;
    _ = &r;
    return wuffs_base__u32__sat_sub(r.*.max_excl_y, r.*.min_incl_y);
}
pub const struct_wuffs_base__rect_ii_u32__struct = extern struct {
    min_incl_x: u32,
    min_incl_y: u32,
    max_incl_x: u32,
    max_incl_y: u32,
    pub const wuffs_base__rect_ii_u32__is_empty = __root.wuffs_base__rect_ii_u32__is_empty;
    pub const wuffs_base__rect_ii_u32__equals = __root.wuffs_base__rect_ii_u32__equals;
    pub const wuffs_base__rect_ii_u32__intersect = __root.wuffs_base__rect_ii_u32__intersect;
    pub const wuffs_base__rect_ii_u32__unite = __root.wuffs_base__rect_ii_u32__unite;
    pub const wuffs_base__rect_ii_u32__contains = __root.wuffs_base__rect_ii_u32__contains;
    pub const wuffs_base__rect_ii_u32__contains_rect = __root.wuffs_base__rect_ii_u32__contains_rect;
    pub const empty = __root.wuffs_base__rect_ii_u32__is_empty;
    pub const equals = __root.wuffs_base__rect_ii_u32__equals;
    pub const intersect = __root.wuffs_base__rect_ii_u32__intersect;
    pub const unite = __root.wuffs_base__rect_ii_u32__unite;
    pub const contains = __root.wuffs_base__rect_ii_u32__contains;
    pub const rect = __root.wuffs_base__rect_ii_u32__contains_rect;
};
pub const wuffs_base__rect_ii_u32 = struct_wuffs_base__rect_ii_u32__struct;
pub fn wuffs_base__empty_rect_ii_u32() callconv(.c) wuffs_base__rect_ii_u32 {
    var ret: wuffs_base__rect_ii_u32 = undefined;
    _ = &ret;
    ret.min_incl_x = 0;
    ret.min_incl_y = 0;
    ret.max_incl_x = 0;
    ret.max_incl_y = 0;
    return ret;
}
pub fn wuffs_base__make_rect_ii_u32(arg_min_incl_x: u32, arg_min_incl_y: u32, arg_max_incl_x: u32, arg_max_incl_y: u32) callconv(.c) wuffs_base__rect_ii_u32 {
    var min_incl_x = arg_min_incl_x;
    _ = &min_incl_x;
    var min_incl_y = arg_min_incl_y;
    _ = &min_incl_y;
    var max_incl_x = arg_max_incl_x;
    _ = &max_incl_x;
    var max_incl_y = arg_max_incl_y;
    _ = &max_incl_y;
    var ret: wuffs_base__rect_ii_u32 = undefined;
    _ = &ret;
    ret.min_incl_x = min_incl_x;
    ret.min_incl_y = min_incl_y;
    ret.max_incl_x = max_incl_x;
    ret.max_incl_y = max_incl_y;
    return ret;
}
pub fn wuffs_base__rect_ii_u32__is_empty(arg_r: [*c]const wuffs_base__rect_ii_u32) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    return (r.*.min_incl_x > r.*.max_incl_x) or (r.*.min_incl_y > r.*.max_incl_y);
}
pub fn wuffs_base__rect_ii_u32__equals(arg_r: [*c]const wuffs_base__rect_ii_u32, arg_s: wuffs_base__rect_ii_u32) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    return ((((r.*.min_incl_x == s.min_incl_x) and (r.*.min_incl_y == s.min_incl_y)) and (r.*.max_incl_x == s.max_incl_x)) and (r.*.max_incl_y == s.max_incl_y)) or (wuffs_base__rect_ii_u32__is_empty(r) and wuffs_base__rect_ii_u32__is_empty(&s));
}
pub fn wuffs_base__rect_ii_u32__intersect(arg_r: [*c]const wuffs_base__rect_ii_u32, arg_s: wuffs_base__rect_ii_u32) callconv(.c) wuffs_base__rect_ii_u32 {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    var t: wuffs_base__rect_ii_u32 = undefined;
    _ = &t;
    t.min_incl_x = wuffs_base__u32__max(r.*.min_incl_x, s.min_incl_x);
    t.min_incl_y = wuffs_base__u32__max(r.*.min_incl_y, s.min_incl_y);
    t.max_incl_x = wuffs_base__u32__min(r.*.max_incl_x, s.max_incl_x);
    t.max_incl_y = wuffs_base__u32__min(r.*.max_incl_y, s.max_incl_y);
    return t;
}
pub fn wuffs_base__rect_ii_u32__unite(arg_r: [*c]const wuffs_base__rect_ii_u32, arg_s: wuffs_base__rect_ii_u32) callconv(.c) wuffs_base__rect_ii_u32 {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    if (wuffs_base__rect_ii_u32__is_empty(r)) {
        return s;
    }
    if (wuffs_base__rect_ii_u32__is_empty(&s)) {
        return r.*;
    }
    var t: wuffs_base__rect_ii_u32 = undefined;
    _ = &t;
    t.min_incl_x = wuffs_base__u32__min(r.*.min_incl_x, s.min_incl_x);
    t.min_incl_y = wuffs_base__u32__min(r.*.min_incl_y, s.min_incl_y);
    t.max_incl_x = wuffs_base__u32__max(r.*.max_incl_x, s.max_incl_x);
    t.max_incl_y = wuffs_base__u32__max(r.*.max_incl_y, s.max_incl_y);
    return t;
}
pub fn wuffs_base__rect_ii_u32__contains(arg_r: [*c]const wuffs_base__rect_ii_u32, arg_x: u32, arg_y: u32) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    return (((r.*.min_incl_x <= x) and (x <= r.*.max_incl_x)) and (r.*.min_incl_y <= y)) and (y <= r.*.max_incl_y);
}
pub fn wuffs_base__rect_ii_u32__contains_rect(arg_r: [*c]const wuffs_base__rect_ii_u32, arg_s: wuffs_base__rect_ii_u32) callconv(.c) bool {
    var r = arg_r;
    _ = &r;
    var s = arg_s;
    _ = &s;
    return wuffs_base__rect_ii_u32__equals(&s, wuffs_base__rect_ii_u32__intersect(r, s));
}
pub const struct_wuffs_base__more_information__struct = extern struct {
    flavor: u32,
    w: u32,
    x: u64,
    y: u64,
    z: u64,
    pub const wuffs_base__more_information__set = __root.wuffs_base__more_information__set;
    pub const wuffs_base__more_information__io_redirect__fourcc = __root.wuffs_base__more_information__io_redirect__fourcc;
    pub const wuffs_base__more_information__io_redirect__range = __root.wuffs_base__more_information__io_redirect__range;
    pub const wuffs_base__more_information__io_seek__position = __root.wuffs_base__more_information__io_seek__position;
    pub const wuffs_base__more_information__metadata__fourcc = __root.wuffs_base__more_information__metadata__fourcc;
    pub const wuffs_base__more_information__metadata_raw_passthrough__range = __root.wuffs_base__more_information__metadata_raw_passthrough__range;
    pub const wuffs_base__more_information__metadata_parsed__chrm = __root.wuffs_base__more_information__metadata_parsed__chrm;
    pub const wuffs_base__more_information__metadata_parsed__gama = __root.wuffs_base__more_information__metadata_parsed__gama;
    pub const wuffs_base__more_information__metadata_parsed__srgb = __root.wuffs_base__more_information__metadata_parsed__srgb;
    pub const set = __root.wuffs_base__more_information__set;
    pub const fourcc = __root.wuffs_base__more_information__io_redirect__fourcc;
    pub const range = __root.wuffs_base__more_information__io_redirect__range;
    pub const position = __root.wuffs_base__more_information__io_seek__position;
    pub const chrm = __root.wuffs_base__more_information__metadata_parsed__chrm;
    pub const gama = __root.wuffs_base__more_information__metadata_parsed__gama;
    pub const srgb = __root.wuffs_base__more_information__metadata_parsed__srgb;
};
pub const wuffs_base__more_information = struct_wuffs_base__more_information__struct;
pub fn wuffs_base__empty_more_information() callconv(.c) wuffs_base__more_information {
    var ret: wuffs_base__more_information = undefined;
    _ = &ret;
    ret.flavor = 0;
    ret.w = 0;
    ret.x = 0;
    ret.y = 0;
    ret.z = 0;
    return ret;
}
pub fn wuffs_base__more_information__set(arg_m: [*c]wuffs_base__more_information, arg_flavor: u32, arg_w: u32, arg_x: u64, arg_y: u64, arg_z: u64) callconv(.c) void {
    var m = arg_m;
    _ = &m;
    var flavor = arg_flavor;
    _ = &flavor;
    var w = arg_w;
    _ = &w;
    var x = arg_x;
    _ = &x;
    var y = arg_y;
    _ = &y;
    var z = arg_z;
    _ = &z;
    if (!(m != null)) {
        return;
    }
    m.*.flavor = flavor;
    m.*.w = w;
    m.*.x = x;
    m.*.y = y;
    m.*.z = z;
}
pub fn wuffs_base__more_information__io_redirect__fourcc(arg_m: [*c]const wuffs_base__more_information) callconv(.c) u32 {
    var m = arg_m;
    _ = &m;
    return m.*.w;
}
pub fn wuffs_base__more_information__io_redirect__range(arg_m: [*c]const wuffs_base__more_information) callconv(.c) wuffs_base__range_ie_u64 {
    var m = arg_m;
    _ = &m;
    var ret: wuffs_base__range_ie_u64 = undefined;
    _ = &ret;
    ret.min_incl = m.*.y;
    ret.max_excl = m.*.z;
    return ret;
}
pub fn wuffs_base__more_information__io_seek__position(arg_m: [*c]const wuffs_base__more_information) callconv(.c) u64 {
    var m = arg_m;
    _ = &m;
    return m.*.x;
}
pub fn wuffs_base__more_information__metadata__fourcc(arg_m: [*c]const wuffs_base__more_information) callconv(.c) u32 {
    var m = arg_m;
    _ = &m;
    return m.*.w;
}
pub fn wuffs_base__more_information__metadata_raw_passthrough__range(arg_m: [*c]const wuffs_base__more_information) callconv(.c) wuffs_base__range_ie_u64 {
    var m = arg_m;
    _ = &m;
    var ret: wuffs_base__range_ie_u64 = undefined;
    _ = &ret;
    ret.min_incl = m.*.y;
    ret.max_excl = m.*.z;
    return ret;
}
pub fn wuffs_base__more_information__metadata_parsed__chrm(arg_m: [*c]const wuffs_base__more_information, arg_component: u32) callconv(.c) i32 {
    var m = arg_m;
    _ = &m;
    var component = arg_component;
    _ = &component;
    var u: u32 = 0;
    _ = &u;
    while (true) {
        switch (component & @as(u32, 7)) {
            @as(u32, 0) => {
                u = @as(u32, @truncate(m.*.x >> @intCast(@as(u64, 0))));
                break;
            },
            @as(u32, 1) => {
                u = @as(u32, @truncate(m.*.x >> @intCast(@as(u64, 24))));
                break;
            },
            @as(u32, 2) => {
                u = @as(u32, @truncate((m.*.x >> @intCast(@as(u64, 48))) | (m.*.y << @intCast(@as(u64, 16)))));
                break;
            },
            @as(u32, 3) => {
                u = @as(u32, @truncate(m.*.y >> @intCast(@as(u64, 8))));
                break;
            },
            @as(u32, 4) => {
                u = @as(u32, @truncate(m.*.y >> @intCast(@as(u64, 32))));
                break;
            },
            @as(u32, 5) => {
                u = @as(u32, @truncate((m.*.y >> @intCast(@as(u64, 56))) | (m.*.z << @intCast(@as(u64, 8)))));
                break;
            },
            @as(u32, 6) => {
                u = @as(u32, @truncate(m.*.z >> @intCast(@as(u64, 16))));
                break;
            },
            @as(u32, 7) => {
                u = @as(u32, @truncate(m.*.z >> @intCast(@as(u64, 40))));
                break;
            },
            else => {},
        }
        break;
    }
    return @as(i32, @bitCast(@as(c_uint, @truncate(u << @intCast(@as(u32, 8)))))) >> @intCast(@as(c_int, 8));
}
pub fn wuffs_base__more_information__metadata_parsed__gama(arg_m: [*c]const wuffs_base__more_information) callconv(.c) u32 {
    var m = arg_m;
    _ = &m;
    return @as(u32, @truncate(m.*.x));
}
pub fn wuffs_base__more_information__metadata_parsed__srgb(arg_m: [*c]const wuffs_base__more_information) callconv(.c) u32 {
    var m = arg_m;
    _ = &m;
    return @truncate(m.*.x & @as(u64, 3));
}
pub const struct_wuffs_base__io_buffer_meta__struct = extern struct {
    wi: usize,
    ri: usize,
    pos: u64,
    closed: bool,
};
pub const wuffs_base__io_buffer_meta = struct_wuffs_base__io_buffer_meta__struct;
pub const struct_wuffs_base__io_buffer__struct = extern struct {
    data: wuffs_base__slice_u8,
    meta: wuffs_base__io_buffer_meta,
    pub const wuffs_base__io_buffer__is_valid = __root.wuffs_base__io_buffer__is_valid;
    pub const wuffs_base__io_buffer__compact = __root.wuffs_base__io_buffer__compact;
    pub const wuffs_base__io_buffer__compact_retaining = __root.wuffs_base__io_buffer__compact_retaining;
    pub const wuffs_base__io_buffer__reader_length = __root.wuffs_base__io_buffer__reader_length;
    pub const wuffs_base__io_buffer__reader_pointer = __root.wuffs_base__io_buffer__reader_pointer;
    pub const wuffs_base__io_buffer__reader_position = __root.wuffs_base__io_buffer__reader_position;
    pub const wuffs_base__io_buffer__reader_slice = __root.wuffs_base__io_buffer__reader_slice;
    pub const wuffs_base__io_buffer__writer_length = __root.wuffs_base__io_buffer__writer_length;
    pub const wuffs_base__io_buffer__writer_pointer = __root.wuffs_base__io_buffer__writer_pointer;
    pub const wuffs_base__io_buffer__writer_position = __root.wuffs_base__io_buffer__writer_position;
    pub const wuffs_base__io_buffer__writer_slice = __root.wuffs_base__io_buffer__writer_slice;
    pub const valid = __root.wuffs_base__io_buffer__is_valid;
    pub const compact = __root.wuffs_base__io_buffer__compact;
    pub const retaining = __root.wuffs_base__io_buffer__compact_retaining;
    pub const length = __root.wuffs_base__io_buffer__reader_length;
    pub const pointer = __root.wuffs_base__io_buffer__reader_pointer;
    pub const position = __root.wuffs_base__io_buffer__reader_position;
    pub const slice = __root.wuffs_base__io_buffer__reader_slice;
};
pub const wuffs_base__io_buffer = struct_wuffs_base__io_buffer__struct;
pub fn wuffs_base__make_io_buffer(arg_data: wuffs_base__slice_u8, arg_meta: wuffs_base__io_buffer_meta) callconv(.c) wuffs_base__io_buffer {
    var data = arg_data;
    _ = &data;
    var meta = arg_meta;
    _ = &meta;
    var ret: wuffs_base__io_buffer = undefined;
    _ = &ret;
    ret.data = data;
    ret.meta = meta;
    return ret;
}
pub fn wuffs_base__make_io_buffer_meta(arg_wi: usize, arg_ri: usize, arg_pos: u64, arg_closed: bool) callconv(.c) wuffs_base__io_buffer_meta {
    var wi = arg_wi;
    _ = &wi;
    var ri = arg_ri;
    _ = &ri;
    var pos = arg_pos;
    _ = &pos;
    var closed = arg_closed;
    _ = &closed;
    var ret: wuffs_base__io_buffer_meta = undefined;
    _ = &ret;
    ret.wi = wi;
    ret.ri = ri;
    ret.pos = pos;
    ret.closed = closed;
    return ret;
}
pub fn wuffs_base__ptr_u8__reader(arg_ptr: [*c]u8, arg_len: usize, arg_closed: bool) callconv(.c) wuffs_base__io_buffer {
    var ptr = arg_ptr;
    _ = &ptr;
    var len = arg_len;
    _ = &len;
    var closed = arg_closed;
    _ = &closed;
    var ret: wuffs_base__io_buffer = undefined;
    _ = &ret;
    ret.data.ptr = ptr;
    ret.data.len = len;
    ret.meta.wi = len;
    ret.meta.ri = 0;
    ret.meta.pos = 0;
    ret.meta.closed = closed;
    return ret;
}
pub fn wuffs_base__ptr_u8__writer(arg_ptr: [*c]u8, arg_len: usize) callconv(.c) wuffs_base__io_buffer {
    var ptr = arg_ptr;
    _ = &ptr;
    var len = arg_len;
    _ = &len;
    var ret: wuffs_base__io_buffer = undefined;
    _ = &ret;
    ret.data.ptr = ptr;
    ret.data.len = len;
    ret.meta.wi = 0;
    ret.meta.ri = 0;
    ret.meta.pos = 0;
    ret.meta.closed = @"false" != 0;
    return ret;
}
pub fn wuffs_base__slice_u8__reader(arg_s: wuffs_base__slice_u8, arg_closed: bool) callconv(.c) wuffs_base__io_buffer {
    var s = arg_s;
    _ = &s;
    var closed = arg_closed;
    _ = &closed;
    var ret: wuffs_base__io_buffer = undefined;
    _ = &ret;
    ret.data.ptr = s.ptr;
    ret.data.len = s.len;
    ret.meta.wi = s.len;
    ret.meta.ri = 0;
    ret.meta.pos = 0;
    ret.meta.closed = closed;
    return ret;
}
pub fn wuffs_base__slice_u8__writer(arg_s: wuffs_base__slice_u8) callconv(.c) wuffs_base__io_buffer {
    var s = arg_s;
    _ = &s;
    var ret: wuffs_base__io_buffer = undefined;
    _ = &ret;
    ret.data.ptr = s.ptr;
    ret.data.len = s.len;
    ret.meta.wi = 0;
    ret.meta.ri = 0;
    ret.meta.pos = 0;
    ret.meta.closed = @"false" != 0;
    return ret;
}
pub fn wuffs_base__empty_io_buffer() callconv(.c) wuffs_base__io_buffer {
    var ret: wuffs_base__io_buffer = undefined;
    _ = &ret;
    ret.data.ptr = null;
    ret.data.len = 0;
    ret.meta.wi = 0;
    ret.meta.ri = 0;
    ret.meta.pos = 0;
    ret.meta.closed = @"false" != 0;
    return ret;
}
pub fn wuffs_base__empty_io_buffer_meta() callconv(.c) wuffs_base__io_buffer_meta {
    var ret: wuffs_base__io_buffer_meta = undefined;
    _ = &ret;
    ret.wi = 0;
    ret.ri = 0;
    ret.pos = 0;
    ret.closed = @"false" != 0;
    return ret;
}
pub fn wuffs_base__io_buffer__is_valid(arg_buf: [*c]const wuffs_base__io_buffer) callconv(.c) bool {
    var buf = arg_buf;
    _ = &buf;
    if (buf != null) {
        if (buf.*.data.ptr != null) {
            return (buf.*.meta.ri <= buf.*.meta.wi) and (buf.*.meta.wi <= buf.*.data.len);
        } else {
            return ((buf.*.meta.ri == @as(usize, 0)) and (buf.*.meta.wi == @as(usize, 0))) and (buf.*.data.len == @as(usize, 0));
        }
    }
    return @"false" != 0;
}
pub fn wuffs_base__io_buffer__compact(arg_buf: [*c]wuffs_base__io_buffer) callconv(.c) usize {
    var buf = arg_buf;
    _ = &buf;
    if (!(buf != null) or (buf.*.meta.ri == @as(usize, 0))) {
        return 0;
    }
    var old_ri: usize = buf.*.meta.ri;
    _ = &old_ri;
    buf.*.meta.pos = wuffs_base__u64__sat_add(buf.*.meta.pos, buf.*.meta.ri);
    var new_wi: usize = buf.*.meta.wi -% buf.*.meta.ri;
    _ = &new_wi;
    if (new_wi != @as(usize, 0)) {
        _ = memmove(@ptrCast(@alignCast(buf.*.data.ptr)), @ptrCast(@alignCast(buf.*.data.ptr + buf.*.meta.ri)), new_wi);
    }
    buf.*.meta.wi = new_wi;
    buf.*.meta.ri = 0;
    return old_ri;
}
pub fn wuffs_base__io_buffer__compact_retaining(arg_buf: [*c]wuffs_base__io_buffer, arg_history_retain_length: u64) callconv(.c) usize {
    var buf = arg_buf;
    _ = &buf;
    var history_retain_length = arg_history_retain_length;
    _ = &history_retain_length;
    if (!(buf != null) or (buf.*.meta.ri == @as(usize, 0))) {
        return 0;
    }
    var old_ri: usize = buf.*.meta.ri;
    _ = &old_ri;
    var new_ri: usize = @truncate(wuffs_base__u64__min(old_ri, history_retain_length));
    _ = &new_ri;
    var memmove_start: usize = old_ri -% new_ri;
    _ = &memmove_start;
    buf.*.meta.pos = wuffs_base__u64__sat_add(buf.*.meta.pos, memmove_start);
    var new_wi: usize = buf.*.meta.wi -% memmove_start;
    _ = &new_wi;
    if ((new_wi != @as(usize, 0)) and (memmove_start != @as(usize, 0))) {
        _ = memmove(@ptrCast(@alignCast(buf.*.data.ptr)), @ptrCast(@alignCast(buf.*.data.ptr + memmove_start)), new_wi);
    }
    buf.*.meta.wi = new_wi;
    buf.*.meta.ri = new_ri;
    return memmove_start;
}
pub fn wuffs_base__io_buffer__reader_length(arg_buf: [*c]const wuffs_base__io_buffer) callconv(.c) usize {
    var buf = arg_buf;
    _ = &buf;
    return if (buf != null) buf.*.meta.wi -% buf.*.meta.ri else @as(usize, 0);
}
pub fn wuffs_base__io_buffer__reader_pointer(arg_buf: [*c]const wuffs_base__io_buffer) callconv(.c) [*c]u8 {
    var buf = arg_buf;
    _ = &buf;
    return @ptrCast(@alignCast(if ((buf != null) and (buf.*.data.ptr != null)) @as(?*anyopaque, @ptrCast(@alignCast(buf.*.data.ptr + buf.*.meta.ri))) else @as(?*anyopaque, null)));
}
pub fn wuffs_base__io_buffer__reader_position(arg_buf: [*c]const wuffs_base__io_buffer) callconv(.c) u64 {
    var buf = arg_buf;
    _ = &buf;
    return if (buf != null) wuffs_base__u64__sat_add(buf.*.meta.pos, buf.*.meta.ri) else @as(u64, 0);
}
pub fn wuffs_base__io_buffer__reader_slice(arg_buf: [*c]const wuffs_base__io_buffer) callconv(.c) wuffs_base__slice_u8 {
    var buf = arg_buf;
    _ = &buf;
    return if ((buf != null) and (buf.*.data.ptr != null)) wuffs_base__make_slice_u8(buf.*.data.ptr + buf.*.meta.ri, buf.*.meta.wi -% buf.*.meta.ri) else wuffs_base__empty_slice_u8();
}
pub fn wuffs_base__io_buffer__writer_length(arg_buf: [*c]const wuffs_base__io_buffer) callconv(.c) usize {
    var buf = arg_buf;
    _ = &buf;
    return if (buf != null) buf.*.data.len -% buf.*.meta.wi else @as(usize, 0);
}
pub fn wuffs_base__io_buffer__writer_pointer(arg_buf: [*c]const wuffs_base__io_buffer) callconv(.c) [*c]u8 {
    var buf = arg_buf;
    _ = &buf;
    return @ptrCast(@alignCast(if ((buf != null) and (buf.*.data.ptr != null)) @as(?*anyopaque, @ptrCast(@alignCast(buf.*.data.ptr + buf.*.meta.wi))) else @as(?*anyopaque, null)));
}
pub fn wuffs_base__io_buffer__writer_position(arg_buf: [*c]const wuffs_base__io_buffer) callconv(.c) u64 {
    var buf = arg_buf;
    _ = &buf;
    return if (buf != null) wuffs_base__u64__sat_add(buf.*.meta.pos, buf.*.meta.wi) else @as(u64, 0);
}
pub fn wuffs_base__io_buffer__writer_slice(arg_buf: [*c]const wuffs_base__io_buffer) callconv(.c) wuffs_base__slice_u8 {
    var buf = arg_buf;
    _ = &buf;
    return if ((buf != null) and (buf.*.data.ptr != null)) wuffs_base__make_slice_u8(buf.*.data.ptr + buf.*.meta.wi, buf.*.data.len -% buf.*.meta.wi) else wuffs_base__empty_slice_u8();
}
pub const struct_wuffs_base__token__struct = extern struct {
    repr: u64,
    pub const wuffs_base__token__value = __root.wuffs_base__token__value;
    pub const wuffs_base__token__value_extension = __root.wuffs_base__token__value_extension;
    pub const wuffs_base__token__value_major = __root.wuffs_base__token__value_major;
    pub const wuffs_base__token__value_base_category = __root.wuffs_base__token__value_base_category;
    pub const wuffs_base__token__value_minor = __root.wuffs_base__token__value_minor;
    pub const wuffs_base__token__value_base_detail = __root.wuffs_base__token__value_base_detail;
    pub const wuffs_base__token__value_base_detail__sign_extended = __root.wuffs_base__token__value_base_detail__sign_extended;
    pub const wuffs_base__token__continued = __root.wuffs_base__token__continued;
    pub const wuffs_base__token__length = __root.wuffs_base__token__length;
    pub const wuffs_base__strip_const_from_token_ptr = __root.wuffs_base__strip_const_from_token_ptr;
    pub const wuffs_base__make_slice_token = __root.wuffs_base__make_slice_token;
    pub const value = __root.wuffs_base__token__value;
    pub const extension = __root.wuffs_base__token__value_extension;
    pub const major = __root.wuffs_base__token__value_major;
    pub const category = __root.wuffs_base__token__value_base_category;
    pub const minor = __root.wuffs_base__token__value_minor;
    pub const detail = __root.wuffs_base__token__value_base_detail;
    pub const extended = __root.wuffs_base__token__value_base_detail__sign_extended;
    pub const continued = __root.wuffs_base__token__continued;
    pub const length = __root.wuffs_base__token__length;
    pub const ptr = __root.wuffs_base__strip_const_from_token_ptr;
    pub const token = __root.wuffs_base__make_slice_token;
};
pub const wuffs_base__token = struct_wuffs_base__token__struct;
pub fn wuffs_base__make_token(arg_repr: u64) callconv(.c) wuffs_base__token {
    var repr = arg_repr;
    _ = &repr;
    var ret: wuffs_base__token = undefined;
    _ = &ret;
    ret.repr = repr;
    return ret;
}
pub fn wuffs_base__token__value(arg_t: [*c]const wuffs_base__token) callconv(.c) i64 {
    var t = arg_t;
    _ = &t;
    return @as(i64, @bitCast(@as(c_ulonglong, @truncate(t.*.repr)))) >> @intCast(@as(i64, WUFFS_BASE__TOKEN__VALUE__SHIFT));
}
pub fn wuffs_base__token__value_extension(arg_t: [*c]const wuffs_base__token) callconv(.c) i64 {
    var t = arg_t;
    _ = &t;
    return ~@as(i64, @bitCast(@as(c_ulonglong, @truncate(t.*.repr)))) >> @intCast(@as(i64, WUFFS_BASE__TOKEN__VALUE_EXTENSION__SHIFT));
}
pub fn wuffs_base__token__value_major(arg_t: [*c]const wuffs_base__token) callconv(.c) i64 {
    var t = arg_t;
    _ = &t;
    return @as(i64, @bitCast(@as(c_ulonglong, @truncate(t.*.repr)))) >> @intCast(@as(i64, WUFFS_BASE__TOKEN__VALUE_MAJOR__SHIFT));
}
pub fn wuffs_base__token__value_base_category(arg_t: [*c]const wuffs_base__token) callconv(.c) i64 {
    var t = arg_t;
    _ = &t;
    return @as(i64, @bitCast(@as(c_ulonglong, @truncate(t.*.repr)))) >> @intCast(@as(i64, WUFFS_BASE__TOKEN__VALUE_BASE_CATEGORY__SHIFT));
}
pub fn wuffs_base__token__value_minor(arg_t: [*c]const wuffs_base__token) callconv(.c) u64 {
    var t = arg_t;
    _ = &t;
    return (t.*.repr >> @intCast(@as(u64, WUFFS_BASE__TOKEN__VALUE_MINOR__SHIFT))) & @as(u64, 33554431);
}
pub fn wuffs_base__token__value_base_detail(arg_t: [*c]const wuffs_base__token) callconv(.c) u64 {
    var t = arg_t;
    _ = &t;
    return (t.*.repr >> @intCast(@as(u64, WUFFS_BASE__TOKEN__VALUE_BASE_DETAIL__SHIFT))) & @as(u64, 2097151);
}
pub fn wuffs_base__token__value_base_detail__sign_extended(arg_t: [*c]const wuffs_base__token) callconv(.c) i64 {
    var t = arg_t;
    _ = &t;
    var u: u64 = t.*.repr << @intCast(@as(u64, @bitCast(@as(c_longlong, @as(c_int, 43) - WUFFS_BASE__TOKEN__VALUE_BASE_DETAIL__SHIFT))));
    _ = &u;
    return @as(i64, @bitCast(@as(c_ulonglong, @truncate(u)))) >> @intCast(@as(i64, 43));
}
pub fn wuffs_base__token__continued(arg_t: [*c]const wuffs_base__token) callconv(.c) bool {
    var t = arg_t;
    _ = &t;
    return (t.*.repr & @as(u64, 65536)) != 0;
}
pub fn wuffs_base__token__length(arg_t: [*c]const wuffs_base__token) callconv(.c) u64 {
    var t = arg_t;
    _ = &t;
    return (t.*.repr >> @intCast(@as(u64, WUFFS_BASE__TOKEN__LENGTH__SHIFT))) & @as(u64, 65535);
}
pub fn wuffs_base__strip_const_from_token_ptr(arg_ptr: [*c]const wuffs_base__token) callconv(.c) [*c]wuffs_base__token {
    var ptr = arg_ptr;
    _ = &ptr;
    return @ptrCast(@alignCast(@constCast(ptr)));
}
pub const wuffs_base__slice_token = extern struct {
    ptr: [*c]wuffs_base__token,
    len: usize,
    pub const wuffs_base__make_token_buffer = __root.wuffs_base__make_token_buffer;
    pub const wuffs_base__slice_token__reader = __root.wuffs_base__slice_token__reader;
    pub const wuffs_base__slice_token__writer = __root.wuffs_base__slice_token__writer;
    pub const buffer = __root.wuffs_base__make_token_buffer;
    pub const reader = __root.wuffs_base__slice_token__reader;
    pub const writer = __root.wuffs_base__slice_token__writer;
};
pub fn wuffs_base__make_slice_token(arg_ptr: [*c]wuffs_base__token, arg_len: usize) callconv(.c) wuffs_base__slice_token {
    var ptr = arg_ptr;
    _ = &ptr;
    var len = arg_len;
    _ = &len;
    var ret: wuffs_base__slice_token = undefined;
    _ = &ret;
    ret.ptr = ptr;
    ret.len = len;
    return ret;
}
pub fn wuffs_base__empty_slice_token() callconv(.c) wuffs_base__slice_token {
    var ret: wuffs_base__slice_token = undefined;
    _ = &ret;
    ret.ptr = null;
    ret.len = 0;
    return ret;
}
pub const struct_wuffs_base__token_buffer_meta__struct = extern struct {
    wi: usize,
    ri: usize,
    pos: u64,
    closed: bool,
};
pub const wuffs_base__token_buffer_meta = struct_wuffs_base__token_buffer_meta__struct;
pub const struct_wuffs_base__token_buffer__struct = extern struct {
    data: wuffs_base__slice_token,
    meta: wuffs_base__token_buffer_meta,
    pub const wuffs_base__token_buffer__is_valid = __root.wuffs_base__token_buffer__is_valid;
    pub const wuffs_base__token_buffer__compact = __root.wuffs_base__token_buffer__compact;
    pub const wuffs_base__token_buffer__compact_retaining = __root.wuffs_base__token_buffer__compact_retaining;
    pub const wuffs_base__token_buffer__reader_length = __root.wuffs_base__token_buffer__reader_length;
    pub const wuffs_base__token_buffer__reader_pointer = __root.wuffs_base__token_buffer__reader_pointer;
    pub const wuffs_base__token_buffer__reader_slice = __root.wuffs_base__token_buffer__reader_slice;
    pub const wuffs_base__token_buffer__reader_token_position = __root.wuffs_base__token_buffer__reader_token_position;
    pub const wuffs_base__token_buffer__writer_length = __root.wuffs_base__token_buffer__writer_length;
    pub const wuffs_base__token_buffer__writer_pointer = __root.wuffs_base__token_buffer__writer_pointer;
    pub const wuffs_base__token_buffer__writer_slice = __root.wuffs_base__token_buffer__writer_slice;
    pub const wuffs_base__token_buffer__writer_token_position = __root.wuffs_base__token_buffer__writer_token_position;
    pub const valid = __root.wuffs_base__token_buffer__is_valid;
    pub const compact = __root.wuffs_base__token_buffer__compact;
    pub const retaining = __root.wuffs_base__token_buffer__compact_retaining;
    pub const length = __root.wuffs_base__token_buffer__reader_length;
    pub const pointer = __root.wuffs_base__token_buffer__reader_pointer;
    pub const slice = __root.wuffs_base__token_buffer__reader_slice;
    pub const position = __root.wuffs_base__token_buffer__reader_token_position;
};
pub const wuffs_base__token_buffer = struct_wuffs_base__token_buffer__struct;
pub fn wuffs_base__make_token_buffer(arg_data: wuffs_base__slice_token, arg_meta: wuffs_base__token_buffer_meta) callconv(.c) wuffs_base__token_buffer {
    var data = arg_data;
    _ = &data;
    var meta = arg_meta;
    _ = &meta;
    var ret: wuffs_base__token_buffer = undefined;
    _ = &ret;
    ret.data = data;
    ret.meta = meta;
    return ret;
}
pub fn wuffs_base__make_token_buffer_meta(arg_wi: usize, arg_ri: usize, arg_pos: u64, arg_closed: bool) callconv(.c) wuffs_base__token_buffer_meta {
    var wi = arg_wi;
    _ = &wi;
    var ri = arg_ri;
    _ = &ri;
    var pos = arg_pos;
    _ = &pos;
    var closed = arg_closed;
    _ = &closed;
    var ret: wuffs_base__token_buffer_meta = undefined;
    _ = &ret;
    ret.wi = wi;
    ret.ri = ri;
    ret.pos = pos;
    ret.closed = closed;
    return ret;
}
pub fn wuffs_base__slice_token__reader(arg_s: wuffs_base__slice_token, arg_closed: bool) callconv(.c) wuffs_base__token_buffer {
    var s = arg_s;
    _ = &s;
    var closed = arg_closed;
    _ = &closed;
    var ret: wuffs_base__token_buffer = undefined;
    _ = &ret;
    ret.data.ptr = s.ptr;
    ret.data.len = s.len;
    ret.meta.wi = s.len;
    ret.meta.ri = 0;
    ret.meta.pos = 0;
    ret.meta.closed = closed;
    return ret;
}
pub fn wuffs_base__slice_token__writer(arg_s: wuffs_base__slice_token) callconv(.c) wuffs_base__token_buffer {
    var s = arg_s;
    _ = &s;
    var ret: wuffs_base__token_buffer = undefined;
    _ = &ret;
    ret.data.ptr = s.ptr;
    ret.data.len = s.len;
    ret.meta.wi = 0;
    ret.meta.ri = 0;
    ret.meta.pos = 0;
    ret.meta.closed = @"false" != 0;
    return ret;
}
pub fn wuffs_base__empty_token_buffer() callconv(.c) wuffs_base__token_buffer {
    var ret: wuffs_base__token_buffer = undefined;
    _ = &ret;
    ret.data.ptr = null;
    ret.data.len = 0;
    ret.meta.wi = 0;
    ret.meta.ri = 0;
    ret.meta.pos = 0;
    ret.meta.closed = @"false" != 0;
    return ret;
}
pub fn wuffs_base__empty_token_buffer_meta() callconv(.c) wuffs_base__token_buffer_meta {
    var ret: wuffs_base__token_buffer_meta = undefined;
    _ = &ret;
    ret.wi = 0;
    ret.ri = 0;
    ret.pos = 0;
    ret.closed = @"false" != 0;
    return ret;
}
pub fn wuffs_base__token_buffer__is_valid(arg_buf: [*c]const wuffs_base__token_buffer) callconv(.c) bool {
    var buf = arg_buf;
    _ = &buf;
    if (buf != null) {
        if (buf.*.data.ptr != null) {
            return (buf.*.meta.ri <= buf.*.meta.wi) and (buf.*.meta.wi <= buf.*.data.len);
        } else {
            return ((buf.*.meta.ri == @as(usize, 0)) and (buf.*.meta.wi == @as(usize, 0))) and (buf.*.data.len == @as(usize, 0));
        }
    }
    return @"false" != 0;
}
pub fn wuffs_base__token_buffer__compact(arg_buf: [*c]wuffs_base__token_buffer) callconv(.c) usize {
    var buf = arg_buf;
    _ = &buf;
    if (!(buf != null) or (buf.*.meta.ri == @as(usize, 0))) {
        return 0;
    }
    var old_ri: usize = buf.*.meta.ri;
    _ = &old_ri;
    buf.*.meta.pos = wuffs_base__u64__sat_add(buf.*.meta.pos, buf.*.meta.ri);
    var new_wi: usize = buf.*.meta.wi -% buf.*.meta.ri;
    _ = &new_wi;
    if (new_wi != @as(usize, 0)) {
        _ = memmove(@ptrCast(@alignCast(buf.*.data.ptr)), @ptrCast(@alignCast(buf.*.data.ptr + buf.*.meta.ri)), new_wi *% @sizeOf(wuffs_base__token));
    }
    buf.*.meta.wi = new_wi;
    buf.*.meta.ri = 0;
    return old_ri;
}
pub fn wuffs_base__token_buffer__compact_retaining(arg_buf: [*c]wuffs_base__token_buffer, arg_history_retain_length: u64) callconv(.c) usize {
    var buf = arg_buf;
    _ = &buf;
    var history_retain_length = arg_history_retain_length;
    _ = &history_retain_length;
    if (!(buf != null) or (buf.*.meta.ri == @as(usize, 0))) {
        return 0;
    }
    var old_ri: usize = buf.*.meta.ri;
    _ = &old_ri;
    var new_ri: usize = @truncate(wuffs_base__u64__min(old_ri, history_retain_length));
    _ = &new_ri;
    var memmove_start: usize = old_ri -% new_ri;
    _ = &memmove_start;
    buf.*.meta.pos = wuffs_base__u64__sat_add(buf.*.meta.pos, memmove_start);
    var new_wi: usize = buf.*.meta.wi -% memmove_start;
    _ = &new_wi;
    if ((new_wi != @as(usize, 0)) and (memmove_start != @as(usize, 0))) {
        _ = memmove(@ptrCast(@alignCast(buf.*.data.ptr)), @ptrCast(@alignCast(buf.*.data.ptr + memmove_start)), new_wi *% @sizeOf(wuffs_base__token));
    }
    buf.*.meta.wi = new_wi;
    buf.*.meta.ri = new_ri;
    return memmove_start;
}
pub fn wuffs_base__token_buffer__reader_length(arg_buf: [*c]const wuffs_base__token_buffer) callconv(.c) u64 {
    var buf = arg_buf;
    _ = &buf;
    return if (buf != null) buf.*.meta.wi -% buf.*.meta.ri else @as(usize, 0);
}
pub fn wuffs_base__token_buffer__reader_pointer(arg_buf: [*c]const wuffs_base__token_buffer) callconv(.c) [*c]wuffs_base__token {
    var buf = arg_buf;
    _ = &buf;
    return @ptrCast(@alignCast(if (buf != null) @as(?*anyopaque, @ptrCast(@alignCast(buf.*.data.ptr + buf.*.meta.ri))) else @as(?*anyopaque, null)));
}
pub fn wuffs_base__token_buffer__reader_slice(arg_buf: [*c]const wuffs_base__token_buffer) callconv(.c) wuffs_base__slice_token {
    var buf = arg_buf;
    _ = &buf;
    return if (buf != null) wuffs_base__make_slice_token(buf.*.data.ptr + buf.*.meta.ri, buf.*.meta.wi -% buf.*.meta.ri) else wuffs_base__empty_slice_token();
}
pub fn wuffs_base__token_buffer__reader_token_position(arg_buf: [*c]const wuffs_base__token_buffer) callconv(.c) u64 {
    var buf = arg_buf;
    _ = &buf;
    return if (buf != null) wuffs_base__u64__sat_add(buf.*.meta.pos, buf.*.meta.ri) else @as(u64, 0);
}
pub fn wuffs_base__token_buffer__writer_length(arg_buf: [*c]const wuffs_base__token_buffer) callconv(.c) u64 {
    var buf = arg_buf;
    _ = &buf;
    return if (buf != null) buf.*.data.len -% buf.*.meta.wi else @as(usize, 0);
}
pub fn wuffs_base__token_buffer__writer_pointer(arg_buf: [*c]const wuffs_base__token_buffer) callconv(.c) [*c]wuffs_base__token {
    var buf = arg_buf;
    _ = &buf;
    return @ptrCast(@alignCast(if (buf != null) @as(?*anyopaque, @ptrCast(@alignCast(buf.*.data.ptr + buf.*.meta.wi))) else @as(?*anyopaque, null)));
}
pub fn wuffs_base__token_buffer__writer_slice(arg_buf: [*c]const wuffs_base__token_buffer) callconv(.c) wuffs_base__slice_token {
    var buf = arg_buf;
    _ = &buf;
    return if (buf != null) wuffs_base__make_slice_token(buf.*.data.ptr + buf.*.meta.wi, buf.*.data.len -% buf.*.meta.wi) else wuffs_base__empty_slice_token();
}
pub fn wuffs_base__token_buffer__writer_token_position(arg_buf: [*c]const wuffs_base__token_buffer) callconv(.c) u64 {
    var buf = arg_buf;
    _ = &buf;
    return if (buf != null) wuffs_base__u64__sat_add(buf.*.meta.pos, buf.*.meta.wi) else @as(u64, 0);
}
pub fn wuffs_base__malloc_slice_u8(arg_malloc_func: ?*const fn (usize) callconv(.c) ?*anyopaque, arg_num_u8: u64) callconv(.c) wuffs_base__slice_u8 {
    var malloc_func = arg_malloc_func;
    _ = &malloc_func;
    var num_u8 = arg_num_u8;
    _ = &num_u8;
    if (((malloc_func != null) and (num_u8 != 0)) and (num_u8 <= @as(u64, __SIZE_MAX__ / @sizeOf(u8)))) {
        var p: ?*anyopaque = malloc_func.?(@truncate(num_u8 *% @as(u64, @sizeOf(u8))));
        _ = &p;
        if (p != null) {
            return wuffs_base__make_slice_u8(@ptrCast(@alignCast(p)), @truncate(num_u8));
        }
    }
    return wuffs_base__empty_slice_u8();
}
pub fn wuffs_base__malloc_slice_u16(arg_malloc_func: ?*const fn (usize) callconv(.c) ?*anyopaque, arg_num_u16: u64) callconv(.c) wuffs_base__slice_u16 {
    var malloc_func = arg_malloc_func;
    _ = &malloc_func;
    var num_u16 = arg_num_u16;
    _ = &num_u16;
    if (((malloc_func != null) and (num_u16 != 0)) and (num_u16 <= @as(u64, __SIZE_MAX__ / @sizeOf(u16)))) {
        var p: ?*anyopaque = malloc_func.?(@truncate(num_u16 *% @as(u64, @sizeOf(u16))));
        _ = &p;
        if (p != null) {
            return wuffs_base__make_slice_u16(@ptrCast(@alignCast(p)), @truncate(num_u16));
        }
    }
    return wuffs_base__empty_slice_u16();
}
pub fn wuffs_base__malloc_slice_u32(arg_malloc_func: ?*const fn (usize) callconv(.c) ?*anyopaque, arg_num_u32: u64) callconv(.c) wuffs_base__slice_u32 {
    var malloc_func = arg_malloc_func;
    _ = &malloc_func;
    var num_u32 = arg_num_u32;
    _ = &num_u32;
    if (((malloc_func != null) and (num_u32 != 0)) and (num_u32 <= @as(u64, __SIZE_MAX__ / @sizeOf(u32)))) {
        var p: ?*anyopaque = malloc_func.?(@truncate(num_u32 *% @as(u64, @sizeOf(u32))));
        _ = &p;
        if (p != null) {
            return wuffs_base__make_slice_u32(@ptrCast(@alignCast(p)), @truncate(num_u32));
        }
    }
    return wuffs_base__empty_slice_u32();
}
pub fn wuffs_base__malloc_slice_u64(arg_malloc_func: ?*const fn (usize) callconv(.c) ?*anyopaque, arg_num_u64: u64) callconv(.c) wuffs_base__slice_u64 {
    var malloc_func = arg_malloc_func;
    _ = &malloc_func;
    var num_u64 = arg_num_u64;
    _ = &num_u64;
    if (((malloc_func != null) and (num_u64 != 0)) and (num_u64 <= @as(u64, __SIZE_MAX__ / @sizeOf(u64)))) {
        var p: ?*anyopaque = malloc_func.?(@truncate(num_u64 *% @as(u64, @sizeOf(u64))));
        _ = &p;
        if (p != null) {
            return wuffs_base__make_slice_u64(@ptrCast(@alignCast(p)), @truncate(num_u64));
        }
    }
    return wuffs_base__empty_slice_u64();
}
pub const wuffs_base__color_u32_argb_premul = u32;
pub fn wuffs_base__color_u32_argb_premul__is_valid(arg_c: wuffs_base__color_u32_argb_premul) callconv(.c) bool {
    var c = arg_c;
    _ = &c;
    var a: u32 = @as(wuffs_base__color_u32_argb_premul, 255) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 24)));
    _ = &a;
    var r: u32 = @as(wuffs_base__color_u32_argb_premul, 255) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 16)));
    _ = &r;
    var g: u32 = @as(wuffs_base__color_u32_argb_premul, 255) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 8)));
    _ = &g;
    var b: u32 = @as(wuffs_base__color_u32_argb_premul, 255) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 0)));
    _ = &b;
    return ((a >= r) and (a >= g)) and (a >= b);
}
pub fn wuffs_base__color_u32_argb_premul__as__color_u16_rgb_565(arg_c: wuffs_base__color_u32_argb_premul) callconv(.c) u16 {
    var c = arg_c;
    _ = &c;
    var r5: u32 = @as(wuffs_base__color_u32_argb_premul, 63488) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 8)));
    _ = &r5;
    var g6: u32 = @as(wuffs_base__color_u32_argb_premul, 2016) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 5)));
    _ = &g6;
    var b5: u32 = @as(wuffs_base__color_u32_argb_premul, 31) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 3)));
    _ = &b5;
    return @truncate((r5 | g6) | b5);
}
pub fn wuffs_base__color_u16_rgb_565__as__color_u32_argb_premul(arg_rgb_565: u16) callconv(.c) wuffs_base__color_u32_argb_premul {
    var rgb_565 = arg_rgb_565;
    _ = &rgb_565;
    var b5: u32 = @bitCast(@as(c_int, @as(c_int, 31) & (@as(c_int, rgb_565) >> @intCast(@as(c_int, 0)))));
    _ = &b5;
    var b: u32 = (b5 << @intCast(@as(u32, 3))) | (b5 >> @intCast(@as(u32, 2)));
    _ = &b;
    var g6: u32 = @bitCast(@as(c_int, @as(c_int, 63) & (@as(c_int, rgb_565) >> @intCast(@as(c_int, 5)))));
    _ = &g6;
    var g: u32 = (g6 << @intCast(@as(u32, 2))) | (g6 >> @intCast(@as(u32, 4)));
    _ = &g;
    var r5: u32 = @bitCast(@as(c_int, @as(c_int, 31) & (@as(c_int, rgb_565) >> @intCast(@as(c_int, 11)))));
    _ = &r5;
    var r: u32 = (r5 << @intCast(@as(u32, 3))) | (r5 >> @intCast(@as(u32, 2)));
    _ = &r;
    return ((@as(c_uint, 4278190080) | (r << @intCast(@as(u32, 16)))) | (g << @intCast(@as(u32, 8)))) | (b << @intCast(@as(u32, 0)));
}
pub fn wuffs_base__color_u32_argb_premul__as__color_u8_gray(arg_c: wuffs_base__color_u32_argb_premul) callconv(.c) u8 {
    var c = arg_c;
    _ = &c;
    var cr: u32 = @as(wuffs_base__color_u32_argb_premul, 257) *% (@as(wuffs_base__color_u32_argb_premul, 255) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 16))));
    _ = &cr;
    var cg: u32 = @as(wuffs_base__color_u32_argb_premul, 257) *% (@as(wuffs_base__color_u32_argb_premul, 255) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 8))));
    _ = &cg;
    var cb: u32 = @as(wuffs_base__color_u32_argb_premul, 257) *% (@as(wuffs_base__color_u32_argb_premul, 255) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 0))));
    _ = &cb;
    var weighted_average: u32 = (((@as(u32, 19595) *% cr) +% (@as(u32, 38470) *% cg)) +% (@as(u32, 7471) *% cb)) +% @as(u32, 32768);
    _ = &weighted_average;
    return @truncate(weighted_average >> @intCast(@as(u32, 24)));
}
pub fn wuffs_base__color_u32_argb_premul__as__color_u16_alpha_gray_nonpremul(arg_c: wuffs_base__color_u32_argb_premul) callconv(.c) u16 {
    var c = arg_c;
    _ = &c;
    var a: u32 = @as(wuffs_base__color_u32_argb_premul, 255) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 24)));
    _ = &a;
    if (a == @as(u32, 0)) {
        return 0;
    }
    var a16: u32 = a *% @as(u32, 257);
    _ = &a16;
    var cr: u32 = @as(wuffs_base__color_u32_argb_premul, 255) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 16)));
    _ = &cr;
    cr = (cr *% @as(u32, @bitCast(@as(c_int, @as(c_int, 257) * @as(c_int, 65535))))) / a16;
    var cg: u32 = @as(wuffs_base__color_u32_argb_premul, 255) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 8)));
    _ = &cg;
    cg = (cg *% @as(u32, @bitCast(@as(c_int, @as(c_int, 257) * @as(c_int, 65535))))) / a16;
    var cb: u32 = @as(wuffs_base__color_u32_argb_premul, 255) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 0)));
    _ = &cb;
    cb = (cb *% @as(u32, @bitCast(@as(c_int, @as(c_int, 257) * @as(c_int, 65535))))) / a16;
    var weighted_average: u32 = (((@as(u32, 19595) *% cr) +% (@as(u32, 38470) *% cg)) +% (@as(u32, 7471) *% cb)) +% @as(u32, 32768);
    _ = &weighted_average;
    return @truncate((a16 & @as(u32, 65280)) | (weighted_average >> @intCast(@as(u32, 24))));
}
pub fn wuffs_base__color_u32_argb_premul__as__color_u16_gray(arg_c: wuffs_base__color_u32_argb_premul) callconv(.c) u16 {
    var c = arg_c;
    _ = &c;
    var cr: u32 = @as(wuffs_base__color_u32_argb_premul, 257) *% (@as(wuffs_base__color_u32_argb_premul, 255) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 16))));
    _ = &cr;
    var cg: u32 = @as(wuffs_base__color_u32_argb_premul, 257) *% (@as(wuffs_base__color_u32_argb_premul, 255) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 8))));
    _ = &cg;
    var cb: u32 = @as(wuffs_base__color_u32_argb_premul, 257) *% (@as(wuffs_base__color_u32_argb_premul, 255) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 0))));
    _ = &cb;
    var weighted_average: u32 = (((@as(u32, 19595) *% cr) +% (@as(u32, 38470) *% cg)) +% (@as(u32, 7471) *% cb)) +% @as(u32, 32768);
    _ = &weighted_average;
    return @truncate(weighted_average >> @intCast(@as(u32, 16)));
}
pub fn wuffs_base__color_u32_argb_nonpremul__as__color_u32_argb_premul(arg_argb_nonpremul: u32) callconv(.c) wuffs_base__color_u32_argb_premul {
    var argb_nonpremul = arg_argb_nonpremul;
    _ = &argb_nonpremul;
    var a: u32 = @as(u32, 255) & (argb_nonpremul >> @intCast(@as(u32, 24)));
    _ = &a;
    var a16: u32 = a *% @as(u32, @bitCast(@as(c_int, @as(c_int, 257) * @as(c_int, 257))));
    _ = &a16;
    var r: u32 = @as(u32, 255) & (argb_nonpremul >> @intCast(@as(u32, 16)));
    _ = &r;
    r = ((r *% a16) / @as(u32, 65535)) >> @intCast(@as(u32, 8));
    var g: u32 = @as(u32, 255) & (argb_nonpremul >> @intCast(@as(u32, 8)));
    _ = &g;
    g = ((g *% a16) / @as(u32, 65535)) >> @intCast(@as(u32, 8));
    var b: u32 = @as(u32, 255) & (argb_nonpremul >> @intCast(@as(u32, 0)));
    _ = &b;
    b = ((b *% a16) / @as(u32, 65535)) >> @intCast(@as(u32, 8));
    return (((a << @intCast(@as(u32, 24))) | (r << @intCast(@as(u32, 16)))) | (g << @intCast(@as(u32, 8)))) | (b << @intCast(@as(u32, 0)));
}
pub fn wuffs_base__color_u32_argb_premul__as__color_u32_argb_nonpremul(arg_c: wuffs_base__color_u32_argb_premul) callconv(.c) u32 {
    var c = arg_c;
    _ = &c;
    var a: u32 = @as(wuffs_base__color_u32_argb_premul, 255) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 24)));
    _ = &a;
    if (a == @as(u32, 255)) {
        return c;
    } else if (a == @as(u32, 0)) {
        return 0;
    }
    var a16: u32 = a *% @as(u32, 257);
    _ = &a16;
    var r: u32 = @as(wuffs_base__color_u32_argb_premul, 255) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 16)));
    _ = &r;
    r = ((r *% @as(u32, @bitCast(@as(c_int, @as(c_int, 257) * @as(c_int, 65535))))) / a16) >> @intCast(@as(u32, 8));
    var g: u32 = @as(wuffs_base__color_u32_argb_premul, 255) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 8)));
    _ = &g;
    g = ((g *% @as(u32, @bitCast(@as(c_int, @as(c_int, 257) * @as(c_int, 65535))))) / a16) >> @intCast(@as(u32, 8));
    var b: u32 = @as(wuffs_base__color_u32_argb_premul, 255) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 0)));
    _ = &b;
    b = ((b *% @as(u32, @bitCast(@as(c_int, @as(c_int, 257) * @as(c_int, 65535))))) / a16) >> @intCast(@as(u32, 8));
    return (((a << @intCast(@as(u32, 24))) | (r << @intCast(@as(u32, 16)))) | (g << @intCast(@as(u32, 8)))) | (b << @intCast(@as(u32, 0)));
}
pub fn wuffs_base__color_u64_argb_nonpremul__as__color_u32_argb_premul(arg_argb_nonpremul: u64) callconv(.c) wuffs_base__color_u32_argb_premul {
    var argb_nonpremul = arg_argb_nonpremul;
    _ = &argb_nonpremul;
    var a16: u32 = @as(u32, @truncate(@as(u64, 65535) & (argb_nonpremul >> @intCast(@as(u64, 48)))));
    _ = &a16;
    var r16: u32 = @as(u32, @truncate(@as(u64, 65535) & (argb_nonpremul >> @intCast(@as(u64, 32)))));
    _ = &r16;
    r16 = (r16 *% a16) / @as(u32, 65535);
    var g16: u32 = @as(u32, @truncate(@as(u64, 65535) & (argb_nonpremul >> @intCast(@as(u64, 16)))));
    _ = &g16;
    g16 = (g16 *% a16) / @as(u32, 65535);
    var b16: u32 = @as(u32, @truncate(@as(u64, 65535) & (argb_nonpremul >> @intCast(@as(u64, 0)))));
    _ = &b16;
    b16 = (b16 *% a16) / @as(u32, 65535);
    return ((((a16 >> @intCast(@as(u32, 8))) << @intCast(@as(u32, 24))) | ((r16 >> @intCast(@as(u32, 8))) << @intCast(@as(u32, 16)))) | ((g16 >> @intCast(@as(u32, 8))) << @intCast(@as(u32, 8)))) | ((b16 >> @intCast(@as(u32, 8))) << @intCast(@as(u32, 0)));
}
pub fn wuffs_base__color_u32_argb_premul__as__color_u64_argb_nonpremul(arg_c: wuffs_base__color_u32_argb_premul) callconv(.c) u64 {
    var c = arg_c;
    _ = &c;
    var a: u32 = @as(wuffs_base__color_u32_argb_premul, 255) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 24)));
    _ = &a;
    if (a == @as(u32, 255)) {
        var r16: u64 = @as(wuffs_base__color_u32_argb_premul, 257) *% (@as(wuffs_base__color_u32_argb_premul, 255) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 16))));
        _ = &r16;
        var g16: u64 = @as(wuffs_base__color_u32_argb_premul, 257) *% (@as(wuffs_base__color_u32_argb_premul, 255) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 8))));
        _ = &g16;
        var b16: u64 = @as(wuffs_base__color_u32_argb_premul, 257) *% (@as(wuffs_base__color_u32_argb_premul, 255) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 0))));
        _ = &b16;
        return ((@as(u64, 18446462598732840960) | (r16 << @intCast(@as(u64, 32)))) | (g16 << @intCast(@as(u64, 16)))) | (b16 << @intCast(@as(u64, 0)));
    } else if (a == @as(u32, 0)) {
        return 0;
    }
    var a16: u64 = a *% @as(u32, 257);
    _ = &a16;
    var r: u64 = @as(wuffs_base__color_u32_argb_premul, 255) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 16)));
    _ = &r;
    var r16: u64 = (r *% @as(u64, @bitCast(@as(c_longlong, @as(c_int, 257) * @as(c_int, 65535))))) / a16;
    _ = &r16;
    var g: u64 = @as(wuffs_base__color_u32_argb_premul, 255) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 8)));
    _ = &g;
    var g16: u64 = (g *% @as(u64, @bitCast(@as(c_longlong, @as(c_int, 257) * @as(c_int, 65535))))) / a16;
    _ = &g16;
    var b: u64 = @as(wuffs_base__color_u32_argb_premul, 255) & (c >> @intCast(@as(wuffs_base__color_u32_argb_premul, 0)));
    _ = &b;
    var b16: u64 = (b *% @as(u64, @bitCast(@as(c_longlong, @as(c_int, 257) * @as(c_int, 65535))))) / a16;
    _ = &b16;
    return (((a16 << @intCast(@as(u64, 48))) | (r16 << @intCast(@as(u64, 32)))) | (g16 << @intCast(@as(u64, 16)))) | (b16 << @intCast(@as(u64, 0)));
}
pub fn wuffs_base__color_u64_argb_premul__as__color_u8_gray(arg_argb_premul: u64) callconv(.c) u8 {
    var argb_premul = arg_argb_premul;
    _ = &argb_premul;
    var r16: u32 = @as(u32, @truncate(@as(u64, 65535) & (argb_premul >> @intCast(@as(u64, 32)))));
    _ = &r16;
    var g16: u32 = @as(u32, @truncate(@as(u64, 65535) & (argb_premul >> @intCast(@as(u64, 16)))));
    _ = &g16;
    var b16: u32 = @as(u32, @truncate(@as(u64, 65535) & (argb_premul >> @intCast(@as(u64, 0)))));
    _ = &b16;
    var weighted_average: u32 = (((@as(u32, 19595) *% r16) +% (@as(u32, 38470) *% g16)) +% (@as(u32, 7471) *% b16)) +% @as(u32, 32768);
    _ = &weighted_average;
    return @truncate(weighted_average >> @intCast(@as(u32, 24)));
}
pub fn wuffs_base__color_u64_argb_premul__as__color_u64_argb_nonpremul(arg_argb_premul: u64) callconv(.c) u64 {
    var argb_premul = arg_argb_premul;
    _ = &argb_premul;
    var a: u64 = @as(u64, 65535) & (argb_premul >> @intCast(@as(u64, 48)));
    _ = &a;
    if (a == @as(u64, 65535)) {
        return argb_premul;
    } else if (a == @as(u64, 0)) {
        return 0;
    }
    var r: u64 = @as(u64, 65535) & (argb_premul >> @intCast(@as(u64, 32)));
    _ = &r;
    r = (r *% @as(u64, 65535)) / a;
    var g: u64 = @as(u64, 65535) & (argb_premul >> @intCast(@as(u64, 16)));
    _ = &g;
    g = (g *% @as(u64, 65535)) / a;
    var b: u64 = @as(u64, 65535) & (argb_premul >> @intCast(@as(u64, 0)));
    _ = &b;
    b = (b *% @as(u64, 65535)) / a;
    return (((a << @intCast(@as(u64, 48))) | (r << @intCast(@as(u64, 32)))) | (g << @intCast(@as(u64, 16)))) | (b << @intCast(@as(u64, 0)));
}
pub fn wuffs_base__color_u64_argb_nonpremul__as__color_u8_gray(arg_argb_nonpremul: u64) callconv(.c) u8 {
    var argb_nonpremul = arg_argb_nonpremul;
    _ = &argb_nonpremul;
    var a16: u32 = @as(u32, @truncate(@as(u64, 65535) & (argb_nonpremul >> @intCast(@as(u64, 48)))));
    _ = &a16;
    var r16: u32 = @as(u32, @truncate(@as(u64, 65535) & (argb_nonpremul >> @intCast(@as(u64, 32)))));
    _ = &r16;
    r16 = (r16 *% a16) / @as(u32, 65535);
    var g16: u32 = @as(u32, @truncate(@as(u64, 65535) & (argb_nonpremul >> @intCast(@as(u64, 16)))));
    _ = &g16;
    g16 = (g16 *% a16) / @as(u32, 65535);
    var b16: u32 = @as(u32, @truncate(@as(u64, 65535) & (argb_nonpremul >> @intCast(@as(u64, 0)))));
    _ = &b16;
    b16 = (b16 *% a16) / @as(u32, 65535);
    var weighted_average: u32 = (((@as(u32, 19595) *% r16) +% (@as(u32, 38470) *% g16)) +% (@as(u32, 7471) *% b16)) +% @as(u32, 32768);
    _ = &weighted_average;
    return @truncate(weighted_average >> @intCast(@as(u32, 24)));
}
pub fn wuffs_base__color_u32__as__color_u64(arg_c: u32) callconv(.c) u64 {
    var c = arg_c;
    _ = &c;
    var a16: u64 = @as(u32, 257) *% (@as(u32, 255) & (c >> @intCast(@as(u32, 24))));
    _ = &a16;
    var r16: u64 = @as(u32, 257) *% (@as(u32, 255) & (c >> @intCast(@as(u32, 16))));
    _ = &r16;
    var g16: u64 = @as(u32, 257) *% (@as(u32, 255) & (c >> @intCast(@as(u32, 8))));
    _ = &g16;
    var b16: u64 = @as(u32, 257) *% (@as(u32, 255) & (c >> @intCast(@as(u32, 0))));
    _ = &b16;
    return (((a16 << @intCast(@as(u64, 48))) | (r16 << @intCast(@as(u64, 32)))) | (g16 << @intCast(@as(u64, 16)))) | (b16 << @intCast(@as(u64, 0)));
}
pub fn wuffs_base__color_u64__as__color_u32(arg_c: u64) callconv(.c) u32 {
    var c = arg_c;
    _ = &c;
    var a: u32 = @as(u32, @truncate(@as(u64, 255) & (c >> @intCast(@as(u64, 56)))));
    _ = &a;
    var r: u32 = @as(u32, @truncate(@as(u64, 255) & (c >> @intCast(@as(u64, 40)))));
    _ = &r;
    var g: u32 = @as(u32, @truncate(@as(u64, 255) & (c >> @intCast(@as(u64, 24)))));
    _ = &g;
    var b: u32 = @as(u32, @truncate(@as(u64, 255) & (c >> @intCast(@as(u64, 8)))));
    _ = &b;
    return (((a << @intCast(@as(u32, 24))) | (r << @intCast(@as(u32, 16)))) | (g << @intCast(@as(u32, 8)))) | (b << @intCast(@as(u32, 0)));
}
pub fn wuffs_base__color_ycc_bt601fr__as__color_u32(arg_yy: u8, arg_cb: u8, arg_cr: u8) callconv(.c) wuffs_base__color_u32_argb_premul {
    var yy = arg_yy;
    _ = &yy;
    var cb = arg_cb;
    _ = &cb;
    var cr = arg_cr;
    _ = &cr;
    var yy32: u32 = (@as(u32, yy) << @intCast(@as(u32, 16))) | @as(u32, @bitCast(@as(c_int, @as(c_int, 1) << @intCast(@as(c_int, 15)))));
    _ = &yy32;
    var cb32: u32 = @as(u32, cb) -% @as(u32, 128);
    _ = &cb32;
    var cr32: u32 = @as(u32, cr) -% @as(u32, 128);
    _ = &cr32;
    var rr32: u32 = yy32 +% (@as(u32, 91881) *% cr32);
    _ = &rr32;
    var gg32: u32 = (yy32 -% (@as(u32, 22554) *% cb32)) -% (@as(u32, 46802) *% cr32);
    _ = &gg32;
    var bb32: u32 = yy32 +% (@as(u32, 116130) *% cb32);
    _ = &bb32;
    if ((rr32 >> @intCast(@as(u32, 24))) != 0) {
        rr32 = ~@as(u32, @bitCast(@as(c_int, @as(i32, @bitCast(@as(c_uint, @truncate(rr32)))) >> @intCast(@as(c_int, 31)))));
    }
    if ((gg32 >> @intCast(@as(u32, 24))) != 0) {
        gg32 = ~@as(u32, @bitCast(@as(c_int, @as(i32, @bitCast(@as(c_uint, @truncate(gg32)))) >> @intCast(@as(c_int, 31)))));
    }
    if ((bb32 >> @intCast(@as(u32, 24))) != 0) {
        bb32 = ~@as(u32, @bitCast(@as(c_int, @as(i32, @bitCast(@as(c_uint, @truncate(bb32)))) >> @intCast(@as(c_int, 31)))));
    }
    return ((@as(c_uint, 4278190080) | ((@as(u32, 16711680) & rr32) >> @intCast(@as(u32, 0)))) | ((@as(u32, 16711680) & gg32) >> @intCast(@as(u32, 8)))) | ((@as(u32, 16711680) & bb32) >> @intCast(@as(u32, 16)));
}
pub fn wuffs_base__color_ycc_bt601fr__as__color_u32_abgr(arg_yy: u8, arg_cb: u8, arg_cr: u8) callconv(.c) u32 {
    var yy = arg_yy;
    _ = &yy;
    var cb = arg_cb;
    _ = &cb;
    var cr = arg_cr;
    _ = &cr;
    var yy32: u32 = (@as(u32, yy) << @intCast(@as(u32, 16))) | @as(u32, @bitCast(@as(c_int, @as(c_int, 1) << @intCast(@as(c_int, 15)))));
    _ = &yy32;
    var cb32: u32 = @as(u32, cb) -% @as(u32, 128);
    _ = &cb32;
    var cr32: u32 = @as(u32, cr) -% @as(u32, 128);
    _ = &cr32;
    var rr32: u32 = yy32 +% (@as(u32, 91881) *% cr32);
    _ = &rr32;
    var gg32: u32 = (yy32 -% (@as(u32, 22554) *% cb32)) -% (@as(u32, 46802) *% cr32);
    _ = &gg32;
    var bb32: u32 = yy32 +% (@as(u32, 116130) *% cb32);
    _ = &bb32;
    if ((rr32 >> @intCast(@as(u32, 24))) != 0) {
        rr32 = ~@as(u32, @bitCast(@as(c_int, @as(i32, @bitCast(@as(c_uint, @truncate(rr32)))) >> @intCast(@as(c_int, 31)))));
    }
    if ((gg32 >> @intCast(@as(u32, 24))) != 0) {
        gg32 = ~@as(u32, @bitCast(@as(c_int, @as(i32, @bitCast(@as(c_uint, @truncate(gg32)))) >> @intCast(@as(c_int, 31)))));
    }
    if ((bb32 >> @intCast(@as(u32, 24))) != 0) {
        bb32 = ~@as(u32, @bitCast(@as(c_int, @as(i32, @bitCast(@as(c_uint, @truncate(bb32)))) >> @intCast(@as(c_int, 31)))));
    }
    return ((@as(c_uint, 4278190080) | ((@as(u32, 16711680) & bb32) >> @intCast(@as(u32, 0)))) | ((@as(u32, 16711680) & gg32) >> @intCast(@as(u32, 8)))) | ((@as(u32, 16711680) & rr32) >> @intCast(@as(u32, 16)));
}
pub fn wuffs_base__color_ycc_bt601sr__as__color_u32(arg_yy: u8, arg_cb: u8, arg_cr: u8) callconv(.c) wuffs_base__color_u32_argb_premul {
    var yy = arg_yy;
    _ = &yy;
    var cb = arg_cb;
    _ = &cb;
    var cr = arg_cr;
    _ = &cr;
    var y0: i32 = (@as(i32, yy) * @as(c_int, 19077)) >> @intCast(@as(c_int, 8));
    _ = &y0;
    var rr: i32 = (@as(i32, cr) * @as(c_int, 26149)) >> @intCast(@as(c_int, 8));
    _ = &rr;
    var gb: i32 = (@as(i32, cb) * @as(c_int, 6419)) >> @intCast(@as(c_int, 8));
    _ = &gb;
    var gr: i32 = (@as(i32, cr) * @as(c_int, 13320)) >> @intCast(@as(c_int, 8));
    _ = &gr;
    var bb: i32 = (@as(i32, cb) * @as(c_int, 33050)) >> @intCast(@as(c_int, 8));
    _ = &bb;
    var r1: i32 = (y0 + rr) - @as(c_int, 14234);
    _ = &r1;
    var g1: i32 = ((y0 - gb) - gr) + @as(c_int, 8708);
    _ = &g1;
    var b1: i32 = (y0 + bb) - @as(c_int, 17685);
    _ = &b1;
    var r: u32 = if (r1 < @as(c_int, 0)) @as(c_uint, 0) else if (r1 > @as(c_int, 16320)) @as(c_uint, 255) else @as(u32, @bitCast(@as(c_int, r1))) >> @intCast(@as(u32, 6));
    _ = &r;
    var g: u32 = if (g1 < @as(c_int, 0)) @as(c_uint, 0) else if (g1 > @as(c_int, 16320)) @as(c_uint, 255) else @as(u32, @bitCast(@as(c_int, g1))) >> @intCast(@as(u32, 6));
    _ = &g;
    var b: u32 = if (b1 < @as(c_int, 0)) @as(c_uint, 0) else if (b1 > @as(c_int, 16320)) @as(c_uint, 255) else @as(u32, @bitCast(@as(c_int, b1))) >> @intCast(@as(u32, 6));
    _ = &b;
    return ((@as(c_uint, 4278190080) | (r << @intCast(@as(u32, 16)))) | (g << @intCast(@as(u32, 8)))) | b;
}
pub fn wuffs_base__color_ycc_bt601sr__as__color_u32_abgr(arg_yy: u8, arg_cb: u8, arg_cr: u8) callconv(.c) u32 {
    var yy = arg_yy;
    _ = &yy;
    var cb = arg_cb;
    _ = &cb;
    var cr = arg_cr;
    _ = &cr;
    var y0: i32 = (@as(i32, yy) * @as(c_int, 19077)) >> @intCast(@as(c_int, 8));
    _ = &y0;
    var rr: i32 = (@as(i32, cr) * @as(c_int, 26149)) >> @intCast(@as(c_int, 8));
    _ = &rr;
    var gb: i32 = (@as(i32, cb) * @as(c_int, 6419)) >> @intCast(@as(c_int, 8));
    _ = &gb;
    var gr: i32 = (@as(i32, cr) * @as(c_int, 13320)) >> @intCast(@as(c_int, 8));
    _ = &gr;
    var bb: i32 = (@as(i32, cb) * @as(c_int, 33050)) >> @intCast(@as(c_int, 8));
    _ = &bb;
    var r1: i32 = (y0 + rr) - @as(c_int, 14234);
    _ = &r1;
    var g1: i32 = ((y0 - gb) - gr) + @as(c_int, 8708);
    _ = &g1;
    var b1: i32 = (y0 + bb) - @as(c_int, 17685);
    _ = &b1;
    var r: u32 = if (r1 < @as(c_int, 0)) @as(c_uint, 0) else if (r1 > @as(c_int, 16320)) @as(c_uint, 255) else @as(u32, @bitCast(@as(c_int, r1))) >> @intCast(@as(u32, 6));
    _ = &r;
    var g: u32 = if (g1 < @as(c_int, 0)) @as(c_uint, 0) else if (g1 > @as(c_int, 16320)) @as(c_uint, 255) else @as(u32, @bitCast(@as(c_int, g1))) >> @intCast(@as(u32, 6));
    _ = &g;
    var b: u32 = if (b1 < @as(c_int, 0)) @as(c_uint, 0) else if (b1 > @as(c_int, 16320)) @as(c_uint, 255) else @as(u32, @bitCast(@as(c_int, b1))) >> @intCast(@as(u32, 6));
    _ = &b;
    return ((@as(c_uint, 4278190080) | (b << @intCast(@as(u32, 16)))) | (g << @intCast(@as(u32, 8)))) | r;
}
pub fn wuffs_base__color_swap_u32_argb_abgr(arg_u: u32) callconv(.c) u32 {
    var u = arg_u;
    _ = &u;
    var o: u32 = @truncate(@as(c_ulong, u) & @as(c_ulong, 4278255360));
    _ = &o;
    var r: u32 = @truncate(@as(c_ulong, u) & @as(c_ulong, 16711680));
    _ = &r;
    var b: u32 = @truncate(@as(c_ulong, u) & @as(c_ulong, 255));
    _ = &b;
    return (o | (r >> @intCast(@as(u32, 16)))) | (b << @intCast(@as(u32, 16)));
}
pub fn wuffs_base__color_swap_u64_argb_abgr(arg_u: u64) callconv(.c) u64 {
    var u = arg_u;
    _ = &u;
    var o: u64 = u & @as(c_ulonglong, 18446462603027742720);
    _ = &o;
    var r: u64 = u & @as(c_ulonglong, 281470681743360);
    _ = &r;
    var b: u64 = u & @as(c_ulonglong, 65535);
    _ = &b;
    return (o | (r >> @intCast(@as(u64, 32)))) | (b << @intCast(@as(u64, 32)));
}
pub const wuffs_base__pixel_blend = u8;
pub const wuffs_base__pixel_alpha_transparency = u32;
pub const wuffs_base__pixel_coloration = u32;
pub const struct_wuffs_base__pixel_format__struct = extern struct {
    repr: u32,
    pub const wuffs_base__pixel_format__is_valid = __root.wuffs_base__pixel_format__is_valid;
    pub const wuffs_base__pixel_format__bits_per_pixel = __root.wuffs_base__pixel_format__bits_per_pixel;
    pub const wuffs_base__pixel_format__default_background_color = __root.wuffs_base__pixel_format__default_background_color;
    pub const wuffs_base__pixel_format__is_direct = __root.wuffs_base__pixel_format__is_direct;
    pub const wuffs_base__pixel_format__is_indexed = __root.wuffs_base__pixel_format__is_indexed;
    pub const wuffs_base__pixel_format__is_interleaved = __root.wuffs_base__pixel_format__is_interleaved;
    pub const wuffs_base__pixel_format__is_planar = __root.wuffs_base__pixel_format__is_planar;
    pub const wuffs_base__pixel_format__coloration = __root.wuffs_base__pixel_format__coloration;
    pub const wuffs_base__pixel_format__num_planes = __root.wuffs_base__pixel_format__num_planes;
    pub const wuffs_base__pixel_format__transparency = __root.wuffs_base__pixel_format__transparency;
    pub const valid = __root.wuffs_base__pixel_format__is_valid;
    pub const pixel = __root.wuffs_base__pixel_format__bits_per_pixel;
    pub const color = __root.wuffs_base__pixel_format__default_background_color;
    pub const direct = __root.wuffs_base__pixel_format__is_direct;
    pub const indexed = __root.wuffs_base__pixel_format__is_indexed;
    pub const interleaved = __root.wuffs_base__pixel_format__is_interleaved;
    pub const planar = __root.wuffs_base__pixel_format__is_planar;
    pub const coloration = __root.wuffs_base__pixel_format__coloration;
    pub const planes = __root.wuffs_base__pixel_format__num_planes;
    pub const transparency = __root.wuffs_base__pixel_format__transparency;
};
pub const wuffs_base__pixel_format = struct_wuffs_base__pixel_format__struct;
pub fn wuffs_base__make_pixel_format(arg_repr: u32) callconv(.c) wuffs_base__pixel_format {
    var repr = arg_repr;
    _ = &repr;
    var f: wuffs_base__pixel_format = undefined;
    _ = &f;
    f.repr = repr;
    return f;
}
pub extern const wuffs_private_impl__pixel_format__bits_per_channel: [16]u32;
pub fn wuffs_base__pixel_format__is_valid(arg_f: [*c]const wuffs_base__pixel_format) callconv(.c) bool {
    var f = arg_f;
    _ = &f;
    return f.*.repr != @as(u32, 0);
}
pub fn wuffs_base__pixel_format__bits_per_pixel(arg_f: [*c]const wuffs_base__pixel_format) callconv(.c) u32 {
    var f = arg_f;
    _ = &f;
    if (((f.*.repr >> @intCast(@as(u32, 16))) & @as(u32, 3)) != @as(u32, 0)) {
        return 0;
    }
    return ((wuffs_private_impl__pixel_format__bits_per_channel[@as(u32, 15) & (f.*.repr >> @intCast(@as(u32, 0)))] +% wuffs_private_impl__pixel_format__bits_per_channel[@as(u32, 15) & (f.*.repr >> @intCast(@as(u32, 4)))]) +% wuffs_private_impl__pixel_format__bits_per_channel[@as(u32, 15) & (f.*.repr >> @intCast(@as(u32, 8)))]) +% wuffs_private_impl__pixel_format__bits_per_channel[@as(u32, 15) & (f.*.repr >> @intCast(@as(u32, 12)))];
}
pub fn wuffs_base__pixel_format__default_background_color(arg_f: [*c]const wuffs_base__pixel_format) callconv(.c) u32 {
    var f = arg_f;
    _ = &f;
    return if ((f.*.repr & @as(u32, 50331648)) == @as(u32, 0)) @as(c_uint, 4278190080) else @as(c_uint, 0);
}
pub fn wuffs_base__pixel_format__is_direct(arg_f: [*c]const wuffs_base__pixel_format) callconv(.c) bool {
    var f = arg_f;
    _ = &f;
    return ((f.*.repr >> @intCast(@as(u32, 18))) & @as(u32, 1)) == @as(u32, 0);
}
pub fn wuffs_base__pixel_format__is_indexed(arg_f: [*c]const wuffs_base__pixel_format) callconv(.c) bool {
    var f = arg_f;
    _ = &f;
    return ((f.*.repr >> @intCast(@as(u32, 18))) & @as(u32, 1)) != @as(u32, 0);
}
pub fn wuffs_base__pixel_format__is_interleaved(arg_f: [*c]const wuffs_base__pixel_format) callconv(.c) bool {
    var f = arg_f;
    _ = &f;
    return ((f.*.repr >> @intCast(@as(u32, 16))) & @as(u32, 3)) == @as(u32, 0);
}
pub fn wuffs_base__pixel_format__is_planar(arg_f: [*c]const wuffs_base__pixel_format) callconv(.c) bool {
    var f = arg_f;
    _ = &f;
    return ((f.*.repr >> @intCast(@as(u32, 16))) & @as(u32, 3)) != @as(u32, 0);
}
pub fn wuffs_base__pixel_format__coloration(arg_f: [*c]const wuffs_base__pixel_format) callconv(.c) u32 {
    var f = arg_f;
    _ = &f;
    var n: u32 = f.*.repr >> @intCast(@as(u32, 29));
    _ = &n;
    return if (n <= @as(u32, 1)) n else @as(u32, 3);
}
pub fn wuffs_base__pixel_format__num_planes(arg_f: [*c]const wuffs_base__pixel_format) callconv(.c) u32 {
    var f = arg_f;
    _ = &f;
    return ((f.*.repr >> @intCast(@as(u32, 16))) & @as(u32, 3)) +% @as(u32, 1);
}
pub fn wuffs_base__pixel_format__transparency(arg_f: [*c]const wuffs_base__pixel_format) callconv(.c) wuffs_base__pixel_alpha_transparency {
    var f = arg_f;
    _ = &f;
    return (f.*.repr >> @intCast(@as(u32, 24))) & @as(u32, 3);
}
pub const struct_wuffs_base__pixel_subsampling__struct = extern struct {
    repr: u32,
    pub const wuffs_base__pixel_subsampling__bias_x = __root.wuffs_base__pixel_subsampling__bias_x;
    pub const wuffs_base__pixel_subsampling__denominator_x = __root.wuffs_base__pixel_subsampling__denominator_x;
    pub const wuffs_base__pixel_subsampling__bias_y = __root.wuffs_base__pixel_subsampling__bias_y;
    pub const wuffs_base__pixel_subsampling__denominator_y = __root.wuffs_base__pixel_subsampling__denominator_y;
    pub const x = __root.wuffs_base__pixel_subsampling__bias_x;
    pub const y = __root.wuffs_base__pixel_subsampling__bias_y;
};
pub const wuffs_base__pixel_subsampling = struct_wuffs_base__pixel_subsampling__struct;
pub fn wuffs_base__make_pixel_subsampling(arg_repr: u32) callconv(.c) wuffs_base__pixel_subsampling {
    var repr = arg_repr;
    _ = &repr;
    var s: wuffs_base__pixel_subsampling = undefined;
    _ = &s;
    s.repr = repr;
    return s;
}
pub fn wuffs_base__pixel_subsampling__bias_x(arg_s: [*c]const wuffs_base__pixel_subsampling, arg_plane: u32) callconv(.c) u32 {
    var s = arg_s;
    _ = &s;
    var plane = arg_plane;
    _ = &plane;
    var shift: u32 = ((plane & @as(u32, 3)) *% @as(u32, 8)) +% @as(u32, 6);
    _ = &shift;
    return (s.*.repr >> @intCast(shift)) & @as(u32, 3);
}
pub fn wuffs_base__pixel_subsampling__denominator_x(arg_s: [*c]const wuffs_base__pixel_subsampling, arg_plane: u32) callconv(.c) u32 {
    var s = arg_s;
    _ = &s;
    var plane = arg_plane;
    _ = &plane;
    var shift: u32 = ((plane & @as(u32, 3)) *% @as(u32, 8)) +% @as(u32, 4);
    _ = &shift;
    return ((s.*.repr >> @intCast(shift)) & @as(u32, 3)) +% @as(u32, 1);
}
pub fn wuffs_base__pixel_subsampling__bias_y(arg_s: [*c]const wuffs_base__pixel_subsampling, arg_plane: u32) callconv(.c) u32 {
    var s = arg_s;
    _ = &s;
    var plane = arg_plane;
    _ = &plane;
    var shift: u32 = ((plane & @as(u32, 3)) *% @as(u32, 8)) +% @as(u32, 2);
    _ = &shift;
    return (s.*.repr >> @intCast(shift)) & @as(u32, 3);
}
pub fn wuffs_base__pixel_subsampling__denominator_y(arg_s: [*c]const wuffs_base__pixel_subsampling, arg_plane: u32) callconv(.c) u32 {
    var s = arg_s;
    _ = &s;
    var plane = arg_plane;
    _ = &plane;
    var shift: u32 = ((plane & @as(u32, 3)) *% @as(u32, 8)) +% @as(u32, 0);
    _ = &shift;
    return ((s.*.repr >> @intCast(shift)) & @as(u32, 3)) +% @as(u32, 1);
}
const struct_unnamed_1 = extern struct {
    pixfmt: wuffs_base__pixel_format,
    pixsub: wuffs_base__pixel_subsampling,
    width: u32,
    height: u32,
};
pub const struct_wuffs_base__pixel_config__struct = extern struct {
    private_impl: struct_unnamed_1,
    pub const wuffs_base__pixel_config__set = __root.wuffs_base__pixel_config__set;
    pub const wuffs_base__pixel_config__invalidate = __root.wuffs_base__pixel_config__invalidate;
    pub const wuffs_base__pixel_config__is_valid = __root.wuffs_base__pixel_config__is_valid;
    pub const wuffs_base__pixel_config__pixel_format = __root.wuffs_base__pixel_config__pixel_format;
    pub const wuffs_base__pixel_config__pixel_subsampling = __root.wuffs_base__pixel_config__pixel_subsampling;
    pub const wuffs_base__pixel_config__bounds = __root.wuffs_base__pixel_config__bounds;
    pub const wuffs_base__pixel_config__width = __root.wuffs_base__pixel_config__width;
    pub const wuffs_base__pixel_config__height = __root.wuffs_base__pixel_config__height;
    pub const wuffs_base__pixel_config__pixbuf_len = __root.wuffs_base__pixel_config__pixbuf_len;
    pub const set = __root.wuffs_base__pixel_config__set;
    pub const invalidate = __root.wuffs_base__pixel_config__invalidate;
    pub const valid = __root.wuffs_base__pixel_config__is_valid;
    pub const format = __root.wuffs_base__pixel_config__pixel_format;
    pub const subsampling = __root.wuffs_base__pixel_config__pixel_subsampling;
    pub const bounds = __root.wuffs_base__pixel_config__bounds;
    pub const width = __root.wuffs_base__pixel_config__width;
    pub const height = __root.wuffs_base__pixel_config__height;
    pub const len = __root.wuffs_base__pixel_config__pixbuf_len;
};
pub const wuffs_base__pixel_config = struct_wuffs_base__pixel_config__struct;
pub fn wuffs_base__null_pixel_config() callconv(.c) wuffs_base__pixel_config {
    var ret: wuffs_base__pixel_config = undefined;
    _ = &ret;
    ret.private_impl.pixfmt.repr = 0;
    ret.private_impl.pixsub.repr = 0;
    ret.private_impl.width = 0;
    ret.private_impl.height = 0;
    return ret;
}
pub fn wuffs_base__pixel_config__set(arg_c: [*c]wuffs_base__pixel_config, arg_pixfmt_repr: u32, arg_pixsub_repr: u32, arg_width: u32, arg_height: u32) callconv(.c) void {
    var c = arg_c;
    _ = &c;
    var pixfmt_repr = arg_pixfmt_repr;
    _ = &pixfmt_repr;
    var pixsub_repr = arg_pixsub_repr;
    _ = &pixsub_repr;
    var width = arg_width;
    _ = &width;
    var height = arg_height;
    _ = &height;
    if (!(c != null)) {
        return;
    }
    if (pixfmt_repr != 0) {
        while (true) {
            c.*.private_impl.pixfmt.repr = pixfmt_repr;
            c.*.private_impl.pixsub.repr = pixsub_repr;
            c.*.private_impl.width = width;
            c.*.private_impl.height = height;
            return;
        }
    }
    c.*.private_impl.pixfmt.repr = 0;
    c.*.private_impl.pixsub.repr = 0;
    c.*.private_impl.width = 0;
    c.*.private_impl.height = 0;
}
pub fn wuffs_base__pixel_config__invalidate(arg_c: [*c]wuffs_base__pixel_config) callconv(.c) void {
    var c = arg_c;
    _ = &c;
    if (c != null) {
        c.*.private_impl.pixfmt.repr = 0;
        c.*.private_impl.pixsub.repr = 0;
        c.*.private_impl.width = 0;
        c.*.private_impl.height = 0;
    }
}
pub fn wuffs_base__pixel_config__is_valid(arg_c: [*c]const wuffs_base__pixel_config) callconv(.c) bool {
    var c = arg_c;
    _ = &c;
    return (c != null) and (c.*.private_impl.pixfmt.repr != 0);
}
pub fn wuffs_base__pixel_config__pixel_format(arg_c: [*c]const wuffs_base__pixel_config) callconv(.c) wuffs_base__pixel_format {
    var c = arg_c;
    _ = &c;
    return if (c != null) c.*.private_impl.pixfmt else wuffs_base__make_pixel_format(0);
}
pub fn wuffs_base__pixel_config__pixel_subsampling(arg_c: [*c]const wuffs_base__pixel_config) callconv(.c) wuffs_base__pixel_subsampling {
    var c = arg_c;
    _ = &c;
    return if (c != null) c.*.private_impl.pixsub else wuffs_base__make_pixel_subsampling(0);
}
pub fn wuffs_base__pixel_config__bounds(arg_c: [*c]const wuffs_base__pixel_config) callconv(.c) wuffs_base__rect_ie_u32 {
    var c = arg_c;
    _ = &c;
    if (c != null) {
        var ret: wuffs_base__rect_ie_u32 = undefined;
        _ = &ret;
        ret.min_incl_x = 0;
        ret.min_incl_y = 0;
        ret.max_excl_x = c.*.private_impl.width;
        ret.max_excl_y = c.*.private_impl.height;
        return ret;
    }
    var ret: wuffs_base__rect_ie_u32 = undefined;
    _ = &ret;
    ret.min_incl_x = 0;
    ret.min_incl_y = 0;
    ret.max_excl_x = 0;
    ret.max_excl_y = 0;
    return ret;
}
pub fn wuffs_base__pixel_config__width(arg_c: [*c]const wuffs_base__pixel_config) callconv(.c) u32 {
    var c = arg_c;
    _ = &c;
    return if (c != null) c.*.private_impl.width else @as(u32, 0);
}
pub fn wuffs_base__pixel_config__height(arg_c: [*c]const wuffs_base__pixel_config) callconv(.c) u32 {
    var c = arg_c;
    _ = &c;
    return if (c != null) c.*.private_impl.height else @as(u32, 0);
}
pub fn wuffs_base__pixel_config__pixbuf_len(arg_c: [*c]const wuffs_base__pixel_config) callconv(.c) u64 {
    var c = arg_c;
    _ = &c;
    if (!(c != null)) {
        return 0;
    }
    if (wuffs_base__pixel_format__is_planar(&c.*.private_impl.pixfmt)) {
        return 0;
    }
    var bits_per_pixel: u32 = wuffs_base__pixel_format__bits_per_pixel(&c.*.private_impl.pixfmt);
    _ = &bits_per_pixel;
    if ((bits_per_pixel == @as(u32, 0)) or ((bits_per_pixel % @as(u32, 8)) != @as(u32, 0))) {
        return 0;
    }
    var bytes_per_pixel: u64 = bits_per_pixel / @as(u32, 8);
    _ = &bytes_per_pixel;
    var n: u64 = @as(u64, c.*.private_impl.width) *% @as(u64, c.*.private_impl.height);
    _ = &n;
    if (n > (@as(c_ulonglong, 18446744073709551615) / bytes_per_pixel)) {
        return 0;
    }
    n *%= bytes_per_pixel;
    if (wuffs_base__pixel_format__is_indexed(&c.*.private_impl.pixfmt)) {
        if (n > (@as(c_ulonglong, 18446744073709551615) -% @as(c_ulonglong, WUFFS_BASE__PIXEL_FORMAT__INDEXED__PALETTE_BYTE_LENGTH))) {
            return 0;
        }
        n +%= WUFFS_BASE__PIXEL_FORMAT__INDEXED__PALETTE_BYTE_LENGTH;
    }
    return n;
}
const struct_unnamed_2 = extern struct {
    first_frame_io_position: u64,
    first_frame_is_opaque: bool,
};
pub const struct_wuffs_base__image_config__struct = extern struct {
    pixcfg: wuffs_base__pixel_config,
    private_impl: struct_unnamed_2,
    pub const wuffs_base__image_config__set = __root.wuffs_base__image_config__set;
    pub const wuffs_base__image_config__invalidate = __root.wuffs_base__image_config__invalidate;
    pub const wuffs_base__image_config__is_valid = __root.wuffs_base__image_config__is_valid;
    pub const wuffs_base__image_config__first_frame_io_position = __root.wuffs_base__image_config__first_frame_io_position;
    pub const wuffs_base__image_config__first_frame_is_opaque = __root.wuffs_base__image_config__first_frame_is_opaque;
    pub const set = __root.wuffs_base__image_config__set;
    pub const invalidate = __root.wuffs_base__image_config__invalidate;
    pub const valid = __root.wuffs_base__image_config__is_valid;
    pub const position = __root.wuffs_base__image_config__first_frame_io_position;
    pub const @"opaque" = __root.wuffs_base__image_config__first_frame_is_opaque;
};
pub const wuffs_base__image_config = struct_wuffs_base__image_config__struct;
pub fn wuffs_base__null_image_config() callconv(.c) wuffs_base__image_config {
    var ret: wuffs_base__image_config = undefined;
    _ = &ret;
    ret.pixcfg = wuffs_base__null_pixel_config();
    ret.private_impl.first_frame_io_position = 0;
    ret.private_impl.first_frame_is_opaque = @"false" != 0;
    return ret;
}
pub fn wuffs_base__image_config__set(arg_c: [*c]wuffs_base__image_config, arg_pixfmt_repr: u32, arg_pixsub_repr: u32, arg_width: u32, arg_height: u32, arg_first_frame_io_position: u64, arg_first_frame_is_opaque: bool) callconv(.c) void {
    var c = arg_c;
    _ = &c;
    var pixfmt_repr = arg_pixfmt_repr;
    _ = &pixfmt_repr;
    var pixsub_repr = arg_pixsub_repr;
    _ = &pixsub_repr;
    var width = arg_width;
    _ = &width;
    var height = arg_height;
    _ = &height;
    var first_frame_io_position = arg_first_frame_io_position;
    _ = &first_frame_io_position;
    var first_frame_is_opaque = arg_first_frame_is_opaque;
    _ = &first_frame_is_opaque;
    if (!(c != null)) {
        return;
    }
    if (pixfmt_repr != 0) {
        c.*.pixcfg.private_impl.pixfmt.repr = pixfmt_repr;
        c.*.pixcfg.private_impl.pixsub.repr = pixsub_repr;
        c.*.pixcfg.private_impl.width = width;
        c.*.pixcfg.private_impl.height = height;
        c.*.private_impl.first_frame_io_position = first_frame_io_position;
        c.*.private_impl.first_frame_is_opaque = first_frame_is_opaque;
        return;
    }
    c.*.pixcfg.private_impl.pixfmt.repr = 0;
    c.*.pixcfg.private_impl.pixsub.repr = 0;
    c.*.pixcfg.private_impl.width = 0;
    c.*.pixcfg.private_impl.height = 0;
    c.*.private_impl.first_frame_io_position = 0;
    c.*.private_impl.first_frame_is_opaque = @as(c_int, 0) != 0;
}
pub fn wuffs_base__image_config__invalidate(arg_c: [*c]wuffs_base__image_config) callconv(.c) void {
    var c = arg_c;
    _ = &c;
    if (c != null) {
        c.*.pixcfg.private_impl.pixfmt.repr = 0;
        c.*.pixcfg.private_impl.pixsub.repr = 0;
        c.*.pixcfg.private_impl.width = 0;
        c.*.pixcfg.private_impl.height = 0;
        c.*.private_impl.first_frame_io_position = 0;
        c.*.private_impl.first_frame_is_opaque = @as(c_int, 0) != 0;
    }
}
pub fn wuffs_base__image_config__is_valid(arg_c: [*c]const wuffs_base__image_config) callconv(.c) bool {
    var c = arg_c;
    _ = &c;
    return (c != null) and wuffs_base__pixel_config__is_valid(&c.*.pixcfg);
}
pub fn wuffs_base__image_config__first_frame_io_position(arg_c: [*c]const wuffs_base__image_config) callconv(.c) u64 {
    var c = arg_c;
    _ = &c;
    return if (c != null) c.*.private_impl.first_frame_io_position else @as(u64, 0);
}
pub fn wuffs_base__image_config__first_frame_is_opaque(arg_c: [*c]const wuffs_base__image_config) callconv(.c) bool {
    var c = arg_c;
    _ = &c;
    return (if (c != null) @as(c_int, @intFromBool(c.*.private_impl.first_frame_is_opaque)) else @"false") != 0;
}
pub const wuffs_base__animation_disposal = u8;
const struct_unnamed_3 = extern struct {
    bounds: wuffs_base__rect_ie_u32,
    duration: wuffs_base__flicks,
    index: u64,
    io_position: u64,
    disposal: wuffs_base__animation_disposal,
    opaque_within_bounds: bool,
    overwrite_instead_of_blend: bool,
    background_color: wuffs_base__color_u32_argb_premul,
};
pub const struct_wuffs_base__frame_config__struct = extern struct {
    private_impl: struct_unnamed_3,
    pub const wuffs_base__frame_config__set = __root.wuffs_base__frame_config__set;
    pub const wuffs_base__frame_config__bounds = __root.wuffs_base__frame_config__bounds;
    pub const wuffs_base__frame_config__width = __root.wuffs_base__frame_config__width;
    pub const wuffs_base__frame_config__height = __root.wuffs_base__frame_config__height;
    pub const wuffs_base__frame_config__duration = __root.wuffs_base__frame_config__duration;
    pub const wuffs_base__frame_config__index = __root.wuffs_base__frame_config__index;
    pub const wuffs_base__frame_config__io_position = __root.wuffs_base__frame_config__io_position;
    pub const wuffs_base__frame_config__disposal = __root.wuffs_base__frame_config__disposal;
    pub const wuffs_base__frame_config__opaque_within_bounds = __root.wuffs_base__frame_config__opaque_within_bounds;
    pub const wuffs_base__frame_config__overwrite_instead_of_blend = __root.wuffs_base__frame_config__overwrite_instead_of_blend;
    pub const wuffs_base__frame_config__background_color = __root.wuffs_base__frame_config__background_color;
    pub const set = __root.wuffs_base__frame_config__set;
    pub const bounds = __root.wuffs_base__frame_config__bounds;
    pub const width = __root.wuffs_base__frame_config__width;
    pub const height = __root.wuffs_base__frame_config__height;
    pub const duration = __root.wuffs_base__frame_config__duration;
    pub const index = __root.wuffs_base__frame_config__index;
    pub const position = __root.wuffs_base__frame_config__io_position;
    pub const disposal = __root.wuffs_base__frame_config__disposal;
    pub const blend = __root.wuffs_base__frame_config__overwrite_instead_of_blend;
    pub const color = __root.wuffs_base__frame_config__background_color;
};
pub const wuffs_base__frame_config = struct_wuffs_base__frame_config__struct;
pub fn wuffs_base__null_frame_config() callconv(.c) wuffs_base__frame_config {
    var ret: wuffs_base__frame_config = undefined;
    _ = &ret;
    ret.private_impl.bounds = wuffs_base__make_rect_ie_u32(0, 0, 0, 0);
    ret.private_impl.duration = 0;
    ret.private_impl.index = 0;
    ret.private_impl.io_position = 0;
    ret.private_impl.disposal = 0;
    ret.private_impl.opaque_within_bounds = @"false" != 0;
    ret.private_impl.overwrite_instead_of_blend = @"false" != 0;
    return ret;
}
pub fn wuffs_base__frame_config__set(arg_c: [*c]wuffs_base__frame_config, arg_bounds: wuffs_base__rect_ie_u32, arg_duration: wuffs_base__flicks, arg_index: u64, arg_io_position: u64, arg_disposal: wuffs_base__animation_disposal, arg_opaque_within_bounds: bool, arg_overwrite_instead_of_blend: bool, arg_background_color: wuffs_base__color_u32_argb_premul) callconv(.c) void {
    var c = arg_c;
    _ = &c;
    var bounds = arg_bounds;
    _ = &bounds;
    var duration = arg_duration;
    _ = &duration;
    var index = arg_index;
    _ = &index;
    var io_position = arg_io_position;
    _ = &io_position;
    var disposal = arg_disposal;
    _ = &disposal;
    var opaque_within_bounds = arg_opaque_within_bounds;
    _ = &opaque_within_bounds;
    var overwrite_instead_of_blend = arg_overwrite_instead_of_blend;
    _ = &overwrite_instead_of_blend;
    var background_color = arg_background_color;
    _ = &background_color;
    if (!(c != null)) {
        return;
    }
    c.*.private_impl.bounds = bounds;
    c.*.private_impl.duration = duration;
    c.*.private_impl.index = index;
    c.*.private_impl.io_position = io_position;
    c.*.private_impl.disposal = disposal;
    c.*.private_impl.opaque_within_bounds = opaque_within_bounds;
    c.*.private_impl.overwrite_instead_of_blend = overwrite_instead_of_blend;
    c.*.private_impl.background_color = background_color;
}
pub fn wuffs_base__frame_config__bounds(arg_c: [*c]const wuffs_base__frame_config) callconv(.c) wuffs_base__rect_ie_u32 {
    var c = arg_c;
    _ = &c;
    if (c != null) {
        return c.*.private_impl.bounds;
    }
    var ret: wuffs_base__rect_ie_u32 = undefined;
    _ = &ret;
    ret.min_incl_x = 0;
    ret.min_incl_y = 0;
    ret.max_excl_x = 0;
    ret.max_excl_y = 0;
    return ret;
}
pub fn wuffs_base__frame_config__width(arg_c: [*c]const wuffs_base__frame_config) callconv(.c) u32 {
    var c = arg_c;
    _ = &c;
    return if (c != null) wuffs_base__rect_ie_u32__width(&c.*.private_impl.bounds) else @as(u32, 0);
}
pub fn wuffs_base__frame_config__height(arg_c: [*c]const wuffs_base__frame_config) callconv(.c) u32 {
    var c = arg_c;
    _ = &c;
    return if (c != null) wuffs_base__rect_ie_u32__height(&c.*.private_impl.bounds) else @as(u32, 0);
}
pub fn wuffs_base__frame_config__duration(arg_c: [*c]const wuffs_base__frame_config) callconv(.c) wuffs_base__flicks {
    var c = arg_c;
    _ = &c;
    return if (c != null) c.*.private_impl.duration else @as(wuffs_base__flicks, 0);
}
pub fn wuffs_base__frame_config__index(arg_c: [*c]const wuffs_base__frame_config) callconv(.c) u64 {
    var c = arg_c;
    _ = &c;
    return if (c != null) c.*.private_impl.index else @as(u64, 0);
}
pub fn wuffs_base__frame_config__io_position(arg_c: [*c]const wuffs_base__frame_config) callconv(.c) u64 {
    var c = arg_c;
    _ = &c;
    return if (c != null) c.*.private_impl.io_position else @as(u64, 0);
}
pub fn wuffs_base__frame_config__disposal(arg_c: [*c]const wuffs_base__frame_config) callconv(.c) wuffs_base__animation_disposal {
    var c = arg_c;
    _ = &c;
    return @bitCast(@as(i8, @truncate(if (c != null) @as(c_int, c.*.private_impl.disposal) else @as(c_int, 0))));
}
pub fn wuffs_base__frame_config__opaque_within_bounds(arg_c: [*c]const wuffs_base__frame_config) callconv(.c) bool {
    var c = arg_c;
    _ = &c;
    return (c != null) and c.*.private_impl.opaque_within_bounds;
}
pub fn wuffs_base__frame_config__overwrite_instead_of_blend(arg_c: [*c]const wuffs_base__frame_config) callconv(.c) bool {
    var c = arg_c;
    _ = &c;
    return (c != null) and c.*.private_impl.overwrite_instead_of_blend;
}
pub fn wuffs_base__frame_config__background_color(arg_c: [*c]const wuffs_base__frame_config) callconv(.c) wuffs_base__color_u32_argb_premul {
    var c = arg_c;
    _ = &c;
    return if (c != null) c.*.private_impl.background_color else @as(wuffs_base__color_u32_argb_premul, 0);
}
const struct_unnamed_4 = extern struct {
    planes: [4]wuffs_base__table_u8,
};
pub const struct_wuffs_base__pixel_buffer__struct = extern struct {
    pixcfg: wuffs_base__pixel_config,
    private_impl: struct_unnamed_4,
    pub const wuffs_base__pixel_buffer__set_interleaved = __root.wuffs_base__pixel_buffer__set_interleaved;
    pub const wuffs_base__pixel_buffer__set_from_slice = __root.wuffs_base__pixel_buffer__set_from_slice;
    pub const wuffs_base__pixel_buffer__palette = __root.wuffs_base__pixel_buffer__palette;
    pub const wuffs_base__pixel_buffer__palette_or_else = __root.wuffs_base__pixel_buffer__palette_or_else;
    pub const wuffs_base__pixel_buffer__pixel_format = __root.wuffs_base__pixel_buffer__pixel_format;
    pub const wuffs_base__pixel_buffer__plane = __root.wuffs_base__pixel_buffer__plane;
    pub const wuffs_base__pixel_buffer__color_u32_at = __root.wuffs_base__pixel_buffer__color_u32_at;
    pub const wuffs_base__pixel_buffer__set_color_u32_at = __root.wuffs_base__pixel_buffer__set_color_u32_at;
    pub const wuffs_base__pixel_buffer__set_color_u32_fill_rect = __root.wuffs_base__pixel_buffer__set_color_u32_fill_rect;
    pub const wuffs_base__pixel_buffer__is_opaque = __root.wuffs_base__pixel_buffer__is_opaque;
    pub const interleaved = __root.wuffs_base__pixel_buffer__set_interleaved;
    pub const slice = __root.wuffs_base__pixel_buffer__set_from_slice;
    pub const palette = __root.wuffs_base__pixel_buffer__palette;
    pub const @"else" = __root.wuffs_base__pixel_buffer__palette_or_else;
    pub const format = __root.wuffs_base__pixel_buffer__pixel_format;
    pub const plane = __root.wuffs_base__pixel_buffer__plane;
    pub const at = __root.wuffs_base__pixel_buffer__color_u32_at;
    pub const rect = __root.wuffs_base__pixel_buffer__set_color_u32_fill_rect;
    pub const @"opaque" = __root.wuffs_base__pixel_buffer__is_opaque;
};
pub const wuffs_base__pixel_buffer = struct_wuffs_base__pixel_buffer__struct;
pub fn wuffs_base__null_pixel_buffer() callconv(.c) wuffs_base__pixel_buffer {
    var ret: wuffs_base__pixel_buffer = undefined;
    _ = &ret;
    ret.pixcfg = wuffs_base__null_pixel_config();
    ret.private_impl.planes[@as(c_int, 0)] = wuffs_base__empty_table_u8();
    ret.private_impl.planes[@as(c_int, 1)] = wuffs_base__empty_table_u8();
    ret.private_impl.planes[@as(c_int, 2)] = wuffs_base__empty_table_u8();
    ret.private_impl.planes[@as(c_int, 3)] = wuffs_base__empty_table_u8();
    return ret;
}
pub fn wuffs_base__pixel_buffer__set_interleaved(arg_pb: [*c]wuffs_base__pixel_buffer, arg_pixcfg: [*c]const wuffs_base__pixel_config, arg_primary_memory: wuffs_base__table_u8, arg_palette_memory: wuffs_base__slice_u8) callconv(.c) wuffs_base__status {
    var pb = arg_pb;
    _ = &pb;
    var pixcfg = arg_pixcfg;
    _ = &pixcfg;
    var primary_memory = arg_primary_memory;
    _ = &primary_memory;
    var palette_memory = arg_palette_memory;
    _ = &palette_memory;
    if (!(pb != null)) {
        return wuffs_base__make_status(wuffs_base__error__bad_receiver);
    }
    _ = memset(@ptrCast(@alignCast(pb)), 0, @sizeOf(@TypeOf(pb.*)));
    if (!(pixcfg != null) or wuffs_base__pixel_format__is_planar(&pixcfg.*.private_impl.pixfmt)) {
        return wuffs_base__make_status(wuffs_base__error__bad_argument);
    }
    if (wuffs_base__pixel_format__is_indexed(&pixcfg.*.private_impl.pixfmt) and (palette_memory.len < @as(usize, WUFFS_BASE__PIXEL_FORMAT__INDEXED__PALETTE_BYTE_LENGTH))) {
        return wuffs_base__make_status(wuffs_base__error__bad_argument_length_too_short);
    }
    var bits_per_pixel: u32 = wuffs_base__pixel_format__bits_per_pixel(&pixcfg.*.private_impl.pixfmt);
    _ = &bits_per_pixel;
    if ((bits_per_pixel == @as(u32, 0)) or ((bits_per_pixel % @as(u32, 8)) != @as(u32, 0))) {
        return wuffs_base__make_status(wuffs_base__error__unsupported_option);
    }
    var bytes_per_pixel: u64 = bits_per_pixel / @as(u32, 8);
    _ = &bytes_per_pixel;
    var width_in_bytes: u64 = @as(u64, pixcfg.*.private_impl.width) *% bytes_per_pixel;
    _ = &width_in_bytes;
    if ((width_in_bytes > @as(u64, primary_memory.width)) or (@as(usize, pixcfg.*.private_impl.height) > primary_memory.height)) {
        return wuffs_base__make_status(wuffs_base__error__bad_argument);
    }
    pb.*.pixcfg = pixcfg.*;
    pb.*.private_impl.planes[@as(c_int, 0)] = primary_memory;
    if (wuffs_base__pixel_format__is_indexed(&pixcfg.*.private_impl.pixfmt)) {
        var tab: [*c]wuffs_base__table_u8 = &pb.*.private_impl.planes[WUFFS_BASE__PIXEL_FORMAT__INDEXED__COLOR_PLANE];
        _ = &tab;
        tab.*.ptr = palette_memory.ptr;
        tab.*.width = WUFFS_BASE__PIXEL_FORMAT__INDEXED__PALETTE_BYTE_LENGTH;
        tab.*.height = 1;
        tab.*.stride = WUFFS_BASE__PIXEL_FORMAT__INDEXED__PALETTE_BYTE_LENGTH;
    }
    return wuffs_base__make_status(null);
}
pub fn wuffs_base__pixel_buffer__set_from_slice(arg_pb: [*c]wuffs_base__pixel_buffer, arg_pixcfg: [*c]const wuffs_base__pixel_config, arg_pixbuf_memory: wuffs_base__slice_u8) callconv(.c) wuffs_base__status {
    var pb = arg_pb;
    _ = &pb;
    var pixcfg = arg_pixcfg;
    _ = &pixcfg;
    var pixbuf_memory = arg_pixbuf_memory;
    _ = &pixbuf_memory;
    if (!(pb != null)) {
        return wuffs_base__make_status(wuffs_base__error__bad_receiver);
    }
    _ = memset(@ptrCast(@alignCast(pb)), 0, @sizeOf(@TypeOf(pb.*)));
    if (!(pixcfg != null)) {
        return wuffs_base__make_status(wuffs_base__error__bad_argument);
    }
    if (wuffs_base__pixel_format__is_planar(&pixcfg.*.private_impl.pixfmt)) {
        return wuffs_base__make_status(wuffs_base__error__unsupported_option);
    }
    var bits_per_pixel: u32 = wuffs_base__pixel_format__bits_per_pixel(&pixcfg.*.private_impl.pixfmt);
    _ = &bits_per_pixel;
    if ((bits_per_pixel == @as(u32, 0)) or ((bits_per_pixel % @as(u32, 8)) != @as(u32, 0))) {
        return wuffs_base__make_status(wuffs_base__error__unsupported_option);
    }
    var bytes_per_pixel: u64 = bits_per_pixel / @as(u32, 8);
    _ = &bytes_per_pixel;
    var ptr: [*c]u8 = pixbuf_memory.ptr;
    _ = &ptr;
    var len: u64 = pixbuf_memory.len;
    _ = &len;
    if (wuffs_base__pixel_format__is_indexed(&pixcfg.*.private_impl.pixfmt)) {
        if (len < @as(u64, WUFFS_BASE__PIXEL_FORMAT__INDEXED__PALETTE_BYTE_LENGTH)) {
            return wuffs_base__make_status(wuffs_base__error__bad_argument_length_too_short);
        }
        var tab: [*c]wuffs_base__table_u8 = &pb.*.private_impl.planes[WUFFS_BASE__PIXEL_FORMAT__INDEXED__COLOR_PLANE];
        _ = &tab;
        tab.*.ptr = ptr;
        tab.*.width = WUFFS_BASE__PIXEL_FORMAT__INDEXED__PALETTE_BYTE_LENGTH;
        tab.*.height = 1;
        tab.*.stride = WUFFS_BASE__PIXEL_FORMAT__INDEXED__PALETTE_BYTE_LENGTH;
        ptr += @as(usize, @bitCast(@as(isize, @intCast(WUFFS_BASE__PIXEL_FORMAT__INDEXED__PALETTE_BYTE_LENGTH))));
        len -%= WUFFS_BASE__PIXEL_FORMAT__INDEXED__PALETTE_BYTE_LENGTH;
    }
    var wh: u64 = @as(u64, pixcfg.*.private_impl.width) *% @as(u64, pixcfg.*.private_impl.height);
    _ = &wh;
    var width: usize = pixcfg.*.private_impl.width;
    _ = &width;
    if ((wh > (@as(c_ulonglong, 18446744073709551615) / bytes_per_pixel)) or (@as(u64, width) > (@as(u64, __SIZE_MAX__) / bytes_per_pixel))) {
        return wuffs_base__make_status(wuffs_base__error__bad_argument);
    }
    wh *%= bytes_per_pixel;
    width = @as(usize, @truncate(@as(u64, width) *% bytes_per_pixel));
    if (wh > len) {
        return wuffs_base__make_status(wuffs_base__error__bad_argument_length_too_short);
    }
    pb.*.pixcfg = pixcfg.*;
    var tab: [*c]wuffs_base__table_u8 = &pb.*.private_impl.planes[@as(c_int, 0)];
    _ = &tab;
    tab.*.ptr = ptr;
    tab.*.width = width;
    tab.*.height = pixcfg.*.private_impl.height;
    tab.*.stride = width;
    return wuffs_base__make_status(null);
}
pub fn wuffs_base__pixel_buffer__palette(arg_pb: [*c]wuffs_base__pixel_buffer) callconv(.c) wuffs_base__slice_u8 {
    var pb = arg_pb;
    _ = &pb;
    if ((pb != null) and wuffs_base__pixel_format__is_indexed(&pb.*.pixcfg.private_impl.pixfmt)) {
        var tab: [*c]wuffs_base__table_u8 = &pb.*.private_impl.planes[WUFFS_BASE__PIXEL_FORMAT__INDEXED__COLOR_PLANE];
        _ = &tab;
        if ((tab.*.width == @as(usize, WUFFS_BASE__PIXEL_FORMAT__INDEXED__PALETTE_BYTE_LENGTH)) and (tab.*.height == @as(usize, 1))) {
            return wuffs_base__make_slice_u8(tab.*.ptr, WUFFS_BASE__PIXEL_FORMAT__INDEXED__PALETTE_BYTE_LENGTH);
        }
    }
    return wuffs_base__empty_slice_u8();
}
pub fn wuffs_base__pixel_buffer__palette_or_else(arg_pb: [*c]wuffs_base__pixel_buffer, arg_fallback: wuffs_base__slice_u8) callconv(.c) wuffs_base__slice_u8 {
    var pb = arg_pb;
    _ = &pb;
    var fallback = arg_fallback;
    _ = &fallback;
    if ((pb != null) and wuffs_base__pixel_format__is_indexed(&pb.*.pixcfg.private_impl.pixfmt)) {
        var tab: [*c]wuffs_base__table_u8 = &pb.*.private_impl.planes[WUFFS_BASE__PIXEL_FORMAT__INDEXED__COLOR_PLANE];
        _ = &tab;
        if ((tab.*.width == @as(usize, WUFFS_BASE__PIXEL_FORMAT__INDEXED__PALETTE_BYTE_LENGTH)) and (tab.*.height == @as(usize, 1))) {
            return wuffs_base__make_slice_u8(tab.*.ptr, WUFFS_BASE__PIXEL_FORMAT__INDEXED__PALETTE_BYTE_LENGTH);
        }
    }
    return fallback;
}
pub fn wuffs_base__pixel_buffer__pixel_format(arg_pb: [*c]const wuffs_base__pixel_buffer) callconv(.c) wuffs_base__pixel_format {
    var pb = arg_pb;
    _ = &pb;
    if (pb != null) {
        return pb.*.pixcfg.private_impl.pixfmt;
    }
    return wuffs_base__make_pixel_format(WUFFS_BASE__PIXEL_FORMAT__INVALID);
}
pub fn wuffs_base__pixel_buffer__plane(arg_pb: [*c]wuffs_base__pixel_buffer, arg_p: u32) callconv(.c) wuffs_base__table_u8 {
    var pb = arg_pb;
    _ = &pb;
    var p = arg_p;
    _ = &p;
    if ((pb != null) and (p < @as(u32, WUFFS_BASE__PIXEL_FORMAT__NUM_PLANES_MAX_INCL))) {
        return pb.*.private_impl.planes[p];
    }
    var ret: wuffs_base__table_u8 = undefined;
    _ = &ret;
    ret.ptr = null;
    ret.width = 0;
    ret.height = 0;
    ret.stride = 0;
    return ret;
}
pub extern fn wuffs_base__pixel_buffer__color_u32_at(pb: [*c]const wuffs_base__pixel_buffer, x: u32, y: u32) wuffs_base__color_u32_argb_premul;
pub extern fn wuffs_base__pixel_buffer__set_color_u32_at(pb: [*c]wuffs_base__pixel_buffer, x: u32, y: u32, color: wuffs_base__color_u32_argb_premul) wuffs_base__status;
pub extern fn wuffs_base__pixel_buffer__set_color_u32_fill_rect(pb: [*c]wuffs_base__pixel_buffer, rect: wuffs_base__rect_ie_u32, color: wuffs_base__color_u32_argb_premul) wuffs_base__status;
pub extern fn wuffs_base__pixel_buffer__is_opaque(pb: [*c]const wuffs_base__pixel_buffer) bool;
const struct_unnamed_5 = extern struct {
    TODO: u8,
};
pub const struct_wuffs_base__decode_frame_options__struct = extern struct {
    private_impl: struct_unnamed_5,
};
pub const wuffs_base__decode_frame_options = struct_wuffs_base__decode_frame_options__struct;
pub extern fn wuffs_base__pixel_palette__closest_element(palette_slice: wuffs_base__slice_u8, palette_format: wuffs_base__pixel_format, c: wuffs_base__color_u32_argb_premul) u8;
pub const wuffs_base__pixel_swizzler__func = ?*const fn (dst_ptr: [*c]u8, dst_len: usize, dst_palette_ptr: [*c]u8, dst_palette_len: usize, src_ptr: [*c]const u8, src_len: usize) callconv(.c) u64;
pub const wuffs_base__pixel_swizzler__transparent_black_func = ?*const fn (dst_ptr: [*c]u8, dst_len: usize, dst_palette_ptr: [*c]u8, dst_palette_len: usize, num_pixels: u64, dst_pixfmt_bytes_per_pixel: u32) callconv(.c) u64;
const struct_unnamed_6 = extern struct {
    func: wuffs_base__pixel_swizzler__func,
    transparent_black_func: wuffs_base__pixel_swizzler__transparent_black_func,
    dst_pixfmt_bytes_per_pixel: u32,
    src_pixfmt_bytes_per_pixel: u32,
};
pub const struct_wuffs_base__pixel_swizzler__struct = extern struct {
    private_impl: struct_unnamed_6,
    pub const wuffs_base__pixel_swizzler__prepare = __root.wuffs_base__pixel_swizzler__prepare;
    pub const wuffs_base__pixel_swizzler__swizzle_interleaved_from_slice = __root.wuffs_base__pixel_swizzler__swizzle_interleaved_from_slice;
    pub const prepare = __root.wuffs_base__pixel_swizzler__prepare;
    pub const slice = __root.wuffs_base__pixel_swizzler__swizzle_interleaved_from_slice;
};
pub const wuffs_base__pixel_swizzler = struct_wuffs_base__pixel_swizzler__struct;
pub extern fn wuffs_base__pixel_swizzler__prepare(p: [*c]wuffs_base__pixel_swizzler, dst_pixfmt: wuffs_base__pixel_format, dst_palette: wuffs_base__slice_u8, src_pixfmt: wuffs_base__pixel_format, src_palette: wuffs_base__slice_u8, blend: wuffs_base__pixel_blend) wuffs_base__status;
pub extern fn wuffs_base__pixel_swizzler__swizzle_interleaved_from_slice(p: [*c]const wuffs_base__pixel_swizzler, dst: wuffs_base__slice_u8, dst_palette: wuffs_base__slice_u8, src: wuffs_base__slice_u8) u64;
pub const struct_wuffs_base__lossy_value_u16__struct = extern struct {
    value: u16,
    lossy: bool,
};
pub const wuffs_base__lossy_value_u16 = struct_wuffs_base__lossy_value_u16__struct;
pub const struct_wuffs_base__lossy_value_u32__struct = extern struct {
    value: u32,
    lossy: bool,
};
pub const wuffs_base__lossy_value_u32 = struct_wuffs_base__lossy_value_u32__struct;
pub extern fn wuffs_base__ieee_754_bit_representation__from_f64_to_u16_truncate(f: f64) wuffs_base__lossy_value_u16;
pub extern fn wuffs_base__ieee_754_bit_representation__from_f64_to_u32_truncate(f: f64) wuffs_base__lossy_value_u32;
pub fn wuffs_base__ieee_754_bit_representation__from_f64_to_u64(arg_f: f64) callconv(.c) u64 {
    var f = arg_f;
    _ = &f;
    var u: u64 = 0;
    _ = &u;
    if (@sizeOf(u64) == @sizeOf(f64)) {
        _ = memcpy(@ptrCast(@alignCast(&u)), @ptrCast(@alignCast(&f)), @sizeOf(u64));
    }
    return u;
}
pub fn wuffs_base__ieee_754_bit_representation__from_u16_to_f64(arg_u: u16) callconv(.c) f64 {
    var u = arg_u;
    _ = &u;
    var v: u64 = @as(u64, @bitCast(@as(c_longlong, @as(c_int, u) & @as(c_int, 32768)))) << @intCast(@as(u64, 48));
    _ = &v;
    while (true) {
        var exp: u64 = @bitCast(@as(c_longlong, (@as(c_int, u) >> @intCast(@as(c_int, 10))) & @as(c_int, 31)));
        _ = &exp;
        var man: u64 = @bitCast(@as(c_longlong, @as(c_int, u) & @as(c_int, 1023)));
        _ = &man;
        if (exp == @as(u64, 31)) {
            exp = 2047;
        } else if (exp != @as(u64, 0)) {
            exp +%= 1008;
        } else if (man != @as(u64, 0)) {
            var clz: u32 = wuffs_base__count_leading_zeroes_u64(man);
            _ = &clz;
            exp = @as(u32, 1062) -% clz;
            man = @as(u64, 1023) & (man << @intCast(@as(u64, clz -% @as(u32, 53))));
        } else {
            break;
        }
        v |= (exp << @intCast(@as(u64, 52))) | (man << @intCast(@as(u64, 42)));
        if (!false) break;
    }
    var f: f64 = @floatFromInt(@as(c_int, 0));
    _ = &f;
    if (@sizeOf(u64) == @sizeOf(f64)) {
        _ = memcpy(@ptrCast(@alignCast(&f)), @ptrCast(@alignCast(&v)), @sizeOf(u64));
    }
    return f;
}
pub fn wuffs_base__ieee_754_bit_representation__from_u32_to_f64(arg_u: u32) callconv(.c) f64 {
    var u = arg_u;
    _ = &u;
    var f: f32 = @floatFromInt(@as(c_int, 0));
    _ = &f;
    if (@sizeOf(u32) == @sizeOf(f32)) {
        _ = memcpy(@ptrCast(@alignCast(&f)), @ptrCast(@alignCast(&u)), @sizeOf(u32));
    }
    return @floatCast(f);
}
pub fn wuffs_base__ieee_754_bit_representation__from_u64_to_f64(arg_u: u64) callconv(.c) f64 {
    var u = arg_u;
    _ = &u;
    var f: f64 = @floatFromInt(@as(c_int, 0));
    _ = &f;
    if (@sizeOf(u64) == @sizeOf(f64)) {
        _ = memcpy(@ptrCast(@alignCast(&f)), @ptrCast(@alignCast(&u)), @sizeOf(u64));
    }
    return f;
}
pub extern fn wuffs_base__parse_number_f64(s: wuffs_base__slice_u8, options: u32) wuffs_base__result_f64;
pub extern fn wuffs_base__parse_number_i64(s: wuffs_base__slice_u8, options: u32) wuffs_base__result_i64;
pub extern fn wuffs_base__parse_number_u64(s: wuffs_base__slice_u8, options: u32) wuffs_base__result_u64;
pub extern fn wuffs_base__render_number_f64(dst: wuffs_base__slice_u8, x: f64, precision: u32, options: u32) usize;
pub extern fn wuffs_base__render_number_i64(dst: wuffs_base__slice_u8, x: i64, options: u32) usize;
pub extern fn wuffs_base__render_number_u64(dst: wuffs_base__slice_u8, x: u64, options: u32) usize;
pub extern fn wuffs_base__base_16__decode2(dst: wuffs_base__slice_u8, src: wuffs_base__slice_u8, src_closed: bool, options: u32) wuffs_base__transform__output;
pub extern fn wuffs_base__base_16__decode4(dst: wuffs_base__slice_u8, src: wuffs_base__slice_u8, src_closed: bool, options: u32) wuffs_base__transform__output;
pub extern fn wuffs_base__base_16__encode2(dst: wuffs_base__slice_u8, src: wuffs_base__slice_u8, src_closed: bool, options: u32) wuffs_base__transform__output;
pub extern fn wuffs_base__base_16__encode4(dst: wuffs_base__slice_u8, src: wuffs_base__slice_u8, src_closed: bool, options: u32) wuffs_base__transform__output;
pub extern fn wuffs_base__base_64__decode(dst: wuffs_base__slice_u8, src: wuffs_base__slice_u8, src_closed: bool, options: u32) wuffs_base__transform__output;
pub extern fn wuffs_base__base_64__encode(dst: wuffs_base__slice_u8, src: wuffs_base__slice_u8, src_closed: bool, options: u32) wuffs_base__transform__output;
pub const struct_wuffs_base__utf_8__next__output__struct = extern struct {
    code_point: u32,
    byte_length: u32,
    pub const wuffs_base__utf_8__next__output__is_valid = __root.wuffs_base__utf_8__next__output__is_valid;
    pub const valid = __root.wuffs_base__utf_8__next__output__is_valid;
};
pub const wuffs_base__utf_8__next__output = struct_wuffs_base__utf_8__next__output__struct;
pub fn wuffs_base__make_utf_8__next__output(arg_code_point: u32, arg_byte_length: u32) callconv(.c) wuffs_base__utf_8__next__output {
    var code_point = arg_code_point;
    _ = &code_point;
    var byte_length = arg_byte_length;
    _ = &byte_length;
    var ret: wuffs_base__utf_8__next__output = undefined;
    _ = &ret;
    ret.code_point = code_point;
    ret.byte_length = byte_length;
    return ret;
}
pub fn wuffs_base__utf_8__next__output__is_valid(arg_o: [*c]const wuffs_base__utf_8__next__output) callconv(.c) bool {
    var o = arg_o;
    _ = &o;
    if (o != null) {
        var cp: u32 = o.*.code_point;
        _ = &cp;
        while (true) {
            switch (o.*.byte_length) {
                @as(u32, 1) => {
                    return cp <= @as(u32, 127);
                },
                @as(u32, 2) => {
                    return (@as(u32, 128) <= cp) and (cp <= @as(u32, 2047));
                },
                @as(u32, 3) => {
                    return ((@as(u32, 2048) <= cp) and (cp <= @as(u32, 55295))) or ((@as(u32, 57344) <= cp) and (cp <= @as(u32, 65535)));
                },
                @as(u32, 4) => {
                    return (@as(u32, 65536) <= cp) and (cp <= @as(u32, 1114111));
                },
                else => {},
            }
            break;
        }
    }
    return @"false" != 0;
}
pub extern fn wuffs_base__utf_8__encode(dst: wuffs_base__slice_u8, code_point: u32) usize;
pub extern fn wuffs_base__utf_8__next(s_ptr: [*c]const u8, s_len: usize) wuffs_base__utf_8__next__output;
pub extern fn wuffs_base__utf_8__next_from_end(s_ptr: [*c]const u8, s_len: usize) wuffs_base__utf_8__next__output;
pub extern fn wuffs_base__utf_8__longest_valid_prefix(s_ptr: [*c]const u8, s_len: usize) usize;
pub extern fn wuffs_base__ascii__longest_valid_prefix(s_ptr: [*c]const u8, s_len: usize) usize;
pub const wuffs_base__hasher_u32__vtable_name: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__hasher_u32__vtable_name",
});
pub const struct_wuffs_base__hasher_u32__func_ptrs__struct = extern struct {
    checksum_u32: ?*const fn (self: ?*const anyopaque) callconv(.c) u32,
    get_quirk: ?*const fn (self: ?*const anyopaque, a_key: u32) callconv(.c) u64,
    set_quirk: ?*const fn (self: ?*anyopaque, a_key: u32, a_value: u64) callconv(.c) wuffs_base__status,
    update: ?*const fn (self: ?*anyopaque, a_x: wuffs_base__slice_u8) callconv(.c) wuffs_base__empty_struct,
    update_u32: ?*const fn (self: ?*anyopaque, a_x: wuffs_base__slice_u8) callconv(.c) u32,
};
pub const wuffs_base__hasher_u32__func_ptrs = struct_wuffs_base__hasher_u32__func_ptrs__struct;
pub const struct_wuffs_base__hasher_u32__struct = opaque {
    pub const wuffs_base__hasher_u32__checksum_u32 = __root.wuffs_base__hasher_u32__checksum_u32;
    pub const wuffs_base__hasher_u32__get_quirk = __root.wuffs_base__hasher_u32__get_quirk;
    pub const wuffs_base__hasher_u32__set_quirk = __root.wuffs_base__hasher_u32__set_quirk;
    pub const wuffs_base__hasher_u32__update = __root.wuffs_base__hasher_u32__update;
    pub const wuffs_base__hasher_u32__update_u32 = __root.wuffs_base__hasher_u32__update_u32;
    pub const @"u32" = __root.wuffs_base__hasher_u32__checksum_u32;
    pub const quirk = __root.wuffs_base__hasher_u32__get_quirk;
    pub const update = __root.wuffs_base__hasher_u32__update;
};
pub const wuffs_base__hasher_u32 = struct_wuffs_base__hasher_u32__struct;
pub extern fn wuffs_base__hasher_u32__checksum_u32(self: ?*const wuffs_base__hasher_u32) u32;
pub extern fn wuffs_base__hasher_u32__get_quirk(self: ?*const wuffs_base__hasher_u32, a_key: u32) u64;
pub extern fn wuffs_base__hasher_u32__set_quirk(self: ?*wuffs_base__hasher_u32, a_key: u32, a_value: u64) wuffs_base__status;
pub extern fn wuffs_base__hasher_u32__update(self: ?*wuffs_base__hasher_u32, a_x: wuffs_base__slice_u8) wuffs_base__empty_struct;
pub extern fn wuffs_base__hasher_u32__update_u32(self: ?*wuffs_base__hasher_u32, a_x: wuffs_base__slice_u8) u32;
pub const wuffs_base__hasher_u64__vtable_name: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__hasher_u64__vtable_name",
});
pub const struct_wuffs_base__hasher_u64__func_ptrs__struct = extern struct {
    checksum_u64: ?*const fn (self: ?*const anyopaque) callconv(.c) u64,
    get_quirk: ?*const fn (self: ?*const anyopaque, a_key: u32) callconv(.c) u64,
    set_quirk: ?*const fn (self: ?*anyopaque, a_key: u32, a_value: u64) callconv(.c) wuffs_base__status,
    update: ?*const fn (self: ?*anyopaque, a_x: wuffs_base__slice_u8) callconv(.c) wuffs_base__empty_struct,
    update_u64: ?*const fn (self: ?*anyopaque, a_x: wuffs_base__slice_u8) callconv(.c) u64,
};
pub const wuffs_base__hasher_u64__func_ptrs = struct_wuffs_base__hasher_u64__func_ptrs__struct;
pub const struct_wuffs_base__hasher_u64__struct = opaque {
    pub const wuffs_base__hasher_u64__checksum_u64 = __root.wuffs_base__hasher_u64__checksum_u64;
    pub const wuffs_base__hasher_u64__get_quirk = __root.wuffs_base__hasher_u64__get_quirk;
    pub const wuffs_base__hasher_u64__set_quirk = __root.wuffs_base__hasher_u64__set_quirk;
    pub const wuffs_base__hasher_u64__update = __root.wuffs_base__hasher_u64__update;
    pub const wuffs_base__hasher_u64__update_u64 = __root.wuffs_base__hasher_u64__update_u64;
    pub const @"u64" = __root.wuffs_base__hasher_u64__checksum_u64;
    pub const quirk = __root.wuffs_base__hasher_u64__get_quirk;
    pub const update = __root.wuffs_base__hasher_u64__update;
};
pub const wuffs_base__hasher_u64 = struct_wuffs_base__hasher_u64__struct;
pub extern fn wuffs_base__hasher_u64__checksum_u64(self: ?*const wuffs_base__hasher_u64) u64;
pub extern fn wuffs_base__hasher_u64__get_quirk(self: ?*const wuffs_base__hasher_u64, a_key: u32) u64;
pub extern fn wuffs_base__hasher_u64__set_quirk(self: ?*wuffs_base__hasher_u64, a_key: u32, a_value: u64) wuffs_base__status;
pub extern fn wuffs_base__hasher_u64__update(self: ?*wuffs_base__hasher_u64, a_x: wuffs_base__slice_u8) wuffs_base__empty_struct;
pub extern fn wuffs_base__hasher_u64__update_u64(self: ?*wuffs_base__hasher_u64, a_x: wuffs_base__slice_u8) u64;
pub const wuffs_base__hasher_bitvec256__vtable_name: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__hasher_bitvec256__vtable_name",
});
pub const struct_wuffs_base__hasher_bitvec256__func_ptrs__struct = extern struct {
    checksum_bitvec256: ?*const fn (self: ?*const anyopaque) callconv(.c) wuffs_base__bitvec256,
    get_quirk: ?*const fn (self: ?*const anyopaque, a_key: u32) callconv(.c) u64,
    set_quirk: ?*const fn (self: ?*anyopaque, a_key: u32, a_value: u64) callconv(.c) wuffs_base__status,
    update: ?*const fn (self: ?*anyopaque, a_x: wuffs_base__slice_u8) callconv(.c) wuffs_base__empty_struct,
    update_bitvec256: ?*const fn (self: ?*anyopaque, a_x: wuffs_base__slice_u8) callconv(.c) wuffs_base__bitvec256,
};
pub const wuffs_base__hasher_bitvec256__func_ptrs = struct_wuffs_base__hasher_bitvec256__func_ptrs__struct;
pub const struct_wuffs_base__hasher_bitvec256__struct = opaque {
    pub const wuffs_base__hasher_bitvec256__checksum_bitvec256 = __root.wuffs_base__hasher_bitvec256__checksum_bitvec256;
    pub const wuffs_base__hasher_bitvec256__get_quirk = __root.wuffs_base__hasher_bitvec256__get_quirk;
    pub const wuffs_base__hasher_bitvec256__set_quirk = __root.wuffs_base__hasher_bitvec256__set_quirk;
    pub const wuffs_base__hasher_bitvec256__update = __root.wuffs_base__hasher_bitvec256__update;
    pub const wuffs_base__hasher_bitvec256__update_bitvec256 = __root.wuffs_base__hasher_bitvec256__update_bitvec256;
    pub const bitvec256 = __root.wuffs_base__hasher_bitvec256__checksum_bitvec256;
    pub const quirk = __root.wuffs_base__hasher_bitvec256__get_quirk;
    pub const update = __root.wuffs_base__hasher_bitvec256__update;
};
pub const wuffs_base__hasher_bitvec256 = struct_wuffs_base__hasher_bitvec256__struct;
pub extern fn wuffs_base__hasher_bitvec256__checksum_bitvec256(self: ?*const wuffs_base__hasher_bitvec256) wuffs_base__bitvec256;
pub extern fn wuffs_base__hasher_bitvec256__get_quirk(self: ?*const wuffs_base__hasher_bitvec256, a_key: u32) u64;
pub extern fn wuffs_base__hasher_bitvec256__set_quirk(self: ?*wuffs_base__hasher_bitvec256, a_key: u32, a_value: u64) wuffs_base__status;
pub extern fn wuffs_base__hasher_bitvec256__update(self: ?*wuffs_base__hasher_bitvec256, a_x: wuffs_base__slice_u8) wuffs_base__empty_struct;
pub extern fn wuffs_base__hasher_bitvec256__update_bitvec256(self: ?*wuffs_base__hasher_bitvec256, a_x: wuffs_base__slice_u8) wuffs_base__bitvec256;
pub const wuffs_base__image_decoder__vtable_name: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__image_decoder__vtable_name",
});
pub const struct_wuffs_base__image_decoder__func_ptrs__struct = extern struct {
    decode_frame: ?*const fn (self: ?*anyopaque, a_dst: [*c]wuffs_base__pixel_buffer, a_src: [*c]wuffs_base__io_buffer, a_blend: wuffs_base__pixel_blend, a_workbuf: wuffs_base__slice_u8, a_opts: [*c]wuffs_base__decode_frame_options) callconv(.c) wuffs_base__status,
    decode_frame_config: ?*const fn (self: ?*anyopaque, a_dst: [*c]wuffs_base__frame_config, a_src: [*c]wuffs_base__io_buffer) callconv(.c) wuffs_base__status,
    decode_image_config: ?*const fn (self: ?*anyopaque, a_dst: [*c]wuffs_base__image_config, a_src: [*c]wuffs_base__io_buffer) callconv(.c) wuffs_base__status,
    frame_dirty_rect: ?*const fn (self: ?*const anyopaque) callconv(.c) wuffs_base__rect_ie_u32,
    get_quirk: ?*const fn (self: ?*const anyopaque, a_key: u32) callconv(.c) u64,
    num_animation_loops: ?*const fn (self: ?*const anyopaque) callconv(.c) u32,
    num_decoded_frame_configs: ?*const fn (self: ?*const anyopaque) callconv(.c) u64,
    num_decoded_frames: ?*const fn (self: ?*const anyopaque) callconv(.c) u64,
    restart_frame: ?*const fn (self: ?*anyopaque, a_index: u64, a_io_position: u64) callconv(.c) wuffs_base__status,
    set_quirk: ?*const fn (self: ?*anyopaque, a_key: u32, a_value: u64) callconv(.c) wuffs_base__status,
    set_report_metadata: ?*const fn (self: ?*anyopaque, a_fourcc: u32, a_report: bool) callconv(.c) wuffs_base__empty_struct,
    tell_me_more: ?*const fn (self: ?*anyopaque, a_dst: [*c]wuffs_base__io_buffer, a_minfo: [*c]wuffs_base__more_information, a_src: [*c]wuffs_base__io_buffer) callconv(.c) wuffs_base__status,
    workbuf_len: ?*const fn (self: ?*const anyopaque) callconv(.c) wuffs_base__range_ii_u64,
};
pub const wuffs_base__image_decoder__func_ptrs = struct_wuffs_base__image_decoder__func_ptrs__struct;
pub const struct_wuffs_base__image_decoder__struct = opaque {
    pub const wuffs_base__image_decoder__decode_frame = __root.wuffs_base__image_decoder__decode_frame;
    pub const wuffs_base__image_decoder__decode_frame_config = __root.wuffs_base__image_decoder__decode_frame_config;
    pub const wuffs_base__image_decoder__decode_image_config = __root.wuffs_base__image_decoder__decode_image_config;
    pub const wuffs_base__image_decoder__frame_dirty_rect = __root.wuffs_base__image_decoder__frame_dirty_rect;
    pub const wuffs_base__image_decoder__get_quirk = __root.wuffs_base__image_decoder__get_quirk;
    pub const wuffs_base__image_decoder__num_animation_loops = __root.wuffs_base__image_decoder__num_animation_loops;
    pub const wuffs_base__image_decoder__num_decoded_frame_configs = __root.wuffs_base__image_decoder__num_decoded_frame_configs;
    pub const wuffs_base__image_decoder__num_decoded_frames = __root.wuffs_base__image_decoder__num_decoded_frames;
    pub const wuffs_base__image_decoder__restart_frame = __root.wuffs_base__image_decoder__restart_frame;
    pub const wuffs_base__image_decoder__set_quirk = __root.wuffs_base__image_decoder__set_quirk;
    pub const wuffs_base__image_decoder__set_report_metadata = __root.wuffs_base__image_decoder__set_report_metadata;
    pub const wuffs_base__image_decoder__tell_me_more = __root.wuffs_base__image_decoder__tell_me_more;
    pub const wuffs_base__image_decoder__workbuf_len = __root.wuffs_base__image_decoder__workbuf_len;
    pub const frame = __root.wuffs_base__image_decoder__decode_frame;
    pub const config = __root.wuffs_base__image_decoder__decode_frame_config;
    pub const rect = __root.wuffs_base__image_decoder__frame_dirty_rect;
    pub const quirk = __root.wuffs_base__image_decoder__get_quirk;
    pub const loops = __root.wuffs_base__image_decoder__num_animation_loops;
    pub const configs = __root.wuffs_base__image_decoder__num_decoded_frame_configs;
    pub const frames = __root.wuffs_base__image_decoder__num_decoded_frames;
    pub const metadata = __root.wuffs_base__image_decoder__set_report_metadata;
    pub const more = __root.wuffs_base__image_decoder__tell_me_more;
    pub const len = __root.wuffs_base__image_decoder__workbuf_len;
};
pub const wuffs_base__image_decoder = struct_wuffs_base__image_decoder__struct;
pub extern fn wuffs_base__image_decoder__decode_frame(self: ?*wuffs_base__image_decoder, a_dst: [*c]wuffs_base__pixel_buffer, a_src: [*c]wuffs_base__io_buffer, a_blend: wuffs_base__pixel_blend, a_workbuf: wuffs_base__slice_u8, a_opts: [*c]wuffs_base__decode_frame_options) wuffs_base__status;
pub extern fn wuffs_base__image_decoder__decode_frame_config(self: ?*wuffs_base__image_decoder, a_dst: [*c]wuffs_base__frame_config, a_src: [*c]wuffs_base__io_buffer) wuffs_base__status;
pub extern fn wuffs_base__image_decoder__decode_image_config(self: ?*wuffs_base__image_decoder, a_dst: [*c]wuffs_base__image_config, a_src: [*c]wuffs_base__io_buffer) wuffs_base__status;
pub extern fn wuffs_base__image_decoder__frame_dirty_rect(self: ?*const wuffs_base__image_decoder) wuffs_base__rect_ie_u32;
pub extern fn wuffs_base__image_decoder__get_quirk(self: ?*const wuffs_base__image_decoder, a_key: u32) u64;
pub extern fn wuffs_base__image_decoder__num_animation_loops(self: ?*const wuffs_base__image_decoder) u32;
pub extern fn wuffs_base__image_decoder__num_decoded_frame_configs(self: ?*const wuffs_base__image_decoder) u64;
pub extern fn wuffs_base__image_decoder__num_decoded_frames(self: ?*const wuffs_base__image_decoder) u64;
pub extern fn wuffs_base__image_decoder__restart_frame(self: ?*wuffs_base__image_decoder, a_index: u64, a_io_position: u64) wuffs_base__status;
pub extern fn wuffs_base__image_decoder__set_quirk(self: ?*wuffs_base__image_decoder, a_key: u32, a_value: u64) wuffs_base__status;
pub extern fn wuffs_base__image_decoder__set_report_metadata(self: ?*wuffs_base__image_decoder, a_fourcc: u32, a_report: bool) wuffs_base__empty_struct;
pub extern fn wuffs_base__image_decoder__tell_me_more(self: ?*wuffs_base__image_decoder, a_dst: [*c]wuffs_base__io_buffer, a_minfo: [*c]wuffs_base__more_information, a_src: [*c]wuffs_base__io_buffer) wuffs_base__status;
pub extern fn wuffs_base__image_decoder__workbuf_len(self: ?*const wuffs_base__image_decoder) wuffs_base__range_ii_u64;
pub const wuffs_base__io_transformer__vtable_name: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__io_transformer__vtable_name",
});
pub const struct_wuffs_base__io_transformer__func_ptrs__struct = extern struct {
    dst_history_retain_length: ?*const fn (self: ?*const anyopaque) callconv(.c) wuffs_base__optional_u63,
    get_quirk: ?*const fn (self: ?*const anyopaque, a_key: u32) callconv(.c) u64,
    set_quirk: ?*const fn (self: ?*anyopaque, a_key: u32, a_value: u64) callconv(.c) wuffs_base__status,
    transform_io: ?*const fn (self: ?*anyopaque, a_dst: [*c]wuffs_base__io_buffer, a_src: [*c]wuffs_base__io_buffer, a_workbuf: wuffs_base__slice_u8) callconv(.c) wuffs_base__status,
    workbuf_len: ?*const fn (self: ?*const anyopaque) callconv(.c) wuffs_base__range_ii_u64,
};
pub const wuffs_base__io_transformer__func_ptrs = struct_wuffs_base__io_transformer__func_ptrs__struct;
pub const struct_wuffs_base__io_transformer__struct = opaque {
    pub const wuffs_base__io_transformer__dst_history_retain_length = __root.wuffs_base__io_transformer__dst_history_retain_length;
    pub const wuffs_base__io_transformer__get_quirk = __root.wuffs_base__io_transformer__get_quirk;
    pub const wuffs_base__io_transformer__set_quirk = __root.wuffs_base__io_transformer__set_quirk;
    pub const wuffs_base__io_transformer__transform_io = __root.wuffs_base__io_transformer__transform_io;
    pub const wuffs_base__io_transformer__workbuf_len = __root.wuffs_base__io_transformer__workbuf_len;
    pub const length = __root.wuffs_base__io_transformer__dst_history_retain_length;
    pub const quirk = __root.wuffs_base__io_transformer__get_quirk;
    pub const io = __root.wuffs_base__io_transformer__transform_io;
    pub const len = __root.wuffs_base__io_transformer__workbuf_len;
};
pub const wuffs_base__io_transformer = struct_wuffs_base__io_transformer__struct;
pub extern fn wuffs_base__io_transformer__dst_history_retain_length(self: ?*const wuffs_base__io_transformer) wuffs_base__optional_u63;
pub extern fn wuffs_base__io_transformer__get_quirk(self: ?*const wuffs_base__io_transformer, a_key: u32) u64;
pub extern fn wuffs_base__io_transformer__set_quirk(self: ?*wuffs_base__io_transformer, a_key: u32, a_value: u64) wuffs_base__status;
pub extern fn wuffs_base__io_transformer__transform_io(self: ?*wuffs_base__io_transformer, a_dst: [*c]wuffs_base__io_buffer, a_src: [*c]wuffs_base__io_buffer, a_workbuf: wuffs_base__slice_u8) wuffs_base__status;
pub extern fn wuffs_base__io_transformer__workbuf_len(self: ?*const wuffs_base__io_transformer) wuffs_base__range_ii_u64;
pub const wuffs_base__token_decoder__vtable_name: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_base__token_decoder__vtable_name",
});
pub const struct_wuffs_base__token_decoder__func_ptrs__struct = extern struct {
    decode_tokens: ?*const fn (self: ?*anyopaque, a_dst: [*c]wuffs_base__token_buffer, a_src: [*c]wuffs_base__io_buffer, a_workbuf: wuffs_base__slice_u8) callconv(.c) wuffs_base__status,
    get_quirk: ?*const fn (self: ?*const anyopaque, a_key: u32) callconv(.c) u64,
    set_quirk: ?*const fn (self: ?*anyopaque, a_key: u32, a_value: u64) callconv(.c) wuffs_base__status,
    workbuf_len: ?*const fn (self: ?*const anyopaque) callconv(.c) wuffs_base__range_ii_u64,
};
pub const wuffs_base__token_decoder__func_ptrs = struct_wuffs_base__token_decoder__func_ptrs__struct;
pub const struct_wuffs_base__token_decoder__struct = opaque {
    pub const wuffs_base__token_decoder__decode_tokens = __root.wuffs_base__token_decoder__decode_tokens;
    pub const wuffs_base__token_decoder__get_quirk = __root.wuffs_base__token_decoder__get_quirk;
    pub const wuffs_base__token_decoder__set_quirk = __root.wuffs_base__token_decoder__set_quirk;
    pub const wuffs_base__token_decoder__workbuf_len = __root.wuffs_base__token_decoder__workbuf_len;
    pub const tokens = __root.wuffs_base__token_decoder__decode_tokens;
    pub const quirk = __root.wuffs_base__token_decoder__get_quirk;
    pub const len = __root.wuffs_base__token_decoder__workbuf_len;
};
pub const wuffs_base__token_decoder = struct_wuffs_base__token_decoder__struct;
pub extern fn wuffs_base__token_decoder__decode_tokens(self: ?*wuffs_base__token_decoder, a_dst: [*c]wuffs_base__token_buffer, a_src: [*c]wuffs_base__io_buffer, a_workbuf: wuffs_base__slice_u8) wuffs_base__status;
pub extern fn wuffs_base__token_decoder__get_quirk(self: ?*const wuffs_base__token_decoder, a_key: u32) u64;
pub extern fn wuffs_base__token_decoder__set_quirk(self: ?*wuffs_base__token_decoder, a_key: u32, a_value: u64) wuffs_base__status;
pub extern fn wuffs_base__token_decoder__workbuf_len(self: ?*const wuffs_base__token_decoder) wuffs_base__range_ii_u64;
pub const struct_wuffs_adler32__hasher__struct = opaque {
    pub const wuffs_adler32__hasher__initialize = __root.wuffs_adler32__hasher__initialize;
    pub const wuffs_adler32__hasher__upcast_as__wuffs_base__hasher_u32 = __root.wuffs_adler32__hasher__upcast_as__wuffs_base__hasher_u32;
    pub const wuffs_adler32__hasher__get_quirk = __root.wuffs_adler32__hasher__get_quirk;
    pub const wuffs_adler32__hasher__set_quirk = __root.wuffs_adler32__hasher__set_quirk;
    pub const wuffs_adler32__hasher__update = __root.wuffs_adler32__hasher__update;
    pub const wuffs_adler32__hasher__update_u32 = __root.wuffs_adler32__hasher__update_u32;
    pub const wuffs_adler32__hasher__checksum_u32 = __root.wuffs_adler32__hasher__checksum_u32;
    pub const initialize = __root.wuffs_adler32__hasher__initialize;
    pub const @"u32" = __root.wuffs_adler32__hasher__upcast_as__wuffs_base__hasher_u32;
    pub const quirk = __root.wuffs_adler32__hasher__get_quirk;
    pub const update = __root.wuffs_adler32__hasher__update;
};
pub const wuffs_adler32__hasher = struct_wuffs_adler32__hasher__struct;
pub extern fn wuffs_adler32__hasher__initialize(self: ?*wuffs_adler32__hasher, sizeof_star_self: usize, wuffs_version: u64, options: u32) wuffs_base__status;
pub extern fn sizeof__wuffs_adler32__hasher() usize;
pub extern fn wuffs_adler32__hasher__alloc() ?*wuffs_adler32__hasher;
pub fn wuffs_adler32__hasher__alloc_as__wuffs_base__hasher_u32() callconv(.c) ?*wuffs_base__hasher_u32 {
    return @ptrCast(@alignCast(wuffs_adler32__hasher__alloc()));
}
pub fn wuffs_adler32__hasher__upcast_as__wuffs_base__hasher_u32(arg_p: ?*wuffs_adler32__hasher) callconv(.c) ?*wuffs_base__hasher_u32 {
    var p = arg_p;
    _ = &p;
    return @ptrCast(@alignCast(p));
}
pub extern fn wuffs_adler32__hasher__get_quirk(self: ?*const wuffs_adler32__hasher, a_key: u32) u64;
pub extern fn wuffs_adler32__hasher__set_quirk(self: ?*wuffs_adler32__hasher, a_key: u32, a_value: u64) wuffs_base__status;
pub extern fn wuffs_adler32__hasher__update(self: ?*wuffs_adler32__hasher, a_x: wuffs_base__slice_u8) wuffs_base__empty_struct;
pub extern fn wuffs_adler32__hasher__update_u32(self: ?*wuffs_adler32__hasher, a_x: wuffs_base__slice_u8) u32;
pub extern fn wuffs_adler32__hasher__checksum_u32(self: ?*const wuffs_adler32__hasher) u32;
pub const struct_wuffs_crc32__ieee_hasher__struct = opaque {
    pub const wuffs_crc32__ieee_hasher__initialize = __root.wuffs_crc32__ieee_hasher__initialize;
    pub const wuffs_crc32__ieee_hasher__upcast_as__wuffs_base__hasher_u32 = __root.wuffs_crc32__ieee_hasher__upcast_as__wuffs_base__hasher_u32;
    pub const wuffs_crc32__ieee_hasher__get_quirk = __root.wuffs_crc32__ieee_hasher__get_quirk;
    pub const wuffs_crc32__ieee_hasher__set_quirk = __root.wuffs_crc32__ieee_hasher__set_quirk;
    pub const wuffs_crc32__ieee_hasher__update = __root.wuffs_crc32__ieee_hasher__update;
    pub const wuffs_crc32__ieee_hasher__update_u32 = __root.wuffs_crc32__ieee_hasher__update_u32;
    pub const wuffs_crc32__ieee_hasher__checksum_u32 = __root.wuffs_crc32__ieee_hasher__checksum_u32;
    pub const initialize = __root.wuffs_crc32__ieee_hasher__initialize;
    pub const @"u32" = __root.wuffs_crc32__ieee_hasher__upcast_as__wuffs_base__hasher_u32;
    pub const quirk = __root.wuffs_crc32__ieee_hasher__get_quirk;
    pub const update = __root.wuffs_crc32__ieee_hasher__update;
};
pub const wuffs_crc32__ieee_hasher = struct_wuffs_crc32__ieee_hasher__struct;
pub extern fn wuffs_crc32__ieee_hasher__initialize(self: ?*wuffs_crc32__ieee_hasher, sizeof_star_self: usize, wuffs_version: u64, options: u32) wuffs_base__status;
pub extern fn sizeof__wuffs_crc32__ieee_hasher() usize;
pub extern fn wuffs_crc32__ieee_hasher__alloc() ?*wuffs_crc32__ieee_hasher;
pub fn wuffs_crc32__ieee_hasher__alloc_as__wuffs_base__hasher_u32() callconv(.c) ?*wuffs_base__hasher_u32 {
    return @ptrCast(@alignCast(wuffs_crc32__ieee_hasher__alloc()));
}
pub fn wuffs_crc32__ieee_hasher__upcast_as__wuffs_base__hasher_u32(arg_p: ?*wuffs_crc32__ieee_hasher) callconv(.c) ?*wuffs_base__hasher_u32 {
    var p = arg_p;
    _ = &p;
    return @ptrCast(@alignCast(p));
}
pub extern fn wuffs_crc32__ieee_hasher__get_quirk(self: ?*const wuffs_crc32__ieee_hasher, a_key: u32) u64;
pub extern fn wuffs_crc32__ieee_hasher__set_quirk(self: ?*wuffs_crc32__ieee_hasher, a_key: u32, a_value: u64) wuffs_base__status;
pub extern fn wuffs_crc32__ieee_hasher__update(self: ?*wuffs_crc32__ieee_hasher, a_x: wuffs_base__slice_u8) wuffs_base__empty_struct;
pub extern fn wuffs_crc32__ieee_hasher__update_u32(self: ?*wuffs_crc32__ieee_hasher, a_x: wuffs_base__slice_u8) u32;
pub extern fn wuffs_crc32__ieee_hasher__checksum_u32(self: ?*const wuffs_crc32__ieee_hasher) u32;
pub const wuffs_deflate__error__bad_huffman_code_over_subscribed: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_deflate__error__bad_huffman_code_over_subscribed",
});
pub const wuffs_deflate__error__bad_huffman_code_under_subscribed: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_deflate__error__bad_huffman_code_under_subscribed",
});
pub const wuffs_deflate__error__bad_huffman_code_length_count: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_deflate__error__bad_huffman_code_length_count",
});
pub const wuffs_deflate__error__bad_huffman_code_length_repetition: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_deflate__error__bad_huffman_code_length_repetition",
});
pub const wuffs_deflate__error__bad_huffman_code: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_deflate__error__bad_huffman_code",
});
pub const wuffs_deflate__error__bad_huffman_minimum_code_length: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_deflate__error__bad_huffman_minimum_code_length",
});
pub const wuffs_deflate__error__bad_block: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_deflate__error__bad_block",
});
pub const wuffs_deflate__error__bad_distance: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_deflate__error__bad_distance",
});
pub const wuffs_deflate__error__bad_distance_code_count: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_deflate__error__bad_distance_code_count",
});
pub const wuffs_deflate__error__bad_literal_length_code_count: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_deflate__error__bad_literal_length_code_count",
});
pub const wuffs_deflate__error__inconsistent_stored_block_length: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_deflate__error__inconsistent_stored_block_length",
});
pub const wuffs_deflate__error__missing_end_of_block_code: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_deflate__error__missing_end_of_block_code",
});
pub const wuffs_deflate__error__no_huffman_codes: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_deflate__error__no_huffman_codes",
});
pub const wuffs_deflate__error__truncated_input: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_deflate__error__truncated_input",
});
pub const struct_wuffs_deflate__decoder__struct = opaque {
    pub const wuffs_deflate__decoder__initialize = __root.wuffs_deflate__decoder__initialize;
    pub const wuffs_deflate__decoder__upcast_as__wuffs_base__io_transformer = __root.wuffs_deflate__decoder__upcast_as__wuffs_base__io_transformer;
    pub const wuffs_deflate__decoder__add_history = __root.wuffs_deflate__decoder__add_history;
    pub const wuffs_deflate__decoder__get_quirk = __root.wuffs_deflate__decoder__get_quirk;
    pub const wuffs_deflate__decoder__set_quirk = __root.wuffs_deflate__decoder__set_quirk;
    pub const wuffs_deflate__decoder__dst_history_retain_length = __root.wuffs_deflate__decoder__dst_history_retain_length;
    pub const wuffs_deflate__decoder__workbuf_len = __root.wuffs_deflate__decoder__workbuf_len;
    pub const wuffs_deflate__decoder__transform_io = __root.wuffs_deflate__decoder__transform_io;
    pub const initialize = __root.wuffs_deflate__decoder__initialize;
    pub const transformer = __root.wuffs_deflate__decoder__upcast_as__wuffs_base__io_transformer;
    pub const history = __root.wuffs_deflate__decoder__add_history;
    pub const quirk = __root.wuffs_deflate__decoder__get_quirk;
    pub const length = __root.wuffs_deflate__decoder__dst_history_retain_length;
    pub const len = __root.wuffs_deflate__decoder__workbuf_len;
    pub const io = __root.wuffs_deflate__decoder__transform_io;
};
pub const wuffs_deflate__decoder = struct_wuffs_deflate__decoder__struct;
pub extern fn wuffs_deflate__decoder__initialize(self: ?*wuffs_deflate__decoder, sizeof_star_self: usize, wuffs_version: u64, options: u32) wuffs_base__status;
pub extern fn sizeof__wuffs_deflate__decoder() usize;
pub extern fn wuffs_deflate__decoder__alloc() ?*wuffs_deflate__decoder;
pub fn wuffs_deflate__decoder__alloc_as__wuffs_base__io_transformer() callconv(.c) ?*wuffs_base__io_transformer {
    return @ptrCast(@alignCast(wuffs_deflate__decoder__alloc()));
}
pub fn wuffs_deflate__decoder__upcast_as__wuffs_base__io_transformer(arg_p: ?*wuffs_deflate__decoder) callconv(.c) ?*wuffs_base__io_transformer {
    var p = arg_p;
    _ = &p;
    return @ptrCast(@alignCast(p));
}
pub extern fn wuffs_deflate__decoder__add_history(self: ?*wuffs_deflate__decoder, a_hist: wuffs_base__slice_u8) wuffs_base__empty_struct;
pub extern fn wuffs_deflate__decoder__get_quirk(self: ?*const wuffs_deflate__decoder, a_key: u32) u64;
pub extern fn wuffs_deflate__decoder__set_quirk(self: ?*wuffs_deflate__decoder, a_key: u32, a_value: u64) wuffs_base__status;
pub extern fn wuffs_deflate__decoder__dst_history_retain_length(self: ?*const wuffs_deflate__decoder) wuffs_base__optional_u63;
pub extern fn wuffs_deflate__decoder__workbuf_len(self: ?*const wuffs_deflate__decoder) wuffs_base__range_ii_u64;
pub extern fn wuffs_deflate__decoder__transform_io(self: ?*wuffs_deflate__decoder, a_dst: [*c]wuffs_base__io_buffer, a_src: [*c]wuffs_base__io_buffer, a_workbuf: wuffs_base__slice_u8) wuffs_base__status;
pub const wuffs_jpeg__error__bad_dht_marker: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_jpeg__error__bad_dht_marker",
});
pub const wuffs_jpeg__error__bad_dqt_marker: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_jpeg__error__bad_dqt_marker",
});
pub const wuffs_jpeg__error__bad_dri_marker: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_jpeg__error__bad_dri_marker",
});
pub const wuffs_jpeg__error__bad_sof_marker: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_jpeg__error__bad_sof_marker",
});
pub const wuffs_jpeg__error__bad_sos_marker: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_jpeg__error__bad_sos_marker",
});
pub const wuffs_jpeg__error__bad_header: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_jpeg__error__bad_header",
});
pub const wuffs_jpeg__error__bad_marker: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_jpeg__error__bad_marker",
});
pub const wuffs_jpeg__error__bad_scan_count: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_jpeg__error__bad_scan_count",
});
pub const wuffs_jpeg__error__missing_huffman_table: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_jpeg__error__missing_huffman_table",
});
pub const wuffs_jpeg__error__missing_quantization_table: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_jpeg__error__missing_quantization_table",
});
pub const wuffs_jpeg__error__rejected_progressive_jpeg: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_jpeg__error__rejected_progressive_jpeg",
});
pub const wuffs_jpeg__error__short_sos_bitstream: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_jpeg__error__short_sos_bitstream",
});
pub const wuffs_jpeg__error__truncated_input: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_jpeg__error__truncated_input",
});
pub const wuffs_jpeg__error__unsupported_arithmetic_coding: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_jpeg__error__unsupported_arithmetic_coding",
});
pub const wuffs_jpeg__error__unsupported_color_model: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_jpeg__error__unsupported_color_model",
});
pub const wuffs_jpeg__error__unsupported_fractional_sampling: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_jpeg__error__unsupported_fractional_sampling",
});
pub const wuffs_jpeg__error__unsupported_hierarchical_coding: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_jpeg__error__unsupported_hierarchical_coding",
});
pub const wuffs_jpeg__error__unsupported_implicit_height: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_jpeg__error__unsupported_implicit_height",
});
pub const wuffs_jpeg__error__unsupported_lossless_coding: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_jpeg__error__unsupported_lossless_coding",
});
pub const wuffs_jpeg__error__unsupported_marker: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_jpeg__error__unsupported_marker",
});
pub const wuffs_jpeg__error__unsupported_precision_12_bits: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_jpeg__error__unsupported_precision_12_bits",
});
pub const wuffs_jpeg__error__unsupported_precision_16_bits: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_jpeg__error__unsupported_precision_16_bits",
});
pub const wuffs_jpeg__error__unsupported_precision: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_jpeg__error__unsupported_precision",
});
pub const wuffs_jpeg__error__unsupported_scan_count: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_jpeg__error__unsupported_scan_count",
});
pub const struct_wuffs_jpeg__decoder__struct = opaque {
    pub const wuffs_jpeg__decoder__initialize = __root.wuffs_jpeg__decoder__initialize;
    pub const wuffs_jpeg__decoder__upcast_as__wuffs_base__image_decoder = __root.wuffs_jpeg__decoder__upcast_as__wuffs_base__image_decoder;
    pub const wuffs_jpeg__decoder__get_quirk = __root.wuffs_jpeg__decoder__get_quirk;
    pub const wuffs_jpeg__decoder__set_quirk = __root.wuffs_jpeg__decoder__set_quirk;
    pub const wuffs_jpeg__decoder__decode_image_config = __root.wuffs_jpeg__decoder__decode_image_config;
    pub const wuffs_jpeg__decoder__decode_frame_config = __root.wuffs_jpeg__decoder__decode_frame_config;
    pub const wuffs_jpeg__decoder__decode_frame = __root.wuffs_jpeg__decoder__decode_frame;
    pub const wuffs_jpeg__decoder__frame_dirty_rect = __root.wuffs_jpeg__decoder__frame_dirty_rect;
    pub const wuffs_jpeg__decoder__num_animation_loops = __root.wuffs_jpeg__decoder__num_animation_loops;
    pub const wuffs_jpeg__decoder__num_decoded_frame_configs = __root.wuffs_jpeg__decoder__num_decoded_frame_configs;
    pub const wuffs_jpeg__decoder__num_decoded_frames = __root.wuffs_jpeg__decoder__num_decoded_frames;
    pub const wuffs_jpeg__decoder__restart_frame = __root.wuffs_jpeg__decoder__restart_frame;
    pub const wuffs_jpeg__decoder__set_report_metadata = __root.wuffs_jpeg__decoder__set_report_metadata;
    pub const wuffs_jpeg__decoder__tell_me_more = __root.wuffs_jpeg__decoder__tell_me_more;
    pub const wuffs_jpeg__decoder__workbuf_len = __root.wuffs_jpeg__decoder__workbuf_len;
    pub const initialize = __root.wuffs_jpeg__decoder__initialize;
    pub const decoder = __root.wuffs_jpeg__decoder__upcast_as__wuffs_base__image_decoder;
    pub const quirk = __root.wuffs_jpeg__decoder__get_quirk;
    pub const config = __root.wuffs_jpeg__decoder__decode_image_config;
    pub const frame = __root.wuffs_jpeg__decoder__decode_frame;
    pub const rect = __root.wuffs_jpeg__decoder__frame_dirty_rect;
    pub const loops = __root.wuffs_jpeg__decoder__num_animation_loops;
    pub const configs = __root.wuffs_jpeg__decoder__num_decoded_frame_configs;
    pub const frames = __root.wuffs_jpeg__decoder__num_decoded_frames;
    pub const metadata = __root.wuffs_jpeg__decoder__set_report_metadata;
    pub const more = __root.wuffs_jpeg__decoder__tell_me_more;
    pub const len = __root.wuffs_jpeg__decoder__workbuf_len;
};
pub const wuffs_jpeg__decoder = struct_wuffs_jpeg__decoder__struct;
pub extern fn wuffs_jpeg__decoder__initialize(self: ?*wuffs_jpeg__decoder, sizeof_star_self: usize, wuffs_version: u64, options: u32) wuffs_base__status;
pub extern fn sizeof__wuffs_jpeg__decoder() usize;
pub extern fn wuffs_jpeg__decoder__alloc() ?*wuffs_jpeg__decoder;
pub fn wuffs_jpeg__decoder__alloc_as__wuffs_base__image_decoder() callconv(.c) ?*wuffs_base__image_decoder {
    return @ptrCast(@alignCast(wuffs_jpeg__decoder__alloc()));
}
pub fn wuffs_jpeg__decoder__upcast_as__wuffs_base__image_decoder(arg_p: ?*wuffs_jpeg__decoder) callconv(.c) ?*wuffs_base__image_decoder {
    var p = arg_p;
    _ = &p;
    return @ptrCast(@alignCast(p));
}
pub extern fn wuffs_jpeg__decoder__get_quirk(self: ?*const wuffs_jpeg__decoder, a_key: u32) u64;
pub extern fn wuffs_jpeg__decoder__set_quirk(self: ?*wuffs_jpeg__decoder, a_key: u32, a_value: u64) wuffs_base__status;
pub extern fn wuffs_jpeg__decoder__decode_image_config(self: ?*wuffs_jpeg__decoder, a_dst: [*c]wuffs_base__image_config, a_src: [*c]wuffs_base__io_buffer) wuffs_base__status;
pub extern fn wuffs_jpeg__decoder__decode_frame_config(self: ?*wuffs_jpeg__decoder, a_dst: [*c]wuffs_base__frame_config, a_src: [*c]wuffs_base__io_buffer) wuffs_base__status;
pub extern fn wuffs_jpeg__decoder__decode_frame(self: ?*wuffs_jpeg__decoder, a_dst: [*c]wuffs_base__pixel_buffer, a_src: [*c]wuffs_base__io_buffer, a_blend: wuffs_base__pixel_blend, a_workbuf: wuffs_base__slice_u8, a_opts: [*c]wuffs_base__decode_frame_options) wuffs_base__status;
pub extern fn wuffs_jpeg__decoder__frame_dirty_rect(self: ?*const wuffs_jpeg__decoder) wuffs_base__rect_ie_u32;
pub extern fn wuffs_jpeg__decoder__num_animation_loops(self: ?*const wuffs_jpeg__decoder) u32;
pub extern fn wuffs_jpeg__decoder__num_decoded_frame_configs(self: ?*const wuffs_jpeg__decoder) u64;
pub extern fn wuffs_jpeg__decoder__num_decoded_frames(self: ?*const wuffs_jpeg__decoder) u64;
pub extern fn wuffs_jpeg__decoder__restart_frame(self: ?*wuffs_jpeg__decoder, a_index: u64, a_io_position: u64) wuffs_base__status;
pub extern fn wuffs_jpeg__decoder__set_report_metadata(self: ?*wuffs_jpeg__decoder, a_fourcc: u32, a_report: bool) wuffs_base__empty_struct;
pub extern fn wuffs_jpeg__decoder__tell_me_more(self: ?*wuffs_jpeg__decoder, a_dst: [*c]wuffs_base__io_buffer, a_minfo: [*c]wuffs_base__more_information, a_src: [*c]wuffs_base__io_buffer) wuffs_base__status;
pub extern fn wuffs_jpeg__decoder__workbuf_len(self: ?*const wuffs_jpeg__decoder) wuffs_base__range_ii_u64;
pub const wuffs_zlib__note__dictionary_required: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_zlib__note__dictionary_required",
});
pub const wuffs_zlib__error__bad_checksum: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_zlib__error__bad_checksum",
});
pub const wuffs_zlib__error__bad_compression_method: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_zlib__error__bad_compression_method",
});
pub const wuffs_zlib__error__bad_compression_window_size: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_zlib__error__bad_compression_window_size",
});
pub const wuffs_zlib__error__bad_parity_check: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_zlib__error__bad_parity_check",
});
pub const wuffs_zlib__error__incorrect_dictionary: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_zlib__error__incorrect_dictionary",
});
pub const wuffs_zlib__error__truncated_input: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_zlib__error__truncated_input",
});
pub const struct_wuffs_zlib__decoder__struct = opaque {
    pub const wuffs_zlib__decoder__initialize = __root.wuffs_zlib__decoder__initialize;
    pub const wuffs_zlib__decoder__upcast_as__wuffs_base__io_transformer = __root.wuffs_zlib__decoder__upcast_as__wuffs_base__io_transformer;
    pub const wuffs_zlib__decoder__dictionary_id = __root.wuffs_zlib__decoder__dictionary_id;
    pub const wuffs_zlib__decoder__add_dictionary = __root.wuffs_zlib__decoder__add_dictionary;
    pub const wuffs_zlib__decoder__get_quirk = __root.wuffs_zlib__decoder__get_quirk;
    pub const wuffs_zlib__decoder__set_quirk = __root.wuffs_zlib__decoder__set_quirk;
    pub const wuffs_zlib__decoder__dst_history_retain_length = __root.wuffs_zlib__decoder__dst_history_retain_length;
    pub const wuffs_zlib__decoder__workbuf_len = __root.wuffs_zlib__decoder__workbuf_len;
    pub const wuffs_zlib__decoder__transform_io = __root.wuffs_zlib__decoder__transform_io;
    pub const initialize = __root.wuffs_zlib__decoder__initialize;
    pub const transformer = __root.wuffs_zlib__decoder__upcast_as__wuffs_base__io_transformer;
    pub const id = __root.wuffs_zlib__decoder__dictionary_id;
    pub const dictionary = __root.wuffs_zlib__decoder__add_dictionary;
    pub const quirk = __root.wuffs_zlib__decoder__get_quirk;
    pub const length = __root.wuffs_zlib__decoder__dst_history_retain_length;
    pub const len = __root.wuffs_zlib__decoder__workbuf_len;
    pub const io = __root.wuffs_zlib__decoder__transform_io;
};
pub const wuffs_zlib__decoder = struct_wuffs_zlib__decoder__struct;
pub extern fn wuffs_zlib__decoder__initialize(self: ?*wuffs_zlib__decoder, sizeof_star_self: usize, wuffs_version: u64, options: u32) wuffs_base__status;
pub extern fn sizeof__wuffs_zlib__decoder() usize;
pub extern fn wuffs_zlib__decoder__alloc() ?*wuffs_zlib__decoder;
pub fn wuffs_zlib__decoder__alloc_as__wuffs_base__io_transformer() callconv(.c) ?*wuffs_base__io_transformer {
    return @ptrCast(@alignCast(wuffs_zlib__decoder__alloc()));
}
pub fn wuffs_zlib__decoder__upcast_as__wuffs_base__io_transformer(arg_p: ?*wuffs_zlib__decoder) callconv(.c) ?*wuffs_base__io_transformer {
    var p = arg_p;
    _ = &p;
    return @ptrCast(@alignCast(p));
}
pub extern fn wuffs_zlib__decoder__dictionary_id(self: ?*const wuffs_zlib__decoder) u32;
pub extern fn wuffs_zlib__decoder__add_dictionary(self: ?*wuffs_zlib__decoder, a_dict: wuffs_base__slice_u8) wuffs_base__empty_struct;
pub extern fn wuffs_zlib__decoder__get_quirk(self: ?*const wuffs_zlib__decoder, a_key: u32) u64;
pub extern fn wuffs_zlib__decoder__set_quirk(self: ?*wuffs_zlib__decoder, a_key: u32, a_value: u64) wuffs_base__status;
pub extern fn wuffs_zlib__decoder__dst_history_retain_length(self: ?*const wuffs_zlib__decoder) wuffs_base__optional_u63;
pub extern fn wuffs_zlib__decoder__workbuf_len(self: ?*const wuffs_zlib__decoder) wuffs_base__range_ii_u64;
pub extern fn wuffs_zlib__decoder__transform_io(self: ?*wuffs_zlib__decoder, a_dst: [*c]wuffs_base__io_buffer, a_src: [*c]wuffs_base__io_buffer, a_workbuf: wuffs_base__slice_u8) wuffs_base__status;
pub const wuffs_png__error__bad_animation_sequence_number: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_png__error__bad_animation_sequence_number",
});
pub const wuffs_png__error__bad_checksum: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_png__error__bad_checksum",
});
pub const wuffs_png__error__bad_chunk: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_png__error__bad_chunk",
});
pub const wuffs_png__error__bad_filter: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_png__error__bad_filter",
});
pub const wuffs_png__error__bad_header: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_png__error__bad_header",
});
pub const wuffs_png__error__bad_text_chunk_not_latin_1: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_png__error__bad_text_chunk_not_latin_1",
});
pub const wuffs_png__error__missing_palette: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_png__error__missing_palette",
});
pub const wuffs_png__error__truncated_input: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_png__error__truncated_input",
});
pub const wuffs_png__error__unsupported_cgbi_extension: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_png__error__unsupported_cgbi_extension",
});
pub const wuffs_png__error__unsupported_png_compression_method: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_png__error__unsupported_png_compression_method",
});
pub const wuffs_png__error__unsupported_png_file: [*c]const u8 = @extern([*c]const u8, .{
    .name = "wuffs_png__error__unsupported_png_file",
});
pub const struct_wuffs_png__decoder__struct = opaque {
    pub const wuffs_png__decoder__initialize = __root.wuffs_png__decoder__initialize;
    pub const wuffs_png__decoder__upcast_as__wuffs_base__image_decoder = __root.wuffs_png__decoder__upcast_as__wuffs_base__image_decoder;
    pub const wuffs_png__decoder__get_quirk = __root.wuffs_png__decoder__get_quirk;
    pub const wuffs_png__decoder__set_quirk = __root.wuffs_png__decoder__set_quirk;
    pub const wuffs_png__decoder__decode_image_config = __root.wuffs_png__decoder__decode_image_config;
    pub const wuffs_png__decoder__decode_frame_config = __root.wuffs_png__decoder__decode_frame_config;
    pub const wuffs_png__decoder__decode_frame = __root.wuffs_png__decoder__decode_frame;
    pub const wuffs_png__decoder__frame_dirty_rect = __root.wuffs_png__decoder__frame_dirty_rect;
    pub const wuffs_png__decoder__num_animation_loops = __root.wuffs_png__decoder__num_animation_loops;
    pub const wuffs_png__decoder__num_decoded_frame_configs = __root.wuffs_png__decoder__num_decoded_frame_configs;
    pub const wuffs_png__decoder__num_decoded_frames = __root.wuffs_png__decoder__num_decoded_frames;
    pub const wuffs_png__decoder__restart_frame = __root.wuffs_png__decoder__restart_frame;
    pub const wuffs_png__decoder__set_report_metadata = __root.wuffs_png__decoder__set_report_metadata;
    pub const wuffs_png__decoder__tell_me_more = __root.wuffs_png__decoder__tell_me_more;
    pub const wuffs_png__decoder__workbuf_len = __root.wuffs_png__decoder__workbuf_len;
    pub const initialize = __root.wuffs_png__decoder__initialize;
    pub const decoder = __root.wuffs_png__decoder__upcast_as__wuffs_base__image_decoder;
    pub const quirk = __root.wuffs_png__decoder__get_quirk;
    pub const config = __root.wuffs_png__decoder__decode_image_config;
    pub const frame = __root.wuffs_png__decoder__decode_frame;
    pub const rect = __root.wuffs_png__decoder__frame_dirty_rect;
    pub const loops = __root.wuffs_png__decoder__num_animation_loops;
    pub const configs = __root.wuffs_png__decoder__num_decoded_frame_configs;
    pub const frames = __root.wuffs_png__decoder__num_decoded_frames;
    pub const metadata = __root.wuffs_png__decoder__set_report_metadata;
    pub const more = __root.wuffs_png__decoder__tell_me_more;
    pub const len = __root.wuffs_png__decoder__workbuf_len;
};
pub const wuffs_png__decoder = struct_wuffs_png__decoder__struct;
pub extern fn wuffs_png__decoder__initialize(self: ?*wuffs_png__decoder, sizeof_star_self: usize, wuffs_version: u64, options: u32) wuffs_base__status;
pub extern fn sizeof__wuffs_png__decoder() usize;
pub extern fn wuffs_png__decoder__alloc() ?*wuffs_png__decoder;
pub fn wuffs_png__decoder__alloc_as__wuffs_base__image_decoder() callconv(.c) ?*wuffs_base__image_decoder {
    return @ptrCast(@alignCast(wuffs_png__decoder__alloc()));
}
pub fn wuffs_png__decoder__upcast_as__wuffs_base__image_decoder(arg_p: ?*wuffs_png__decoder) callconv(.c) ?*wuffs_base__image_decoder {
    var p = arg_p;
    _ = &p;
    return @ptrCast(@alignCast(p));
}
pub extern fn wuffs_png__decoder__get_quirk(self: ?*const wuffs_png__decoder, a_key: u32) u64;
pub extern fn wuffs_png__decoder__set_quirk(self: ?*wuffs_png__decoder, a_key: u32, a_value: u64) wuffs_base__status;
pub extern fn wuffs_png__decoder__decode_image_config(self: ?*wuffs_png__decoder, a_dst: [*c]wuffs_base__image_config, a_src: [*c]wuffs_base__io_buffer) wuffs_base__status;
pub extern fn wuffs_png__decoder__decode_frame_config(self: ?*wuffs_png__decoder, a_dst: [*c]wuffs_base__frame_config, a_src: [*c]wuffs_base__io_buffer) wuffs_base__status;
pub extern fn wuffs_png__decoder__decode_frame(self: ?*wuffs_png__decoder, a_dst: [*c]wuffs_base__pixel_buffer, a_src: [*c]wuffs_base__io_buffer, a_blend: wuffs_base__pixel_blend, a_workbuf: wuffs_base__slice_u8, a_opts: [*c]wuffs_base__decode_frame_options) wuffs_base__status;
pub extern fn wuffs_png__decoder__frame_dirty_rect(self: ?*const wuffs_png__decoder) wuffs_base__rect_ie_u32;
pub extern fn wuffs_png__decoder__num_animation_loops(self: ?*const wuffs_png__decoder) u32;
pub extern fn wuffs_png__decoder__num_decoded_frame_configs(self: ?*const wuffs_png__decoder) u64;
pub extern fn wuffs_png__decoder__num_decoded_frames(self: ?*const wuffs_png__decoder) u64;
pub extern fn wuffs_png__decoder__restart_frame(self: ?*wuffs_png__decoder, a_index: u64, a_io_position: u64) wuffs_base__status;
pub extern fn wuffs_png__decoder__set_report_metadata(self: ?*wuffs_png__decoder, a_fourcc: u32, a_report: bool) wuffs_base__empty_struct;
pub extern fn wuffs_png__decoder__tell_me_more(self: ?*wuffs_png__decoder, a_dst: [*c]wuffs_base__io_buffer, a_minfo: [*c]wuffs_base__more_information, a_src: [*c]wuffs_base__io_buffer) wuffs_base__status;
pub extern fn wuffs_png__decoder__workbuf_len(self: ?*const wuffs_png__decoder) wuffs_base__range_ii_u64;

pub const __VERSION__ = "Aro 0.0.0";
pub const __Aro__ = "";
pub const __STDC__ = @as(c_int, 1);
pub const __STDC_HOSTED__ = @as(c_int, 0);
pub const __STDC_UTF_16__ = @as(c_int, 1);
pub const __STDC_UTF_32__ = @as(c_int, 1);
pub const __STDC_EMBED_NOT_FOUND__ = @as(c_int, 0);
pub const __STDC_EMBED_FOUND__ = @as(c_int, 1);
pub const __STDC_EMBED_EMPTY__ = @as(c_int, 2);
pub const __STDC_VERSION__ = @as(c_long, 201710);
pub const __GNUC__ = @as(c_int, 4);
pub const __GNUC_MINOR__ = @as(c_int, 2);
pub const __GNUC_PATCHLEVEL__ = @as(c_int, 1);
pub const __ARO_EMULATE_NO__ = @as(c_int, 0);
pub const __ARO_EMULATE_CLANG__ = @as(c_int, 1);
pub const __ARO_EMULATE_GCC__ = @as(c_int, 2);
pub const __ARO_EMULATE_MSVC__ = @as(c_int, 3);
pub const __ARO_EMULATE__ = __ARO_EMULATE_CLANG__;
pub inline fn __building_module(x: anytype) @TypeOf(@as(c_int, 0)) {
    _ = &x;
    return @as(c_int, 0);
}
pub const __OPTIMIZE__ = @as(c_int, 1);
pub const __OPTIMIZE_SIZE__ = @as(c_int, 1);
pub const __wasm = @as(c_int, 1);
pub const __wasm__ = @as(c_int, 1);
pub const __wasm64 = @as(c_int, 1);
pub const __wasm64__ = @as(c_int, 1);
pub const __wasm_bulk_memory_opt__ = @as(c_int, 1);
pub const __wasm_call_indirect_overlong__ = @as(c_int, 1);
pub const __wasm_extended_const__ = @as(c_int, 1);
pub const __wasm_multivalue__ = @as(c_int, 1);
pub const __wasm_mutable_globals__ = @as(c_int, 1);
pub const __wasm_nontrapping_fptoint__ = @as(c_int, 1);
pub const __wasm_sign_ext__ = @as(c_int, 1);
pub const _LP64 = @as(c_int, 1);
pub const __LP64__ = @as(c_int, 1);
pub const __FLOAT128__ = @as(c_int, 1);
pub const __ORDER_LITTLE_ENDIAN__ = @as(c_int, 1234);
pub const __ORDER_BIG_ENDIAN__ = @as(c_int, 4321);
pub const __ORDER_PDP_ENDIAN__ = @as(c_int, 3412);
pub const __BYTE_ORDER__ = __ORDER_LITTLE_ENDIAN__;
pub const __LITTLE_ENDIAN__ = @as(c_int, 1);
pub const __ATOMIC_RELAXED = @as(c_int, 0);
pub const __ATOMIC_CONSUME = @as(c_int, 1);
pub const __ATOMIC_ACQUIRE = @as(c_int, 2);
pub const __ATOMIC_RELEASE = @as(c_int, 3);
pub const __ATOMIC_ACQ_REL = @as(c_int, 4);
pub const __ATOMIC_SEQ_CST = @as(c_int, 5);
pub const __ATOMIC_BOOL_LOCK_FREE = @as(c_int, 1);
pub const __ATOMIC_CHAR_LOCK_FREE = @as(c_int, 1);
pub const __ATOMIC_CHAR16_T_LOCK_FREE = @as(c_int, 1);
pub const __ATOMIC_CHAR32_T_LOCK_FREE = @as(c_int, 1);
pub const __ATOMIC_WCHAR_T_LOCK_FREE = @as(c_int, 1);
pub const __ATOMIC_WINT_T_LOCK_FREE = @as(c_int, 1);
pub const __ATOMIC_SHORT_LOCK_FREE = @as(c_int, 1);
pub const __ATOMIC_INT_LOCK_FREE = @as(c_int, 1);
pub const __ATOMIC_LONG_LOCK_FREE = @as(c_int, 1);
pub const __ATOMIC_LLONG_LOCK_FREE = @as(c_int, 1);
pub const __ATOMIC_POINTER_LOCK_FREE = @as(c_int, 1);
pub const __CHAR_BIT__ = @as(c_int, 8);
pub const __BOOL_WIDTH__ = @as(c_int, 8);
pub const __SCHAR_MAX__ = @as(c_int, 127);
pub const __SCHAR_WIDTH__ = @as(c_int, 8);
pub const __SHRT_MAX__ = @as(c_int, 32767);
pub const __SHRT_WIDTH__ = @as(c_int, 16);
pub const __INT_MAX__ = __helpers.promoteIntLiteral(c_int, 2147483647, .decimal);
pub const __INT_WIDTH__ = @as(c_int, 32);
pub const __LONG_MAX__ = __helpers.promoteIntLiteral(c_long, 9223372036854775807, .decimal);
pub const __LONG_WIDTH__ = @as(c_int, 64);
pub const __LONG_LONG_MAX__ = @as(c_longlong, 9223372036854775807);
pub const __LONG_LONG_WIDTH__ = @as(c_int, 64);
pub const __WCHAR_MAX__ = __helpers.promoteIntLiteral(c_int, 2147483647, .decimal);
pub const __WCHAR_WIDTH__ = @as(c_int, 32);
pub const __WINT_MAX__ = __helpers.promoteIntLiteral(c_int, 2147483647, .decimal);
pub const __WINT_WIDTH__ = @as(c_int, 32);
pub const __INTMAX_MAX__ = @as(c_longlong, 9223372036854775807);
pub const __INTMAX_WIDTH__ = @as(c_int, 64);
pub const __SIZE_MAX__ = __helpers.promoteIntLiteral(c_ulong, 18446744073709551615, .decimal);
pub const __SIZE_WIDTH__ = @as(c_int, 64);
pub const __UINTMAX_MAX__ = @as(c_ulonglong, 18446744073709551615);
pub const __UINTMAX_WIDTH__ = @as(c_int, 64);
pub const __PTRDIFF_MAX__ = __helpers.promoteIntLiteral(c_long, 9223372036854775807, .decimal);
pub const __PTRDIFF_WIDTH__ = @as(c_int, 64);
pub const __INTPTR_MAX__ = __helpers.promoteIntLiteral(c_long, 9223372036854775807, .decimal);
pub const __INTPTR_WIDTH__ = @as(c_int, 64);
pub const __UINTPTR_MAX__ = __helpers.promoteIntLiteral(c_ulong, 18446744073709551615, .decimal);
pub const __UINTPTR_WIDTH__ = @as(c_int, 64);
pub const __SIG_ATOMIC_MAX__ = __helpers.promoteIntLiteral(c_long, 9223372036854775807, .decimal);
pub const __SIG_ATOMIC_WIDTH__ = @as(c_int, 64);
pub const __BITINT_MAXWIDTH__ = __helpers.promoteIntLiteral(c_int, 65535, .decimal);
pub const __SIZEOF_FLOAT__ = @as(c_int, 4);
pub const __SIZEOF_DOUBLE__ = @as(c_int, 8);
pub const __SIZEOF_LONG_DOUBLE__ = @as(c_int, 16);
pub const __SIZEOF_SHORT__ = @as(c_int, 2);
pub const __SIZEOF_INT__ = @as(c_int, 4);
pub const __SIZEOF_LONG__ = @as(c_int, 8);
pub const __SIZEOF_LONG_LONG__ = @as(c_int, 8);
pub const __SIZEOF_POINTER__ = @as(c_int, 8);
pub const __SIZEOF_PTRDIFF_T__ = @as(c_int, 8);
pub const __SIZEOF_SIZE_T__ = @as(c_int, 8);
pub const __SIZEOF_WCHAR_T__ = @as(c_int, 4);
pub const __SIZEOF_WINT_T__ = @as(c_int, 4);
pub const __SIZEOF_INT128__ = @as(c_int, 16);
pub const __INTPTR_TYPE__ = c_long;
pub const __UINTPTR_TYPE__ = c_ulong;
pub const __INTMAX_TYPE__ = c_longlong;
pub const __INTMAX_C_SUFFIX__ = @compileError("unable to translate macro: undefined identifier `L`");
// <builtin>:105:9
pub const __INTMAX_C = __helpers.L_SUFFIX;
pub const __UINTMAX_TYPE__ = c_ulonglong;
pub const __UINTMAX_C_SUFFIX__ = @compileError("unable to translate macro: undefined identifier `UL`");
// <builtin>:108:9
pub const __UINTMAX_C = __helpers.UL_SUFFIX;
pub const __PTRDIFF_TYPE__ = c_long;
pub const __SIZE_TYPE__ = c_ulong;
pub const __WCHAR_TYPE__ = c_int;
pub const __WINT_TYPE__ = c_int;
pub const __CHAR16_TYPE__ = c_ushort;
pub const __CHAR32_TYPE__ = c_uint;
pub const __INT8_TYPE__ = i8;
pub const __INT8_FMTd__ = "hhd";
pub const __INT8_FMTi__ = "hhi";
pub const __INT8_C_SUFFIX__ = "";
pub inline fn __INT8_C(c: anytype) @TypeOf(c) {
    _ = &c;
    return c;
}
pub const __INT16_TYPE__ = c_short;
pub const __INT16_FMTd__ = "hd";
pub const __INT16_FMTi__ = "hi";
pub const __INT16_C_SUFFIX__ = "";
pub inline fn __INT16_C(c: anytype) @TypeOf(c) {
    _ = &c;
    return c;
}
pub const __INT32_TYPE__ = c_int;
pub const __INT32_FMTd__ = "d";
pub const __INT32_FMTi__ = "i";
pub const __INT32_C_SUFFIX__ = "";
pub inline fn __INT32_C(c: anytype) @TypeOf(c) {
    _ = &c;
    return c;
}
pub const __INT64_TYPE__ = c_longlong;
pub const __INT64_FMTd__ = "lld";
pub const __INT64_FMTi__ = "lli";
pub const __INT64_C_SUFFIX__ = @compileError("unable to translate macro: undefined identifier `LL`");
// <builtin>:134:9
pub const __INT64_C = __helpers.LL_SUFFIX;
pub const __UINT8_TYPE__ = u8;
pub const __UINT8_FMTo__ = "hho";
pub const __UINT8_FMTu__ = "hhu";
pub const __UINT8_FMTx__ = "hhx";
pub const __UINT8_FMTX__ = "hhX";
pub const __UINT8_C_SUFFIX__ = "";
pub inline fn __UINT8_C(c: anytype) @TypeOf(c) {
    _ = &c;
    return c;
}
pub const __UINT8_MAX__ = @as(c_int, 255);
pub const __INT8_MAX__ = @as(c_int, 127);
pub const __UINT16_TYPE__ = c_ushort;
pub const __UINT16_FMTo__ = "ho";
pub const __UINT16_FMTu__ = "hu";
pub const __UINT16_FMTx__ = "hx";
pub const __UINT16_FMTX__ = "hX";
pub const __UINT16_C_SUFFIX__ = "";
pub inline fn __UINT16_C(c: anytype) @TypeOf(c) {
    _ = &c;
    return c;
}
pub const __UINT16_MAX__ = __helpers.promoteIntLiteral(c_int, 65535, .decimal);
pub const __INT16_MAX__ = @as(c_int, 32767);
pub const __UINT32_TYPE__ = c_uint;
pub const __UINT32_FMTo__ = "o";
pub const __UINT32_FMTu__ = "u";
pub const __UINT32_FMTx__ = "x";
pub const __UINT32_FMTX__ = "X";
pub const __UINT32_C_SUFFIX__ = @compileError("unable to translate macro: undefined identifier `U`");
// <builtin>:159:9
pub const __UINT32_C = __helpers.U_SUFFIX;
pub const __UINT32_MAX__ = __helpers.promoteIntLiteral(c_uint, 4294967295, .decimal);
pub const __INT32_MAX__ = __helpers.promoteIntLiteral(c_int, 2147483647, .decimal);
pub const __UINT64_TYPE__ = c_ulonglong;
pub const __UINT64_FMTo__ = "llo";
pub const __UINT64_FMTu__ = "llu";
pub const __UINT64_FMTx__ = "llx";
pub const __UINT64_FMTX__ = "llX";
pub const __UINT64_C_SUFFIX__ = @compileError("unable to translate macro: undefined identifier `ULL`");
// <builtin>:168:9
pub const __UINT64_C = __helpers.ULL_SUFFIX;
pub const __UINT64_MAX__ = @as(c_ulonglong, 18446744073709551615);
pub const __INT64_MAX__ = @as(c_longlong, 9223372036854775807);
pub const __INT_LEAST8_TYPE__ = i8;
pub const __INT_LEAST8_MAX__ = @as(c_int, 127);
pub const __INT_LEAST8_WIDTH__ = @as(c_int, 8);
pub const INT_LEAST8_FMTd__ = "hhd";
pub const INT_LEAST8_FMTi__ = "hhi";
pub const __UINT_LEAST8_TYPE__ = u8;
pub const __UINT_LEAST8_MAX__ = @as(c_int, 255);
pub const UINT_LEAST8_FMTo__ = "hho";
pub const UINT_LEAST8_FMTu__ = "hhu";
pub const UINT_LEAST8_FMTx__ = "hhx";
pub const UINT_LEAST8_FMTX__ = "hhX";
pub const __INT_FAST8_TYPE__ = i8;
pub const __INT_FAST8_MAX__ = @as(c_int, 127);
pub const __INT_FAST8_WIDTH__ = @as(c_int, 8);
pub const INT_FAST8_FMTd__ = "hhd";
pub const INT_FAST8_FMTi__ = "hhi";
pub const __UINT_FAST8_TYPE__ = u8;
pub const __UINT_FAST8_MAX__ = @as(c_int, 255);
pub const UINT_FAST8_FMTo__ = "hho";
pub const UINT_FAST8_FMTu__ = "hhu";
pub const UINT_FAST8_FMTx__ = "hhx";
pub const UINT_FAST8_FMTX__ = "hhX";
pub const __INT_LEAST16_TYPE__ = c_short;
pub const __INT_LEAST16_MAX__ = @as(c_int, 32767);
pub const __INT_LEAST16_WIDTH__ = @as(c_int, 16);
pub const INT_LEAST16_FMTd__ = "hd";
pub const INT_LEAST16_FMTi__ = "hi";
pub const __UINT_LEAST16_TYPE__ = c_ushort;
pub const __UINT_LEAST16_MAX__ = __helpers.promoteIntLiteral(c_int, 65535, .decimal);
pub const UINT_LEAST16_FMTo__ = "ho";
pub const UINT_LEAST16_FMTu__ = "hu";
pub const UINT_LEAST16_FMTx__ = "hx";
pub const UINT_LEAST16_FMTX__ = "hX";
pub const __INT_FAST16_TYPE__ = c_short;
pub const __INT_FAST16_MAX__ = @as(c_int, 32767);
pub const __INT_FAST16_WIDTH__ = @as(c_int, 16);
pub const INT_FAST16_FMTd__ = "hd";
pub const INT_FAST16_FMTi__ = "hi";
pub const __UINT_FAST16_TYPE__ = c_ushort;
pub const __UINT_FAST16_MAX__ = __helpers.promoteIntLiteral(c_int, 65535, .decimal);
pub const UINT_FAST16_FMTo__ = "ho";
pub const UINT_FAST16_FMTu__ = "hu";
pub const UINT_FAST16_FMTx__ = "hx";
pub const UINT_FAST16_FMTX__ = "hX";
pub const __INT_LEAST32_TYPE__ = c_int;
pub const __INT_LEAST32_MAX__ = __helpers.promoteIntLiteral(c_int, 2147483647, .decimal);
pub const __INT_LEAST32_WIDTH__ = @as(c_int, 32);
pub const INT_LEAST32_FMTd__ = "d";
pub const INT_LEAST32_FMTi__ = "i";
pub const __UINT_LEAST32_TYPE__ = c_uint;
pub const __UINT_LEAST32_MAX__ = __helpers.promoteIntLiteral(c_uint, 4294967295, .decimal);
pub const UINT_LEAST32_FMTo__ = "o";
pub const UINT_LEAST32_FMTu__ = "u";
pub const UINT_LEAST32_FMTx__ = "x";
pub const UINT_LEAST32_FMTX__ = "X";
pub const __INT_FAST32_TYPE__ = c_int;
pub const __INT_FAST32_MAX__ = __helpers.promoteIntLiteral(c_int, 2147483647, .decimal);
pub const __INT_FAST32_WIDTH__ = @as(c_int, 32);
pub const INT_FAST32_FMTd__ = "d";
pub const INT_FAST32_FMTi__ = "i";
pub const __UINT_FAST32_TYPE__ = c_uint;
pub const __UINT_FAST32_MAX__ = __helpers.promoteIntLiteral(c_uint, 4294967295, .decimal);
pub const UINT_FAST32_FMTo__ = "o";
pub const UINT_FAST32_FMTu__ = "u";
pub const UINT_FAST32_FMTx__ = "x";
pub const UINT_FAST32_FMTX__ = "X";
pub const __INT_LEAST64_TYPE__ = c_longlong;
pub const __INT_LEAST64_MAX__ = @as(c_longlong, 9223372036854775807);
pub const __INT_LEAST64_WIDTH__ = @as(c_int, 64);
pub const INT_LEAST64_FMTd__ = "lld";
pub const INT_LEAST64_FMTi__ = "lli";
pub const __UINT_LEAST64_TYPE__ = c_ulonglong;
pub const __UINT_LEAST64_MAX__ = @as(c_ulonglong, 18446744073709551615);
pub const UINT_LEAST64_FMTo__ = "llo";
pub const UINT_LEAST64_FMTu__ = "llu";
pub const UINT_LEAST64_FMTx__ = "llx";
pub const UINT_LEAST64_FMTX__ = "llX";
pub const __INT_FAST64_TYPE__ = c_longlong;
pub const __INT_FAST64_MAX__ = @as(c_longlong, 9223372036854775807);
pub const __INT_FAST64_WIDTH__ = @as(c_int, 64);
pub const INT_FAST64_FMTd__ = "lld";
pub const INT_FAST64_FMTi__ = "lli";
pub const __UINT_FAST64_TYPE__ = c_ulonglong;
pub const __UINT_FAST64_MAX__ = @as(c_ulonglong, 18446744073709551615);
pub const UINT_FAST64_FMTo__ = "llo";
pub const UINT_FAST64_FMTu__ = "llu";
pub const UINT_FAST64_FMTx__ = "llx";
pub const UINT_FAST64_FMTX__ = "llX";
pub const __FLT_DENORM_MIN__ = @as(f32, 1.40129846e-45);
pub const __FLT_HAS_DENORM__ = "";
pub const __FLT_DIG__ = @as(c_int, 6);
pub const __FLT_DECIMAL_DIG__ = @as(c_int, 9);
pub const __FLT_EPSILON__ = @as(f32, 1.19209290e-7);
pub const __FLT_HAS_INFINITY__ = "";
pub const __FLT_HAS_QUIET_NAN__ = "";
pub const __FLT_MANT_DIG__ = @as(c_int, 24);
pub const __FLT_MAX_10_EXP__ = @as(c_int, 38);
pub const __FLT_MAX_EXP__ = @as(c_int, 128);
pub const __FLT_MAX__ = @as(f32, 3.40282347e+38);
pub const __FLT_MIN_10_EXP__ = -@as(c_int, 37);
pub const __FLT_MIN_EXP__ = -@as(c_int, 125);
pub const __FLT_MIN__ = @as(f32, 1.17549435e-38);
pub const __DBL_DENORM_MIN__ = @as(f64, 4.9406564584124654e-324);
pub const __DBL_HAS_DENORM__ = "";
pub const __DBL_DIG__ = @as(c_int, 15);
pub const __DBL_DECIMAL_DIG__ = @as(c_int, 17);
pub const __DBL_EPSILON__ = @as(f64, 2.2204460492503131e-16);
pub const __DBL_HAS_INFINITY__ = "";
pub const __DBL_HAS_QUIET_NAN__ = "";
pub const __DBL_MANT_DIG__ = @as(c_int, 53);
pub const __DBL_MAX_10_EXP__ = @as(c_int, 308);
pub const __DBL_MAX_EXP__ = @as(c_int, 1024);
pub const __DBL_MAX__ = @as(f64, 1.7976931348623157e+308);
pub const __DBL_MIN_10_EXP__ = -@as(c_int, 307);
pub const __DBL_MIN_EXP__ = -@as(c_int, 1021);
pub const __DBL_MIN__ = @as(f64, 2.2250738585072014e-308);
pub const __LDBL_DENORM_MIN__ = @as(c_longdouble, 6.47517511943802511092443895822764655e-4966);
pub const __LDBL_HAS_DENORM__ = "";
pub const __LDBL_DIG__ = @as(c_int, 33);
pub const __LDBL_DECIMAL_DIG__ = @as(c_int, 36);
pub const __LDBL_EPSILON__ = @as(c_longdouble, 1.92592994438723585305597794258492732e-34);
pub const __LDBL_HAS_INFINITY__ = "";
pub const __LDBL_HAS_QUIET_NAN__ = "";
pub const __LDBL_MANT_DIG__ = @as(c_int, 113);
pub const __LDBL_MAX_10_EXP__ = @as(c_int, 4932);
pub const __LDBL_MAX_EXP__ = @as(c_int, 16384);
pub const __LDBL_MAX__ = @as(c_longdouble, 1.18973149535723176508575932662800702e+4932);
pub const __LDBL_MIN_10_EXP__ = -@as(c_int, 4931);
pub const __LDBL_MIN_EXP__ = -@as(c_int, 16381);
pub const __LDBL_MIN__ = @as(c_longdouble, 3.36210314311209350626267781732175260e-4932);
pub const __FLT_EVAL_METHOD__ = @as(c_int, 0);
pub const __FLT_RADIX__ = @as(c_int, 2);
pub const __DECIMAL_DIG__ = __LDBL_DECIMAL_DIG__;
pub const NDEBUG = @as(c_int, 1);
pub const WUFFS_CONFIG__MODULES = "";
pub const WUFFS_CONFIG__MODULE__AUX__BASE = "";
pub const WUFFS_CONFIG__MODULE__AUX__IMAGE = "";
pub const WUFFS_CONFIG__MODULE__BASE = "";
pub const WUFFS_CONFIG__MODULE__ADLER32 = "";
pub const WUFFS_CONFIG__MODULE__CRC32 = "";
pub const WUFFS_CONFIG__MODULE__DEFLATE = "";
pub const WUFFS_CONFIG__MODULE__JPEG = "";
pub const WUFFS_CONFIG__MODULE__PNG = "";
pub const WUFFS_CONFIG__MODULE__ZLIB = "";
pub const WUFFS_INCLUDE_GUARD = "";
pub const @"bool" = bool;
pub const @"true" = @as(c_int, 1);
pub const @"false" = @as(c_int, 0);
pub const __bool_true_false_are_defined = @as(c_int, 1);
pub const __stdint_int_c_cat = @compileError("unable to translate C expr: unexpected token '##'");
// /tmp/claude-1000/-home-daug-dev-dolly/86b87808-da65-4872-b669-6778327e525c/scratchpad/vtgen/ghostty/zig-pkg/aro-0.0.0-JSD1Qk8rOQDnuVcD4jAwMpHitA6pADRKzQ7M7hKRwxvD/include/stdint.h:12:9
pub inline fn __stdint_int_c(V: anytype, SUFFIX: anytype) @TypeOf(__stdint_int_c_cat(V, SUFFIX)) {
    _ = &V;
    _ = &SUFFIX;
    return __stdint_int_c_cat(V, SUFFIX);
}
pub const __stdint_uint_c = @compileError("unable to translate macro: undefined identifier `U`");
// /tmp/claude-1000/-home-daug-dev-dolly/86b87808-da65-4872-b669-6778327e525c/scratchpad/vtgen/ghostty/zig-pkg/aro-0.0.0-JSD1Qk8rOQDnuVcD4jAwMpHitA6pADRKzQ7M7hKRwxvD/include/stdint.h:14:9
pub const INTPTR_MIN = -__INTPTR_MAX__ - @as(c_int, 1);
pub const INTPTR_MAX = __INTPTR_MAX__;
pub const UINTPTR_MAX = __UINTPTR_MAX__;
pub const PTRDIFF_MIN = -__PTRDIFF_MAX__ - @as(c_int, 1);
pub const PTRDIFF_MAX = __PTRDIFF_MAX__;
pub const SIZE_MAX = __SIZE_MAX__;
pub const INTMAX_MIN = -__INTMAX_MAX__ - @as(c_int, 1);
pub const INTMAX_MAX = __INTMAX_MAX__;
pub const UINTMAX_MAX = __UINTMAX_MAX__;
pub const __intptr_t_defined = "";
pub const _INTPTR_T = "";
pub const _UINTPTR_T = "";
pub const __int64_c_suffix = __INT64_C_SUFFIX__;
pub inline fn INT64_C(v: anytype) @TypeOf(__stdint_int_c(v, __int64_c_suffix)) {
    _ = &v;
    return __stdint_int_c(v, __int64_c_suffix);
}
pub inline fn UINT64_C(v: anytype) @TypeOf(__stdint_uint_c(v, __int64_c_suffix)) {
    _ = &v;
    return __stdint_uint_c(v, __int64_c_suffix);
}
pub const INT64_MAX = INT64_C(__helpers.promoteIntLiteral(c_int, 9223372036854775807, .decimal));
pub const INT64_MIN = -INT64_C(__helpers.promoteIntLiteral(c_int, 9223372036854775807, .decimal)) - @as(c_int, 1);
pub const UINT64_MAX = UINT64_C(__helpers.promoteIntLiteral(c_int, 18446744073709551615, .decimal));
pub const __int32_c_suffix = "";
pub inline fn INT32_C(v: anytype) @TypeOf(__stdint_int_c(v, __int32_c_suffix)) {
    _ = &v;
    return __stdint_int_c(v, __int32_c_suffix);
}
pub inline fn UINT32_C(v: anytype) @TypeOf(__stdint_uint_c(v, __int32_c_suffix)) {
    _ = &v;
    return __stdint_uint_c(v, __int32_c_suffix);
}
pub const INT32_MAX = INT32_C(__helpers.promoteIntLiteral(c_int, 2147483647, .decimal));
pub const INT32_MIN = -INT32_C(__helpers.promoteIntLiteral(c_int, 2147483647, .decimal)) - @as(c_int, 1);
pub const UINT32_MAX = UINT32_C(__helpers.promoteIntLiteral(c_int, 4294967295, .decimal));
pub const __int16_c_suffix = "";
pub inline fn INT16_C(v: anytype) @TypeOf(__stdint_int_c(v, __int16_c_suffix)) {
    _ = &v;
    return __stdint_int_c(v, __int16_c_suffix);
}
pub inline fn UINT16_C(v: anytype) @TypeOf(__stdint_uint_c(v, __int16_c_suffix)) {
    _ = &v;
    return __stdint_uint_c(v, __int16_c_suffix);
}
pub const INT16_MAX = INT16_C(@as(c_int, 32767));
pub const INT16_MIN = -INT16_C(@as(c_int, 32767)) - @as(c_int, 1);
pub const UINT16_MAX = UINT16_C(__helpers.promoteIntLiteral(c_int, 65535, .decimal));
pub const __int8_c_suffix = "";
pub inline fn INT8_C(v: anytype) @TypeOf(__stdint_int_c(v, __int8_c_suffix)) {
    _ = &v;
    return __stdint_int_c(v, __int8_c_suffix);
}
pub inline fn UINT8_C(v: anytype) @TypeOf(__stdint_uint_c(v, __int8_c_suffix)) {
    _ = &v;
    return __stdint_uint_c(v, __int8_c_suffix);
}
pub const INT8_MAX = INT8_C(@as(c_int, 127));
pub const INT8_MIN = -INT8_C(@as(c_int, 127)) - @as(c_int, 1);
pub const UINT8_MAX = UINT8_C(@as(c_int, 255));
pub const INT_LEAST8_MAX = __INT_LEAST8_MAX__;
pub const INT_LEAST8_MIN = -__INT_LEAST8_MAX__ - @as(c_int, 1);
pub const UINT_LEAST8_MAX = __UINT_LEAST8_MAX__;
pub const INT_LEAST16_MAX = __INT_LEAST16_MAX__;
pub const INT_LEAST16_MIN = -__INT_LEAST16_MAX__ - @as(c_int, 1);
pub const UINT_LEAST16_MAX = __UINT_LEAST16_MAX__;
pub const INT_LEAST32_MAX = __INT_LEAST32_MAX__;
pub const INT_LEAST32_MIN = -__INT_LEAST32_MAX__ - @as(c_int, 1);
pub const UINT_LEAST32_MAX = __UINT_LEAST32_MAX__;
pub const INT_LEAST64_MAX = __INT_LEAST64_MAX__;
pub const INT_LEAST64_MIN = -__INT_LEAST64_MAX__ - @as(c_int, 1);
pub const UINT_LEAST64_MAX = __UINT_LEAST64_MAX__;
pub const INT_FAST8_MAX = __INT_FAST8_MAX__;
pub const INT_FAST8_MIN = -__INT_FAST8_MAX__ - @as(c_int, 1);
pub const UINT_FAST8_MAX = __UINT_FAST8_MAX__;
pub const INT_FAST16_MAX = __INT_FAST16_MAX__;
pub const INT_FAST16_MIN = -__INT_FAST16_MAX__ - @as(c_int, 1);
pub const UINT_FAST16_MAX = __UINT_FAST16_MAX__;
pub const INT_FAST32_MAX = __INT_FAST32_MAX__;
pub const INT_FAST32_MIN = -__INT_FAST32_MAX__ - @as(c_int, 1);
pub const UINT_FAST32_MAX = __UINT_FAST32_MAX__;
pub const INT_FAST64_MAX = __INT_FAST64_MAX__;
pub const INT_FAST64_MIN = -__INT_FAST64_MAX__ - @as(c_int, 1);
pub const UINT_FAST64_MAX = __UINT_FAST64_MAX__;
pub const UINT128_MAX = __helpers.cast(uint128_t, -@as(c_int, 1));
pub const INT128_MAX = __helpers.cast(int128_t, __helpers.div(UINT128_MAX, @as(c_int, 2)));
pub const INT128_MIN = -INT128_MAX - @as(c_int, 1);
pub const UINT_LEAST128_MAX = UINT128_MAX;
pub const INT_LEAST128_MAX = INT128_MAX;
pub const INT_LEAST128_MIN = INT128_MIN;
pub const UINT_FAST128_MAX = UINT128_MAX;
pub const INT_FAST128_MAX = INT128_MAX;
pub const INT_FAST128_MIN = INT128_MIN;
pub const INT128_WIDTH = @as(c_int, 128);
pub const UINT128_WIDTH = @as(c_int, 128);
pub const INT_LEAST128_WIDTH = @as(c_int, 128);
pub const UINT_LEAST128_WIDTH = @as(c_int, 128);
pub const INT_FAST128_WIDTH = @as(c_int, 128);
pub const UINT_FAST128_WIDTH = @as(c_int, 128);
pub const INT128_C = @compileError("unable to translate macro: undefined identifier `WB`");
// /tmp/claude-1000/-home-daug-dev-dolly/86b87808-da65-4872-b669-6778327e525c/scratchpad/vtgen/ghostty/zig-pkg/aro-0.0.0-JSD1Qk8rOQDnuVcD4jAwMpHitA6pADRKzQ7M7hKRwxvD/include/stdint.h:281:11
pub const UINT128_C = @compileError("unable to translate macro: undefined identifier `WBU`");
// /tmp/claude-1000/-home-daug-dev-dolly/86b87808-da65-4872-b669-6778327e525c/scratchpad/vtgen/ghostty/zig-pkg/aro-0.0.0-JSD1Qk8rOQDnuVcD4jAwMpHitA6pADRKzQ7M7hKRwxvD/include/stdint.h:282:11
pub const GHOSTTY_WUFFS_STDLIB_H = "";
pub const __STDC_VERSION_STDDEF_H__ = @as(c_long, 202311);
pub const NULL = __helpers.cast(?*anyopaque, @as(c_int, 0));
pub const offsetof = @compileError("unable to translate macro: undefined identifier `__builtin_offsetof`");
// /tmp/claude-1000/-home-daug-dev-dolly/86b87808-da65-4872-b669-6778327e525c/scratchpad/vtgen/ghostty/zig-pkg/aro-0.0.0-JSD1Qk8rOQDnuVcD4jAwMpHitA6pADRKzQ7M7hKRwxvD/include/stddef.h:18:9
pub const GHOSTTY_WUFFS_STRING_H = "";
pub const WUFFS_VERSION = __helpers.promoteIntLiteral(c_int, 0x000040000, .hex);
pub const WUFFS_VERSION_MAJOR = @as(c_int, 0);
pub const WUFFS_VERSION_MINOR = @as(c_int, 4);
pub const WUFFS_VERSION_PATCH = @as(c_int, 0);
pub const WUFFS_VERSION_PRE_RELEASE_LABEL = "alpha.10";
pub const WUFFS_VERSION_BUILD_METADATA_COMMIT_COUNT = @as(c_int, 3966);
pub const WUFFS_VERSION_BUILD_METADATA_COMMIT_DATE = __helpers.promoteIntLiteral(c_int, 20260623, .decimal);
pub const WUFFS_VERSION_STRING = "0.4.0-alpha.10+3966.20260623";
pub const WUFFS_BASE__MAYBE_ATTRIBUTE_TARGET = @compileError("unable to translate macro: undefined identifier `target`");
// /tmp/claude-1000/-home-daug-dev-dolly/86b87808-da65-4872-b669-6778327e525c/scratchpad/vtgen/ghostty/zig-pkg/N-V-__8AAP5JWgCGP_AD0teWpa4krRvE9VPZzvviGdbmN4jI/release/c/wuffs-v0.4.c:137:9
pub const WUFFS_BASE__MAYBE_STATIC = "";
pub const WUFFS_BASE__FORCE_INLINE = @compileError("unable to translate macro: undefined identifier `__always_inline__`");
// /tmp/claude-1000/-home-daug-dev-dolly/86b87808-da65-4872-b669-6778327e525c/scratchpad/vtgen/ghostty/zig-pkg/N-V-__8AAP5JWgCGP_AD0teWpa4krRvE9VPZzvviGdbmN4jI/release/c/wuffs-v0.4.c:425:9
pub const WUFFS_BASE__POTENTIALLY_UNUSED = @compileError("unable to translate macro: undefined identifier `unused`");
// /tmp/claude-1000/-home-daug-dev-dolly/86b87808-da65-4872-b669-6778327e525c/scratchpad/vtgen/ghostty/zig-pkg/N-V-__8AAP5JWgCGP_AD0teWpa4krRvE9VPZzvviGdbmN4jI/release/c/wuffs-v0.4.c:426:9
pub const WUFFS_BASE__WARN_UNUSED_RESULT = @compileError("unable to translate macro: undefined identifier `warn_unused_result`");
// /tmp/claude-1000/-home-daug-dev-dolly/86b87808-da65-4872-b669-6778327e525c/scratchpad/vtgen/ghostty/zig-pkg/N-V-__8AAP5JWgCGP_AD0teWpa4krRvE9VPZzvviGdbmN4jI/release/c/wuffs-v0.4.c:427:9
pub const WUFFS_BASE__GENERATED_C_CODE = "";
pub const WUFFS_INITIALIZE__DEFAULT_OPTIONS = __helpers.cast(u32, @as(c_int, 0x00000000));
pub const WUFFS_INITIALIZE__ALREADY_ZEROED = __helpers.cast(u32, @as(c_int, 0x00000001));
pub const WUFFS_INITIALIZE__LEAVE_INTERNAL_BUFFERS_UNINITIALIZED = __helpers.cast(u32, @as(c_int, 0x00000002));
pub const WUFFS_BASE__RESULT = @compileError("unable to translate macro: undefined identifier `status`");
// /tmp/claude-1000/-home-daug-dev-dolly/86b87808-da65-4872-b669-6778327e525c/scratchpad/vtgen/ghostty/zig-pkg/N-V-__8AAP5JWgCGP_AD0teWpa4krRvE9VPZzvviGdbmN4jI/release/c/wuffs-v0.4.c:728:9
pub const WUFFS_BASE__FOURCC__ABXR = __helpers.promoteIntLiteral(c_int, 0x41425852, .hex);
pub const WUFFS_BASE__FOURCC__ABXS = __helpers.promoteIntLiteral(c_int, 0x41425853, .hex);
pub const WUFFS_BASE__FOURCC__BGCL = __helpers.promoteIntLiteral(c_int, 0x4247434C, .hex);
pub const WUFFS_BASE__FOURCC__BMP = __helpers.promoteIntLiteral(c_int, 0x424D5020, .hex);
pub const WUFFS_BASE__FOURCC__BRTL = __helpers.promoteIntLiteral(c_int, 0x4252544C, .hex);
pub const WUFFS_BASE__FOURCC__BZ2 = __helpers.promoteIntLiteral(c_int, 0x425A3220, .hex);
pub const WUFFS_BASE__FOURCC__CBOR = __helpers.promoteIntLiteral(c_int, 0x43424F52, .hex);
pub const WUFFS_BASE__FOURCC__CHRM = __helpers.promoteIntLiteral(c_int, 0x4348524D, .hex);
pub const WUFFS_BASE__FOURCC__CSS = __helpers.promoteIntLiteral(c_int, 0x43535320, .hex);
pub const WUFFS_BASE__FOURCC__EPS = __helpers.promoteIntLiteral(c_int, 0x45505320, .hex);
pub const WUFFS_BASE__FOURCC__ETC2 = __helpers.promoteIntLiteral(c_int, 0x45544332, .hex);
pub const WUFFS_BASE__FOURCC__EXIF = __helpers.promoteIntLiteral(c_int, 0x45584946, .hex);
pub const WUFFS_BASE__FOURCC__FLAC = __helpers.promoteIntLiteral(c_int, 0x464C4143, .hex);
pub const WUFFS_BASE__FOURCC__GAMA = __helpers.promoteIntLiteral(c_int, 0x47414D41, .hex);
pub const WUFFS_BASE__FOURCC__GIF = __helpers.promoteIntLiteral(c_int, 0x47494620, .hex);
pub const WUFFS_BASE__FOURCC__GZ = __helpers.promoteIntLiteral(c_int, 0x475A2020, .hex);
pub const WUFFS_BASE__FOURCC__HEIF = __helpers.promoteIntLiteral(c_int, 0x48454946, .hex);
pub const WUFFS_BASE__FOURCC__HNSM = __helpers.promoteIntLiteral(c_int, 0x484E534D, .hex);
pub const WUFFS_BASE__FOURCC__HTML = __helpers.promoteIntLiteral(c_int, 0x48544D4C, .hex);
pub const WUFFS_BASE__FOURCC__ICCP = __helpers.promoteIntLiteral(c_int, 0x49434350, .hex);
pub const WUFFS_BASE__FOURCC__ICO = __helpers.promoteIntLiteral(c_int, 0x49434F20, .hex);
pub const WUFFS_BASE__FOURCC__ICVG = __helpers.promoteIntLiteral(c_int, 0x49435647, .hex);
pub const WUFFS_BASE__FOURCC__INI = __helpers.promoteIntLiteral(c_int, 0x494E4920, .hex);
pub const WUFFS_BASE__FOURCC__JPEG = __helpers.promoteIntLiteral(c_int, 0x4A504547, .hex);
pub const WUFFS_BASE__FOURCC__JS = __helpers.promoteIntLiteral(c_int, 0x4A532020, .hex);
pub const WUFFS_BASE__FOURCC__JSON = __helpers.promoteIntLiteral(c_int, 0x4A534F4E, .hex);
pub const WUFFS_BASE__FOURCC__JWCC = __helpers.promoteIntLiteral(c_int, 0x4A574343, .hex);
pub const WUFFS_BASE__FOURCC__KVP = __helpers.promoteIntLiteral(c_int, 0x4B565020, .hex);
pub const WUFFS_BASE__FOURCC__KVPK = __helpers.promoteIntLiteral(c_int, 0x4B56504B, .hex);
pub const WUFFS_BASE__FOURCC__KVPV = __helpers.promoteIntLiteral(c_int, 0x4B565056, .hex);
pub const WUFFS_BASE__FOURCC__LZ4 = __helpers.promoteIntLiteral(c_int, 0x4C5A3420, .hex);
pub const WUFFS_BASE__FOURCC__LZIP = __helpers.promoteIntLiteral(c_int, 0x4C5A4950, .hex);
pub const WUFFS_BASE__FOURCC__LZMA = __helpers.promoteIntLiteral(c_int, 0x4C5A4D41, .hex);
pub const WUFFS_BASE__FOURCC__MD = __helpers.promoteIntLiteral(c_int, 0x4D442020, .hex);
pub const WUFFS_BASE__FOURCC__MTIM = __helpers.promoteIntLiteral(c_int, 0x4D54494D, .hex);
pub const WUFFS_BASE__FOURCC__MP3 = __helpers.promoteIntLiteral(c_int, 0x4D503320, .hex);
pub const WUFFS_BASE__FOURCC__NIE = __helpers.promoteIntLiteral(c_int, 0x4E494520, .hex);
pub const WUFFS_BASE__FOURCC__NPBM = __helpers.promoteIntLiteral(c_int, 0x4E50424D, .hex);
pub const WUFFS_BASE__FOURCC__OFS2 = __helpers.promoteIntLiteral(c_int, 0x4F465332, .hex);
pub const WUFFS_BASE__FOURCC__OTF = __helpers.promoteIntLiteral(c_int, 0x4F544620, .hex);
pub const WUFFS_BASE__FOURCC__PDF = __helpers.promoteIntLiteral(c_int, 0x50444620, .hex);
pub const WUFFS_BASE__FOURCC__PHYD = __helpers.promoteIntLiteral(c_int, 0x50485944, .hex);
pub const WUFFS_BASE__FOURCC__PNG = __helpers.promoteIntLiteral(c_int, 0x504E4720, .hex);
pub const WUFFS_BASE__FOURCC__PS = __helpers.promoteIntLiteral(c_int, 0x50532020, .hex);
pub const WUFFS_BASE__FOURCC__QOI = __helpers.promoteIntLiteral(c_int, 0x514F4920, .hex);
pub const WUFFS_BASE__FOURCC__RAC = __helpers.promoteIntLiteral(c_int, 0x52414320, .hex);
pub const WUFFS_BASE__FOURCC__RAW = __helpers.promoteIntLiteral(c_int, 0x52415720, .hex);
pub const WUFFS_BASE__FOURCC__RIFF = __helpers.promoteIntLiteral(c_int, 0x52494646, .hex);
pub const WUFFS_BASE__FOURCC__RIGL = __helpers.promoteIntLiteral(c_int, 0x5249474C, .hex);
pub const WUFFS_BASE__FOURCC__SNPY = __helpers.promoteIntLiteral(c_int, 0x534E5059, .hex);
pub const WUFFS_BASE__FOURCC__SRGB = __helpers.promoteIntLiteral(c_int, 0x53524742, .hex);
pub const WUFFS_BASE__FOURCC__SVG = __helpers.promoteIntLiteral(c_int, 0x53564720, .hex);
pub const WUFFS_BASE__FOURCC__TAR = __helpers.promoteIntLiteral(c_int, 0x54415220, .hex);
pub const WUFFS_BASE__FOURCC__TEXT = __helpers.promoteIntLiteral(c_int, 0x54455854, .hex);
pub const WUFFS_BASE__FOURCC__TGA = __helpers.promoteIntLiteral(c_int, 0x54474120, .hex);
pub const WUFFS_BASE__FOURCC__TH = __helpers.promoteIntLiteral(c_int, 0x54482020, .hex);
pub const WUFFS_BASE__FOURCC__TIFF = __helpers.promoteIntLiteral(c_int, 0x54494646, .hex);
pub const WUFFS_BASE__FOURCC__TOML = __helpers.promoteIntLiteral(c_int, 0x544F4D4C, .hex);
pub const WUFFS_BASE__FOURCC__WAVE = __helpers.promoteIntLiteral(c_int, 0x57415645, .hex);
pub const WUFFS_BASE__FOURCC__WBMP = __helpers.promoteIntLiteral(c_int, 0x57424D50, .hex);
pub const WUFFS_BASE__FOURCC__WEBP = __helpers.promoteIntLiteral(c_int, 0x57454250, .hex);
pub const WUFFS_BASE__FOURCC__WOFF = __helpers.promoteIntLiteral(c_int, 0x574F4646, .hex);
pub const WUFFS_BASE__FOURCC__XML = __helpers.promoteIntLiteral(c_int, 0x584D4C20, .hex);
pub const WUFFS_BASE__FOURCC__XMP = __helpers.promoteIntLiteral(c_int, 0x584D5020, .hex);
pub const WUFFS_BASE__FOURCC__XZ = __helpers.promoteIntLiteral(c_int, 0x585A2020, .hex);
pub const WUFFS_BASE__FOURCC__ZIP = __helpers.promoteIntLiteral(c_int, 0x5A495020, .hex);
pub const WUFFS_BASE__FOURCC__ZLIB = __helpers.promoteIntLiteral(c_int, 0x5A4C4942, .hex);
pub const WUFFS_BASE__FOURCC__ZSTD = __helpers.promoteIntLiteral(c_int, 0x5A535444, .hex);
pub const WUFFS_BASE__QUIRK_IGNORE_CHECKSUM = @as(c_int, 1);
pub const WUFFS_BASE__QUIRK_QUALITY = @as(c_int, 2);
pub const WUFFS_BASE__QUIRK_SOURCE_LENGTH = @as(c_int, 3);
pub const WUFFS_BASE__FLICKS_PER_SECOND = __helpers.cast(u64, __helpers.promoteIntLiteral(c_int, 705600000, .decimal));
pub const WUFFS_BASE__FLICKS_PER_MILLISECOND = __helpers.cast(u64, __helpers.promoteIntLiteral(c_int, 705600, .decimal));
pub const wuffs_base__peek_u8be__no_bounds_check = wuffs_base__peek_u8__no_bounds_check;
pub const wuffs_base__peek_u8le__no_bounds_check = wuffs_base__peek_u8__no_bounds_check;
pub const wuffs_base__poke_u8be__no_bounds_check = wuffs_base__poke_u8__no_bounds_check;
pub const wuffs_base__poke_u8le__no_bounds_check = wuffs_base__poke_u8__no_bounds_check;
pub const WUFFS_BASE__SLICE = @compileError("unable to translate macro: undefined identifier `ptr`");
// /tmp/claude-1000/-home-daug-dev-dolly/86b87808-da65-4872-b669-6778327e525c/scratchpad/vtgen/ghostty/zig-pkg/N-V-__8AAP5JWgCGP_AD0teWpa4krRvE9VPZzvviGdbmN4jI/release/c/wuffs-v0.4.c:1691:9
pub const WUFFS_BASE__TABLE = @compileError("unable to translate macro: undefined identifier `ptr`");
// /tmp/claude-1000/-home-daug-dev-dolly/86b87808-da65-4872-b669-6778327e525c/scratchpad/vtgen/ghostty/zig-pkg/N-V-__8AAP5JWgCGP_AD0teWpa4krRvE9VPZzvviGdbmN4jI/release/c/wuffs-v0.4.c:1703:9
pub const WUFFS_BASE__QUIRK_QUALITY__VALUE__LOWER_QUALITY = UINT64_MAX;
pub const WUFFS_BASE__QUIRK_QUALITY__VALUE__HIGHER_QUALITY = __helpers.cast(u64, @as(c_int, 1));
pub const WUFFS_BASE__MORE_INFORMATION__FLAVOR__IO_REDIRECT = @as(c_int, 1);
pub const WUFFS_BASE__MORE_INFORMATION__FLAVOR__IO_SEEK = @as(c_int, 2);
pub const WUFFS_BASE__MORE_INFORMATION__FLAVOR__METADATA_RAW_PASSTHROUGH = @as(c_int, 3);
pub const WUFFS_BASE__MORE_INFORMATION__FLAVOR__METADATA_RAW_TRANSFORM = @as(c_int, 4);
pub const WUFFS_BASE__MORE_INFORMATION__FLAVOR__METADATA_PARSED = @as(c_int, 5);
pub const WUFFS_BASE__MORE_INFORMATION__METADATA_PARSED__CHRM__WHITE_X = @as(c_int, 0);
pub const WUFFS_BASE__MORE_INFORMATION__METADATA_PARSED__CHRM__WHITE_Y = @as(c_int, 1);
pub const WUFFS_BASE__MORE_INFORMATION__METADATA_PARSED__CHRM__RED_X = @as(c_int, 2);
pub const WUFFS_BASE__MORE_INFORMATION__METADATA_PARSED__CHRM__RED_Y = @as(c_int, 3);
pub const WUFFS_BASE__MORE_INFORMATION__METADATA_PARSED__CHRM__GREEN_X = @as(c_int, 4);
pub const WUFFS_BASE__MORE_INFORMATION__METADATA_PARSED__CHRM__GREEN_Y = @as(c_int, 5);
pub const WUFFS_BASE__MORE_INFORMATION__METADATA_PARSED__CHRM__BLUE_X = @as(c_int, 6);
pub const WUFFS_BASE__MORE_INFORMATION__METADATA_PARSED__CHRM__BLUE_Y = @as(c_int, 7);
pub const WUFFS_BASE__SRGB_RENDERING_INTENT__PERCEPTUAL = @as(c_int, 0);
pub const WUFFS_BASE__SRGB_RENDERING_INTENT__RELATIVE_COLORIMETRIC = @as(c_int, 1);
pub const WUFFS_BASE__SRGB_RENDERING_INTENT__SATURATION = @as(c_int, 2);
pub const WUFFS_BASE__SRGB_RENDERING_INTENT__ABSOLUTE_COLORIMETRIC = @as(c_int, 3);
pub const WUFFS_BASE__TOKEN__LENGTH__MAX_INCL = __helpers.promoteIntLiteral(c_int, 0xFFFF, .hex);
pub const WUFFS_BASE__TOKEN__VALUE__SHIFT = @as(c_int, 17);
pub const WUFFS_BASE__TOKEN__VALUE_EXTENSION__SHIFT = @as(c_int, 17);
pub const WUFFS_BASE__TOKEN__VALUE_MAJOR__SHIFT = @as(c_int, 42);
pub const WUFFS_BASE__TOKEN__VALUE_MINOR__SHIFT = @as(c_int, 17);
pub const WUFFS_BASE__TOKEN__VALUE_BASE_CATEGORY__SHIFT = @as(c_int, 38);
pub const WUFFS_BASE__TOKEN__VALUE_BASE_DETAIL__SHIFT = @as(c_int, 17);
pub const WUFFS_BASE__TOKEN__CONTINUED__SHIFT = @as(c_int, 16);
pub const WUFFS_BASE__TOKEN__LENGTH__SHIFT = @as(c_int, 0);
pub const WUFFS_BASE__TOKEN__VALUE_EXTENSION__NUM_BITS = @as(c_int, 46);
pub const WUFFS_BASE__TOKEN__VBC__FILLER = @as(c_int, 0);
pub const WUFFS_BASE__TOKEN__VBC__STRUCTURE = @as(c_int, 1);
pub const WUFFS_BASE__TOKEN__VBC__STRING = @as(c_int, 2);
pub const WUFFS_BASE__TOKEN__VBC__UNICODE_CODE_POINT = @as(c_int, 3);
pub const WUFFS_BASE__TOKEN__VBC__LITERAL = @as(c_int, 4);
pub const WUFFS_BASE__TOKEN__VBC__NUMBER = @as(c_int, 5);
pub const WUFFS_BASE__TOKEN__VBC__INLINE_INTEGER_SIGNED = @as(c_int, 6);
pub const WUFFS_BASE__TOKEN__VBC__INLINE_INTEGER_UNSIGNED = @as(c_int, 7);
pub const WUFFS_BASE__TOKEN__VBD__FILLER__PUNCTUATION = @as(c_int, 0x00001);
pub const WUFFS_BASE__TOKEN__VBD__FILLER__COMMENT_BLOCK = @as(c_int, 0x00002);
pub const WUFFS_BASE__TOKEN__VBD__FILLER__COMMENT_LINE = @as(c_int, 0x00004);
pub const WUFFS_BASE__TOKEN__VBD__FILLER__COMMENT_ANY = @as(c_int, 0x00006);
pub const WUFFS_BASE__TOKEN__VBD__STRUCTURE__PUSH = @as(c_int, 0x00001);
pub const WUFFS_BASE__TOKEN__VBD__STRUCTURE__POP = @as(c_int, 0x00002);
pub const WUFFS_BASE__TOKEN__VBD__STRUCTURE__FROM_NONE = @as(c_int, 0x00010);
pub const WUFFS_BASE__TOKEN__VBD__STRUCTURE__FROM_LIST = @as(c_int, 0x00020);
pub const WUFFS_BASE__TOKEN__VBD__STRUCTURE__FROM_DICT = @as(c_int, 0x00040);
pub const WUFFS_BASE__TOKEN__VBD__STRUCTURE__TO_NONE = @as(c_int, 0x01000);
pub const WUFFS_BASE__TOKEN__VBD__STRUCTURE__TO_LIST = @as(c_int, 0x02000);
pub const WUFFS_BASE__TOKEN__VBD__STRUCTURE__TO_DICT = @as(c_int, 0x04000);
pub const WUFFS_BASE__TOKEN__VBD__STRING__DEFINITELY_UTF_8 = @as(c_int, 0x00001);
pub const WUFFS_BASE__TOKEN__VBD__STRING__CHAIN_MUST_BE_UTF_8 = @as(c_int, 0x00002);
pub const WUFFS_BASE__TOKEN__VBD__STRING__CHAIN_SHOULD_BE_UTF_8 = @as(c_int, 0x00004);
pub const WUFFS_BASE__TOKEN__VBD__STRING__DEFINITELY_ASCII = @as(c_int, 0x00010);
pub const WUFFS_BASE__TOKEN__VBD__STRING__CHAIN_MUST_BE_ASCII = @as(c_int, 0x00020);
pub const WUFFS_BASE__TOKEN__VBD__STRING__CHAIN_SHOULD_BE_ASCII = @as(c_int, 0x00040);
pub const WUFFS_BASE__TOKEN__VBD__STRING__CONVERT_0_DST_1_SRC_DROP = @as(c_int, 0x00100);
pub const WUFFS_BASE__TOKEN__VBD__STRING__CONVERT_1_DST_1_SRC_COPY = @as(c_int, 0x00200);
pub const WUFFS_BASE__TOKEN__VBD__STRING__CONVERT_1_DST_2_SRC_HEXADECIMAL = @as(c_int, 0x00400);
pub const WUFFS_BASE__TOKEN__VBD__STRING__CONVERT_1_DST_4_SRC_BACKSLASH_X = @as(c_int, 0x00800);
pub const WUFFS_BASE__TOKEN__VBD__STRING__CONVERT_3_DST_4_SRC_BASE_64_STD = @as(c_int, 0x01000);
pub const WUFFS_BASE__TOKEN__VBD__STRING__CONVERT_3_DST_4_SRC_BASE_64_URL = @as(c_int, 0x02000);
pub const WUFFS_BASE__TOKEN__VBD__STRING__CONVERT_4_DST_5_SRC_ASCII_85 = @as(c_int, 0x04000);
pub const WUFFS_BASE__TOKEN__VBD__STRING__CONVERT_5_DST_8_SRC_BASE_32_HEX = __helpers.promoteIntLiteral(c_int, 0x08000, .hex);
pub const WUFFS_BASE__TOKEN__VBD__STRING__CONVERT_5_DST_8_SRC_BASE_32_STD = __helpers.promoteIntLiteral(c_int, 0x10000, .hex);
pub const WUFFS_BASE__TOKEN__VBD__LITERAL__UNDEFINED = @as(c_int, 0x00001);
pub const WUFFS_BASE__TOKEN__VBD__LITERAL__NULL = @as(c_int, 0x00002);
pub const WUFFS_BASE__TOKEN__VBD__LITERAL__FALSE = @as(c_int, 0x00004);
pub const WUFFS_BASE__TOKEN__VBD__LITERAL__TRUE = @as(c_int, 0x00008);
pub const WUFFS_BASE__TOKEN__VBD__NUMBER__CONTENT_FLOATING_POINT = @as(c_int, 0x00001);
pub const WUFFS_BASE__TOKEN__VBD__NUMBER__CONTENT_INTEGER_SIGNED = @as(c_int, 0x00002);
pub const WUFFS_BASE__TOKEN__VBD__NUMBER__CONTENT_INTEGER_UNSIGNED = @as(c_int, 0x00004);
pub const WUFFS_BASE__TOKEN__VBD__NUMBER__CONTENT_NEG_INF = @as(c_int, 0x00010);
pub const WUFFS_BASE__TOKEN__VBD__NUMBER__CONTENT_POS_INF = @as(c_int, 0x00020);
pub const WUFFS_BASE__TOKEN__VBD__NUMBER__CONTENT_NEG_NAN = @as(c_int, 0x00040);
pub const WUFFS_BASE__TOKEN__VBD__NUMBER__CONTENT_POS_NAN = @as(c_int, 0x00080);
pub const WUFFS_BASE__TOKEN__VBD__NUMBER__FORMAT_BINARY_BIG_ENDIAN = @as(c_int, 0x00100);
pub const WUFFS_BASE__TOKEN__VBD__NUMBER__FORMAT_BINARY_LITTLE_ENDIAN = @as(c_int, 0x00200);
pub const WUFFS_BASE__TOKEN__VBD__NUMBER__FORMAT_TEXT = @as(c_int, 0x00400);
pub const WUFFS_BASE__TOKEN__VBD__NUMBER__FORMAT_IGNORE_FIRST_BYTE = @as(c_int, 0x01000);
pub const WUFFS_BASE__IMAGE__DIMENSION_MAX_INCL = __helpers.promoteIntLiteral(c_int, 0xFFFFFF, .hex);
pub const wuffs_base__color_ycc__as__color_u32 = wuffs_base__color_ycc_bt601fr__as__color_u32;
pub const wuffs_base__color_ycc__as__color_u32_abgr = wuffs_base__color_ycc_bt601fr__as__color_u32_abgr;
pub const WUFFS_BASE__PIXEL_BLEND__SRC = __helpers.cast(wuffs_base__pixel_blend, @as(c_int, 0));
pub const WUFFS_BASE__PIXEL_BLEND__SRC_OVER = __helpers.cast(wuffs_base__pixel_blend, @as(c_int, 1));
pub const WUFFS_BASE__PIXEL_ALPHA_TRANSPARENCY__OPAQUE = @as(c_int, 0);
pub const WUFFS_BASE__PIXEL_ALPHA_TRANSPARENCY__NONPREMULTIPLIED_ALPHA = @as(c_int, 1);
pub const WUFFS_BASE__PIXEL_ALPHA_TRANSPARENCY__PREMULTIPLIED_ALPHA = @as(c_int, 2);
pub const WUFFS_BASE__PIXEL_ALPHA_TRANSPARENCY__BINARY_ALPHA = @as(c_int, 3);
pub const WUFFS_BASE__PIXEL_COLORATION__NONE = @as(c_int, 0);
pub const WUFFS_BASE__PIXEL_COLORATION__GRAY = @as(c_int, 1);
pub const WUFFS_BASE__PIXEL_COLORATION__RICH = @as(c_int, 3);
pub const WUFFS_BASE__PIXEL_FORMAT__NUM_PLANES_MAX = @as(c_int, 4);
pub const WUFFS_BASE__PIXEL_FORMAT__NUM_PLANES_MAX_INCL = @as(c_int, 4);
pub const WUFFS_BASE__PIXEL_FORMAT__INDEXED__INDEX_PLANE = @as(c_int, 0);
pub const WUFFS_BASE__PIXEL_FORMAT__INDEXED__COLOR_PLANE = @as(c_int, 3);
pub const WUFFS_BASE__PIXEL_FORMAT__INDEXED__PALETTE_BYTE_LENGTH = @as(c_int, 1024);
pub const WUFFS_BASE__PIXEL_FORMAT__INVALID = @as(c_int, 0x00000000);
pub const WUFFS_BASE__PIXEL_FORMAT__A = __helpers.promoteIntLiteral(c_int, 0x02000008, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__Y = __helpers.promoteIntLiteral(c_int, 0x20000008, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__Y_16LE = __helpers.promoteIntLiteral(c_int, 0x2000000B, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__Y_16BE = __helpers.promoteIntLiteral(c_int, 0x2010000B, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__YA_NONPREMUL = __helpers.promoteIntLiteral(c_int, 0x21000088, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__YA_PREMUL = __helpers.promoteIntLiteral(c_int, 0x22000088, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__YXXX = __helpers.promoteIntLiteral(c_int, 0x30008888, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__YCBCR = __helpers.promoteIntLiteral(c_int, 0x40020888, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__YCBCRA_NONPREMUL = __helpers.promoteIntLiteral(c_int, 0x41038888, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__YCBCRK = __helpers.promoteIntLiteral(c_int, 0x50038888, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__YCOCG = __helpers.promoteIntLiteral(c_int, 0x60020888, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__YCOCGA_NONPREMUL = __helpers.promoteIntLiteral(c_int, 0x61038888, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__YCOCGK = __helpers.promoteIntLiteral(c_int, 0x70038888, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__INDEXED__BGRA_NONPREMUL = __helpers.promoteIntLiteral(c_int, 0x81040008, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__INDEXED__BGRA_PREMUL = __helpers.promoteIntLiteral(c_int, 0x82040008, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__INDEXED__BGRA_BINARY = __helpers.promoteIntLiteral(c_int, 0x83040008, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__BGR_565 = __helpers.promoteIntLiteral(c_int, 0x80000565, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__BGR = __helpers.promoteIntLiteral(c_int, 0x80000888, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__BGRA_NONPREMUL = __helpers.promoteIntLiteral(c_int, 0x81008888, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__BGRA_NONPREMUL_4X16LE = __helpers.promoteIntLiteral(c_int, 0x8100BBBB, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__BGRA_PREMUL = __helpers.promoteIntLiteral(c_int, 0x82008888, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__BGRA_PREMUL_4X16LE = __helpers.promoteIntLiteral(c_int, 0x8200BBBB, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__BGRA_BINARY = __helpers.promoteIntLiteral(c_int, 0x83008888, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__BGRX = __helpers.promoteIntLiteral(c_int, 0x90008888, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__RGB = __helpers.promoteIntLiteral(c_int, 0xA0000888, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__RGBA_NONPREMUL = __helpers.promoteIntLiteral(c_int, 0xA1008888, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__RGBA_NONPREMUL_4X16LE = __helpers.promoteIntLiteral(c_int, 0xA100BBBB, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__RGBA_PREMUL = __helpers.promoteIntLiteral(c_int, 0xA2008888, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__RGBA_PREMUL_4X16LE = __helpers.promoteIntLiteral(c_int, 0xA200BBBB, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__RGBA_BINARY = __helpers.promoteIntLiteral(c_int, 0xA3008888, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__RGBX = __helpers.promoteIntLiteral(c_int, 0xB0008888, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__CMY = __helpers.promoteIntLiteral(c_int, 0xC0020888, .hex);
pub const WUFFS_BASE__PIXEL_FORMAT__CMYK = __helpers.promoteIntLiteral(c_int, 0xD0038888, .hex);
pub const WUFFS_BASE__PIXEL_SUBSAMPLING__NONE = @as(c_int, 0x00000000);
pub const WUFFS_BASE__PIXEL_SUBSAMPLING__444 = @as(c_int, 0x000000);
pub const WUFFS_BASE__PIXEL_SUBSAMPLING__440 = __helpers.promoteIntLiteral(c_int, 0x010100, .hex);
pub const WUFFS_BASE__PIXEL_SUBSAMPLING__422 = __helpers.promoteIntLiteral(c_int, 0x101000, .hex);
pub const WUFFS_BASE__PIXEL_SUBSAMPLING__420 = __helpers.promoteIntLiteral(c_int, 0x111100, .hex);
pub const WUFFS_BASE__PIXEL_SUBSAMPLING__411 = __helpers.promoteIntLiteral(c_int, 0x303000, .hex);
pub const WUFFS_BASE__PIXEL_SUBSAMPLING__410 = __helpers.promoteIntLiteral(c_int, 0x313100, .hex);
pub const WUFFS_BASE__YCC_MODEL__BT_601_FULL_RANGE = @as(c_int, 0x00);
pub const WUFFS_BASE__YCC_MODEL__BT_601_STUDIO_RANGE = @as(c_int, 0x01);
pub const WUFFS_BASE__YCC_MODEL__RGB = @as(c_int, 0x40);
pub const WUFFS_BASE__YCC_MODEL__CMY = @as(c_int, 0x80);
pub const WUFFS_BASE__ANIMATION_DISPOSAL__NONE = __helpers.cast(wuffs_base__animation_disposal, @as(c_int, 0));
pub const WUFFS_BASE__ANIMATION_DISPOSAL__RESTORE_BACKGROUND = __helpers.cast(wuffs_base__animation_disposal, @as(c_int, 1));
pub const WUFFS_BASE__ANIMATION_DISPOSAL__RESTORE_PREVIOUS = __helpers.cast(wuffs_base__animation_disposal, @as(c_int, 2));
pub const WUFFS_BASE__PARSE_NUMBER_XXX__DEFAULT_OPTIONS = __helpers.cast(u32, @as(c_int, 0x00000000));
pub const WUFFS_BASE__PARSE_NUMBER_XXX__ALLOW_MULTIPLE_LEADING_ZEROES = __helpers.cast(u32, @as(c_int, 0x00000001));
pub const WUFFS_BASE__PARSE_NUMBER_XXX__ALLOW_UNDERSCORES = __helpers.cast(u32, @as(c_int, 0x00000002));
pub const WUFFS_BASE__PARSE_NUMBER_FXX__DECIMAL_SEPARATOR_IS_A_COMMA = __helpers.cast(u32, @as(c_int, 0x00000010));
pub const WUFFS_BASE__PARSE_NUMBER_FXX__REJECT_INF_AND_NAN = __helpers.cast(u32, @as(c_int, 0x00000020));
pub const WUFFS_BASE__RENDER_NUMBER_XXX__DEFAULT_OPTIONS = __helpers.cast(u32, @as(c_int, 0x00000000));
pub const WUFFS_BASE__RENDER_NUMBER_XXX__ALIGN_RIGHT = __helpers.cast(u32, @as(c_int, 0x00000100));
pub const WUFFS_BASE__RENDER_NUMBER_XXX__LEADING_PLUS_SIGN = __helpers.cast(u32, @as(c_int, 0x00000200));
pub const WUFFS_BASE__RENDER_NUMBER_FXX__DECIMAL_SEPARATOR_IS_A_COMMA = __helpers.cast(u32, @as(c_int, 0x00001000));
pub const WUFFS_BASE__RENDER_NUMBER_FXX__EXPONENT_ABSENT = __helpers.cast(u32, @as(c_int, 0x00002000));
pub const WUFFS_BASE__RENDER_NUMBER_FXX__EXPONENT_PRESENT = __helpers.cast(u32, @as(c_int, 0x00004000));
pub const WUFFS_BASE__RENDER_NUMBER_FXX__JUST_ENOUGH_PRECISION = __helpers.cast(u32, __helpers.promoteIntLiteral(c_int, 0x00008000, .hex));
pub const WUFFS_BASE__I64__BYTE_LENGTH__MAX_INCL = @as(c_int, 20);
pub const WUFFS_BASE__U64__BYTE_LENGTH__MAX_INCL = @as(c_int, 21);
pub const WUFFS_BASE__BASE_16__DEFAULT_OPTIONS = __helpers.cast(u32, @as(c_int, 0x00000000));
pub const WUFFS_BASE__BASE_64__DEFAULT_OPTIONS = __helpers.cast(u32, @as(c_int, 0x00000000));
pub const WUFFS_BASE__BASE_64__DECODE_ALLOW_PADDING = __helpers.cast(u32, @as(c_int, 0x00000001));
pub const WUFFS_BASE__BASE_64__ENCODE_EMIT_PADDING = __helpers.cast(u32, @as(c_int, 0x00000002));
pub const WUFFS_BASE__BASE_64__URL_ALPHABET = __helpers.cast(u32, @as(c_int, 0x00000100));
pub const WUFFS_BASE__UNICODE_CODE_POINT__MIN_INCL = @as(c_int, 0x00000000);
pub const WUFFS_BASE__UNICODE_CODE_POINT__MAX_INCL = __helpers.promoteIntLiteral(c_int, 0x0010FFFF, .hex);
pub const WUFFS_BASE__UNICODE_REPLACEMENT_CHARACTER = __helpers.promoteIntLiteral(c_int, 0x0000FFFD, .hex);
pub const WUFFS_BASE__UNICODE_SURROGATE__MIN_INCL = __helpers.promoteIntLiteral(c_int, 0x0000D800, .hex);
pub const WUFFS_BASE__UNICODE_SURROGATE__MAX_INCL = __helpers.promoteIntLiteral(c_int, 0x0000DFFF, .hex);
pub const WUFFS_BASE__ASCII__MIN_INCL = @as(c_int, 0x00);
pub const WUFFS_BASE__ASCII__MAX_INCL = @as(c_int, 0x7F);
pub const WUFFS_BASE__UTF_8__BYTE_LENGTH__MIN_INCL = @as(c_int, 1);
pub const WUFFS_BASE__UTF_8__BYTE_LENGTH__MAX_INCL = @as(c_int, 4);
pub const WUFFS_BASE__UTF_8__BYTE_LENGTH_1__CODE_POINT__MIN_INCL = @as(c_int, 0x00000000);
pub const WUFFS_BASE__UTF_8__BYTE_LENGTH_1__CODE_POINT__MAX_INCL = @as(c_int, 0x0000007F);
pub const WUFFS_BASE__UTF_8__BYTE_LENGTH_2__CODE_POINT__MIN_INCL = @as(c_int, 0x00000080);
pub const WUFFS_BASE__UTF_8__BYTE_LENGTH_2__CODE_POINT__MAX_INCL = @as(c_int, 0x000007FF);
pub const WUFFS_BASE__UTF_8__BYTE_LENGTH_3__CODE_POINT__MIN_INCL = @as(c_int, 0x00000800);
pub const WUFFS_BASE__UTF_8__BYTE_LENGTH_3__CODE_POINT__MAX_INCL = __helpers.promoteIntLiteral(c_int, 0x0000FFFF, .hex);
pub const WUFFS_BASE__UTF_8__BYTE_LENGTH_4__CODE_POINT__MIN_INCL = __helpers.promoteIntLiteral(c_int, 0x00010000, .hex);
pub const WUFFS_BASE__UTF_8__BYTE_LENGTH_4__CODE_POINT__MAX_INCL = __helpers.promoteIntLiteral(c_int, 0x0010FFFF, .hex);
pub const WUFFS_DEFLATE__DECODER_DST_HISTORY_RETAIN_LENGTH_MAX_INCL_WORST_CASE = @as(c_uint, 0);
pub const WUFFS_DEFLATE__DECODER_WORKBUF_LEN_MAX_INCL_WORST_CASE = @as(c_uint, 1);
pub const WUFFS_JPEG__DECODER_WORKBUF_LEN_MAX_INCL_WORST_CASE = __helpers.promoteIntLiteral(c_uint, 51552191232, .decimal);
pub const WUFFS_JPEG__QUIRK_REJECT_PROGRESSIVE_JPEGS = __helpers.promoteIntLiteral(c_uint, 1162824704, .decimal);
pub const WUFFS_ZLIB__QUIRK_JUST_RAW_DEFLATE = __helpers.promoteIntLiteral(c_uint, 2056083456, .decimal);
pub const WUFFS_ZLIB__DECODER_DST_HISTORY_RETAIN_LENGTH_MAX_INCL_WORST_CASE = @as(c_uint, 0);
pub const WUFFS_ZLIB__DECODER_WORKBUF_LEN_MAX_INCL_WORST_CASE = @as(c_uint, 1);
pub const WUFFS_PNG__DECODER_WORKBUF_LEN_MAX_INCL_WORST_CASE = __helpers.promoteIntLiteral(c_uint, 2251799562027015, .decimal);
pub const WUFFS_PNG__DECODER_SRC_IO_BUFFER_LENGTH_MIN_INCL = @as(c_uint, 8);
pub const wuffs_base__empty_struct__struct = struct_wuffs_base__empty_struct__struct;
pub const wuffs_base__utility__struct = struct_wuffs_base__utility__struct;
pub const wuffs_base__vtable__struct = struct_wuffs_base__vtable__struct;
pub const wuffs_base__status__struct = struct_wuffs_base__status__struct;
pub const wuffs_base__transform__output__struct = struct_wuffs_base__transform__output__struct;
pub const wuffs_base__multiply_u64__output__struct = struct_wuffs_base__multiply_u64__output__struct;
pub const wuffs_base__bitvec256__struct = struct_wuffs_base__bitvec256__struct;
pub const wuffs_base__optional_u63__struct = struct_wuffs_base__optional_u63__struct;
pub const wuffs_base__range_ie_i32__struct = struct_wuffs_base__range_ie_i32__struct;
pub const wuffs_base__range_ie_u32__struct = struct_wuffs_base__range_ie_u32__struct;
pub const wuffs_base__range_ie_u64__struct = struct_wuffs_base__range_ie_u64__struct;
pub const wuffs_base__range_ii_u32__struct = struct_wuffs_base__range_ii_u32__struct;
pub const wuffs_base__range_ii_u64__struct = struct_wuffs_base__range_ii_u64__struct;
pub const wuffs_base__rect_ie_i32__struct = struct_wuffs_base__rect_ie_i32__struct;
pub const wuffs_base__rect_ie_u32__struct = struct_wuffs_base__rect_ie_u32__struct;
pub const wuffs_base__rect_ii_u32__struct = struct_wuffs_base__rect_ii_u32__struct;
pub const wuffs_base__more_information__struct = struct_wuffs_base__more_information__struct;
pub const wuffs_base__io_buffer_meta__struct = struct_wuffs_base__io_buffer_meta__struct;
pub const wuffs_base__io_buffer__struct = struct_wuffs_base__io_buffer__struct;
pub const wuffs_base__token__struct = struct_wuffs_base__token__struct;
pub const wuffs_base__token_buffer_meta__struct = struct_wuffs_base__token_buffer_meta__struct;
pub const wuffs_base__token_buffer__struct = struct_wuffs_base__token_buffer__struct;
pub const wuffs_base__pixel_format__struct = struct_wuffs_base__pixel_format__struct;
pub const wuffs_base__pixel_subsampling__struct = struct_wuffs_base__pixel_subsampling__struct;
pub const wuffs_base__pixel_config__struct = struct_wuffs_base__pixel_config__struct;
pub const wuffs_base__image_config__struct = struct_wuffs_base__image_config__struct;
pub const wuffs_base__frame_config__struct = struct_wuffs_base__frame_config__struct;
pub const wuffs_base__pixel_buffer__struct = struct_wuffs_base__pixel_buffer__struct;
pub const wuffs_base__decode_frame_options__struct = struct_wuffs_base__decode_frame_options__struct;
pub const wuffs_base__pixel_swizzler__struct = struct_wuffs_base__pixel_swizzler__struct;
pub const wuffs_base__lossy_value_u16__struct = struct_wuffs_base__lossy_value_u16__struct;
pub const wuffs_base__lossy_value_u32__struct = struct_wuffs_base__lossy_value_u32__struct;
pub const wuffs_base__utf_8__next__output__struct = struct_wuffs_base__utf_8__next__output__struct;
pub const wuffs_base__hasher_u32__func_ptrs__struct = struct_wuffs_base__hasher_u32__func_ptrs__struct;
pub const wuffs_base__hasher_u32__struct = struct_wuffs_base__hasher_u32__struct;
pub const wuffs_base__hasher_u64__func_ptrs__struct = struct_wuffs_base__hasher_u64__func_ptrs__struct;
pub const wuffs_base__hasher_u64__struct = struct_wuffs_base__hasher_u64__struct;
pub const wuffs_base__hasher_bitvec256__func_ptrs__struct = struct_wuffs_base__hasher_bitvec256__func_ptrs__struct;
pub const wuffs_base__hasher_bitvec256__struct = struct_wuffs_base__hasher_bitvec256__struct;
pub const wuffs_base__image_decoder__func_ptrs__struct = struct_wuffs_base__image_decoder__func_ptrs__struct;
pub const wuffs_base__image_decoder__struct = struct_wuffs_base__image_decoder__struct;
pub const wuffs_base__io_transformer__func_ptrs__struct = struct_wuffs_base__io_transformer__func_ptrs__struct;
pub const wuffs_base__io_transformer__struct = struct_wuffs_base__io_transformer__struct;
pub const wuffs_base__token_decoder__func_ptrs__struct = struct_wuffs_base__token_decoder__func_ptrs__struct;
pub const wuffs_base__token_decoder__struct = struct_wuffs_base__token_decoder__struct;
pub const wuffs_adler32__hasher__struct = struct_wuffs_adler32__hasher__struct;
pub const wuffs_crc32__ieee_hasher__struct = struct_wuffs_crc32__ieee_hasher__struct;
pub const wuffs_deflate__decoder__struct = struct_wuffs_deflate__decoder__struct;
pub const wuffs_jpeg__decoder__struct = struct_wuffs_jpeg__decoder__struct;
pub const wuffs_zlib__decoder__struct = struct_wuffs_zlib__decoder__struct;
pub const wuffs_png__decoder__struct = struct_wuffs_png__decoder__struct;
