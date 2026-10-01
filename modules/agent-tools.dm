DOLLY 5
MODULE agent-tools

# Focused compatibility commands used by build systems and coding agents.
# Each remains a separate Wasm executable; wrappers which launch another tool
# do so through Dolly's in-userspace spawn/wait contract.
REQUIRES HEADER libc
REQUIRES HEADER runtime
REQUIRES TOOL   cc
REQUIRES TOOL   git
REQUIRES TOOL   make
REQUIRES TOOL   rm

SOURCE https://daugasauron.com/dist/static/default/commands/run-program.h 677cab1ebff7f32b87f8566939d8cd0bffa9a0b94307f0cdc81ea6d05e76243e /tmp/agent-tools/run-program.h
SOURCE https://daugasauron.com/dist/static/default/commands/install.c     0aa8729ff8f6d8ecc454757226275b946b28c2e6783afd571f4c33a616cb4ba3 /tmp/agent-tools/install.c
SOURCE https://daugasauron.com/dist/static/default/commands/tail.c        f0a892066f2e6fe42667bf1765496f8347c8bfe53094ce22e0922e4ffc87c36b /tmp/agent-tools/tail.c
SOURCE https://daugasauron.com/dist/static/default/commands/du.c          55b6a61ea8dc2a4355aaafc9a80d2218f397fa4d1e170b78462863fc9cb2ed63 /tmp/agent-tools/du.c
SOURCE https://daugasauron.com/dist/static/default/commands/rev.c         3539529d49f26629a6518437dc76631f113bcc5822ff5dbc8aa26481933f3d05 /tmp/agent-tools/rev.c
SOURCE https://daugasauron.com/dist/static/default/commands/command.c     93610e7ec64b99dd6a128d66e5a49b453464fa317434167251b492d4913e44da /tmp/agent-tools/command.c
SOURCE https://daugasauron.com/dist/static/default/commands/xargs.c       48b9860d4954b71a067fed59a892d04194e95471ca0067c81f60f9eb83a09c84 /tmp/agent-tools/xargs.c
SOURCE https://daugasauron.com/dist/static/default/commands/find.c        342ba6df849456d47646b7531718ca9682d27b3215c355ebb156eae7e8b16813 /tmp/agent-tools/find.c
SOURCE https://daugasauron.com/dist/static/default/commands/env.c         9a04ef03ad00956c2a27b3759b84872f118115ebbe1e399621a5c43a59900228 /tmp/agent-tools/env.c
SOURCE https://daugasauron.com/dist/static/default/commands/time.c        bb49a29e708e9e32716e2d5bf4b4b4e662b07093d0e3731588ef7d41a53ad733 /tmp/agent-tools/time.c
SOURCE https://daugasauron.com/dist/static/default/commands/timeout.c     4864285ae0b36f853376e6e77855f4d1f8159b96d716bd9466606b9bef1c5f16 /tmp/agent-tools/timeout.c
SOURCE https://daugasauron.com/dist/static/default/commands/realpath.c    6ec82439ecf3ab1d21a40293ab7e585972c523d8c8e4573a60a7cef86af08250 /tmp/agent-tools/realpath.c
SOURCE https://daugasauron.com/dist/static/default/commands/diff.c        e1e71b3947fac230f221715577fbbfbd6ba3cf82c6c3cd027905f10ace8cf11e /tmp/agent-tools/diff.c
SOURCE https://daugasauron.com/dist/static/default/commands/patch.c       a3103333d316c939faef9b8b9cba6b2c8d5705631f8cc0be083709a013a58c2d /tmp/agent-tools/patch.c
SOURCE https://daugasauron.com/dist/static/default/commands/hostname.c    14a20a493c8559d8b28f221a6edd9b6f89f893f3e3067093b44d7235b4ae060f /tmp/agent-tools/hostname.c
SOURCE https://daugasauron.com/dist/static/default/commands/tty.c         c51c9598e8245d5f651ade70995f2b03fb936c42a0e99c4c81c83749c5714c7e /tmp/agent-tools/tty.c

FILE /tmp/agent-tools/Makefile
    .RECIPEPREFIX := >
    NAMES := install tail du rev command xargs find env time timeout realpath diff patch hostname tty
    TOOLS := $(addprefix /bin/,$(NAMES))
    all: $(TOOLS)
    /bin/%: /tmp/agent-tools/%.c /tmp/agent-tools/run-program.h
    >cc -O2 $< -o $@
SLOP make \
  -f /tmp/agent-tools/Makefile

EXPORTS TOOL install
EXPORTS TOOL tail
EXPORTS TOOL du
EXPORTS TOOL rev
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
