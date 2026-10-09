/* SPDX-License-Identifier: MIT
 * <tchar.h> for ReactOS Paint as built in the Wine demo. Paint is written
 * for the Microsoft C runtime; here it is linked with Dolly's libc, whose
 * wide characters are 32-bit, so its string literals and the seven wide
 * string functions it uses are the 16-bit ones of Windows and libwine. */
#ifndef WINE_DOLLY_MSPAINT_TCHAR_H
#define WINE_DOLLY_MSPAINT_TCHAR_H

#include <stdlib.h>
#include <windef.h>
#include <wine/unicode.h>

/* A wide literal of this compiler has 32-bit characters; u"" has the 16-bit ones of Windows. */
#undef TEXT
#undef __TEXT
#define __TEXT(x) u##x
#define TEXT(x) __TEXT(x)
#define __T(x) u##x
#define _T(x) __T(x)
#define _tWinMain wWinMain
#define _stprintf sprintfW
#define _tcslen strlenW
#define _tcscpy strcpyW
#define _tcscat strcatW
#define _tcsrchr strrchrW
#define _tstoi atoiW

static inline double _tcstod( const WCHAR *string, WCHAR **end )
{
    char buffer[64], *stop;
    unsigned int i;
    double value;

    for (i = 0; i < sizeof(buffer) - 1 && string[i] && string[i] < 128; i++) buffer[i] = string[i];
    buffer[i] = 0;
    value = strtod( buffer, &stop );
    if (end) *end = (WCHAR *)string + (stop - buffer);
    return value;
}

#endif
