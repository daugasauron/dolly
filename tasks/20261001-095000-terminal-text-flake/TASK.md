# Terminal input and screen reading: the losses and flakes still open

- STATUS: OPEN
- PRIORITY: 120
- TAGS: tests,flaky,display,firefox

## State (2026-10-13)

`__dolly.visibleTerminalText()` reads the screen by a pointer drag and the display library's
copy, and a script types faster than a person: both have lost text under load. This task began
as one Firefox failure of `test/terminal-browser.mjs` (2026-10-01) and holds what is open on that
path; each cause found keeps its section below.

Fixed: the empty selection at retirement (`fix/firefox-selection`), the pixel wait after
fullscreen (`9b21ab9e`, test only), the gesture repeated across a program's exit (`ac4b4e5d`),
the input discarded at exit (`9abd08b0`), and on 2026-10-13 (`core/polish`):

- **A paste with nothing focused** arrives (`e3ff5fc1`, page only): the paste chord gives the
  keyboard element the focus in the terminal too. `test/terminal-browser.mjs` pastes after a
  blur.
- **A burst of typed keys** costs a frame a tick: `test/display-browser.mjs` pushes 100 keys at
  Slop's prompt and counts the frames (`e3ff5fc1`). It passes on `input@0` as it is, so the
  kernel change of `92a64117` is not needed.
- **Janis cut a read at 256 bytes** (`cb9ae5cd`): one read takes all that waits. That is
  sighting 1 (`DOLLY-ENTRY-CWuD`) and the `/d7d7` of
  `tasks/20261010-234000-pi-stray-reply`, which has the measurements.

Left, none of them reproduced:

- **Sighting 3**: Emacs received `/t` of a 26-byte text record, once, on 2026-10-07. Emacs is
  not Janis, so the 256-byte cut does not explain it.
