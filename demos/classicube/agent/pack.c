/* Compress a Classic map stream using Dolly's existing zlib. SPDX-License-Identifier: MIT */
#include <stdio.h>
#include <unistd.h>
#include <zlib.h>

int main(int argc, char **argv) {
    if (argc != 2) return 64;
    FILE *input = fopen(argv[1], "rb");
    if (!input) return 1;
    int fd = dup(STDOUT_FILENO);
    gzFile output = fd < 0 ? NULL : gzdopen(fd, "wb1");
    if (!output) { if (fd >= 0) close(fd); fclose(input); return 1; }
    unsigned char bytes[65536];
    int status = 0;
    size_t count;
    while ((count = fread(bytes, 1, sizeof(bytes), input))) {
        if (gzwrite(output, bytes, count) != (int)count) { status = 1; break; }
    }
    if (ferror(input)) status = 1;
    if (fclose(input)) status = 1;
    if (gzclose(output) != Z_OK) status = 1;
    return status;
}
