/* SPDX-License-Identifier: MIT
 * wineserver runs as a thread of the Wine process (main.c) and keeps a
 * working directory of its own: it works with relative paths and changes
 * directory at will, which must not move the program's. Included before
 * every server source; server-cwd.c holds the directory as a descriptor. */
#ifndef WINE_DOLLY_SERVER_CWD_H
#define WINE_DOLLY_SERVER_CWD_H

#include <stdio.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/socket.h>
#include <fcntl.h>
#include <unistd.h>

int server_chdir( const char *path );
int server_fchdir( int fd );
int server_open( const char *path, int flags, ... );
int server_stat( const char *path, struct stat *st );
int server_lstat( const char *path, struct stat *st );
int server_unlink( const char *path );
int server_rmdir( const char *path );
int server_rename( const char *from, const char *to );
int server_mkdir( const char *path, mode_t mode );
int server_link( const char *from, const char *to );
int server_chmod( const char *path, mode_t mode );
int server_access( const char *path, int mode );
ssize_t server_readlink( const char *path, char *buffer, size_t size );
FILE *server_fopen( const char *path, const char *mode );
int server_mkstemps( char *template, int suffix_len );
int server_bind( int fd, const struct sockaddr *address, socklen_t size );

#define chdir(path) server_chdir(path)
#define fchdir(fd) server_fchdir(fd)
#define open(...) server_open(__VA_ARGS__)
#define stat(path,st) server_stat(path,st)
#define lstat(path,st) server_lstat(path,st)
#define unlink(path) server_unlink(path)
#define rmdir(path) server_rmdir(path)
#define rename(from,to) server_rename(from,to)
#define mkdir(path,mode) server_mkdir(path,mode)
#define link(from,to) server_link(from,to)
#define chmod(path,mode) server_chmod(path,mode)
#define access(path,mode) server_access(path,mode)
#define readlink(path,buffer,size) server_readlink(path,buffer,size)
#define fopen(path,mode) server_fopen(path,mode)
#define mkstemps(template,len) server_mkstemps(template,len)
#define bind(fd,address,size) server_bind(fd,address,size)

#endif
