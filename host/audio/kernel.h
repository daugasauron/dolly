#pragma once
#include <stddef.h>
#include <stdint.h>
int64_t dolly_audio_process_call(int pid, unsigned char *packet, size_t size, size_t capacity);
void dolly_audio_release_owner(int pid);
