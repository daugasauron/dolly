DOLLY 3
MODULE startup-default

REQUIRES TOOL slop
REQUIRES TOOL foreground
REQUIRES TOOL test
REQUIRES TOOL printf

FILE /etc/dolly/init.slop
    if test -f "$HOME/.dollyrc"; then
      /bin/foreground /bin/slop -e "$HOME/.dollyrc"
      status=$?
      case "$status" in
        0|130) ;;
        *) printf 'Dolly: %s exited with status %s; continuing.\n' "$HOME/.dollyrc" "$status" >&2 ;;
      esac
    fi
    /bin/foreground -i /bin/slop
    printf '\nDolly: image entry exited; entering the recovery Slop shell.\n'
    /bin/foreground -i /bin/slop

FILE /home/dolly/.dollyrc
    printf '\033[33mDOLLY / DEFAULT\033[0m\n'
    printf 'Browser-contained wasm64 userspace; files and processes stay inside Dolly.\n'
    printf 'Try: help | ls /bin | git --version | cc --version\n\n'
