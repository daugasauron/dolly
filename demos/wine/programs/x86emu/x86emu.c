/* SPDX-License-Identifier: MIT
 * x86emu: runs an x86-64 Windows program in this Wine. The program's image
 * is loaded into this process's memory, where it was linked to be or, if it
 * has relocations, anywhere; its code is interpreted (cpu.c); and what it
 * imports are the functions of Wine's own DLLs, which are WebAssembly: a
 * call out of the guest takes its arguments from the Win64 registers and
 * stack and makes the call of the type the module's description records
 * (winebuild-dolly.c).
 *
 * Not done: calls back into the guest (a window procedure handed to
 * Windows is a guest address, which WebAssembly cannot call: it traps),
 * x86 DLLs, threads, exceptions, 32-bit programs, x87 and SSE arithmetic.
 *
 *   x86emu [--stats] PROGRAM.EXE     (--stats names each call out of the guest)
 *   x86emu --bench                   (times the interpreter on a loop) */
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <windef.h>
#include <winbase.h>
#include <winternl.h>

#include "x86emu.h"

extern int wine_dolly_call_type( const char *type, unsigned int len );
extern int wine_dolly_call( int type, void *func, const unsigned long long *a, const unsigned long long *x, unsigned long long *ret );
extern char __global_base[];  /* where this program's own data starts: below it, from 64 KiB, nothing lives */

/* What a guest call lands on: its address is what the import table holds. */
struct import
{
    void       *func;
    const char *type;       /* as in the module description; a final dot marks a variadic function */
    int         call;       /* its number for wine_dolly_call */
    BOOL        wide;       /* a variadic function whose format is UTF-16 */
    char        name[64];
};

static BOOL trace;  /* --stats: name each call out of the guest */
static struct import imports[1024];
static unsigned int nb_imports = 1;  /* the first is where the program's entry point returns to */

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
    i = strlen( types[index] );
    import->call = wine_dolly_call_type( types[index], types[index][i - 1] == '.' ? i - 1 : i );
    return import->call >= 0;
}

/* The variable arguments of a printf-like call, laid out as this compiler's va_list wants them: a
 * guest passes every one in an 8-byte slot, here an int takes four bytes. The format says which. */
static void convert_varargs( const struct import *import, const void *format, const uint64_t *slots, char *out )
{
    unsigned int i = 0, used = 0, step = import->wide ? 2 : 1;
    const char *p = format;
#define CHAR(q) (import->wide ? *(const WCHAR *)(q) : (WCHAR)*(const unsigned char *)(q))

    for (; CHAR(p) && i < 32; p += step)
    {
        BOOL big = FALSE;
        if (CHAR(p) != '%') continue;
        p += step;
        if (CHAR(p) == '%') continue;
        for (;; p += step)
        {
            WCHAR c = CHAR(p);
            if (c == '*') { memcpy( out + used, &slots[i++], 4 ); used += 4; }
            else if (c == 'l' && CHAR(p + step) == 'l') big = TRUE;
            else if (c == 'I' || c == 'j' || c == 'z' || c == 't' || c == 'q') big = TRUE;
            else if (!c || !strchr( "-+ #0123456789.hlLw", c )) break;
        }
        if (!CHAR(p)) break;
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

    if (!import->func)
    {
        fprintf( stderr, "x86emu: the program called %s, which this Wine does not have\n", import->name );
        return FALSE;
    }
    /* Win64: four arguments in rcx, rdx, r8, r9 (or xmm0 to xmm3), the rest above the return address and their homes */
    for (i = 0; i < 40; i++)
    {
        static const unsigned char regs[] = { RCX, RDX, R8, R9 };
        a[i] = i < 4 ? cpu->r[regs[i]] : *(uint64_t *)(cpu->r[RSP] + 8 + 8 * i);
        x[i] = i < 4 ? cpu->xmm[i][0] : a[i];
    }
    count = strchr( import->type, ':' ) - import->type;
    if (import->type[strlen( import->type ) - 1] == '.')
    {
        /* the last fixed argument is the format; the variable ones become a va_list */
        if (count < 2) return FALSE;
        convert_varargs( import, (void *)a[count - 2], &a[count - 1], varargs );
        a[count - 1] = (uint64_t)varargs;
    }
    if (trace) fprintf( stderr, "x86emu: %s (%s) rcx=%llx rdx=%llx\n", import->name, import->type, a[0], a[1] );
    kind = wine_dolly_call( import->call, import->func, a, x, &ret );
    if (kind == 1) cpu->r[RAX] = ret;
    else if (kind == 2) cpu->xmm[0][0] = ret;
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
        if (cpu->rip == (uint64_t)imports) return TRUE;  /* the entry point returned */
        if (!host_call( cpu )) return FALSE;
    }
}

