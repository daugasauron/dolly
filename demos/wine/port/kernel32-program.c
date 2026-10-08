/*
 * Programs as threads (compiled into kernel32).
 *
 * Dolly gives Wine one process, so a second program cannot be a second
 * process. The desktop starts a program that is linked into this Wine as a
 * thread instead: the thread runs the program's entry point, and for it
 * GetModuleHandle(NULL), GetCommandLine and the arguments of main name the
 * program, and ExitProcess ends the thread. Before each start the
 * program's static data is put back as it was linked.
 *
 * What this is not: a process. A program that traps takes every other one
 * and the desktop with it; one program runs once at a time; the threads a
 * program creates see the desktop as their process, and they, its handles
 * and its heap blocks are not freed when it exits; a program that calls
 * exit() or TerminateProcess on itself ends everything.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 */

#include "config.h"
#include "wine/port.h"

#include <stdarg.h>
#include <string.h>

#include "windef.h"
#include "winbase.h"
#include "winternl.h"
#include "wine/library.h"
#include "wine/unicode.h"

struct program
{
    const char *name;                   /* its module's file name */
    char       *data, *data_end;        /* its initialized data, */
    char       *bss, *bss_end;          /* and what starts as zeros */
    char       *initial;                /* the data before the first start */
    HANDLE      thread;                 /* of the last start */
    HMODULE     module;
    WCHAR      *cmdlineW;
    char       *cmdlineA;
    int         argc;
    char      **argv;
    WCHAR     **wargv;
};

static struct program programs[32];
static unsigned int nb_programs;
static __thread struct program *current;

/* Called by each program's constructor (winebuild-dolly.c), before Wine starts. */
void wine_dolly_register_program( const char *name, void *data, void *data_end, void *bss, void *bss_end )
{
    struct program *program;

    if (nb_programs == ARRAY_SIZE(programs)) return;
    program = &programs[nb_programs++];
    program->name = name;
    program->data = data;
    program->data_end = data_end;
    program->bss = bss;
    program->bss_end = bss_end;
}

const char *wine_dolly_enum_programs( unsigned int index )
{
    return index < nb_programs ? programs[index].name : NULL;
}

HMODULE wine_dolly_program_module(void)
{
    return current ? current->module : NtCurrentTeb()->Peb->ImageBaseAddress;
}

char *wine_dolly_program_cmdlineA(void)
{
    return current ? current->cmdlineA : NULL;
}

WCHAR *wine_dolly_program_cmdlineW(void)
{
    return current ? current->cmdlineW : NULL;
}

/* the arguments of a program's main (the module's entry in its winebuild description) */
int wine_dolly_main_argc(void)
{
    return current ? current->argc : __wine_main_argc;
}

char **wine_dolly_main_argv(void)
{
    return current ? current->argv : __wine_main_argv;
}

WCHAR **wine_dolly_main_wargv(void)
{
    return current ? current->wargv : __wine_main_wargv;
}

static struct program *find_program( const WCHAR *name, unsigned int len )
{
    unsigned int i, j;

    for (i = 0; i < nb_programs; i++)
    {
        for (j = 0; j < len && programs[i].name[j] == tolowerW( name[j] ); j++) /* nothing */;
        if (j == len && (!programs[i].name[j] || !strcmp( programs[i].name + j, ".exe" ))) return &programs[i];
    }
    return NULL;
}

static BOOL is_running( struct program *program )
{
    if (!program->thread) return FALSE;
    if (WaitForSingleObject( program->thread, 0 ) == WAIT_TIMEOUT) return TRUE;
    CloseHandle( program->thread );
    program->thread = 0;
    return FALSE;
}

BOOL wine_dolly_program_running( const WCHAR *name )
{
    struct program *program = find_program( name, strlenW( name ) );

    return program && is_running( program );
}

