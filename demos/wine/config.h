/* What Wine's configure would find on Dolly: its libc and no optional library
 * but FreeType, which the build links statically. Written by hand, because
 * configure cannot name the host; every line is something Dolly has. */
#ifndef __WINE_CONFIG_H
#define __WINE_CONFIG_H

#define PACKAGE_NAME "Wine"
#define PACKAGE_STRING "Wine 4.0.4"
#define PACKAGE_TARNAME "wine"
#define PACKAGE_URL "https://www.winehq.org"
#define PACKAGE_VERSION "4.0.4"
#define PACKAGE_BUGREPORT "wine-devel@winehq.org"
#define EXEEXT ""
#define STDC_HEADERS 1
#define X_DISPLAY_MISSING 1
#define MAJOR_IN_SYSMACROS 1
#define DECLSPEC_HOTPATCH

/* A wasm function has no assembler name or frame information. */
#define __ASM_NAME(name) name
#define __ASM_STDCALL(name,args) name
#define __ASM_CFI(str)

#define HAVE_ARPA_INET_H 1
#define HAVE_DIRENT_H 1
#define HAVE_FLOAT_H 1
#define HAVE_FNMATCH_H 1
#define HAVE_GETOPT_H 1
#define HAVE_GRP_H 1
#define HAVE_INTTYPES_H 1
#define HAVE_MEMORY_H 1
#define HAVE_NETDB_H 1
#define HAVE_NETINET_IN_H 1
#define HAVE_POLL_H 1
#define HAVE_PTHREAD_H 1
#define HAVE_PWD_H 1
#define HAVE_SCHED_H 1
#define HAVE_STDBOOL_H 1
#define HAVE_STDINT_H 1
#define HAVE_STDLIB_H 1
#define HAVE_STRINGS_H 1
#define HAVE_STRING_H 1
#define HAVE_SYS_IOCTL_H 1
#define HAVE_SYS_MMAN_H 1
#define HAVE_SYS_PARAM_H 1
#define HAVE_SYS_POLL_H 1
#define HAVE_SYS_RESOURCE_H 1
#define HAVE_SYS_SOCKET_H 1
#define HAVE_SYS_STATVFS_H 1
#define HAVE_SYS_STAT_H 1
#define HAVE_SYS_TIMES_H 1
#define HAVE_SYS_TIME_H 1
#define HAVE_SYS_TYPES_H 1
#define HAVE_SYS_UIO_H 1
#define HAVE_SYS_UN_H 1
#define HAVE_SYS_UTSNAME_H 1
#define HAVE_SYS_WAIT_H 1
#define HAVE_TERMIOS_H 1
#define HAVE_UNISTD_H 1
#define HAVE_UTIME_H 1

#define HAVE_MODE_T 1
#define HAVE_OFF_T 1
#define HAVE_PID_T 1
#define HAVE_SIZE_T 1
#define HAVE_SSIZE_T 1
#define HAVE_SIGSET_T 1
#define HAVE_LONG_LONG 1
#define HAVE_FSBLKCNT_T 1
#define HAVE_FSFILCNT_T 1
#define HAVE_STRUCT_DIRENT_D_RECLEN 1
#define HAVE_STRUCT_OPTION_NAME 1
#define HAVE_STRUCT_STATVFS_F_BLOCKS 1
#define HAVE_STRUCT_STAT_ST_ATIM 1
#define HAVE_STRUCT_STAT_ST_CTIM 1
#define HAVE_STRUCT_STAT_ST_MTIM 1
#define HAVE_STRUCT_STAT_ST_BLOCKS 1
#define HAVE___BUILTIN_CLZ 1
#define HAVE___BUILTIN_POPCOUNT 1

#define HAVE_ACOSH 1
#define HAVE_ACOSHF 1
#define HAVE_ASINH 1
#define HAVE_ASINHF 1
#define HAVE_ATANH 1
#define HAVE_ATANHF 1
#define HAVE_CBRT 1
#define HAVE_CBRTF 1
#define HAVE_ERF 1
#define HAVE_ERFC 1
#define HAVE_ERFCF 1
#define HAVE_ERFF 1
#define HAVE_EXP2 1
#define HAVE_EXP2F 1
#define HAVE_EXPM1 1
#define HAVE_EXPM1F 1
#define HAVE_ILOGB 1
#define HAVE_ILOGBF 1
#define HAVE_ISFINITE 1
#define HAVE_ISINF 1
#define HAVE_ISNAN 1
#define HAVE_J0 1
#define HAVE_J1 1
#define HAVE_JN 1
#define HAVE_LGAMMA 1
#define HAVE_LGAMMAF 1
#define HAVE_LLRINT 1
#define HAVE_LLRINTF 1
#define HAVE_LLROUND 1
#define HAVE_LLROUNDF 1
#define HAVE_LOG1P 1
#define HAVE_LOG1PF 1
#define HAVE_LOG2 1
#define HAVE_LOG2F 1
#define HAVE_LRINT 1
#define HAVE_LRINTF 1
#define HAVE_LROUND 1
#define HAVE_LROUNDF 1
#define HAVE_NEARBYINT 1
#define HAVE_NEARBYINTF 1
#define HAVE_POWL 1
#define HAVE_REMAINDER 1
#define HAVE_REMAINDERF 1
#define HAVE_RINT 1
#define HAVE_RINTF 1
#define HAVE_ROUND 1
#define HAVE_ROUNDF 1
#define HAVE_TRUNC 1
#define HAVE_TRUNCF 1
#define HAVE_Y0 1
#define HAVE_Y1 1
#define HAVE_YN 1

#define HAVE_CLOCK_GETTIME 1
#define HAVE_FFS 1
#define HAVE_FNMATCH 1
#define HAVE_FSTATVFS 1
#define HAVE_FTRUNCATE 1
#define HAVE_FUTIMENS 1
#define HAVE_GETOPT_LONG_ONLY 1
#define HAVE_GETPWUID 1
#define HAVE_GETTIMEOFDAY 1
#define HAVE_GETUID 1
#define HAVE_LSTAT 1
#define HAVE_MEMMOVE 1
#define HAVE_MMAP 1
#define HAVE_POLL 1
#define HAVE_PREAD 1
#define HAVE_PWRITE 1
#define HAVE_READDIR 1
#define HAVE_READLINK 1
#define HAVE_SCHED_YIELD 1
#define HAVE_SIGADDSET 1
#define HAVE_SIGPROCMASK 1
#define HAVE_SNPRINTF 1
#define HAVE_SOCKETPAIR 1
#define HAVE_STATVFS 1
#define HAVE_STRCASECMP 1
#define HAVE_STRDUP 1
#define HAVE_STRERROR 1
#define HAVE_STRNCASECMP 1
#define HAVE_STRNLEN 1
#define HAVE_STRTOLD 1
#define HAVE_STRTOLL 1
#define HAVE_STRTOULL 1
#define HAVE_SYMLINK 1
#define HAVE_TIMEGM 1
#define HAVE_USLEEP 1
#define HAVE_VSNPRINTF 1
#define HAVE_DAYLIGHT 1
#define HAVE_TIMEZONE 1

#define HAVE_FREETYPE 1
#define HAVE_FT2BUILD_H 1
#define HAVE_FT_TRUETYPEENGINETYPE 1
/* FreeType is linked in; the name only selects libwine's table of it. */
#define SONAME_LIBFREETYPE "libfreetype"

#endif
