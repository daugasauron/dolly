DOLLY 3
MODULE upload

REQUIRES HEADER libc
REQUIRES HEADER process
REQUIRES TOOL cc
REQUIRES TOOL rm

FILE /tmp/upload/upload.c
    #include <dolly/process.h>
    #include <stdio.h>
    #include <stdlib.h>
    #include <string.h>
    int main(int argc, char **argv) {
      if (argc != 2 || strcmp(argv[1], "--help") == 0) {
        fprintf(argc == 2 ? stdout : stderr, "usage: upload DESTINATION\nChoose a file in the browser (up to 64 MiB). Existing files are never replaced.\n");
        return argc == 2 ? 0 : 2;
      }
      const size_t length = strlen(argv[1]);
      if (length == 0 || length >= 4096) return 2;
      unsigned char packet[sizeof(dolly_process_path_request) + 4096];
      const dolly_process_path_request request = {
        .directory_descriptor = UINT32_MAX, .path_size = (uint32_t)length,
      };
      memcpy(packet, &request, sizeof(request));
      memcpy(packet + sizeof(request), argv[1], length);
      puts("upload: choose a file in the browser, or cancel");
      fflush(stdout);
      const int64_t result = dolly_process_call(DOLLY_PROCESS_UPLOAD_FILE,
          packet, sizeof(request) + length, NULL, 0);
      if (result < 0) { fprintf(stderr, "upload: %s\n", strerror((int)-result)); return 1; }
      printf("upload: saved %s\n", argv[1]);
      return 0;
    }
SLOP cc -std=c17 -O1 /tmp/upload/upload.c -o /bin/upload
EXPORTS TOOL upload
SLOP rm -rf /tmp/upload
