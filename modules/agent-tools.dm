DOLLY 2
MODULE agent-tools

# Focused compatibility commands used by build systems and coding agents.
# Each remains a separate Wasm executable; wrappers which launch another tool
# do so through Dolly's in-userspace spawn/wait contract.
REQUIRES HEADER libc
REQUIRES HEADER runtime
REQUIRES LIB    z
REQUIRES TOOL   cc
REQUIRES TOOL   git
REQUIRES TOOL   make
REQUIRES TOOL   rm

SOURCE HOST /static/default/commands/install.c  /tmp/agent-tools/install.c  605b04b67970f478771ee89a37c178748579fe6440ad0568e90fadcfa00922c4
SOURCE HOST /static/default/commands/which.c    /tmp/agent-tools/which.c    1093935c88761920edb89d19004e00b503fe7fd34ef38dc93f53d31d9e80a3bf
SOURCE HOST /static/default/commands/command.c  /tmp/agent-tools/command.c  2aa5d461f14fe96a5a22006c31d04f4c67deda9ff547f5be14a9cb9294734b9b
SOURCE HOST /static/default/commands/xargs.c    /tmp/agent-tools/xargs.c    e848e4f4971200fa8120fc7de29151b1df63c17566cf30b5e5551f28d3e0c1e8
SOURCE HOST /static/default/commands/find.c     /tmp/agent-tools/find.c     41a0698f3d57fbb942bc6e703afb0eba6563b2fbd62949da9943147dd663f3a0
SOURCE HOST /static/default/commands/tail.c     /tmp/agent-tools/tail.c     f0a892066f2e6fe42667bf1765496f8347c8bfe53094ce22e0922e4ffc87c36b
SOURCE HOST /static/default/commands/tee.c      /tmp/agent-tools/tee.c      b4cf397425473e1ec7f116491c18a20f2b61d38fb2cf8a51d91ec0a1b72ef7ef
SOURCE HOST /static/default/commands/env.c      /tmp/agent-tools/env.c      9e1db5bb8a9b311edc68c9fabdb8c9ed33dcce2cbf1eca3876b7eedb6e94e442
SOURCE HOST /static/default/commands/printenv.c /tmp/agent-tools/printenv.c a279dd856a17f5a05bb3800157e0ea44e4c4269ff6cb3a834303741dda88e2bb
SOURCE HOST /static/default/commands/rev.c      /tmp/agent-tools/rev.c      3539529d49f26629a6518437dc76631f113bcc5822ff5dbc8aa26481933f3d05
SOURCE HOST /static/default/commands/timeout.c  /tmp/agent-tools/timeout.c  ba3271b3d5b13a7940eb538928f1d13a37ec1f43a6d8795a037b4165d7371821
SOURCE HOST /static/default/commands/time.c     /tmp/agent-tools/time.c     9c37bf7f9fb565366583b67381f3399580676eaba70b2ebc484c09cbd113ce74
SOURCE HOST /static/default/commands/uname.c    /tmp/agent-tools/uname.c    5352d95757f0062f5c68960432d0fdefffbbc880a91d90763185a0735c40999a
SOURCE HOST /static/default/commands/hostname.c /tmp/agent-tools/hostname.c 14a20a493c8559d8b28f221a6edd9b6f89f893f3e3067093b44d7235b4ae060f
SOURCE HOST /static/default/commands/realpath.c /tmp/agent-tools/realpath.c 6ec82439ecf3ab1d21a40293ab7e585972c523d8c8e4573a60a7cef86af08250
SOURCE HOST /static/default/commands/diff.c     /tmp/agent-tools/diff.c     6781afb83f0ee7097a938f0a7a83ea5d012ec1ed5e3ca2207ce682882e10117b
SOURCE HOST /static/default/commands/patch.c    /tmp/agent-tools/patch.c    840d935e7e8a7bddabedd445b710ad25d4fe2df2a5fc5c0126c1a55660456b93
SOURCE HOST /static/default/commands/du.c       /tmp/agent-tools/du.c       55b6a61ea8dc2a4355aaafc9a80d2218f397fa4d1e170b78462863fc9cb2ed63
SOURCE HOST /static/default/commands/dd.c       /tmp/agent-tools/dd.c       0f9f981c3b8f6b0c4c5ffd4f36cdb540e9fd2a04337443a136e87a46bbded30d
SOURCE HOST /static/default/commands/tty.c      /tmp/agent-tools/tty.c      c51c9598e8245d5f651ade70995f2b03fb936c42a0e99c4c81c83749c5714c7e
SOURCE HOST /static/default/commands/gzip.c     /tmp/agent-tools/gzip.c     dc8fddc876932984ede5bf89a12d4e071de2d8e361354df29fa31e9df5b36f7f

FILE /tmp/agent-tools/Makefile
    .RECIPEPREFIX := >
    NAMES := install which command xargs find tail tee env printenv rev timeout time uname hostname realpath diff patch du dd tty
    TOOLS := $(addprefix /bin/,$(NAMES))
    all: $(TOOLS) /bin/gzip
    /bin/%: /tmp/agent-tools/%.c
    >cc -std=c17 $< -o $@
    /bin/gzip: /tmp/agent-tools/gzip.c
    >cc -std=c17 $< -lz -o $@
SLOP make \
  -f /tmp/agent-tools/Makefile

EXPORTS TOOL install
EXPORTS TOOL which
EXPORTS TOOL command
EXPORTS TOOL xargs
EXPORTS TOOL find
EXPORTS TOOL tail
EXPORTS TOOL tee
EXPORTS TOOL env
EXPORTS TOOL printenv
EXPORTS TOOL rev
EXPORTS TOOL timeout
EXPORTS TOOL time
EXPORTS TOOL uname
EXPORTS TOOL hostname
EXPORTS TOOL realpath
EXPORTS TOOL diff
EXPORTS TOOL patch
EXPORTS TOOL du
EXPORTS TOOL dd
EXPORTS TOOL tty
EXPORTS TOOL gzip

SLOP rm \
  -rf \
  /tmp/agent-tools
