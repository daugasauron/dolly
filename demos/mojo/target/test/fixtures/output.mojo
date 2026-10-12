from gpu import global_idx
from gpu.host import DeviceContext


def report(values: Pointer[Float32, MutAnyOrigin], n: Int):
    """What a kernel says: a line of each thread, and the message of the
    assertion that ends one of them."""
    var i = global_idx.x
    if i < n:
        print("thread", i, "of", n, "holds", values[unsafe_offset=i])
        debug_assert[assert_mode="safe"](i != 2, "thread 2 stops here")
        values[unsafe_offset=i] = -1


def main() raises:
    var ctx = DeviceContext()
    var values = ctx.enqueue_create_buffer[DType.float32](3)
    with values.map_to_host() as host:
        for i in range(3):
            host[i] = Float32(i) + 0.25
    ctx.enqueue_function[report](values, 3, grid_dim=1, block_dim=4)
    print("MOJO-OUTPUT", values.to_host())
