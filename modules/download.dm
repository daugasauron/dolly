DOLLY 2
MODULE download

REQUIRES HEADER libc
REQUIRES HEADER download
REQUIRES TOOL   cc
REQUIRES TOOL   rm

# This command is Dolly-specific rather than part of the POSIX-like core set.
FILE /tmp/download/download.c
    #include <stdio.h>
    #include <string.h>
    
    #include <dolly/download.h>
    
    int main(int argc, char **argv) {
      if (argc == 2 && strcmp(argv[1], "--help") == 0) {
        fputs("usage: download FILE\n", stdout);
        return 0;
      }
      if (argc != 2) {
        fputs("download: expected one file\n", stderr);
        return 2;
      }
      const int status = dolly_download_file(argv[1]);
      if (status != 0) {
        fprintf(stderr, "download: %s failed (%d)\n", argv[1], status);
        return 1;
      }
      printf("download: requested %s\n", argv[1]);
      return 0;
    }

SLOP cc \
  /tmp/download/download.c \
  -o /bin/download

EXPORTS TOOL download

SLOP rm \
  -rf \
  /tmp/download
