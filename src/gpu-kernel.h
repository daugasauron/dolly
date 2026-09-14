#pragma once
#include <stdint.h>
#include <stddef.h>
int64_t dolly_gpu_process_call(int pid, unsigned char *packet, size_t size, size_t capacity);
void dolly_gpu_release_owner(int pid);
