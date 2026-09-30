#ifndef DOLLY_DOWNLOAD_API_H
#define DOLLY_DOWNLOAD_API_H

#ifdef __cplusplus
extern "C" {
#endif

// Requests one regular file from Dolly's in-memory filesystem as a browser
// download. The browser boundary independently validates and bounds the byte
// range and filename. Returns zero or a negative errno value.
int dolly_download_file(const char *path);

#ifdef __cplusplus
}
#endif

#endif
