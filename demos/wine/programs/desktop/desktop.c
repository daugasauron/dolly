/* SPDX-License-Identifier: MIT
 * desktop: the shell of the Wine demo. Not Wine's explorer.exe, which needs
 * a process per program: this one draws a taskbar with a Start button, a
 * button per window and a clock, puts a shortcut per program on the desktop
 * (a comctl32 list view under every window: icons, labels, selection and
 * the rubber band are that control's), and starts the programs linked into
 * this Wine as threads of its own process (port/kernel32-program.c says
 * what that can and cannot do). It prints the list of windows whenever it
 * changes, which is how the browser test reads it. */
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <windef.h>
#include <winbase.h>
#include <wingdi.h>
#include <winuser.h>
#include <winnls.h>
#include <commctrl.h>

extern const char *wine_dolly_enum_programs( unsigned int index );
extern HANDLE wine_dolly_start_program( const WCHAR *cmdline );
extern BOOL wine_dolly_program_running( const WCHAR *name );
extern void wine_dolly_free_program_classes( HINSTANCE module );

enum { HEIGHT = 28, START_WIDTH = 60, CLOCK_WIDTH = 52, TASK_WIDTH = 160, MAX_TASKS = 32, ID_SHUT_DOWN = 99, ID_PROGRAM = 100 };

/* What the Start menu and the shortcuts start: the graphical programs linked into this Wine, and the
 * x86-64 programs of a directory, which x86emu runs. */
static const char x86_dir[] = "Z:\\usr\\share\\wine\\x86\\";
struct program
{
    char    name[64];   /* of the program, or of the file in x86_dir */
    BOOL    x86;
    HMODULE module;     /* of a program of this Wine */
    WCHAR   label[80];  /* as in the Start menu, & before its key */
};
static struct program programs[24];
static unsigned int nb_programs;

struct task
{
    HWND  hwnd;
    WCHAR title[64];
    RECT  window;   /* on the screen */
    BOOL  minimized, foreground;
};

static const WCHAR tray_class[] = {'S','h','e','l','l','_','T','r','a','y','W','n','d',0};
static HWND taskbar;
static struct task tasks[MAX_TASKS];
static unsigned int nb_tasks;
static BOOL menu_open;
static WORD shown_minute = 0xffff;

static BOOL CALLBACK add_task( HWND hwnd, LPARAM param )
{
    struct task *list = (struct task *)param, *task = &list[nb_tasks];

    if (nb_tasks == MAX_TASKS || hwnd == taskbar || !IsWindowVisible( hwnd ) || GetWindow( hwnd, GW_OWNER ) ||
        (GetWindowLongW( hwnd, GWL_EXSTYLE ) & WS_EX_TOOLWINDOW)) return TRUE;
    if (!GetWindowTextW( hwnd, task->title, ARRAY_SIZE(task->title) )) return TRUE;
    task->hwnd = hwnd;
    task->minimized = IsIconic( hwnd );
    task->foreground = hwnd == GetForegroundWindow();
    GetWindowRect( hwnd, &task->window );
    nb_tasks++;
    return TRUE;
}

static void refresh_tasks(void)
{
    struct task found[MAX_TASKS], list[MAX_TASKS];
    unsigned int i, j, count = 0, previous = nb_tasks;
    char title[200];

    memset( found, 0, sizeof(found) );
    memset( list, 0, sizeof(list) );
    nb_tasks = 0;
    EnumWindows( add_task, (LPARAM)found );
    /* buttons keep their order: the windows there already, then the new ones, whatever the Z order */
    for (i = 0; i < previous; i++)
        for (j = 0; j < nb_tasks; j++)
            if (found[j].hwnd == tasks[i].hwnd) { list[count++] = found[j]; found[j].hwnd = 0; }
    for (j = 0; j < nb_tasks; j++) if (found[j].hwnd) list[count++] = found[j];
    if (nb_tasks == previous && !memcmp( list, tasks, sizeof(list) )) return;
    memcpy( tasks, list, sizeof(list) );
    InvalidateRect( taskbar, NULL, TRUE );

    printf( "desktop: %u windows", nb_tasks );
    for (i = 0; i < nb_tasks; i++)
    {
        WideCharToMultiByte( CP_UTF8, 0, tasks[i].title, -1, title, sizeof(title), NULL, NULL );
        printf( "; \"%s\" at %d,%d%s%s", title, (int)tasks[i].window.left, (int)tasks[i].window.top,
                tasks[i].minimized ? " minimized" : "", tasks[i].foreground ? " foreground" : "" );
    }
    printf( "\n" );
    fflush( stdout );
}

