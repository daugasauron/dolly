# The tmux demo's upstream source pins, sourced by config/source-pins.sh.

DOLLY_TMUX_VERSION=3.8
DOLLY_TMUX_URL='https://github.com/tmux/tmux/releases/download/3.8/tmux-3.8.tar.gz'
DOLLY_TMUX_SHA256=e79c699c7e949dccd0a4a125e17b8d1261e311b16979dbc8eb34542f3966d82e

DOLLY_LIBEVENT_VERSION=2.1.13-stable
DOLLY_LIBEVENT_URL='https://github.com/libevent/libevent/releases/download/release-2.1.13-stable/libevent-2.1.13-stable.tar.gz'
DOLLY_LIBEVENT_SHA256=f7e9383b8c0baa81b687e5b5eecc01beefaf1b19b64151d95ed61647fe7a315c

# NetBSD's libterminfo in its portable release: the terminfo library tmux
# reads its terminal with. GNU termcap has no setupterm.
DOLLY_NETBSD_CURSES_VERSION=0.3.2
DOLLY_NETBSD_CURSES_URL='https://github.com/sabotage-linux/netbsd-curses/archive/refs/tags/v0.3.2.tar.gz'
DOLLY_NETBSD_CURSES_SHA256=9d3ebd651e5f70b87b1327b01cbd7e0c01a0f036b4c1371f653b7704b11daf23
