#ifndef DOLLY_ABI_H
#define DOLLY_ABI_H

#if defined(__GNUC__)
#define DOLLY_EXPORT __attribute__((visibility("default")))
#else
#define DOLLY_EXPORT
#endif

#ifdef __cplusplus
extern "C" {
#endif

DOLLY_EXPORT int dolly_main(int argc, char **argv);

#ifdef __cplusplus
}
#endif

#endif
