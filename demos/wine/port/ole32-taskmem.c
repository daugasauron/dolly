/* SPDX-License-Identifier: LGPL-2.1-or-later
 * ole32 is not linked, and shell32 allocates what it hands out (SHAlloc,
 * the lists of a file operation) with ole32's task allocator. That allocator
 * is the process heap: these are Wine's two functions without the
 * IMallocSpy hooks. */
#include <stdarg.h>
#include <windef.h>
#include <winbase.h>

LPVOID WINAPI CoTaskMemAlloc( SIZE_T size )
{
    return HeapAlloc( GetProcessHeap(), 0, size );
}

void WINAPI CoTaskMemFree( LPVOID ptr )
{
    HeapFree( GetProcessHeap(), 0, ptr );
}
