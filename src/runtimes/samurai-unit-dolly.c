/* One selectable frontend unit for each pinned upstream Samurai C source. */
#ifndef DOLLY_SAMURAI_PART
#error DOLLY_SAMURAI_PART must select a Samurai source unit
#endif

#if DOLLY_SAMURAI_PART == 1
#include "build.c"
#elif DOLLY_SAMURAI_PART == 2
#include "deps.c"
#elif DOLLY_SAMURAI_PART == 3
#include "env.c"
#elif DOLLY_SAMURAI_PART == 4
#include "graph.c"
#elif DOLLY_SAMURAI_PART == 5
#include "htab.c"
#elif DOLLY_SAMURAI_PART == 6
#include "log.c"
#elif DOLLY_SAMURAI_PART == 7
#include "parse.c"
#elif DOLLY_SAMURAI_PART == 8
#include "samu.c"
#elif DOLLY_SAMURAI_PART == 9
#include "scan.c"
#elif DOLLY_SAMURAI_PART == 10
#include "tool.c"
#elif DOLLY_SAMURAI_PART == 11
#include "tree.c"
#elif DOLLY_SAMURAI_PART == 12
#include <stdarg.h>
#include <stdio.h>
static int
dolly_samurai_fprintf(FILE *stream, const char *format, ...)
{
	va_list arguments;
	int result;

	va_start(arguments, format);
	result = vfprintf(stream, format, arguments);
	va_end(arguments);
	return result;
}
#define fprintf dolly_samurai_fprintf
#include "util.c"
#undef fprintf
#elif DOLLY_SAMURAI_PART == 13
#include "os-posix.c"
#else
#error unknown DOLLY_SAMURAI_PART
#endif
