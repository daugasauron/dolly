/*
 * wasm64 Dolly: what ntdll keeps per CPU (signal_arm.c is the model).
 *
 * A WebAssembly thread has no registers to capture or set, no fault a
 * program can catch, and one stack that cannot be switched. So a context
 * names only the stack pointer, exceptions are those the program raises,
 * and threads run on the stack their pthread was given.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 */

#ifdef __wasm64__

#include "config.h"
#include "wine/port.h"

#include <assert.h>
#include <pthread.h>
#include <signal.h>
#include <stdlib.h>
#include <stdarg.h>
#include <stdio.h>
#include <unistd.h>

#define NONAMELESSUNION
#define NONAMELESSSTRUCT
#include "ntstatus.h"
#define WIN32_NO_STATUS
#include "windef.h"
#include "winternl.h"
#include "wine/library.h"
#include "wine/exception.h"
#include "ntdll_misc.h"
#include "wine/debug.h"
#include "winnt.h"

WINE_DEFAULT_DEBUG_CHANNEL(seh);
WINE_DECLARE_DEBUG_CHANNEL(relay);

static __thread TEB *current_teb;

static const size_t teb_size = 0x10000;  /* one page */

typedef int (*wine_signal_handler)(unsigned int sig);

static wine_signal_handler handlers[256];

static inline BOOL is_valid_frame( void *frame )
{
    if ((ULONG_PTR)frame & 3) return FALSE;
    return (frame >= NtCurrentTeb()->Tib.StackLimit &&
            (void **)frame < (void **)NtCurrentTeb()->Tib.StackBase - 1);
}

/***********************************************************************
 *		RtlCaptureContext (NTDLL.@)
 */
void WINAPI RtlCaptureContext( CONTEXT *context )
{
    context->ContextFlags = CONTEXT_CONTROL;
    context->Sp = (DWORD64)__builtin_frame_address( 0 );
    context->Pc = 0;
}

/***********************************************************************
 *           context_to_server
 */
NTSTATUS context_to_server( context_t *to, const CONTEXT *from )
{
    memset( to, 0, sizeof(*to) );
    to->cpu = CPU_WASM64;
    return STATUS_SUCCESS;
}

/***********************************************************************
 *           context_from_server
 */
NTSTATUS context_from_server( CONTEXT *to, const context_t *from )
{
    if (from->cpu != CPU_WASM64) return STATUS_INVALID_PARAMETER;
    to->ContextFlags = CONTEXT_WASM64;
    return STATUS_SUCCESS;
}

/***********************************************************************
 *              NtSetContextThread  (NTDLL.@)
 */
NTSTATUS WINAPI NtSetContextThread( HANDLE handle, const CONTEXT *context )
{
    return STATUS_NOT_SUPPORTED;
}

/***********************************************************************
 *              NtGetContextThread  (NTDLL.@)
 */
NTSTATUS WINAPI NtGetContextThread( HANDLE handle, CONTEXT *context )
{
    if (handle != GetCurrentThread()) return STATUS_NOT_SUPPORTED;
    RtlCaptureContext( context );
    return STATUS_SUCCESS;
}

/**********************************************************************
 *           call_stack_handlers
 *
 * Call the stack handlers chain.
 */
static NTSTATUS call_stack_handlers( EXCEPTION_RECORD *rec, CONTEXT *context )
{
    EXCEPTION_REGISTRATION_RECORD *frame, *dispatch, *nested_frame;
    DWORD res;

    frame = NtCurrentTeb()->Tib.ExceptionList;
    nested_frame = NULL;
    while (frame != (EXCEPTION_REGISTRATION_RECORD*)~0UL)
    {
        if (!is_valid_frame( frame ))
        {
            rec->ExceptionFlags |= EH_STACK_INVALID;
            break;
        }

        TRACE( "calling handler at %p code=%x flags=%x\n",
               frame->Handler, rec->ExceptionCode, rec->ExceptionFlags );
        res = frame->Handler( rec, frame, context, &dispatch );
        TRACE( "handler at %p returned %x\n", frame->Handler, res );

        if (frame == nested_frame)
        {
            /* no longer nested */
            nested_frame = NULL;
            rec->ExceptionFlags &= ~EH_NESTED_CALL;
        }

        switch(res)
        {
        case ExceptionContinueExecution:
            if (!(rec->ExceptionFlags & EH_NONCONTINUABLE)) return STATUS_SUCCESS;
            return STATUS_NONCONTINUABLE_EXCEPTION;
        case ExceptionContinueSearch:
            break;
        case ExceptionNestedException:
            if (nested_frame < dispatch) nested_frame = dispatch;
            rec->ExceptionFlags |= EH_NESTED_CALL;
            break;
        default:
            return STATUS_INVALID_DISPOSITION;
        }
        frame = frame->Prev;
    }
    return STATUS_UNHANDLED_EXCEPTION;
}

/*******************************************************************
 *		raise_exception
 *
 * Implementation of NtRaiseException.
 */
