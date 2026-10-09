/*
 * Dolly's libs/wine/loader.c and port.c: the modules of a Wine process are
 * linked into its one executable. Each registers the image winebuild wrote
 * for it (dolly-image.h) from a constructor; ntdll asks for them by name as
 * it would for .dll.so files.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 */

#include "config.h"
#include "wine/port.h"

#include <errno.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define NONAMELESSUNION
#define NONAMELESSSTRUCT
#include "windef.h"
#include "winbase.h"
#include "wine/library.h"

extern char **environ;
extern void __wine_process_init(void);

const char wine_build[] = "wine-" PACKAGE_VERSION;

int __wine_main_argc = 0;
char **__wine_main_argv = NULL;
WCHAR **__wine_main_wargv = NULL;
char **__wine_main_environ = NULL;

#define MAX_MODULES 100

static struct module
{
    void       *image;
    const char *filename;
    int         loaded;
} modules[MAX_MODULES];

static int nb_modules;
static load_dll_callback_t load_dll_callback;

#include "linked-library.h"

static struct module *find_module( const char *name )
{
    const char *p = strrchr( name, '/' );
    int i;

    if (p) name = p + 1;
    for (i = 0; i < nb_modules; i++) if (!strcmp( modules[i].filename, name )) return &modules[i];
    return NULL;
}

static void *load_module( struct module *module )
{
    if (!module->loaded)
    {
        module->loaded = 1;
        load_dll_callback( module->image, module->filename );
    }
    return module;
}

static void set_error( char *error, size_t size, const char *format, const char *name )
{
    if (error && size) snprintf( error, size, format, name );
}

/***********************************************************************
 *           __wine_dll_register
 *
 * Register a module linked into the program; header is its image.
 */
void __wine_dll_register( const IMAGE_NT_HEADERS *header, const char *filename )
{
    if (nb_modules == MAX_MODULES) abort();
    modules[nb_modules].image = (void *)header;
    modules[nb_modules].filename = filename;
    nb_modules++;
}

/***********************************************************************
 *           wine_dll_set_callback
 *
 * Set the callback function for dll loading, and call it for ntdll,
 * which is running already.
 */
void wine_dll_set_callback( load_dll_callback_t load )
{
    struct module *ntdll = find_module( "ntdll.dll" );

    load_dll_callback = load;
    if (ntdll) load_module( ntdll );
}

/***********************************************************************
 *           wine_dll_load
 */
void *wine_dll_load( const char *filename, char *error, int errorsize, int *file_exists )
{
    struct module *module = find_module( filename );

    *file_exists = module != NULL;
    if (module) return load_module( module );
    set_error( error, errorsize, "%s is not linked into this program", filename );
    return NULL;
}

/***********************************************************************
 *           wine_dll_unload
 */
void wine_dll_unload( void *handle )
{
}

/***********************************************************************
 *           wine_dll_load_main_exe
 */
void *wine_dll_load_main_exe( const char *name, char *error, int errorsize,
                              int test_only, int *file_exists )
{
    struct module *module = find_module( name );

    *file_exists = module != NULL;
    if (!module) set_error( error, errorsize, "%s is not linked into this program", name );
    else if (!test_only) load_module( module );
    return module;
}

/***********************************************************************
 *           wine_dll_enum_load_path
 *
 * No directory holds modules.
 */
const char *wine_dll_enum_load_path( unsigned int index )
{
    return NULL;
}

/***********************************************************************
 *           wine_dll_get_owner
 *
 * No 16-bit module exists.
 */
int wine_dll_get_owner( const char *name, char *buffer, int size, int *exists )
{
    *exists = 0;
    return -1;
}

/***********************************************************************
 *           wine_init
 *
 * Main Wine initialisation.
 */
void wine_init( int argc, char *argv[], char *error, int error_size )
{
    wine_init_argv0_path( argv[0] );
    __wine_main_argc = argc;
    __wine_main_argv = argv;
    __wine_main_environ = environ;
    __wine_process_init();
}

/***********************************************************************
 *           wine_dlopen
 *
 * Only a library linked into the program can be opened.
 */
void *wine_dlopen( const char *filename, int flag, char *error, size_t errorsize )
{
    const struct linked_library *const *library;

    for (library = wine_dolly_libraries; *library; library++)
        if (filename && !strcmp( (*library)->name, filename )) return (void *)*library;
    set_error( error, errorsize, "%s: Dolly loads no shared library into a threaded program", filename ? filename : "(self)" );
    errno = ENOSYS;
    return NULL;
}

/***********************************************************************
 *           wine_dlsym
 */
void *wine_dlsym( void *handle, const char *symbol, char *error, size_t errorsize )
{
    const struct linked_library *library = handle;
    const struct linked_symbol *entry;

    for (entry = library->symbols; entry->name; entry++)
        if (!strcmp( entry->name, symbol )) return entry->value;
    set_error( error, errorsize, "%s is not in the linked library", symbol );
    return NULL;
}

/***********************************************************************
 *           wine_dlclose
 */
int wine_dlclose( void *handle, char *error, size_t errorsize )
{
    return 0;
}

/***********************************************************************
 *           wine_switch_to_stack
 *
 * WebAssembly keeps return addresses and locals on a stack that cannot be
 * switched, so the function runs on the stack the thread has.
 */
void DECLSPEC_NORETURN wine_switch_to_stack( void (*func)(void *), void *arg, void *stack )
{
    func( arg );
    abort();
}

/***********************************************************************
 *           wine_call_on_stack
 */
int wine_call_on_stack( int (*func)(void *), void *arg, void *stack )
{
    return func( arg );
}
