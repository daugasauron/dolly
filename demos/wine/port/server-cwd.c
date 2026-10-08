/* SPDX-License-Identifier: MIT
 * The server thread's own working directory (server-cwd.h): a descriptor,
 * and every path the server names is resolved against it. */
#include <errno.h>
#include <fcntl.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <unistd.h>

static int cwd = AT_FDCWD;
/* A socket is bound by path alone: the directory entered by name is remembered for it. */
static char named_path[sizeof(((struct sockaddr_un *)0)->sun_path)];
static struct stat named;

static int enter( int fd )
{
    if (fd == -1) return -1;
    if (cwd != AT_FDCWD) close( cwd );
    cwd = fd;
    return 0;
}

int server_chdir( const char *path )
{
    int fd = openat( cwd, path, O_RDONLY | O_DIRECTORY | O_CLOEXEC );

    if (enter( fd )) return -1;
    named_path[0] = 0;
    if (path[0] == '/' && strlen( path ) < sizeof(named_path) && !fstat( fd, &named )) strcpy( named_path, path );
    return 0;
}

int server_fchdir( int fd )
{
    return enter( fcntl( fd, F_DUPFD_CLOEXEC, 3 ) );
}

int server_open( const char *path, int flags, ... )
{
    mode_t mode = 0;
    va_list args;

    va_start( args, flags );
    if (flags & O_CREAT) mode = va_arg( args, int );
    va_end( args );
    return openat( cwd, path, flags, mode );
}

int server_stat( const char *path, struct stat *st ) { return fstatat( cwd, path, st, 0 ); }
int server_lstat( const char *path, struct stat *st ) { return fstatat( cwd, path, st, AT_SYMLINK_NOFOLLOW ); }
int server_unlink( const char *path ) { return unlinkat( cwd, path, 0 ); }
int server_rmdir( const char *path ) { return unlinkat( cwd, path, AT_REMOVEDIR ); }
int server_rename( const char *from, const char *to ) { return renameat( cwd, from, cwd, to ); }
int server_mkdir( const char *path, mode_t mode ) { return mkdirat( cwd, path, mode ); }
int server_link( const char *from, const char *to ) { return linkat( cwd, from, cwd, to, 0 ); }
int server_chmod( const char *path, mode_t mode ) { return fchmodat( cwd, path, mode, 0 ); }
int server_access( const char *path, int mode ) { return faccessat( cwd, path, mode, 0 ); }
ssize_t server_readlink( const char *path, char *buffer, size_t size ) { return readlinkat( cwd, path, buffer, size ); }

FILE *server_fopen( const char *path, const char *mode )
{
    int flags = mode[0] == 'r' ? O_RDONLY : mode[0] == 'a' ? O_WRONLY | O_CREAT | O_APPEND : O_WRONLY | O_CREAT | O_TRUNC;
    int fd;
    FILE *file;

    if (strchr( mode, '+' )) flags = (flags & ~(O_RDONLY | O_WRONLY)) | O_RDWR;
    if ((fd = openat( cwd, path, flags, 0666 )) == -1) return NULL;
    if (!(file = fdopen( fd, mode ))) close( fd );
    return file;
}

/* libwine_port's mkstemps, in the server's directory */
int server_mkstemps( char *template, int suffix_len )
{
    static const char letters[] = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    static unsigned long long value;
    char *pattern = template + strlen( template ) - suffix_len - 6;
    int count, i, fd;

    if (pattern < template || strncmp( pattern, "XXXXXX", 6 )) { errno = EINVAL; return -1; }
    value += (unsigned long long)getpid() << 20;
    for (count = 0; count < 1000; count++, value += 7777)
    {
        unsigned long long v = value;
        for (i = 0; i < 6; i++, v /= 62) pattern[i] = letters[v % 62];
        if ((fd = openat( cwd, template, O_RDWR | O_CREAT | O_EXCL, 0600 )) != -1 || errno != EEXIST) return fd;
    }
    return -1;
}

int server_bind( int fd, const struct sockaddr *address, socklen_t size )
{
    const struct sockaddr_un *relative = (const struct sockaddr_un *)address;
    struct sockaddr_un absolute = { AF_UNIX };
    struct stat st;

    if (address->sa_family != AF_UNIX || relative->sun_path[0] == '/') return bind( fd, address, size );
    if (!named_path[0] || fstat( cwd, &st ) || st.st_dev != named.st_dev || st.st_ino != named.st_ino ||
        strlen( named_path ) + 1 + strlen( relative->sun_path ) >= sizeof(absolute.sun_path))
    {
        errno = ENOTSUP;
        return -1;
    }
    sprintf( absolute.sun_path, "%s/%s", named_path, relative->sun_path );
    return bind( fd, (struct sockaddr *)&absolute, sizeof(absolute) );
}
