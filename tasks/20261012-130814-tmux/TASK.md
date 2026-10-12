# tmux in Dolly: what it needs beyond sockets@0

- STATUS: OPEN
- PRIORITY: 300
- TAGS: demo,tmux,sockets,process

Owner (2026-10-12): "Investigate if you can now make tmux work (I think with
sockets added it should be ok?)."

## As filed

Not tried. Read on 2026-10-12, to be measured against upstream tmux built by
Dolly's `cc`:

- `sockets@0` gives local stream sockets and refuses descriptor passing
  (`SCM_RIGHTS`); tmux's client hands its terminal to the server that way.
- Dolly has no pseudo-terminals (nothing in `src/`, `host/` or `include/`
  names `openpty`, `posix_openpt` or `/dev/ptmx`); every tmux pane is one.
- Dolly has spawn, not `fork`; tmux forks its server and each pane's shell.
- tmux needs libevent and a terminal description (ncurses or its own).

Done when: tmux runs in a Dolly session with two panes, or the task says
exactly which operations are missing, each with its measurement.
