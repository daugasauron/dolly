# GDI driver

@ cdecl wine_get_gdi_driver(long) DOLLY_get_gdi_driver

# USER driver

@ cdecl CreateDesktopWindow(long) DOLLY_CreateDesktopWindow
@ cdecl DestroyWindow(long) DOLLY_DestroyWindow
@ cdecl EnumDisplayMonitors(long ptr ptr long) DOLLY_EnumDisplayMonitors
@ cdecl EnumDisplaySettingsEx(ptr long ptr long) DOLLY_EnumDisplaySettingsEx
@ cdecl GetMonitorInfo(long ptr) DOLLY_GetMonitorInfo
@ cdecl MapVirtualKeyEx(long long long) DOLLY_MapVirtualKeyEx
@ cdecl SetCursor(long) DOLLY_SetCursor
@ cdecl ToUnicodeEx(long long ptr ptr long long long) DOLLY_ToUnicodeEx
@ cdecl VkKeyScanEx(long long) DOLLY_VkKeyScanEx
@ cdecl WindowPosChanged(long long long ptr ptr ptr ptr ptr) DOLLY_WindowPosChanged
@ cdecl WindowPosChanging(long long long ptr ptr ptr ptr) DOLLY_WindowPosChanging
