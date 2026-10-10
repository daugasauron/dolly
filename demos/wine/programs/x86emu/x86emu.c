/* SPDX-License-Identifier: MIT
 * x86emu: runs an x86-64 Windows program in this Wine. The program's image
 * is loaded into this process's memory, where it was linked to be or, if it
 * has relocations, anywhere; its code is interpreted (cpu.c); and what it
 * imports are the functions of Wine's own DLLs, which are WebAssembly: a
 * call out of the guest takes its arguments from the Win64 registers and
 * stack and makes the call of the type the module's description records
 * (winebuild-dolly.c).
 *
 * An x86 DLL found beside the program is loaded the same way. Wine cannot
 * call a guest address (to WebAssembly it is not a function: the call
 * traps), so where the guest hands Wine a function, Wine is given one of
 * ours that runs the guest's: window procedures of registered classes,
 * qsort's comparison, the C runtime's tables of initializers and exit
 * functions. Any other callback is not done, and traps.
 *
 * Also not done: threads, exceptions (a guest's filters, function tables
 * and math-error handler are not registered, as nothing would call them),
 * TLS callbacks, 32-bit programs, x87 and SSE arithmetic. The memory of a
 * relocated image and the stack are not returned when the program ends.
 *
 *   x86emu [--stats] PROGRAM.EXE [ARGUMENT...]   (--stats names each call out of the guest and counts instructions)
 *   x86emu --bench                   (times the interpreter on a loop) */
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <windef.h>
#include <winbase.h>
#include <wingdi.h>
#include <winuser.h>
#include <winnls.h>
#include <winternl.h>

#include "x86emu.h"

extern int wine_dolly_call_type( const char *type, unsigned int len );
extern int wine_dolly_call( int type, void *func, const unsigned long long *a, const unsigned long long *x, unsigned long long *ret );
extern void wine_dolly_free_program_classes( HINSTANCE module );
extern char __global_base[];  /* where this program's own data starts: below it, from 64 KiB, nothing lives */
extern char **environ;

struct import;
/* What x86emu does itself for an import; TRUE when that was the whole call, with rax set. */
typedef BOOL special_func( struct cpu *cpu, struct import *import, unsigned long long *a );

/* What a guest call lands on: its address is what the import table holds. */
struct import
{
    void       *func;
    const char *type;       /* as in the module description; a final dot marks a variadic function */
    int         call;       /* its number for wine_dolly_call */
    BOOL        wide;       /* a variadic function whose format is UTF-16 */
    BOOL        scan;       /* one of the scanf family: every argument is a pointer */
    special_func *special;
    char        name[64];
};

/* An x86 image: the program first, then its x86 DLLs. */
struct module
{
    char *base;
    const IMAGE_NT_HEADERS64 *nt;
    char  path[MAX_PATH];
};

static BOOL trace;  /* --stats: name each call out of the guest */
static struct import imports[2048];
static unsigned int nb_imports = 1;  /* the first is where a call into the guest returns to */
static struct module modules[8];
static unsigned int nb_modules;
static struct cpu the_cpu;
static int guest_argc;
static char **guest_argv;

static BOOL run( struct cpu *cpu );
static struct module *load_module( const char *path );

/* Call a guest function of up to four arguments from here, as Wine would call it. */
static uint64_t call_guest( uint64_t func, const uint64_t *args, unsigned int count )
{
    static const unsigned char regs[] = { RCX, RDX, R8, R9 };
    struct cpu *cpu = &the_cpu;
    uint64_t rip = cpu->rip, rsp = cpu->r[RSP], *stack = (uint64_t *)((rsp & ~15ull) - 0x48);
    unsigned int i;

    for (i = 0; i < count; i++) cpu->r[regs[i]] = args[i];
    stack[0] = (uint64_t)imports;  /* the return address; the four homes are above it */
    cpu->r[RSP] = (uint64_t)stack;
    cpu->rip = func;
    if (!run( cpu )) ExitProcess( 1 );  /* Wine's frames below this one cannot be unwound */
    cpu->rip = rip;
    cpu->r[RSP] = rsp;
    return cpu->r[RAX];
}

/* Window procedures: Wine gets one of these for each of the guest's. */
static uint64_t guest_wndprocs[16];

static LRESULT call_wndproc( unsigned int index, HWND hwnd, UINT msg, WPARAM wp, LPARAM lp )
{
    uint64_t args[4] = { (uint64_t)hwnd, msg, wp, (uint64_t)lp };
    return call_guest( guest_wndprocs[index], args, 4 );
}

