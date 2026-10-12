from std.bit import byte_swap, rotate_bits_left
from std.collections.array import Array
from std.math import acos, atan, cos, erf, exp, isnan, log, sin, sinh, sqrt, tan

from gpu import block_dim, block_idx, global_idx, grid_dim, thread_idx
from gpu.host import DeviceContext, Dim


def horner(
    x: Pointer[Float32, MutAnyOrigin],
    result: Pointer[Float32, MutAnyOrigin],
    n: Int,
    terms: Int32,
):
    """A loop over a local array: a polynomial with the coefficients 1, 2, 3,
    4, 1, 2 and so on."""
    var i = global_idx.x
    if i >= n:
        return
    var coefficients = Array[Float32, 4](fill=0)
    for k in range(4):
        coefficients[k] = Float32(k + 1)
    var sum = Float32(0)
    var k = Int32(0)
    while k < terms:
        sum = sum * x[unsafe_offset=i] + coefficients[Int(k) % 4]
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
    flags: Pointer[Scalar[DType.bool], MutAnyOrigin],
    result: Pointer[Int32, MutAnyOrigin],
    n: UInt32,
    negate: Bool,
):
    """Integers on a two-dimensional grid, some read from buffers of bytes and
    of Bool, which then take a part of the result: four threads to a word."""
    var column = thread_idx.x + block_idx.x * block_dim.x
    var row = thread_idx.y + block_idx.y * block_dim.y
    var i = row * (grid_dim.x * block_dim.x) + column
    if UInt32(i) < n:
        var mixed = mix(
            values[unsafe_offset=i],
            bytes[unsafe_offset=i],
            i,
            negate != Bool(flags[unsafe_offset=i]),
        )
        result[unsafe_offset=i] = mixed
        bytes[unsafe_offset=i] = UInt8(mixed)
        flags[unsafe_offset=i] = mixed > 500


def halved(i: Int, v: Float32) -> Optional[Float32]:
    """An Optional chosen in a branch: a struct that is a value."""
    if i % 2 == 0:
        return v * 0.5
    return None


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
    elif which == 10:
        var half = halved(Int(v * 8), v)
        return half.value() if half else Float32(-1)
    var undefined = log(v - 2)  # of a negative number: not a number
    if which == 11:
        return Float32(7) if isnan(undefined) else Float32(0)
    return undefined


def functions(
    x: Pointer[Float32, MutAnyOrigin],
    result: Pointer[Float32, MutAnyOrigin],
    n: Int,
):
    """Math functions and conversions, through a call."""
    var i = global_idx.x
    if i < n:
        result[unsafe_offset=i] = function(i % 13, x[unsafe_offset=i])


def main() raises:
    comptime n = 64
    var ctx = DeviceContext()
    var x = ctx.enqueue_create_buffer[DType.float32](n)
    var y = ctx.enqueue_create_buffer[DType.float32](n)
    var xs = List[Float32](length=n, fill=0)
    for i in range(n):
        xs[i] = Float32(i) / 16 - 2
    x.enqueue_copy_from(xs.unsafe_ptr())
    ctx.enqueue_function[horner](x, y, n, Int32(6), grid_dim=2, block_dim=32)
    var ys = y.to_host()
    var wrong_sums = 0
    for i in range(n):
        var sum = Float32(0)
        for k in range(6):
            sum = sum * xs[i] + Float32(k % 4 + 1)
        # The host may fuse a multiplication and an addition, or the GPU.
        if abs(ys[i] - sum) > 1e-5 * max(abs(sum), 1):
            wrong_sums += 1

    var a = ctx.enqueue_create_buffer[DType.int32](n)
    var b = ctx.enqueue_create_buffer[DType.int32](n)
    var bytes = ctx.enqueue_create_buffer[DType.uint8](n - 1)
    var flags = ctx.enqueue_create_buffer[DType.bool](n - 1)
    var ints = List[Int32](length=n, fill=0)
    var small = List[UInt8](length=n, fill=0)
    var third = List[Scalar[DType.bool]](length=n, fill=False)
    for i in range(n):
        ints[i] = Int32(i * 2741 - 70000)
        small[i] = UInt8(i * 5 + 3)
        third[i] = i % 3 == 1
    a.enqueue_copy_from(ints.unsafe_ptr())
    bytes.enqueue_copy_from(small.unsafe_ptr())
    flags.enqueue_copy_from(third.unsafe_ptr())
    # One thread more than there are bytes: n - 1 is not a multiple of four.
    ctx.enqueue_function[integers](
        a,
        bytes,
        flags,
        b,
        UInt32(n - 1),
        True,
        grid_dim=Dim(2, 4),
        block_dim=Dim(4, 2),
    )
    var bs = b.to_host()
    var low = bytes.to_host()
    var large = flags.to_host()
    var wrong_integers = 0
    for i in range(n - 1):
        var mixed = mix(ints[i], small[i], i, not Bool(third[i]))
        if (
            bs[i] != mixed
            or low[i] != UInt8(mixed)
            or Bool(large[i]) != (mixed > 500)
        ):
            wrong_integers += 1
    if bs[n - 1] != 0:
        wrong_integers += 1

    ctx.enqueue_function[functions](x, y, n, grid_dim=1, block_dim=64)
    ctx.synchronize()
    ys = y.to_host()
    var wrong_functions = 0
    for i in range(n):
        var expected = function(i % 13, xs[i])
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