static RECT task_rect( unsigned int index )
{
    RECT client, rect;
    int width;

    GetClientRect( taskbar, &client );
    width = (client.right - START_WIDTH - CLOCK_WIDTH - 16) / (nb_tasks ? nb_tasks : 1);
    if (width > TASK_WIDTH) width = TASK_WIDTH;
    SetRect( &rect, START_WIDTH + 8 + index * width, 3, START_WIDTH + 8 + (index + 1) * width - 3, HEIGHT - 2 );
    return rect;
}

static void draw_button( HDC hdc, RECT rect, const WCHAR *text, BOOL pushed, BOOL bold, HICON icon )
{
    HFONT font = GetStockObject( DEFAULT_GUI_FONT ), old;
    LOGFONTW info;

    DrawFrameControl( hdc, &rect, DFC_BUTTON, DFCS_BUTTONPUSH | (pushed ? DFCS_PUSHED : 0) );
    InflateRect( &rect, -4, -2 );
    if (pushed) OffsetRect( &rect, 1, 1 );
    if (icon)
    {
        DrawIconEx( hdc, rect.left, rect.top + (rect.bottom - rect.top - 16) / 2, icon, 16, 16, 0, 0, DI_NORMAL );
        rect.left += 20;
    }
    GetObjectW( font, sizeof(info), &info );
    if (bold) info.lfWeight = FW_BOLD;
    old = SelectObject( hdc, font = CreateFontIndirectW( &info ) );
    SetBkMode( hdc, TRANSPARENT );
    DrawTextW( hdc, text, -1, &rect, DT_SINGLELINE | DT_VCENTER | DT_END_ELLIPSIS | DT_NOPREFIX );
    DeleteObject( SelectObject( hdc, old ) );
}

static void paint( HDC hdc )
{
    static const WCHAR startW[] = {'S','t','a','r','t',0};
    static const COLORREF flag[] = { RGB(240,80,40), RGB(120,190,40), RGB(40,130,230), RGB(250,190,20) };
    RECT client, rect;
    SYSTEMTIME now;
    WCHAR text[16];
    unsigned int i;

    GetClientRect( taskbar, &client );
    FillRect( hdc, &client, GetSysColorBrush( COLOR_BTNFACE ) );
    rect = client;
    DrawEdge( hdc, &rect, EDGE_RAISED, BF_TOP );

    SetRect( &rect, 2, 3, START_WIDTH, HEIGHT - 2 );
    draw_button( hdc, rect, startW, menu_open, TRUE, 0 );
    for (i = 0; i < 4; i++)  /* four panes, where Windows has its flag */
    {
        HBRUSH brush = CreateSolidBrush( flag[i] );
        RECT pane = { 7 + (i % 2) * 7 + menu_open, 8 + (i / 2) * 7 + menu_open, 13 + (i % 2) * 7 + menu_open, 14 + (i / 2) * 7 + menu_open };
        FillRect( hdc, &pane, brush );
        DeleteObject( brush );
    }
    /* draw_button put "Start" at the left edge: the panes need its room */
    SetRect( &rect, 22 + menu_open, 4 + menu_open, START_WIDTH - 3, HEIGHT - 3 );
    FillRect( hdc, &rect, GetSysColorBrush( COLOR_BTNFACE ) );
    {
        HFONT font = GetStockObject( DEFAULT_GUI_FONT ), old;
        LOGFONTW info;
        GetObjectW( font, sizeof(info), &info );
        info.lfWeight = FW_BOLD;
        old = SelectObject( hdc, font = CreateFontIndirectW( &info ) );
        SetBkMode( hdc, TRANSPARENT );
        DrawTextW( hdc, startW, -1, &rect, DT_SINGLELINE | DT_VCENTER );
        DeleteObject( SelectObject( hdc, old ) );
    }

    for (i = 0; i < nb_tasks; i++)
    {
        HICON icon = (HICON)GetClassLongPtrW( tasks[i].hwnd, GCLP_HICONSM );
        if (!icon) icon = (HICON)GetClassLongPtrW( tasks[i].hwnd, GCLP_HICON );
        draw_button( hdc, task_rect( i ), tasks[i].title, tasks[i].foreground && !tasks[i].minimized, FALSE, icon );
    }

    SetRect( &rect, client.right - CLOCK_WIDTH - 2, 3, client.right - 2, HEIGHT - 2 );
    DrawEdge( hdc, &rect, BDR_SUNKENOUTER, BF_RECT );
    GetLocalTime( &now );
    shown_minute = now.wMinute;
    wsprintfW( text, (const WCHAR[]){'%','0','2','u',':','%','0','2','u',0}, now.wHour, now.wMinute );
    SelectObject( hdc, GetStockObject( DEFAULT_GUI_FONT ) );
    DrawTextW( hdc, text, -1, &rect, DT_SINGLELINE | DT_VCENTER | DT_CENTER );
}

