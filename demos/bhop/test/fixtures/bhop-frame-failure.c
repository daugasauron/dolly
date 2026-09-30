#define _POSIX_C_SOURCE 200809L
#undef main
#include "/usr/src/dolly/bhop/agent/timeline.h"
#include <assert.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

static int dropped;
int rename(const char *source, const char *target) {
    if (strstr(source, "/view.rgba.tmp") && dropped < 2) {
        ++dropped;
        assert(unlink(source) == 0);
    }
    return renameat(AT_FDCWD, source, AT_FDCWD, target);
}

int bhop_main(int argc, char **argv);
int main(void) {
    const char *scratch = "/tmp/bhop-frame-failure", *run = "/workspace/bhop-frame-failure";
    assert(mkdir(scratch, 0777) == 0 && mkdir(run, 0777) == 0);
    assert(setenv("DOLLY_BHOP_DIR", scratch, 1) == 0 && setenv("DOLLY_BHOP_RUN", run, 1) == 0);
    const uint32_t control[] = {1, 2};
    FILE *file = fopen("/tmp/bhop-frame-failure/control", "wb"); assert(file);
    assert(fwrite(control, sizeof(control), 1, file) == 1 && fclose(file) == 0);
    const bh_request request = {.magic = BH_INPUT_MAGIC, .version = BH_INPUT_VERSION, .id = 1, .generation = 1};
    file = fopen("/tmp/bhop-frame-failure/request", "wb"); assert(file);
    assert(fwrite(&request, sizeof(request), 1, file) == 1 && fclose(file) == 0);
    char *argv[] = {"bhop", "--frames", "60", NULL};
    const int status = bhop_main(3, argv);
    if (status) return status;
    assert(dropped == 2);
    uint32_t header[4];
    file = fopen("/tmp/bhop-frame-failure/view.rgba", "rb"); assert(file);
    assert(fread(header, sizeof(header), 1, file) == 1 && header[0] >= 60 && fclose(file) == 0);
    unsigned char signature[8];
    file = fopen("/tmp/bhop-frame-failure/response.png", "rb"); assert(file);
    assert(fread(signature, sizeof(signature), 1, file) == 1 && fclose(file) == 0);
    assert(memcmp(signature, "\211PNG\r\n\032\n", sizeof(signature)) == 0);
    assert(access("/tmp/bhop-frame-failure/response", F_OK) == 0);
    assert(access("/workspace/bhop-frame-failure/attempt-000001/frame-000000.png", F_OK) == 0);
    assert(access("/workspace/bhop-frame-failure/attempt-000001/frame-000001.png", F_OK) == 0);
    puts("bhop: missing preview files recovered; agent response and recording survived");
    return 0;
}
