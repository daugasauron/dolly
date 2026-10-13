# The terminal's `ICANON` and `ECHO` without a line discipline: the investigation

Read at `/home/daug/dev/dolly/work/rust` (branch `integrate/round-1013`, head `0155af64`), history shared with `main`; the reflection's tree is `d89bca74`. Nothing was built or run; every number comes from `git`, `grep` and the files. Paths are relative to the tree root. Measurements quoted are those recorded in tasks, with their date.

**Summary (findings, no advice)**

1. A canonical line discipline existed in the kernel from the first commit (`0d224977`, 2026-08-29): `_wasmfs_stdin_get_char` in `src/dolly.c` echoed what was typed, erased on `0x7f`, turned Enter's `0d` into `0a`, ended the read at Ctrl+D on an empty line and dropped escape sequences. It served commands that ran inside the kernel's memory through libc's stdin; Slop read the raw queue for its own editor by design: "The shell consumes the same raw queue for its own line editor; foreground commands consume it through ordinary libc stdin" (`docs/architecture.md` at `0d224977`, lines 170-171).
2. The flags `DOLLY_TERMINAL_CANONICAL`/`ECHO` came on 2026-09-03 (`07a3cf1e`) as the switch of that discipline; `OPOST`/`ONLCR` on 2026-09-07 (`1f2954b6`, the Neovim checkpoint); `ISIG` on 2026-10-01 (`ae86e8c0`, an owner decision).
3. Private processes (`b95459ce`, 2026-09-05) read the terminal through the process ABI, one raw byte at a time, bypassing the discipline; from that day it was dead code for every ordinary command. On 2026-09-30 the audit found the kernel-side stdin device could block the kernel thread (`tasks/20260930-100000-audit-01`), and `26277ef5` removed "the unreachable WasmFS canonical line discipline"; `83976e69` removed the doc's claim that "The terminal owns canonical input, echo"; `d8fa8c47` wrote today's "round-trip" sentence. No commit or task records a decision against a line discipline; the record is "unreachable" plus a thread hazard.
4. On 2026-10-01 the bits were made honest rather than implemented (`b2e6b3f9`, closing `audit-47`); `core-polish` filed "Terminal `CANONICAL`/`ECHO` bits are stored but never applied" as "a terminal-contract decision" (`:125-127`). No decision on it is recorded since. The more-packages task of 2026-10-13 measured the effect and wrote a design "as facts" (`:531-536`); the next-round task lists it as left (`:41-45`).
5. Today the mode is one global for the display's terminal (`src/dolly.c:21-23`) and one per pseudo-terminal (`host/pty/kernel.c:26,196-197`). `ISIG` is acted on in three places, `OPOST`/`ONLCR` in two, `CANONICAL`/`ECHO` in no kernel code. A terminal is read by two operations: `FD_READ` on a terminal descriptor (`src/process-kernel.c:1153-1168`) and `TERMINAL_READ` with a deadline (`:1520-1525`), which Slop and Janis use through `dolly_terminal_read_raw_timeout`.
6. Measured 2026-10-13: Enter is `0d`, Backspace `7f`, Ctrl+J `0a`, Ctrl+D `04`; `unzip` and `zstd` wait for `0a`; `cat` does not end at Ctrl+D; nothing typed is shown (`tasks/20261012-230015-more-packages/TASK.md:491-529`).
7. Programs with their own line handling, with the recipe or source that says so: Slop (313-line editor), `dc` (bc's editor switched on), `sqlite3` (linenoise), `vi` (a six-line header), the Claude Code launcher's `anykey`/`secretenv` ("needed because Dolly's terminal has no line discipline"), and the full-screen and raw-mode programs that clear the flags themselves (Pi, Codex, nvim, less, tmux, dte, Emacs, Python 3.14's REPL by inference). Affected and unpatched: `unzip`, `zstd`, `cat`, Slop's `read`, Python's `input()`, and by inference the Lua REPL and `ed`.
8. The reflection's claims: "stored and returned and nothing acts on them" is true of `CANONICAL` and `ECHO` and false of the other three bits; "`sqlite3`, `dc` and `vi` each needed an editor of their own" is true for `sqlite3`, partly for `dc` (a switch, not a new editor) and false in wording for `vi` (a CR-to-LF header, not an editor); "`unzip` and `zstd` wait until Ctrl+J" is true as measured; "one place per kind of terminal" is partly true (the pty is a kind; the display's terminal is special-cased in two files); "no new operation" is true of the ABI.
9. Slop never clears `CANONICAL` or `ECHO` (it toggles `ISIG` only, `src/slop.c:5196-5200`) and reads through `TERMINAL_READ`; Janis reads a TTY the same way in and out of raw mode (`demos/javascript/janis.js:3129-3132`). Whether a discipline applies to that operation decides whether those two must change. The mode has no owner and is restored by nobody after a forced termination; the kernel-resident era restored it around every spawn (`07a3cf1e`), today's kernel does not.
10. Not found: any owner statement on the discipline itself; whether Python 3.14's REPL and the `qjs` REPL set raw mode here (inferred from upstream and a passing test); what Ghostty does to a pasted newline; the cost of a kernel line buffer; whether a CR-to-LF mapping keyed on `ICANON` alone (the measured design) would serve Neatvi, which needs it in non-canonical mode.

---

## 1. History

### 1.1 The prototype: a discipline in the kernel's stdin device (2026-08-29 to 2026-09-03)

- `0d224977` (2026-08-29, "Initial Dolly prototype"). `src/dolly.c:354-400` at that commit is a cooked-mode reader behind WasmFS's stdin: it reads the raw queue (`dolly_terminal_read_raw`), skips `ESC [`/`ESC O` sequences, on `0x03` prints `^C\r\n` and returns an empty line, on `0x04` with an empty line returns -1 (end of file), on `0x7f`/`\b` erases and writes `\b \b`, on `\r` or `\n` stores `\n`, writes `\r\n` and returns the line, and echoes every printable byte (`echo_byte`). The buffer is `cooked_line[4096]` with `cooked_boundary` so that one end of file is reported once. The design text (`docs/architecture.md` at that commit, lines 167-171): "Emscripten's browser stdin fallback is absent from the artifact. WasmFS fd 0 instead calls Dolly's native canonical terminal device. The shell consumes the same raw queue for its own line editor; foreground commands consume it through ordinary libc stdin."
- `aa0e63c0` (2026-08-31). Slop's `read_interactive_line` first appears (`git log -S`). So from the beginning there were two readers of one queue: the shell's editor on the raw path, and a kernel discipline on the libc path. Commands then were "filesystem modules" loaded into the kernel's memory (`0d224977` architecture.md:174-180), so their libc stdin was the kernel's.
- `07a3cf1e` (2026-09-03, "Preserve shell, Pi, Python, and gamedev work"). `DOLLY_TERMINAL_CANONICAL` and `DOLLY_TERMINAL_ECHO` enter `include/dolly/runtime.h` with the comment: "Small terminal discipline contract. Language/libc adapters translate their own termios layouts above these two stable semantic bits. Foreground Ctrl+C is unconditional lifecycle supervision, not mutable terminal state." `_wasmfs_stdin_get_char` gained the non-canonical branch (raw byte, echoed if `ECHO`, `src/dolly.c:1127-1135` at that commit); `dolly_terminal_mode_set` reset the cooked buffer on every change (`:416`), and the kernel saved and restored `terminal_mode_flags` around each spawned command (`:616`, `:653`). The mode was per command by the kernel's doing.

### 1.2 Private processes make it unreachable (2026-09-05)

- `b95459ce` (2026-09-05, "Checkpoint private wasm64 processes and working Python/Pi images"). Commands moved to private memories. The kernel's read of a terminal descriptor became `dolly_terminal_read_raw_timeout(0)`: one raw byte, or deferred (`src/process-kernel.c:780-786` at that commit); `TERMINAL_READ` did the same with a deadline (`:965-982`). Neither path touched `cooked_line`. The message says nothing of the terminal. From this commit the discipline could be reached only by code running in the kernel's own memory, which no command did any more.
- `f0ffce09` (2026-09-06) and `1f2954b6` (2026-09-07): `terminal_descriptors` (which descriptors are the terminal) and `OPOST`/`ONLCR` (added with Neovim; the comment "OPOST enables output processing; ONLCR maps LF to CRLF when OPOST is enabled" is from this commit). `OPOST` was acted on from the day it came (`dolly_kernel_terminal_write`'s LF-to-CRLF loop, today `src/dolly.c:114-125`).
- Between 2026-09-05 and 2026-09-30 no task records a complaint about echo or Enter (`grep -rl "no echo\|not echoed\|nothing typed" tasks/` hits only tasks of 2026-10-07 and later).

### 1.3 The removal (2026-09-30) and the honest termios (2026-10-01)

- `tasks/20260930-100000-audit-01` ("Reading /dev/stdin blocks the kernel thread and ignores Ctrl+C"): a process that opened `/dev/stdin` got a kernel fd whose read went `_wasmfs_stdin_get_char -> dolly_terminal_read_raw -> an infinite emscripten_atomic_wait_u32` "on the one thread that also runs the JS supervisor, so every process, timer, Ctrl+C and forced termination stalls until a key arrives." Reproduced: "`cat /dev/stdin` + Ctrl+C -> no status after 5053 ms". Result: "the kernel never reads WasmFS stdin (`_wasmfs_stdin_get_char` returns -1; the terminal wait was deleted in `e76df58`)".
- `26277ef5` (2026-09-30, "Fix kernel process semantics and make the process ABI explicit"): "/dev/stdin, /dev/stdout and /dev/stderr open duplicates of the caller's descriptors 0-2, so reading them never blocks the kernel thread; the unreachable WasmFS canonical line discipline is gone." The diff deletes `cooked_line`, `dolly_terminal_reset_cooked`, `echo_byte` and the reader (`git show 26277ef5 -- src/dolly.c`, lines 44-350 of the diff). `terminal_mode_flags`, its getter and setter stayed.
- `83976e69` (2026-09-30, "Document the process contract ... precisely"): "Remove the claims that threads are unsupported, that INT64_MIN is visible to processes and that the terminal implements canonical input." The old sentence: "The terminal owns canonical input, echo and independent OPOST/ONLCR bits. Raw LF is preserved; cooked output can map LF to CRLF." The new: "Terminal reads return the display's raw input bytes; the ICANON and ECHO bits round-trip through termios without a kernel line discipline."
- `d8fa8c47` (2026-09-30, the short-docs rewrite) is the blame of today's line (`docs/process-model.md:111`, line 103 in the reflection's tree): "Terminal reads return raw input bytes. `ICANON`/`ECHO` round-trip through termios without a line discipline".
- `e76df581` (2026-10-01): "Every kernel caller reads terminal input with a zero timeout, so the timed wait and its session servicing, left from the kernel-resident shell, never ran". The kernel reads through `dolly_kernel_terminal_read`/`ready` since.
- `a7c5158c` (2026-10-01): "src/dolly.c keeps the terminal line discipline": the name survives as a comment (`src/process-kernel.h:112` "The terminal line discipline and the page's terminal mailbox"), naming the flag store.
- `ae86e8c0` (2026-10-01, "Make Ctrl+C follow termios ISIG"): the owner's decision in `tasks/20261001-000500-slop-loop-interrupt/TASK.md:35-41`: "Termios ISIG, the Unix model. Ctrl+C is SIGINT to the foreground while its terminal has ISIG set and input while a program clears ISIG (raw mode, as Pi's editor and Codex do). Slop's line editor clears ISIG while reading a line and restores it while commands run ... This replaces `include/dolly/runtime.h`'s rule that Ctrl+C is not mutable terminal state." The same task's open question (`:25-28`) had been "How an interactive owner chooses between Ctrl+C as input and Ctrl+C as SIGINT while busy, without making Ctrl+C mutable terminal state". The answer chosen was the termios bit. `148f77d5` (same day): "Janis's process.stdin.setRawMode now clears ICANON, ECHO and ISIG on a TTY like Node's".
- `b2e6b3f9` (2026-10-01, "Report the real terminal discipline and block pause until a signal"): "TCGETS no longer claims ICRNL, IXON, VQUIT, VSTART or VSTOP, which the terminal never performs, and TCSETS* rejects input mapping, flow control, other output processing, other signal keys and non-canonical reads other than VMIN 1, VTIME 0 with EINVAL instead of dropping them." `audit-47` closed with "one honest termios in the core". `tasks/20261001-214000-core-polish/TASK.md:125-127`, the same day: "Terminal `CANONICAL`/`ECHO` bits are stored but never applied and termios reports `ICRNL|IXON` it does not implement: a terminal-contract decision (`20260930-100000-audit-47`)." The second half was done by `b2e6b3f9`; the first half has no later record.

