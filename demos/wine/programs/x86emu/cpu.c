/* SPDX-License-Identifier: MIT
 * An x86-64 interpreter for user code: the integer instructions compilers
 * and hand-written programs use, and the SSE moves that copy data. Of x87
 * only the control word, no SSE arithmetic, no JIT; one thread, so a lock
 * prefix changes nothing. An instruction it does not know stops the run
 * with its bytes named; it never guesses.
 *
 * Guest memory is this process's memory: an address is used as it is. */
#include <stdio.h>
#include <string.h>

#include "x86emu.h"

enum { CF = 1, PF = 4, ZF = 0x40, SF = 0x80, DF = 0x400, OF = 0x800 };

struct operand { int is_reg; unsigned reg; uint64_t addr; };

struct decoder
{
    struct cpu *cpu;
    const uint8_t *p;
    unsigned rex, size, opsize16, rep, segment_gs;
};

static uint64_t load( uint64_t addr, unsigned size )
{
    uint64_t value = 0;
    memcpy( &value, (void *)addr, size );
    return value;
}

static void store( uint64_t addr, unsigned size, uint64_t value )
{
    memcpy( (void *)addr, &value, size );
}

static uint64_t mask( unsigned size ) { return size == 8 ? ~0ull : (1ull << (size * 8)) - 1; }
static uint64_t sign( unsigned size ) { return 1ull << (size * 8 - 1); }
static int64_t sext( uint64_t value, unsigned size ) { return size == 8 ? (int64_t)value : (int64_t)((value & mask( size )) ^ sign( size )) - (int64_t)sign( size ); }

static int32_t imm32( struct decoder *d ) { int32_t v; memcpy( &v, d->p, 4 ); d->p += 4; return v; }
static int64_t imm( struct decoder *d, unsigned size )  /* sign-extended; a 64-bit operand takes 32 bits */
{
    int64_t v;
    if (size == 1) v = (int8_t)*d->p++;
    else if (size == 2) { int16_t w; memcpy( &w, d->p, 2 ); d->p += 2; v = w; }
    else v = imm32( d );
    return v;
}

/* a byte register is al..dil, r8b.., or ah ch dh bh without REX */
static uint64_t get_reg( struct decoder *d, unsigned reg, unsigned size )
{
    if (size == 1 && !d->rex && reg >= 4 && reg < 8) return (d->cpu->r[reg - 4] >> 8) & 0xff;
    return d->cpu->r[reg] & mask( size );
}

static void set_reg( struct decoder *d, unsigned reg, unsigned size, uint64_t value )
{
    uint64_t *r = &d->cpu->r[reg];
    if (size == 1 && !d->rex && reg >= 4 && reg < 8) { r = &d->cpu->r[reg - 4]; *r = (*r & ~0xff00ull) | ((value & 0xff) << 8); }
    else if (size == 8) *r = value;
    else if (size == 4) *r = (uint32_t)value;  /* a 32-bit result clears the upper half */
    else *r = (*r & ~mask( size )) | (value & mask( size ));
}

/* ModRM: the reg field and the register or memory operand; tail is the size of what follows the operand */
static unsigned modrm( struct decoder *d, struct operand *op, unsigned tail )
{
    uint8_t byte = *d->p++;
    unsigned mod = byte >> 6, rm = byte & 7, reg = ((byte >> 3) & 7) | ((d->rex & 4) << 1);
    uint64_t addr = 0;

    op->is_reg = mod == 3;
    if (mod == 3) { op->reg = rm | ((d->rex & 1) << 3); return reg; }
    if (rm == 4)
    {
        uint8_t sib = *d->p++;
        unsigned index = ((sib >> 3) & 7) | ((d->rex & 2) << 2), base = (sib & 7) | ((d->rex & 1) << 3);
        if (index != 4) addr = d->cpu->r[index] << (sib >> 6);
        if ((sib & 7) == 5 && mod == 0) addr += imm32( d );
        else addr += d->cpu->r[base];
    }
    else if (rm == 5 && mod == 0)
    {
        int32_t disp = imm32( d );
        addr = (uint64_t)d->p + tail + disp;  /* relative to the next instruction */
    }
    else addr = d->cpu->r[rm | ((d->rex & 1) << 3)];
    if (mod == 1) addr += (int8_t)*d->p++;
    else if (mod == 2) addr += imm32( d );
    if (d->segment_gs) addr += d->cpu->gs_base;
    op->addr = addr;
    return reg;
}

