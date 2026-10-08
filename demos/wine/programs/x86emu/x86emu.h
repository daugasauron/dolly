/* SPDX-License-Identifier: MIT */
#ifndef WINE_DOLLY_X86EMU_H
#define WINE_DOLLY_X86EMU_H

#include <stdint.h>

/* The state of one x86-64 thread. Guest addresses are addresses of this process's memory. */
struct cpu
{
    uint64_t r[16];         /* rax rcx rdx rbx rsp rbp rsi rdi r8..r15 */
    uint64_t rip;
    uint64_t flags;
    uint64_t xmm[16][2];
    uint64_t gs_base;       /* the TEB, as on Windows */
    uint64_t x87_control;
    uint64_t instructions;
    const char *error;      /* why it stopped, when not by returning */
};

enum { RAX, RCX, RDX, RBX, RSP, RBP, RSI, RDI, R8, R9 };

/* Runs until rip is one of the addresses in [stops, stops_end): the caller's calls out of the guest. */
extern void cpu_run( struct cpu *cpu, uint64_t stops, uint64_t stops_end );

#endif
