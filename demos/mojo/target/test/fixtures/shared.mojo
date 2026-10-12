from std.memory import stack_allocation, AddressSpace

from gpu import block_idx, global_idx, thread_idx
from gpu.host import DeviceContext
from gpu.sync import barrier

comptime BLOCK = 256


def block_sum(
    values: Pointer[Float32, MutAnyOrigin],
    sums: Pointer[Float32, MutAnyOrigin],
    n: Int,
):
    """The sum of each block's values, folded in shared memory in eight
    steps with a barrier after each."""
    var shared = stack_allocation[
        BLOCK, Float32, address_space=AddressSpace.SHARED
    ]()
    var tid = thread_idx.x
    var i = global_idx.x
    shared[unsafe_offset=tid] = values[unsafe_offset=i] if i < n else Float32(0)
    barrier()
    var stride = BLOCK // 2
    while stride > 0:
        if tid < stride:
            shared[unsafe_offset=tid] += shared[unsafe_offset=tid + stride]
        barrier()
        stride //= 2
    if tid == 0:
        sums[unsafe_offset=block_idx.x] = shared[unsafe_offset=0]


def arrive(seen: Pointer[UInt32, MutAnyOrigin]):
    """Each thread works for a time that grows with its number, leaves a mark
    in shared memory, and after the barrier counts the marks it finds."""
    var shared = stack_allocation[
        BLOCK, UInt32, address_space=AddressSpace.SHARED
    ]()
    var tid = thread_idx.x
    var mark = UInt32(tid) + 1
    for _ in range(tid * 40):
        mark = mark * 1664525 + 1013904223
    shared[unsafe_offset=tid] = mark | 1
    barrier()
    var count = UInt32(0)
    for k in range(BLOCK):
        if shared[unsafe_offset=k] != 0:
            count += 1
    seen[unsafe_offset=global_idx.x] = count


def main() raises:
    comptime n = 2000
    comptime blocks = (n + BLOCK - 1) // BLOCK
    var ctx = DeviceContext()
    var values = ctx.enqueue_create_buffer[DType.float32](n)
    var sums = ctx.enqueue_create_buffer[DType.float32](blocks)
    var expected = List[Float32](length=blocks, fill=0)
    with values.map_to_host() as host:
        for i in range(n):
            host[i] = Float32(i % 97) - 40
            expected[i // BLOCK] += Float32(i % 97) - 40
    ctx.enqueue_function[block_sum](
        values, sums, n, grid_dim=blocks, block_dim=BLOCK
    )
    var wrong = 0
    var got = sums.to_host()
    for b in range(blocks):
        if got[b] != expected[b]:
            wrong += 1

    var seen = ctx.enqueue_create_buffer[DType.uint32](blocks * BLOCK)
    ctx.enqueue_function[arrive](seen, grid_dim=blocks, block_dim=BLOCK)
    var fewest = UInt32(BLOCK)
    for count in seen.to_host():
        fewest = min(fewest, count)
    print("MOJO-SHARED wrong:", wrong, "of", blocks, "fewest marks", fewest)
