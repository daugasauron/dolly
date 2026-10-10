/* SPDX-License-Identifier: MIT */
/* gwin32.c's flavour for a Unix C library over the Windows API is Cygwin's, and asks Cygwin for the Unix
 * name of the directory a package is installed in. Nothing here is installed as a Windows package and
 * nothing asks: the function is not defined, and Wine's link gives a name no one defines a stub that
 * raises its "unimplemented function" exception. */
void cygwin_conv_to_posix_path (const char *windows, char *posix);
