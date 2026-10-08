/*
 * winedolly.drv: Wine's display and input on Dolly.
 *
 * Dolly gives a foreground program one framebuffer and one stream of input
 * records. Every top-level window draws into a surface of its own (the DIB
 * engine does the drawing); one thread puts the surfaces together in Z order
 * over the desktop's colour, presents the frame, and queues the input
 * records as hardware messages.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 */

#include "config.h"
#include "wine/port.h"

#include <limits.h>
#include <stdlib.h>
#include <string.h>
#include <dolly/display.h>

#define NONAMELESSUNION
#define NONAMELESSSTRUCT
#include "dolly.h"
#include "wine/gdi_driver.h"
#include "wine/server.h"
#include "wine/list.h"
#include "wine/debug.h"

WINE_DEFAULT_DEBUG_CHANNEL(dolly);

extern BOOL CDECL __wine_send_input( HWND hwnd, const INPUT *input );

struct surface
{
    struct window_surface header;
    CRITICAL_SECTION      crit;
    RECT                  bounds;
    BITMAPINFOHEADER      info;
    DWORD                *bits;
};

struct win_data
{
    struct list     entry;
    HWND            hwnd;
    RECT            rect;       /* on the screen */
    BOOL            visible;
    struct surface *surface;
};

static struct list windows = LIST_INIT( windows );
static CRITICAL_SECTION win_section;
static CRITICAL_SECTION_DEBUG critsect_debug =
{
    0, 0, &win_section,
    { &critsect_debug.ProcessLocksList, &critsect_debug.ProcessLocksList },
      0, 0, { (DWORD_PTR)(__FILE__ ": win_section") }
};
static CRITICAL_SECTION win_section = { &critsect_debug, -1, 0, 0, 0, 0 };

static dolly_display_surface display;
static uint64_t input_lease;
static RECT screen_rect;
static LONG screen_dirty;

/* a surface: 32-bit rows from the top, which is what the framebuffer wants bar the byte order */

static struct surface *get_surface( struct window_surface *surface )
{
    return CONTAINING_RECORD( surface, struct surface, header );
}

static void surface_lock( struct window_surface *window_surface )
{
    EnterCriticalSection( &get_surface( window_surface )->crit );
}

static void surface_unlock( struct window_surface *window_surface )
{
    LeaveCriticalSection( &get_surface( window_surface )->crit );
}

static void *surface_get_info( struct window_surface *window_surface, BITMAPINFO *info )
{
    struct surface *surface = get_surface( window_surface );

    info->bmiHeader = surface->info;
    return surface->bits;
}

static RECT *surface_get_bounds( struct window_surface *window_surface )
{
    return &get_surface( window_surface )->bounds;
}

static void surface_set_region( struct window_surface *window_surface, HRGN region )
{
    /* every window is drawn as its rectangle */
}

static void surface_flush( struct window_surface *window_surface )
{
    struct surface *surface = get_surface( window_surface );

    SetRect( &surface->bounds, INT_MAX, INT_MAX, INT_MIN, INT_MIN );
    InterlockedExchange( &screen_dirty, 1 );
}

static void surface_destroy( struct window_surface *window_surface )
{
    struct surface *surface = get_surface( window_surface );

    surface->crit.DebugInfo->Spare[0] = 0;
    DeleteCriticalSection( &surface->crit );
    HeapFree( GetProcessHeap(), 0, surface->bits );
    HeapFree( GetProcessHeap(), 0, surface );
}

static const struct window_surface_funcs surface_funcs =
{
    surface_lock,
    surface_unlock,
    surface_get_info,
    surface_get_bounds,
    surface_set_region,
    surface_flush,
    surface_destroy
};

static struct surface *create_surface( int width, int height )
{
    struct surface *surface = HeapAlloc( GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*surface) );

    if (!surface) return NULL;
    if (!(surface->bits = HeapAlloc( GetProcessHeap(), HEAP_ZERO_MEMORY, (SIZE_T)width * height * 4 )))
    {
        HeapFree( GetProcessHeap(), 0, surface );
        return NULL;
    }
    surface->header.funcs = &surface_funcs;
    surface->header.ref = 1;
    SetRect( &surface->header.rect, 0, 0, width, height );
    SetRect( &surface->bounds, INT_MAX, INT_MAX, INT_MIN, INT_MIN );
    surface->info.biSize = sizeof(surface->info);
    surface->info.biWidth = width;
    surface->info.biHeight = -height;
    surface->info.biPlanes = 1;
    surface->info.biBitCount = 32;
    surface->info.biCompression = BI_RGB;
    surface->info.biSizeImage = width * height * 4;
    InitializeCriticalSection( &surface->crit );
    surface->crit.DebugInfo->Spare[0] = (DWORD_PTR)(__FILE__ ": surface");
    return surface;
}