/* the words of a command line, split at blanks outside double quotes */
static void split_command_line( struct program *program )
{
    WCHAR *copy = HeapAlloc( GetProcessHeap(), 0, (strlenW( program->cmdlineW ) + 1) * sizeof(WCHAR) ), *p = copy;
    int count = 0, max = strlenW( program->cmdlineW ) / 2 + 2, len;

    HeapFree( GetProcessHeap(), 0, program->argv );
    HeapFree( GetProcessHeap(), 0, program->wargv );
    program->wargv = HeapAlloc( GetProcessHeap(), HEAP_ZERO_MEMORY, max * sizeof(WCHAR *) );
    program->argv = HeapAlloc( GetProcessHeap(), HEAP_ZERO_MEMORY, max * sizeof(char *) );
    strcpyW( copy, program->cmdlineW );
    while (*p)
    {
        WCHAR *word = p, *out = p;
        BOOL quoted = FALSE;

        for (; *p && (quoted || (*p != ' ' && *p != '\t')); p++)
        {
            if (*p == '"') quoted = !quoted;
            else *out++ = *p;
        }
        while (*p == ' ' || *p == '\t') p++;
        *out = 0;
        program->wargv[count] = word;
        len = WideCharToMultiByte( CP_ACP, 0, word, -1, NULL, 0, NULL, NULL );
        program->argv[count] = HeapAlloc( GetProcessHeap(), 0, len );
        WideCharToMultiByte( CP_ACP, 0, word, -1, program->argv[count], len, NULL, NULL );
        count++;
    }
    program->argc = count;
}

static DWORD WINAPI program_thread( void *arg )
{
    struct program *program = arg;
    IMAGE_NT_HEADERS *nt = RtlImageNtHeader( program->module );
    /* the RVA names a slot that holds the function (dolly-image.h) */
    DWORD (WINAPI *entry)(PEB *) = *(void **)((char *)program->module + nt->OptionalHeader.AddressOfEntryPoint);

    current = program;
    return entry( NtCurrentTeb()->Peb );
}

/***********************************************************************
 *           wine_dolly_start_program
 *
 * Start a program linked into this Wine as a thread; the command line's
 * first word names it. Returns the thread, or 0 with the last error set:
 * ERROR_FILE_NOT_FOUND for a name that is no such program, ERROR_BUSY while
 * it is running.
 */
HANDLE wine_dolly_start_program( const WCHAR *cmdline )
{
    struct program *program;
    WCHAR name[64];
    unsigned int len = 0, size;
    IMAGE_IMPORT_DESCRIPTOR *imports;
    HANDLE thread;

    while (cmdline[len] && cmdline[len] != ' ' && cmdline[len] != '\t') len++;
    if (!(program = find_program( cmdline, len )) || strlen( program->name ) >= ARRAY_SIZE(name))
    {
        SetLastError( ERROR_FILE_NOT_FOUND );
        return 0;
    }
    if (is_running( program ))
    {
        SetLastError( ERROR_BUSY );
        return 0;
    }
    for (len = 0; (name[len] = program->name[len]); len++) /* nothing */;
    if (!program->module && !(program->module = LoadLibraryW( name ))) return 0;

    /* its data as linked: a copy is kept at the first start and put back at each later one */
    size = program->data_end - program->data;
    if (program->data > (char *)program->module || program->data_end < (char *)program->module)
    {
        /* the linker did not keep the module's data together: it can start only once */
        if (program->initial)
        {
            SetLastError( ERROR_NOT_SUPPORTED );
            return 0;
        }
        program->initial = program->data;
    }
    else if (!program->initial)
    {
        if (!(program->initial = HeapAlloc( GetProcessHeap(), 0, size ))) return 0;
        memcpy( program->initial, program->data, size );
    }
    else
    {
        memcpy( program->data, program->initial, size );
        memset( program->bss, 0, program->bss_end - program->bss );
    }

    /* the modules it imports: for the process's own program ntdll does this */
    if ((imports = RtlImageDirectoryEntryToData( program->module, TRUE, IMAGE_DIRECTORY_ENTRY_IMPORT, &size )))
        for (; imports->Name; imports++) LoadLibraryA( (char *)program->module + imports->Name );

    HeapFree( GetProcessHeap(), 0, program->cmdlineW );
    HeapFree( GetProcessHeap(), 0, program->cmdlineA );
    size = (strlenW( cmdline ) + 1) * sizeof(WCHAR);
    program->cmdlineW = HeapAlloc( GetProcessHeap(), 0, size );
    memcpy( program->cmdlineW, cmdline, size );
    size = WideCharToMultiByte( CP_ACP, 0, cmdline, -1, NULL, 0, NULL, NULL );
    program->cmdlineA = HeapAlloc( GetProcessHeap(), 0, size );
    WideCharToMultiByte( CP_ACP, 0, cmdline, -1, program->cmdlineA, size, NULL, NULL );
    split_command_line( program );

    if (!(thread = CreateThread( NULL, 0, program_thread, program, 0, NULL ))) return 0;
    DuplicateHandle( GetCurrentProcess(), thread, GetCurrentProcess(), &program->thread, 0, FALSE, DUPLICATE_SAME_ACCESS );
    return thread;
}
