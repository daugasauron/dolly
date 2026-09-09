// Player-local SDL input and screenshots. SPDX-License-Identifier: GPL-2.0-or-later
#include "input.h"
#include "arena.h"
#include <SDL.h>
#include <zlib.h>
#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <unordered_map>
#include <vector>
#include <unistd.h>

// Pinned SDL2 event entry points: update SDL's held-input state as well as its
// event queue. SDL_PushEvent alone does not update that state.
extern "C" {
int SDL_SendKeyboardKey(Uint8 state, SDL_Scancode code);
int SDL_SendMouseMotion(SDL_Window *, Uint32 mouse, SDL_bool relative, int x, int y);
int SDL_SendMouseButton(SDL_Window *, Uint32 mouse, Uint8 state, Uint8 button);
void SDL_SetKeyboardFocus(SDL_Window *);
}

namespace {
const char *directory() { return std::getenv("DOLLY_RTS_PLAYER_DIR"); }
std::string path(const char *name) { return std::string(directory()) + "/" + name; }
RtsInputAction actions[RTS_INPUT_MAX_ACTIONS];
uint32_t request_id, action_count, action_index, action_started, last_view;
bool running, released, capture_pending;
SDL_Window *input_window;
SDL_Scancode held_key = SDL_SCANCODE_UNKNOWN;
uint32_t held_modifiers, held_button;

void send_modifiers(uint32_t bits, Uint8 state)
{
    if (bits & RTS_SHIFT) SDL_SendKeyboardKey(state, SDL_SCANCODE_LSHIFT);
    if (bits & RTS_CONTROL) SDL_SendKeyboardKey(state, SDL_SCANCODE_LCTRL);
    if (bits & RTS_ALT) SDL_SendKeyboardKey(state, SDL_SCANCODE_LALT);
}

void release_inputs()
{
    if (held_key != SDL_SCANCODE_UNKNOWN) SDL_SendKeyboardKey(SDL_RELEASED, held_key);
    send_modifiers(held_modifiers, SDL_RELEASED);
    if (held_button) SDL_SendMouseButton(input_window, 0, SDL_RELEASED, held_button);
    held_key = SDL_SCANCODE_UNKNOWN;
    held_modifiers = held_button = 0;
}

bool publish(const char *name, const void *header, size_t header_size, const void *bytes = nullptr, size_t size = 0)
{
    const std::string destination = path(name), temporary = destination + ".tmp";
    FILE *file = std::fopen(temporary.c_str(), "wb");
    if (!file) return false;
    bool okay = std::fwrite(header, 1, header_size, file) == header_size;
    if (okay && size) okay = std::fwrite(bytes, 1, size, file) == size;
    if (std::fclose(file)) okay = false;
    if (okay) okay = std::rename(temporary.c_str(), destination.c_str()) == 0;
    if (!okay) unlink(temporary.c_str());
    return okay;
}

void response(uint32_t id, uint32_t status, uint32_t frame, const std::vector<unsigned char> &png = {})
{
    int x = 0, y = 0;
    SDL_GetMouseState(&x, &y);
    const RtsInputResponse header = { RTS_INPUT_MAGIC, RTS_INPUT_VERSION, id, status,
        frame, SDL_GetTicks(), static_cast<uint32_t>(png.size()), static_cast<uint16_t>(x), static_cast<uint16_t>(y) };
    if (!publish("response", &header, sizeof(header), png.data(), png.size()))
        std::fprintf(stderr, "RTS: cannot publish input response: %s\n", std::strerror(errno));
    if (FILE *log = std::fopen(path("inputs.log").c_str(), "a")) {
        std::fprintf(log, "response id=%u frame=%u ms=%u status=%u\n", id, frame, header.milliseconds, status);
        std::fclose(log);
    }
}

bool valid_action(const RtsInputAction &a)
{
    if (a.kind < RTS_MOVE || a.kind > RTS_WAIT || a.milliseconds < 16 || a.milliseconds > RTS_INPUT_MAX_MILLISECONDS)
        return false;
    if (a.x >= 800 || a.y >= 600 || a.end_x >= 800 || a.end_y >= 600 || a.modifiers > 7) return false;
    if (a.kind != RTS_DRAG && (a.end_x || a.end_y)) return false;
    if ((a.kind == RTS_KEY || a.kind == RTS_WAIT) && (a.x || a.y)) return false;
    if (a.kind == RTS_CLICK || a.kind == RTS_DRAG) {
        if (a.button < 1 || a.button > 3) return false;
    } else if (a.button) return false;
    if (a.kind == RTS_KEY) {
        return std::memchr(a.key, 0, sizeof(a.key)) && SDL_GetScancodeFromName(a.key) != SDL_SCANCODE_UNKNOWN;
    }
    if (a.modifiers) return false;
    for (char byte : a.key) if (byte) return false;
    return true;
}

void start_action(uint32_t now, uint32_t frame)
{
    action_started = now;
    released = false;
    const RtsInputAction &a = actions[action_index];
    if (FILE *log = std::fopen(path("inputs.log").c_str(), "a")) {
        std::fprintf(log, "action id=%u index=%u frame=%u ms=%u kind=%u x=%u y=%u end_x=%u end_y=%u button=%u duration=%u modifiers=%u key=%s\n",
            request_id, action_index, frame, now, a.kind, a.x, a.y, a.end_x, a.end_y,
            a.button, a.milliseconds, a.modifiers, a.key);
        std::fclose(log);
    }
    if (a.kind == RTS_MOVE || a.kind == RTS_CLICK || a.kind == RTS_DRAG)
        SDL_SendMouseMotion(input_window, 0, SDL_FALSE, a.x, a.y);
    if (a.kind == RTS_CLICK || a.kind == RTS_DRAG) {
        held_button = a.button;
        SDL_SendMouseButton(input_window, 0, SDL_PRESSED, held_button);
    }
    if (a.kind == RTS_KEY) {
        held_modifiers = a.modifiers;
        send_modifiers(held_modifiers, SDL_PRESSED);
        held_key = SDL_GetScancodeFromName(a.key);
        SDL_SendKeyboardKey(SDL_PRESSED, held_key);
    }
}

void append_be32(std::vector<unsigned char> &bytes, uint32_t value)
{
    for (int shift = 24; shift >= 0; shift -= 8) bytes.push_back(value >> shift);
}

void png_chunk(std::vector<unsigned char> &png, const char *type, const unsigned char *bytes, size_t size)
{
    append_be32(png, size);
    const size_t begin = png.size();
    png.insert(png.end(), type, type + 4);
    if (size) png.insert(png.end(), bytes, bytes + size);
    append_be32(png, crc32(0, png.data() + begin, size + 4));
}

std::vector<unsigned char> encode_png(const std::vector<unsigned char> &pixels)
{
    // The game's palette fits in 256 opaque colors. Preserve exact pixels,
    // with an RGBA fallback for other renderers; never resize model observations.
    std::unordered_map<uint32_t, unsigned char> colors;
    std::vector<unsigned char> palette, indices(800 * 600);
    bool indexed = true;
    for (size_t i = 0; i < indices.size(); ++i) {
        uint32_t color;
        std::memcpy(&color, pixels.data() + i * 4, 4);
        const auto found = colors.find(color);
        if (pixels[i * 4 + 3] != 255 || (found == colors.end() && colors.size() == 256)) {
            indexed = false;
            break;
        }
        if (found != colors.end()) indices[i] = found->second;
        else {
            indices[i] = static_cast<unsigned char>(colors.size());
            colors.emplace(color, indices[i]);
            palette.insert(palette.end(), pixels.data() + i * 4, pixels.data() + i * 4 + 3);
        }
    }
    const size_t pitch = 800 * (indexed ? 1 : 4);
    const auto &source = indexed ? indices : pixels;
    std::vector<unsigned char> filtered((pitch + 1) * 600, 0);
    for (size_t y = 0; y < 600; ++y)
        std::memcpy(filtered.data() + y * (pitch + 1) + 1, source.data() + y * pitch, pitch);
    uLongf compressed_size = compressBound(filtered.size());
    std::vector<unsigned char> compressed(compressed_size);
    if (compress2(compressed.data(), &compressed_size, filtered.data(), filtered.size(), Z_DEFAULT_COMPRESSION) != Z_OK) return {};
    std::vector<unsigned char> png = { 137, 80, 78, 71, 13, 10, 26, 10 };
    std::vector<unsigned char> header;
    append_be32(header, 800);
    append_be32(header, 600);
    header.insert(header.end(), { 8, static_cast<unsigned char>(indexed ? 3 : 6), 0, 0, 0 });
    png_chunk(png, "IHDR", header.data(), header.size());
    if (indexed) png_chunk(png, "PLTE", palette.data(), palette.size());
    png_chunk(png, "IDAT", compressed.data(), compressed_size);
    png_chunk(png, "IEND", nullptr, 0);
    return png;
}
}

