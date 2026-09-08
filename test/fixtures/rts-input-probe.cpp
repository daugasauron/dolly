#include "input.h"
#include <SDL.h>
#include <zlib.h>
#include <cassert>
#include <cerrno>
#include <cstdio>
#include <cstring>
#include <vector>
#include <unistd.h>

static const char *directory = "/tmp/dolly-sdl2/player";
static uint32_t frame;
static int right_clicks, left_clicks, key_presses, key_releases, drag_x, drag_y;

static std::vector<unsigned char> read_file(const char *name)
{
    FILE *file = std::fopen(name, "rb");
    assert(file);
    assert(std::fseek(file, 0, SEEK_END) == 0);
    const long length = std::ftell(file);
    assert(length >= 0 && length < 3 * 1024 * 1024);
    std::rewind(file);
    std::vector<unsigned char> bytes(length);
    assert(std::fread(bytes.data(), 1, length, file) == size_t(length));
    assert(std::fclose(file) == 0);
    return bytes;
}

static void submit(uint32_t id, std::initializer_list<RtsInputAction> actions)
{
    unlink("/tmp/dolly-sdl2/player/response");
    const RtsInputRequest header = { RTS_INPUT_MAGIC, RTS_INPUT_VERSION, id, uint32_t(actions.size()) };
    FILE *file = std::fopen("/tmp/dolly-sdl2/player/request", "wb");
    assert(file);
    assert(std::fwrite(&header, sizeof(header), 1, file) == 1);
    for (const auto &action : actions) assert(std::fwrite(&action, sizeof(action), 1, file) == 1);
    assert(std::fclose(file) == 0);
}

static void tick(SDL_Window *window, SDL_Renderer *renderer)
{
    dolly_rts_input(window, ++frame);
    SDL_Event event;
    while (SDL_PollEvent(&event)) {
        if (event.type == SDL_MOUSEBUTTONDOWN) {
            if (event.button.button == SDL_BUTTON_RIGHT) {
                assert(event.button.x == 12 && event.button.y == 34);
                ++right_clicks;
            } else if (event.button.button == SDL_BUTTON_LEFT) ++left_clicks;
        }
        if (event.type == SDL_MOUSEMOTION) { drag_x = event.motion.x; drag_y = event.motion.y; }
        if (event.type == SDL_KEYDOWN && event.key.keysym.scancode == SDL_SCANCODE_A) {
            assert(event.key.keysym.mod & KMOD_SHIFT);
            assert(SDL_GetKeyboardState(nullptr)[SDL_SCANCODE_A]);
            ++key_presses;
        }
        if (event.type == SDL_KEYUP && event.key.keysym.scancode == SDL_SCANCODE_A) ++key_releases;
    }
    assert(SDL_SetRenderDrawColor(renderer, 9, 19, 29, 255) == 0);
    assert(SDL_RenderClear(renderer) == 0);
    dolly_rts_frame(renderer, frame);
    SDL_RenderPresent(renderer);
    SDL_Delay(10);
}

static std::vector<unsigned char> finish(SDL_Window *window, SDL_Renderer *renderer, uint32_t id, uint32_t status)
{
    const Uint64 deadline = SDL_GetTicks64() + 4000;
    do {
        tick(window, renderer);
        assert(SDL_GetTicks64() < deadline);
    } while (access("/tmp/dolly-sdl2/player/response", F_OK));
    auto bytes = read_file("/tmp/dolly-sdl2/player/response");
    assert(bytes.size() >= sizeof(RtsInputResponse));
    RtsInputResponse header;
    std::memcpy(&header, bytes.data(), sizeof(header));
    assert(header.magic == RTS_INPUT_MAGIC && header.version == RTS_INPUT_VERSION);
    assert(header.id == id && header.status == status && header.frame == frame);
    assert(header.png_size == bytes.size() - sizeof(header));
    assert(!SDL_GetKeyboardState(nullptr)[SDL_SCANCODE_A]);
    assert((SDL_GetModState() & KMOD_SHIFT) == 0);
    assert(SDL_GetMouseState(nullptr, nullptr) == 0);
    return bytes;
}

static uint32_t be32(const unsigned char *bytes)
{
    return (uint32_t(bytes[0]) << 24) | (uint32_t(bytes[1]) << 16) | (uint32_t(bytes[2]) << 8) | bytes[3];
}

