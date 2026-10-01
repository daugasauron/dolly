#ifndef DOLLY_DOWNLOAD_API_H
#define DOLLY_DOWNLOAD_API_H

#include <dolly/download-abi.h>

#ifdef __cplusplus
extern "C" {
#endif

// Streams one regular file of at most DOLLY_DOWNLOAD_MAX_SIZE bytes from
// Dolly's in-memory filesystem to the browser, which offers it for saving. The
// browser boundary independently validates and bounds each chunk, the total
// and the filename. Returns zero or a negative errno value.
int dolly_download_file(const char *path);

#ifdef __cplusplus
}
#endif

#endif
