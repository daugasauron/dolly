from gpu import block_dim, block_idx, thread_idx
from gpu.host import DeviceContext, Dim

comptime WIDTH = 96
comptime HEIGHT = 40
comptime MAX_ITERATIONS = 200


def mandelbrot(
    counts: Pointer[Int32, MutAnyOrigin],
    width: Int,
    height: Int,
    min_x: Float32,
    min_y: Float32,
    scale_x: Float32,
    scale_y: Float32,
):
    """Escape time of one point of the plane per thread."""
    var column = block_idx.x * block_dim.x + thread_idx.x
    var row = block_idx.y * block_dim.y + thread_idx.y
    if column >= width or row >= height:
        return
    var cx = min_x + Float32(column) * scale_x
    var cy = min_y + Float32(row) * scale_y
    var x = Float32(0)
    var y = Float32(0)
    var iterations = Int32(0)
    while iterations < MAX_ITERATIONS and x * x + y * y <= 4:
        var next = x * x - y * y + cx
        y = 2 * x * y + cy
        x = next
        iterations += 1
    counts[unsafe_offset=row * width + column] = iterations


def matmul(
    a: Pointer[Float32, MutAnyOrigin],
    b: Pointer[Float32, MutAnyOrigin],
    c: Pointer[Float32, MutAnyOrigin],
    n: Int,
):
    """One element of c = a b per thread, n by n."""
    var column = block_idx.x * block_dim.x + thread_idx.x
    var row = block_idx.y * block_dim.y + thread_idx.y
    if column >= n or row >= n:
        return
    var sum = Float32(0)
    for k in range(n):
        sum += a[unsafe_offset=row * n + k] * b[unsafe_offset=k * n + column]
    c[unsafe_offset=row * n + column] = sum


def main() raises:
    var ctx = DeviceContext()
    var counts = ctx.enqueue_create_buffer[DType.int32](WIDTH * HEIGHT)
    ctx.enqueue_function[mandelbrot](
        counts,
        WIDTH,
        HEIGHT,
        Float32(-2.2),
        Float32(-1.2),
        Float32(3.2 / WIDTH),
        Float32(2.4 / HEIGHT),
        grid_dim=Dim(WIDTH // 16, HEIGHT // 8),
        block_dim=Dim(16, 8),
    )
    var escape = counts.to_host()
    var shades = " .:-=+*#%@"
    for row in range(HEIGHT):
        var line = String()
        for column in range(WIDTH):
            var count = Int(escape[row * WIDTH + column])
            line += shades[byte=(count * 9) // MAX_ITERATIONS]
        print(line)

    comptime n = 24
    var a = ctx.enqueue_create_buffer[DType.float32](n * n)
    var b = ctx.enqueue_create_buffer[DType.float32](n * n)
    var c = ctx.enqueue_create_buffer[DType.float32](n * n)
    var av = List[Float32](length=n * n, fill=0)
    var bv = List[Float32](length=n * n, fill=0)
    for i in range(n * n):
        av[i] = Float32(i % 7) - 3
        bv[i] = Float32(i % 5) * 0.5
    a.enqueue_copy_from(av.unsafe_ptr())
    b.enqueue_copy_from(bv.unsafe_ptr())
    ctx.enqueue_function[matmul](
        a, b, c, n, grid_dim=Dim(3, 3), block_dim=Dim(8, 8)
    )
    var cv = c.to_host()
    var wrong = 0
    for row in range(n):
        for column in range(n):
            var sum = Float32(0)
            for k in range(n):
                sum += av[row * n + k] * bv[k * n + column]
            if abs(cv[row * n + column] - sum) > 1e-3:
                wrong += 1
    print("MOJO-MATMUL wrong:", wrong, "of", n * n, cv[n * n - 1])
