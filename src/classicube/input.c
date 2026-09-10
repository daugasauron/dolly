/* Timed SDL inputs and rendered observations, with no world queries for agents.
 * SPDX-License-Identifier: MIT */
#include "input.h"
#include "agent/control.h"
#include "Bitmap.h"
#include "Stream.h"
#include "String_.h"
#include "Input.h"
#include "World.h"
#include "Game.h"
#include "Formats.h"
#include "Deflate.h"
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#define MAGIC 0x31424343u
#define VERSION 1u
#define WIDTH 640
#define HEIGHT 480
enum { MOVE = 1, CLICK, KEY, DRAG, WAIT, LOOK };
typedef struct { uint32_t magic, version, id, count; } Request;
typedef struct {
    uint32_t kind;
    int32_t x, y, end_x, end_y;
    uint32_t button, milliseconds, modifiers;
    char key[32];
} Action;
typedef struct {
    uint32_t magic, version, id, status, frame, milliseconds, size;
    uint16_t x, y;
} Response;
_Static_assert(sizeof(Action) == 64 && sizeof(Response) == 32, "ClassiCube input layout");
extern int SDL_SendKeyboardKey(Uint8, SDL_Scancode);
extern int SDL_SendMouseMotion(SDL_Window *, Uint32, SDL_bool, int, int);
extern int SDL_SendMouseButton(SDL_Window *, Uint32, Uint8, Uint8);
extern void SDL_SetKeyboardFocus(SDL_Window *);
static Action actions[16];
static uint32_t id, count, index_, started, frame, last_view, last_save, human_serial;
static GameControl control;
static int active, released, capture, stopped, watched = 1;
static SDL_Window *window;
static uint8_t pixels[WIDTH * HEIGHT * 4], png[WIDTH * HEIGHT * 4 + 65536];

