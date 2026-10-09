/* SPDX-License-Identifier: LGPL-2.1-or-later */
#ifndef WINE_DOLLY_DRV_H
#define WINE_DOLLY_DRV_H

#include <stdarg.h>
#include <dolly/input.h>

#include "windef.h"
#include "winbase.h"
#include "wingdi.h"
#include "winuser.h"

/* keyboard.c: a key record as the INPUT Wine queues; FALSE for a key it has no name for */
extern BOOL dolly_key_input( const dolly_input_event *event, INPUT *input ) DECLSPEC_HIDDEN;

#endif