static NTSTATUS raise_exception( EXCEPTION_RECORD *rec, CONTEXT *context, BOOL first_chance )
{
    NTSTATUS status;

    if (first_chance)
    {
        DWORD c;

        TRACE( "code=%x flags=%x addr=%p tid=%04x\n",
               rec->ExceptionCode, rec->ExceptionFlags, rec->ExceptionAddress, GetCurrentThreadId() );
        for (c = 0; c < rec->NumberParameters; c++)
            TRACE( " info[%d]=%016lx\n", c, rec->ExceptionInformation[c] );
        if (rec->ExceptionCode == EXCEPTION_WINE_STUB)
        {
            if (rec->ExceptionInformation[1] >> 16)
                MESSAGE( "wine: Call to unimplemented function %s.%s, aborting\n",
                         (char*)rec->ExceptionInformation[0], (char*)rec->ExceptionInformation[1] );
            else
                MESSAGE( "wine: Call to unimplemented function %s.%ld, aborting\n",
                         (char*)rec->ExceptionInformation[0], rec->ExceptionInformation[1] );
        }

        status = send_debug_event( rec, TRUE, context );
        if (status == DBG_CONTINUE || status == DBG_EXCEPTION_HANDLED)
            return STATUS_SUCCESS;

        if (call_vectored_handlers( rec, context ) == EXCEPTION_CONTINUE_EXECUTION)
            return STATUS_SUCCESS;

        if ((status = call_stack_handlers( rec, context )) != STATUS_UNHANDLED_EXCEPTION)
            return status;
    }

    /* last chance exception */

    status = send_debug_event( rec, FALSE, context );
    if (status != DBG_CONTINUE)
    {
        if (rec->ExceptionFlags & EH_STACK_INVALID)
            ERR("Exception frame is not in stack limits => unable to dispatch exception.\n");
        else if (rec->ExceptionCode == STATUS_NONCONTINUABLE_EXCEPTION)
            ERR("Process attempted to continue execution after noncontinuable exception.\n");
        else
            ERR("Unhandled exception code %x flags %x addr %p\n",
                rec->ExceptionCode, rec->ExceptionFlags, rec->ExceptionAddress );
        NtTerminateProcess( NtCurrentProcess(), rec->ExceptionCode );
    }
    return STATUS_SUCCESS;
}

/**********************************************************************
 *		int_handler
 *
 * Handler for SIGINT: the console's handler if it set one, else the default end.
 */
static void int_handler( int signal )
{
    if (!handlers[SIGINT] || !handlers[SIGINT]( SIGINT )) _exit( 128 + SIGINT );
}

/***********************************************************************
 *           __wine_set_signal_handler   (NTDLL.@)
 */
int CDECL __wine_set_signal_handler(unsigned int sig, wine_signal_handler wsh)
{
    if (sig >= ARRAY_SIZE(handlers)) return -1;
    if (handlers[sig] != NULL) return -2;
    handlers[sig] = wsh;
    if (sig == SIGINT) signal( SIGINT, int_handler );
    return 0;
}

/**********************************************************************
 *             signal_alloc_thread
 */
NTSTATUS signal_alloc_thread( TEB **teb )
{
    SIZE_T size = teb_size;
    NTSTATUS status;

    assert( sizeof(TEB) <= teb_size );
    *teb = NULL;
    if (!(status = NtAllocateVirtualMemory( NtCurrentProcess(), (void **)teb, 0, &size,
                                            MEM_COMMIT | MEM_TOP_DOWN, PAGE_READWRITE )))
    {
        (*teb)->Tib.Self = &(*teb)->Tib;
        (*teb)->Tib.ExceptionList = (void *)~0UL;
    }
    return status;
}

/**********************************************************************
 *             signal_free_thread
 */
void signal_free_thread( TEB *teb )
{
    SIZE_T size = 0;

    NtFreeVirtualMemory( NtCurrentProcess(), (void **)&teb, &size, MEM_RELEASE );
}

/**********************************************************************
 *		signal_init_thread
 */
void signal_init_thread( TEB *teb )
{
    current_teb = teb;
}

/**********************************************************************
 *		signal_init_process
 *
 * Nothing to install: no fault, trap or directed signal reaches a thread.
 */
void signal_init_process(void)
{
}

/***********************************************************************
 *            RtlUnwind  (NTDLL.@)
 */
