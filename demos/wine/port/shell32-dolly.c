/* SPDX-License-Identifier: LGPL-2.1-or-later
 * What shell32 has on Dolly in place of two things it is without.
 *
 * ole32 is not linked. shell32 allocates what it hands out (SHAlloc, the
 * lists of a file operation) with ole32's task allocator, which is the
 * process heap: these are Wine's two functions without the IMallocSpy
 * hooks. And a shortcut takes its target's item list from a parse with a
 * bind context, which ole32 would make: there is none, and the shortcut is
 * saved with the path alone.
 *
 * ShellExecute starts a process, and Dolly gives Wine one: a file is opened
 * by starting the program of this Wine that reads it as a thread
 * (kernel32-program.c). The desktop and the file manager open files so. */
#define COBJMACROS
#include <stdarg.h>
#include <windef.h>
#include <winbase.h>
#include <objbase.h>
#include <shlobj.h>
#include <shlguid.h>
#include "wine/unicode.h"

extern HANDLE wine_dolly_start_program( const WCHAR *cmdline );

LPVOID WINAPI CoTaskMemAlloc( SIZE_T size )
{
    return HeapAlloc( GetProcessHeap(), 0, size );
}

void WINAPI CoTaskMemFree( LPVOID ptr )
{
    HeapFree( GetProcessHeap(), 0, ptr );
}

HRESULT WINAPI CreateBindCtx( DWORD reserved, IBindCtx **context )
{
    *context = NULL;
    return E_NOTIMPL;
}

/* shell32's shortcut object, which it makes without ole32, and the interface that loads and saves it */
static IPersistFile *new_shortcut( IShellLinkW **link )
{
    IPersistFile *file;

    if (FAILED(SHCoCreateInstance( NULL, &CLSID_ShellLink, NULL, &IID_IShellLinkW, (void **)link ))) return NULL;
    if (SUCCEEDED(IShellLinkW_QueryInterface( *link, &IID_IPersistFile, (void **)&file ))) return file;
    IShellLinkW_Release( *link );
    return NULL;
}

/* The target and the arguments of a shortcut, each of MAX_PATH characters. */
BOOL wine_dolly_read_shortcut( const WCHAR *file, WCHAR *target, WCHAR *arguments )
{
    IShellLinkW *link;
    IPersistFile *persist = new_shortcut( &link );
    BOOL ret;

    if (!persist) return FALSE;
    ret = SUCCEEDED(IPersistFile_Load( persist, file, STGM_READ )) &&
          IShellLinkW_GetPath( link, target, MAX_PATH, NULL, SLGP_RAWPATH ) == S_OK &&
          SUCCEEDED(IShellLinkW_GetArguments( link, arguments, MAX_PATH ));
    IPersistFile_Release( persist );
    IShellLinkW_Release( link );
    return ret;
}

BOOL wine_dolly_write_shortcut( const WCHAR *file, const WCHAR *target )
{
    IShellLinkW *link;
    IPersistFile *persist = new_shortcut( &link );
    BOOL ret;

    if (!persist) return FALSE;
    /* S_FALSE for a target that is no file: a program of this Wine, which has none */
    ret = SUCCEEDED(IShellLinkW_SetPath( link, target )) && SUCCEEDED(IPersistFile_Save( persist, file, TRUE ));
    IPersistFile_Release( persist );
    IShellLinkW_Release( link );
    return ret;
}

/***********************************************************************
 *           wine_dolly_open_file
 *
 * Start the program of this Wine that opens a file, with it: the file
 * manager for a directory, Paint for a bitmap, x86emu for an x86-64
 * program, and Notepad, as text, for anything else. A shortcut is opened
 * by its target; one whose target is no file names a program of this Wine,
 * which has none. Returns as wine_dolly_start_program.
 */
HANDLE wine_dolly_open_file( const WCHAR *path )
{
    static const WCHAR lnkW[] = {'.','l','n','k',0}, bmpW[] = {'.','b','m','p',0}, exeW[] = {'.','e','x','e',0};
    static const WCHAR programW[] = {'%','s',' ','%','s',0};
    static const WCHAR winefileW[] = {'w','i','n','e','f','i','l','e',' ','"','%','s','"',0};
    static const WCHAR paintW[] = {'m','s','p','a','i','n','t',' ','%','s',0};  /* which takes the name as it is */
    static const WCHAR x86emuW[] = {'x','8','6','e','m','u',' ','"','%','s','"',' ','%','s',0};
    static const WCHAR notepadW[] = {'n','o','t','e','p','a','d',' ','"','%','s','"',0};
    WCHAR target[MAX_PATH], arguments[MAX_PATH] = {0}, line[2 * MAX_PATH + 16];
    const WCHAR *ext = strrchrW( path, '.' ), *format = notepadW;
    DWORD attributes;

    if (ext && !strcmpiW( ext, lnkW ) && wine_dolly_read_shortcut( path, target, arguments ))
    {
        if (GetFileAttributesW( target ) == INVALID_FILE_ATTRIBUTES)
        {
            const WCHAR *name = strrchrW( target, '\\' );
            snprintfW( line, ARRAY_SIZE(line), programW, name ? name + 1 : target, arguments );
            return wine_dolly_start_program( line );
        }
        path = target;
        ext = strrchrW( path, '.' );
    }
    attributes = GetFileAttributesW( path );
    if (attributes != INVALID_FILE_ATTRIBUTES && (attributes & FILE_ATTRIBUTE_DIRECTORY)) format = winefileW;
    else if (ext && !strcmpiW( ext, bmpW )) format = paintW;
    else if (ext && !strcmpiW( ext, exeW )) format = x86emuW;
    snprintfW( line, ARRAY_SIZE(line), format, path, arguments );
    return wine_dolly_start_program( line );
}