/* "notepad.exe" as "&Notepad": the name with a capital, which is also its key in the menu */
static void program_label( const char *name, WCHAR *label )
{
    unsigned int i;

    if (!strcmp( name, "mspaint.exe" )) name = "paint";  /* as its own window calls it */
    if (!strcmp( name, "netsurf.exe" )) name = "net&Surf";  /* N is Notepad's key */
    if (!strcmp( name, "winefile.exe" )) name = "file Manager";  /* W is WineMine's */
    if (!strcmp( name, "gimp.exe" )) name = "gIMP";
    if (!strchr( name, '&' )) *label++ = '&';
    for (i = 0; name[i] && name[i] != '.'; i++) label[i] = i ? name[i] : name[i] - 'a' + 'A';
    label[i] = 0;
}

/* a program linked into Wine; with a file, x86emu and the x86-64 program it is to run */
static void start_program( const char *name, const char *x86_file )
{
    WCHAR nameW[64], command[MAX_PATH];
    HMODULE module;
    HANDLE thread;
    unsigned int i;

    for (i = 0; (nameW[i] = name[i]); i++) /* nothing */;
    MultiByteToWideChar( CP_ACP, 0, name, -1, command, ARRAY_SIZE(command) );
    if (x86_file)
    {
        char arguments[MAX_PATH];
        snprintf( arguments, sizeof(arguments), " %s%s", x86_dir, x86_file );
        MultiByteToWideChar( CP_ACP, 0, arguments, -1, command + i, ARRAY_SIZE(command) - i );
    }
    if (wine_dolly_program_running( nameW ))
    {
        printf( "desktop: %s is running already; a program runs once at a time\n", name );
        fflush( stdout );
        return;
    }
    /* the classes its last run registered would make the next one fail */
    if ((module = GetModuleHandleW( nameW ))) wine_dolly_free_program_classes( module );
    if ((thread = wine_dolly_start_program( command ))) CloseHandle( thread );
    printf( "desktop: %s %s\n", thread ? "started" : "could not start", name );
    fflush( stdout );
}

static void find_programs(void)
{
    static const WCHAR x86W[] = {' ','(','x','8','6','-','6','4',')',0};
    WIN32_FIND_DATAA file;
    HANDLE found;
    char pattern[MAX_PATH];
    const char *name;
    unsigned int i;

    /* the graphical ones: this one aside, and not those that only write to the terminal behind the desktop */
    nb_programs = 0;
    for (i = 0; (name = wine_dolly_enum_programs( i )) && nb_programs < ARRAY_SIZE(programs); i++)
    {
        struct program *program = &programs[nb_programs];
        IMAGE_NT_HEADERS *nt;

        MultiByteToWideChar( CP_ACP, 0, name, -1, program->label, ARRAY_SIZE(program->label) );
        if (!strcmp( name, "desktop.exe" ) || !(program->module = LoadLibraryW( program->label ))) continue;
        nt = (IMAGE_NT_HEADERS *)((char *)program->module + ((IMAGE_DOS_HEADER *)program->module)->e_lfanew);
        if (nt->OptionalHeader.Subsystem != IMAGE_SUBSYSTEM_WINDOWS_GUI) continue;
        lstrcpynA( program->name, name, sizeof(program->name) );
        program->x86 = FALSE;
        program_label( name, program->label );
        nb_programs++;
    }
    snprintf( pattern, sizeof(pattern), "%s*.exe", x86_dir );
    if ((found = FindFirstFileA( pattern, &file )) == INVALID_HANDLE_VALUE) return;
    for (; nb_programs < ARRAY_SIZE(programs); nb_programs++)
    {
        struct program *program = &programs[nb_programs];

        lstrcpynA( program->name, file.cFileName, sizeof(program->name) );
        program->x86 = TRUE;
        program->module = 0;
        program_label( file.cFileName, program->label );
        lstrcatW( program->label, x86W );
        if (!FindNextFileA( found, &file )) { nb_programs++; break; }
    }
    FindClose( found );
}

static void start( const struct program *program )
{
    if (program->x86) start_program( "x86emu.exe", program->name );
    else start_program( program->name, NULL );
}

