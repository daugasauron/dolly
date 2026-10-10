/* SPDX-License-Identifier: MIT
 * desktop: the shell of the Wine demo. Not Wine's explorer.exe, which needs
 * a process per program: this one draws a taskbar with a Start button, a
 * button per window and a clock, shows the files of the user's Desktop
 * folder on the desktop (a comctl32 list view under every window: icons,
 * labels, selection and the rubber band are that control's; a shortcut is
 * read and written by shell32), and starts the programs linked into this
 * Wine as threads of its own process (port/kernel32-program.c says what
 * that can and cannot do). It prints the list of windows whenever it
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
#include <winreg.h>
#include <commctrl.h>
#include <commdlg.h>
#include <shlobj.h>

extern const char *wine_dolly_enum_programs( unsigned int index );
extern HANDLE wine_dolly_start_program( const WCHAR *cmdline );
/* shell32 (port/shell32-dolly.c) */
extern HANDLE wine_dolly_open_file( const WCHAR *path );
extern BOOL wine_dolly_read_shortcut( const WCHAR *file, WCHAR *target, WCHAR *arguments );
extern BOOL wine_dolly_write_shortcut( const WCHAR *file, const WCHAR *target );

enum { HEIGHT = 28, START_WIDTH = 60, CLOCK_WIDTH = 52, TASK_WIDTH = 160, MAX_TASKS = 32, ID_SHUT_DOWN = 99, ID_PROGRAM = 100 };

/* What the Start menu and the shortcuts start: the graphical programs linked into this Wine, and the
 * x86-64 programs of a directory, which x86emu runs. */
static const char x86_dir[] = "Z:\\usr\\share\\wine\\x86\\";
static char home_dir[MAX_PATH];  /* the user's, where programs start: the current directory is every program's */
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
    if (!strcmp( name, "wineconsole.exe" )) name = "command Prompt";
    if (!strchr( name, '&' )) *label++ = '&';
    for (i = 0; name[i] && name[i] != '.'; i++) label[i] = i ? name[i] : name[i] - 'a' + 'A';
    label[i] = 0;
}

/* What a start came to: a line for the terminal behind the desktop and, where the user is, what one
 * process cannot do. */
static void report_start( HANDLE thread, const char *name, BOOL x86 )
{
    DWORD error = GetLastError();
    char text[200];

    printf( "desktop: %s %s\n", thread ? "started" : "could not start", name );
    fflush( stdout );
    if (thread)
    {
        CloseHandle( thread );
        return;
    }
    if (error == ERROR_BUSY)
        lstrcpynA( text, x86 ? "An x86-64 program is running: this Wine interprets one at a time."
                             : "It is running: in this Wine, which is one process, a program runs once at a time.", sizeof(text) );
    else FormatMessageA( FORMAT_MESSAGE_FROM_SYSTEM, NULL, error, 0, text, sizeof(text), NULL );
    MessageBoxA( 0, text, name, MB_OK | MB_ICONEXCLAMATION | MB_SETFOREGROUND );
}

