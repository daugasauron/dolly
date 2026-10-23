/* SDL audio driver for Dolly's audio@0: queued stereo f32 PCM at 48 kHz. */
#include "../../SDL_internal.h"

#ifdef SDL_AUDIO_DRIVER_DOLLY

#include "SDL_audio.h"
#include "../SDL_audio_c.h"
#include "../SDL_sysaudio.h"
#include <dolly/audio.h>
#include <errno.h>
#include <string.h>

/* How far ahead of the browser the stream is kept: 100 ms. */
#define DOLLY_AUDIO_AHEAD_FRAMES 4800u

struct SDL_PrivateAudioData
{
    dolly_audio audio;
};

/* A process has one audio@0 stream, so SDL has one open device here. */
static SDL_AudioDevice *playing;

static int DOLLYAUDIO_OpenDevice(SDL_AudioDevice *device, const char *devname)
{
    if (playing) {
        return SDL_SetError("audio@0 plays one stream per process");
    }
    device->hidden = (struct SDL_PrivateAudioData *)SDL_calloc(1, sizeof(*device->hidden));
    if (!device->hidden) {
        return SDL_OutOfMemory();
    }
    if (dolly_audio_open(&device->hidden->audio) != 0) {
        const int error = errno;
        SDL_free(device->hidden);
        device->hidden = NULL;
        return SDL_SetError("audio@0: %s", strerror(error));
    }
    device->spec.format = AUDIO_F32SYS;
    device->spec.channels = DOLLY_AUDIO_CHANNELS;
    device->spec.freq = DOLLY_AUDIO_RATE;
    device->spec.samples = 1024;
    SDL_CalculateAudioSpec(&device->spec);
    playing = device;
    return 0;
}

static void DOLLYAUDIO_CloseDevice(SDL_AudioDevice *device)
{
    dolly_audio_close(&device->hidden->audio);
    SDL_free(device->hidden);
    if (playing == device) {
        playing = NULL;
    }
}

/* One period from the application's callback, converted to the device's spec. */
static SDL_bool DOLLYAUDIO_Fill(SDL_AudioDevice *device)
{
    SDL_AudioCallback callback = device->callbackspec.callback;
    const int stream_len = device->callbackspec.size;

    if (!device->stream) {
        callback(device->callbackspec.userdata, device->work_buffer, stream_len);
        return SDL_TRUE;
    }
    while (SDL_AudioStreamAvailable(device->stream) < (int)device->spec.size) {
        callback(device->callbackspec.userdata, device->work_buffer, stream_len);
        if (SDL_AudioStreamPut(device->stream, device->work_buffer, stream_len) == -1) {
            SDL_AudioStreamClear(device->stream);
            SDL_AtomicSet(&device->enabled, 0);
            return SDL_FALSE;
        }
    }
    return SDL_AudioStreamGet(device->stream, device->work_buffer, device->spec.size) == (int)device->spec.size;
}

/* SDL starts no threads here: the event pump runs the callback until the
   browser holds DOLLY_AUDIO_AHEAD_FRAMES. */
void DOLLYAUDIO_Pump(void)
{
    SDL_AudioDevice *device = playing;
    dolly_audio_status status;

    if (!device || !SDL_AtomicGet(&device->enabled) || SDL_AtomicGet(&device->paused)) {
        return;
    }
    if (dolly_audio_get_status(&device->hidden->audio, &status) != 0) {
        SDL_OpenedAudioDeviceDisconnected(device);
        return;
    }
    for (Uint32 queued = status.queued_frames; queued < DOLLY_AUDIO_AHEAD_FRAMES; queued += device->spec.samples) {
        if (!DOLLYAUDIO_Fill(device)) {
            return;
        }
        if (dolly_audio_write(&device->hidden->audio, (const float *)device->work_buffer, device->spec.samples) < 0) {
            if (errno != EAGAIN) {
                SDL_OpenedAudioDeviceDisconnected(device);
            }
            return;
        }
    }
}

static void DOLLYAUDIO_LockOrUnlockDevice(SDL_AudioDevice *device)
{
}

static SDL_bool DOLLYAUDIO_Init(SDL_AudioDriverImpl *impl)
{
    impl->OpenDevice = DOLLYAUDIO_OpenDevice;
    impl->CloseDevice = DOLLYAUDIO_CloseDevice;
    impl->OnlyHasDefaultOutputDevice = SDL_TRUE;
    impl->LockDevice = impl->UnlockDevice = DOLLYAUDIO_LockOrUnlockDevice;
    impl->ProvidesOwnCallbackThread = SDL_TRUE;
    return SDL_TRUE;
}

AudioBootStrap DOLLYAUDIO_bootstrap = {
    "dolly", "Dolly audio@0", DOLLYAUDIO_Init, SDL_FALSE
};

#endif /* SDL_AUDIO_DRIVER_DOLLY */