#define WNDPROC_LIST(X) X(0) X(1) X(2) X(3) X(4) X(5) X(6) X(7) X(8) X(9) X(10) X(11) X(12) X(13) X(14) X(15)
#define X(n) static LRESULT CALLBACK wndproc_##n( HWND hwnd, UINT msg, WPARAM wp, LPARAM lp ) { return call_wndproc( n, hwnd, msg, wp, lp ); }
WNDPROC_LIST(X)
#undef X
#define X(n) wndproc_##n,
static const WNDPROC wndprocs[] = { WNDPROC_LIST(X) };
#undef X

static WNDPROC host_wndproc( uint64_t guest )
{
    unsigned int i;

    if (guest >= (uint64_t)imports && guest < (uint64_t)(imports + nb_imports)) return ((struct import *)guest)->func;  /* Wine's own */
    for (i = 0; i < ARRAY_SIZE(wndprocs) && guest_wndprocs[i] && guest_wndprocs[i] != guest; i++) {}
    if (i == ARRAY_SIZE(wndprocs)) return NULL;
    guest_wndprocs[i] = guest;
    return wndprocs[i];
}

/* RegisterClass[Ex][AW]: in both structures the window procedure is the second 8 bytes */
static BOOL special_register_class( struct cpu *cpu, struct import *import, unsigned long long *a )
{
    static uint64_t copy[sizeof(WNDCLASSEXW) / 8];

    memcpy( copy, (void *)a[0], strstr( import->name, "Ex" ) ? sizeof(WNDCLASSEXW) : sizeof(WNDCLASSW) );
    if (!(copy[1] = (uint64_t)host_wndproc( copy[1] )))
    {
        fprintf( stderr, "x86emu: more than %u window procedures\n", (unsigned)ARRAY_SIZE(wndprocs) );
        SetLastError( ERROR_NOT_ENOUGH_MEMORY );
        cpu->r[RAX] = 0;
        return TRUE;
    }
    a[0] = (uint64_t)copy;
    return FALSE;
}

static uint64_t guest_compare;

static int compare( const void *a, const void *b )
{
    uint64_t args[2] = { (uint64_t)a, (uint64_t)b };
    return (int)call_guest( guest_compare, args, 2 );
}

static BOOL special_qsort( struct cpu *cpu, struct import *import, unsigned long long *a )
{
    guest_compare = a[3];
    a[3] = (uint64_t)compare;
    return FALSE;
}

/* _initterm( first, last ): the guest's initializers */
static BOOL special_initterm( struct cpu *cpu, struct import *import, unsigned long long *a )
{
    uint64_t *entry;
    for (entry = (uint64_t *)a[0]; entry < (uint64_t *)a[1]; entry++) if (*entry) call_guest( *entry, NULL, 0 );
    return TRUE;
}

static uint64_t exit_funcs[32];
static unsigned int nb_exit_funcs;

static BOOL special_onexit( struct cpu *cpu, struct import *import, unsigned long long *a )
{
    cpu->r[RAX] = nb_exit_funcs < ARRAY_SIZE(exit_funcs) ? (exit_funcs[nb_exit_funcs++] = a[0]) : 0;
    return TRUE;
}

/* exit, _cexit: the guest's exit functions first, then Wine's */
static BOOL special_exit( struct cpu *cpu, struct import *import, unsigned long long *a )
{
    while (nb_exit_funcs) call_guest( exit_funcs[--nb_exit_funcs], NULL, 0 );
    return FALSE;
}

/* _setjmp( buffer, frame ): the registers a guest longjmp restores, in the layout of Windows */
static BOOL special_setjmp( struct cpu *cpu, struct import *import, unsigned long long *a )
{
    static const unsigned char saved[] = { RBX, RSP, RBP, RSI, RDI, 12, 13, 14, 15 };
    uint64_t *buffer = (uint64_t *)a[0];
    unsigned int i;

    buffer[0] = a[1];
    for (i = 0; i < ARRAY_SIZE(saved); i++) buffer[1 + i] = cpu->r[saved[i]];
    buffer[2] += 8;  /* rsp as it is once this call has returned */
    buffer[10] = *(uint64_t *)cpu->r[RSP];
    buffer[11] = 0x027f00001f80ull;  /* MxCsr, FpCsr */
    memcpy( buffer + 12, cpu->xmm[6], 10 * 16 );
    cpu->r[RAX] = 0;
    return TRUE;
}

