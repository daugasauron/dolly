#include "audio_driver_dolly.h"

#include "core/os/os.h"

#include <errno.h>
#include <string.h>

// Mixed a period at a time and kept 100 ms ahead of the page, as the SDL port
// keeps its stream.
static constexpr uint32_t PERIOD_FRAMES = 1024;
static constexpr uint32_t AHEAD_FRAMES = 4800;

Error AudioDriverDolly::init() {
	ERR_FAIL_COND_V_MSG(dolly_audio_open(&audio) != 0, ERR_CANT_OPEN, vformat("audio@0: %s.", strerror(errno)));
	mixed.resize(PERIOD_FRAMES * DOLLY_AUDIO_CHANNELS);
	samples.resize(PERIOD_FRAMES * DOLLY_AUDIO_CHANNELS);
	thread.start(thread_func, this);
	return OK;
}

float AudioDriverDolly::get_latency() {
	return float(AHEAD_FRAMES) / DOLLY_AUDIO_RATE;
}

void AudioDriverDolly::thread_func(void *p_driver) {
	AudioDriverDolly *driver = static_cast<AudioDriverDolly *>(p_driver);
	while (!driver->exit_thread.is_set()) {
		dolly_audio_status status;
		if (driver->active.is_set() && dolly_audio_get_status(&driver->audio, &status) == 0) {
			for (uint32_t queued = status.queued_frames; queued < AHEAD_FRAMES; queued += PERIOD_FRAMES) {
				driver->lock();
				driver->audio_server_process(PERIOD_FRAMES, driver->mixed.ptr());
				driver->unlock();
				for (uint32_t index = 0; index < driver->mixed.size(); index++) {
					driver->samples[index] = driver->mixed[index] / 2147483648.0f;
				}
				if (dolly_audio_write(&driver->audio, driver->samples.ptr(), PERIOD_FRAMES) != 0) {
					break;
				}
			}
		}
		OS::get_singleton()->delay_usec(PERIOD_FRAMES * 1000000 / DOLLY_AUDIO_RATE / 2);
	}
}

void AudioDriverDolly::finish() {
	exit_thread.set();
	if (thread.is_started()) {
		thread.wait_to_finish();
	}
	dolly_audio_close(&audio);
}
