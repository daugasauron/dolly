/* SDL_mixer decodes a WAV file (a one second 330 Hz tone on the left channel,
   44.1 kHz 16-bit stereo, written here) and plays it on a mixer channel until
   it ends; the window's event loop feeds SDL's audio. */
#include <SDL.h>
#include <SDL_mixer.h>
#include <math.h>
#include <stdio.h>

static void put32(Uint8 *at, Uint32 value) { for (int i = 0; i < 4; i++) at[i] = value >> (8 * i); }
static void put16(Uint8 *at, Uint16 value) { at[0] = value; at[1] = value >> 8; }

int main(void) {
  enum { RATE = 44100, FRAMES = RATE, BYTES = FRAMES * 4 };
  static Uint8 wav[44 + BYTES];
  SDL_memcpy(wav, "RIFF", 4); put32(wav + 4, 36 + BYTES); SDL_memcpy(wav + 8, "WAVEfmt ", 8);
  put32(wav + 16, 16); put16(wav + 20, 1); put16(wav + 22, 2); put32(wav + 24, RATE); put32(wav + 28, RATE * 4);
  put16(wav + 32, 4); put16(wav + 34, 16); SDL_memcpy(wav + 36, "data", 4); put32(wav + 40, BYTES);
  for (int i = 0; i < FRAMES; i++) {
    put16(wav + 44 + 4 * i, (Uint16)(Sint16)(16000 * sin(i * 330.0 * 6.283185307179586 / RATE)));
    put16(wav + 46 + 4 * i, 0);
  }
  if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO) != 0 || !SDL_CreateWindow("mixer", 0, 0, 160, 120, 0)) return 2;
  if (Mix_OpenAudio(48000, AUDIO_S16SYS, 2, 1024) != 0) { fprintf(stderr, "%s\n", Mix_GetError()); return 3; }
  Mix_Chunk *chunk = Mix_LoadWAV_RW(SDL_RWFromConstMem(wav, sizeof wav), 1);
  if (!chunk || Mix_PlayChannel(-1, chunk, 0) < 0) { fprintf(stderr, "%s\n", Mix_GetError()); return 4; }
  const Uint32 start = SDL_GetTicks();
  while (Mix_Playing(-1) && SDL_GetTicks() - start < 5000) {
    SDL_Event event;
    while (SDL_PollEvent(&event)) {}
    SDL_Delay(10);
  }
  const int ended = !Mix_Playing(-1);
  printf("played %u ms, ended %d\n", SDL_GetTicks() - start, ended);
  Mix_FreeChunk(chunk);
  Mix_CloseAudio();
  SDL_Quit();
  return !ended;
}