/* window data; win_section is held between get_win_data and release_win_data */

static struct win_data *get_win_data( HWND hwnd, BOOL create )
{
    struct win_data *data;

    EnterCriticalSection( &win_section );
    LIST_FOR_EACH_ENTRY( data, &windows, struct win_data, entry ) if (data->hwnd == hwnd) return data;
    if (create && (data = HeapAlloc( GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*data) )))
    {
        data->hwnd = hwnd;
        list_add_tail( &windows, &data->entry );
        return data;
    }
    LeaveCriticalSection( &win_section );
    return NULL;
}

static void release_win_data( struct win_data *data )
{
    if (data) LeaveCriticalSection( &win_section );
}

/* The windows that own a surface: the children of the desktop. A window further down draws into its ancestor's. */
static BOOL has_surface( HWND hwnd )
{
    return GetAncestor( hwnd, GA_PARENT ) == GetDesktopWindow();
}

/* There is no window manager: this is the part of one that gives a window the foreground. */
static BOOL can_activate( HWND hwnd )
{
    return hwnd && hwnd != GetDesktopWindow() && IsWindowVisible( hwnd ) &&
           !(GetWindowLongW( hwnd, GWL_STYLE ) & WS_DISABLED) &&
           !(GetWindowLongW( hwnd, GWL_EXSTYLE ) & (WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW));
}

/* the frame */

static void draw_window( const dolly_display_frame *frame, const struct win_data *data )
{
    struct surface *surface = data->surface;
    int width = surface->header.rect.right, x0, y0, x1, y1, x, y;

    x0 = max( data->rect.left, 0 );
    y0 = max( data->rect.top, 0 );
    x1 = min( min( data->rect.right, data->rect.left + width ), (int)frame->width );
    y1 = min( min( data->rect.bottom, data->rect.top + surface->header.rect.bottom ), (int)frame->height );
    if (x0 >= x1 || y0 >= y1) return;

    EnterCriticalSection( &surface->crit );
    for (y = y0; y < y1; y++)
    {
        const DWORD *src = surface->bits + (SIZE_T)(y - data->rect.top) * width + (x0 - data->rect.left);
        DWORD *dst = (DWORD *)(frame->pixels + (SIZE_T)y * frame->stride) + x0;

        /* a DIB pixel is blue, green, red; a frame pixel red, green, blue, opaque */
        for (x = x0; x < x1; x++, src++, dst++)
            *dst = 0xff000000 | (*src & 0x0000ff00) | ((*src >> 16) & 0xff) | ((*src & 0xff) << 16);
    }
    LeaveCriticalSection( &surface->crit );
}

struct window_list
{
    HWND     handles[256];
    unsigned count;
};

static BOOL CALLBACK list_window( HWND hwnd, LPARAM param )
{
    struct window_list *list = (struct window_list *)param;

    if (list->count < ARRAY_SIZE(list->handles)) list->handles[list->count++] = hwnd;
    return TRUE;
}

static void present_frame(void)
{
    struct window_list list;
    struct win_data *data;
    dolly_display_frame frame;
    unsigned i;

    static HWND last_foreground;
    COLORREF background = GetSysColor( COLOR_BACKGROUND );
    HWND foreground;
    unsigned x;

    if (dolly_display_begin_frame( display.generation, &frame )) return;
    /* the desktop has no thread to paint it: it is its colour */
    for (i = 0; i < frame.height; i++)
    {
        DWORD *row = (DWORD *)(frame.pixels + (SIZE_T)i * frame.stride);
        for (x = 0; x < frame.width; x++) row[x] = 0xff000000 | background;
    }

    /* its windows from the bottom of the Z order */
    list.count = 0;
    EnumWindows( list_window, (LPARAM)&list );
    /* when no window has the foreground, the topmost that can takes it */
    if (!(foreground = GetForegroundWindow()))
        for (i = 0; i < list.count; i++)
            if (can_activate( list.handles[i] ) && SetForegroundWindow( list.handles[i] )) break;
    /* A window that was made active before it got the foreground (Notepad focuses its edit control
     * while it is created) has drawn an inactive caption and is not told again: the window manager's nudge. */
    if (foreground && foreground != last_foreground) SendNotifyMessageW( foreground, WM_NCACTIVATE, TRUE, 0 );
    last_foreground = foreground;
    for (i = list.count; i > 0; i--)
    {
        if (!(data = get_win_data( list.handles[i - 1], FALSE ))) continue;
        if (data->visible && data->surface) draw_window( &frame, data );
        release_win_data( data );
    }
    dolly_display_present( display.generation, frame.buffer_index );
}