static void check_png(const std::vector<unsigned char> &response)
{
    const unsigned char *png = response.data() + sizeof(RtsInputResponse);
    const size_t length = response.size() - sizeof(RtsInputResponse);
    assert(length >= 8 && std::memcmp(png, "\x89PNG\r\n\x1a\n", 8) == 0);
    std::vector<unsigned char> compressed;
    bool header = false, end = false;
    for (size_t offset = 8; offset < length;) {
        assert(length - offset >= 12);
        const size_t size = be32(png + offset);
        assert(size <= length - offset - 12);
        const unsigned char *type = png + offset + 4, *data = type + 4;
        assert(crc32(0, type, size + 4) == be32(data + size));
        if (std::memcmp(type, "IHDR", 4) == 0) {
            assert(size == 13 && be32(data) == 800 && be32(data + 4) == 600 && data[8] == 8 && data[9] == 6);
            header = true;
        } else if (std::memcmp(type, "IDAT", 4) == 0) compressed.insert(compressed.end(), data, data + size);
        else if (std::memcmp(type, "IEND", 4) == 0) { assert(size == 0 && offset + 12 == length); end = true; }
        offset += size + 12;
    }
    assert(header && end);
    std::vector<unsigned char> raw((800 * 4 + 1) * 600);
    uLongf size = raw.size();
    assert(uncompress(raw.data(), &size, compressed.data(), compressed.size()) == Z_OK && size == raw.size());
    for (int y = 0; y < 600; ++y) {
        const unsigned char *row = raw.data() + y * (800 * 4 + 1);
        assert(row[0] == 0);
        for (int x = 0; x < 800; ++x) assert(std::memcmp(row + 1 + x * 4, "\x09\x13\x1d\xff", 4) == 0);
    }
}

int main()
{
    assert(SDL_setenv("DOLLY_RTS_PLAYER_DIR", directory, 1) == 0);
    assert(SDL_setenv("SDL_VIDEODRIVER", "dummy", 1) == 0);
    assert(SDL_Init(SDL_INIT_VIDEO) == 0);
    SDL_Window *window = SDL_CreateWindow("Offscreen RTS player", 0, 0, 800, 600, 0);
    assert(window);
    SDL_Renderer *renderer = SDL_CreateRenderer(window, -1, SDL_RENDERER_SOFTWARE);
    assert(renderer);
    RtsInputAction click = { RTS_CLICK, 12, 34, 0, 0, 3, 100, 0, {} };
    RtsInputAction key = { RTS_KEY, 0, 0, 0, 0, 0, 100, RTS_SHIFT, "A" };
    RtsInputAction drag = { RTS_DRAG, 10, 20, 100, 120, 1, 200, 0, {} };
    submit(1, { click, key, drag });
    check_png(finish(window, renderer, 1, 0));
    assert(right_clicks == 1 && left_clicks == 1 && key_presses == 1 && key_releases == 1);
    assert(drag_x == 100 && drag_y == 120);
    auto invalid = click;
    invalid.x = 800;
    submit(2, { click, invalid });
    finish(window, renderer, 2, EINVAL);
    assert(right_clicks == 1 && "the entire batch is validated before the first click");
    key.milliseconds = 2000;
    submit(3, { key });
    tick(window, renderer);
    assert(SDL_GetKeyboardState(nullptr)[SDL_SCANCODE_A]);
    FILE *cancel = std::fopen("/tmp/dolly-sdl2/player/cancel", "wb");
    assert(cancel);
    const uint32_t id = 3;
    assert(std::fwrite(&id, sizeof(id), 1, cancel) == 1 && std::fclose(cancel) == 0);
    finish(window, renderer, 3, ECANCELED);
    submit(4, {});
    check_png(finish(window, renderer, 4, 0));
    submit(6, { key });
    cancel = std::fopen("/tmp/dolly-sdl2/player/cancel", "wb");
    assert(cancel);
    const uint32_t before_start = 6;
    assert(std::fwrite(&before_start, sizeof(before_start), 1, cancel) == 1 && std::fclose(cancel) == 0);
    finish(window, renderer, 6, ECANCELED);
    assert(key_presses == 2 && "cancellation before acceptance must not press the key");
    SDL_SetWindowSize(window, 900, 600);
    submit(5, {});
    finish(window, renderer, 5, EINVAL);
    dolly_rts_input_close(frame);
    SDL_DestroyRenderer(renderer);
    SDL_DestroyWindow(window);
    SDL_Quit();
    puts("RTS-INPUT-PROBE-OK");
}
