/* SPDX-License-Identifier: MIT */
/*
 * The run-time half of icall (../icall.c).
 *
 * A WebAssembly program cannot ask which type the function behind a pointer has, but its file says:
 * a pointer is an index into the table, the element segment names the function at each index and the
 * function section its type. That is read once, from the file this program was linked as. A thunk
 * that finds another type than its caller's comes here, and the function is called with its own
 * type: its integer parameters take the caller's integer arguments in order and its floating-point
 * ones the floating-point arguments, a parameter the caller has no argument for is 0, and a result
 * the function does not give is 0. That is what the calling conventions this code was written
 * for did with the registers, except for the zeros, which were whatever the registers held.
 */
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "icall.h"

#define NO_FUNCTION 0xffff

unsigned short *icall_types;
unsigned long icall_slots;
static char **type_names;
static const struct icall_signature **type_signatures;

static void die( const char *format, ... )
{
    va_list args;

    va_start( args, format );
    fputs( "icall: ", stderr );
    vfprintf( stderr, format, args );
    fputc( '\n', stderr );
    abort();
}

static unsigned long leb( const unsigned char **at )
{
    unsigned long value = 0;
    int shift;

    for (shift = 0;; shift += 7)
    {
        unsigned char byte = *(*at)++;
        value |= (unsigned long)(byte & 0x7f) << shift;
        if (!(byte & 0x80)) return value;
    }
}

static char value_type( unsigned char byte )
{
    return byte == 0x7f ? 'i' : byte == 0x7e ? 'j' : byte == 0x7d ? 'f' : byte == 0x7c ? 'd' : '?';
}

static void skip_limits( const unsigned char **at )
{
    unsigned long flags = leb( at );
    leb( at );
    if (flags & 1) leb( at );
}

/* the type, import, function and element sections of the program's file */
static void load(void)
{
    enum { TYPE = 1, IMPORT = 2, FUNCTION = 3, ELEM = 9 };
    unsigned char header[8], *sections[ELEM + 1] = { 0 };
    const unsigned char *at;
    unsigned int *function_types, functions = 0, types, count, i, j;
    const struct icall_signature *signature;
    FILE *file = fopen( ICALL_PROGRAM, "rb" );

    if (!file || fread( header, 1, 8, file ) != 8 || memcmp( header, "\0asm\1\0\0\0", 8 )) die( "cannot read " ICALL_PROGRAM );
    while (!sections[ELEM])
    {
        int id = fgetc( file ), byte, shift = 0;
        unsigned long size = 0;

        do
        {
            if ((byte = fgetc( file )) == EOF) die( ICALL_PROGRAM " has no element segment" );
            size |= (unsigned long)(byte & 0x7f) << shift;
            shift += 7;
        } while (byte & 0x80);
        if (id != TYPE && id != IMPORT && id != FUNCTION && id != ELEM) fseek( file, size, SEEK_CUR );
        else if (!(sections[id] = malloc( size + 1 )) || fread( sections[id], 1, size, file ) != size) die( "cannot read " ICALL_PROGRAM );
    }
    fclose( file );
    if (!sections[TYPE] || !sections[FUNCTION]) die( ICALL_PROGRAM " has no functions" );

    at = sections[TYPE];
    types = leb( &at );
    type_names = calloc( types, sizeof(*type_names) );
    type_signatures = calloc( types, sizeof(*type_signatures) );
    for (i = 0; i < types; i++)
    {
        unsigned int parameters, results;
        char *name;

        at++;  /* 0x60 */
        parameters = leb( &at );
        name = type_names[i] = malloc( parameters + 3 );
        for (j = 0; j < parameters; j++) name[j] = value_type( *at++ );
        results = leb( &at );
        name[parameters] = '_';
        name[parameters + 1] = results == 1 ? value_type( *at ) : results ? '?' : 'v';
        name[parameters + 2] = 0;
        at += results;
    }

    /* imported functions come first in the index space */
    at = sections[FUNCTION];
    count = leb( &at );
    function_types = malloc( (count + 4096) * sizeof(*function_types) );
    if (sections[IMPORT])
    {
        const unsigned char *import = sections[IMPORT];
        for (i = leb( &import ); i; i--)
        {
            for (j = 0; j < 2; j++) { unsigned long size = leb( &import ); import += size; }
            switch (*import++)
            {
            case 0: if (functions < 4096) function_types[functions++] = leb( &import ); break;
            case 1: import++; skip_limits( &import ); break;
            case 2: skip_limits( &import ); break;
            case 3: import += 2; break;
            default: die( ICALL_PROGRAM " has an import of an unknown kind" );
            }
        }
    }
    while (count--) function_types[functions++] = leb( &at );

    at = sections[ELEM];
    for (count = leb( &at ); count; count--)
    {
        unsigned long flags = leb( &at ), offset, length;

        if (flags != 0 && flags != 2) die( ICALL_PROGRAM " has an element segment of an unknown form" );
        if (flags == 2) leb( &at );
        at++;  /* i64.const */
        offset = leb( &at );
        at += 1 + (flags == 2);
        length = leb( &at );
        icall_types = realloc( icall_types, (offset + length) * sizeof(*icall_types) );
        for (i = icall_slots; i < offset; i++) icall_types[i] = NO_FUNCTION;
        for (i = 0; i < length; i++) icall_types[offset + i] = function_types[leb( &at )];
        icall_slots = offset + length;
    }
    free( function_types );
    for (i = TYPE; i <= ELEM; i++) free( sections[i] );

    for (signature = icall_signatures; signature->name; signature++)
    {
        unsigned int type = signature->probe < icall_slots ? icall_types[signature->probe] : NO_FUNCTION;
        if (type >= types || strcmp( type_names[type], signature->name )) die( ICALL_PROGRAM " is not the file of this program" );
        *signature->type = type;
        type_signatures[type] = signature;
    }
}