### 1.4 After: the pseudo-terminal copies the display's discipline, and the measurement (2026-10-12 to 10-13)

- `tasks/20261012-130814-tmux/TASK.md:104-112` (the pty proposal): "The slave needs none. The process contract already has a terminal request by descriptor ... The discipline is the display terminal's: no input editing or echo, `OPOST` with `ONLCR` writes LF as CRLF, and under `ISIG` byte 3 is `SIGINT`." `d9f8104e` (2026-10-12) implemented it with a mode of its own per pty; `docs/process-model.md:213-215` says the same.
- `40944e63` (2026-10-13, the tools packages): `sqlite3` with linenoise, `dc` with bc's editor on, Neatvi with a header; the recipe comments give the reason (section 3).
- `914b908d` (2026-10-13): the measurement, "what a question at the terminal waits for" (`tasks/20261012-230015-more-packages/TASK.md:477-536`), quoted in section 2. Its last paragraph: "**What these programs would need of a line discipline**, as facts for its design: while `ICANON` is set, a read gets a whole line with `0d` turned into `0a`, the line is shown as it is typed (`ECHO`), `7f` erases, and `04` on an empty line ends the read with 0 bytes; while it is clear, reads are as they are now. The two flags already travel through `tcgetattr` and `tcsetattr`." Its section "What the platform lacked" (`:91-101`): "A line discipline in the kernel's terminal (echo, erase, CR to NL while `ICANON` is set) is a change to the kernel, not to an image input."
- `tasks/20261012-220109-next-round/TASK.md:41-45`: "The terminal does not turn Enter's carriage return into the newline a program reading a line waits for: `unzip` and `zstd` wait at their overwrite question until Ctrl+J."
- `tasks/20261007-085236-claude-code-image/TASK.md:299-310` (2026-10-07): a C helper in the recipe "reads a line without echo (Backspace erases; ...)" because "Dolly's terminal has no line discipline (reads return raw bytes and Enter is CR, `docs/process-model.md`), Slop's `read` has no `-s` and waits for LF, there is no `stty`".

