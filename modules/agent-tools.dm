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

SOURCE HOST /static/default/commands/command.c     /tmp/agent-tools/command.c     2aa5d461f14fe96a5a22006c31d04f4c67deda9ff547f5be14a9cb9294734b9b
SOURCE HOST /static/default/commands/xargs.c       /tmp/agent-tools/xargs.c       e848e4f4971200fa8120fc7de29151b1df63c17566cf30b5e5551f28d3e0c1e8
SOURCE HOST /static/default/commands/find.c        /tmp/agent-tools/find.c        41a0698f3d57fbb942bc6e703afb0eba6563b2fbd62949da9943147dd663f3a0
SOURCE HOST /static/default/commands/env.c         /tmp/agent-tools/env.c         9e1db5bb8a9b311edc68c9fabdb8c9ed33dcce2cbf1eca3876b7eedb6e94e442
SOURCE HOST /static/default/commands/time.c        /tmp/agent-tools/time.c        9c37bf7f9fb565366583b67381f3399580676eaba70b2ebc484c09cbd113ce74
SOURCE HOST /static/default/commands/timeout.c     /tmp/agent-tools/timeout.c     ba3271b3d5b13a7940eb538928f1d13a37ec1f43a6d8795a037b4165d7371821
SOURCE HOST /static/default/commands/realpath.c    /tmp/agent-tools/realpath.c    6ec82439ecf3ab1d21a40293ab7e585972c523d8c8e4573a60a7cef86af08250
SOURCE HOST /static/default/commands/diff.c        /tmp/agent-tools/diff.c        6781afb83f0ee7097a938f0a7a83ea5d012ec1ed5e3ca2207ce682882e10117b
SOURCE HOST /static/default/commands/patch.c       /tmp/agent-tools/patch.c       840d935e7e8a7bddabedd445b710ad25d4fe2df2a5fc5c0126c1a55660456b93
SOURCE HOST /static/default/commands/hostname.c    /tmp/agent-tools/hostname.c    14a20a493c8559d8b28f221a6edd9b6f89f893f3e3067093b44d7235b4ae060f
SOURCE HOST /static/default/commands/tty.c         /tmp/agent-tools/tty.c         c51c9598e8245d5f651ade70995f2b03fb936c42a0e99c4c81c83749c5714c7e

FILE /tmp/agent-tools/Makefile
    .RECIPEPREFIX := >
    NAMES := command xargs find env time timeout realpath diff patch hostname tty
    TOOLS := $(addprefix /bin/,$(NAMES))
    all: $(TOOLS)
    /bin/%: /tmp/agent-tools/%.c
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