static void start_menu(void)
{
    static const WCHAR shut_downW[] = {'S','h','&','u','t',' ','D','o','w','n',0};
    HMENU menu = CreatePopupMenu();
    HWND foreground = GetForegroundWindow();
    RECT rect;
    unsigned int i;
    int command;

    find_programs();
    for (i = 0; i < nb_programs; i++) AppendMenuW( menu, MF_STRING, ID_PROGRAM + i, programs[i].label );
    AppendMenuW( menu, MF_SEPARATOR, 0, NULL );
    AppendMenuW( menu, MF_STRING, ID_SHUT_DOWN, shut_downW );

    menu_open = TRUE;
    InvalidateRect( taskbar, NULL, FALSE );
    UpdateWindow( taskbar );
    GetWindowRect( taskbar, &rect );
    SetForegroundWindow( taskbar );  /* the menu's keys come to this thread */
    command = TrackPopupMenu( menu, TPM_RETURNCMD | TPM_NONOTIFY | TPM_LEFTALIGN | TPM_BOTTOMALIGN, rect.left, rect.top, 0, taskbar, NULL );
    DestroyMenu( menu );
    menu_open = FALSE;
    InvalidateRect( taskbar, NULL, FALSE );

    if (command == ID_SHUT_DOWN) PostQuitMessage( 0 );
    else if (command >= ID_PROGRAM) start( &programs[command - ID_PROGRAM] );
    else if (foreground) SetForegroundWindow( foreground );
}

static void click_task( const struct task *task )
{
    if (!IsIconic( task->hwnd ) && task->hwnd == GetForegroundWindow())
    {
        ShowWindowAsync( task->hwnd, SW_MINIMIZE );
        return;
    }
    if (IsIconic( task->hwnd )) ShowWindowAsync( task->hwnd, SW_RESTORE );
    SetWindowPos( task->hwnd, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS );
    SetForegroundWindow( task->hwnd );
}

static LRESULT CALLBACK taskbar_proc( HWND hwnd, UINT message, WPARAM wparam, LPARAM lparam )
{
    switch (message)
    {
    case WM_PAINT:
    {
        PAINTSTRUCT ps;
        paint( BeginPaint( hwnd, &ps ) );
        EndPaint( hwnd, &ps );
        return 0;
    }
    case WM_MOUSEACTIVATE:
        return MA_NOACTIVATE;  /* a click on the taskbar leaves the foreground where it is */
    case WM_LBUTTONDOWN:
    {
        POINT pt = { (short)LOWORD(lparam), (short)HIWORD(lparam) };
        unsigned int i;
        RECT rect;

        if (pt.x < START_WIDTH) start_menu();
        else for (i = 0; i < nb_tasks; i++)
        {
            rect = task_rect( i );
            if (PtInRect( &rect, pt )) click_task( &tasks[i] );
        }
        return 0;
    }
    case WM_TIMER:
    {
        SYSTEMTIME now;
        refresh_tasks();
        GetLocalTime( &now );
        if (now.wMinute != shown_minute) InvalidateRect( hwnd, NULL, FALSE );
        return 0;
    }
    case WM_DESTROY:
        PostQuitMessage( 0 );
        return 0;
    }
    return DefWindowProcW( hwnd, message, wparam, lparam );
}

/* The desktop's shortcuts: a list view in a window that stays under every other. */

static HWND shortcuts;

static BOOL CALLBACK first_icon( HMODULE module, const WCHAR *type, WCHAR *name, LONG_PTR icon )
{
    *(HICON *)icon = LoadImageW( module, name, IMAGE_ICON, 32, 32, 0 );
    return FALSE;
}

static LRESULT CALLBACK progman_proc( HWND hwnd, UINT message, WPARAM wparam, LPARAM lparam )
{
    switch (message)
    {
    case WM_WINDOWPOSCHANGING:  /* whoever raises it */
        ((WINDOWPOS *)lparam)->hwndInsertAfter = HWND_BOTTOM;
        return 0;
    case WM_SETFOCUS:
        SetFocus( shortcuts );
        return 0;
    case WM_NOTIFY:  /* a double click on a shortcut, or Enter: the control names the item only for the first */
        if (((NMHDR *)lparam)->code == LVN_ITEMACTIVATE)
        {
            int item = SendMessageW( shortcuts, LVM_GETNEXTITEM, -1, LVNI_FOCUSED );
            if (item >= 0) start( &programs[item] );
        }
        return 0;
    case WM_CLOSE:  /* Alt+F4 closes programs, not the desktop */
        return 0;
    }
    return DefWindowProcW( hwnd, message, wparam, lparam );
}