static BOOL special_getmainargs( struct cpu *cpu, struct import *import, unsigned long long *a )
{
    *(int *)a[0] = guest_argc;
    *(char ***)a[1] = guest_argv;
    *(char ***)a[2] = environ;
    cpu->r[RAX] = 0;
    return TRUE;
}

/* the command line without x86emu and its option */
#define SKIP_WORD(p) do { if (*p == '"') { for (p++; *p && *p != '"'; p++) {} if (*p) p++; } else while (*p && *p != ' ') p++; while (*p == ' ') p++; } while (0)

static BOOL special_command_line( struct cpu *cpu, struct import *import, unsigned long long *a )
{
    if (import->wide) { WCHAR *p = GetCommandLineW(); SKIP_WORD(p); if (trace) SKIP_WORD(p); cpu->r[RAX] = (uint64_t)p; }
    else { char *p = GetCommandLineA(); SKIP_WORD(p); if (trace) SKIP_WORD(p); cpu->r[RAX] = (uint64_t)p; }
    return TRUE;
}

static struct module *guest_module( uint64_t handle )
{
    unsigned int i;
    if (!handle) return &modules[0];
    for (i = 0; i < nb_modules; i++) if ((uint64_t)modules[i].base == handle) return &modules[i];
    return NULL;
}

/* GetModuleHandle[AW]( NULL ) is the program, not x86emu */
static BOOL special_module_handle( struct cpu *cpu, struct import *import, unsigned long long *a )
{
    if (a[0]) return FALSE;
    cpu->r[RAX] = (uint64_t)modules[0].base;
    return TRUE;
}

/* GetModuleFileName[AW]: Wine's loader does not know the x86 images */
static BOOL special_module_file_name( struct cpu *cpu, struct import *import, unsigned long long *a )
{
    struct module *module = guest_module( a[0] );

    if (!module) return FALSE;
    if (!a[2]) cpu->r[RAX] = 0;
    else if (import->wide) cpu->r[RAX] = MultiByteToWideChar( CP_ACP, 0, module->path, -1, (WCHAR *)a[1], (int)a[2] ) - 1;
    else cpu->r[RAX] = strlen( lstrcpynA( (char *)a[1], module->path, (int)a[2] ) );
    return TRUE;
}

/* registrations of guest functions that nothing here would ever call: none is made */
static BOOL special_refuse( struct cpu *cpu, struct import *import, unsigned long long *a )
{
    cpu->r[RAX] = 0;
    return TRUE;
}

static const struct { const char *name; special_func *special; } specials[] =
{
    { "RegisterClassA", special_register_class }, { "RegisterClassW", special_register_class },
    { "RegisterClassExA", special_register_class }, { "RegisterClassExW", special_register_class },
    { "qsort", special_qsort }, { "_initterm", special_initterm }, { "_onexit", special_onexit },
    { "exit", special_exit }, { "_cexit", special_exit }, { "_setjmp", special_setjmp },
    { "__getmainargs", special_getmainargs },
    { "GetCommandLineA", special_command_line }, { "GetCommandLineW", special_command_line },
    { "GetModuleHandleA", special_module_handle }, { "GetModuleHandleW", special_module_handle },
    { "GetModuleFileNameA", special_module_file_name }, { "GetModuleFileNameW", special_module_file_name },
    { "RtlAddFunctionTable", special_refuse }, { "SetUnhandledExceptionFilter", special_refuse },
    { "__setusermatherr", special_refuse },
};

