/* SPDX-License-Identifier: MIT */
/* Included before each file that is written for the Windows API. Such a file keeps UTF-16 in wchar_t,
 * which is 32 bits in Dolly's C library (cc has no -fshort-wchar): after the C library's own headers
 * the name means Windows' character, and the one C library function used on such strings Wine's. */
#include <stddef.h>
#include <stdlib.h>
#include <wchar.h>
#define WINE_NOWINSOCK
#include <windows.h>
#include <wine/unicode.h>
#define wchar_t WCHAR
#define wcslen strlenW
/* Written before Win64: a window's long that holds a handle is pointer-sized. */
#define GWL_HWNDPARENT GWLP_HWNDPARENT
#undef SetWindowLong
#define SetWindowLong SetWindowLongPtr
#undef GetWindowLong
#define GetWindowLong GetWindowLongPtr
/* This Wine has no ole32: COM does not start and makes no object (GDK asks at start, and for a dropped shortcut). */
#define CoInitialize(reserved) E_NOTIMPL
#define CoUninitialize() ((void) 0)
#define CoCreateInstance(class_id, outer, context, interface_id, object) E_NOTIMPL
/* The descriptor that stands for the thread's message queue in a GLib main loop (main.c polls it). */
#define G_WIN32_MSG_HANDLE 19981206