static void create_shortcuts( HINSTANCE instance )
{
    static const WCHAR progman_class[] = {'P','r','o','g','m','a','n',0};
    int width = GetSystemMetrics( SM_CXSCREEN ), height = GetSystemMetrics( SM_CYSCREEN ) - HEIGHT;
    HIMAGELIST icons = ImageList_Create( 32, 32, ILC_COLOR32 | ILC_MASK, 8, 8 );
    WNDCLASSW class = { 0 };
    LVITEMW item = { LVIF_TEXT | LVIF_IMAGE };
    WCHAR text[80];
    unsigned int i, j;
    HWND progman;

    class.lpfnWndProc = progman_proc;
    class.hInstance = instance;
    class.lpszClassName = progman_class;
    RegisterClassW( &class );
    InitCommonControls();
    progman = CreateWindowExW( 0, progman_class, NULL, WS_POPUP | WS_VISIBLE | WS_CLIPCHILDREN, 0, 0, width, height, 0, 0, instance, NULL );
    shortcuts = CreateWindowExW( 0, WC_LISTVIEWW, NULL, WS_CHILD | WS_VISIBLE | LVS_ICON | LVS_ALIGNLEFT | LVS_AUTOARRANGE,
                                 0, 0, width, height, progman, 0, instance, NULL );
    SendMessageW( shortcuts, LVM_SETBKCOLOR, 0, GetSysColor( COLOR_DESKTOP ) );
    SendMessageW( shortcuts, LVM_SETTEXTBKCOLOR, 0, GetSysColor( COLOR_DESKTOP ) );
    SendMessageW( shortcuts, LVM_SETTEXTCOLOR, 0, RGB(255,255,255) );
    SendMessageW( shortcuts, LVM_SETIMAGELIST, LVSIL_NORMAL, (LPARAM)icons );

    find_programs();
    for (item.iItem = 0; item.iItem < nb_programs; item.iItem++)
    {
        const struct program *program = &programs[item.iItem];
        HICON icon = 0;

        /* its own first icon; an x86-64 file's is not read */
        if (program->module) EnumResourceNamesW( program->module, (const WCHAR *)RT_GROUP_ICON, first_icon, (LONG_PTR)&icon );
        if (!icon) icon = LoadIconW( 0, (const WCHAR *)IDI_APPLICATION );
        for (i = j = 0; program->label[i]; i++) if (program->label[i] != '&') text[j++] = program->label[i];
        text[j] = 0;
        item.iImage = ImageList_ReplaceIcon( icons, -1, icon );
        item.pszText = text;
        SendMessageW( shortcuts, LVM_INSERTITEMW, 0, (LPARAM)&item );
    }
}

int WINAPI WinMain( HINSTANCE instance, HINSTANCE previous, LPSTR cmdline, int show )
{
    WNDCLASSW class = { 0 };
    MINIMIZEDMETRICS metrics = { sizeof(metrics) };
    MSG msg;

    class.lpfnWndProc = taskbar_proc;
    class.hInstance = instance;
    class.hCursor = LoadCursorW( 0, (const WCHAR *)IDC_ARROW );
    class.lpszClassName = tray_class;
    if (!RegisterClassW( &class )) return 1;

    /* with a taskbar, a minimized window is hidden and its button brings it back */
    SystemParametersInfoW( SPI_GETMINIMIZEDMETRICS, sizeof(metrics), &metrics, 0 );
    metrics.iArrange |= ARW_HIDE;
    SystemParametersInfoW( SPI_SETMINIMIZEDMETRICS, sizeof(metrics), &metrics, 0 );

    taskbar = CreateWindowExW( WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, tray_class, NULL, WS_POPUP | WS_VISIBLE,
                               0, GetSystemMetrics( SM_CYSCREEN ) - HEIGHT, GetSystemMetrics( SM_CXSCREEN ), HEIGHT,
                               0, 0, instance, NULL );
    if (!taskbar) return 1;
    create_shortcuts( instance );
    SetTimer( taskbar, 1, 250, NULL );
    printf( "desktop: ready\n" );
    fflush( stdout );

    /* a program named on the command line starts with the desktop */
    while (*cmdline == ' ') cmdline++;
    if (*cmdline) start_program( cmdline, NULL );

    while (GetMessageW( &msg, 0, 0, 0 ) > 0)
    {
        TranslateMessage( &msg );
        DispatchMessageW( &msg );
    }
    return 0;
}
