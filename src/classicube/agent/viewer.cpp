// SPDX-License-Identifier: GPL-2.0-or-later
#include "../../rts/spectator/graphics.h"

int main(int argc, char **argv) {
    if (argc != 4) return 64;
    auto font_bytes = read("/usr/share/fonts/IosevkaTerm-SemiBold.ttf", 16 * 1024 * 1024);
    if (font_bytes.empty() || !stbtt_InitFont(&font, font_bytes.data(), 0) || SDL_Init(SDL_INIT_VIDEO)) return 1;
    scale = stbtt_ScaleForPixelHeight(&font, 20);
    SDL_Window *window = SDL_CreateWindow("ClassiCube / Agent World", 0, 0, 1280, 960, 0);
    renderer = window ? SDL_CreateRenderer(window, -1, SDL_RENDERER_SOFTWARE) : nullptr;
    SDL_Texture *view = renderer ? SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGBA32, SDL_TEXTUREACCESS_STREAMING, 640, 480) : nullptr;
    if (!view) { std::fprintf(stderr, "ClassiCube viewer: %s\n", SDL_GetError()); SDL_Quit(); return 1; }
    SDL_SetRenderDrawBlendMode(renderer, SDL_BLENDMODE_BLEND);
    bool running = true, panel = true, entering = false;
    int scroll = 0;
    std::string prompt;
    uint32_t last_frame = 0;
    const std::string scratch(argv[1]), run(argv[2]);
    const auto contents = [](const std::string &name) { auto bytes = read(name, 128 * 1024); return std::string(bytes.begin(), bytes.end()); };
    while (running) {
        SDL_Event event;
        while (SDL_PollEvent(&event)) {
            if (event.type == SDL_QUIT) running = false;
            if (event.type == SDL_KEYDOWN && !event.key.repeat) {
                const auto key = event.key.keysym.sym;
                if (entering) {
                    if (key == SDLK_ESCAPE) { entering = false; SDL_StopTextInput(); }
                    if (key == SDLK_BACKSPACE && !prompt.empty()) {
                        size_t end = prompt.size() - 1;
                        while (end && (static_cast<unsigned char>(prompt[end]) & 0xc0) == 0x80) --end;
                        prompt.resize(end);
                    }
                    if (key == SDLK_RETURN && !prompt.empty()) {
                        const auto temporary = scratch + "/prompt.tmp";
                        if (FILE *file = std::fopen(temporary.c_str(), "wb")) {
                            const bool okay = std::fwrite(prompt.data(), 1, prompt.size(), file) == prompt.size();
                            const int closed = std::fclose(file);
                            if (okay && !closed) std::rename(temporary.c_str(), (scratch + "/prompt").c_str());
                        }
                        prompt.clear(); entering = false; SDL_StopTextInput();
                    }
                } else {
                    if (key == SDLK_ESCAPE) running = false;
                    if (key == SDLK_TAB) panel = !panel;
                    if (key == SDLK_RETURN) { entering = true; SDL_StartTextInput(); }
                    if (key == SDLK_PAGEUP) scroll += 800;
                    if (key == SDLK_PAGEDOWN) scroll = std::max(0, scroll - 800);
                    if (key == SDLK_END) scroll = 0;
                }
            }
            if (entering && event.type == SDL_TEXTINPUT && prompt.size() + std::strlen(event.text.text) <= 4096) prompt += event.text.text;
            if (event.type == SDL_MOUSEWHEEL && panel) scroll = std::max(0, scroll + event.wheel.y * 160);
            if (event.type == SDL_MOUSEBUTTONUP && event.button.y < 50 && event.button.x > 1130) panel = !panel;
        }
        auto bytes = read(scratch + "/view.rgba", 16 + 640 * 480 * 4);
        uint32_t header[4] = {};
        if (bytes.size() == 16 + 640 * 480 * 4) std::memcpy(header, bytes.data(), 16);
        if (header[2] == 640 && header[3] == 480 && header[0] != last_frame) {
            SDL_UpdateTexture(view, nullptr, bytes.data() + 16, 640 * 4); last_frame = header[0];
        }
        SDL_SetRenderDrawColor(renderer, 16, 23, 28, 255); SDL_RenderClear(renderer);
        if (last_frame) SDL_RenderCopy(renderer, view, nullptr, nullptr);
        const auto shade = [](SDL_Rect rect, Uint8 alpha) {
            SDL_SetRenderDrawColor(renderer, 12, 19, 26, alpha); SDL_RenderFillRect(renderer, &rect);
        };
        shade({0, 0, 1280, 50}, 235);
        text(std::string("CLASSICUBE  /  ") + argv[3], 18, 12, 1080, 1, false);
        text(panel ? "Hide trace" : "Show trace", 1140, 12, 135, 1, false);
        if (panel) {
            shade({870, 50, 410, 860}, 235);
            text("AGENT ACTIVITY", 892, 68, 365, 1, false);
            text(contents(run + "/status.txt"), 892, 106, 365, 3, false);
            std::string trace = contents(run + "/agent.txt");
            scroll = std::min(scroll, std::max(0, static_cast<int>(trace.size()) - 500));
            if (scroll) trace.resize(trace.size() - scroll);
            text(trace, 892, 196, 365, 30, true);
            text(scroll ? "Scrolled · End to follow live" : "Live · Scroll to read earlier", 892, 874, 365, 1, false);
        }
        shade({0, 910, 1280, 50}, 235);
        text("Tab: trace  |  Enter: new instruction  |  Esc: stop and save world", 18, 924, 1240, 1, false);
        if (entering) {
            shade({100, 680, 1080, 208}, 250);
            text("NEW INSTRUCTION · Enter sends · Esc cancels", 120, 696, 1040, 1, false);
            text(prompt + "_", 120, 738, 1040, 6, true);
        }
        SDL_RenderPresent(renderer); SDL_Delay(33);
        if (glyphs.size() > 2048) { for (auto &item : glyphs) SDL_DestroyTexture(item.second.texture); glyphs.clear(); }
    }
    for (auto &item : glyphs) SDL_DestroyTexture(item.second.texture);
    SDL_DestroyTexture(view); SDL_DestroyRenderer(renderer); SDL_DestroyWindow(window); SDL_Quit();
    return 0;
}
