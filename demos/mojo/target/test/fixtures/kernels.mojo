from std.math import sqrt

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


def integers(
    values: Pointer[Int32, MutAnyOrigin],
    result: Pointer[Int32, MutAnyOrigin],
    n: UInt32,
    negate: Bool,
):
    """Integer arithmetic, signed and unsigned, and a two-dimensional grid."""
    var column = thread_idx.x + block_idx.x * block_dim.x
    var row = thread_idx.y + block_idx.y * block_dim.y
    var i = row * (grid_dim.x * block_dim.x) + column
    if UInt32(i) >= n:
        return
    var value = values[unsafe_offset=i]
    var mixed = (value * 7 - 3) // 2 + (value % 5) + (value >> 1) ^ Int32(i)
    if negate:
        mixed = -mixed
    result[unsafe_offset=i] = max(mixed, -1000)


def roots(
    x: Pointer[Float32, MutAnyOrigin],
    result: Pointer[Float32, MutAnyOrigin],
    n: Int,
):
    """Math functions and conversions."""
    var i = global_idx.x
    if i < n:
        var value = x[unsafe_offset=i]
        if value < 100:
            result[unsafe_offset=i] = sqrt(abs(value))
        else:
            result[unsafe_offset=i] = Float32(Int(value))


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
    var ints = List[Int32](length=n, fill=0)
    for i in range(n):
        ints[i] = Int32(i * 37 - 500)
    a.enqueue_copy_from(ints.unsafe_ptr())
    ctx.enqueue_function[integers](
        a, b, UInt32(n), True, grid_dim=Dim(2, 4), block_dim=Dim(4, 2)
    )
    var bs = b.to_host()
    var wrong_integers = 0
    for i in range(n):
        var value = ints[i]
        var mixed = -(
            (value * 7 - 3) // 2 + (value % 5) + (value >> 1) ^ Int32(i)
        )
        if bs[i] != max(mixed, -1000):
            wrong_integers += 1

    ctx.enqueue_function[roots](x, y, n, grid_dim=1, block_dim=64)
    ctx.synchronize()
    ys = y.to_host()
    var wrong_roots = 0
    for i in range(n):
        if abs(ys[i] - sqrt(abs(xs[i]))) > 1e-6:
            wrong_roots += 1
    print("MOJO-KERNELS wrong:", wrong_sums, wrong_integers, wrong_roots, bs[0])
