// wasm64 Dolly target configuration for Seven Kingdoms 2.15.7.
// SPDX-License-Identifier: GPL-2.0-or-later
#define USE_POSIX 1
#define USE_SDL 1
#define DISABLE_MULTI_PLAYER 1
#define NO_MEM_CLASS 1
#define HAVE_CXX11 1
#define HAVE_SETENV 1
#define HAVE_STRINGS_STRCASECMP 1
#define HAVE_INTTYPES_H 1
#define HAVE_STDINT_H 1
#define HAVE_STDLIB_H 1
#define HAVE_STRINGS_H 1
#define HAVE_STRING_H 1
#define HAVE_SYS_STAT_H 1
#define HAVE_SYS_TYPES_H 1
#define HAVE_UNISTD_H 1
#define STDC_HEADERS 1
#define USE_FHS 1
#define PACKAGE "7kaa"
#define PACKAGE_DATA_DIR "/usr/share/7kaa"
#define LOCALE_DIR "/usr/share/locale"
#define VERSION "2.15.7"
#define REGISTER
#include "arena.h"
#include "input.h"
