// The spectator sees both views; neither Pi process receives this framebuffer.
// SPDX-License-Identifier: GPL-2.0-or-later
#include "graphics.h"

int main(int argc, char **argv)
{
    if (argc != 5) { std::fputs("usage: rts-viewer SCRATCH MATCH MODEL_1 MODEL_2\n", stderr); return 64; }
    auto font_bytes = read("/usr/share/fonts/IosevkaTerm-SemiBold.ttf", 16 * 1024 * 1024);
    if (font_bytes.empty() || !stbtt_InitFont(&font, font_bytes.data(), 0)) return 1;
    scale = stbtt_ScaleForPixelHeight(&font, 20);
    if (SDL_Init(SDL_INIT_VIDEO)) {
        std::fprintf(stderr, "rts-viewer: %s\n", SDL_GetError());
        return 1;
    }
    SDL_Window *window = SDL_CreateWindow("Dolly RTS Arena", 0, 0, 1600, 972, 0);
    renderer = window ? SDL_CreateRenderer(window, -1, SDL_RENDERER_SOFTWARE) : nullptr;
    if (!renderer) {
        std::fprintf(stderr, "rts-viewer: %s\n", SDL_GetError());
        SDL_DestroyWindow(window); SDL_Quit(); return 1;
    }
    SDL_Texture *views[2] = {};
    for (auto &view : views) view = SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGBA32,
        SDL_TEXTUREACCESS_STREAMING, 800, 600);
    bool running = views[0] && views[1];
    const int status = running ? 0 : 1;
    if (!running) std::fprintf(stderr, "rts-viewer: %s\n", SDL_GetError());
    while (running) {
        const auto replay = read(std::string(argv[1]) + "/replay-status", 4096);
        SDL_Event event;
        while (SDL_PollEvent(&event)) {
            if (event.type == SDL_QUIT || (event.type == SDL_KEYDOWN && event.key.keysym.sym == SDLK_ESCAPE)) running = false;
            if (!replay.empty() && event.type == SDL_KEYDOWN && !event.key.repeat) {
                const auto key = event.key.keysym.sym;
                const char *command = key == SDLK_SPACE ? "pause" : key == SDLK_EQUALS || key == SDLK_PLUS ? "faster" :
                    key == SDLK_MINUS ? "slower" : nullptr;
                const std::string path = std::string(argv[1]) + "/replay-control";
                if (command) if (FILE *file = std::fopen(path.c_str(), "a")) {
                    std::fprintf(file, "%s\n", command); std::fclose(file);
                }
            }
        }
        SDL_SetRenderDrawColor(renderer, 38, 38, 38, 255);
        SDL_RenderClear(renderer);
        for (int n = 0; n < 2; ++n) {
            const std::string player = "player" + std::to_string(n + 1);
            auto frame = read(std::string(argv[1]) + "/" + player + "/view.rgba", 16 + 800 * 600 * 4);
            uint32_t header[4] = {};
            if (frame.size() == 16 + 800 * 600 * 4) std::memcpy(header, frame.data(), 16);
            text("P" + std::to_string(n + 1) + " " + argv[n + 3] + " | frame " + std::to_string(header[0]),
                n * 800 + 10, 2, 780, 1, false);
            if (header[2] == 800 && header[3] == 600) {
                SDL_UpdateTexture(views[n], nullptr, frame.data() + 16, 800 * 4);
                SDL_Rect rectangle = { n * 800, 28, 800, 600 };
                SDL_RenderCopy(renderer, views[n], nullptr, &rectangle);
            }
            const auto trace = read(std::string(argv[2]) + "/" + player + ".txt", 128 * 1024);
            text(std::string(trace.begin(), trace.end()), n * 800 + 10, 638, 780, 13, true);
        }
        text(replay.empty() ? "Escape: stop match | Both games keep running while Pi thinks. Full histories are saved in /workspace/rts-matches." :
            std::string(replay.begin(), replay.end()),
            10, 944, 1580, 1, false);
        SDL_RenderPresent(renderer);
        if (glyphs.size() > 2048) {
            for (auto &entry : glyphs) SDL_DestroyTexture(entry.second.texture);
            glyphs.clear();
        }
        SDL_Delay(33);
    }
    for (auto &entry : glyphs) SDL_DestroyTexture(entry.second.texture);
    for (auto view : views) SDL_DestroyTexture(view);
    SDL_DestroyRenderer(renderer);
    SDL_DestroyWindow(window);
    SDL_Quit();
    return status;
}
