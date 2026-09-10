#include <SDL.h>
#include <assert.h>
#include <stdio.h>
#include <string.h>

static int unused_thread(void *data) { (void)data; return 0; }

int main(int argc, char **argv)
{
    SDL_atomic_t counter = { 0 };
    SDL_SpinLock lock = 0;
    assert(SDL_AtomicCAS(&counter, 0, 7));
    assert(SDL_AtomicAdd(&counter, 3) == 7 && SDL_AtomicGet(&counter) == 10);
    assert(SDL_AtomicTryLock(&lock) && !SDL_AtomicTryLock(&lock));
    SDL_AtomicUnlock(&lock);
    assert(SDL_Init(SDL_INIT_VIDEO) == 0);
    assert(strcmp(SDL_GetCurrentVideoDriver(), "dolly") == 0);
    assert(SDL_InitSubSystem(SDL_INIT_AUDIO) != 0);
    assert(SDL_CreateThread(unused_thread, "unsupported", NULL) == NULL);
    SDL_Window *window = SDL_CreateWindow("SDL2 Dolly probe", 0, 0, 320, 240, 0);
    assert(window);
    assert(SDL_CreateWindow("second", 0, 0, 40, 40, 0) == NULL);
    SDL_Renderer *renderer = SDL_CreateRenderer(window, -1, SDL_RENDERER_SOFTWARE);
    assert(renderer);
    SDL_Texture *texture = SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGB565,
        SDL_TEXTUREACCESS_STREAMING, 2, 2);
    assert(texture);
    const Uint16 colors[] = { 0xf800, 0x07e0, 0x001f, 0xffff };
    assert(SDL_UpdateTexture(texture, NULL, colors, 4) == 0);
    Uint64 started = SDL_GetTicks64();
    SDL_Delay(10);
    assert(SDL_GetTicks64() >= started + 5);
    int clicks = 0, right_clicks = 0, keys = 0, quit = 0;
    for (int frame = 0; !quit; ++frame) {
        assert(SDL_RenderClear(renderer) == 0);
        assert(SDL_RenderCopy(renderer, texture, NULL, NULL) == 0);
        SDL_RenderPresent(renderer);
        SDL_Event event;
        while (SDL_PollEvent(&event)) {
            if (event.type == SDL_QUIT) quit = 1;
            if (event.type == SDL_KEYDOWN && event.key.keysym.scancode == SDL_SCANCODE_A) ++keys;
            if (event.type == SDL_MOUSEBUTTONDOWN) {
                assert(event.button.button == SDL_BUTTON_LEFT || event.button.button == SDL_BUTTON_RIGHT);
                assert(event.button.x >= 0 && event.button.x < 320);
                assert(event.button.y >= 0 && event.button.y < 240);
                if (event.button.button == SDL_BUTTON_LEFT) ++clicks;
                else ++right_clicks;
            }
            if (event.type == SDL_KEYDOWN && event.key.keysym.scancode == SDL_SCANCODE_ESCAPE) quit = 1;
        }
        if (argc == 1 && frame == 3) quit = 1;
        SDL_Delay(16);
    }
    SDL_DestroyTexture(texture);
    SDL_DestroyRenderer(renderer);
    SDL_DestroyWindow(window);
    SDL_Quit();
    if (argc > 1 && !strcmp(argv[1], "input")) assert(clicks == 1 && right_clicks == 1 && keys == 1);
    puts("SDL2-PROBE-OK");
    return 0;
}