/* input */

static void activate_window_at( int x, int y )
{
    GUITHREADINFO info = { sizeof(info) };
    POINT pt = { x, y };
    HWND hwnd = GetAncestor( WindowFromPoint( pt ), GA_ROOT );

    if (hwnd == GetForegroundWindow() || !can_activate( hwnd )) return;
    /* a menu or a drag of the foreground thread keeps the press */
    if (GetGUIThreadInfo( 0, &info ) &&
        ((info.flags & (GUI_INMENUMODE | GUI_POPUPMENUMODE | GUI_INMOVESIZE)) || info.hwndCapture)) return;
    SetForegroundWindow( hwnd );
}

static void send_pointer( const dolly_input_event *event )
{
    static const DWORD down[] = { MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_XDOWN, MOUSEEVENTF_XDOWN };
    static const DWORD up[] = { MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_RIGHTUP, MOUSEEVENTF_XUP, MOUSEEVENTF_XUP };
    unsigned button = event->flags >> 8;
    INPUT input = { INPUT_MOUSE };

    input.u.mi.dx = event->x;
    input.u.mi.dy = event->y;
    input.u.mi.dwFlags = MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE;
    if (event->action != DOLLY_POINTER_ACTION_DRAG && button < ARRAY_SIZE(down))
    {
        if (event->action == DOLLY_POINTER_ACTION_PRESS) activate_window_at( event->x, event->y );
        input.u.mi.dwFlags |= event->action == DOLLY_POINTER_ACTION_PRESS ? down[button] : up[button];
        if (button >= 3) input.u.mi.mouseData = button == 3 ? XBUTTON1 : XBUTTON2;
    }
    __wine_send_input( 0, &input );
}

static void send_scroll( const dolly_input_event *event )
{
    /* a wheel notch is WHEEL_DELTA: three lines, or a hundred pixels */
    static const int per_unit[] = { WHEEL_DELTA, WHEEL_DELTA * 100 / 3, WHEEL_DELTA * 300 };
    INPUT input = { INPUT_MOUSE };

    if (event->action >= ARRAY_SIZE(per_unit)) return;
    input.u.mi.dwFlags = MOUSEEVENTF_WHEEL;
    input.u.mi.mouseData = -(event->y / 1000 * per_unit[event->action] / 100 + event->y % 1000 * per_unit[event->action] / 100000);
    if (input.u.mi.mouseData) __wine_send_input( 0, &input );
}

/* One thread owns the framebuffer and the input records, at the browser's frame rate. */
static DWORD WINAPI device_thread( void *arg )
{
    dolly_input_event event;
    uint32_t sequence = 0;
    INPUT input;

    for (;;)
    {
        while (dolly_input_next_event( input_lease, &event, 0 ) > 0)
        {
            switch (event.type)
            {
            case DOLLY_INPUT_EVENT_POINTER:
                send_pointer( &event );
                break;
            case DOLLY_INPUT_EVENT_SCROLL:
                send_scroll( &event );
                break;
            case DOLLY_INPUT_EVENT_KEY:
                if (dolly_key_input( &event, &input )) __wine_send_input( 0, &input );
                break;
            }
        }
        if (InterlockedExchange( &screen_dirty, 0 )) present_frame();
        if (dolly_display_wait_frame( display.generation, &sequence, 100 ) < 0) Sleep( 100 );
    }
    return 0;
}

/* GDI driver: a display DC has nothing of its own; windows are drawn by the DIB engine */

static const struct gdi_dc_funcs dolly_gdi_funcs;

