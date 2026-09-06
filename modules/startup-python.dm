DOLLY 3
MODULE startup-python

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
    printf '\033[33mDOLLY / PYTHON\033[0m\n'
    printf 'CPython 3.14 and its C/C++ extension toolchain run inside Dolly.\n'
    printf 'Try: python | bonnie install requests | bonnie install pandas\n'
    printf 'Source extension builds are real browser builds and can take several minutes.\n\n'
