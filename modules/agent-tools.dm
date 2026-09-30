DOLLY 4
MODULE agent-tools

# Dolly-owned commands which upstream sbase cannot provide: those which start
# another program use the in-userspace spawn/wait contract instead of fork.
REQUIRES HEADER libc
REQUIRES HEADER runtime
REQUIRES TOOL   cc
REQUIRES TOOL   git
REQUIRES TOOL   make
REQUIRES TOOL   rm

SOURCE HOST /static/default/commands/run-program.h /tmp/agent-tools/run-program.h 69926596156d69af5fc24a9d7da0f250fd2de610b1bc2a590b9663ed66de2247
SOURCE HOST /static/default/commands/command.c     /tmp/agent-tools/command.c     93610e7ec64b99dd6a128d66e5a49b453464fa317434167251b492d4913e44da
SOURCE HOST /static/default/commands/xargs.c       /tmp/agent-tools/xargs.c       48b9860d4954b71a067fed59a892d04194e95471ca0067c81f60f9eb83a09c84
SOURCE HOST /static/default/commands/find.c        /tmp/agent-tools/find.c        342ba6df849456d47646b7531718ca9682d27b3215c355ebb156eae7e8b16813
SOURCE HOST /static/default/commands/env.c         /tmp/agent-tools/env.c         9a04ef03ad00956c2a27b3759b84872f118115ebbe1e399621a5c43a59900228
SOURCE HOST /static/default/commands/time.c        /tmp/agent-tools/time.c        bb49a29e708e9e32716e2d5bf4b4b4e662b07093d0e3731588ef7d41a53ad733
SOURCE HOST /static/default/commands/timeout.c     /tmp/agent-tools/timeout.c     4864285ae0b36f853376e6e77855f4d1f8159b96d716bd9466606b9bef1c5f16
SOURCE HOST /static/default/commands/realpath.c    /tmp/agent-tools/realpath.c    6ec82439ecf3ab1d21a40293ab7e585972c523d8c8e4573a60a7cef86af08250
SOURCE HOST /static/default/commands/diff.c        /tmp/agent-tools/diff.c        e1e71b3947fac230f221715577fbbfbd6ba3cf82c6c3cd027905f10ace8cf11e
SOURCE HOST /static/default/commands/patch.c       /tmp/agent-tools/patch.c       a3103333d316c939faef9b8b9cba6b2c8d5705631f8cc0be083709a013a58c2d
SOURCE HOST /static/default/commands/hostname.c    /tmp/agent-tools/hostname.c    14a20a493c8559d8b28f221a6edd9b6f89f893f3e3067093b44d7235b4ae060f
SOURCE HOST /static/default/commands/tty.c         /tmp/agent-tools/tty.c         c51c9598e8245d5f651ade70995f2b03fb936c42a0e99c4c81c83749c5714c7e

FILE /tmp/agent-tools/Makefile
    .RECIPEPREFIX := >
    NAMES := command xargs find env time timeout realpath diff patch hostname tty
    TOOLS := $(addprefix /bin/,$(NAMES))
    all: $(TOOLS)
    /bin/%: /tmp/agent-tools/%.c /tmp/agent-tools/run-program.h
    >cc -std=c17 -O2 $< -o $@
SLOP make \
  -f /tmp/agent-tools/Makefile

EXPORTS TOOL command
EXPORTS TOOL xargs
EXPORTS TOOL find
EXPORTS TOOL env
EXPORTS TOOL time
EXPORTS TOOL timeout
EXPORTS TOOL realpath
EXPORTS TOOL diff
EXPORTS TOOL patch
EXPORTS TOOL hostname
EXPORTS TOOL tty

SLOP rm \
  -rf \
  /tmp/agent-tools
