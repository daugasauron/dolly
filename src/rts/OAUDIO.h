// Silent Dolly backend. SPDX-License-Identifier: GPL-2.0-or-later
#ifndef DOLLY_SEVEN_KINGDOMS_AUDIO_H
#define DOLLY_SEVEN_KINGDOMS_AUDIO_H
#include <audio_base.h>
#include <cerrno>

// No audio device exists in Dolly. Initialization/playback report failure;
// teardown remains valid for the upstream -noaudio path.
class Audio final : public AudioBase {
public:
    Audio() : AudioBase{} {}
    int init() override { errno = ENOSYS; return 0; }
    void deinit() override {}
    void yield() override {}
    int play_mid(char *) override { return 0; }
    int play_wav(char *, const DsVolume &) override { return 0; }
    int play_wav(short, const DsVolume &) override { return 0; }
    int play_resided_wav(char *, const DsVolume &) override { return 0; }
    int get_free_wav_ch() override { return 0; }
    int stop_wav(int) override { return 0; }
    int is_wav_playing(int) override { return 0; }
    int play_long_wav(const char *, const DsVolume &) override { return 0; }
    int stop_long_wav(int) override { return 0; }
    int is_long_wav_playing(int) override { return 0; }
    void volume_long_wav(int, const DsVolume &) override {}
    int play_loop_wav(const char *, int, const DsVolume &) override { return 0; }
    void stop_loop_wav(int) override {}
    void volume_loop_wav(int, const DsVolume &) override {}
    void fade_out_loop_wav(int, int) override {}
    DsVolume get_loop_wav_volume(int) override { return DsVolume(-10000, 0); }
    int is_loop_wav_fading(int) override { return 0; }
    int play_cd(int, int) override { return 0; }
    void stop_mid() override {}
    void stop_wav() override {}
    void stop_cd() override {}
    int is_mid_playing() override { return 0; }
    int is_wav_playing() override { return 0; }
    int is_cd_playing() override { return 0; }
    void toggle_mid(bool) override {}
    void toggle_wav(bool) override {}
    void toggle_cd(bool) override {}
    void set_mid_volume(int) override {}
    void set_wav_volume(int) override {}
    void set_cd_volume(int) override {}
    int get_wav_volume() const override { return 0; }
};
extern Audio audio;
#endif