- **The mouse drag** at `test/terminal-browser.mjs:67` after font zoom and paste ("Narrowed"),
  and **"timed out waiting for terminal selection reset"** in Firefox under load ("Seen
  again", "Note"). Neither was seen in the release rounds.
- The ring drops what it has no room for and counts it on the page (`data-input-dropped`); a
  test that types does not read that when it fails.
- Not measured: key-to-paint after 250 ms of silence, Python's REPL, a paste over 50,000
  characters, AltGr and Option.

Ran on the three commits: `terminal`, `display` and every other core suite in Chromium and
Firefox, JavaScript's demo test, Pi's twelve times (12 of 12, twice: with the reader fix alone
and with the page and kernel commits).

Done when the two unexplained lines are explained or have a rate from a hundred runs that says
they are gone. Lowered from 190: what a person met is fixed.

## Narrowed (2026-10-01, 12:40)

- The failure is `test/terminal-browser.mjs:67`: after the mouse drag across
  the `COPY-BRIDGE-TEXT` row, `__dolly.copySelection()` never equals the text
  within 30 s. The first run of a Firefox loop reproduced it.
- A probe doing only fullscreen, then twelve rounds of echo, visible-text
  index, clear selection and drag, selected the row correctly 12/12 in Firefox.
  So the race needs the test's earlier steps: font zoom in and back out
  (`Ctrl+Shift+=`, `Ctrl+-`, waiting only for `__dolly.fontSize`) and the
  clipboard paste. Next: log `transport.geometry()` and the selection on
  failure; suspect cell metrics that lag `fontSize` after zoom.

## Cause of the empty selection (2026-10-06, `fix/firefox-selection`)

Reproduced at will: 3 failures in 220 openings of the default image at its
first prompt in Firefox with ten concurrent Firefox loops (1 in 48 with six,
0 in 67 alone). Since `77f18fce` (presenter batch) `visibleTerminalText()`
waits for its own selection instead of any publication, so the same race
fails with `timed out waiting for terminal selection publication` after 5 s
instead of returning "" for its caller to retry; that made it block the
release line. A timeline of the mailbox words and a log of Worker retirements
in the failing runs showed:

- `init.slop` runs `/bin/foreground /bin/slop -e ~/.dollyrc` (pid 104) before
  the shell (pid 109). When 104 exits, the kernel keeps it as the foreground
  until its Worker retirement is acknowledged and publishes it as "pid 104,
  not interruptible", which `waitForInteractiveTerminal` reads as a program in
  raw mode. It starts the screen selection then.
- `dolly_process_worker_retired(104)` calls
  `dolly_terminal_discard_pending_input()`, which dropped the press, drag and
  release written a millisecond earlier (`read=2>5 write=5>5`). No selection
  follows. Load widens the window (three `printf` Workers retire first), which
  is why a busy machine made it frequent.
- Not a lost wake-up and not Firefox throttling: in every captured failure
  page timers ran at 10 ms, the page was visible and focused, and the
  presenter had painted the newest frame.

A user can hit the kernel half in any browser: a mouse press, drag or wheel
step in the ring when a foreground program's Worker retires is dropped, so a
selection does not start and Ctrl+Shift+C copies nothing; a large interactive
program (python, Pi, games) delays its retirement by 500 ms, which widens the
window. Keys typed then are dropped by design (stale input of the old program).

Fix (kernel only, image inputs unchanged `047fc328…`):

- `dolly_input_ring_discard(ring, terminal_ui)` (`host/display/input-ring.c`):
  a discard still drops the old program's key, text and paste records and
  still hands resize to the driver; when the terminal owns the display its
  own pointer and scroll records reach the driver too. A graphics owner's
  lease ending keeps dropping them (its coordinates were the program's).
- `refresh_foreground()` (`src/process-kernel.c`) publishes no foreground
  while an exited owner awaits retirement, so nothing mistakes it for a
  program in raw mode.

Evidence: unit test of the rule in `test/terminal-ring.test.mjs`; the
retirement case in `test/display-browser.mjs` (a 160 MiB interactive program
prints a ruler and exits; drags written while no foreground is published must
all reach the selection), which fails 2 of 3 runs in Chrome with the discard
restored; 600 of 600 openings under the ten-loop load that reproduced it;
`core`, `boundary`, `display`, `terminal`, `shell` and `process` in both
browsers.

Still open: the narrowed mouse-drag failure at `terminal-browser.mjs:67`
(after zoom and paste) is a different sequence, no foreground program ends
there, and it did not occur in these runs.

## Seen again with the parked presenter (2026-10-06, pi-local)

Since `77f18fce` (`host/display/display.mjs:443`, "terminal selection reset")
`demos/local-llm/test/local-llm-browser.mjs` fails in Chrome at the same
step in 2 of 2 runs: after the session is saved and the page reloads,
`waitForInteractiveTerminal(... 'restored Pi')` throws "timed out waiting for
terminal selection reset" (once "... selection publication"). Every step
before it passes, including a Pi agent run. The trials rig for task
`20261005-215204-pi-local-loop` hit the same two messages on first boot about
one run in four under load and passed on retry. Not investigated further:
the helper's press-then-wait-for-null step may not run while the idle
presenter is parked.

## Note (2026-10-06, `core/decisions`)

Under machine load (a CMake bootstrap building beside the test, load average
6 to 13) `demos/emacs/test/emacs-browser.mjs firefox` fails about every
second run, on the old seed (`46a5776f`, 5 of 8 passed) and the new one (4 of
8) alike, with "timed out waiting for terminal selection publication" or text
that never appears after typing. The core `display` suite showed the first
message once in four Firefox runs. Chrome did not fail.

## The pixel wait after leaving fullscreen (2026-10-06 night, `fix/terminal-pixels-flake`)

A third failure of the same suite, at `test/terminal-browser.mjs:118` in
Firefox: after `F11` and the wait for `!document.fullscreenElement`, the seven
pixels of the RGB and palette backgrounds never match and the wait times out.
Seen in the seed round's suite and in 2 of 8 runs under
`20261006-142127-kboundary-02`, which could not explain it.

### Cause: the test printed before the terminal had the window's grid

The suite is right about the pixels and wrong about the moment. Leaving
fullscreen changes the grid from 167x28 to 157x26, and the terminal takes
that size a frame or more after `document.fullscreenElement` is cleared: the
page pushes the resize from `fullscreenchange` through `requestAnimationFrame`
and from its `ResizeObserver` (`host/display/input.mjs:219-221`, `:245`), and
the plugin applies it on its next service tick (`src/ghostty/display.c:855`,
`ghostty_terminal_resize` at `:435`). The test submitted its `printf` as soon
as the element was gone, so the two raced. When the text is drawn first, the
resize reflows it: the screen was cleared with a background colour, and to
Ghostty a cell that holds only a background is content
(`Cell.isEmpty`, `src/terminal/page.zig:2296` of the pinned source; the reflow
trims only empty cells, `PageList.zig:1654`), so every 167-cell row wraps into
157 and 10, the text scrolls out of view and the cursor ends at the top left.
That is upstream Ghostty's behaviour, unchanged, and nothing stopped
presenting.

Not the cause: a frame lost or drawn at the old geometry (the canvas and the
geometry both follow the resize), a frame callback Firefox withholds (the
timeline polls on `requestAnimationFrame` throughout), or erased cells taking
their colour another way.

### Measured (Firefox, load average 7 to 10, `build/ending-evidence/`)

- The suite as it was, with a timeline of the page's and the terminal's sizes
  (`terminal-diag.mjs`): 2 of 36 runs wrong. Both read the same seven pixels,
  `242,212,92 20,22,27 20,22,27 38,38,38 20,22,27 20,22,27 20,22,27` (the
  cursor at the top left, a full row, the 10-cell remainder of a wrapped row,
  no palette row in view), with an empty screen text. In both the test saw
  the element gone 2 to 5 ms before `fullscreenchange` fired and the grid
  changed after the text was drawn; in the 34 right runs it changed before.
- The order forced, with no fullscreen and no race (`order-probe.mjs` pushes
  both resizes itself): resize then print, 8 of 8 the expected pixels; print
  then resize, 8 of 8 exactly the seven wrong pixels above. Chromium gives the
  same 8 of 8 each way.
- With the wait added: 40 of 40 right in the same harness; the suite itself
  passes 20 of 20 in Firefox (load average 3 to 20) and 5 of 5 in Chromium.

### Fix (test only: no runtime, kernel or image change)

The suite records the grid before it enters fullscreen and, after leaving,
waits for the terminal to report that grid again before it prints, as it
already waits for the canvas after entering.

A person sees the same reflow when a window shrinks under a screen painted
with a background colour; it is Ghostty's, and no Dolly code decides it.
The mouse-drag failure at line 67 recorded above is not examined here.

## The neovim demo failure and keys typed after an exit (2026-10-07, `fix/selection-after-exit`)

Seed round (`9077dda1`, image inputs `22d006ca…`): `demos/neovim` failed 6 of
10 runs in Chrome with `timed out waiting for terminal selection publication`
at `prompt(recoveryPrompt)`, right after `:q`.

Mechanism, from a timeline of the terminal and display mailbox words in the
failing runs (`build/selfix-evidence/repro-wait-1.log`): no record is lost.
`waitForInteractiveTerminal` starts reading the screen while Neovim, still the
foreground program in raw mode, is about to exit. `visibleTerminalText()`
(`host/display/display.mjs`) presses, waits a frame for the old selection to
go, then drags. Neovim leaves the alternate screen in between, and a drag
cannot extend a selection whose press was on the other screen
(`handle_pointer` in `src/ghostty/display.c`: the gesture yields none). The
helper then waited its five seconds and threw through the outer wait.
Confirmed without any program exiting: press, `printf '\033[?1049l'`, drag
selects nothing; output or a clear in between does not break it
(`altscreen.log`). The discard at retirement is not involved: Neovim has no
reclamation delay here and the records were consumed by the driver.

Fix 1 (`521ef85f`, page only): the helper makes the gesture again when it
yields no selection, with waits of 0.25, 0.5, 1 and 3.25 s.
`test/terminal-browser.mjs` makes a full-screen program's exit fall between
the press and the drag; it fails with the same timeout without the fix.

Fix 2 (kernel only, image inputs unchanged): keys are a different matter.
Measured with the 160 MiB interactive fixture: a command typed in the 500 ms
between the program's exit and its Worker's retirement was dropped, 3 of 3
(`keys-after-exit.log`), because `dolly_process_worker_retired` discarded
pending input. The discard now happens when the terminal's owner exits
(`mark_process_exited`): what it left unread is dropped, what is typed
afterwards reaches the shell. `test/display-browser.mjs` types a command in
that window.

Evidence on both fixes: `demos/neovim` 10 of 10; `terminal`, `display` and
`process` in Chrome and Firefox; `core`, `shell` and `boundary` in Chrome.

## 2026-10-07, round 3: typed text cut short in Emacs, once

In round 3's demo suite (`work/locks`, `integrate/round3` at `d749b3ad`,
11:13 to 11:31, the machine also building two images) the `emacs` test in
Chromium typed `/tmp/dolly-emacs-test.txt` at the "Find file:" prompt and the
minibuffer received only `/t` (`work/locks/build/round3-evidence/demos.log`
lines 26 to 40). Two reruns right after passed in Chromium and Firefox. So
input pushed by the page can be cut short on its way to a program that is
reading the terminal; not reproduced, cause unknown. Candidates to check, not
to believe: the discard of pending input when a process is marked exited
(`9abd08b0`), if Emacs or its start-up runs and reaps a child at that moment;
the page's text push being split across frames while the ring is serviced.
The same round moves this code into `input@0` next.

## Two more sightings (2026-10-07 and 2026-10-08, the integrator)

- 2026-10-08 04:5x, Chromium, the `pi` demo test in a round on `847006a9`
  while two image builds ran beside it: the test typed
  `! printf 'DOLLY-ENTRY-CWD=%s\n' "$(pwd)"` and the terminal held
  `DOLLY-ENTRY-CWuD`. The command has no `u`. A `u` ends a kitty keyboard
  sequence (`CSI … u`), so one key's escape sequence was split or half
  consumed and its last byte landed in the line as text. The test passed on
  the next run (55.9 s). Log: `work/locks/build/checkpoint-evidence/demos.log`
  lines 20 to 50.
- 2026-10-07 21:36, Chromium, the `code-agent` page served from a checkout:
  a line of about 190 characters typed with Playwright's `keyboard.type`
  arrived cut near 150 (`janis /opt/claude-coc-`); shorter lines typed the
  same way were whole. Not reproduced by the agent that looked for it.

Both are fast scripted typing; nobody has reported it from a keyboard. They
point at the input path under load (bytes of one key's sequence delivered in
two reads), not at any one program.

# Input: typed and pasted text (2026-10-08, `fix/terminal-input`)

Apart from the screen-reading entries above. Everything here is about bytes
on their way from the page to the program that reads the terminal. Probes
and logs: `build/input-evidence/` of `work/sockets` (not committed).

## Sighting 2 reproduced: scripted typing overruns the ring

`page.keyboard.type` at Playwright's default rate (about 1.6 ms a key) into
Slop's prompt, image `system`, Chromium, 1280x800, load average 4 to 10
(`type-slop-chromium-2.log`), wrong lines per attempts by line length:

| 50 | 100 | 150 | 200 | 400 | 1000 |
| --- | --- | --- | --- | --- | --- |
| 0/3 | 0/3 | 3/3 | 3/3 | 3/3 | 3/3 |

Every wrong line is whole for about 128 characters and has holes after that.
The page counted every lost record in `data-input-dropped` (25 to 1583 a
line) and showed "Input dropped": the ring holds 256 records, a typed
character is two (key down, key up), and Slop took them slower than they came.

Why Slop is slow (`rate-chromium-1.log`: 100 keys pushed at once, timed until
the ring is empty, frames counted from `data-frame-sequence`):

| canvas | ms per key | frames published for 100 keys |
| --- | --- | --- |
| 1280x800 | 1.5 | 102 |
| 1920x1080 | 3.1 | 101 |
| 2560x1440 | 5.6 | 101 |
| 3840x2160 | 14.3 | 102 |

One whole frame is drawn for every record the reader takes, key or text
record alike. `fill_terminal_input` (`host/display/kernel.c:147`) asks the
driver for pending terminal replies with `handle_event(NULL, …)` before every
record, and the driver draws a dirty terminal on that call
(`src/ghostty/display.c:850`): Slop's echo of the last key made it dirty. The
service tick was meant to be the only caller that draws ("at most one dirty
framebuffer per supervisor tick", `host/display/input-ring.c:25`).

A person: 5 to 15 keys a second, 30 with a held key, against 670 a second
taken at 1280x800 and 70 at 3840x2160 on this machine. Not reachable by
typing here; a slower device with a large canvas narrows it.

## Not causes (measured, Chromium, `system`)

- A paste into Slop's prompt, written to a file by the commands it holds and
  compared byte for byte (`paste-slop-chromium-1.log`), wrong per attempts:
  one line of 200, 2,000 and 50,000 characters 0/3 each; many `echo … >> file`
  lines totalling 200, 2,000 and 50,000 characters 0/3 each; the same after a
  first line that runs a program (`cat /dev/null`) 0/3 each; 2,000 characters
  where every line is a pipeline of programs 0/3.
- Keys typed while a command runs (`sleep 3`, then 23 keys at 60 ms):
  0 of 5 lost (`ahead-chromium-1.log`). The discard at process exit
  (`9abd08b0`) applies to the program that holds the foreground role, which
  only `/bin/foreground` gives (image entries); a command Slop runs is its
  child and its exit discards nothing.
- A program in raw mode (`rawread.c`: `tcsetattr` without ICANON, ECHO and
  ISIG, `read(0, …, 65536)` until 0x04, every read logged), what it read
  compared byte for byte (`raw-chromium-1.log`), one attempt a cell, all
  equal: 150, 400 and 2,000 characters typed at Playwright's rate (2,000 in
  234 ms, 8,500 keys a second, nothing dropped: without an echo there is no
  frame to draw); pastes of 200, 2,000 and 50,000 characters with a newline
  every 30, plain and with bracketed paste on, through `__dolly.paste`, with a
  100-byte read buffer, and through the clipboard and Ctrl+Shift+V.

## Sighting 1 explained: a 256-byte read cuts a key's sequence (Janis)

Pi asks for kitty keyboard flags 7, so a typed character is its text on the
press and `ESC [ code ; 1 : 3 u` on the release (`key_encode.zig` of the
pinned Ghostty). Janis reads the terminal in `js_dolly_read_raw`
(`demos/javascript/quickjs-main.c:882`) one byte a call into `bytes[256]` and
hands Pi what it has when the buffer is full. The bytes of
`! printf 'DOLLY-ENTRY-CW` as Playwright types them count 257: byte 256 is
the `3` of W's release `ESC [ 1 1 9 ; 1 : 3 u` and byte 257 its `u`. Pi's
input buffer (`pi-tui/dist/stdin-buffer.js`) gives up on an unfinished
sequence after 50 ms and takes what follows as text: `CWuD`, as seen. It
needs 23 keys waiting when Pi starts to read (Pi busy, as at start-up under
load) and Pi spending 50 ms on the first chunk.

Measured with the probe reading as Janis does (`-j`, flags 7, 60 keys queued,
601 bytes): 3 reads of 256, 256 and 89 bytes, and both boundaries inside a
sequence (`ESC [ 4 8 ;` | `1 : 3 u`, then `ESC` | `[ 4 8 ; 1 : 3 u`). The
same keys through one `read` of 65,536: one read of 601 bytes, no cut.
A person meets it by typing 23 keys or more while Pi does not read.

## More counts before the fix (2026-10-08)

- Firefox, the same typing at Slop's prompt (`type-slop-firefox-1.log`):
  50 and 100 characters 0/3, 150, 200 and 400 characters 3/3 wrong, 7 to 405
  records counted as dropped a line. The same as Chromium.
- At a person's rate, Chromium (`type-slop-human-chromium-1.log`): 200
  characters at 15 keys a second 0/3 wrong and at 5 a second 0/3, nothing
  dropped. With node and the browser pinned to one core (`taskset -c 7`,
  `type-slop-pinned-chromium-1.log`): 100 and 200 characters at 15 a second
  0/3 each. The 2,000-character and the scripted one-core cells were stopped
  unfinished when the round was cut short.
- Paste, 2,000 and 50,000 characters with newlines, wrong per attempts:
  Slop's prompt in Chromium 0/3 and 0/3 as one line, 0/3 and 0/3 as many
  lines; the raw-mode reader in Chromium and in Firefox byte for byte equal,
  plain and bracketed, with the same SHA-256 in both browsers
  (`raw-firefox-1.log`); Neovim's insert mode (`nvim --clean`, the file it
  wrote hashed) in Chromium 0/3 and 0/3, and 200 characters 0/3
  (`nvim-chromium-1.log`); Slop's prompt in Firefox 200 and 2,000 as one line
  0/3 each (50,000 not run). No paste lost or reordered a byte.