### 1.5 What the history says that the reflection does not

- The discipline the reflection proposes existed, in the place it names (the kernel, `src/dolly.c`), for a month; it was not taken out as a design choice but because the process model moved commands out of the memory where its reader lived, and the reader then became a hazard to the kernel thread (`audit-01`).
- The 2026-09-03 contract text said Ctrl+C was "not mutable terminal state"; the owner reversed that on 2026-10-01 for `ISIG` with "the Unix model". That is the one owner decision about these bits in the record, and it is about `ISIG`, not `ICANON`/`ECHO`.
- On the same day the choice for `ICANON`/`ECHO` was to report the truth (`b2e6b3f9`) and file the rest as a decision to take (`core-polish:125`). Nothing has taken it.
- The kernel-resident design restored the mode around every command (`07a3cf1e` `src/dolly.c:616,653`); today nothing restores it (section 2.6).
- The pseudo-terminal of 2026-10-12 was designed to copy the display terminal's discipline as it is; the proposal names "no input editing or echo" as the discipline, not as a gap.

## 2. What happens today

### 2.1 The path of a key

| Step | Where |
| --- | --- |
| The page's `keydown`/`keyup` becomes a key record, unless it is the Ctrl+C chord while the kernel reports the foreground as interruptible: then the page calls `interruptForeground()` and pushes no key | `host/input/input.mjs:298-299` (the chord), `:333-338` |
| `submit(command)` in the test harness and `__dolly.input(text)` push a text record holding `${command}\r` | `host/input/input.mjs:284-290`, `:491-493`, `:177` |
| A button press types bytes "as if typed", in order with the keyboard's records; byte 3 becomes an interrupt while `ISIG` is set | `host/input/kernel.c:134-163`; `docs/input.md:78-81` |
| The record sits in the ring in kernel memory until a reader asks | `host/input/kernel.c:104-132` (`fill_terminal_input`) |
| The display library's decoder turns a key record into bytes: a text record is copied as it is (`:887-892`); a key record goes through Ghostty's key encoder, whose options follow the modes the program has set on the terminal (kitty flags, cursor-key mode) | `src/ghostty/display.c:872-947`, `:940` (`ghostty_key_encoder_setopt_from_terminal`), registered at `:646` |
| A process's `read(0)` is `FD_READ`: for a terminal descriptor the kernel takes one byte or defers, then drains what else is decoded, up to the request size | `src/process-kernel.c:1153-1168` |
| `dolly_terminal_read_raw_timeout(ms)` is `TERMINAL_READ` on descriptor 0 with a deadline: one byte or deferred | `src/process/runtime-adapter.c:352-364`; `src/process-kernel.c:1520-1525` |
| For a pseudo-terminal slave both operations go to the pty kind: `pty_receive` for `FD_READ`, `pty_terminal`'s `READ` case for `TERMINAL_READ`, each one byte or what is queued | `src/process-kernel.c:1147-1149`, `:1509-1511`; `host/pty/kernel.c:93-101`, `:149-159` |
| A write to a terminal descriptor is WasmFS's `TerminalFile::write`, which calls `dolly_kernel_terminal_write`; its `read` returns 0, "since the kernel reads terminal input for processes itself" | `src/file-blocks.cpp:150-165`; `src/dolly.c:111-128` |