/* a program linked into Wine; with a file, x86emu and the x86-64 program it is to run */
static void start_program( const char *name, const char *x86_file )
{
    WCHAR command[MAX_PATH];
    unsigned int i = MultiByteToWideChar( CP_ACP, 0, name, -1, command, ARRAY_SIZE(command) ) - 1;

    if (x86_file)
    {
        char arguments[MAX_PATH];
        snprintf( arguments, sizeof(arguments), " %s%s", x86_dir, x86_file );
        MultiByteToWideChar( CP_ACP, 0, arguments, -1, command + i, ARRAY_SIZE(command) - i );
    }
    SetCurrentDirectoryA( home_dir );
    report_start( wine_dolly_start_program( command ), x86_file ? x86_file : name, x86_file != NULL );
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

static void read_desktop(void);

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
        read_desktop();
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

/* The desktop's folder: its files are the icons of a list view in a window that stays under every
 * other. Which folder, shell32 says (CSIDL_DESKTOPDIRECTORY). */

struct entry
{
    WCHAR name[MAX_PATH];    /* of the file */
    WCHAR target[MAX_PATH];  /* what opening it opens: the file, or what a shortcut names */
};
static struct entry entries[64];
static unsigned int nb_entries;
static WCHAR desktop_dir[MAX_PATH];
static HWND shortcuts;
static HIMAGELIST icons;

static const WCHAR *base_name( const WCHAR *path )
{
    const WCHAR *name = path;

    for (; *path; path++) if (*path == '\\') name = path + 1;
    return name;
}

static WCHAR *extension( WCHAR *name )
{
    WCHAR *dot = name + lstrlenW( name );

    for (; *name; name++) if (*name == '.') dot = name;
    return dot;
}

static BOOL CALLBACK first_icon( HMODULE module, const WCHAR *type, WCHAR *name, LONG_PTR icon )
{
    *(HICON *)icon = LoadImageW( module, name, IMAGE_ICON, 32, 32, 0 );
    return FALSE;
}

/* A program of this Wine has its first icon; an x86-64 file's is not read. */
static HICON entry_icon( struct entry *entry )
{
    static const WCHAR exeW[] = {'.','e','x','e',0};
    DWORD attributes = GetFileAttributesW( entry->target );
    HMODULE module, shell32 = GetModuleHandleA( "shell32.dll" );
    HICON icon = 0;

    if (attributes == INVALID_FILE_ATTRIBUTES)
    {
        if ((module = LoadLibraryW( base_name( entry->target ) )))
            EnumResourceNamesW( module, (const WCHAR *)RT_GROUP_ICON, first_icon, (LONG_PTR)&icon );
    }
    else if (attributes & FILE_ATTRIBUTE_DIRECTORY) icon = LoadImageW( shell32, MAKEINTRESOURCEW(4), IMAGE_ICON, 32, 32, 0 );
    else if (lstrcmpiW( extension( entry->target ), exeW )) icon = LoadImageW( shell32, MAKEINTRESOURCEW(2), IMAGE_ICON, 32, 32, 0 );
    return icon ? icon : LoadIconW( 0, (const WCHAR *)IDI_APPLICATION );
}

static int compare_names( const void *a, const void *b )
{
    return lstrcmpiW( a, b );
}

/* The folder's files as the list's items, by name, whenever they are not the ones shown: nothing
 * tells this Wine of a change in a directory, so the taskbar's timer asks. */
static void read_desktop(void)
{
    static const WCHAR allW[] = {'%','s','\\','*',0}, fileW[] = {'%','s','\\','%','s',0}, lnkW[] = {'.','l','n','k',0};
    static WCHAR found[ARRAY_SIZE(entries)][MAX_PATH];
    WIN32_FIND_DATAW file;
    WCHAR path[2 * MAX_PATH], label[MAX_PATH], arguments[MAX_PATH];
    HANDLE handle;
    unsigned int i, count = 0;

    wsprintfW( path, allW, desktop_dir );
    if ((handle = FindFirstFileW( path, &file )) != INVALID_HANDLE_VALUE)
    {
        do if (file.cFileName[0] != '.') lstrcpyW( found[count++], file.cFileName );  /* not . and .., nor what Unix hides */
        while (count < ARRAY_SIZE(found) && FindNextFileW( handle, &file ));
        FindClose( handle );
    }
    qsort( found, count, sizeof(found[0]), compare_names );
    for (i = 0; i < count && i < nb_entries && !lstrcmpW( found[i], entries[i].name ); i++) /* nothing */;
    if (i == count && count == nb_entries) return;

    SendMessageW( shortcuts, LVM_DELETEALLITEMS, 0, 0 );
    ImageList_RemoveAll( icons );
    for (i = 0; i < count; i++)
    {
        struct entry *entry = &entries[i];
        LVITEMW item = { LVIF_TEXT | LVIF_IMAGE, i };
        HICON icon;

        lstrcpyW( entry->name, found[i] );
        lstrcpyW( label, found[i] );
        wsprintfW( path, fileW, desktop_dir, found[i] );
        /* a shortcut shows without its extension, as on Windows */
        if (!lstrcmpiW( extension( label ), lnkW ) && wine_dolly_read_shortcut( path, entry->target, arguments )) *extension( label ) = 0;
        else lstrcpynW( entry->target, path, MAX_PATH );
        item.iImage = ImageList_ReplaceIcon( icons, -1, icon = entry_icon( entry ) );
        DestroyIcon( icon );
        item.pszText = label;
        SendMessageW( shortcuts, LVM_INSERTITEMW, 0, (LPARAM)&item );
    }
    nb_entries = count;
}

/* An icon opens as its file does in the file manager, from the user's directory. */
static void open_entry( struct entry *entry )
{
    static const WCHAR fileW[] = {'%','s','\\','%','s',0}, exeW[] = {'.','e','x','e',0};
    WCHAR path[2 * MAX_PATH];
    char name[MAX_PATH];

    wsprintfW( path, fileW, desktop_dir, entry->name );
    WideCharToMultiByte( CP_ACP, 0, entry->name, -1, name, sizeof(name), NULL, NULL );
    SetCurrentDirectoryA( home_dir );
    report_start( wine_dolly_open_file( path ), name,
                  GetFileAttributesW( entry->target ) != INVALID_FILE_ATTRIBUTES && !lstrcmpiW( extension( entry->target ), exeW ) );
}

/* The desktop's menu: a shortcut to a file chosen in the file dialog. */
static void desktop_menu( HWND hwnd, int x, int y )
{
    static const WCHAR newW[] = {'&','N','e','w',' ','S','h','o','r','t','c','u','t','.','.','.',0};
    static const WCHAR lnkW[] = {'%','s','\\','%','s','.','l','n','k',0};
    WCHAR target[MAX_PATH] = {0}, title[MAX_PATH], file[2 * MAX_PATH];
    OPENFILENAMEW dialog = { sizeof(dialog) };
    HMENU menu = CreatePopupMenu();
    int command;

    AppendMenuW( menu, MF_STRING, 1, newW );
    command = TrackPopupMenu( menu, TPM_RETURNCMD | TPM_NONOTIFY, x, y, 0, hwnd, NULL );
    DestroyMenu( menu );
    dialog.lpstrFile = target;
    dialog.nMaxFile = ARRAY_SIZE(target);
    dialog.lpstrFileTitle = title;
    dialog.nMaxFileTitle = ARRAY_SIZE(title);
    dialog.lpstrTitle = newW + 1;
    dialog.Flags = OFN_FILEMUSTEXIST | OFN_HIDEREADONLY | OFN_NOCHANGEDIR;  /* the directory is every program's */
    SetCurrentDirectoryA( home_dir );
    if (command != 1 || !GetOpenFileNameW( &dialog )) return;
    *extension( title ) = 0;
    wsprintfW( file, lnkW, desktop_dir, title );
    if (!wine_dolly_write_shortcut( file, target )) MessageBoxW( 0, file, NULL, MB_OK | MB_ICONERROR | MB_SETFOREGROUND );
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
    case WM_NOTIFY:  /* a double click on an icon, or Enter: the control names the item only for the first */
        if (((NMHDR *)lparam)->code == LVN_ITEMACTIVATE)
        {
            int item = SendMessageW( shortcuts, LVM_GETNEXTITEM, -1, LVNI_FOCUSED );
            if (item >= 0) open_entry( &entries[item] );
        }
        return 0;
    case WM_CONTEXTMENU:
        desktop_menu( hwnd, (short)LOWORD(lparam), (short)HIWORD(lparam) );
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
    WNDCLASSW class = { 0 };
    HWND progman;

    class.lpfnWndProc = progman_proc;
    class.hInstance = instance;
    class.lpszClassName = progman_class;
    RegisterClassW( &class );
    InitCommonControls();
    progman = CreateWindowExW( 0, progman_class, NULL, WS_POPUP | WS_VISIBLE | WS_CLIPCHILDREN, 0, 0, width, height, 0, 0, instance, NULL );
    shortcuts = CreateWindowExW( 0, WC_LISTVIEWW, NULL, WS_CHILD | WS_VISIBLE | LVS_ICON | LVS_ALIGNLEFT | LVS_AUTOARRANGE,
                                 0, 0, width, height, progman, 0, instance, NULL );
    icons = ImageList_Create( 32, 32, ILC_COLOR32 | ILC_MASK, 8, 8 );
    SendMessageW( shortcuts, LVM_SETBKCOLOR, 0, GetSysColor( COLOR_DESKTOP ) );
    SendMessageW( shortcuts, LVM_SETTEXTBKCOLOR, 0, GetSysColor( COLOR_DESKTOP ) );
    SendMessageW( shortcuts, LVM_SETTEXTCOLOR, 0, RGB(255,255,255) );
    SendMessageW( shortcuts, LVM_SETIMAGELIST, LVSIL_NORMAL, (LPARAM)icons );
    read_desktop();
}

/* "desktop /shortcuts", when the image is built: a shortcut in the folder to each program of the Start menu. */
static void write_default_shortcuts(void)
{
    static const WCHAR x86W[] = {'%','S','%','S',0}, lnkW[] = {'%','s','\\','%','s','.','l','n','k',0};
    WCHAR target[MAX_PATH], label[80], file[2 * MAX_PATH];
    unsigned int i, j, k;

    find_programs();
    for (i = 0; i < nb_programs; i++)
    {
        if (programs[i].x86) wsprintfW( target, x86W, x86_dir, programs[i].name );
        else GetModuleFileNameW( programs[i].module, target, ARRAY_SIZE(target) );
        for (j = k = 0; programs[i].label[j]; j++) if (programs[i].label[j] != '&') label[k++] = programs[i].label[j];
        label[k] = 0;
        wsprintfW( file, lnkW, desktop_dir, label );
        if (!wine_dolly_write_shortcut( file, target )) ExitProcess( 1 );
    }
}

/* The user's directory is where programs start, as from shortcuts on Windows; the Desktop folder is
 * in it, where a prompt reaches it by its name (shell32 has it from the registry); and the x86-64
 * compiler is a command of the terminal. */
static void set_environment(void)
{
    char path[2048], *p;
    const char *home = getenv( "HOME" );
    HKEY key;

    snprintf( home_dir, sizeof(home_dir), "Z:%s", home ? home : "" );
    for (p = home_dir; *p; p++) if (*p == '/') *p = '\\';
    snprintf( path, sizeof(path), "%s\\Desktop", home_dir );
    if (!RegCreateKeyA( HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders", &key ))
    {
        RegSetValueExA( key, "Desktop", 0, REG_SZ, (BYTE *)path, strlen( path ) + 1 );
        RegCloseKey( key );
    }
    SHGetFolderPathW( 0, CSIDL_DESKTOPDIRECTORY | CSIDL_FLAG_CREATE, 0, SHGFP_TYPE_CURRENT, desktop_dir );
    p = path + GetEnvironmentVariableA( "PATH", path, sizeof(path) - sizeof(x86_dir) - 8 );
    sprintf( p, ";%stcc", x86_dir );
    SetEnvironmentVariableA( "PATH", path );
}

int WINAPI WinMain( HINSTANCE instance, HINSTANCE previous, LPSTR cmdline, int show )
{
    WNDCLASSW class = { 0 };
    MINIMIZEDMETRICS metrics = { sizeof(metrics) };
    MSG msg;

    set_environment();
    if (!strcmp( cmdline, "/shortcuts" ))
    {
        write_default_shortcuts();
        return 0;
    }

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
