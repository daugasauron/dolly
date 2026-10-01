DOLLY 6
MODULE upload

REQUIRES HEADER libc
REQUIRES HEADER upload
REQUIRES TOOL cc
REQUIRES TOOL rm

FILE /tmp/upload/upload.c
    #include <dolly/upload.h>
    #include <stdio.h>
    #include <stdlib.h>
    #include <string.h>
    int main(int argc, char **argv) {
      if (argc != 2 || strcmp(argv[1], "--help") == 0) {
        fprintf(argc == 2 ? stdout : stderr, "usage: upload DESTINATION\nChoose a file in the browser (up to 64 MiB). Existing files are never replaced.\n");
        return argc == 2 ? 0 : 2;
      }
      puts("upload: choose a file in the browser, or cancel");
      fflush(stdout);
      const int result = dolly_upload_file(argv[1]);
      if (result < 0) { fprintf(stderr, "upload: %s\n", strerror((int)-result)); return 1; }
      printf("upload: saved %s\n", argv[1]);
      return 0;
    }
SLOP cc -std=c17 -O1 /tmp/upload/upload.c -o /bin/upload
EXPORTS TOOL upload
SLOP rm -rf /tmp/upload
