#ifndef DOLLY_UPLOAD_H
#define DOLLY_UPLOAD_H

#include <stdint.h>

uintptr_t dolly_upload_mailbox_address(void);
uint32_t dolly_upload_mailbox_version(void);
int64_t dolly_upload_process_file(int pid, const char *path);
void dolly_upload_cancel_process(int pid);

#endif
