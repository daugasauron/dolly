/* Filesystem input queue and framebuffer recordings. No game state is visible here. SPDX-License-Identifier: MIT */
#define _POSIX_C_SOURCE 200809L
#include "input.h"
#include "timeline.h"
#include "../../game-agent/control.h"
#include <raylib.h>
#include <dirent.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

enum { WIDTH = 960, HEIGHT = 540 };
static const char *directory, *run;
static void (*deliver)(void *, const dolly_input_event *);
static void *receiver;
static GameControl control;
static bh_request request;
static bh_action actions[BH_INPUT_ACTIONS];
static uint32_t tick, frame, held, action, action_tick, human_serial;
static uint32_t attempt, attempt_tick, sample, last_sample_tick, first_sample;
static int pending, complete, result, recording, force_sample;
static char attempt_path[1024];
static double started;

static double now(void) {
    struct timespec value; clock_gettime(CLOCK_MONOTONIC, &value);
    return value.tv_sec * 1000.0 + value.tv_nsec / 1e6;
}
static void path(char *out, const char *name) { snprintf(out, 1024, "%s/%s", directory, name); }
static FILE *open_file(const char *name, const char *mode) { char p[1024]; path(p, name); return fopen(p, mode); }
static void remove_file(const char *name) { char p[1024]; path(p, name); unlink(p); }
static int publish(const char *name, const void *header, size_t size, const void *data, size_t length) {
    char target[1024], temporary[1030]; path(target, name); snprintf(temporary, sizeof(temporary), "%s.tmp", target);
    FILE *file = fopen(temporary, "wb"); if (!file) return 0;
    int okay = fwrite(header, 1, size, file) == size && (!length || fwrite(data, 1, length, file) == length);
    if (fclose(file)) okay = 0;
    if (okay) okay = !rename(temporary, target);
    if (!okay) unlink(temporary);
    return okay;
}
static void log_input(const dolly_input_event *event) {
    if (!recording) return;
    char name[1100]; snprintf(name, sizeof(name), "%s/inputs.jsonl", attempt_path);
    FILE *file = fopen(name, "a"); if (!file) return;
    fprintf(file, "{\"tick\":%u,\"request\":%u,\"type\":%u,\"action\":%d,\"dx_milli\":%d,\"dy_milli\":%d,\"code\":\"%.*s\"}\n",
        tick - attempt_tick, pending ? request.id : 0, event->type, (int32_t)event->action,
        (int32_t)event->width_css_px, (int32_t)event->height_css_px, event->code_length, event->data + event->key_length);
    fclose(file);
}
static void emit(dolly_input_event event) { log_input(&event); deliver(receiver, &event); }
static void key(const char *code, int pressed) {
    dolly_input_event event = {.type = DOLLY_INPUT_EVENT_KEY, .action = pressed ? DOLLY_KEY_ACTION_PRESS : DOLLY_KEY_ACTION_RELEASE};
    event.code_length = strlen(code); memcpy(event.data, code, event.code_length); emit(event);
}
static void set_keys(uint32_t next) {
    static const char *codes[] = {"KeyW", "KeyA", "KeyS", "KeyD", "Space", "ArrowLeft", "ArrowRight", "KeyR"};
    for (int n = 0; n < 8; ++n) if ((held ^ next) & (1u << n)) key(codes[n], !!(next & (1u << n)));
    held = next;
}
static void new_attempt(void) {
    ++attempt; sample = 0; attempt_tick = tick; recording = force_sample = 1;
    snprintf(attempt_path, sizeof(attempt_path), "%s/attempt-%06u", run, attempt);
    if (mkdir(attempt_path, 0777) && errno != EEXIST) { recording = 0; return; }
    char info[160]; const int size = snprintf(info, sizeof(info), "{\"attempt\":%u,\"tick\":%u,\"sample_ticks\":10}\n", attempt, tick);
    publish("attempt.json", info, size, NULL, 0);
}
static void finish(int status) { set_keys(0); result = status; complete = 1; }