- Neovim's insert mode, typed, Chromium: 150 and 400 characters at
  Playwright's rate 0/3 each, 200 at 12 keys a second 0/3.

## A paste a person can lose: no element focused (found on the way)

Ctrl+Shift+V with the focus on the page body does nothing and says nothing,
while typing still arrives (`focus-paste-chromium-1.log`: 1 of 1). The paste
handler takes only pastes aimed at the hidden keyboard element, and a click
on page text that is not a control (the status line) leaves no element
focused. After a click on the terminal or the download button the element
has the focus and the paste arrives (1 of 1 each).

## Fixes (`fix/terminal-input`)

- Kernel only, image inputs unchanged (`01da8fef…` before and after
  `npm run build:runtime`): `fill_terminal_input` (`host/display/kernel.c`)
  makes the driver call that also draws only once the reader has caught up,
  so a person's echo shows as before; while records wait it fetches the
  terminal's replies with a record the driver has nothing to do for, and the
  service tick draws. `test/display-browser.mjs` pushes 100 keys at Slop's
  prompt and counts the frames published until the ring is empty: against the
  runtime without the fix it fails with "100 frames for the echo of 100 keys
  in 10 ticks" (Chromium, `display-before-chromium.log`); with it the suite
  passes in Chromium and Firefox (`suites-after.log`).
