from gpu import global_idx
from gpu.host import DeviceContext


def saxpy(
    x: Pointer[Float32, MutAnyOrigin],
    y: Pointer[Float32, MutAnyOrigin],
    result: Pointer[Float32, MutAnyOrigin],
    a: Float32,
    n: Int,
):
    var i = global_idx.x
    if i < n:
        result[unsafe_offset=i] = a * x[unsafe_offset=i] + y[unsafe_offset=i]


def main() raises:
    comptime n = 1000
    var ctx = DeviceContext()
    var x = ctx.enqueue_create_buffer[DType.float32](n)
    var y = ctx.enqueue_create_buffer[DType.float32](n)
    var result = ctx.enqueue_create_buffer[DType.float32](n)
    with x.map_to_host() as host:
        for i in range(n):
            host[i] = Float32(i)
    y.enqueue_fill(0.5)
    ctx.enqueue_function[saxpy](
        x, y, result, Float32(2), n, grid_dim=4, block_dim=256
    )
    ctx.synchronize()
    var sums = result.to_host()
    for i in range(n):
        if sums[i] != Float32(2 * i) + 0.5:
            print("saxpy is wrong at", i, sums[i])
            return
    print("MOJO-GPU", ctx.api(), n, sums[n - 1])