int bh_agent_open(void (*input)(void *, const dolly_input_event *), void *context) {
    directory = getenv("DOLLY_BHOP_DIR"); run = getenv("DOLLY_BHOP_RUN");
    if (!directory || !run || directory[0] != '/' || run[0] != '/') return 0;
    DIR *saved = opendir(run);
    if (saved) {
        struct dirent *entry;
        while ((entry = readdir(saved))) {
            unsigned int number; char extra;
            if (strlen(entry->d_name) == 14 && sscanf(entry->d_name, "attempt-%6u%c", &number, &extra) == 1 && number > attempt) attempt = number;
        }
        closedir(saved);
    }
    deliver = input; receiver = context; started = now();
    publish("relative", "1", 1, NULL, 0); publish("ready", "1", 1, NULL, 0);
    return 1;
}
int bh_agent_poll(void) {
    FILE *file = open_file("stop", "r"); if (file) { fclose(file); return 1; }
    file = open_file("control", "rb"); GameControl next;
    if (file) {
        int okay = fread(&next, sizeof(next), 1, file) == 1 && fgetc(file) == EOF && next.owner <= CONTROL_AGENT;
        fclose(file);
        if (okay && next.generation != control.generation) {
            if (pending) finish(2);
            set_keys(0); control = next;
            if (control.owner != CONTROL_AGENT) recording = 0;
            else new_attempt();
            emit((dolly_input_event){.type = DOLLY_INPUT_EVENT_POINTER_CAPTURE, .action = control.owner != CONTROL_PAUSED});
        }
    }
    for (int n = 0; n < 32; ++n) {
        char name[64]; snprintf(name, sizeof(name), "human.%u", human_serial + 1);
        file = open_file(name, "rb"); if (!file) break;
        HumanBatch batch; HumanEvent events[256];
        int okay = fread(&batch, sizeof(batch), 1, file) == 1 && batch.count <= 256 &&
            fread(events, sizeof(HumanEvent), batch.count, file) == batch.count && fgetc(file) == EOF;
        fclose(file); remove_file(name); ++human_serial;
        if (!okay || control.owner != CONTROL_HUMAN || batch.generation != control.generation) continue;
        for (uint32_t i = 0; i < batch.count; ++i) {
            HumanEvent *e = events + i;
            if (e->kind == HUMAN_KEY && memchr(e->text, 0, sizeof(e->text))) {
                char code[32]; const char *name = e->text;
                if (strlen(name) == 1 && name[0] >= 'A' && name[0] <= 'Z') { snprintf(code, sizeof(code), "Key%c", name[0]); name = code; }
                else if (strlen(name) == 1 && name[0] >= '0' && name[0] <= '9') { snprintf(code, sizeof(code), "Digit%c", name[0]); name = code; }
                else if (!strcmp(name, "Left")) name = "ArrowLeft";
                else if (!strcmp(name, "Right")) name = "ArrowRight";
                key(name, e->b);
            } else if (e->kind == HUMAN_MOTION && e->c) emit((dolly_input_event){.type = DOLLY_INPUT_EVENT_POINTER_MOTION,
                .width_css_px = e->a * 1000, .height_css_px = e->b * 1000});
            else if (e->kind == HUMAN_WHEEL) emit((dolly_input_event){.type = DOLLY_INPUT_EVENT_SCROLL, .action = e->b});
        }
    }
    file = open_file("cancel", "rb");
    if (file) { uint32_t id = 0; fread(&id, sizeof(id), 1, file); fclose(file); remove_file("cancel"); if (pending && id == request.id) finish(2); }
    if (pending) return 0;
    file = open_file("request", "rb"); if (!file) return 0;
    memset(&request, 0, sizeof(request));
    int okay = fread(&request, sizeof(request), 1, file) == 1 && request.magic == BH_INPUT_MAGIC && request.version == BH_INPUT_VERSION &&
        request.id && !request.reserved && request.count <= BH_INPUT_ACTIONS &&
        fread(actions, sizeof(bh_action), request.count, file) == request.count && fgetc(file) == EOF && bh_actions_valid(actions, request.count);
    fclose(file); remove_file("request"); pending = 1; complete = 0; result = 0; action = action_tick = 0; first_sample = sample;
    if (!okay) finish(1);
    else if (control.owner != CONTROL_AGENT || request.generation != control.generation) finish(3);
    else if (!request.count) finish(0);
    return 0;
}
void bh_agent_tick(void) {
    if (pending && !complete) {
        bh_action *a = actions + action;
        if (!action_tick) {
            if ((a->keys & BH_RESTART) && !(held & BH_RESTART)) { new_attempt(); first_sample = 0; }
            set_keys(a->keys);
            if (a->wheel) emit((dolly_input_event){.type = DOLLY_INPUT_EVENT_SCROLL, .action = a->wheel});
        }
        const int32_t x = bh_mouse_step(a->mouse_x, action_tick, a->ticks), y = bh_mouse_step(a->mouse_y, action_tick, a->ticks);
        if (x || y) emit((dolly_input_event){.type = DOLLY_INPUT_EVENT_POINTER_MOTION, .width_css_px = x, .height_css_px = y});
        if (++action_tick == a->ticks) { action_tick = 0; if (++action == request.count) complete = 1; }
    }
    ++tick;
}
int bh_agent_capture_due(void) { return complete || (recording && (force_sample || tick - last_sample_tick >= 10)); }
int bh_agent_frame(const void *pixels) {
    uint32_t header[] = {++frame, (uint32_t)(now() - started), WIDTH, HEIGHT};
    if (!publish("view.rgba", header, sizeof(header), pixels, WIDTH * HEIGHT * 4)) return 0;
    if (!bh_agent_capture_due()) return 1;
    Image image = {(void *)pixels, WIDTH, HEIGHT, 1, PIXELFORMAT_UNCOMPRESSED_R8G8B8A8};
    int size = 0; unsigned char *png = ExportImageToMemory(image, ".png", &size);
    if (!png || size <= 0) { MemFree(png); return 0; }
    if (recording && (force_sample || tick != last_sample_tick)) {
        char name[1100]; snprintf(name, sizeof(name), "%s/frame-%06u.png", attempt_path, sample);
        FILE *file = fopen(name, "wb");
        if (!file) { MemFree(png); return 0; }
        int okay = fwrite(png, 1, size, file) == (size_t)size; if (fclose(file)) okay = 0;
        if (!okay) { MemFree(png); return 0; }
        snprintf(name, sizeof(name), "%s/frames.jsonl", attempt_path); file = fopen(name, "a");
        if (!file) { MemFree(png); return 0; }
        fprintf(file, "{\"index\":%u,\"tick\":%u,\"milliseconds\":%u,\"wall_ms\":%u}\n", sample++, tick - attempt_tick, (tick - attempt_tick) * 10, header[1]);
        fclose(file); force_sample = 0; last_sample_tick = tick;
    }
    if (pending && complete) {
        set_keys(0);
        char response[256];
        const int length = snprintf(response, sizeof(response), "{\"version\":1,\"id\":%u,\"status\":%d,\"frame\":%u,\"milliseconds\":%u,\"attempt\":%u,\"first\":%u,\"last\":%u}\n",
            request.id, result, frame, header[1], attempt, first_sample, sample ? sample - 1 : 0);
        if (!publish("response.png", png, size, NULL, 0) || !publish("response", response, length, NULL, 0)) { MemFree(png); return 0; }
        pending = complete = 0;
    }
    MemFree(png); return 1;
}
void bh_agent_close(void) { set_keys(0); recording = 0; publish("ended", "Game closed", 11, NULL, 0); }