void dolly_rts_input(SDL_Window *window, uint32_t frame)
{
    if (!directory()) return;
    input_window = window;
    SDL_SetKeyboardFocus(window);
    if (dolly_rts_replay_player()) {
        if (!frame) return;
        struct Recorded { uint32_t frame, milliseconds; RtsInputAction action; };
        static std::vector<Recorded> records;
        static size_t index;
        static bool loaded;
        if (!loaded) {
            FILE *file = std::fopen(path("replay-inputs").c_str(), "rb");
            if (!file) std::exit(65);
            Recorded record;
            while (std::fread(&record, sizeof(record), 1, file) == 1) {
                if (!valid_action(record.action) || records.size() >= 100000) std::exit(65);
                records.push_back(record);
            }
            std::fclose(file);
            loaded = true;
        }
        if (released) { running = released = false; ++index; }
        if (!running && index < records.size() && records[index].frame <= frame) {
            actions[action_index = 0] = records[index].action;
            running = true;
            start_action(records[index].milliseconds, frame);
        }
        if (!running) return;
        const auto &a = actions[0];
        const uint32_t now = dolly_rts_replay_milliseconds(frame);
        const uint32_t elapsed = now > action_started ? now - action_started : 0;
        if (a.kind == RTS_DRAG) {
            const double fraction = elapsed >= a.milliseconds ? 1.0 : double(elapsed) / a.milliseconds;
            SDL_SendMouseMotion(window, 0, SDL_FALSE,
                int(a.x + (double(a.end_x) - a.x) * fraction), int(a.y + (double(a.end_y) - a.y) * fraction));
        }
        if (elapsed >= a.milliseconds) { release_inputs(); released = true; }
        return;
    }
    uint32_t cancelled = 0;
    if (FILE *file = std::fopen(path("cancel").c_str(), "rb")) {
        const bool valid = std::fread(&cancelled, sizeof(cancelled), 1, file) == 1 && std::fgetc(file) == EOF;
        std::fclose(file);
        unlink(path("cancel").c_str());
        if (!valid) cancelled = 0;
        if (valid && (running || capture_pending) && cancelled == request_id) {
            release_inputs();
            running = released = capture_pending = false;
            response(request_id, ECANCELED, frame);
            return; // Consume releases before accepting a concurrently queued replacement.
        }
    }
    if (FILE *file = std::fopen(path("request").c_str(), "rb")) {
        RtsInputRequest header = {};
        RtsInputAction received[RTS_INPUT_MAX_ACTIONS] = {};
        bool valid = std::fread(&header, sizeof(header), 1, file) == 1 &&
            header.magic == RTS_INPUT_MAGIC && header.version == RTS_INPUT_VERSION && header.id &&
            header.count <= RTS_INPUT_MAX_ACTIONS;
        if (valid) valid = std::fread(received, sizeof(RtsInputAction), header.count, file) == header.count && std::fgetc(file) == EOF;
        std::fclose(file);
        unlink(path("request").c_str());
        uint32_t duration = 0;
        if (valid) for (uint32_t i = 0; i < header.count; ++i) {
            if (!valid_action(received[i])) { valid = false; break; }
            duration += received[i].milliseconds;
        }
        if (!valid || duration > RTS_INPUT_MAX_MILLISECONDS) response(header.id, EINVAL, frame);
        else if (header.id == cancelled) response(header.id, ECANCELED, frame);
        else if (running || capture_pending) response(header.id, EBUSY, frame);
        else {
            request_id = header.id;
            action_count = header.count;
            action_index = 0;
            std::memcpy(actions, received, sizeof(actions));
            running = action_count > 0;
            capture_pending = !running;
            if (running) start_action(SDL_GetTicks(), frame);
        }
    }
    if (!running) return;
    // Let the game consume button/key release at the old pointer position
    // before the next action changes SDL's live state. Its widgets read both
    // queued events and current state when committing a click.
    if (released) {
        if (++action_index == action_count) {
            running = released = false;
            capture_pending = true;
            return;
        }
        start_action(SDL_GetTicks(), frame);
    }
    const RtsInputAction &a = actions[action_index];
    const uint32_t now = SDL_GetTicks(), elapsed = now - action_started;
    if (a.kind == RTS_DRAG) {
        const double fraction = elapsed >= a.milliseconds ? 1.0 : double(elapsed) / a.milliseconds;
        SDL_SendMouseMotion(window, 0, SDL_FALSE,
            int(a.x + (double(a.end_x) - a.x) * fraction), int(a.y + (double(a.end_y) - a.y) * fraction));
    }
    if (elapsed < a.milliseconds) return;
    release_inputs();
    released = true;
}