void WINAPI RtlUnwind( void *endframe, void *target_ip, EXCEPTION_RECORD *rec, void *retval )
{
    CONTEXT context;
    EXCEPTION_RECORD record;
    EXCEPTION_REGISTRATION_RECORD *frame, *dispatch;
    DWORD res;

    RtlCaptureContext( &context );

    /* build an exception record, if we do not have one */
    if (!rec)
    {
        record.ExceptionCode    = STATUS_UNWIND;
        record.ExceptionFlags   = 0;
        record.ExceptionRecord  = NULL;
        record.ExceptionAddress = NULL;
        record.NumberParameters = 0;
        rec = &record;
    }

    rec->ExceptionFlags |= EH_UNWINDING | (endframe ? 0 : EH_EXIT_UNWIND);

    TRACE( "code=%x flags=%x\n", rec->ExceptionCode, rec->ExceptionFlags );

    /* get chain of exception frames */
    frame = NtCurrentTeb()->Tib.ExceptionList;
    while ((frame != (EXCEPTION_REGISTRATION_RECORD*)~0UL) && (frame != endframe))
    {
        /* Check frame address */
        if (endframe && ((void*)frame > endframe))
            raise_status( STATUS_INVALID_UNWIND_TARGET, rec );

        if (!is_valid_frame( frame )) raise_status( STATUS_BAD_STACK, rec );

        /* Call handler */
        TRACE( "calling handler at %p code=%x flags=%x\n",
               frame->Handler, rec->ExceptionCode, rec->ExceptionFlags );
        res = frame->Handler(rec, frame, &context, &dispatch);
        TRACE( "handler at %p returned %x\n", frame->Handler, res );

        switch(res)
        {
        case ExceptionContinueSearch:
            break;
        case ExceptionCollidedUnwind:
            frame = dispatch;
            break;
        default:
            raise_status( STATUS_INVALID_DISPOSITION, rec );
            break;
        }
        frame = __wine_pop_frame( frame );
    }
}

/*******************************************************************
 *		NtRaiseException (NTDLL.@)
 *
 * Continuing is returning: there is no context to restore.
 */
NTSTATUS WINAPI NtRaiseException( EXCEPTION_RECORD *rec, CONTEXT *context, BOOL first_chance )
{
    return raise_exception( rec, context, first_chance );
}

/***********************************************************************
 *		RtlRaiseException (NTDLL.@)
 */
void WINAPI RtlRaiseException( EXCEPTION_RECORD *rec )
{
    CONTEXT context;
    NTSTATUS status;

    RtlCaptureContext( &context );
    rec->ExceptionAddress = NULL;
    status = raise_exception( rec, &context, TRUE );
    if (status) raise_status( status, rec );
}

/*************************************************************************
 *             RtlCaptureStackBackTrace (NTDLL.@)
 *
 * No frame of the WebAssembly stack can be read.
 */
USHORT WINAPI RtlCaptureStackBackTrace( ULONG skip, ULONG count, PVOID *buffer, ULONG *hash )
{
    return 0;
}

/***********************************************************************
 *           call_thread_entry_point
 */
static void WINAPI call_thread_entry_point( LPTHREAD_START_ROUTINE entry, void *arg )
{
    __TRY
    {
        TRACE_(relay)( "\1Starting thread proc %p (arg=%p)\n", entry, arg );
        RtlExitUserThread( entry( arg ));
    }
    __EXCEPT(call_unhandled_exception_filter)
    {
        NtTerminateThread( GetCurrentThread(), GetExceptionCode() );
    }
    __ENDTRY
    abort();  /* should not be reached */
}

/***********************************************************************
 *           thread_startup
 *
 * The thread runs on the stack it has, which the TEB must describe for
 * the exception frames to be found on it.
 */
static void thread_startup( void (WINAPI *start)(LPTHREAD_START_ROUTINE,void *), LPTHREAD_START_ROUTINE entry,
                            void *arg, BOOL suspend )
{
    CONTEXT context = { CONTEXT_FULL };
    void *entry_point = entry, *stack;
    size_t size;
    pthread_attr_t attr;

    if (!pthread_getattr_np( pthread_self(), &attr ) && !pthread_attr_getstack( &attr, &stack, &size ))
    {
        NtCurrentTeb()->Tib.StackLimit = stack;
        NtCurrentTeb()->Tib.StackBase  = (char *)stack + size;
    }
    if (suspend) wait_suspend( &context );
    attach_dlls( &context, &entry_point );
    start( entry_point, arg );
}

/***********************************************************************
 *           signal_start_thread
 */
void signal_start_thread( LPTHREAD_START_ROUTINE entry, void *arg, BOOL suspend )
{
    thread_startup( call_thread_entry_point, entry, arg, suspend );
}

/**********************************************************************
 *		signal_start_process
 */
void signal_start_process( LPTHREAD_START_ROUTINE entry, BOOL suspend )
{
    thread_startup( kernel32_start_process, entry, NtCurrentTeb()->Peb, suspend );
}

/***********************************************************************
 *           signal_exit_thread
 */
void signal_exit_thread( int status )
{
    exit_thread( status );
}

/***********************************************************************
 *           signal_exit_process
 */
void signal_exit_process( int status )
{
    exit( status );
}

/**********************************************************************
 *              DbgBreakPoint   (NTDLL.@)
 *
 * No debugger can attach, so a breakpoint ends the process as on Windows.
 */
void WINAPI DbgBreakPoint(void)
{
    abort();
}

/**********************************************************************
 *              DbgUserBreakPoint   (NTDLL.@)
 */
void WINAPI DbgUserBreakPoint(void)
{
    abort();
}

/**********************************************************************
 *           NtCurrentTeb   (NTDLL.@)
 */
TEB * WINAPI NtCurrentTeb(void)
{
    return current_teb;
}

#endif  /* __wasm64__ */
