# Sourced by scripts/prepare-image-sources.sh.
if has_image tmux; then
  copy_static "$(bash scripts/fetch-pinned-archive.sh tmux)" tmux/tmux-3.8.tar.gz
  copy_static "$(bash scripts/fetch-pinned-archive.sh libevent)" tmux/libevent-2.1.13-stable.tar.gz
  # libterminfo, the two tools that write its tables and the terminal
  # descriptions they read. The archive's links are left out: manual pages,
  # and the files tic and nbperf share with the library.
  netbsd_curses_dir="$(bash scripts/fetch-pinned-source.sh netbsd_curses)"
  terminfo_inputs=()
  for directory in libterminfo nbperf tic netbsd_sys; do
    while IFS= read -r -d '' file; do
      terminfo_inputs+=("${file}" "/tmp/terminfo/${directory}/$(basename "${file}")")
    done < <(find "${netbsd_curses_dir}/${directory}" -maxdepth 1 -type f \
      \( -name '*.[ch]' -o -name 'gen*' \) -print0 | sort -z)
  done
  node scripts/build-source-tar.mjs "${static_dir}/tmux/terminfo.tar" "${terminfo_inputs[@]}" \
    "${netbsd_curses_dir}/libcurses/curses.h" /tmp/terminfo/libcurses/curses.h \
    "${netbsd_curses_dir}/libcurses/unctrl.h" /tmp/terminfo/libcurses/unctrl.h \
    "${netbsd_curses_dir}/terminfo/terminfo" /tmp/terminfo/terminfo/terminfo \
    "${netbsd_curses_dir}/COPYING" /usr/share/licenses/netbsd-curses/COPYING
  # Dolly's part of the port, into the unpacked release.
  node scripts/build-source-tar.mjs "${static_dir}/tmux/port.tar" \
    demos/tmux/tmux-dolly.patch /tmp/tmux-3.8/tmux-dolly.patch \
    demos/tmux/osdep-dolly.c /tmp/tmux-3.8/osdep-dolly.c \
    demos/tmux/pty.c /tmp/tmux-3.8/pty.c \
    host/pty/pty.h /tmp/tmux-3.8/dolly-pty.h
fi
