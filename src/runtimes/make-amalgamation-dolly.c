/* Seven bounded frontend units for GNU Make's pinned Dolly source manifest. */
#ifndef DOLLY_MAKE_PART
#error DOLLY_MAKE_PART must select a GNU Make source partition
#endif

#if DOLLY_MAKE_PART == 1
#include "src/ar.c"
#include "src/arscan.c"
#include "src/commands.c"
#include "src/default.c"
#include "src/expand.c"
#include "src/file.c"
#include "src/function.c"
#include "src/getopt.c"
#include "src/getopt1.c"
#include "src/guile.c"
#include "src/hash.c"
#include "src/implicit.c"
#include "src/job.c"
#include "src/load.c"
#include "src/loadapi.c"
#elif DOLLY_MAKE_PART == 2
#include "src/misc.c"
#include "src/output.c"
#include "src/read.c"
#include "src/remake.c"
#include "src/rule.c"
#include "src/shuffle.c"
#include "src/signame.c"
#include "src/strcache.c"
#include "src/variable.c"
#include "src/vpath.c"
#include "src/posixos.c"
#include "src/remote-stub.c"
#elif DOLLY_MAKE_PART == 3
#include "src/dir.c"
#elif DOLLY_MAKE_PART == 4
#include "src/main.c"
#elif DOLLY_MAKE_PART == 5
#include "src/version.c"
#elif DOLLY_MAKE_PART == 6
#include "lib/concat-filename.c"
#include "lib/findprog-in.c"
#include "lib/fnmatch.c"
#elif DOLLY_MAKE_PART == 7
#include "lib/glob.c"
#else
#error unknown DOLLY_MAKE_PART
#endif