The bytes, measured 2026-10-13 (`tasks/20261012-230015-more-packages/TASK.md:493-498`): "`y` is `79`, Enter `0d`, Backspace `7f`, Ctrl+J `0a`, Ctrl+D `04`. Each key was a read of one byte ... Nothing typed is shown, Enter stays a carriage return, Backspace erases nothing, and Ctrl+D is a byte and no end of input." Ctrl+C is `03` only when the page did not intercept it, which is when `ISIG` is clear or no foreground is published (`test/fixtures/terminal-ui.c:118-131`, the `raw` case, asserts byte 3; `test/terminal-browser.mjs:149-154`).

### 2.2 The flags

- Display terminal: one global `terminal_mode_flags`, default `CANONICAL | ECHO | OPOST | ONLCR | ISIG` (`src/dolly.c:21-23`); getter and setter (`:92-102`), the setter rejecting any other bit with `EINVAL`. The setter is reached only by `TERMINAL_MODE_SET` (`src/process-kernel.c:1528-1531`), which then runs `refresh_foreground`.
- Pseudo-terminal: `pty->mode`, the same default at open (`host/pty/kernel.c:196-197`), get and set per slave (`:160-167`); the master answers `ENOTTY` (`:147`).
- libc: `tcgetattr` is `TCGETS` (`src/process/libc-adapter.c:1250-1276`): it reports `OPOST`/`ONLCR` as stored, `CS8|CREAD`, `ISIG` as stored, `ICANON` as stored, `ECHO|ECHOE|ECHOK` when `ECHO` is stored, `VINTR` 3, `VERASE` 127, `VKILL` 21, `VEOF` 4, `VMIN` 1, `VTIME` 0, `c_iflag` 0. `tcsetattr` (`:1277-1288`) translates through `terminal_mode_from_attributes` (`:1201-1218`), which rejects `ICRNL|INLCR|IGNCR|IUCLC|IXON|IXOFF|IXANY|ISTRIP`, any `c_oflag` bit beyond `OPOST|ONLCR`, other signal keys under `ISIG`, and `VMIN`/`VTIME` other than 1/0 when `ICANON` is clear. `TCSETSF` and `TCIFLUSH` drain unread input by repeated `TERMINAL_READ` (`:1221-1233`). `isatty` is `dolly_isatty` (`:51`; `runtime-adapter.c:378-392`, `ENOTTY` when not).
- Which descriptors are a terminal: `terminal_descriptors[]`, true for 0-2 of the first process and inherited by copy (`src/process-kernel.c:564-573`); `/dev/tty` duplicates the display's terminal, or the slave a process has on 0-2 (`:592-599`, `:627-635`, `:1968-1977`); `fstat` reports a character device (`:1940-1942`).

### 2.3 Every place that reads a flag and acts on it

| Flag | Acted on | Where |
| --- | --- | --- |
| `ISIG` | The kernel publishes the foreground as interruptible only while it is set; the page then takes Ctrl+C as an interrupt request and never pushes the key | `src/process-kernel.c:190-193`; `src/dolly.c:53-78`; `host/input/input.mjs:333-337` |
| `ISIG` | A byte 3 typed by a button becomes an interrupt instead of input | `host/input/kernel.c:147-151,160` |
| `ISIG` | A byte 3 written to a pty master is `SIGINT` to the slave's holders, the ancestor spared | `host/pty/kernel.c:115-117` |
| `OPOST`+`ONLCR` | LF written to the display's terminal is rendered as CRLF | `src/dolly.c:114-125` |
| `OPOST`+`ONLCR` | LF written to a slave is put in the master's ring as CRLF | `host/pty/kernel.c:119-122` |
| `CANONICAL`, `ECHO` | nothing in the kernel. Outside it: libc translates them both ways (`libc-adapter.c:1212-1213`, `:1260-1265`); Janis clears them with `ISIG` for raw mode (`demos/javascript/quickjs-main.c:908-911`); the terminal fixture sets the mode to 0 or `ISIG` alone (`test/fixtures/terminal-ui.c:95`, `:202`) | |

So the reflection's "nothing acts on them" is exact for the two bits it names and not for the five the enum holds (`include/dolly/runtime.h:73-79`).

### 2.4 End of input, `poll`, discard

- The display's terminal never returns 0 bytes to a read: `FD_READ` returns at least one byte or defers (`src/process-kernel.c:1153-1160`); `TERMINAL_READ` returns -1 in the response when the deadline passed (`:1522-1525`). The measured consequence: "`cat` with no file ... shows nothing and does not end at Ctrl+D" (`more-packages:524-525`).
- A pty slave returns 0 once the master closed and the ring is empty (`host/pty/kernel.c:96-98`).
- `poll` reports a terminal descriptor readable when a decoded byte is ready (`src/process-kernel.c:1590-1592`).
- Unread input is discarded when the foreground owner exits (`:364-366`); a command Slop runs is not the owner, so what it left unread reaches Slop's editor (`tasks/20261001-095000-terminal-text-flake/TASK.md:314-318`: "Keys typed while a command runs ... 0 of 5 lost").

### 2.5 Slop and Janis on the raw operation

