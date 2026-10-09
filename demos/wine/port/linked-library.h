/* SPDX-License-Identifier: MIT
 * A library linked into the Wine program that Wine opens by name at run time
 * (wine_dlopen and wine_dlsym in libwine.c). */
#ifndef WINE_DOLLY_LINKED_LIBRARY_H
#define WINE_DOLLY_LINKED_LIBRARY_H

struct linked_symbol { const char *name; void *value; };
struct linked_library { const char *name; const struct linked_symbol *symbols; };
/* every such library, NULL after the last */
extern const struct linked_library *const wine_dolly_libraries[];

#endif