static uint64_t get( struct decoder *d, const struct operand *op, unsigned size )
{
    return op->is_reg ? get_reg( d, op->reg, size ) : load( op->addr, size );
}

static void set( struct decoder *d, const struct operand *op, unsigned size, uint64_t value )
{
    if (op->is_reg) set_reg( d, op->reg, size, value );
    else store( op->addr, size, value );
}

static void set_szp( struct cpu *cpu, uint64_t result, unsigned size )
{
    uint8_t low = result;
    cpu->flags &= ~(ZF | SF | PF);
    if (!(result & mask( size ))) cpu->flags |= ZF;
    if (result & sign( size )) cpu->flags |= SF;
    low ^= low >> 4; low ^= low >> 2; low ^= low >> 1;
    if (!(low & 1)) cpu->flags |= PF;
}

/* add or adc sbb and sub xor cmp, by their number in the opcode map */
static uint64_t alu( struct cpu *cpu, unsigned op, uint64_t a, uint64_t b, unsigned size )
{
    uint64_t m = mask( size ), s = sign( size ), carry = cpu->flags & CF, result;

    a &= m; b &= m;
    cpu->flags &= ~(CF | OF);
    switch (op)
    {
    case 0: case 2:  /* add, adc */
        if (op == 0) carry = 0;
        result = (a + b + carry) & m;
        if (result < a || (carry && result == a)) cpu->flags |= CF;
        if (~(a ^ b) & (a ^ result) & s) cpu->flags |= OF;
        break;
    case 3: case 5: case 7:  /* sbb, sub, cmp */
        if (op != 3) carry = 0;
        result = (a - b - carry) & m;
        if (a < b || (carry && a == b)) cpu->flags |= CF;
        if ((a ^ b) & (a ^ result) & s) cpu->flags |= OF;
        break;
    case 1: result = a | b; break;
    case 4: result = a & b; break;
    default: result = a ^ b; break;
    }
    set_szp( cpu, result, size );
    return result;
}

static int condition( struct cpu *cpu, unsigned code )
{
    uint64_t f = cpu->flags;
    int result;
    switch (code >> 1)
    {
    case 0: result = (f & OF) != 0; break;
    case 1: result = (f & CF) != 0; break;
    case 2: result = (f & ZF) != 0; break;
    case 3: result = (f & (CF | ZF)) != 0; break;
    case 4: result = (f & SF) != 0; break;
    case 5: result = (f & PF) != 0; break;
    case 6: result = !(f & SF) != !(f & OF); break;
    default: result = (f & ZF) || (!(f & SF) != !(f & OF)); break;
    }
    return result ^ (code & 1);
}

static uint64_t shift( struct cpu *cpu, unsigned op, uint64_t value, unsigned count, unsigned size )
{
    unsigned bits = size * 8;
    uint64_t m = mask( size ), result;

    value &= m;
    count &= size == 8 ? 63 : 31;
    if (!count) return value;
    switch (op)
    {
    case 0: count %= bits; result = count ? (value << count) | (value >> (bits - count)) : value; break;  /* rol */
    case 1: count %= bits; result = count ? (value >> count) | (value << (bits - count)) : value; break;  /* ror */
    case 4: case 6:  /* shl */
        result = count < 64 ? value << count : 0;
        cpu->flags = (cpu->flags & ~CF) | ((count <= bits && (value >> (bits - count)) & 1) ? CF : 0);
        break;
    case 5:  /* shr */
        result = count < 64 ? value >> count : 0;
        cpu->flags = (cpu->flags & ~CF) | ((value >> (count - 1)) & 1 ? CF : 0);
        break;
    case 7:  /* sar */
        result = (uint64_t)(sext( value, size ) >> (count < 63 ? count : 63));
        cpu->flags = (cpu->flags & ~CF) | ((sext( value, size ) >> (count - 1 < 63 ? count - 1 : 63)) & 1 ? CF : 0);
        break;
    default: return ~0ull;  /* rcl, rcr: the caller reports them */
    }
    result &= m;
    if (op >= 4)
    {
        set_szp( cpu, result, size );
        cpu->flags = (cpu->flags & ~OF) | (((result ^ value) & sign( size )) && count == 1 ? OF : 0);
    }
    else cpu->flags = (cpu->flags & ~CF) | ((op == 0 ? result & 1 : result & sign( size )) ? CF : 0);
    return result;
}