- Slop's editor reads with `dolly_terminal_read_raw_timeout(-1)` (`src/slop.c:5050`), treats `\r` and `\n` alike (`:5108`), `0x7f` and `\b` (`:5163`), `0x03` as an interrupted line (`:5113-5118`), `0x04` on an empty line as logout (`:5086-5090`), `0x15`/`0x0b`/`0x01`/`0x05`/`0x0c`/`0x12`/Tab (`:5098-5162`), and escape sequences through `read_escape_sequence` (`:5009-5038`). It writes its own echo (`:5182-5187`, `redraw_line` at `:4890`). It toggles `ISIG` only (`:5196-5200`), clear at the prompt (`:5234`), set while a command runs (`:5255-5257`), set again on leaving (`:5271`). `git log -S'DOLLY_TERMINAL_CANONICAL' -- src/slop.c` is empty: Slop has never touched the two bits.
- Slop's `read` builtin reads descriptor 0 one byte at a time and returns at `\n` (`src/slop.c:2200-2227`), so at the terminal it returns at Ctrl+J (measured, `more-packages:525-526`).
- Janis reads a TTY stdin with `Dolly.readRaw` whatever the mode (`demos/javascript/janis.js:3129-3132`; `demos/javascript/quickjs-main.c:875-897`: the first byte by `TERMINAL_READ`, the rest by `read`). Its `readline` splits on `\r` or `\n` (`janis.js:572-578`) and refuses `terminal: true` ("does not implement terminal editing", `:560`).

### 2.6 Who restores the mode

Only `TERMINAL_MODE_SET` writes the display's mode (`src/process-kernel.c:1529`); nothing in the kernel saves it per process or restores it at exit (`grep previous_terminal_mode src/process-kernel.c` is empty; `07a3cf1e` had that restore around each spawn). Programs restore it themselves: Slop's `terminal_signals(1)` (`:5271`), Neovim (its test reads the mode after exit and accepts any mask, `demos/neovim/test/neovim-browser.mjs:37-40`), the fixtures (`terminal-ui.c:108`, `:133`), `anykey`/`secretenv` (`Dollyfile-closed-source-agent:45,81`). A process ended by force leaves what it set. Today that matters for `ISIG` alone: Ctrl+C is then input until Slop sets `ISIG` before its next command (`:5255`).

## 3. Who carries their own line handling

Counted from recipes, sources and tasks; "inferred" marks what upstream behaviour implies and nothing here measured.

### 3.1 Programs with their own editor or raw mode, and the evidence

| Program | How it gets a usable line | Evidence |
| --- | --- | --- |
| Slop | its editor, 313 lines (`src/slop.c:4880-5193`) plus history (`:4681-4760`) and completion | `docs/slop.md:55-57` |
| `dc` | bc's editor switched on: `-DDC_DEFAULT_TTY_MODE=1` ("off by default upstream") | `demos/tools/Dollyfile-bc:5-10,34`; `more-packages:68-69` |
| `bc` | its own editor, upstream default | `more-packages:97`: "`bc`, with a line editor of its own, works" |
| `sqlite3` | linenoise 2.0, a `SOURCE` row, a tar, three Makefile lines, a licence file, a pin | `demos/tools/Dollyfile-sqlite:16-17,37-38,43,53,58,76`; `demos/tools/prepare-sources.sh:29-33`; `config/source-pins.sh:368-371` |
| `vi` (Neatvi) | raw mode of its own; a six-line header turns `\r` into `\n` in `read` ("Neatvi leaves it to the terminal to turn Enter ... into a newline (ICRNL). Dolly's terminal maps no input") | `demos/tools/Dollyfile-vi:24-33` |
| `dte` | "Its raw mode only clears flags and asks for one byte at a time"; one source line changed for `tcgetpgrp`, unrelated to the discipline | `more-packages:450-457`; `Dollyfile-dte:26-29` |
| nvim | libuv raw mode; Ctrl+C as input | `148f77d5`; `demos/neovim/test/neovim-browser.mjs:80-86` |
| less | "raw mode through termios" | `tasks/20261006-111926-less-pager/TASK.md:146`; `Dollyfile-less:32-33` |
| tmux | `cfmakeraw` on the display's terminal; its panes get pty slaves | `demos/tmux/Dollyfile-tmux:55`; `tasks/20261012-130814-tmux` |
| Emacs `-nw` | termios (upstream); the test types text and reads it back | `tasks/20260930-231732-emacs:13`; `demos/emacs/test/emacs-browser.mjs:19-24` |
| Pi | Janis `setRawMode` clears `CANONICAL|ECHO|ISIG`; Pi asks kitty flags 7 | `quickjs-main.c:899-917`; `terminal-text-flake:330-333` |
| Codex | crossterm raw mode; reads keys | `tasks/20261001-033000-codex-tui-input` |
| Claude Code (`closed-source-agent`) | Ink through Janis raw mode; the launcher's `anykey` (one key, raw) and `secretenv` (a line without echo, Backspace erases) | `Dollyfile-closed-source-agent:28-84`; `claude-code-image:299-310` |
| Python 3.14.7 REPL | the test types `print(...)\r` and Ctrl+D and the REPL answers (`demos/python/test/python-browser.mjs:73-79`); upstream's `_pyrepl` sets raw mode by termios: inferred, not measured here | `config/source-pins.sh:30` |
| `qjs` REPL | upstream `repl.js` with `os.ttySetRaw` (built, `Dollyfile-quickjs:27`): inferred | |
| the terminal fixtures | set the mode themselves | `test/fixtures/terminal-ui.c:95,127,157,202` |

### 3.2 Programs that read a line raw and show it (measured or inferred)

| Program | What happens at the terminal | Evidence |
| --- | --- | --- |
| `unzip` (`fgets`) | nothing shown; waits for `0a`; Ctrl+J answers | `more-packages:484-485,514-516` |
| `zstd` (`getchar` to `\n`) | the same | `:486-488,517-520` |
| `cat` (core, `fread` 4096) | shows nothing; no end at Ctrl+D | `:524-525`; `src/commands/cat.c:10` |
| Slop `read` | returns at Ctrl+J | `:525-526`; `src/slop.c:2205-2219` |
| Python `input()` | returns at Ctrl+J | `:526` |
| Lua REPL | `lua.c` without readline (`-DLUA_USE_POSIX`, no `LUA_USE_READLINE`): `fgets`, inferred | `demos/neovim/Dollyfile-neovim-build:33` |
| `ed` (sbase) | reads lines with stdio: inferred | |
| Janis `readline` on a TTY | lines at Enter (it splits on `\r`), no echo | `janis.js:572-578` |
| `rev`, `xargs` (core) | read stdin; at a terminal no end of input | `grep` of `src/commands/` |