static BOOL DOLLY_CreateDC( PHYSDEV *pdev, LPCWSTR driver, LPCWSTR device, LPCWSTR output, const DEVMODEW *init_data )
{
    PHYSDEV physdev = HeapAlloc( GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*physdev) );

    if (!physdev) return FALSE;
    push_dc_driver( pdev, physdev, &dolly_gdi_funcs );
    return TRUE;
}

static BOOL DOLLY_CreateCompatibleDC( PHYSDEV orig, PHYSDEV *pdev )
{
    return DOLLY_CreateDC( pdev, NULL, NULL, NULL, NULL );
}

static BOOL DOLLY_DeleteDC( PHYSDEV dev )
{
    HeapFree( GetProcessHeap(), 0, dev );
    return TRUE;
}

static const struct gdi_dc_funcs dolly_gdi_funcs =
{
    .pCreateCompatibleDC = DOLLY_CreateCompatibleDC,
    .pCreateDC = DOLLY_CreateDC,
    .pDeleteDC = DOLLY_DeleteDC,
    .priority = GDI_PRIORITY_GRAPHICS_DRV
};

const struct gdi_dc_funcs * CDECL DOLLY_get_gdi_driver( unsigned int version )
{
    if (version != WINE_GDI_DRIVER_VERSION)
    {
        ERR( "version mismatch, gdi32 wants %u but winedolly has %u\n", version, WINE_GDI_DRIVER_VERSION );
        return NULL;
    }
    return &dolly_gdi_funcs;
}

/* USER driver */

/* The desktop has no thread to give it a size: it gets the screen's, as in winex11. */
BOOL CDECL DOLLY_CreateDesktopWindow( HWND hwnd )
{
    unsigned int width = 0, height = 0;

    SERVER_START_REQ( get_window_rectangles )
    {
        req->handle = wine_server_user_handle( hwnd );
        req->relative = COORDS_CLIENT;
        if (!wine_server_call( req ))
        {
            width  = reply->window.right;
            height = reply->window.bottom;
        }
    }
    SERVER_END_REQ;

    if (!width && !height)
    {
        SERVER_START_REQ( set_window_pos )
        {
            req->handle        = wine_server_user_handle( hwnd );
            req->previous      = 0;
            req->swp_flags     = SWP_NOZORDER;
            req->window.left   = screen_rect.left;
            req->window.top    = screen_rect.top;
            req->window.right  = screen_rect.right;
            req->window.bottom = screen_rect.bottom;
            req->client        = req->window;
            wine_server_call( req );
        }
        SERVER_END_REQ;
    }
    return TRUE;
}

void CDECL DOLLY_DestroyWindow( HWND hwnd )
{
    struct win_data *data = get_win_data( hwnd, FALSE );

    if (!data) return;
    list_remove( &data->entry );
    if (data->surface) window_surface_release( &data->surface->header );
    HeapFree( GetProcessHeap(), 0, data );
    LeaveCriticalSection( &win_section );
    InterlockedExchange( &screen_dirty, 1 );
}

void CDECL DOLLY_WindowPosChanging( HWND hwnd, HWND insert_after, UINT swp_flags, const RECT *window_rect,
                                    const RECT *client_rect, RECT *visible_rect, struct window_surface **surface )
{
    int width = window_rect->right - window_rect->left, height = window_rect->bottom - window_rect->top;
    struct win_data *data;
    struct surface *new_surface = NULL;

    *visible_rect = *window_rect;
    if (!has_surface( hwnd ) || (swp_flags & SWP_HIDEWINDOW) || width <= 0 || height <= 0) return;

    if ((data = get_win_data( hwnd, FALSE )) && data->surface &&
        data->surface->header.rect.right == width && data->surface->header.rect.bottom == height)
    {
        new_surface = data->surface;
        window_surface_add_ref( &new_surface->header );
    }
    release_win_data( data );
    if (!new_surface)
    {
        if (!(swp_flags & SWP_SHOWWINDOW) && !(GetWindowLongW( hwnd, GWL_STYLE ) & WS_VISIBLE)) return;
        if (!(new_surface = create_surface( width, height ))) return;
    }
    if (*surface) window_surface_release( *surface );
    *surface = &new_surface->header;
}

void CDECL DOLLY_WindowPosChanged( HWND hwnd, HWND insert_after, UINT swp_flags, const RECT *window_rect,
                                   const RECT *client_rect, const RECT *visible_rect, const RECT *valid_rects,
                                   struct window_surface *surface )
{
    BOOL visible = (GetWindowLongW( hwnd, GWL_STYLE ) & WS_VISIBLE) != 0;
    struct win_data *data;