static void push( struct cpu *cpu, uint64_t value )
{
    cpu->r[RSP] -= 8;
    store( cpu->r[RSP], 8, value );
}

static uint64_t pop( struct cpu *cpu )
{
    uint64_t value = load( cpu->r[RSP], 8 );
    cpu->r[RSP] += 8;
    return value;
}

static void unknown( struct cpu *cpu, const uint8_t *start )
{
    static char text[80];
    snprintf( text, sizeof(text), "unimplemented instruction %02x %02x %02x %02x %02x %02x at %#llx",
              start[0], start[1], start[2], start[3], start[4], start[5], (unsigned long long)start );
    cpu->error = text;
}

/* the two-byte opcodes (0F xx); returns 0 for one it does not know */
static int two_byte( struct decoder *d, const uint8_t *start )
{
    struct cpu *cpu = d->cpu;
    struct operand op;
    unsigned size = d->size, reg, opcode = *d->p++;
    uint64_t value;

    if (opcode >= 0x80 && opcode <= 0x8f)  /* jcc rel32 */
    {
        int32_t rel = imm32( d );
        if (condition( cpu, opcode & 15 )) d->p += rel;
    }
    else if (opcode >= 0x90 && opcode <= 0x9f) { modrm( d, &op, 0 ); set( d, &op, 1, condition( cpu, opcode & 15 ) ); }
    else if (opcode >= 0x40 && opcode <= 0x4f)  /* cmovcc */
    {
        reg = modrm( d, &op, 0 );
        value = get( d, &op, size );
        set_reg( d, reg, size, condition( cpu, opcode & 15 ) ? value : get_reg( d, reg, size ) );
    }
    else switch (opcode)
    {
    case 0x18: case 0x1f: modrm( d, &op, 0 ); break;  /* prefetch, nop */
    case 0xa3: case 0xab: case 0xb3: case 0xbb: case 0xba:  /* bt, bts, btr, btc */
    {
        unsigned operation;
        uint64_t bit;
        reg = modrm( d, &op, opcode == 0xba ? 1 : 0 );
        if (opcode == 0xba) { operation = reg & 3; bit = *d->p++; if ((reg & 7) < 4) { unknown( cpu, start ); return 0; } }
        else
        {
            operation = (opcode >> 3) & 3;
            bit = get_reg( d, reg, size );
            if (!op.is_reg) op.addr += (sext( bit, size ) >> (size == 2 ? 4 : size == 4 ? 5 : 6)) * size;  /* a bit string */
        }
        bit &= size * 8 - 1;
        value = get( d, &op, size );
        cpu->flags = (cpu->flags & ~(uint64_t)CF) | ((value >> bit) & 1);
        if (operation == 1) value |= 1ull << bit;
        else if (operation == 2) value &= ~(1ull << bit);
        else if (operation == 3) value ^= 1ull << bit;
        if (operation) set( d, &op, size, value );
        break;
    }
    case 0xa4: case 0xa5: case 0xac: case 0xad:  /* shld, shrd */
    {
        unsigned count, bits = size * 8;
        uint64_t other, carry;
        reg = modrm( d, &op, opcode & 1 ? 0 : 1 );
        count = (opcode & 1 ? cpu->r[RCX] : *d->p++) & (size == 8 ? 63 : 31);
        value = get( d, &op, size );
        other = get_reg( d, reg, size );
        if (!count) break;
        if (count >= bits) { unknown( cpu, start ); return 0; }
        if (opcode < 0xac) { carry = (value >> (bits - count)) & 1; value = (value << count) | (other >> (bits - count)); }
        else { carry = (value >> (count - 1)) & 1; value = (value >> count) | (other << (bits - count)); }
        set_szp( cpu, value, size );
        cpu->flags = (cpu->flags & ~(uint64_t)CF) | carry;
        set( d, &op, size, value );
        break;
    }
    case 0xb0: case 0xb1:  /* cmpxchg */
        if (opcode == 0xb0) size = 1;
        reg = modrm( d, &op, 0 );
        value = get( d, &op, size );
        alu( cpu, 7, get_reg( d, RAX, size ), value, size );
        if (cpu->flags & ZF) set( d, &op, size, get_reg( d, reg, size ) );
        else set_reg( d, RAX, size, value );
        break;
    case 0xc0: case 0xc1:  /* xadd */
        if (opcode == 0xc0) size = 1;
        reg = modrm( d, &op, 0 );
        value = get( d, &op, size );
        set( d, &op, size, alu( cpu, 0, value, get_reg( d, reg, size ), size ) );
        set_reg( d, reg, size, value );
        break;
    case 0xbc: case 0xbd:  /* bsf, bsr; with F3 they are tzcnt and lzcnt, which differ */
        if (d->rep) { unknown( cpu, start ); return 0; }
        reg = modrm( d, &op, 0 );
        value = get( d, &op, size );
        cpu->flags = (cpu->flags & ~(uint64_t)ZF) | (value ? 0 : ZF);
        if (value) set_reg( d, reg, size, opcode == 0xbc ? __builtin_ctzll( value ) : 63 - __builtin_clzll( value ) );
        break;
    case 0xc8: case 0xc9: case 0xca: case 0xcb: case 0xcc: case 0xcd: case 0xce: case 0xcf:  /* bswap */
        reg = (opcode & 7) | ((d->rex & 1) << 3);
        set_reg( d, reg, size, size == 8 ? __builtin_bswap64( cpu->r[reg] ) : __builtin_bswap32( (uint32_t)cpu->r[reg] ) );
        break;
    case 0xa2: cpu->r[RAX] = cpu->r[RBX] = cpu->r[RCX] = cpu->r[RDX] = 0; break;  /* cpuid: no features */
    case 0xaf:  /* imul r, r/m */
        reg = modrm( d, &op, 0 );
        value = (uint64_t)(sext( get_reg( d, reg, size ), size ) * sext( get( d, &op, size ), size ));
        set_reg( d, reg, size, value );
        cpu->flags = (cpu->flags & ~(CF | OF)) | (sext( value, size ) != (int64_t)value && size < 8 ? CF | OF : 0);
        break;
    case 0xb6: case 0xb7:  /* movzx */
        reg = modrm( d, &op, 0 );
        set_reg( d, reg, size, get( d, &op, opcode & 1 ? 2 : 1 ) );
        break;
    case 0xbe: case 0xbf:  /* movsx */
        reg = modrm( d, &op, 0 );
        set_reg( d, reg, size, (uint64_t)sext( get( d, &op, opcode & 1 ? 2 : 1 ), opcode & 1 ? 2 : 1 ) );
        break;
    case 0x10: case 0x28: case 0x6f:  /* movups/movaps/movdqa/movdqu xmm, xmm/m128; movss/movsd load the low part */
        reg = modrm( d, &op, 0 );
        if (opcode == 0x10 && d->rep)
        {
            unsigned n = d->rep == 0xf3 ? 4 : 8;
            if (op.is_reg) memcpy( cpu->xmm[reg], cpu->xmm[op.reg], n );
            else { cpu->xmm[reg][0] = load( op.addr, n ); cpu->xmm[reg][1] = 0; }
        }
        else if (op.is_reg) memcpy( cpu->xmm[reg], cpu->xmm[op.reg], 16 );
        else memcpy( cpu->xmm[reg], (void *)op.addr, 16 );
        break;
    case 0x11: case 0x29: case 0x7f:  /* the same moves, to xmm/m128 */
        reg = modrm( d, &op, 0 );
        if (opcode == 0x11 && d->rep)
        {
            unsigned n = d->rep == 0xf3 ? 4 : 8;
            if (op.is_reg) memcpy( cpu->xmm[op.reg], cpu->xmm[reg], n );
            else store( op.addr, n, cpu->xmm[reg][0] );
        }
        else if (op.is_reg) memcpy( cpu->xmm[op.reg], cpu->xmm[reg], 16 );
        else memcpy( (void *)op.addr, cpu->xmm[reg], 16 );
        break;
    case 0x6e:  /* movd/movq xmm, r/m */
        reg = modrm( d, &op, 0 );
        cpu->xmm[reg][0] = get( d, &op, d->rex & 8 ? 8 : 4 );
        cpu->xmm[reg][1] = 0;
        break;
    case 0x7e:  /* movd/movq r/m, xmm; with F3, movq xmm, xmm/m64 */
        reg = modrm( d, &op, 0 );
        if (d->rep == 0xf3) { cpu->xmm[reg][0] = op.is_reg ? cpu->xmm[op.reg][0] : load( op.addr, 8 ); cpu->xmm[reg][1] = 0; }
        else set( d, &op, d->rex & 8 ? 8 : 4, cpu->xmm[reg][0] );
        break;
    case 0xd6:  /* movq xmm/m64, xmm */
        reg = modrm( d, &op, 0 );
        if (op.is_reg) { cpu->xmm[op.reg][0] = cpu->xmm[reg][0]; cpu->xmm[op.reg][1] = 0; }
        else store( op.addr, 8, cpu->xmm[reg][0] );
        break;
    case 0x57: case 0xef:  /* xorps, pxor */
        reg = modrm( d, &op, 0 );
        if (op.is_reg) { cpu->xmm[reg][0] ^= cpu->xmm[op.reg][0]; cpu->xmm[reg][1] ^= cpu->xmm[op.reg][1]; }
        else { cpu->xmm[reg][0] ^= load( op.addr, 8 ); cpu->xmm[reg][1] ^= load( op.addr + 8, 8 ); }
        break;
    default:
        unknown( cpu, start );
        return 0;
    }
    return 1;
}