`demos/tools/README.md:51-57` states the rule for users: "A question that waits for a line shows nothing typed and ends at Ctrl+J, not at Enter: answer it on the command line (`unzip -o` or `-n`, `zstd -f`)."

### 3.3 Rows and files that exist because of the missing discipline

- `Dollyfile-bc:34` (`-DDC_DEFAULT_TTY_MODE=1`, with the comment `:5-10`).
- `Dollyfile-sqlite:16-17,37-38,43,53,58,76`; `prepare-sources.sh:29-33`; `source-pins.sh:368-371` (linenoise, with its own licence).
- `Dollyfile-vi:24-33` (`enter.h`), "the only change to an upstream source in the demo" (`more-packages:71-72`).
- `Dollyfile-closed-source-agent:28-84` (`anykey`, `secretenv`): `secretenv` also exists because Slop's `read` has no `-s` and spools substitutions through a file (`claude-code-image:306-310`), so a discipline alone would not remove it.
- Not for the discipline: `demos/slopyard/Dollyfile-gamedev-sdk:237-255` stubs `tcgetattr`/`tcsetattr` with `ENOTTY` because raylib's memory platform polls a tty it does not have.

## 4. The reflection's claims, checked

**"`ICANON` and `ECHO` round-trip without a line discipline: the flags are stored and returned and nothing acts on them."** True of those two bits (2.3). The sentence it cites is at `docs/process-model.md:111` here, `:103` at `d89bca74`. The same enum's `OPOST`, `ONLCR` and `ISIG` are acted on in five places; the reflection's wording "the flags" overreaches if read as all of them.

**"Slop edits its own line (`src/slop.c:5010-5050`)."** True; those lines are the escape-sequence reader and the editor's start. The editor is 313 lines and predates the removal of the kernel discipline by a month (`aa0e63c0`); it was never written as a workaround for the missing one, since the prototype's design gave the shell the raw queue on purpose (1.1).

**"`sqlite3`, `dc` and `vi` each needed an editor of their own."** `sqlite3`: true (linenoise, vendored). `dc`: partly; the editor is bc's own, present upstream, switched on by one flag. `vi`: false in wording; Neatvi has its own editor regardless and needed a CR-to-LF header, not an editor. The three recipes give "the terminal has no line discipline" as the reason (3.1).

**"`unzip` and `zstd` wait at a question until Ctrl+J, because Enter sends `0d` and they wait for `0a`."** True, measured in both browsers (`more-packages:511-522`), which corrected the task's own earlier "wait for ever" (`:95-96`).

**"Unix put this in the kernel so that programs do not carry it."** A statement about Unix, not checked here. In this tree's own history the kernel carried it for a month and lost it to the process-model change (1.2-1.3).

**"`dolly_kernel_socket_kind.terminal` (`src/process-kernel.h:61`) is the one place per kind of terminal."** Partly. `:61` is the method, and the pty kind answers mode, size, isatty and the timed read there (`host/pty/kernel.c:138-174`). But reads of a slave through `read()` go to the kind's `receive` (`:93-101`), not `terminal`, and the input side (what `pty_send` does with byte 3 and the master's bytes) is a third method. The display's terminal is not a kind at all: its reads are special-cased in `fd_read_packet` (`src/process-kernel.c:1153-1168`) and `terminal_packet` (`:1513-1535`) and its bytes come from `host/input/kernel.c`. So a discipline keyed on the kind would reach pseudo-terminals through one struct and the display's terminal through two files of `if (terminal)` branches.

**"No new operation: with `ICANON` a terminal read returns an edited line, echoed when `ECHO` is set."** True of the process ABI: `TERMINAL_MODE_GET`/`SET` exist (`include/dolly/process.h:301-302`) and libc already translates `ICANON`/`ECHO` both ways (`libc-adapter.c:1212-1213,1260-1265`). What the claim leaves open: there are two read operations on a terminal (`FD_READ` and `TERMINAL_READ`), and which of them the discipline would apply to is the choice that decides Slop's and Janis's fate (5b, 5c). It also leaves open the CR-to-LF mapping: libc rejects `ICRNL` (`:1203-1205`), so either the mapping is implied by `ICANON` (the design in `more-packages:532`) or `ICRNL` becomes a sixth bit in `runtime.h`, which is an image input ("The pi image needs the Rust seed rebuilt (it hashes `runtime.h`)", `slop-loop-interrupt:102-103`).

**"Kernel C if the discipline lives in the kernel's terminal kinds; say so if the libc adapter (an image input) must change too."** For the design as measured (CR to LF and erase while `ICANON`, EOF at Ctrl+D, echo under `ECHO`): the adapter already reports `VERASE` 127, `VKILL` 21, `VEOF` 4, `ECHOE|ECHOK` (`:1263-1269`), so the kernel would be implementing what libc already promises and the adapter need not change. For a POSIX `ICRNL`: the adapter and `runtime.h` change.

## 5. What a change would mean, on real cases

Observations only. "A discipline" means: the kernel holds a line per terminal while `CANONICAL` is set, returns it at Enter with `0d` as `0a`, erases on `7f`, returns 0 bytes at Ctrl+D on an empty line, echoes under `ECHO`, and leaves reads as they are when `CANONICAL` is clear. Two variants recur: **(F)** it applies to `FD_READ` only, as the 2026-09-03 code did (the raw operation bypassed it: "`dolly_terminal_read_raw`"); **(FT)** it applies to `TERMINAL_READ` as well.

### (a) `cat` at the Slop prompt

Today: Slop spawns `cat` with 0-2 inherited (`terminal_descriptors` copied, `src/process-kernel.c:571-573`); `fread` asks for 4096; each key is one `FD_READ` of one byte (`:1153-1168`); nothing is echoed because nobody writes the bytes back to the terminal; Backspace is `7f` in the buffer; Enter is `0d`; Ctrl+D is `04`; the read never returns 0, so `cat` ends only by Ctrl+C (`ISIG` set, page interrupt, Slop spared as the owner with a running child).