/* the function and type of an export, through the directory of types of a module linked into Wine */
static BOOL find_export( HMODULE module, const char *name, struct import *import )
{
    IMAGE_NT_HEADERS *nt = RtlImageNtHeader( module );
    const IMAGE_DATA_DIRECTORY *dir = &nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXPORT];
    const IMAGE_DATA_DIRECTORY *types_dir = &nt->OptionalHeader.DataDirectory[15];
    IMAGE_EXPORT_DIRECTORY *exports = (void *)((char *)module + dir->VirtualAddress);
    const DWORD *names, *functions;
    const WORD *ordinals;
    const char **types = (void *)((char *)module + types_dir->VirtualAddress), *forward;
    unsigned int i, index;

    if (!dir->Size || !types_dir->Size) return FALSE;
    names = (void *)((char *)module + exports->AddressOfNames);
    ordinals = (void *)((char *)module + exports->AddressOfNameOrdinals);
    functions = (void *)((char *)module + exports->AddressOfFunctions);
    for (i = 0; i < exports->NumberOfNames; i++) if (!strcmp( (char *)module + names[i], name )) break;
    if (i == exports->NumberOfNames || !functions[index = ordinals[i]]) return FALSE;
    if (functions[index] >= dir->VirtualAddress && functions[index] < dir->VirtualAddress + dir->Size)
    {
        /* forwarded: "NTDLL.RtlAllocateHeap" */
        char dll[64];
        forward = (char *)module + functions[index];
        for (i = 0; forward[i] && forward[i] != '.' && i < sizeof(dll) - 5; i++) dll[i] = forward[i];
        strcpy( dll + i, ".dll" );
        return forward[i] == '.' && (module = LoadLibraryA( dll )) && find_export( module, forward + i + 1, import );
    }
    if (!types[index]) return FALSE;
    import->func = *(void **)((char *)module + functions[index]);
    import->type = types[index];
    if (!strcmp( types[index], "data" )) return TRUE;
    i = strlen( types[index] );
    import->call = wine_dolly_call_type( types[index], types[index][i - 1] == '.' ? i - 1 : i );
    return import->call >= 0;
}

/* The variable arguments of a printf-like or scanf-like call, laid out as this compiler's va_list wants
 * them: a guest passes every one in an 8-byte slot, here an int takes four bytes. The format says which. */
static void convert_varargs( const struct import *import, const void *format, const uint64_t *slots, char *out )
{
    unsigned int i = 0, used = 0, step = import->wide ? 2 : 1;
    const char *p = format;
#define CHAR(q) (import->wide ? *(const WCHAR *)(q) : (WCHAR)*(const unsigned char *)(q))

    for (; CHAR(p) && i < 32; p += step)
    {
        BOOL big = import->scan, skipped = FALSE;
        if (CHAR(p) != '%') continue;
        p += step;
        if (CHAR(p) == '%') continue;
        for (;; p += step)
        {
            WCHAR c = CHAR(p);
            if (c == '*' && import->scan) skipped = TRUE;  /* converted, not stored */
            else if (c == '*') { memcpy( out + used, &slots[i++], 4 ); used += 4; }
            else if (c == 'l' && CHAR(p + step) == 'l') big = TRUE;
            else if (c == 'I' || c == 'j' || c == 'z' || c == 't' || c == 'q') big = TRUE;
            else if (!c || !strchr( "-+ #0123456789.hlLw", c )) break;
        }
        if (!CHAR(p)) break;
        if (import->scan && CHAR(p) == '[') while (CHAR(p + step) && CHAR(p) != ']') p += step;
        if (skipped) continue;
        if (big || strchr( "spSnZeEfgGaA", CHAR(p) ))
        {
            used = (used + 7) & ~7;
            memcpy( out + used, &slots[i++], 8 );
            used += 8;
        }
        else { memcpy( out + used, &slots[i++], 4 ); used += 4; }
    }
#undef CHAR
}

/* A call out of the guest: rip is on one of the imports. */
static BOOL host_call( struct cpu *cpu )
{
    struct import *import = &imports[(cpu->rip - (uint64_t)imports) / sizeof(*import)];
    unsigned long long a[40], x[40], ret = 0;
    char varargs[40 * 8] = { 0 };
    unsigned int i, count;
    int kind;

    /* Win64: four arguments in rcx, rdx, r8, r9 (or xmm0 to xmm3), the rest above the return address and their homes */
    for (i = 0; i < 40; i++)
    {
        static const unsigned char regs[] = { RCX, RDX, R8, R9 };
        a[i] = i < 4 ? cpu->r[regs[i]] : *(uint64_t *)(cpu->r[RSP] + 8 + 8 * i);
        x[i] = i < 4 ? cpu->xmm[i][0] : a[i];
    }
    if (trace) fprintf( stderr, "x86emu: after %llu instructions %s rcx=%llx rdx=%llx r8=%llx\n",
                        (unsigned long long)cpu->instructions, import->name, a[0], a[1], a[2] );
    if (!import->special || !import->special( cpu, import, a ))
    {
        if (!import->func)
        {
            fprintf( stderr, "x86emu: the program called %s, which this Wine does not have\n", import->name );
            return FALSE;
        }
        count = strchr( import->type, ':' ) - import->type;
        if (import->type[strlen( import->type ) - 1] == '.')
        {
            /* the last fixed argument is the format; the variable ones become a va_list */
            if (count < 2) return FALSE;
            convert_varargs( import, (void *)a[count - 2], &a[count - 1], varargs );
            a[count - 1] = (uint64_t)varargs;
        }
        kind = wine_dolly_call( import->call, import->func, a, x, &ret );
        if (kind == 1) cpu->r[RAX] = ret;
        else if (kind == 2) cpu->xmm[0][0] = ret;
    }
    cpu->rip = *(uint64_t *)cpu->r[RSP];  /* ret */
    cpu->r[RSP] += 8;
    return TRUE;
}