- Page only, not an image input: the paste chord gives the keyboard element
  the focus in the terminal as it did under a graphics lease
  (`host/display/input.mjs`). `test/terminal-browser.mjs` pastes after a
  blur; the suite passes in Chromium and Firefox. That test was not run
  against the page without the fix; the probe above is its evidence.

Ran after the fixes: `display` and `terminal`, once each in Chromium and
Firefox, all four passed. Not run: the typing matrix again (the number of
keys a second Slop now takes is not measured), the other core suites, any
demo.

## Left open (2026-10-08, before `input@0` was merged)

- Janis (`demos/javascript/quickjs-main.c:882`) still cuts at 256 bytes. A
  version of `js_dolly_read_raw` that returns everything that waits, with a
  test that queues 60 keys under flags 7, was written and taken out again
  unbuilt: it needs `typescript-build` and `javascript` rebuilt, and Pi's
  chain after them.
- The ring still drops what it has no room for, counted and shown on the
  page. A test that types should read `data-input-dropped` when it fails.
- Sighting 3 (Emacs received `/t` of a 26-byte text record) is not explained.
  The record reaches a `read` whole on every path read here; Emacs drops its
  own type-ahead on a command error (`discard-input`), which was not tested.
  The `gnu-emacs` image was stale in this tree.
