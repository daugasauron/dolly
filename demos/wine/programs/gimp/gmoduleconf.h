/* SPDX-License-Identifier: MIT */
/* GModule on Dolly: a threaded program has no dlopen, so no implementation is chosen and
 * g_module_open answers "dynamic modules are not supported by this system". */
#ifndef __G_MODULE_CONF_H__
#define __G_MODULE_CONF_H__
#define G_MODULE_IMPL_NONE 0
#define G_MODULE_IMPL_DL 1
#define G_MODULE_IMPL_DLD 2
#define G_MODULE_IMPL_WIN32 3
#define G_MODULE_IMPL_OS2 4
#define G_MODULE_IMPL_BEOS 5
#define G_MODULE_IMPL_DYLD 6
#define G_MODULE_IMPL_AR 7
#define G_MODULE_IMPL G_MODULE_IMPL_NONE
#endif
