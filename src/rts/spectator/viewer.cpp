// The spectator sees both views; neither Pi process receives this framebuffer.
// SPDX-License-Identifier: GPL-2.0-or-later
#include <SDL.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <string>
#include <vector>
#define STB_TRUETYPE_IMPLEMENTATION
#define STBTT_STATIC
#include <stb_truetype.h>

namespace {
struct Glyph { SDL_Texture *texture; int width, height, x, y, advance; };
SDL_Renderer *renderer;
stbtt_fontinfo font;
float scale;
std::map<int, Glyph> glyphs;

std::vector<unsigned char> read(const std::string &path, size_t maximum)
{
    FILE *file = std::fopen(path.c_str(), "rb");
    if (!file) return {};
    std::fseek(file, 0, SEEK_END);
    const long size = std::ftell(file);
    std::rewind(file);
    std::vector<unsigned char> bytes;
    if (size >= 0 && static_cast<size_t>(size) <= maximum) {
        bytes.resize(size);
        if (std::fread(bytes.data(), 1, bytes.size(), file) != bytes.size()) bytes.clear();
    }
    std::fclose(file);
    return bytes;
}

int codepoint(const std::string &text, size_t &offset)
{
    const unsigned char first = text[offset++];
    if (first < 128) return first;
    const int count = first >= 0xf0 ? 3 : first >= 0xe0 ? 2 : first >= 0xc2 ? 1 : 0;
    if (!count || offset + count > text.size()) return 0xfffd;
    int value = first & (0x7f >> (count + 1));
    for (int n = 0; n < count; ++n) {
        const unsigned char next = text[offset];
        if ((next & 0xc0) != 0x80) return 0xfffd;
        value = (value << 6) | (next & 63);
        ++offset;
    }
    return value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff) ? 0xfffd : value;
}

const Glyph &glyph(int code)
{
    const auto existing = glyphs.find(code);
    if (existing != glyphs.end()) return existing->second;
    Glyph result = {};
    int advance;
    stbtt_GetCodepointHMetrics(&font, code, &advance, nullptr);
    result.advance = static_cast<int>(advance * scale + 0.5f);
    unsigned char *bitmap = stbtt_GetCodepointBitmap(&font, 0, scale, code,
        &result.width, &result.height, &result.x, &result.y);
    if (bitmap && result.width && result.height) {
        std::vector<unsigned char> pixels(result.width * result.height * 4, 235);
        for (int i = 0; i < result.width * result.height; ++i) pixels[i * 4 + 3] = bitmap[i];
        result.texture = SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGBA32, SDL_TEXTUREACCESS_STATIC,
            result.width, result.height);
        if (result.texture) {
            SDL_UpdateTexture(result.texture, nullptr, pixels.data(), result.width * 4);
            SDL_SetTextureBlendMode(result.texture, SDL_BLENDMODE_BLEND);
        }
    }
    stbtt_FreeBitmap(bitmap, nullptr);
    return glyphs.emplace(code, result).first->second;
}

void text(const std::string &value, int left, int top, int width, int rows, bool tail)
{
    std::vector<std::vector<int>> lines(1);
    int x = 0;
    for (size_t offset = 0; offset < value.size();) {
        const int code = codepoint(value, offset);
        if (code == '\n') { lines.emplace_back(); x = 0; continue; }
        if (code < 32) continue;
        const auto &item = glyph(code);
        if (x + item.advance > width) { lines.emplace_back(); x = 0; }
        lines.back().push_back(code);
        x += item.advance;
    }
    const size_t start = tail && lines.size() > static_cast<size_t>(rows) ? lines.size() - rows : 0;
    for (size_t row = start; row < lines.size() && row < start + rows; ++row) {
        x = left;
        for (int code : lines[row]) {
            const auto &item = glyph(code);
            SDL_Rect target = { x + item.x, top + static_cast<int>(row - start) * 22 + 18 + item.y,
                item.width, item.height };
            if (item.texture) SDL_RenderCopy(renderer, item.texture, nullptr, &target);
            x += item.advance;
        }
    }
}
}

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
        SDL_Event event;
        while (SDL_PollEvent(&event))
            if (event.type == SDL_QUIT || (event.type == SDL_KEYDOWN && event.key.keysym.sym == SDLK_ESCAPE)) running = false;
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
        text("Escape: stop match | Both games keep running while Pi thinks. Full histories are saved in /workspace/rts-matches.",
            10, 944, 1580, 1, false);
        SDL_RenderPresent(renderer);
        if (glyphs.size() > 2048) {
            for (auto &entry : glyphs) SDL_DestroyTexture(entry.second.texture);
            glyphs.clear();
        }
        SDL_Delay(100);
    }
    for (auto &entry : glyphs) SDL_DestroyTexture(entry.second.texture);
    for (auto view : views) SDL_DestroyTexture(view);
    SDL_DestroyRenderer(renderer);
    SDL_DestroyWindow(window);
    SDL_Quit();
    return status;
}