static BOOL bind_imports( char *base, const IMAGE_NT_HEADERS64 *nt )
{
    const IMAGE_DATA_DIRECTORY *dir = &nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT];
    IMAGE_IMPORT_DESCRIPTOR *descr = (void *)(base + dir->VirtualAddress);

    if (!dir->VirtualAddress) return TRUE;
    for (; descr->Name; descr++)
    {
        const char *dll = base + descr->Name;
        HMODULE module = LoadLibraryA( dll );
        uint64_t *thunk = (void *)(base + descr->FirstThunk);
        uint64_t *lookup = descr->OriginalFirstThunk ? (void *)(base + descr->OriginalFirstThunk) : thunk;

        if (!module)
        {
            fprintf( stderr, "x86emu: %s is not a DLL of this Wine, and x86 DLLs are not loaded\n", dll );
            return FALSE;
        }
        for (; *lookup; lookup++, thunk++)
        {
            struct import *import = &imports[nb_imports];
            const char *name = (*lookup >> 63) ? "(an ordinal)" : base + (*lookup & 0x7fffffff) + 2;
            size_t len = strlen( name );

            if (nb_imports == ARRAY_SIZE(imports)) return FALSE;
            snprintf( import->name, sizeof(import->name), "%s!%s", dll, name );
            /* an import this Wine lacks is reported when it is called, as a program may never call it */
            if ((*lookup >> 63) || !find_export( module, name, import )) import->func = NULL;
            import->wide = len && (name[len - 1] == 'W' || strstr( name, "wprintf" ) || strstr( name, "wscanf" ));
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
        if (!(base = VirtualAlloc( NULL, nt->OptionalHeader.SizeOfImage, MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE ))) return NULL;
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

static struct cpu *new_cpu(void)
{
    static struct cpu cpu;
    SIZE_T stack_size = 0x100000;
    char *stack = VirtualAlloc( NULL, stack_size, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE );

    memset( &cpu, 0, sizeof(cpu) );
    cpu.gs_base = (uint64_t)NtCurrentTeb();
    cpu.flags = 0x202;
    /* as after a call: the return address on a stack whose alignment the callee completes */
    cpu.r[RSP] = (uint64_t)stack + stack_size - 0x208;
    *(uint64_t *)cpu.r[RSP] = (uint64_t)imports;
    return &cpu;
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
    const IMAGE_NT_HEADERS64 *nt;
    struct cpu *cpu;
    char *base;

    if (argc == 2 && !strcmp( argv[1], "--bench" )) return benchmark();
    if (argc != 2 + stats)
    {
        fprintf( stderr, "usage: x86emu [--stats] PROGRAM.EXE    run an x86-64 Windows program\n       x86emu --bench\n" );
        return 2;
    }
    if (!(base = load_image( argv[1 + stats], &nt ))) return 1;
    if (stats) fprintf( stderr, "x86emu: loaded at %p\n", base );
    if (!bind_imports( base, nt )) return 1;
    if (stats) fprintf( stderr, "x86emu: %u imports bound\n", nb_imports - 1 );
    cpu = new_cpu();
    cpu->rip = (uint64_t)base + nt->OptionalHeader.AddressOfEntryPoint;
    cpu->r[RCX] = (uint64_t)NtCurrentTeb()->Peb;
    if (!run( cpu )) return 1;
    fflush( stdout );
    if (stats) fprintf( stderr, "x86emu: %llu instructions\n", (unsigned long long)cpu->instructions );
    return (int)cpu->r[RAX];
}
