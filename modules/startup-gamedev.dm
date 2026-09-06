DOLLY 3
MODULE startup-gamedev

REQUIRES TOOL slop
REQUIRES TOOL foreground
REQUIRES TOOL test
REQUIRES TOOL printf
REQUIRES TOOL graphics-demo

FILE /etc/dolly/init.slop
    if test -f "$HOME/.dollyrc"; then
      /bin/foreground /bin/slop -e "$HOME/.dollyrc"
      status=$?
      case "$status" in
        0|130) ;;
        *) printf 'Dolly: %s exited with status %s; continuing.\n' "$HOME/.dollyrc" "$status" >&2 ;;
      esac
    fi
    /bin/foreground /usr/bin/graphics-demo
    printf '\nDolly: image entry exited; entering the recovery Slop shell.\n'
    /bin/foreground -i /bin/slop

FILE /home/dolly/.dollyrc
    printf '\033[33mDOLLY / GAMEDEV\033[0m\n'
    printf 'raylib 6 and Box3D run against Dolly exclusive framebuffer presentation.\n'
    printf 'The demo starts now; press Q to return, then inspect /usr/src/dolly/gamedev.\n\n'
