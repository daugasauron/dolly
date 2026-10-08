/* SPDX-License-Identifier: MIT
 * The module image winebuild writes for Dolly (winebuild-dolly.c): the PE
 * headers and directories ntdll reads from a builtin module, as one
 * initialized C object. A wasm function has no address in memory, so an
 * export's RVA and the entry point name a slot that holds the pointer. */
#ifndef DOLLY_IMAGE_H
#define DOLLY_IMAGE_H

#include <stddef.h>
#include <stdint.h>

struct dolly_image_header
{
    struct { uint16_t e_magic, unused[29]; uint32_t e_lfanew; } dos;
    struct
    {
        uint32_t Signature;
        struct
        {
            uint16_t Machine, NumberOfSections;
            uint32_t TimeDateStamp, PointerToSymbolTable, NumberOfSymbols;
            uint16_t SizeOfOptionalHeader, Characteristics;
        } FileHeader;
        struct
        {
            uint16_t Magic;
            uint8_t  MajorLinkerVersion, MinorLinkerVersion;
            uint32_t SizeOfCode, SizeOfInitializedData, SizeOfUninitializedData, AddressOfEntryPoint, BaseOfCode;
            uint64_t ImageBase;
            uint32_t SectionAlignment, FileAlignment;
            uint16_t MajorOperatingSystemVersion, MinorOperatingSystemVersion, MajorImageVersion, MinorImageVersion;
            uint16_t MajorSubsystemVersion, MinorSubsystemVersion;
            uint32_t Win32VersionValue, SizeOfImage, SizeOfHeaders, CheckSum;
            uint16_t Subsystem, DllCharacteristics;
            uint64_t SizeOfStackReserve, SizeOfStackCommit, SizeOfHeapReserve, SizeOfHeapCommit;
            uint32_t LoaderFlags, NumberOfRvaAndSizes;
            struct { uint32_t VirtualAddress, Size; } DataDirectory[16];
        } OptionalHeader;
    } nt;
    struct
    {
        char     Name[8];
        uint32_t VirtualSize, VirtualAddress, SizeOfRawData, PointerToRawData;
        uint32_t PointerToRelocations, PointerToLinenumbers;
        uint16_t NumberOfRelocations, NumberOfLinenumbers;
        uint32_t Characteristics;
    } section;
    char pad[0x1000 - 64 - 264 - 40];
};

struct dolly_export_directory
{
    uint32_t Characteristics, TimeDateStamp;
    uint16_t MajorVersion, MinorVersion;
    uint32_t Name, Base, NumberOfFunctions, NumberOfNames;
    uint32_t AddressOfFunctions, AddressOfNames, AddressOfNameOrdinals;
};

struct dolly_import_descriptor
{
    uint32_t OriginalFirstThunk, TimeDateStamp, ForwarderChain, Name, FirstThunk;
};

_Static_assert( sizeof(struct dolly_image_header) == 0x1000, "image header" );
_Static_assert( sizeof(struct dolly_export_directory) == 40, "export directory" );

/* libwine's registry of the modules linked into this program. */
extern void __wine_dll_register( const void *image, const char *filename );

#endif
