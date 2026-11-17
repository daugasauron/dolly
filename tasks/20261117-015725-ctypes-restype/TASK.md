# ctypes' default restype kills the process: an int result of a function that returns 64 bits is a BigInt the FFI cannot store

- STATUS: OPEN
- PRIORITY: 170
- TAGS: bug,dso,python,0.1.8

Found by WS recipes on 2026-11-17 (`ws/recipes`, `work/recipes`), checking python without
libffi's copied files; not caused by that change (the call never reaches libffi's C).

## State (2026-11-17)

Reproduced in Chromium and Firefox; the cause is read from the code, nothing changed.

## Found

In a fresh `default` session after `amy install python`:

```
$ python3 -c 'import ctypes; print(ctypes.CDLL(None).strlen(b"dolly"))'
dolly: process 124 failed: Cannot convert a BigInt value to a number      (status 126)
$ python3 -c 'import ctypes; libc = ctypes.CDLL(None); libc.strlen.argtypes = [ctypes.c_char_p]; libc.strlen.restype = ctypes.c_size_t; print(libc.strlen(b"dolly"))'
5
```

Without `restype`, ctypes declares every foreign function to return `int` (`ffi_type_sint32`),
which on a 64-bit Linux reads the low half of `strlen`'s 64-bit result. Here
`host/dso/ffi.mjs`'s `performCall` calls the table's function, whose Wasm result is `i64`, a
BigInt in JavaScript, and `storeResult` stores the declared `FFI_TYPE_SINT32` with
`setUint32(0, result)`, which throws on a BigInt; the throw ends the process. Python's own
checks and the demo's test all declare `restype` (`Dollyfile-python`, `python-browser.mjs`), so
nothing caught it. Much ctypes code in the wild leaves `restype` to its default for functions
that return `size_t`, pointers or `long`.

Evidence: `work/audit-1116-evidence/recipes/ws-recipes/logs/cases-chromium.jsonl` and
`cases-firefox.jsonl`, case `python-files`, step `use1`.

## Do

In `storeResult` (and wherever a declared integer meets a result of the other width), store the
declared width of the value the function returned, as a native ABI does: a BigInt result for a
32-bit or narrower type is `Number(BigInt.asUintN(bits, result))`, and a Number result for a
64-bit type is `BigInt(result)`. Add the call above to a dso test (`test/dso-*` or
`demos/python/test/python-browser.mjs`'s ctypes step).

## Done when

The first command prints 5 in Chromium and Firefox, and a test calls a foreign function whose
declared result is narrower than its Wasm result.
