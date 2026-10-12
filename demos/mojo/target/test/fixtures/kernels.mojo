from std.bit import byte_swap, rotate_bits_left
from std.math import acos, atan, cos, erf, exp, log, sin, sinh, sqrt, tan

from gpu import block_dim, block_idx, global_idx, grid_dim, thread_idx
from gpu.host import DeviceContext, Dim


def horner(
    x: Pointer[Float32, MutAnyOrigin],
    result: Pointer[Float32, MutAnyOrigin],
    n: Int,
    terms: Int32,
):
    """A loop: sum of x^k for k below terms."""
    var i = global_idx.x
    if i >= n:
        return
    var sum = Float32(0)
    var k = Int32(0)
    while k < terms:
        sum = sum * x[unsafe_offset=i] + 1
        k += 1
    result[unsafe_offset=i] = sum


def mix(value: Int32, byte: UInt8, i: Int, negate: Bool) -> Int32:
    """Integer arithmetic in 32, 16 and 8 bits, signed and unsigned, for the
    kernel and for the host."""
    var mixed = (value * 7 - 3) // 2 + (value % 5) + (value >> 1) ^ Int32(i)
    mixed += Int32(byte) * 3 + byte_swap(value) % 1000 + abs(value) % 7
    mixed ^= rotate_bits_left[7](value) & 0xFF
    mixed += Int32(Int8(value) * 3 // 2) + Int32(UInt8(value) >> 2)
    mixed += Int32(Int16(value * 301) % 7) + Int32(UInt16(value) * 5)
    if Int8(value) < Int8(i):
        mixed += Int32(min(UInt8(value), UInt8(200)))
    if negate:
        mixed = -mixed
    return max(mixed, -1000)


def integers(
    values: Pointer[Int32, MutAnyOrigin],
    bytes: Pointer[UInt8, MutAnyOrigin],
    result: Pointer[Int32, MutAnyOrigin],
    n: UInt32,
    negate: Bool,
):
    """Integers on a two-dimensional grid, some read from a buffer of bytes."""
    var column = thread_idx.x + block_idx.x * block_dim.x
    var row = thread_idx.y + block_idx.y * block_dim.y
    var i = row * (grid_dim.x * block_dim.x) + column
    if UInt32(i) < n:
        result[unsafe_offset=i] = mix(
            values[unsafe_offset=i], bytes[unsafe_offset=i], i, negate
        )


def function(which: Int, v: Float32) -> Float32:
    """One of the math functions, for the kernel and for the host."""
    if which == 0:
        return sqrt(abs(v))
    elif which == 1:
        return log(v + 3)
    elif which == 2:
        return tan(v * 0.5)
    elif which == 3:
        return atan(v * 4)
    elif which == 4:
        return sinh(v * 3)
    elif which == 5:
        return acos(v * 0.5)
    elif which == 6:
        return erf(v)
    elif which == 7:
        return exp(v)
    elif which == 8:
        return sin(v * 5) + cos(v * 5)
    elif which == 9:
        return Float32(Int(v * 100))
    return log(v - 2)  # of a negative number: not a number


def functions(
    x: Pointer[Float32, MutAnyOrigin],
    result: Pointer[Float32, MutAnyOrigin],
    n: Int,
):
    """Math functions and conversions, through a call."""
    var i = global_idx.x
    if i < n:
        result[unsafe_offset=i] = function(i % 11, x[unsafe_offset=i])


def main() raises:
    comptime n = 64
    var ctx = DeviceContext()
    var x = ctx.enqueue_create_buffer[DType.float32](n)
    var y = ctx.enqueue_create_buffer[DType.float32](n)
    var xs = List[Float32](length=n, fill=0)
    for i in range(n):
        xs[i] = Float32(i) / 16 - 2
    x.enqueue_copy_from(xs.unsafe_ptr())
    ctx.enqueue_function[horner](x, y, n, Int32(5), grid_dim=2, block_dim=32)
    var ys = y.to_host()
    var wrong_sums = 0
    for i in range(n):
        var sum = Float32(0)
        for _ in range(5):
            sum = sum * xs[i] + 1
        if ys[i] != sum:
            wrong_sums += 1

    var a = ctx.enqueue_create_buffer[DType.int32](n)
    var b = ctx.enqueue_create_buffer[DType.int32](n)
    var bytes = ctx.enqueue_create_buffer[DType.uint8](n - 1)
    var ints = List[Int32](length=n, fill=0)
    var small = List[UInt8](length=n, fill=0)
    for i in range(n):
        ints[i] = Int32(i * 2741 - 70000)
        small[i] = UInt8(i * 5 + 3)
    a.enqueue_copy_from(ints.unsafe_ptr())
    bytes.enqueue_copy_from(small.unsafe_ptr())
    # One thread more than there are bytes: n - 1 is not a multiple of four.
    ctx.enqueue_function[integers](
        a, bytes, b, UInt32(n - 1), True, grid_dim=Dim(2, 4), block_dim=Dim(4, 2)
    )
    var bs = b.to_host()
    var wrong_integers = 0
    for i in range(n - 1):
        if bs[i] != mix(ints[i], small[i], i, True):
            wrong_integers += 1
    if bs[n - 1] != 0:
        wrong_integers += 1

    ctx.enqueue_function[functions](x, y, n, grid_dim=1, block_dim=64)
    ctx.synchronize()
    ys = y.to_host()
    var wrong_functions = 0
    for i in range(n):
        var expected = function(i % 11, xs[i])
        if expected != expected:
            if ys[i] == ys[i]:
                wrong_functions += 1
        # WGSL lets `sin` be off by 2^-11; SwiftShader is by 2e-4.
        elif abs(ys[i] - expected) > 1e-3 * max(abs(expected), 1):
            wrong_functions += 1
    print(
        "MOJO-KERNELS wrong:",
        wrong_sums,
        wrong_integers,
        wrong_functions,
        bs[0],
    )
