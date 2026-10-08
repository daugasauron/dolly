/* SPDX-License-Identifier: MIT
 * The smallest Winelib program of the Wine demo: it only talks to kernel32,
 * so it shows ntdll, kernel32 and wineserver working together. */
#include <stdarg.h>
#include <stdio.h>
#include <string.h>
#include <windef.h>
#include <winbase.h>
#include <winreg.h>

static DWORD WINAPI worker( void *event )
{
    SetEvent( event );
    return 7;
}

int main( int argc, char *argv[] )
{
    char text[256], path[MAX_PATH];
    DWORD count, code = 0;
    SYSTEM_INFO info;
    HANDLE file, event, thread;
    void *memory;

    GetSystemInfo( &info );
    GetModuleFileNameA( NULL, path, sizeof(path) );
    sprintf( text, "Hello from %s, Windows %u.%u, page size %u, %u processors\r\n", path,
             (unsigned)LOBYTE(GetVersion()), (unsigned)HIBYTE(GetVersion()), (unsigned)info.dwPageSize,
             (unsigned)info.dwNumberOfProcessors );
    WriteFile( GetStdHandle( STD_OUTPUT_HANDLE ), text, strlen( text ), &count, NULL );

    file = CreateFileA( "C:\\hello.txt", GENERIC_READ | GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, 0, NULL );
    WriteFile( file, "written through wineserver", 26, &count, NULL );
    SetFilePointer( file, 0, NULL, FILE_BEGIN );
    memset( text, 0, sizeof(text) );
    ReadFile( file, text, sizeof(text) - 1, &count, NULL );
    CloseHandle( file );
    printf( "file: %s (%u bytes)\n", text, (unsigned)count );

    event = CreateEventA( NULL, TRUE, FALSE, NULL );
    thread = CreateThread( NULL, 0, worker, event, 0, NULL );
    count = WaitForSingleObject( event, 10000 );
    WaitForSingleObject( thread, 10000 );
    GetExitCodeThread( thread, &code );
    printf( "thread: wait %u, exit code %u\n", (unsigned)count, (unsigned)code );

    memory = VirtualAlloc( NULL, 0x100000, MEM_RESERVE | MEM_COMMIT, PAGE_READWRITE );
    printf( "VirtualAlloc: %s, CreateProcess: %s\n", memory ? "ok" : "failed",
            WinExec( "notepad.exe", 5 ) > 31 ? "started" : "refused" );
    return 0;
}
