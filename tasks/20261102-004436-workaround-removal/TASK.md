# Demo workarounds whose causes are gone

- STATUS: OPEN
- PRIORITY: 150
- TAGS: demo,cleanup

The docs audit (`tasks/20261101-221623-docs-audit`) listed demo workarounds whose
cause the core has since removed: `execve` (ba5f2568), gzip compressing
(68824453), tar reading pax headers (dbf38965, 705de088), `wait4` taking a usage
record (bbec81cc). Each is a claim until measured; this task removes what the
measurement confirms, one commit per item, on `demo/workaround-removal`
(from `core/docs-audit`, whose 705de088 is a seed input: the tree's 25-image
closure is built on it, every other image is stale).

Evidence: `build/workaround-removal-evidence/`. The core tar built natively from
`src/commands/tar.c` (`core-tar`) is the measuring instrument for archives:
`core-tar-extract.log`, `core-tar-x11.log`, `archive-survey.log`.

## 1. zsh: exec and the last command of `zsh -c`

`demos/zsh/zsh-dolly.patch` (1c868cb3, 2026-10-15, "Dolly has no fork or exec")
made `execute()` always spawn: `exec PROG` spawned, waited and exited with the
status, and the last command of `zsh -c` likewise. `execve` exists since
ba5f2568 (2026-10-23). The rest of the patch stays: Dolly still has no `fork`,
so every other process is a spawn, and shell code that needs a process of its
own runs in a new zsh given the shell's state.

Change: a `replacing` flag set where upstream's code replaces the shell (the
`is_exec` path of a simple command); there `zexecve()` calls the real `execve`,
`execute()` closes the xtrace descriptors and unblocks `SIGCHLD` as upstream,
and a failed exec `_exit`s as upstream. The spawn path is unchanged. The
`entersubsh()` hunk is gone (upstream's runs for every exec). The recipe's check
gains: `exec zsh -fc 'print $$'` and the last command of `zsh -c` print the
outer shell's pid; `exec zsh -fc 'exit 3'` gives status 3.

## 2. Recipe comments and Emacs's Lisp sources

- `Dollyfile-pigz` said gzip "only reads"; `Dollyfile-tar` said "The gzip of the
  core reads .gz; pigz writes it" and that the core tar reads no pax headers.
  Comments corrected.
- `Dollyfile-emacs` left out every Lisp source whose bytecode is installed
  "because Dolly's gzip only decompresses". Upstream's `make install`
  (`Makefile.in`, `install-arch-indep`) gzips with `-9n` each `.el` beside an
  `.elc`, `etc/publicsuffix.txt`, the info pages and the man pages; the recipe
  now does the same but for the man pages (Dolly's are cat pages). Emacs reads
  them through `jka-compr`, which runs `gzip -c -q -d` (Dolly's gzip takes `-q`
  and `-n`, ignored); `Info-insert-file-contents` lets `jka-compr` decode too
  when `auto-compression-mode` is on, which it is by default, and
  `url-domsuf` looks for `publicsuffix.txt.gz` first. The staged release holds
  1716 `.el` (77.6 MB) of which 1642 have an `.elc` (69.2 MB), and 66 `.info`
  (21.3 MB with the images beside them). The check loads `subr.el.gz` through
  `find-library-name` and `insert-file-contents`.

## 3. X.Org recipes that installed the tools demo's tar

Measured with `core-tar` (705de088) on the pinned archives
(`core-tar-x11.log`): libxkbfile (xz, 28 files), xkbcomp (57), libmd (xz, 93),
libXfont2 (123) and xorg-server (1661) extract; pixman fails on
`.gitlab-ci.d/01-docker/target-env/linux-ppc.env` (a link) and
xkeyboard-config on `symbols/caps` (a link). `Dollyfile-libxkbfile`,
`-xkbcomp` and `-xorg-server` drop `USE Dollyfile-tar` and its comment;
`-pixman` and `-xkeyboard-config` keep it, for the links.

## 4. Plain-tar stagings made for the pax headers

Measured with `core-tar` (`core-tar-extract.log`, `archive-survey.log`): none of
the archives holds a pax header any more; what fails is links.

| archive | core tar | staging |
| --- | --- | --- |
| binaryen version_133 (GitHub) | extracts, 3040 files, 50 MB | dropped: the recipe reads the archive (7.1 MB gz, against the 11.7 MB plain tar it replaces) and copies the licences itself |
| lz4 1.10.0 | extracts, 208 files | dropped: archive 387 KB against an 876 KB tar; the recipe copies licences and the man page |
| xterm 412 (GitHub) | extracts, 241 files | dropped: archive 1.6 MB against a 6.8 MB tar; `xterm-pty.c` is staged as a file |
| jq 1.8.2 | refused: a hard link in `docs/` | kept |
| zstd 1.5.7 | refused: two symlinks in `tests/` | kept |
| lean 4.35.0 | refused: 7 symlinks (`AGENTS.md`, `tests/`) | kept, another agent's (`demo/lean-3`): its comment's reason ("a pax header") is wrong, the links are the reason |
| tree, dte, base64, neatvi, linenoise (checkouts) | extract | kept for now: convertible the same way, each a rebuild; bc is refused (a link, `configure`) |
| wabt (xz), toybox (links, generated headers) | not pax | kept |

`demos/tools/README.md` now names the reasons that remain.

## 5. Studio's copies of two docs

`demos/studio/prepare-sources.sh` staged `docs/dollyfile.md` and
`docs/image-build-service.md` under `/usr/share/dollyfile-studio/`. Its base
chain pi-local → pi-agent → pi-runtime → pi-dolly installs `dolly-docs`, which
puts both at `/usr/share/doc/dolly/docs/`. The skill now reads the installed
copy; the staging and the README's claim are gone. Nothing read
`build-service.md`.

The image cannot be rebuilt here: its closure holds `rust-build` (ripgrep, fd),
a hugebuild for the integrator alone; it is stale on this seed like every image
outside the 25. Verified by the source suite (`demos/studio/test/studio.test.mjs`
reads the staging) and the recipe chain; the browser test waits for the catalog
round.

## 6. Mojo's `llvm-wait.patch`

`wait4` takes a usage record since bbec81cc. `mojo-llvm` is a 9 GB build; left
for the integrator unless time allows (see the end).

## Lessons

(at the end)
