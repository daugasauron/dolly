#pragma once

#include "core/os/mutex.h"
#include "core/os/thread.h"
#include "core/templates/local_vector.h"
#include "core/templates/safe_refcount.h"
#include "servers/audio/audio_server.h"

#include <dolly/audio.h>

// Godot's mix as audio@0's queued stereo float PCM at 48 kHz, written by a
// thread of the driver's own.
class AudioDriverDolly : public AudioDriver {
	dolly_audio audio = {};
	Thread thread;
	Mutex mutex;
	SafeFlag active;
	SafeFlag exit_thread;
	LocalVector<int32_t> mixed;
	LocalVector<float> samples;

	static void thread_func(void *p_driver);

public:
	const char *get_name() const override { return "Dolly"; }
	Error init() override;
	void start() override { active.set(); }
	int get_mix_rate() const override { return DOLLY_AUDIO_RATE; }
	SpeakerMode get_speaker_mode() const override { return SPEAKER_MODE_STEREO; }
	float get_latency() override;
	void lock() override { mutex.lock(); }
	void unlock() override { mutex.unlock(); }
	void finish() override;
};
