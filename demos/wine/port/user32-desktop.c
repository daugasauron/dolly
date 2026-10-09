/*
 * The desktop of a Wine that is one process (compiled into user32).
 *
 * Wine starts "explorer.exe /desktop" in a process of its own to create the
 * desktop window and name its graphics driver. Dolly gives Wine one process,
 * so GetDesktopWindow takes the desktop window the server makes when there
 * is no explorer (one that no thread owns), and this names the driver for
 * it the way explorer's load_graphics_driver and user32's DesktopWndProc do.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 */

#include "config.h"
#include "wine/port.h"

#include <stdarg.h>

#include "windef.h"
#include "winbase.h"
#include "wingdi.h"
#include "winuser.h"
#include "winreg.h"
#include "wine/unicode.h"

void wine_dolly_init_desktop( HWND hwnd )
{
    static const WCHAR display_device_guid_propW[] = {
        '_','_','w','i','n','e','_','d','i','s','p','l','a','y','_',
        'd','e','v','i','c','e','_','g','u','i','d',0 };
    /* one display: the GUID only names its registry key */
    static const WCHAR guidW[] = {'6','4','6','f','6','c','6','c','-','7','9','0','0','-','4','0','0','0','-',
        '8','0','0','0','-','7','7','6','9','6','e','6','5','0','0','0','1',0};
    static const WCHAR key_formatW[] = {
        'S','y','s','t','e','m','\\',
        'C','u','r','r','e','n','t','C','o','n','t','r','o','l','S','e','t','\\',
        'C','o','n','t','r','o','l','\\',
        'V','i','d','e','o','\\','{','%','s','}','\\','0','0','0','0',0};
    static const WCHAR graphics_driverW[] = {'G','r','a','p','h','i','c','s','D','r','i','v','e','r',0};
    static const WCHAR driverW[] = {'w','i','n','e','d','o','l','l','y','.','d','r','v',0};
    WCHAR key[ARRAY_SIZE( key_formatW ) + ARRAY_SIZE( guidW )];
    HKEY hkey;

    if (GetPropW( hwnd, display_device_guid_propW )) return;
    sprintfW( key, key_formatW, guidW );
    if (!RegCreateKeyExW( HKEY_LOCAL_MACHINE, key, 0, NULL, REG_OPTION_VOLATILE, KEY_SET_VALUE, NULL, &hkey, NULL ))
    {
        RegSetValueExW( hkey, graphics_driverW, 0, REG_SZ, (const BYTE *)driverW, sizeof(driverW) );
        RegCloseKey( hkey );
    }
    SetPropW( hwnd, display_device_guid_propW, ULongToHandle( GlobalAddAtomW( guidW ) ) );
}
