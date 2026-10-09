/* SPDX-License-Identifier: MIT
 * wine: the Wine loader for Dolly. One executable holds the program, the
 * DLLs and wineserver, because a Dolly process cannot hand a descriptor to
 * another one and has no fork. The server's main runs unchanged in a thread,
 * started the first time ntdll looks for a server (start_server in
 * dlls/ntdll/server.c), and is reached over its Unix socket as usual. */
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

extern void wine_init( int argc, char *argv[], char *error, int error_size );
extern int wineserver_main( int argc, char *argv[] );
extern void main_loop(void);

static int ready[2];

/* wineserver's main calls this for its main loop: it listens by now. */
void wine_dolly_server_ready(void)
{
    char byte = 0;

    write( ready[1], &byte, 1 );
    main_loop();
}

static void *server_thread( void *debug )
{
    static char name[] = "wineserver", foreground[] = "--foreground", debug_option[] = "--debug";
    char *argv[] = { name, foreground, debug ? debug_option : NULL, NULL };

    wineserver_main( debug ? 3 : 2, argv );
    return NULL;
}

void wine_dolly_start_server( int debug )
{
    pthread_t thread;
    char byte;

    if (pipe( ready ) || pthread_create( &thread, NULL, server_thread, debug ? ready : NULL ))
    {
        perror( "wine: cannot start the server thread" );
        exit( 1 );
    }
    read( ready[0], &byte, 1 );
}

int main( int argc, char *argv[] )
{
    char error[1024] = "";

    if (argc < 2)
    {
        fprintf( stderr, "Usage: wine PROGRAM [ARGUMENTS...]   Run a Windows program linked into this Wine\n" );
        return 1;
    }
    wine_init( argc, argv, error, sizeof(error) );
    fprintf( stderr, "wine: failed to initialize: %s\n", error );
    return 1;
}