    if (!has_surface( hwnd ) || !(data = get_win_data( hwnd, TRUE ))) return;
    data->rect = *visible_rect;
    data->visible = visible;
    if (surface) window_surface_add_ref( surface );
    if (data->surface) window_surface_release( &data->surface->header );
    data->surface = surface ? get_surface( surface ) : NULL;
    release_win_data( data );
    InterlockedExchange( &screen_dirty, 1 );
}

void CDECL DOLLY_SetCursor( HCURSOR handle )
{
    uint32_t cursor = DOLLY_DISPLAY_CURSOR_DEFAULT;

    /* Dolly draws the pointer and knows five shapes */
    if (!handle) cursor = DOLLY_DISPLAY_CURSOR_HIDDEN;
    else if (handle == LoadCursorW( 0, (LPCWSTR)IDC_IBEAM )) cursor = DOLLY_DISPLAY_CURSOR_TEXT;
    else if (handle == LoadCursorW( 0, (LPCWSTR)IDC_CROSS )) cursor = DOLLY_DISPLAY_CURSOR_CROSSHAIR;
    else if (handle == LoadCursorW( 0, (LPCWSTR)IDC_HAND )) cursor = DOLLY_DISPLAY_CURSOR_POINTER;
    dolly_display_set_cursor( display.generation, cursor );
}

BOOL CDECL DOLLY_EnumDisplayMonitors( HDC hdc, LPRECT rect, MONITORENUMPROC proc, LPARAM lp )
{
    return proc( (HMONITOR)1, 0, &screen_rect, lp );
}

BOOL CDECL DOLLY_GetMonitorInfo( HMONITOR handle, LPMONITORINFO info )
{
    static const WCHAR device[] = {'\\','\\','.','\\','D','I','S','P','L','A','Y','1',0};

    if (handle != (HMONITOR)1)
    {
        SetLastError( ERROR_INVALID_HANDLE );
        return FALSE;
    }
    info->rcMonitor = info->rcWork = screen_rect;
    info->dwFlags = MONITORINFOF_PRIMARY;
    if (info->cbSize >= sizeof(MONITORINFOEXW)) lstrcpyW( ((MONITORINFOEXW *)info)->szDevice, device );
    return TRUE;
}

BOOL CDECL DOLLY_EnumDisplaySettingsEx( LPCWSTR name, DWORD n, LPDEVMODEW devmode, DWORD flags )
{
    static const WCHAR device[CCHDEVICENAME] = {'W','i','n','e',' ','D','o','l','l','y',' ','d','r','i','v','e','r',0};

    if (n != ENUM_CURRENT_SETTINGS && n != ENUM_REGISTRY_SETTINGS && n != 0)
    {
        SetLastError( ERROR_NO_MORE_FILES );
        return FALSE;
    }
    memset( devmode, 0, offsetof( DEVMODEW, dmICMMethod ) );
    devmode->dmSize = offsetof( DEVMODEW, dmICMMethod );
    devmode->dmSpecVersion = devmode->dmDriverVersion = DM_SPECVERSION;
    memcpy( devmode->dmDeviceName, device, sizeof(device) );
    devmode->dmPelsWidth = screen_rect.right;
    devmode->dmPelsHeight = screen_rect.bottom;
    devmode->dmBitsPerPel = 32;
    devmode->dmDisplayFrequency = 60;
    devmode->dmFields = DM_PELSWIDTH | DM_PELSHEIGHT | DM_BITSPERPEL | DM_DISPLAYFLAGS | DM_DISPLAYFREQUENCY;
    return TRUE;
}

BOOL WINAPI DllMain( HINSTANCE inst, DWORD reason, LPVOID reserved )
{
    int error;

    if (reason != DLL_PROCESS_ATTACH) return TRUE;
    DisableThreadLibraryCalls( inst );
    /* only the foreground program of a page with a display gets either */
    if ((error = dolly_display_acquire( &display )) || (error = dolly_input_acquire( &input_lease )))
    {
        ERR( "Dolly gives this program no display or input: %s\n", strerror( -error ) );
        return FALSE;
    }
    SetRect( &screen_rect, 0, 0, display.width, display.height );
    CloseHandle( CreateThread( NULL, 0, device_thread, NULL, 0, NULL ) );
    return TRUE;
}