- `core/input-module` moves `fill_terminal_input` to `host/input/kernel.c`
  and gives the driver separate `read` and `present` calls, so the kernel
  change here conflicts with it in text and is replaced by it in substance:
  there every frame is the tick's. Its `discard_pending_input` still clears
  the kernel's 256 bytes and not what the driver holds of a long paste, which
  matters only when a program that holds the foreground role exits in the
  middle of a paste.
- Not measured: Python's REPL, a paste larger than 50,000 characters, keys
  that AltGr or Option produce on Windows and macOS (the page passes Ctrl and
  Alt as modifiers; read in the code, not tried).

## Sighting 1 again (2026-10-13, the tmux agent)

`npm run test:demos -- pi` typed `! printf 'DOLLY-ENTRY-CWD=%s\n' "$(pwd)"` and
the screen held `DOLLY-ENTRY-CWuD=`: 3 of 7 runs on `main` with `demo/tmux`
merged (runtime `aacab8fb…`), none of 11 without it, measured by the
integrator in `work/rust`. Measured again in `work/tmux`, Chromium, the same
test, every failure with that same text:

| Runtime | Three at a time | One at a time |
| --- | --- | --- |
| `bd347084…`, built in `work/tmux` from `main`'s kernel and supervisor: the same bytes as `main`'s | 2 of 9 | 1 of 8 |
| `aacab8fb…`, `demo/tmux` | 2 of 9 | 4 of 8 |
| `aacab8fb…` with the supervisor's three `#deliverRaised` calls taken out | 3 of 9 | |

So it fails without `pty@0`, on `main`'s own runtime. It is sighting 1 of
`tasks/20261001-095000-terminal-text-flake`, explained there on 2026-10-08:
Janis reads the terminal 256 bytes at a time (`js_dolly_read_raw`,
`demos/javascript/quickjs-main.c`), byte 256 of this line as Playwright types
it is the `3` of W's key release `ESC [ 119 ; 1 : 3 u`, and Pi takes the `u`
as text when it has spent 50 ms on the first 256 bytes. It needs 23 keys
waiting when Pi starts to read: Pi late, as under load. Another agent ran
Pi's test in `work/polish` during these runs, so the rates above are those of
a loaded machine and do not rank the two runtimes: 3 of 17 against 9 of 26.
Nothing in the module is on the display terminal's read path (read in the
code, and the drain taken out changes nothing).

The cut is still the one "Left open" names. It is being fixed on `demo/tmux`
(`tasks/20261012-130814-tmux`).