With a discipline: the line is held in the kernel beside the decoded bytes (`host/input/kernel.c:32-34` for the display; the slave's ring for a pty); echo goes through `dolly_kernel_terminal_render` (display) or `put(master)` (pty); Enter returns the line ending `0a`; Ctrl+D on an empty line returns 0 bytes once, `fread` ends short, `cat` prints what it has and exits. `fread` of 4096 in musl loops over reads until the count or EOF, so `cat` would print at Ctrl+D, not per line. `poll` (`:1590-1592`) would have to report readable only at a complete line. `TCSAFLUSH`'s drain (`libc-adapter.c:1221-1233`) would have to drop the held line too, or it would drain through `TERMINAL_READ` only under (F).

### (b) Slop itself

Slop never clears `CANONICAL`/`ECHO` and reads with the raw operation (2.5). Under (F) Slop is untouched: the prototype's arrangement. Under (FT) with the default canonical, Slop's editor would receive whole lines at Enter, its arrow keys would be inside the line or swallowed (the 2026-09-03 reader dropped CSI sequences, `07a3cf1e` `dolly.c:1149-1158`), and echo would be doubled; Slop would then clear `CANONICAL|ECHO` at the prompt as it clears `ISIG` (`:5198-5199`, a mask change) and set them before each command (`:5255`) and on leaving (`:5271`). Its `read` builtin (`:2200-2227`) would return at Enter under either variant, since it reads descriptor 0 through `FD_READ`. The mode being global, a command Slop runs inherits what Slop set before spawning it; the 2026-09-03 kernel saved and restored the mode around each spawn (`07a3cf1e:616,653`), and nothing does now (2.6).

### (c) Programs that expect single bytes and never clear `CANONICAL`

Found by grep of every caller of `dolly_terminal_read_raw_timeout`, `tcsetattr` and the test fixtures:

- Slop (b).
- Janis: `process.stdin` on a TTY reads `Dolly.readRaw` in cooked mode too (`janis.js:3129-3132`); a Janis script that reads lines without `setRawMode` (its `readline`) gets lines at Enter today because it splits on `\r` (`:572-578`). Under (F) unchanged; under (FT) it would get `0a`-ended lines with echo, which its splitter also accepts.
- Button presses: typed bytes enter the same queue (`host/input/kernel.c:134-163`); the buttons test types a shell command (`test/buttons-browser.mjs:75-82`), which reaches Slop.
- Every raw-mode program listed in 3.1 clears `CANONICAL` through termios or `setRawMode`, so neither variant reaches it; Neatvi keeps needing its header under a mapping keyed on `ICANON`, since it reads in non-canonical mode and wants `ICRNL` (`Dollyfile-vi:24-25`).
- Games take the input lease and read records, not terminal bytes (`docs/input.md:28-30`); unaffected.
- The fixtures (`terminal-ui.c`, `rawread.c`, `pty.c`) set their own mode; `test/fixtures/pty.c:94-96` asserts a slave reports `OPOST` and `ISIG` and accepts `tcsetattr`.
- No program was found that reads single bytes through `FD_READ` on a terminal and relies on getting them while `CANONICAL` is set, other than the line readers of 3.2, which get bytes they did not want.

### (d) Python's REPL, nvim, less, tmux; forced termination

They set raw mode at start and restore at exit (3.1); a discipline leaves them as they are while raw. What changes is the window before their `tcsetattr`: keys typed while they load would sit in the kernel's line buffer under canonical mode. Whether a switch to non-canonical hands over the held bytes at once is a design point with no code either way today (the 2026-09-03 setter reset the buffer on every mode change, `07a3cf1e:416`). A process killed by force (500 ms rule, `docs/process-model.md:278`) leaves `CANONICAL`/`ECHO` as it set them, as it leaves `ISIG` today; the next line reader then runs raw and silent, and Slop re-asserts only what Slop manages. There is no `stty` (`claude-code-image:308`). A kernel that restored the mode at a foreground change would be the analogue of the 2026-09-03 restore; `refresh_foreground` (`src/process-kernel.c:180-194`) already runs at every exit and mode change and is the one place that reads the mode for the foreground.

### (e) A program inside a tmux pane

tmux has the display's terminal in raw mode and holds each pane's master; the pane's program holds the slave. Keys go page, ring, decoder, tmux's `FD_READ` (raw), tmux's `write(master)`, `pty_send` (`host/pty/kernel.c:105-127`, where `ISIG` and `ONLCR` are already applied per `pty->mode`), the slave's ring, the program's `pty_receive` or `pty_terminal` READ. A discipline would be applied once per terminal that has `CANONICAL` set: not at the display (tmux cleared it), once at the slave (its own mode, `:26`). The code would be in `pty_send`/`pty_receive` keyed on `pty->mode` and in the display's branches keyed on `terminal_mode_flags`: the same logic in two places or one function called from both, with the line buffer in the terminal's own state. The tmux test types `\r`-ended commands into Slop in panes and `:q!\r` into `vi` in a pane (`demos/tmux/test/tmux-browser.mjs:50-139`), all raw readers.

### (f) Pi or Codex as the image's `ENTRY`

`/bin/foreground -i` starts them; each sets raw mode itself and restores it at exit; the Pi test types drafts and `\x04` (`demos/pi/test/pi-browser.mjs:134-169`), the Codex login fixture keys (`demos/codex/test/fixtures/codex-login.mjs:142-184`). Unchanged by a discipline except the start-up window of (d). The Claude Code launcher's `anykey` discards what was typed during boot on purpose (`TCSAFLUSH`, `claude-code-image:302-304`); under a discipline the same call would have to discard a held line.

### (g) Input typed ahead while no program reads

Today the ring keeps records until a reader decodes them (`host/input/kernel.c:104-132`); the owner's exit discards unread input (`src/process-kernel.c:364-366`), a child's exit does not (2.4). With a discipline the held line is one more thing the discard rule applies to; a line half typed when the reader changes (a command exits and Slop reads next) is the case the 2026-09-03 `cooked_boundary` and the per-spawn reset handled.

### (h) The tests

56 browser test files type into the terminal; 15 use `input(` for raw text (list in the grep: `test/shell-browser.mjs`, `test/terminal-browser.mjs`, and 13 demo tests). `submit(command)` pushes `${command}\r` as a text record and waits for the shell's published result, not for echo (`host/input/input.mjs:284-290`); the prompt is matched on Slop's printed `dolly:...$` (`test/browser.mjs:25,37`). So:

- Tests that rely on Slop's own editing: `test/shell-browser.mjs:49` types `\x1b[Ahelx\x7fp\r` (an arrow with empty history, a Backspace) and expects `help` to run. Unchanged under (F); under (FT) it holds only if Slop clears the bits at its prompt.
- Tests that assert the absence of echo: `demos/closed-source-agent/test/closed-source-agent-browser.mjs:134-135` ("the key was shown") on `secretenv`, which clears `ECHO` itself; unchanged.
- Tests that type into raw-mode programs: terminal-ui (`test/terminal-browser.mjs:148-165`), Pi, Neovim, Emacs, Codex, tmux's panes, Python's REPL (`\r` then `\x04`, `python-browser.mjs:75-78`); unchanged if the programs' raw mode holds, which it does by their own `tcsetattr`.
- Tests that assert the mode: `test/terminal-browser.mjs:148` (fixture `discipline`: `OPOST`/`ONLCR` round-trip and `IXON` refused with `EINVAL`, `terminal-ui.c:15-66`), `test/fixtures/pty.c:94-96`, `demos/neovim/test:37-40` (any mask after exit). A discipline that adds no bit leaves them; an `ICRNL` bit changes the `IXON`/`c_iflag` assertion (`terminal-ui.c:58-63` expects `c_iflag` 0).
- No test types Ctrl+J or `\n` into a line-reading program, and none types into `cat`, `unzip`, `zstd`, `read` or `input()` at the terminal (grep); so no test asserts today's raw behaviour for a canonical reader, and none would prove a discipline until written.

### What would have to exist, and what would stop being needed

To exist: a line buffer per terminal (one for the display, one per pty), the reader in `fd_read_packet`'s terminal branch (`src/process-kernel.c:1153-1168`) and in `pty_receive` (`host/pty/kernel.c:93-101`), a decision for `TERMINAL_READ` (`:1520-1525`; `pty_terminal` `:149-159`), echo through `dolly_kernel_terminal_render` and the master's ring, an escape-sequence skipper (Ghostty encodes arrows and, under kitty flags, key releases as CSI sequences, `src/ghostty/display.c:940`), `poll` readiness at a complete line (`:1590-1592`), the flush paths (`libc-adapter.c:1221-1233`), a rule for what a mode change and a foreground change do to a held line, and for `ICRNL` either an implied mapping or a sixth bit in `runtime.h` with the adapter accepting it. Kernel C in `src/`, `host/input/kernel.c` or `src/dolly.c`, and `host/pty/kernel.c`; the libc adapter only for a new bit.

To stop being needed: `Dollyfile-bc:34`'s `DC_DEFAULT_TTY_MODE` (bc's own stays upstream's default), linenoise in `Dollyfile-sqlite` with its tar, pin and licence, the `unzip -o`/`zstd -f` advice in `demos/tools/README.md:51-57`, `secretenv`'s own erase loop (not `secretenv` itself: Slop's `read -s` and the spool remain its reasons), and the sentence at `docs/process-model.md:111-112`. Not Neatvi's header, unless the mapping also applies in non-canonical mode. Not Slop's editor, Pi's, Codex's, nvim's, less's, tmux's, dte's or bc's: each is a full-screen or raw-mode program whose editing is its own on any Unix.

Where today's behaviour is relied upon, exactly: Slop's editor and `read` builtin on raw bytes with `CANONICAL` set (`src/slop.c:5050`, `:2205`); Janis's stdin on a TTY (`janis.js:3132`); `test/shell-browser.mjs:49`; the pty slave's documented discipline (`docs/process-model.md:213-215`) and `test/fixtures/pty.c:94-96`; Neatvi's header (`Dollyfile-vi:24-33`) on `\r` arriving unmapped in raw mode.

## 6. What could not be found out

- Whether the owner has a view on the discipline itself: no task or commit records one; the only owner decision on the bits is `ISIG` (2026-10-01, "the Unix model"), and the same day's choice for `ICANON`/`ECHO` was to report them honestly and file a decision that was never taken.
- Whether Python 3.14's REPL and `qjs`'s REPL set raw mode here: inferred from upstream and from the Python test typing `\r`; not measured.
- What Ghostty's `ghostty_terminal_paste` does to a newline in a user paste (`src/ghostty/display.c:741-767`) and under bracketed paste: not read in the pinned Ghostty; the harness's `submit` bypasses it with a text record.
- Whether `git`'s terminal prompts (credentials) are built in or out in `Dollyfile-system-tools`: no `askpass`/`GIT_TERMINAL_PROMPT` row found; not read in git's source.
- Which of the 77 packages' programs read a line from a terminal beyond those measured: the catalog was not run; 3.2 lists what tasks measured and what upstream sources imply.
- The cost of a kernel line buffer and echo on the supervisor's 16 ms tick, and the first-echo latency the presenter work measured for Slop's echo (`tasks/20261002-072000-input-host-module/TASK.md:246-248`): nothing was built.
- Whether the 2026-09-03 discipline ever served a program other than through WasmFS stdin between 2026-09-05 and 2026-09-30: the only reader was `_wasmfs_stdin_get_char`, which `audit-01` found reachable through `/dev/stdin` and which blocked the kernel thread; no other caller was found.
- Whether a discipline applied to `TERMINAL_READ` is what the reflection means: it names no operation.