void cpu_run( struct cpu *cpu, uint64_t stops, uint64_t stops_end )
{
    while (cpu->rip < stops || cpu->rip >= stops_end)
    {
        const uint8_t *start = (const uint8_t *)cpu->rip;
        struct decoder d = { cpu, start };

        if (cpu->rip < 0x10000) { cpu->error = "call of a null pointer, or of a function of Wine's as if it were x86 code"; return; }
        struct operand op;
        unsigned opcode, size, reg;
        uint64_t a, b;

        for (;; d.p++)  /* prefixes */
        {
            if (*d.p == 0x66) d.opsize16 = 1;
            else if (*d.p == 0xf2 || *d.p == 0xf3) d.rep = *d.p;
            else if (*d.p == 0x65) d.segment_gs = 1;
            else if (*d.p != 0x2e && *d.p != 0x3e && *d.p != 0x26 && *d.p != 0x36 && *d.p != 0x64 && *d.p != 0xf0) break;
        }
        if ((*d.p & 0xf0) == 0x40) d.rex = *d.p++;
        size = d.size = d.rex & 8 ? 8 : d.opsize16 ? 2 : 4;
        opcode = *d.p++;
        cpu->instructions++;

        if (opcode < 0x40 && (opcode & 7) < 6)  /* the eight arithmetic operations in their six forms */
        {
            unsigned operation = opcode >> 3;
            if (!(opcode & 1)) size = 1;
            if ((opcode & 7) >= 4) { a = get_reg( &d, RAX, size ); b = imm( &d, size ); a = alu( cpu, operation, a, b, size ); if (operation != 7) set_reg( &d, RAX, size, a ); }
            else
            {
                reg = modrm( &d, &op, 0 );
                if (opcode & 2) { a = alu( cpu, operation, get_reg( &d, reg, size ), get( &d, &op, size ), size ); if (operation != 7) set_reg( &d, reg, size, a ); }
                else { a = alu( cpu, operation, get( &d, &op, size ), get_reg( &d, reg, size ), size ); if (operation != 7) set( &d, &op, size, a ); }
            }
        }
        else if (opcode >= 0x50 && opcode <= 0x57) push( cpu, cpu->r[(opcode & 7) | ((d.rex & 1) << 3)] );
        else if (opcode >= 0x58 && opcode <= 0x5f) cpu->r[(opcode & 7) | ((d.rex & 1) << 3)] = pop( cpu );
        else if (opcode >= 0x70 && opcode <= 0x7f) { int8_t rel = *d.p++; if (condition( cpu, opcode & 15 )) d.p += rel; }
        else if (opcode >= 0xb0 && opcode <= 0xb7) set_reg( &d, (opcode & 7) | ((d.rex & 1) << 3), 1, *d.p++ );
        else if (opcode >= 0xb8 && opcode <= 0xbf)
        {
            if (size == 8) { memcpy( &a, d.p, 8 ); d.p += 8; }
            else a = (uint64_t)imm( &d, size );
            set_reg( &d, (opcode & 7) | ((d.rex & 1) << 3), size, a );
        }
        else if (opcode >= 0x91 && opcode <= 0x97)  /* xchg rax, r */
        {
            reg = (opcode & 7) | ((d.rex & 1) << 3);
            a = get_reg( &d, RAX, size ); set_reg( &d, RAX, size, get_reg( &d, reg, size ) ); set_reg( &d, reg, size, a );
        }
        else switch (opcode)
        {
        case 0x0f:
            if (!two_byte( &d, start )) return;
            break;
        case 0x63: reg = modrm( &d, &op, 0 ); set_reg( &d, reg, size, (uint64_t)sext( get( &d, &op, 4 ), 4 ) ); break;  /* movsxd */
        case 0x68: push( cpu, (uint64_t)(int64_t)imm32( &d ) ); break;
        case 0x6a: push( cpu, (uint64_t)(int64_t)(int8_t)*d.p++ ); break;
        case 0x69: case 0x6b:  /* imul r, r/m, imm */
            reg = modrm( &d, &op, opcode == 0x69 ? (size == 2 ? 2 : 4) : 1 );
            a = get( &d, &op, size );
            b = (uint64_t)(opcode == 0x69 ? imm( &d, size ) : (int8_t)*d.p++);
            set_reg( &d, reg, size, (uint64_t)(sext( a, size ) * (int64_t)b) );
            break;
        case 0x80: case 0x81: case 0x83:  /* arithmetic with an immediate */
            if (opcode == 0x80) size = 1;
            reg = modrm( &d, &op, opcode == 0x81 ? (size == 2 ? 2 : 4) : 1 ) & 7;
            b = (uint64_t)(opcode == 0x81 ? imm( &d, size ) : (int8_t)*d.p++);
            a = alu( cpu, reg, get( &d, &op, size ), b, size );
            if (reg != 7) set( &d, &op, size, a );
            break;
        case 0x84: case 0x85:  /* test */
            if (opcode == 0x84) size = 1;
            reg = modrm( &d, &op, 0 );
            alu( cpu, 4, get( &d, &op, size ), get_reg( &d, reg, size ), size );
            break;
        case 0x86: case 0x87:  /* xchg */
            if (opcode == 0x86) size = 1;
            reg = modrm( &d, &op, 0 );
            a = get( &d, &op, size ); set( &d, &op, size, get_reg( &d, reg, size ) ); set_reg( &d, reg, size, a );
            break;
        case 0x88: case 0x89:
            if (opcode == 0x88) size = 1;
            reg = modrm( &d, &op, 0 ); set( &d, &op, size, get_reg( &d, reg, size ) );
            break;
        case 0x8a: case 0x8b:
            if (opcode == 0x8a) size = 1;
            reg = modrm( &d, &op, 0 ); set_reg( &d, reg, size, get( &d, &op, size ) );
            break;
        case 0x8d:  /* lea: the address, without a segment base */
            d.segment_gs = 0;
            reg = modrm( &d, &op, 0 ); set_reg( &d, reg, size, op.addr );
            break;
        case 0x8f: modrm( &d, &op, 0 ); set( &d, &op, 8, pop( cpu ) ); break;
        case 0x90: break;  /* nop, pause */
        case 0x98: if (size == 8) cpu->r[RAX] = (uint64_t)(int64_t)(int32_t)cpu->r[RAX]; else if (size == 4) cpu->r[RAX] = (uint32_t)(int16_t)cpu->r[RAX]; else set_reg( &d, RAX, 2, (uint64_t)(int8_t)cpu->r[RAX] ); break;
        case 0x99: set_reg( &d, RDX, size, sext( cpu->r[RAX], size ) < 0 ? ~0ull : 0 ); break;  /* cdq, cqo */
        case 0xa8: case 0xa9:
            if (opcode == 0xa8) size = 1;
            alu( cpu, 4, get_reg( &d, RAX, size ), (uint64_t)imm( &d, size ), size );
            break;
        case 0x9b: break;  /* fwait */
        case 0x9c: push( cpu, cpu->flags ); break;
        case 0x9d: cpu->flags = pop( cpu ); break;
        case 0xa0: case 0xa1: case 0xa2: case 0xa3:  /* mov between rax and an absolute address */
            if (!(opcode & 1)) size = 1;
            memcpy( &a, d.p, 8 ); d.p += 8;
            if (opcode < 0xa2) set_reg( &d, RAX, size, load( a, size ) );
            else store( a, size, cpu->r[RAX] );
            break;
        case 0xa6: case 0xa7: case 0xae: case 0xaf:  /* cmps, scas: repeated while equal (F3) or while different (F2) */
        {
            int64_t step = (cpu->flags & DF) ? -1 : 1;
            if (!(opcode & 1)) size = 1;
            while (!d.rep || cpu->r[RCX])
            {
                a = opcode < 0xae ? load( cpu->r[RSI], size ) : get_reg( &d, RAX, size );
                alu( cpu, 7, a, load( cpu->r[RDI], size ), size );
                cpu->r[RDI] += step * size;
                if (opcode < 0xae) cpu->r[RSI] += step * size;
                if (!d.rep) break;
                cpu->r[RCX]--;
                if (!(cpu->flags & ZF) == (d.rep == 0xf3)) break;
            }
            break;
        }
        case 0xac: case 0xad:  /* lods */
            if (!(opcode & 1)) size = 1;
            set_reg( &d, RAX, size, load( cpu->r[RSI], size ) );
            cpu->r[RSI] += (cpu->flags & DF) ? -(int64_t)size : (int64_t)size;
            break;
        case 0xa4: case 0xa5: case 0xaa: case 0xab:  /* movs, stos, repeated by rcx */
        {
            int64_t step = (cpu->flags & DF) ? -1 : 1;
            if (!(opcode & 1)) size = 1;
            for (a = d.rep ? cpu->r[RCX] : 1; a; a--)
            {
                store( cpu->r[RDI], size, opcode < 0xaa ? load( cpu->r[RSI], size ) : cpu->r[RAX] );
                cpu->r[RDI] += step * size;
                if (opcode < 0xaa) cpu->r[RSI] += step * size;
            }
            if (d.rep) cpu->r[RCX] = 0;
            break;
        }
        case 0xc0: case 0xc1: case 0xd0: case 0xd1: case 0xd2: case 0xd3:  /* shifts and rotates */
            if (!(opcode & 1)) size = 1;
            reg = modrm( &d, &op, opcode < 0xd0 ? 1 : 0 ) & 7;
            b = opcode < 0xd0 ? *d.p++ : opcode < 0xd2 ? 1 : cpu->r[RCX] & 0xff;
            if (reg == 2 || reg == 3) { unknown( cpu, start ); return; }
            set( &d, &op, size, shift( cpu, reg, get( &d, &op, size ), b, size ) );
            break;
        case 0xc2: a = pop( cpu ); cpu->r[RSP] += (uint16_t)imm( &d, 2 ); d.p = (const uint8_t *)a; break;
        case 0xc3: d.p = (const uint8_t *)pop( cpu ); break;
        case 0xc6: case 0xc7:
            if (opcode == 0xc6) size = 1;
            modrm( &d, &op, size == 1 ? 1 : size == 2 ? 2 : 4 ); set( &d, &op, size, (uint64_t)imm( &d, size ) );
            break;
        case 0xc9: cpu->r[RSP] = cpu->r[RBP]; cpu->r[RBP] = pop( cpu ); break;  /* leave */
        case 0xcc: cpu->error = "breakpoint (int3)"; cpu->rip = (uint64_t)d.p; return;
        case 0xd9: case 0xdb:  /* of x87, its control word: fldcw, fnstcw, fninit, fnclex */
            if (opcode == 0xdb && (*d.p == 0xe2 || *d.p == 0xe3)) { if (*d.p++ == 0xe3) cpu->x87_control = 0x37f; break; }
            reg = modrm( &d, &op, 0 ) & 7;
            if (opcode == 0xd9 && !op.is_reg && reg == 5) cpu->x87_control = load( op.addr, 2 );
            else if (opcode == 0xd9 && !op.is_reg && reg == 7) store( op.addr, 2, cpu->x87_control );
            else { unknown( cpu, start ); return; }
            break;
        case 0xe8: { int32_t rel = imm32( &d ); push( cpu, (uint64_t)d.p ); d.p += rel; break; }
        case 0xe9: { int32_t rel = imm32( &d ); d.p += rel; break; }
        case 0xeb: { int8_t rel = *d.p++; d.p += rel; break; }
        case 0xf6: case 0xf7:  /* test, not, neg, mul, imul, div, idiv */
            if (opcode == 0xf6) size = 1;
            reg = modrm( &d, &op, (d.p[0] & 0x30) ? 0 : size == 1 ? 1 : size == 2 ? 2 : 4 ) & 7;
            a = get( &d, &op, size );
            if (reg < 2) alu( cpu, 4, a, (uint64_t)imm( &d, size ), size );
            else if (reg == 2) set( &d, &op, size, ~a );
            else if (reg == 3) { b = alu( cpu, 5, 0, a, size ); set( &d, &op, size, b ); }
            else if (size == 1) { unknown( cpu, start ); return; }
            else if (reg == 4 || reg == 5)
            {
                unsigned __int128 product = reg == 4 ? (unsigned __int128)get_reg( &d, RAX, size ) * a
                                                    : (unsigned __int128)((__int128)sext( cpu->r[RAX], size ) * sext( a, size ));
                set_reg( &d, RAX, size, (uint64_t)product );
                set_reg( &d, RDX, size, (uint64_t)(product >> (size * 8)) );
            }
            else
            {
                unsigned __int128 dividend = ((unsigned __int128)get_reg( &d, RDX, size ) << (size * 8)) | get_reg( &d, RAX, size );
                if (!(a & mask( size ))) { cpu->error = "division by zero"; return; }
                if (reg == 6) { set_reg( &d, RAX, size, (uint64_t)(dividend / a) ); set_reg( &d, RDX, size, (uint64_t)(dividend % a) ); }
                else
                {
                    __int128 n = size == 8 ? (__int128)dividend : (__int128)sext( (uint64_t)dividend, size * 2 > 8 ? 8 : size * 2 );
                    set_reg( &d, RAX, size, (uint64_t)(n / sext( a, size )) );
                    set_reg( &d, RDX, size, (uint64_t)(n % sext( a, size )) );
                }
            }
            break;
        case 0xf8: cpu->flags &= ~(uint64_t)CF; break;
        case 0xf9: cpu->flags |= CF; break;
        case 0xfc: cpu->flags &= ~(uint64_t)DF; break;
        case 0xfd: cpu->flags |= DF; break;
        case 0xfe: case 0xff:  /* inc, dec, call, jmp, push */
            if (opcode == 0xfe) size = 1;
            reg = modrm( &d, &op, 0 ) & 7;
            if (reg < 2)
            {
                uint64_t carry = cpu->flags & CF;
                a = alu( cpu, reg ? 5 : 0, get( &d, &op, size ), 1, size );
                cpu->flags = (cpu->flags & ~CF) | carry;
                set( &d, &op, size, a );
            }
            else if (reg == 2) { a = get( &d, &op, 8 ); push( cpu, (uint64_t)d.p ); d.p = (const uint8_t *)a; }
            else if (reg == 4) d.p = (const uint8_t *)get( &d, &op, 8 );
            else if (reg == 6) push( cpu, get( &d, &op, 8 ) );
            else { unknown( cpu, start ); return; }
            break;
        default:
            unknown( cpu, start );
            return;
        }
        cpu->rip = (uint64_t)d.p;
    }
}