static const char *directory(void) { return getenv("DOLLY_CLASSICUBE_DIR"); }
static void path(char *out, const char *name) { snprintf(out, 1024, "%s/%s", directory(), name); }
static FILE *open_file(const char *name, const char *mode) {
    char filename[1024]; path(filename, name); return fopen(filename, mode);
}
static void remove_file(const char *name) { char filename[1024]; path(filename, name); unlink(filename); }
static int publish(const char *name, const void *header, size_t length, const void *data, size_t size) {
    char filename[1024], temporary[1030]; path(filename, name);
    snprintf(temporary, sizeof(temporary), "%s.tmp", filename);
    FILE *file = fopen(temporary, "wb");
    if (!file) return 0;
    int okay = fwrite(header, 1, length, file) == length;
    if (okay && size) okay = fwrite(data, 1, size, file) == size;
    if (fclose(file)) okay = 0;
    if (okay) okay = rename(temporary, filename) == 0;
    if (!okay) unlink(temporary);
    return okay;
}
static void response(uint32_t request, uint32_t status, uint32_t size) {
    int x, y; SDL_GetMouseState(&x, &y);
    Response result = { MAGIC, VERSION, request, status, frame, SDL_GetTicks(), size,
        (uint16_t)SDL_clamp(x, 0, WIDTH - 1), (uint16_t)SDL_clamp(y, 0, HEIGHT - 1) };
    if (!publish("response", &result, sizeof(result), png, size))
        fputs("ClassiCube: could not publish observation\n", stderr);
}
static void modifiers(uint32_t bits, Uint8 state) {
    if (bits & 1) SDL_SendKeyboardKey(state, SDL_SCANCODE_LSHIFT);
    if (bits & 2) SDL_SendKeyboardKey(state, SDL_SCANCODE_LCTRL);
    if (bits & 4) SDL_SendKeyboardKey(state, SDL_SCANCODE_LALT);
}
static void release(void) {
    if (!active) return;
    Action *a = &actions[index_];
    if (a->kind == KEY) {
        SDL_SendKeyboardKey(SDL_RELEASED, SDL_GetScancodeFromName(a->key));
        modifiers(a->modifiers, SDL_RELEASED);
    }
    if (a->button) SDL_SendMouseButton(window, 0, SDL_RELEASED, a->button);
}
static int valid(const Action *a) {
    if (a->kind < MOVE || a->kind > LOOK || a->milliseconds < 16 || a->milliseconds > 2000 || a->modifiers > 7) return 0;
    if (a->kind == LOOK) {
        if (a->x < -1600 || a->x > 1600 || a->y < -1600 || a->y > 1600) return 0;
    } else if (a->x < 0 || a->x >= WIDTH || a->y < 0 || a->y >= HEIGHT) return 0;
    if (a->end_x < 0 || a->end_x >= WIDTH || a->end_y < 0 || a->end_y >= HEIGHT) return 0;
    if (a->kind != DRAG && (a->end_x || a->end_y)) return 0;
    if ((a->kind == KEY || a->kind == WAIT) && (a->x || a->y)) return 0;
    if (a->kind == CLICK || a->kind == DRAG) { if (a->button < 1 || a->button > 3) return 0; }
    else if (a->button) return 0;
    if (a->kind == KEY) return memchr(a->key, 0, sizeof(a->key)) && SDL_GetScancodeFromName(a->key) != SDL_SCANCODE_UNKNOWN;
    if (a->modifiers) return 0;
    for (size_t i = 0; i < sizeof(a->key); ++i) if (a->key[i]) return 0;
    return 1;
}
static void start(void) {
    Action *a = &actions[index_]; started = SDL_GetTicks(); released = 0;
    if (a->kind == LOOK) SDL_SendMouseMotion(window, 0, SDL_TRUE, a->x, a->y);
    if (a->kind == MOVE || a->kind == CLICK || a->kind == DRAG) {
        /* Absolute coordinates select menus; gameplay clicks use the crosshair. */
        if (!Input.RawMode) SDL_SendMouseMotion(window, 0, SDL_FALSE, a->x, a->y);
    }
    if (a->button) SDL_SendMouseButton(window, 0, SDL_PRESSED, a->button);
    if (a->kind == KEY) {
        modifiers(a->modifiers, SDL_PRESSED);
        SDL_SendKeyboardKey(SDL_PRESSED, SDL_GetScancodeFromName(a->key));
    }
    FILE *log = open_file("inputs.log", "a");
    if (log) { fprintf(log, "id=%u index=%u frame=%u kind=%u x=%d y=%d button=%u duration=%u key=%s\n",
        id, index_, frame, a->kind, a->x, a->y, a->button, a->milliseconds, a->key); fclose(log); }
}
static void save_world(void) {
    if (!World.Blocks || !World.Loaded) return;
    static struct GZipState gzip;
    struct Stream file, compressed;
    cc_string filename = String_FromConst("maps/agent-world.cw.tmp");
    cc_result error = Stream_CreateFile(&file, &filename);
    if (!error) {
        GZip_MakeStream(&compressed, &gzip, &file);
        error = Cw_Save(&compressed);
        if (!error) error = compressed.Close(&compressed);
        cc_result closed = file.Close(&file);
        if (!error) error = closed;
    }
    if (!error && rename("maps/agent-world.cw.tmp", "maps/agent-world.cw")) error = errno;
    if (error) fprintf(stderr, "ClassiCube: world save failed (%u)\n", error);
}
static void controls(void) {
    FILE *file = open_file("control", "rb");
    GameControl next;
    if (file) {
        int okay = fread(&next, sizeof(next), 1, file) == 1 && fgetc(file) == EOF && next.owner <= CONTROL_AGENT;
        fclose(file);
        if (okay && next.generation != control.generation) {
            for (int scan = 1; scan < SDL_NUM_SCANCODES; ++scan) SDL_SendKeyboardKey(SDL_RELEASED, scan);
            for (int button = 1; button <= 5; ++button) SDL_SendMouseButton(window, 0, SDL_RELEASED, button);
            if (active || capture) response(id, ECANCELED, 0);
            active = capture = released = 0;
            control = next;
            if ((file = open_file("inputs.log", "a"))) {
                fprintf(file, "control=%u generation=%u frame=%u\n", control.owner, control.generation, frame); fclose(file);
            }
        }
    }
    for (int n = 0; n < 32; ++n) {
        char name[40]; snprintf(name, sizeof(name), "human.%u", human_serial + 1);
        file = open_file(name, "rb");
        if (!file) break;
        HumanBatch batch; HumanEvent events[256];
        int okay = fread(&batch, sizeof(batch), 1, file) == 1 && batch.count <= 256;
        if (okay) okay = fread(events, sizeof(HumanEvent), batch.count, file) == batch.count && fgetc(file) == EOF;
        fclose(file); remove_file(name); ++human_serial;
        if (!okay || control.owner != CONTROL_HUMAN || batch.generation != control.generation) continue;
        for (uint32_t i = 0; i < batch.count; ++i) {
            HumanEvent *e = &events[i];
            if (e->kind == HUMAN_KEY && e->a > 0 && e->a < SDL_NUM_SCANCODES)
                SDL_SendKeyboardKey(e->b ? SDL_PRESSED : SDL_RELEASED, e->a);
            if (e->kind == HUMAN_MOTION)
                SDL_SendMouseMotion(window, 0, e->c ? SDL_TRUE : SDL_FALSE, e->a, e->b);
            if (e->kind == HUMAN_BUTTON && e->a >= 1 && e->a <= 5)
                SDL_SendMouseButton(window, 0, e->b ? SDL_PRESSED : SDL_RELEASED, e->a);
            if (e->kind == HUMAN_WHEEL) {
                SDL_Event event = { .type = SDL_MOUSEWHEEL }; event.wheel.x = e->a; event.wheel.y = e->b; SDL_PushEvent(&event);
            }
            if (e->kind == HUMAN_TEXT && memchr(e->text, 0, sizeof(e->text))) {
                SDL_Event event = { .type = SDL_TEXTINPUT }; memcpy(event.text.text, e->text, sizeof(e->text)); SDL_PushEvent(&event);
            }
        }
    }
}
void DollyAgent_Poll(SDL_Window *target) {
    if (!directory() || stopped || !target) return;
    window = target; SDL_SetKeyboardFocus(window);
    controls();
    const char *watch = getenv("DOLLY_CLASSICUBE_WATCH");
    if (watch) {
        const char *player = getenv("DOLLY_CLASSICUBE_PLAYER");
        FILE *selected = fopen(watch, "r"); int number = 0;
        if (selected) { fscanf(selected, "%d", &number); fclose(selected); }
        const int visible = player && number == atoi(player);
        if (visible != watched) { watched = visible; Game_SetMinFrameTime(watched ? 1000.0f / 60 : 1000.0f / 15); }
    }
    if (getenv("DOLLY_CLASSICUBE_SEED") && World.Loaded && World.Blocks) {
        save_world(); stopped = 1;
        SDL_Event event = { .type = SDL_QUIT }; SDL_PushEvent(&event); return;
    }
    if (!getenv("DOLLY_CLASSICUBE_NET") && World.Loaded && World.Blocks && SDL_GetTicks() - last_save >= 5000) { save_world(); last_save = SDL_GetTicks(); }
    FILE *file = open_file("stop", "r");
    if (file) {
        fclose(file); release();
        if (active || capture) response(id, ECANCELED, 0);
        active = capture = 0; stopped = 1; if (!getenv("DOLLY_CLASSICUBE_NET")) save_world();
        SDL_Event event = { .type = SDL_QUIT }; SDL_PushEvent(&event); return;
    }
    uint32_t cancelled = 0;
    if ((file = open_file("cancel", "rb"))) {
        if (fread(&cancelled, 4, 1, file) != 1 || fgetc(file) != EOF) cancelled = 0;
        fclose(file); remove_file("cancel");
        if (cancelled && (active || capture) && cancelled == id) {
            release(); active = capture = released = 0; response(id, ECANCELED, 0); return;
        }
    }
    if ((file = open_file("request", "rb"))) {
        Request request = {0}; Action batch[16] = {0};
        int okay = fread(&request, sizeof(request), 1, file) == 1 && request.magic == MAGIC &&
            request.version == VERSION && request.id && request.count <= 16;
        if (okay) okay = fread(batch, sizeof(Action), request.count, file) == request.count && fgetc(file) == EOF;
        fclose(file); remove_file("request");
        uint32_t duration = 0;
        for (uint32_t i = 0; okay && i < request.count; ++i) { okay = valid(&batch[i]); duration += batch[i].milliseconds; }
        if (!okay || duration > 2000) response(request.id, EINVAL, 0);
        else if (request.count && control.owner != CONTROL_AGENT) response(request.id, EACCES, 0);
        else if (request.id == cancelled) response(request.id, ECANCELED, 0);
        else if (active || capture) response(request.id, EBUSY, 0);
        else {
            id = request.id; count = request.count; index_ = 0; memcpy(actions, batch, sizeof(actions));
            active = count != 0; capture = !active;
            if (active) start();
        }
    }
    if (!active) return;
    /* Consume a release before changing the held state for the next action. */
    if (released) {
        if (++index_ == count) { active = released = 0; capture = 1; return; }
        start();
    }
    Action *a = &actions[index_]; uint32_t elapsed = SDL_GetTicks() - started;
    if (a->kind == DRAG && !Input.RawMode) {
        double fraction = elapsed >= a->milliseconds ? 1.0 : (double)elapsed / a->milliseconds;
        SDL_SendMouseMotion(window, 0, SDL_FALSE, a->x + (a->end_x - a->x) * fraction, a->y + (a->end_y - a->y) * fraction);
    }
    if (elapsed >= a->milliseconds) { release(); released = 1; }
}
static cc_result write_png(struct Stream *stream, const cc_uint8 *data, cc_uint32 size, cc_uint32 *written) {
    if (size > stream->meta.mem.left) return ENOSPC;
    memcpy(stream->meta.mem.cur, data, size); stream->meta.mem.cur += size; stream->meta.mem.left -= size;
    *written = size; return 0;
}
void DollyAgent_Frame(struct Bitmap *bitmap) {
    if (!directory() || stopped) return;
    ++frame;
    static int previous_raw = -1, ready;
    if (previous_raw != Input.RawMode) { previous_raw = Input.RawMode; publish("relative", Input.RawMode ? "1" : "0", 1, NULL, 0); }
    if (!ready && Input.RawMode && World.Blocks) { publish("ready", "1", 1, NULL, 0); ready = 1; }

    if (bitmap->width != WIDTH || bitmap->height != HEIGHT) {
        if (capture) response(id, EINVAL, 0);
        capture = 0; return;
    }
    uint32_t now = SDL_GetTicks();
    if (!capture && (!watched || now - last_view < 16)) return;
    for (int i = 0; i < WIDTH * HEIGHT; ++i) {
        BitmapCol c = bitmap->scan0[i];
        pixels[i * 4] = BitmapCol_R(c); pixels[i * 4 + 1] = BitmapCol_G(c);
        pixels[i * 4 + 2] = BitmapCol_B(c); pixels[i * 4 + 3] = 255;
    }
    uint32_t header[] = { frame, now, WIDTH, HEIGHT };
    publish("view.rgba", header, sizeof(header), pixels, sizeof(pixels)); last_view = now;
    if (capture) {
        struct Stream output; Stream_ReadonlyMemory(&output, png, sizeof(png));
        output.Write = write_png;
        cc_result result = Png_Encode(bitmap, &output, NULL, false, NULL);
        response(id, result ? EIO : 0, result ? 0 : sizeof(png) - output.meta.mem.left); capture = 0;
    }
}
