/* SPDX-License-Identifier: MIT */
/* What the thunks that icall --thunks writes share with port/icall.c. An argument or result travels
 * between them in a 64-bit slot: an integer extended as a register would hold it, a float as its bits. */
struct icall_signature
{
    const char     *name;                                                   /* "jj_i": two i64, an i32 result */
    unsigned long (*call)( unsigned long function, const unsigned long *arguments );
    unsigned long   probe;                                                  /* a function of the type */
    unsigned short *type;                                                   /* the type's index in this program */
};

extern const struct icall_signature icall_signatures[];
extern unsigned short *icall_types;     /* the type index of the function behind each pointer */
extern unsigned long icall_slots;       /* how many: 0 until the program's file was read */
extern unsigned long icall_adapt( unsigned long function, const char *caller, const unsigned long *arguments );

static inline unsigned long icall_from_i( int value ) { return (long)value; }
static inline unsigned long icall_from_j( long value ) { return value; }
static inline unsigned long icall_from_f( float value ) { union { float f; unsigned int bits; } u = { value }; return u.bits; }
static inline unsigned long icall_from_d( double value ) { union { double d; unsigned long bits; } u = { value }; return u.bits; }
static inline int icall_to_i( unsigned long slot ) { return slot; }
static inline long icall_to_j( unsigned long slot ) { return slot; }
static inline float icall_to_f( unsigned long slot ) { union { unsigned int bits; float f; } u = { slot }; return u.f; }
static inline double icall_to_d( unsigned long slot ) { union { unsigned long bits; double d; } u = { slot }; return u.d; }
