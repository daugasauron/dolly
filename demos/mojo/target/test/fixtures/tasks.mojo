"""Coroutines as tasks of the runtime, which runs them when one is waited for.

`std.runtime._asyncrt` is private and unfinished upstream; nothing else
reaches the runtime's task queue.
"""

from std.runtime._asyncrt import create_task


async def add[lhs: Int](rhs: Int) -> Int:
    return lhs + rhs


async def add_two(a: Int, b: Int) -> Int:
    return await create_task(add[1](a)) + await create_task(add[2](b))


async def value[v: Int]() -> Int:
    return v


async def group() -> Int:
    var t0 = create_task(value[1]())
    var t1 = create_task(value[2]())
    return await t0 + await t1


def main():
    var task = create_task(add_two(10, 20))
    var t0 = create_task(group())
    var t1 = create_task(group())
    print("MOJO-TASKS", task.wait(), t0.wait() + t1.wait())
