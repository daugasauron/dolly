/* Plays a 440 Hz tone on the right channel only for two seconds through SDL's
   audio callback, at 44.1 kHz in 16-bit samples, so SDL converts to audio@0's
   48 kHz float stereo. The window's event loop is what feeds the device. */
#include <SDL.h>
#include <math.h>
#include <stdio.h>

static Uint64 frames;
static int callbacks;

static void tone(void *userdata, Uint8 *stream, int length) {
  Sint16 *samples = (Sint16 *)stream;
  for (int i = 0; i < length / 4; i++, frames++) {
    samples[2 * i] = 0;
    samples[2 * i + 1] = (Sint16)(16000 * sin(frames * 440.0 * 6.283185307179586 / 44100));
  }
  callbacks++;
}

int main(void) {
  if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO) != 0) { fprintf(stderr, "%s\n", SDL_GetError()); return 2; }
  SDL_Window *window = SDL_CreateWindow("tone", 0, 0, 160, 120, 0);
  SDL_AudioSpec want = { .freq = 44100, .format = AUDIO_S16SYS, .channels = 2, .samples = 512, .callback = tone }, have;
  SDL_AudioDeviceID device = SDL_OpenAudioDevice(NULL, 0, &want, &have, 0);
  if (!window || !device) { fprintf(stderr, "%s\n", SDL_GetError()); return 3; }
  printf("driver %s\n", SDL_GetCurrentAudioDriver());
  SDL_PauseAudioDevice(device, 0);
  const Uint32 start = SDL_GetTicks();
  while (SDL_GetTicks() - start < 2000) {
    SDL_Event event;
    while (SDL_PollEvent(&event)) {}
    SDL_Delay(10);
  }
  SDL_CloseAudioDevice(device);
  SDL_Quit();
  printf("callbacks %d, frames %llu\n", callbacks, (unsigned long long)frames);
  return callbacks < 100;
}