static BOOL run( struct cpu *cpu )
{
    for (;;)
    {
        cpu_run( cpu, (uint64_t)imports, (uint64_t)(imports + ARRAY_SIZE(imports)) );
        if (cpu->error)
        {
            fprintf( stderr, "x86emu: %s\n", cpu->error );
            return FALSE;
        }
        if (cpu->rip == (uint64_t)imports) return TRUE;  /* the function called returned */
        if (!host_call( cpu )) return FALSE;
    }
}

/* the address of what an x86 DLL exports under a name */
static uint64_t guest_export( const struct module *module, const char *name )
{
    const IMAGE_DATA_DIRECTORY *dir = &module->nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXPORT];
    const IMAGE_EXPORT_DIRECTORY *exports = (void *)(module->base + dir->VirtualAddress);
    const DWORD *names = (void *)(module->base + exports->AddressOfNames), *functions = (void *)(module->base + exports->AddressOfFunctions);
    const WORD *ordinals = (void *)(module->base + exports->AddressOfNameOrdinals);
    unsigned int i;

    if (!dir->Size) return 0;
    for (i = 0; i < exports->NumberOfNames; i++)
        if (!strcmp( module->base + names[i], name )) return (uint64_t)module->base + functions[ordinals[i]];
    return 0;
}

static BOOL bind_imports( const struct module *importer )
{
    char *base = importer->base, path[MAX_PATH];
    const IMAGE_DATA_DIRECTORY *dir = &importer->nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT];
    IMAGE_IMPORT_DESCRIPTOR *descr = (void *)(base + dir->VirtualAddress);
    unsigned int i;

    if (!dir->VirtualAddress) return TRUE;
    for (; descr->Name; descr++)
    {
        const char *dll = base + descr->Name;
        struct module *guest = NULL;
        HMODULE module = NULL;
        uint64_t *thunk = (void *)(base + descr->FirstThunk);
        uint64_t *lookup = descr->OriginalFirstThunk ? (void *)(base + descr->OriginalFirstThunk) : thunk;

        /* an x86 DLL beside the program, else one of Wine's */
        strcpy( path, modules[0].path );
        lstrcpynA( strrchr( path, '\\' ) + 1, dll, (int)(path + sizeof(path) - strrchr( path, '\\' ) - 1) );
        if (GetFileAttributesA( path ) != INVALID_FILE_ATTRIBUTES) { if (!(guest = load_module( path ))) return FALSE; }
        else if (!(module = LoadLibraryA( dll )))
        {
            fprintf( stderr, "x86emu: %s is neither beside the program nor a DLL of this Wine\n", dll );
            return FALSE;
        }
        for (; *lookup; lookup++, thunk++)
        {
            struct import *import = &imports[nb_imports];
            const char *name = (*lookup >> 63) ? "(an ordinal)" : base + (*lookup & 0x7fffffff) + 2;
            size_t len = strlen( name );

            if (guest && (*thunk = guest_export( guest, name ))) continue;
            if (nb_imports == ARRAY_SIZE(imports)) return FALSE;
            snprintf( import->name, sizeof(import->name), "%s!%s", dll, name );
            /* an import this Wine lacks is reported when it is called, as a program may never call it */
            if (guest || (*lookup >> 63) || !find_export( module, name, import )) import->func = NULL;
            else if (!strcmp( import->type, "data" )) { *thunk = (uint64_t)import->func; continue; }
            import->wide = len && (name[len - 1] == 'W' || strstr( name, "wprintf" ) || strstr( name, "wscanf" ));
            import->scan = strstr( name, "scanf" ) != NULL;
            for (i = 0; i < ARRAY_SIZE(specials); i++) if (!strcmp( specials[i].name, name )) import->special = specials[i].special;
            *thunk = (uint64_t)import;
            nb_imports++;
        }
    }
    return TRUE;
}

