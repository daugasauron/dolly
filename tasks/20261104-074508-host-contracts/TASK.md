# Host contracts said once: the leased-device protocol, input's and display's values, snapshot's mailbox

- STATUS: OPEN
- PRIORITY: 160
- TAGS: core,host-modules,abi,cleanup

Three proposals of `tasks/20261101-074546-audit-host`, each prototyped and measured on a branch
from 12c7fbd9 (its fix 10, merged on `integrate/2026-11-02`). Decided 2026-11-04
(`tasks/20261102-133353-owner-decisions`): yes to all three. Each puts one statement of a contract
in its canonical place. Two change digests, so they go in one catalog round; the audit's "with the
next device module" deferred for rebuild cost alone, which is not a reason.

1. **One leased-device protocol** (`proposal/leased-device` ae413349, P1). `gpu@0`, `audio@0`,
   `microphone@0` and `nena@0` speak one protocol written eight times (prose in four WATs, C in
   `src/device-lease.c`, JavaScript in `lease-bridge.mjs` and the GPU Worker, by hand in four
   clients, parsed again by three providers). Now `dolly_device_header` and `dolly_device_request()`
   in `runtime.h`, the reply slots and lease rules in `dolly-supervisor-0.wat`, the bridge checks
   the whole header and hands providers `{ operation, scope, sequence, body }`. 152 lines in, 161
   out; its worth is one place to change the protocol. 29 images rebuilt; audio, microphone, nena,
   gpu-indicator, host-compute, dso, host-modules, core and boundary pass in both browsers,
   hardware gpu-render in Chrome.
2. **Mailbox values in the WATs** (`proposal/host-mailbox-constants` a306babb, P2). `input@0`'s
   record types, actions, modifier bits, composing and lease flags and `display@0`'s graphics
   flag, cursor styles, copy flags and pixel format are enums in the headers and typed again in
   JavaScript (`keyEvent = 1`, `(flags & 3) === 3`, `16` and `32` for the locks, cursor styles by
   index), while `touch@0` keeps its phases in its WAT. AGENTS.md: the canonical machine contract
   is in WAT. Now each value is a WAT global; the headers get them from `*-abi.h`, the JavaScript
   from `abi.mjs`; the enum type names go. No value changes. 28 images rebuilt, 26 suites pass in
   both browsers.
3. **No session name in snapshot@0's mailbox** (`proposal/snapshot-no-session-name` aff0bca6, P4).
   The page writes the save's name into a 128-byte kernel buffer and word 3; the kernel validates
   it a second time and drops it (its marker file went in 5afba99c). The buffer, its export, the
   word and the check go: 41 lines in, 83 out; not an image input. custom-session, session-offline,
   snapshot-stream, nena, indicators and boundary pass in both browsers.

Also found by the audit, not on a branch: `host/{audio,gpu,microphone,nena}/kernel.c` are the same
28 lines but for names; a context pointer in `dolly_kernel_module` could serve all four. Judge once
1 is in: if the four files are then identical but for their export's name, do it in the same round.

Done when: the three are on integrate in one round; the suites above and `test/audio-host.test.mjs`
pass in Chromium and Firefox, hardware gpu-render in Chrome; `scripts/generate-abi-constants.mjs`
is the one source of the values in C and JavaScript (no literal record type, flag or cursor style
in `host/input/*.mjs` or `host/display/*.mjs`).
