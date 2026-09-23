#include "maths/Fixed.h"

static_assert(sizeof(void*) == 8);
extern "C" int pointer_bytes() { return sizeof(void*); }
extern "C" int fixed_mul(int a, int b) { return fixed::FromInt(a).Multiply(fixed::FromInt(b)).ToInt_RoundToZero(); }
extern "C" int fixed_fraction(int n, int d) { return fixed::FromFraction(n, d).GetInternalValue(); }
extern "C" int fixed_round(int n, int d) { return fixed::FromFraction(n, d).ToInt_RoundToNegInfinity(); }
