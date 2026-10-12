"""`DeviceContext` over Dolly's `gpu@0`.

Upstream's `DeviceContext` is the package `max` over CUDA, HIP and Metal
drivers that are not open source. This is the part of its interface that
WebGPU compute can carry, under the same names: buffers, copies, kernels
compiled with `compile_info` (here to WGSL) and launched with a grid and a
block size. `gpu@0` runs what is enqueued in order; `synchronize()` waits for
the GPU.

A kernel is compiled for a 32-bit target: its `Int` is 32 bits wide, as are
WGSL's integers. Its pointer parameters take `DeviceBuffer`s; its other
parameters take `Int`, `UInt`, `Int32`, `UInt32`, `Float32` or `Bool`.
"""

from std.collections.array import Array
from std.compile import compile_info
from std.builtin.rebind import downcast
from std.ffi import external_call
from std.memory import bitcast
from std.sys import size_of
from std.sys.info import CompilationTarget, _TargetType


def _webgpu() -> _TargetType:
    return __mlir_attr[
        `#kgen.target<triple = "wasm32-unknown-webgpu", `,
        `arch = "generic", `,
        `features = "", `,
        `data_layout = "e-m:e-p:32:32-p10:8:8-p20:8:8-i64:64-i128:128-n32:64-S128-ni:1:10:20", `,
        `index_bit_width = 32, `,
        `simd_bit_width = 128`,
        `> : !kgen.target`,
    ]


def _check(status: Int, operation: StaticString) raises -> Int:
    """Returns what a `gpu@0` call answered, or raises its errno."""
    if status < 0:
        raise Error(operation, ": gpu@0 failed with errno ", -status)
    return status


