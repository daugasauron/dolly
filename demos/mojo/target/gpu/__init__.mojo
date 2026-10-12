"""GPU programs in Dolly: the kernel side.

These are the standard library's `std._gpu` names, which upstream publishes as
`max.gpu`. The host side is `gpu.host`, and `gpu.sync` has the barrier.
"""

from std._gpu import block_dim, block_idx, global_idx, grid_dim, thread_idx
