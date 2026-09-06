DOLLY 3
MODULE startup-pi

REQUIRES TOOL slop
REQUIRES TOOL foreground
REQUIRES TOOL test
REQUIRES TOOL printf
REQUIRES TOOL pi

FILE /etc/dolly/init.slop
    if test -f "$HOME/.dollyrc"; then
      /bin/foreground /bin/slop -e "$HOME/.dollyrc"
      status=$?
      case "$status" in
        0|130) ;;
        *) printf 'Dolly: %s exited with status %s; continuing.\n' "$HOME/.dollyrc" "$status" >&2 ;;
      esac
    fi
    for attempt in 1 2 3; do
      /bin/foreground -i /usr/bin/pi
      status=$?
      case "$status" in 0|130) break ;; esac
      if test "$attempt" -lt 3; then
        printf '\nDolly: restarting Pi after unexpected status %s (%s/2).\n' "$status" "$attempt"
      fi
    done
    printf '\nDolly: image entry exited; entering the recovery Slop shell.\n'
    /bin/foreground -i /bin/slop

FILE /home/dolly/.dollyrc
    printf '\033[33mDOLLY / PI\033[0m\n'
    printf 'Pi and every command run inside the browser Wasm sandbox.\n'
    printf 'Try: ask Pi about /workspace | ! ls | ! git status | /help\n\n'
