#define _POSIX_C_SOURCE 200809L
#undef main
#undef fopen
#undef fwrite
#undef fclose
#include "/usr/src/dolly/bhop/agent/timeline.h"
#include <assert.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

static int failures, short_write, inject = 1;
static FILE *frame_file, *index_file;
static void request(unsigned id) {
    const bh_request value = {.magic = BH_INPUT_MAGIC, .version = BH_INPUT_VERSION, .id = id, .generation = 1};
    FILE *file = fopen("/tmp/bhop-recording-failure/request", "wb"); assert(file);
    assert(fwrite(&value, sizeof(value), 1, file) == 1 && fclose(file) == 0);
}
FILE *bh_test_open(const char *name, const char *mode) {
    const int frame = strstr(name, "/frame-") && !strstr(name, "/frame-000000.png") && mode[0] == 'w';
    const int index = strstr(name, "/frames.jsonl") && mode[0] == 'a';
    if (inject && ((frame && failures == 0) || (index && failures == 3))) { ++failures; inject = 0; errno = EINVAL; return NULL; }
    FILE *file = fopen(name, mode);
    if (frame) frame_file = file;
    if (index) index_file = file;
    return file;
}
size_t bh_test_write(const void *data, size_t size, size_t count, FILE *file) {
    if (inject && ((file == frame_file && failures == 1) || (file == index_file && failures == 4))) {
        ++failures; short_write = 1; inject = 0;
        const size_t written = fwrite(data, size, count / 2, file);
        errno = EINVAL;
        return written;
    }
    return fwrite(data, size, count, file);
}
int bh_test_close(FILE *file) {
    const int frame = file == frame_file, index = file == index_file;
    if (frame) frame_file = NULL;
    if (index) index_file = NULL;
    const int result = fclose(file);
    // A close after a short write changes errno, without changing its cause.
    if ((frame || index) && short_write) { short_write = 0; errno = ENOENT; return result; }
    if (inject && ((frame && failures == 2) || (index && failures == 5))) {
        inject = 0;
        if (++failures == 6) request(2);
        errno = EINVAL; return EOF;
    }
    if (index) inject = 1;
    return result;
}

int bhop_main(int argc, char **argv);
int main(void) {
    assert(mkdir("/tmp/bhop-recording-failure", 0777) == 0);
    assert(mkdir("/workspace/bhop-recording-failure", 0777) == 0);
    assert(setenv("DOLLY_BHOP_DIR", "/tmp/bhop-recording-failure", 1) == 0);
    assert(setenv("DOLLY_BHOP_RUN", "/workspace/bhop-recording-failure", 1) == 0);
    const unsigned control[] = {1, 2};
    FILE *file = fopen("/tmp/bhop-recording-failure/control", "wb"); assert(file);
    assert(fwrite(control, sizeof(control), 1, file) == 1 && fclose(file) == 0);
    request(1);
    char *argv[] = {"bhop", "--frames", "120", NULL};
    const int status = bhop_main(3, argv);
    if (status) return status;
    assert(failures == 6);
    char line[512];
    file = fopen("/tmp/bhop-recording-failure/response", "rb"); assert(file);
    assert(fgets(line, sizeof(line), file) && fclose(file) == 0);
    assert(strstr(line, "\"id\":2") && strstr(line, "\"recording_failures\":6"));
    file = fopen("/workspace/bhop-recording-failure/attempt-000001/frames.jsonl", "rb"); assert(file);
    unsigned rows = 0, previous = 0;
    while (fgets(line, sizeof(line), file)) {
        unsigned index, tick;
        assert(sscanf(line, "{\"index\":%u,\"tick\":%u", &index, &tick) == 2);
        assert(index == rows++ && strchr(line, '}') && strchr(line, '\n'));
        if (index == 1) assert(tick - previous >= 20);
        previous = tick;
        char name[128]; snprintf(name, sizeof(name), "/workspace/bhop-recording-failure/attempt-000001/frame-%06u.png", index);
        FILE *png = fopen(name, "rb"); assert(png);
        unsigned char signature[8];
        assert(fread(signature, sizeof(signature), 1, png) == 1);
        assert(memcmp(signature, "\211PNG\r\n\032\n", sizeof(signature)) == 0);
        assert(fseek(png, -8, SEEK_END) == 0 && fread(signature, sizeof(signature), 1, png) == 1 && fclose(png) == 0);
        assert(memcmp(signature, "IEND\256B\140\202", sizeof(signature)) == 0);
    }
    assert(rows > 2 && fclose(file) == 0);
    puts("bhop: recording failures recovered; committed frames and live agent responses survived");
    return 0;
}