struct Dim(TrivialRegisterPassable):
    """The x, y and z extent of a grid or of a block."""

    var x: Int
    var y: Int
    var z: Int

    @implicit
    def __init__[I: Indexer, //](out self, x: I):
        self.x = index(x)
        self.y = 1
        self.z = 1

    def __init__(out self, x: Int, y: Int, z: Int = 1):
        self.x = x
        self.y = y
        self.z = z

    def _extent(self) raises -> Array[UInt32, 3]:
        """Returns the extent as WebGPU counts it."""
        var extent = Array[UInt32, 3](fill=0)
        comptime for axis in range(3):
            var size = [self.x, self.y, self.z][axis]
            if size <= 0 or size > 65535:
                raise Error("a WebGPU dimension is 1 to 65535")
            extent[axis] = UInt32(size)
        return extent^


trait _Storage:
    """What a kernel's pointer parameter can be given."""

    def _handle(self) -> UInt64:
        ...

    def _byte_size(self) -> UInt64:
        ...


struct DeviceBuffer[dtype: DType](Movable, Sized, _Storage):
    """A buffer of `dtype` scalars in GPU memory."""

    var _id: UInt64
    var _length: Int

    def __init__(out self, size: Int) raises:
        if size <= 0:
            raise Error("a device buffer has at least one element")
        self._length = size
        self._id = UInt64(
            _check(
                external_call["mojo_gpu_buffer", Int](
                    UInt64(size * size_of[Scalar[Self.dtype]]())
                ),
                "enqueue_create_buffer",
            )
        )

    def __deinit__(deinit self):
        _ = external_call["mojo_gpu_release", Int](self._id)

    def __len__(self) -> Int:
        return self._length

    def _handle(self) -> UInt64:
        return self._id

    def _byte_size(self) -> UInt64:
        return UInt64(self._length * size_of[Scalar[Self.dtype]]())

    def enqueue_copy_from(
        self, src: Pointer[Scalar[Self.dtype], _]
    ) raises:
        """Copies `len(self)` scalars from host memory into the buffer."""
        _ = _check(
            external_call["mojo_gpu_write", Int](
                self._id, UInt64(0), src, self._byte_size()
            ),
            "enqueue_copy_from",
        )

    def enqueue_copy_to(
        self, dst: Pointer[Scalar[Self.dtype], _]
    ) raises:
        """Copies the buffer into `len(self)` scalars of host memory.

        Unlike the rest, this waits: `gpu@0` hands bytes back only from a
        mapped buffer.
        """
        _ = _check(
            external_call["mojo_gpu_read", Int](
                self._id, UInt64(0), dst, self._byte_size()
            ),
            "enqueue_copy_to",
        )

    def enqueue_fill(self, val: Scalar[Self.dtype]) raises:
        """Sets every element to `val`."""
        var values = List[Scalar[Self.dtype]](length=self._length, fill=val)
        self.enqueue_copy_from(values.unsafe_ptr())

    def to_host(self) raises -> List[Scalar[Self.dtype]]:
        """Returns the buffer's elements."""
        var values = List[Scalar[Self.dtype]](
            length=self._length, fill=Scalar[Self.dtype](0)
        )
        self.enqueue_copy_to(values.unsafe_ptr())
        return values^


struct DeviceContext(ImplicitlyCopyable):
    """The page's WebGPU device, as `gpu@0` lends it to this process."""

    def __init__(out self) raises:
        _ = _check(external_call["mojo_gpu_open", Int](), "DeviceContext")

    def name(self) -> String:
        """Returns the device's name. Browsers do not tell an adapter's."""
        return "WebGPU"

    def api(self) -> String:
        """Returns the device API."""
        return "webgpu"

    def enqueue_create_buffer[
        dtype: DType
    ](self, size: Int) raises -> DeviceBuffer[dtype]:
        """Creates a buffer of `size` scalars, zeroed as WebGPU requires."""
        return DeviceBuffer[dtype](size)

    def enqueue_function[
        declared_arg_types: TypeList[Trait=AnyType, ...],
        //,
        func: def(* args: * declared_arg_types) thin -> None,
        *actual_arg_types: AnyType,
    ](self, *args: *actual_arg_types, grid_dim: Dim, block_dim: Dim) raises:
        """Compiles `func` to WGSL and enqueues it over `grid_dim` blocks of
        `block_dim` threads.

        `block_dim` is the WebGPU workgroup size (256 threads at most on a
        default device, 64 in z) and `grid_dim` the workgroup count.
        """
        var kernel = compile_info[
            func, emission_kind="asm", target=CompilationTarget[_mlir_value=_webgpu()]()
        ]()
        var buffers = Array[UInt64, 16](fill=0)
        var sizes = Array[UInt64, 16](fill=0)
        var slots = Array[UInt32, 64](fill=0)
        var buffer_count = 0
        var slot_count = 0
        comptime for i in range(args.__len__()):
            comptime T = actual_arg_types[i]
            comptime if conforms_to(T, _Storage):
                buffers[buffer_count] = rebind[downcast[T, _Storage]](
                    args[i]
                )._handle()
                sizes[buffer_count] = rebind[downcast[T, _Storage]](
                    args[i]
                )._byte_size()
                buffer_count += 1
            else:
                slots[slot_count] = _slot(args[i])
                slot_count += 1
        var grid = grid_dim._extent()
        var block = block_dim._extent()
        _ = _check(
            external_call["mojo_gpu_launch", Int](
                kernel.asm.unsafe_ptr(),
                UInt64(kernel.asm.byte_length()),
                grid.unsafe_ptr(),
                block.unsafe_ptr(),
                buffers.unsafe_ptr(),
                sizes.unsafe_ptr(),
                UInt32(buffer_count),
                slots.unsafe_ptr(),
                UInt32(slot_count),
            ),
            "enqueue_function",
        )

    def synchronize(self) raises:
        """Waits until the GPU has run everything enqueued."""
        _ = _check(external_call["mojo_gpu_synchronize", Int](), "synchronize")


def _slot[T: AnyType, //](value: T) raises -> UInt32:
    """Returns a kernel argument as the 32 bits the kernel reads."""
    comptime if T == Int:
        var wide = rebind[Int](value)
        if wide < -2147483648 or wide > 2147483647:
            raise Error("an Int argument must fit the kernel's 32-bit Int")
        return UInt32(wide & 0xFFFFFFFF)
    elif T == UInt:
        var wide = rebind[UInt](value)
        if wide > 4294967295:
            raise Error("a UInt argument must fit the kernel's 32-bit UInt")
        return UInt32(wide)
    elif T == Int32:
        return UInt32(Int(rebind[Int32](value)) & 0xFFFFFFFF)
    elif T == UInt32:
        return rebind[UInt32](value)
    elif T == Bool:
        return UInt32(1) if rebind[Bool](value) else UInt32(0)
    elif T == Float32:
        return bitcast[.uint32](rebind[Float32](value))
    else:
        comptime assert False, (
            "a WebGPU kernel argument is a DeviceBuffer, Int, UInt, Int32,"
            " UInt32, Float32 or Bool"
        )
