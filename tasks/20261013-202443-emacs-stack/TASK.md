# Emacs runs out of stack in a fresh Chromium: its first prompt loses typed bytes, or the process dies

- STATUS: OPEN
- PRIORITY: 185
- TAGS: core,process,emacs,chromium,owner

Found in the night of 2026-10-14 by reproducing an old flake on a starved
browser ([terminal input and screen reading](../20261001-095000-terminal-text-flake/TASK.md),
"Pinned to one processor": every count below is there, with its logs in
`work/evidence-2026-10-14/flake/`). Nothing is changed.

Done when: the owner has decided how a program that needs more stack than
a Worker gives gets it (or that Emacs is built to need less), it is built,
and the Emacs demo's test passes 30 of 30 runs pinned to one processor in
Chromium; and it is known how a stack that runs out can lose bytes without
ending the process, or that question has a task of its own.

## As filed (2026-10-14, `main` `85a8bdc2`)

- What a person sees: in a Chromium that has just started, the first "Find
  file" of Emacs loses the name typed after its first two bytes (`/t` of a
  26-byte name). Seen once on 2026-10-07 and never again until the test was
  pinned to one processor (`taskset -c 6`): 6 of 37 runs of
  `demos/emacs/test/emacs-browser.mjs`, 8 of 42 first steps of a probe, all
  in Chromium, none in Firefox (0 of 31, 0 of 28), never in a later page or
  step of the same browser.
- Not the terminal and not the kernel: a temporary kernel log shows Emacs
  given all 26 bytes in one `read`, in failing and passing runs alike.
- The lead: with Chromium kept in its baseline compiler
  (`--js-flags=--liftoff-only`), where a fresh browser has every function
  until it compiles the hot ones again, Emacs dies at that prompt, 8 of 8:
  "Maximum call stack size exceeded". With every process entered on the
  large stack (one line of the supervisor, for the measurement, put back)
  it passes 3 of 3 under the flag, and without the flag 0 of 70 first steps
  lose the name. So an Emacs built at `-O0` needs more stack at its first
  minibuffer than a Worker has while its code is baseline code.
- Not shown: how a full stack loses 24 bytes while Emacs lives on and the
  page reports nothing. That is a second question, about what a process
  sees when its stack runs out short of a trap.
- The mechanism that exists: an executable asks for the large stack with a
  `dolly.process.stack` section; only the compiler carries one
  (`src/process/compiler-main.c`). The supervisor's comment says why
  (`src/process-supervisor.mjs:171-183`): entered that way a process runs
  on a stack about 1.9 times as deep in Chrome; a Codex build crashed
  Chrome's tab twice on it; Firefox reports every Worker terminated inside
  such a call as an uncaught exception, so the entry is taken only where it
  was measured deeper.
- Ways the record shows, none chosen: Emacs's recipe gives it the section
  (rebuilds `emacs` and the image that opens into it); Emacs is compiled
  with optimisation, which needs less stack (its recipe builds at `-O0`;
  why is in the Emacs task); the stack a process gets is stated in the
  contract and a program that needs more says so. The test could wait 0.3 s
  before it types (0 of 26 lost) and would then hide the cause.
- It bears on more than Emacs: any program built at `-O0` with deep
  recursion meets the same limit in a fresh Chromium, and the limit is the
  browser's, not Dolly's.