void dolly_rts_frame(SDL_Renderer *renderer, uint32_t frame)
{
    if (!directory()) return;
    const uint32_t now = SDL_GetTicks();
    if (!capture_pending && now - last_view < 50 && !dolly_rts_replay_eof()) return;
    int width = 0, height = 0;
    if (SDL_GetRendererOutputSize(renderer, &width, &height) != 0 || width != 800 || height != 600) {
        if (capture_pending) response(request_id, EINVAL, frame);
        capture_pending = false;
        return;
    }
    std::vector<unsigned char> pixels(800 * 600 * 4);
    if (SDL_RenderReadPixels(renderer, nullptr, SDL_PIXELFORMAT_RGBA32, pixels.data(), 800 * 4) != 0) {
        if (capture_pending) response(request_id, EIO, frame);
        capture_pending = false;
        return;
    }
    // The spectator consumes only rendered pixels, not engine data. Its file
    // has four little-endian uint32 words followed by width*height RGBA bytes.
    const uint32_t header[] = { frame, now, 800, 600 };
    if (!publish("view.rgba", header, sizeof(header), pixels.data(), pixels.size()))
        std::fprintf(stderr, "RTS: cannot publish player view: %s\n", std::strerror(errno));
    last_view = now;
    if (capture_pending) {
        const auto png = encode_png(pixels);
        response(request_id, png.empty() ? EIO : 0, frame, png);
        capture_pending = false;
    }
}

void dolly_rts_input_close(uint32_t frame)
{
    if (!directory()) return;
    release_inputs();
    if (running || capture_pending) response(request_id, ECANCELED, frame);
    running = released = capture_pending = false;
}