/* Load the image where it can run: at its own base if that is in the unused low part of this
 * process's memory, else wherever there is room when it has the relocations for that. */
static char *load_image( const char *path, const IMAGE_NT_HEADERS64 **ret_nt )
{
    HANDLE file = CreateFileA( path, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL );
    DWORD size, done, i;
    char *data, *base;
    const IMAGE_DOS_HEADER *dos;
    const IMAGE_NT_HEADERS64 *nt;
    const IMAGE_SECTION_HEADER *section;
    const IMAGE_DATA_DIRECTORY *relocs;
    int64_t delta;

    if (file == INVALID_HANDLE_VALUE || !(size = GetFileSize( file, NULL )) ||
        !(data = HeapAlloc( GetProcessHeap(), 0, size )) || !ReadFile( file, data, size, &done, NULL ) || done != size)
    {
        fprintf( stderr, "x86emu: cannot read %s\n", path );
        return NULL;
    }
    CloseHandle( file );
    dos = (void *)data;
    nt = (void *)(data + dos->e_lfanew);
    if (size < sizeof(*dos) || dos->e_magic != IMAGE_DOS_SIGNATURE || dos->e_lfanew + sizeof(*nt) > size ||
        nt->Signature != IMAGE_NT_SIGNATURE || nt->FileHeader.Machine != IMAGE_FILE_MACHINE_AMD64 ||
        nt->OptionalHeader.Magic != IMAGE_NT_OPTIONAL_HDR64_MAGIC)
    {
        fprintf( stderr, "x86emu: %s is not an x86-64 Windows program (32-bit x86 is not emulated)\n", path );
        return NULL;
    }
    relocs = &nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_BASERELOC];
    base = (char *)nt->OptionalHeader.ImageBase;
    if (nt->OptionalHeader.ImageBase < 0x10000 ||
        nt->OptionalHeader.ImageBase + nt->OptionalHeader.SizeOfImage > (uint64_t)__global_base)
    {
        if (!relocs->Size)
        {
            fprintf( stderr, "x86emu: %s must be loaded at %#llx and cannot be moved\n", path,
                     (unsigned long long)nt->OptionalHeader.ImageBase );
            return NULL;
        }
        if (!(base = VirtualAlloc( NULL, nt->OptionalHeader.SizeOfImage, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE )))
        {
            fprintf( stderr, "x86emu: no memory for %s (error %u)\n", path, (unsigned)GetLastError() );
            return NULL;
        }
    }
    memset( base, 0, nt->OptionalHeader.SizeOfImage );
    memcpy( base, data, min( nt->OptionalHeader.SizeOfHeaders, size ) );
    section = (void *)((char *)&nt->OptionalHeader + nt->FileHeader.SizeOfOptionalHeader);
    for (i = 0; i < nt->FileHeader.NumberOfSections; i++, section++)
        if (section->PointerToRawData + section->SizeOfRawData <= size &&
            section->VirtualAddress + section->SizeOfRawData <= nt->OptionalHeader.SizeOfImage)
            memcpy( base + section->VirtualAddress, data + section->PointerToRawData, section->SizeOfRawData );

    delta = (int64_t)base - (int64_t)nt->OptionalHeader.ImageBase;
    if (delta)
    {
        const IMAGE_BASE_RELOCATION *block = (void *)(base + relocs->VirtualAddress);
        const char *end = (char *)block + relocs->Size;
        for (; (char *)block < end && block->SizeOfBlock; block = (void *)((char *)block + block->SizeOfBlock))
        {
            const WORD *entry = (const WORD *)(block + 1);
            for (i = 0; i < (block->SizeOfBlock - sizeof(*block)) / sizeof(WORD); i++)
            {
                char *where = base + block->VirtualAddress + (entry[i] & 0xfff);
                if (entry[i] >> 12 == IMAGE_REL_BASED_DIR64) *(int64_t *)where += delta;
                else if (entry[i] >> 12 == IMAGE_REL_BASED_HIGHLOW) *(int32_t *)where += delta;
            }
        }
    }
    *ret_nt = (void *)(base + dos->e_lfanew);
    HeapFree( GetProcessHeap(), 0, data );
    return base;
}