static int is_float( char type )
{
    return type == 'f' || type == 'd';
}

unsigned long icall_adapt( unsigned long function, const char *caller, const unsigned long *arguments )
{
    const struct icall_signature *callee;
    const char *parameter, *argument, *next[2] = { caller, caller };
    unsigned long passed[32] = { 0 }, result;
    int count = 0;

    if (!icall_types) load();
    if (function >= icall_slots || icall_types[function] == NO_FUNCTION) die( "pointer %lu, called as %s, is no function", function, caller );
    if (!(callee = type_signatures[icall_types[function]]))
        die( "a %s function is called as %s, and no thunk of its type is built: add it to ICALL_TYPES",
             type_names[icall_types[function]], caller );
    if (!strcmp( callee->name, caller )) return callee->call( function, arguments );  /* before the types were read */

    for (parameter = callee->name; *parameter != '_'; parameter++, count++)
    {
        const char **from = &next[is_float( *parameter )];

        if (count == 32) die( "a %s function has too many parameters", callee->name );
        while (**from != '_' && is_float( **from ) != is_float( *parameter )) ++*from;
        if (**from == '_') continue;
        argument = (*from)++;
        passed[count] = arguments[argument - caller];
        if (*argument == 'f' && *parameter == 'd') passed[count] = icall_from_d( icall_to_f( passed[count] ) );
        if (*argument == 'd' && *parameter == 'f') passed[count] = icall_from_f( icall_to_d( passed[count] ) );
    }
    result = callee->call( function, passed );
    parameter++;
    argument = strchr( caller, '_' ) + 1;
    if (*parameter == 'v' || *argument == 'v' || is_float( *parameter ) != is_float( *argument )) return 0;
    if (*parameter == 'f' && *argument == 'd') return icall_from_d( icall_to_f( result ) );
    if (*parameter == 'd' && *argument == 'f') return icall_from_f( icall_to_d( result ) );
    return result;
}
