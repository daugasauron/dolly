Read on `main` (2026-10-14) by a Fable agent, read-only. One agent wrote this report in two parts; the other part is [the terminal reports the mouse to no program](../20261013-154704-terminal-mouse/investigation.md).

# Part B: which program holds a terminal, and where it stands

Read on the same tree; tmux's upstream files from the staged archive; line numbers of `src/process-kernel.c` and `include/dolly/process.h` of this tree.

**Summary (findings, no advice)**

1. What a process may learn about another one grew in four steps: `INFO` (its own pid and parent) and `WAIT` with private processes (`b95459ce`, 09-05); `SIGNAL` by pid (`d5badb25`, 09-06); `readlink("/proc/self/exe")`, its own path (`be2b2968`, 09-09, "executable identity"); `/proc/processes`, every live process's pid, parent, state and arguments (`06872986`, 10-13, the owner's "add a minimal ps"). Nothing names a terminal or a directory of another process.
2. The kernel holds, per process, everything the two questions need: `parent_pid`, `arguments`, `path`, `current_directory` (an open directory handle), which descriptors are the display's terminal (`terminal_descriptors`) and which are pseudo-terminal slaves (`sockets[]` of the pty kind, each with a number that names it `/dev/pts/N`) (`src/process-kernel.c:52-83`).
3. The kernel has two notions of "who holds a terminal", both for signals only: the display's foreground owner (`foreground_pid`, `refresh_foreground`, published to the page and never to a program) and, for a slave, "the holders minus the one the others descend from" (`dolly_kernel_socket_holders`, `:2422-2435`, `ec45edee`), used to aim `SIGINT`.
4. libc answers: `getcwd` and `getpid/getppid` from the kernel; `isatty` by descriptor; `ttyname` fails on purpose (taken out again on 10-13 after libuv reopened terminals by name); `tcgetpgrp` is musl's `ioctl(TIOCGPGRP)`, which the adapter answers `ENOTTY` for any descriptor (`libc-adapter.c:1345-1348`; measured with tmux `:75` and dte); `setsid` succeeds (measured); `getpgrp` is not measured.
5. tmux's port answers `NULL` to `osdep_get_name(fd, tty)` and `osdep_get_cwd(fd)` (`osdep-dolly.c:15-26`); upstream Linux asks `tcgetpgrp(master)` then reads `/proc/PGRP/cmdline` and `/proc/PGRP/cwd` (`osdep-linux.c:29-83`). tmux calls them with the pane's master and the slave's name (`format.c:966, 986`), and the master is not a terminal here (`host/pty/kernel.c:147`).
6. With `NULL`, `pane_current_command` falls back to the pane's argv, then its shell's basename: "slop" (`format.c:958-979`, `names.c:108-120`); a pane started with a command (`split-window nvim`) is named from argv even today. `pane_current_path` is empty; `split-window` without `-c` uses the session's directory in upstream too (`spawn.c:303`, `server-client.c`), taken from the client that created the session (`client.c:303, 463`).
7. tmux 3.8 understands OSC 7 (`input.c:2736-2740`, `screen_set_path` to `#{pane_path}`) and OSC 0/2 (`allow-set-title` default on, `#{pane_title}`, shown in the default `status-right`: the `"dolly"` on the owner's status line is the hostname title). Slop prints no OSC; the page shows a fixed title; Ghostty records both OSC 7 and the title (`GHOSTTY_TERMINAL_DATA_PWD`, `_TITLE`) and `display.c` reads neither.
8. Others that would ask: `ps` (a six-line script over `/proc/processes`, no TTY column), dte (one source line changed from `tcgetpgrp` to `isatty`), Emacs (one patched check "No process groups: Emacs controls the one terminal"), CPython (five configure answers), Codex (`killpg`), nvim's `:terminal` (unsupported by `forkpty`). The audit counted 7 overrides; this reading finds 8 lines in 4 places.
9. The record's one decision on shape is the integrator's for `ps`: "No new operation ... `process.h` is unchanged" and a pipe per open rather than a file, with four reasons (`tasks/20261013-132514-ps/TASK.md:41-67`); the reflection's `/proc/PID/stat` became `/proc/processes` the same night. Owner words: "add a minimal ps" and nothing on `/proc`'s shape.
10. Not found: what `getpgrp` answers (Emscripten's library is not in this tree); whether a pty-module operation would rebuild the catalog (its header is not pinned by the root recipe, per the module-sdks investigation, but its last change came with seed changes); any owner statement on what a process may learn about another.

---

## 1. History

### 1.1 The contract's inspection operations, in order

| When | What a process could learn | Commit |
| --- | --- | --- |
| 08-31 | Commands ran in the kernel's memory; the kernel launched Pi and Slop by name and knew the "interactive shell pid" itself (spawn-interactive §1.1) | `aa0e63c0` |
| 09-05 | Private processes: `INFO` (`dolly_process_info_response { ..., parent_pid }`, `process.h:553-556`) for `getpid`/`getppid`; `WAIT` for a child's status | `b95459ce` |
| 09-06 | `SIGNAL` by pid: libc's `kill` goes to the kernel, which validates the target and hands the supervisor the pid (runtime-h §1.3; supervisor-mirror §6) | `d5badb25` |
| 09-06 | `terminal_descriptors` per process, inherited by copy; the foreground owner moves into the kernel (`foreground_pid`, `3f875924`) | `b95459ce`, `f0ffce09`, `3f875924` |
| 09-09 | `readlink("/proc/self/exe")` answers the loaded image's path: "Support executable identity, nonblocking terminal reads and larger processes" (no body) | `be2b2968` |
| 09-30 | `docs/process-model.md`: "there is no general `/proc`" (`:40-41` today) | `d8fa8c47` |
| 10-01 | `core-polish` "Left, with reasons": "`readlink("/proc/self/exe")`: a documented contract ... used by programs and tests" (`:104-105`) | |
| 10-05 | `userspace-gaps`: "no `id`, `whoami`, `nproc`, `ps`, `df`" (`:18`); "`id`, `whoami`, `ps`, `df`: documented as absent (`help`, `docs/slop.md`)" (`:120`) | |
| 10-12/13 | `pty@0`: a slave is a terminal by the descriptor's kind; `/dev/tty` opens the slave a process has on 0-2 (`f0f9befc`); `ttyname` named `/dev/tty` for one morning and was taken out (`706afa45`, `19660a44`, tmux task `:367-409`); the holders rule by descent (`a095e7d0`, `ec45edee`) | |
| 10-13 | The reflection: "*Process listing.* `INFO` returns pid and parent ... sbase's `kill` exists and nothing can tell it a pid. Belongs: no program can list processes without the kernel. The Unix form costs no operation: `/proc/PID/stat` as text from the kernel's path layer, which already special-cases `/proc/self/exe`; `ps` is then `cat`." (`tasks/20261013-142800-direction/reflection.md:22`, and `:102` among its ten changes) | |
| 10-13 | Owner: "Since there is no ps in the shell, tmux -D & is a bit weird?", then "add a minimal ps, create a task" (`tasks/20261013-132514-ps/TASK.md:7-8`) | |
| 10-13 | `/proc/processes` (`06872986`): "The kernel answers an open of /proc/processes for reading itself, as it answers readlink of /proc/self/exe: the caller gets a pipe without a writer that holds one line for each process that has not exited ... No operation is added to the process contract, and nothing is in the filesystem: each open is its own table, and neither the path nor its descriptor takes a write. The image inputs are unchanged." `ps` package (`ac4c05d3`), docs (`c86a4130`) | |

### 1.2 Why a pipe per open and not a file, in the task's words

"Not a file in the tree, changed from the filing. The filing had the kernel write the table into a file at that path and then open it. Each open instead gets a pipe that has no writer and already holds the table. Reasons, by construction and not by a measurement of the other design: two readers at once need a table each, so a file would have to be replaced at every open anyway; a file in the tree is saved with the session and restored naming processes that no longer exist, and a recipe that ran `ps` would retain it in its image; `/proc` would become a directory, which is what programs test to find Linux's procfs, and the porting rules forbid claiming Linux; nothing has to refuse a write: a pipe's read end takes none." And its price: "only `open` knows the path, so a program that asks `stat` first does not find it, and the descriptor is a FIFO, not seekable." (`tasks/20261013-132514-ps/TASK.md:46-68`). "**No new operation**, as filed: `include/dolly/process.h` is unchanged and `npm run build:runtime` prints the same image inputs" (`:41-45`); the filing: "no new operation of the process contract, whose header is stamped into every executable ... Kernel C is no image input, so no catalog round." (`:132-137`).

### 1.3 Process groups and `tcgetpgrp` in the record

- The tmux task measured on 10-12: "`tcgetpgrp(0)` | -1, `ENOTTY`"; "`setsid()`, `socketpair()`, `flock()`, `isatty(0)`, `tcgetattr(0)`, `TIOCGWINSZ` ... succeed"; "`ttyname(0)` on the terminal | `NULL`, `ENOENT`" (`tasks/20261012-130814-tmux/TASK.md:71-76`). Its open point 3: "`/dev/tty` by descriptor, not by session. A program in a pane with all three standard descriptors redirected opens the display's terminal there. A terminal recorded per process and inherited through spawn would be exact" (`:160-164`); listed as left for the next round (`tasks/20261012-220109-next-round/TASK.md:47-49`).
- The more-packages task (10-13) on dte: "dte takes a stream for the terminal when `tcgetpgrp` answers for it, and here it fails with `Not a tty` (there are no process groups), so dte stopped with status 71 before its first screen. The recipe makes the test `isatty`." (`:454-457`); and "`tcgetpgrp` fails with `ENOTTY` and `select` with `ENOSYS` (both met with dte, above)" (`:506-507`).
- The audit (10-12): "the cluster that is a real gap is process groups/sessions (`setpgid`, `tcsetpgrp`, `killpg`, `getsid`: 7 overrides) and ptys" (`tasks/20261012-230015-audit-fable/core.md`, item 14).
- `docs/process-model.md:371-372`: "`fork`, `exec` replacement, job control and process groups ... fail explicitly." `:221-224`: "Dolly has no process groups to name a foreground with."
- No request for `top`, `pwdx`, `/proc/PID/cwd` or `/proc/PID/stat` exists in tasks other than the reflection's line (`grep -rln "pwdx\|/proc/PID" tasks/` hits the reflection and files that quote it).

## 2. What exists today

### 2.1 The kernel's process record

`src/process-kernel.c:52-83`: `pid` (53), `parent_pid` (54), `state` (55), `status`, `exit_signal`, `spawn_flags` (58), `worker_retired`, the descriptor tables (`descriptors`, `descriptions`, `descriptor_flags`, `pipes`, `pipe_directions`, `sockets` (67), `terminal_descriptors` (68), `directories`), `arguments` and `argument_count` (70-71), `environment`, `current_directory` (74, "The cwd is an open directory handle", `docs/process-model.md:123-124`), `path` (75), the image, deadline, signals, alarm. The table is 32 slots (`DOLLY_KERNEL_PROCESS_LIMIT`); `foreground_pid` is one global (`:95`).

- The cwd: set at spawn from the request's `cwd`, else duplicated from the parent, else the kernel's own `.` (`:729-743`); changed by `PATH_SET_CURRENT_DIRECTORY` (`:2121-2122`); read by `PATH_GET_CURRENT_DIRECTORY` through `directory_path`, which `fchdir`s to the handle and `getcwd`s (`:946-955, 2104`). So the kernel can name any process's directory by its handle; today it does so only for the asking process.
- Terminals: `terminal_descriptors[fd]` is 1 for 0-2 of the first process and inherited by copy (`:570-573`); `/dev/tty` opened by a process on a slave is that slave (`terminal_stream`, `:629-639`; `:1968-1977`); the display's terminal has no name and no number; a pseudo-terminal has a number (`dolly_pty_descriptors.number`, `host/pty/kernel.c:201, 214`) that the client prints as `/dev/pts/N` "for display only" (`host/pty/client.c:39`; `docs/process-model.md:237-239`). A master is not a terminal (`pty_terminal`: `if (!slave) return -ENOTTY;`, `host/pty/kernel.c:147`).

### 2.2 Who holds a terminal, in the kernel's own bookkeeping

- The display: `refresh_foreground` (`:180-194`) walks from `foreground_pid` to the nearest non-retired ancestor with the FOREGROUND bit and publishes `(pid, interruptible)` to the page's mailbox (`dolly_kernel_foreground_publish`, `src/dolly.c`); the page reads it as `foregroundPid()` (`src/terminal-text.mjs:47`). No process operation returns it. In `tmux-panes` the owner is `/bin/foreground /usr/bin/tmux attach` (`demos/tmux/Dollyfile-tmux-panes`, `init.slop`).
- A pseudo-terminal: `dolly_kernel_socket_holders(slave, foreground=1, each, arg)` (`:2422-2435`) walks the 32 slots, finds every process holding a descriptor of the slave, and for `foreground` skips the one holder that is an ancestor of another holder and descends from none ("`first && waits`"): the shell while its command runs. It is called only to raise `SIGINT`, `SIGHUP` and `SIGWINCH` (`host/pty/kernel.c:80, 116, 233`). The non-skipped holders are, by that rule, the pty's foreground; the kernel does not name them to anyone.

### 2.3 `/proc/processes` and `/proc/self/exe`

`open_process_list` (`:886-925`): one line per live process, `"%d %d %s"` of `pid`, `parent_pid`, `running`/`starting`, then the arguments joined by spaces with control bytes as `?`, at most 2047 bytes a line, in pid order, into a reader-only pipe. Fields not printed: `path`, `current_directory`, `spawn_flags`, which descriptors are terminals. It is reached by a `strcmp` in `PATH_OPEN` (`:1955-1958`); `/proc/self/exe` by a `strcmp` in `PATH_READLINK` (`:2084-2091`), answering `process->path`. Every process may open it: "any program can open and read" (`Dollyfile-ps`, the manual).

### 2.4 What a program can ask about itself, and what libc answers

| Question | Answer | Where |
| --- | --- | --- |
| `getpid`, `getppid` | `INFO` | `process.h:166, 553-556` |
| `getcwd` | `PATH_GET_CURRENT_DIRECTORY` | `libc-adapter.c:1529-1535` |
| its executable | `readlink /proc/self/exe` | `process-kernel.c:2084-2091` |
| `isatty(fd)` | `TERMINAL`/`ISATTY`: the display's descriptor or a slave; a master 0 | `process-kernel.c:1515`; `host/pty/kernel.c:143-146` |
| `ttyname` | fails: "a terminal has no name of its own" | `docs/process-model.md:108-109`; `test/fixtures/pty.c:265` |
| `ctermid` | musl's constant `"/dev/tty"` (no call; not measured) | |
| `tcgetpgrp(fd)` | musl: `ioctl(fd, TIOCGPGRP)`; the adapter's `ioctl` default answers `-ENOTTY` for any valid descriptor | `.cache/zig-0.16.0/lib/libc/musl/src/unistd/tcgetpgrp.c`; `libc-adapter.c:1345-1348` |
| `tcsetpgrp`, `setpgid`, `getsid`, `killpg` | not in the adapter (`grep` over `src/process/` is empty); Emscripten's own library answers; `setsid()` measured to succeed (tmux `:76`) | |
| `uname`/`gethostname` | `nodename = "dolly"` | `libc-adapter.c:53-61` |
| the list of processes | `/proc/processes` | 2.3 |

### 2.5 tmux's port and upstream

- `demos/tmux/osdep-dolly.c:15-26`: "Dolly names no process a terminal's foreground and no process's directory." Both return `NULL`. `osdep_spawn` opens the pty with `openpty(master, &slave, tty, NULL, ws)` and spawns the program on the slave with `dolly_spawn_env_cwd(..., cwd=NULL, ...)` (`:130-148`); a pane's `cwd` reaches the program only as `PWD` in its environment (`tmux-dolly.patch`, `spawn.c` hunk: `environ_set(child, "PWD", 0, "%s", actual_cwd)`) and through `osdep_job`'s `directory` for jobs (`:160-171`).
- Upstream Linux (`osdep-linux.c:29-83`): `osdep_get_name(fd, tty)`: `pgrp = tcgetpgrp(fd)`, then `/proc/PGRP/cmdline` up to the first NUL; `osdep_get_cwd(fd)`: `tcgetpgrp(fd)`, `readlink("/proc/PGRP/cwd")`, falling back to `ioctl(fd, TIOCGSID)` and `/proc/SID/cwd`. The `fd` tmux passes is the pane's master (`wp->fd`, `format.c:966, 986`), and `tty` is the slave's name. Upstream's other systems use `sysctl`/`kvm` by the same pgrp. tmux 3.8 has fourteen `osdep-*.c` files; `osdep-unknown.c` returns `NULL` for both, as Dolly's does.

### 2.6 What tmux does with the two answers, and without them

- The window name: `check_window_name` runs when the active pane changed and `automatic-rename` is on (`names.c:54-105`), formats `automatic-rename-format`, default `#{?pane_in_mode,[tmux],#{pane_current_command}}#{?pane_dead,[dead],}` (`options-table.c:1314-1320`). `pane_current_command` (`format.c:958-979`): `osdep_get_name(wp->fd, wp->tty)`; if `NULL` or empty, `cmd_stringify_argv(wp->argc, wp->argv)`; if that is empty, `wp->shell`; then `parse_window_name` (strips a leading `-`, keeps the first word, takes the basename of a path: `/bin/slop` to `slop`). A pane started with a command keeps the command's first word today (`tmux new-session nvim` is named `nvim`); a program the pane's shell runs is invisible to tmux. The initial name is `default_window_name` by the same fallback (`names.c:108-120`).
- The directory: `pane_current_path` (`format.c:981-992`) is `osdep_get_cwd(wp->fd)` or nothing. `split-window`/`new-window` without `-c` use `server_client_get_cwd(c, s)`: the session's `cwd`, else the client's, else home, else `/` (`spawn.c:290-305`; `server-client.c`). A session's `cwd` is the creating client's (`cmd-new-session.c:178-180`), which the client sent from `find_cwd()` (`getcwd`, or `PWD` when it resolves the same; `client.c:303-304, 463`; `tmux.c`). `-c '#{pane_current_path}'`, the usual binding, gives an empty string here, which `spawn.c:295-300` joins to the session's cwd again. So the pane's own directory is used nowhere by default, in upstream as here; what Dolly lacks is the format that a configuration would use.
- OSC 7: `input.c:2736-2740`: `screen_set_path(sctx->s, p, 1)` then a border and status redraw; the value is `#{pane_path}` (`format.c:2568-2576`), visified with `#(` neutralised (`tmux.c` `clean_name`), not parsed: a shell's `file://host/path` would be kept as is, and `split-window -c '#{pane_path}'` would see a string that does not begin with `/` (`spawn.c:295`). `pane_path` is in no default format.
- OSC 0/2: `screen_set_title` when `allow-set-title` is on (default 1, `options-table.c:1291-1296`; `input.c:2725-2731`), shown as `#{pane_title}` in the default `status-right` `"#{=21:pane_title}" %H:%M %d-%b-%y` (`:1101-1106`): the `"dolly" 13:27 13-Oct-26` on the owner's screen is the pane's title, initialised to the hostname (`window.c:1479-1480`; `nodename = "dolly"`). `set-titles` (tmux writing the outer terminal's title) defaults to 0 (`:984-990`). The window name (`[0] 0:slop*`) does not use the title unless `automatic-rename-format` is configured to.

## 3. Who else would ask, counted

| Who | What it calls or reads | Today |
| --- | --- | --- |
| tmux | `tcgetpgrp(master)`, `/proc/PID/cmdline`, `/proc/PID/cwd` (upstream); `NULL` here | `osdep-dolly.c:15-26`; README limit `:81-83` |
| `ps` | `/proc/processes` under a heading, no TTY column, no options | `Dollyfile-ps` |
| dte | `tcgetpgrp(fd) != -1` changed to `isatty(fd)`: "the one change to the source" | `demos/tools/Dollyfile-dte:26-29` |
| Emacs | `tcgetpgrp(STDIN_FILENO) == getpgrp()` replaced by `if (true)`: "No process groups: Emacs controls the one terminal." | `demos/emacs/emacs-dolly.patch:110-118` |
| CPython | `ac_cv_func_getpgrp=no killpg=no getsid=no setpgid=no tcsetpgrp=no` | `demos/python/prepare-cpython.sh:83-87` |
| Codex | `libc::killpg(pgid, signal)` in a patched file | `demos/codex/config/process.patch:64` |
| nvim `:terminal` | `forkpty` fails; "PTY terminals, detached jobs ... are not supported" | `demos/neovim/Dollyfile-neovim` welcome text |
| Slop | prints a prompt with the cwd (`dolly:/workspace$`), sets `PWD` (`src/slop.c:2819, 5214`); emits no OSC (`grep '\\033\]' src/slop.c` is empty) | |
| The page | `<title>Dolly</title>`, fixed (`terminal.html:7`); the display mailbox has no title word (`grep -i title host/display/*` is empty) | |
| The display library | Ghostty records OSC 0/2 (`GHOSTTY_TERMINAL_DATA_TITLE = 12`) and OSC 7 (`GHOSTTY_TERMINAL_DATA_PWD = 13`, `terminal.h:1656-1680`); `display.c` reads neither | |
| Shell title escapes (`OSC 0/2`) and `OSC 7` from a shell | none emitted by any shell here; tmux would understand both (2.6) | |

The audit's "7 overrides": this reading finds 8 lines in 4 places (CPython 5, Emacs 1, Codex 1, dte 1).

## 4. Each claim of the task as filed, checked

**"In tmux a window's name stays `slop` whatever runs in it."** True for programs the pane's shell runs; partly in general: a pane spawned with a command is named from its argv (`format.c:969-975`), and a program's OSC 2 title would show in `status-right` today (2.6).

**"A new pane starts in the server's directory, not in the pane's."** Partly. It starts in the session's directory, which is the creating client's (`cmd-new-session.c:180`, `client.c:303`), not the server's; in `tmux-panes` the client is `init.slop`'s shell (`/workspace`, `slop.c:5214`); with `tmux -D &` then `tmux`, the attaching client's. That is upstream's default too; the pane's directory enters only through `-c '#{pane_current_path}'`, which is empty here.

**"`demos/tmux/osdep-dolly.c` answers nothing to both: there is no way to ask."** True (`:15-26`; `tcgetpgrp` is `ENOTTY`; no `/proc/PID`). The kernel holds the facts (2.1) and does not expose them.

**"`/proc/processes` lists PID, PPID, state and command ... names no terminal and no directory, and a terminal's foreground process is the kernel's own bookkeeping."** True (`:886-925`; 2.2). One precision: for a pseudo-terminal the kernel's bookkeeping is a rule computed on demand by descent, not a stored foreground (`:2422-2435`).

**"This is a question about the contract's shape, so the owner's ... Nothing here is decided."** Consistent with the record: the only decisions are the integrator's for `ps` (no operation; a pipe, not a file; 1.2) and the owner's acceptance of `pty@0` ("adding pty is fine"). No owner words on `/proc` or on what a process may learn of another were found.

## 5. What a change would mean, on real cases

Observations only, for each way the tree or upstream already shows. "What tmux would call" is read from `osdep-linux.c`'s shape.

**(a) The kernel answers through a file or files under `/proc`.** The facts exist per process (2.1). Two questions need a name for a terminal: a slave has a number (`/dev/pts/N`, which tmux passes as `tty` to `osdep_get_name`); the display's terminal has none (`ttyname` fails by decision, tmux task `:367-388`). A per-pid file (the reflection's `/proc/PID/stat`, or `cwd`) needs the pid first, which `tcgetpgrp` would give upstream and nothing gives here; a per-terminal file would need the number or the descriptor. What `/proc/processes` does today is one `strcmp` in `PATH_OPEN` (`:1955`) and a pipe filled from the table; a second path would be the same shape; the arguments are already there, a directory would be `directory_path(process->current_directory)` (`:946-955`), a terminal would be `terminal_descriptors[0-2]` or the slave's number through `terminal_stream` (`:629-639`), the pty's foreground the `socket_holders` rule. Kernel C only: "Kernel C is no image input, so no catalog round" (ps task `:137`). What tmux's port would call: `fopen` of the file and a parse, as `osdep-linux.c` does; `osdep_get_name` receives the slave's name and could key on its number. What else could use it: `ps` with a TTY column (a script change), `pwdx` (does not exist). The single user: every process reads `/proc/processes` today (`docs/process-model.md:42-49`); a cwd or terminal per pid would be as visible. The ps task's reasons against a file in the tree (1.2) apply to any `/proc` path the same way: not `stat`-able, not listable, a FIFO per open.

**(b) An operation of the process contract or of `pty@0`.** `process.h` is hashed into every executable (`abi/dolly-process-0.wat`; runtime-h investigation point 9: "It does not change the `dolly.process` digest, which hashes `process.h` alone" for `runtime.h`, and the ps task: "whose header is stamped into every executable"): a new operation rebuilds the catalog. A `pty@0` operation changes `host/pty/dolly-pty-0.wat` and `pty.h`, so the module's digest, which the loader checks in executables that record `pty@0`: tmux alone links `-ldolly-pty` (module-sdks §3: "pty: `tmux:70`, two tests"; two recipes declare it). The pty contract's last change (`706afa45`) rebuilt every image, but it also changed `scripts/build.sh`, `src/compiler.cpp` and the libc adapter (module-sdks §2.7); "Modules with a header the root recipe does not pin: microphone, buttons, nena, pty" (§3). Whether a pty-only change leaves the image inputs alone was not built. What tmux would call: a new function in `host/pty/client.c` from `osdep-dolly.c`, by the master's descriptor (the master is known to the kernel as the pty's end even though it is "not a terminal"). What else could use it: only programs that link `-ldolly-pty`, so not `ps`.

**(c) No kernel change: the shell tells the terminal.** tmux 3.8 unchanged takes OSC 7 into `#{pane_path}` and OSC 0/2 into `#{pane_title}` (2.6); a configuration (`/etc/tmux.conf`, which the recipe already writes) could set `automatic-rename-format '#{pane_title}'` and bind splits with `-c '#{pane_path}'`; `pane_path` is kept as sent, so a plain absolute path would work where `file://host/path` would not (`spawn.c:295`). Slop would print OSC 7 before each prompt (it knows its cwd; `src/slop.c` is in the seed, so every image rebuilds, spawn-interactive §4) and OSC 2 with the command before each command and the shell's name after, as some shells' `PROMPT_COMMAND`/`preexec` hooks do; a program started without a shell (`split-window nvim`, a job) would print nothing and its pane would keep the hostname title and an empty path, while its name is right from argv already. At the display's terminal the same escapes would reach Ghostty, which records them and whose display library does not read them; the page shows no title. The display's terminal and the tmux pane would learn the same thing by the same bytes; the kernel would learn nothing, and `ps` would not either.

**(d) Leaving it and documenting the limit.** `demos/tmux/README.md:81-83` says it today: "A window keeps its shell's name whatever runs in it, and a new pane starts in the server's directory: nothing tells tmux which program holds a pane or where it stands." The second half would read more exactly as "the session's directory" (4).

For all four: what rebuilds is kernel C (a), the catalog (b, process) or tmux (b, pty, if the inputs hold), the seed and the catalog (c, Slop) or tmux's config file alone (c, a format and a binding), nothing (d).

## 6. What could not be found out

- What `getpgrp`, `setpgid` and `getsid` answer: the adapter does not define them and Emscripten's JavaScript library is not in this tree (`.cache/emscripten` holds a sysroot only); only `setsid` and `tcgetpgrp` were measured (tmux task).
- Whether a change to `host/pty/pty.h` or its WAT alone changes the image-inputs hash: the module's header is not pinned by the root recipe, but no pty-only change has been built.
- Whether `xterm-256color` under tmux (`default-terminal` in `/etc/tmux.conf`) lets nvim or less set a title, and whether any catalog program sets one: not measured; Ghostty would record it.
- Whether the owner's "a terminal recorded per process" (tmux task's open point 3, in the next-round list) is meant as the same question: it is about `/dev/tty` and Ctrl+C, and would give the kernel a per-process terminal to answer "who holds" with; no owner words on it.
- What tmux's `osdep_get_name` does with a `tty` name on other systems: upstream's Linux ignores it; Darwin's and the BSDs' use the device number. Not read beyond Linux.
- Whether the owner wants a process to see another's directory or terminal at all: the one statement is "add a minimal ps".