/* An x86 image with its imports bound and, for a DLL, its entry point called. */
static struct module *load_module( const char *path )
{
    struct module *module = &modules[nb_modules];
    unsigned int i;

    if (nb_modules == ARRAY_SIZE(modules) || !GetFullPathNameA( path, sizeof(module->path), module->path, NULL )) return NULL;
    for (i = 0; i < nb_modules; i++) if (!lstrcmpiA( modules[i].path, module->path )) return &modules[i];
    if (!(module->base = load_image( module->path, &module->nt ))) return NULL;
    nb_modules++;
    /* the window classes of the last program loaded here would make this one's registrations fail */
    wine_dolly_free_program_classes( (HINSTANCE)module->base );
    if (trace) fprintf( stderr, "x86emu: %s loaded at %p\n", module->path, module->base );
    if (!bind_imports( module )) return NULL;
    if ((module->nt->FileHeader.Characteristics & IMAGE_FILE_DLL) && module->nt->OptionalHeader.AddressOfEntryPoint)
    {
        uint64_t args[3] = { (uint64_t)module->base, DLL_PROCESS_ATTACH, 0 };
        if (!(int)call_guest( (uint64_t)module->base + module->nt->OptionalHeader.AddressOfEntryPoint, args, 3 ))
        {
            fprintf( stderr, "x86emu: %s refused to load\n", module->path );
            return NULL;
        }
    }
    return module;
}

static struct cpu *new_cpu(void)
{
    struct cpu *cpu = &the_cpu;
    SIZE_T stack_size = 0x100000;
    char *stack = VirtualAlloc( NULL, stack_size, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE );

    memset( cpu, 0, sizeof(*cpu) );
    cpu->gs_base = (uint64_t)NtCurrentTeb();
    cpu->flags = 0x202;
    cpu->x87_control = 0x37f;
    /* as after a call: the return address on a stack whose alignment the callee completes */
    cpu->r[RSP] = (uint64_t)stack + stack_size - 0x208;
    *(uint64_t *)cpu->r[RSP] = (uint64_t)imports;
    return cpu;
}

/* A loop of four instructions, 50 million times: what the interpreter does a second in this browser. */
static int benchmark(void)
{
    static const unsigned char code[] =
    {
        0xb9, 0x80, 0xf0, 0xfa, 0x02,   /* mov ecx, 50000000 */
        0x31, 0xc0,                     /* xor eax, eax */
        0x48, 0x01, 0xc8,               /* loop: add rax, rcx */
        0x48, 0x83, 0xf0, 0x55,         /* xor rax, 0x55 */
        0xff, 0xc9,                     /* dec ecx */
        0x75, 0xf5,                     /* jnz loop */
        0xc3                            /* ret */
    };
    struct cpu *cpu = new_cpu();
    DWORD start = GetTickCount(), elapsed;

    cpu->rip = (uint64_t)code;
    if (!run( cpu )) return 1;
    elapsed = GetTickCount() - start;
    printf( "x86emu: %llu instructions in %u ms: %.1f million a second\n", (unsigned long long)cpu->instructions,
            (unsigned)elapsed, elapsed ? cpu->instructions / 1000.0 / elapsed : 0.0 );
    return 0;
}

int main( int argc, char *argv[] )
{
    BOOL stats = trace = argc > 2 && !strcmp( argv[1], "--stats" );
    struct module *program;
    struct cpu *cpu;

    if (argc == 2 && !strcmp( argv[1], "--bench" )) return benchmark();
    if (argc < 2 + stats)
    {
        fprintf( stderr, "usage: x86emu [--stats] PROGRAM.EXE [ARGUMENT...]    run an x86-64 Windows program\n       x86emu --bench\n" );
        return 2;
    }
    guest_argc = argc - 1 - stats;
    guest_argv = argv + 1 + stats;
    cpu = new_cpu();
    if (!(program = load_module( guest_argv[0] ))) return 1;
    if (stats) fprintf( stderr, "x86emu: %u imports bound\n", nb_imports - 1 );
    cpu->rip = (uint64_t)program->base + program->nt->OptionalHeader.AddressOfEntryPoint;
    cpu->r[RCX] = (uint64_t)NtCurrentTeb()->Peb;
    if (!run( cpu )) return 1;
    fflush( stdout );
    return (int)cpu->r[RAX];
}
