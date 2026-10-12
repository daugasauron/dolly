"""What the threads of a block wait for."""

from std.ffi import external_call
from std.sys import is_webgpu


@always_inline
def barrier():
    """Waits until every thread of the block has reached a barrier or
    returned. On a CPU it does nothing."""
    comptime if is_webgpu():
        external_call["__webgpu_barrier", NoneType]()
