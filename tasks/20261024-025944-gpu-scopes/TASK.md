# gpu@0: each command packet waits a frame for its error scopes

- STATUS: OPEN
- PRIORITY: 140
- TAGS: core,gpu,performance,0.1.4

## State (2026-10-24)

Measured by the Xonotic gpu@0 port (`demo/slopyard-catapults`, Chromium 156 on a private Xvfb
with the NVIDIA adapter), with timers in a test-served copy of `host/gpu/worker.mjs`: each
command packet waits 13 to 18 ms in `await Promise.all([device.popErrorScope(),
device.popErrorScope()])` before the worker replies, while its work takes about 0.4 ms. A
Xonotic frame of 1.7 MB of world arrays takes three packets, so the wait sets its frame rate;
packing a frame into as few packets as fit took the menu from 26 to 41 fps. 13 to 18 ms is
about one 60 Hz frame, which suggests Chrome's GPU process answers at its own tick; then every
`gpu@0` program (0 A.D., llama.cpp's WebGPU backend, `fluid`) pays it per packet.

Not measured yet: the same on a real display (not Xvfb), in Firefox with an adapter, and
which programs it limits. To decide after measuring: whether the reply of a packet may carry
the errors of an earlier one (a change to what `gpu@0` promises the guest, so the owner's),
or whether programs batch more per packet (theirs alone).

Done when: the wait is measured on a real display in Chromium, and either the contract
keeps it with the reason recorded here, or a versioned change removes it with the
replay tests (`gpu-fluid`, `gpu-render`) still equal.
