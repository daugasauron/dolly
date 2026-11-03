# Installing matplotlib on Dolly: report

Session log of installing Python and matplotlib on Dolly (wasm64, in a browser
tab), the problems found, how far it got and what each problem is.

## Summary

| Item | State |
|---|---|
| Python 3.14.7 (`amy install python`) | works. Needed `nena enable dso sockets` first |
| numpy 2.5.4 | built from source, works |
| Pillow 13.0.0 | built from source, works. Its FreeType module does not load (`undefined symbol: png_create_read_struct`) |
| contourpy 1.4.0, kiwisolver 1.5.1, fonttools, cycler, pyparsing, packaging, python-dateutil | installed |
| matplotlib 3.11.2 | builds and installs, but **`import matplotlib.pyplot` fails** |

There are two blocking bugs in Dolly, plus several smaller ones that can be
worked around:

1. **C++ exceptions cannot be caught by type in shared libraries (blocks
   matplotlib).** Inside any `-shared` object (a Python extension module),
   `catch (T&)` never matches; only `catch (...)` runs. The landing pads in a
   shared library treat the thread-local `__wasm_lpad_context` as a plain
   global. They use its TLS offset (`0x48`) as an absolute address, while the
   C++ runtime in the program uses `__tls_base + 0x48`. Every pybind11 module is
   affected. matplotlib hits it during `import matplotlib.pyplot`. Details and
   reproduction are in section 3.
2. **Python is built without threads (`pthread-stubs`), which makes
   `ThreadPoolExecutor` hang forever.** `Thread.start()` runs the target to
   completion before it returns. `concurrent.futures.ThreadPoolExecutor.submit()`
   therefore never returns: the worker runs the first job, then waits for more
   work for ever. This caused the Pillow build hang of more than an hour.
   Section 2.

Smaller issues, all worked around: Python's `sysconfig` records Emscripten
flags (`-sMEMORY64=1`) that Dolly's `cc` rejects. `cc` rejects `-flto`, and
`-pthread` together with `-shared`. `patch` lacks `-l`/`-f`, which Meson uses.
`tar` cannot read pax headers and has no `-z`. Upstream source hosts
(github.com, savannah) send no CORS headers. matplotlib's `_qhull` module
fails to load (`undefined symbol: __small_sprintf`); this was not
investigated.

---

## 1. Python itself

```
amy install python
# -> needs dso@0 and sockets@0: nena enable dso sockets
nena enable dso sockets
amy install python        # also pulled in libffi
python --version          # Python 3.14.7
```

`amy` noted that the environment variables the package sets apply only from
the next session load. Python worked without them.

## 2. Bug: the Pillow build hung for more than an hour (thread pools deadlock)

### Symptom

`pip install pillow` compiled every C file and linked
`PIL/_imaging...so`. The `.so` exists on disk. After that it printed nothing
more and never finished. `cat /proc/processes` showed the build backend
(`_in_process.py build_wheel`) still running with **no child process**. A
retry with `-C parallel=1` hung at exactly the same point.

### Ruled out

- The link step itself: running the same `cc -shared ...` command from the
  shell takes 0.06 s and returns 0. So does running it from Python with
  `subprocess.run`.

### Root cause

```
$ python -c 'import sys; print(sys.thread_info)'
sys.thread_info(name='pthread-stubs', lock=None, version=None)
```

This Python has no real threads. `threading.Thread.start()` runs the target to
completion before `start()` returns:

```
order=[]; t=threading.Thread(target=lambda: order.append("thread")); t.start(); order.append("after start")
# -> ['thread', 'after start']
```

So `ThreadPoolExecutor` deadlocks on its first `submit()`. The worker thread
starts "inside" `submit()`, runs job 1, then blocks on the work queue. Control
never returns to the caller, which would put job 2 in the queue or shut the
pool down:

```
timeout 15 python -c '
from concurrent.futures import ThreadPoolExecutor
with ThreadPoolExecutor(max_workers=1) as ex:
    f1 = ex.submit(lambda: "job1"); print("submit 1 returned")'
# prints nothing; exit status 124 (killed by timeout)
```

`setuptools/_distutils/command/build_ext.py` line 495: `if self.parallel:`
sends any non-zero value, **including 1**, through
`ThreadPoolExecutor(max_workers=workers)`. Pillow's `setup.py` sets `parallel`
to `MAX_CONCURRENCY`, or to `os.cpu_count()` (1 here) when that is unset. The
first extension (`_imaging`) builds inside the first `submit()`, and then the
process waits for ever. That matches the symptom exactly. pybind11's
`ParallelCompile` is not involved: `cpu_count() == 1` keeps it serial.

`faulthandler.dump_traceback_later()` also fails here with "unable to start
watchdog thread", which is a quick tell that threads are stubs.

### Workaround

`MAX_CONCURRENCY=0`: Pillow then sets `parallel = 0` and setuptools takes its
serial path. Pillow then built in about 30 s.

### Suggested fix (Dolly)

Build the `python` package with real pthreads: the image declares
`threads@0`. Otherwise make `_thread.start_new_thread` raise, so that code
falls back or fails immediately instead of deadlocking. Anything that uses
`concurrent.futures` or `multiprocessing.pool.ThreadPool` hangs today.

## 3. Bug: C++ exceptions in shared objects are never matched by type (blocks matplotlib)

### Symptom

matplotlib 3.11.2 built and installed, but:

```
>>> import matplotlib.pyplot
  File ".../matplotlib/_mathtext_data.py", line 8, in <module>
    from .ft2font import CharacterCodeType
RuntimeError: Caught an unknown exception!
```

`import matplotlib.ft2font` succeeds. `from matplotlib.ft2font import X`
fails every time, because `from` probes `__path__` through the module's C++
`__getattr__`, which throws `py::attribute_error`. Every C++ exception from a
matplotlib module is reported as "Caught an unknown exception!". That includes
`_image` loaded on its own, with no other pybind11 module in the process. A
minimal pybind11 module behaves the same way:

```cpp
PYBIND11_MODULE(t, m) { m.def("f", []() { throw py::value_error("boom"); }); }
// t.f() -> RuntimeError: Caught an unknown exception!  (expected ValueError)
```

This happens with every flag combination tried (`-O0`, `-O3`, `-fvisibility=hidden`,
`-fexceptions`). contourpy only appeared to work because the error tested was
raised from its Python code.

### Reduced to plain C++ (no Python, no pybind11)

```cpp
// lib.cpp
struct mine : std::runtime_error { using std::runtime_error::runtime_error; };
extern "C" int probe(void) {
  int r = 0;
  try { throw mine("x"); }          catch (mine &)           { r |= 1; } catch (...) { r |= 16; }
  try { throw std::runtime_error("x"); } catch (std::exception &) { r |= 2; } catch (...) { r |= 32; }
  try { throw 42; }                 catch (int)              { r |= 4; } catch (...) { r |= 64; }
  try { throw mine("x"); }          catch (std::exception &) { r |= 8; } catch (...) { r |= 128; }
  return r;   // 15 = all typed catches matched
}
```

| Build | Result |
|---|---|
| linked statically into a program | `15`: all typed catches match |
| `c++ -shared`, loaded by a `-rdynamic` Dolly program with `dlopen` | `240`: every catch falls to `catch (...)` |
| `c++ -shared`, loaded by Python with `ctypes` | `240` |

Even `catch (int)` fails, so this is not about type identity across libraries.

### Ruled out

- **Type-info identity:** in the shared library, `&typeid(int)` from code
  and from a data relocation are the same (`0x3c68`), and the names match.
- **The exception table (LSDA):** disassembly (`wasm2wat`, from
  `amy install wabt`) shows a correct table. The type table slot for filter 2
  (`catch (int)`) is patched with `GOT.mem._ZTIi` by
  `__wasm_apply_data_relocs`. The call-site and action records are correct.

### Root cause

The landing pad in the shared library writes the LSDA pointer into
`__wasm_lpad_context` and reads the selected handler back from it. That
symbol is imported as a plain global address:

```
(import "GOT.mem" "__wasm_lpad_context" (global $__wasm_lpad_context (mut i64)))
...
global.get $__wasm_lpad_context  ;; store lpad index (+0) and LSDA (+8)
call $__gxx_wasm_personality_v0
... i32.load offset=16            ;; read the selector back
```

In the program (the `-rdynamic` test program, and `/usr/bin/python`),
`__wasm_lpad_context` is **thread-local**. The exported value `72` is an
offset from `__tls_base`, not an address:

```
global[873] i64 mutable=0 <__wasm_lpad_context> - init i64=72
func[5047] <thread-local wrapper routine for __wasm_lpad_context> -> "_ZTW19__wasm_lpad_context"
```

Printed from inside a shared library:

```
DSO's __wasm_lpad_context      = 0x48        (= 72: the TLS offset used as an address)
program's thread-local context = 0x63168     (in Python: 0x4230c8)
```

So the personality routine (libc++abi/libunwind in the program) reads its
own, thread-local context and never sees the library's LSDA, so it finds no
typed handler. The library reads selector 0 from address `0x48` and runs
`catch (...)`.

It also corrupts memory: every landing pad in any shared library writes 24
bytes at absolute address `0x48..0x60` of the program's memory, whatever lives
there.

Probable origin: LLVM's WasmEHPrepare makes `__wasm_lpad_context`
thread-local only when the module is compiled with atomics and bulk memory,
the thread model. Dolly compiles `-shared` objects without threads.
`dolly-cc` refuses `-pthread` with `-shared` ("requires a static process"),
while the program's libunwind was built thread-enabled. The two disagree on
the symbol's model. This explanation has not been checked against Dolly's
toolchain source.

### Suggested fixes (Dolly)

- Compile `-shared` C++ objects with the same thread model as the programs
  that load them, so their landing pads use `__tls_base`-relative access.
- Or have the loader reject, or remap, a `GOT.mem` import that resolves to a
  TLS symbol, instead of handing the TLS offset over as an address.
- Or build libunwind/libc++abi so that `__wasm_lpad_context` is not
  thread-local in programs that host shared objects.

Reproduction files are in `/workspace/ehtest/` (`lib.cpp`, `lib4.cpp`,
`lib5.cpp`, `main2.cpp`, `t.cpp`):

```
cd /workspace/ehtest
c++ -O1 -rdynamic main2.cpp -o dyn_t
c++ -O1 -shared lib.cpp  -o libprobe.so && ./dyn_t ./libprobe.so   # 240 (should be 15)
c++ -O1 main.cpp lib.cpp -o static_t && ./static_t                # 15
c++ -O1 -shared lib5.cpp -o lib5.so && ./dyn_t ./lib5.so          # the two addresses differ
```

## 4. Other issues met while building, all worked around

| Issue | Where | Workaround |
|---|---|---|
| `cc: unsupported option: -sMEMORY64=1`. Python's sysconfig `CFLAGS`/`LDFLAGS`/`LDSHARED` hold Emscripten flags (`-sMEMORY64=1`, `-sWASM_BIGINT`, `-sEXIT_RUNTIME`). `LDCXXSHARED` is `/emsdk/upstream/emscripten/emcc ...` | setuptools builds (Pillow) | wrapper `cc`/`c++` in `~/.local/ccwrap` that drop those flags. `LDCXXSHARED="c++ -shared"` |
| `-Werror`: pybind11 3.1.0's `struct_smart_holder.h:71` triggers `-Wunused-template` | contourpy | `-C setup-args=-Dwerror=false` |
| contourpy was built with `-O0 -g` by default | contourpy | `-C setup-args=-Dbuildtype=release` |
| matplotlib downloads FreeType (savannah), HarfBuzz, libraqm, SheenBidi and qhull (github.com): no CORS, so "Browser could not fetch the URL" | matplotlib | see section 5 |
| `patch: unsupported option: -l`. Meson runs `patch -l -f -p1 -i FILE`; Dolly's `patch` (built on git apply) has `-pN -R -s --dry-run -d -i` only | matplotlib's wraps | wrapper `patch` in `~/.local/ccwrap` that drops `-l` and `-f`. All 5 patches apply |
| `c++: unsupported option: -flto`. matplotlib sets `b_lto=true` | matplotlib | `-C setup-args=-Db_lto=false` |
| `-pthread requires a static process; shared libraries and -rdynamic are unsupported`. HarfBuzz's `dependency('threads')` adds `-pthread` to the `ft2font` link | matplotlib | the wrappers drop `-pthread` when `-shared` is present |
| `tar: -z is not supported`. `tar: validate path ././@PaxHeader: Not supported` | unpacking the PyPI sdist | extracted with Python's `tarfile` |
| `-Wl,--version-script` reported unsupported by Meson | matplotlib | none needed: its symbol-hiding map is skipped |
| Pillow `_imagingft`: `undefined symbol: png_create_read_struct`. amy's static `libfreetype.a` needs libpng, and Pillow does not link `-lpng` | Pillow | not fixed. matplotlib does not need it |
| `_qhull`: `undefined symbol: __small_sprintf` | matplotlib | not investigated (qhull's `snprintf` resolves to a libc-internal symbol the program does not export) |

The build environment used for everything after numpy:

```
export PATH=$HOME/.local/ccwrap:$PATH LDCXXSHARED="c++ -shared" MAX_CONCURRENCY=0
```

`~/.local/ccwrap/cc` (`c++` is the same, ending in `exec /bin/c++`):

```sh
#!/bin/slop
shared=
for a; do case $a in -shared) shared=1 ;; esac; done
for a; do
  shift
  case $a in
    -sMEMORY64=1|-sWASM_BIGINT|-sEXIT_RUNTIME) ;;
    -pthread) [ -n "$shared" ] || set -- "$@" "$a" ;;
    *) set -- "$@" "$a" ;;
  esac
done
exec /bin/cc "$@"
```

`~/.local/ccwrap/patch`:

```sh
#!/bin/slop
for a; do
  shift
  case $a in
    -l|-f) ;;
    *) set -- "$@" "$a" ;;
  esac
done
exec /bin/patch "$@"
```

## 5. Getting matplotlib's bundled sources without github.com

matplotlib 3.11 builds its own FreeType 2.14.3, HarfBuzz 14.1.0, libraqm
0.10.5, SheenBidi 3.0.0 and qhull 8.0.2 through Meson wraps
(`subprojects/*.wrap`). libraqm is required (`ft2font` links it). The wrap URLs
are on hosts without CORS. jsDelivr's GitHub mirror refuses HarfBuzz
("Package size exceeded the configured limit of 50 MB").

What worked:

1. `fetchgh.js` (Janis) lists the tree at the tag with
   `api.github.com/repos/O/R/git/trees/TAG?recursive=1`. It then downloads each
   file from `raw.githubusercontent.com`, 16 requests at a time, skipping a
   path regex but always keeping `meson.build`, `meson_options.txt` and
   `meson.options`:
   - `harfbuzz/harfbuzz 14.1.0`, skipping `^(test|perf|docs)/`: 727 files, 8 MB, 15 s
   - `Tehreer/SheenBidi v3.0.0`, skipping `^Tools/Unicode/`: its `meson.build` uses `Tools/Version`, `Tools/Parser` and `Tools/Generator`
   - `freetype/freetype VER-2-14-3` (GitHub mirror) and `qhull/qhull v8.0.2`: complete
   - `HOST-Oman/libraqm v0.10.5`: complete
2. `packwraps.py` packs each tree as `subprojects/packagecache/<directory>.tar.gz`.
   It then rewrites `source_filename` and `source_hash` in the wrap. Meson
   uses the cached file ("Using freetype2 source from cache") and applies the
   wrap's `patch_directory` and `diff_files` as usual.

Then:

```
pip install -v -C setup-args=-Dwerror=false -C setup-args=-Dbuildtype=release \
    -C setup-args=-Db_lto=false ./matplotlib-3.11.2
```

The build has 165 steps and took about 4 minutes. Result: `Successfully
installed matplotlib-3.11.2`.

## 6. Current state of the extension modules

| Module | Import | C++ errors |
|---|---|---|
| `matplotlib._path`, `_image`, `_tri`, `_c_internal_utils`, `backends._backend_agg`, `ft2font` | ok | every C++ exception becomes `RuntimeError: Caught an unknown exception!` (section 3) |
| `matplotlib._qhull` | `ImportError: undefined symbol: __small_sprintf` | - |
| `import matplotlib.pyplot` | **fails** (section 3, through `ft2font.__getattr__`) | - |

Possible stop-gap, not done: patch `src/ft2font_wrapper.cpp` so it doesn't
install the module `__getattr__`, which only serves deprecated names. That
would probably let `pyplot` import. But every error path in matplotlib's C++
code would still surface as an untyped `RuntimeError`. Normal control flow
that relies on exceptions (font fallback, bad arguments, `py::cast` failures)
would misbehave, and each caught exception scribbles on address `0x48`. The
real fix is in Dolly's toolchain (section 3).

## 7. Notes on this session's own mistakes

- My first `pip install pillow` ran without `-v`, inside a tool call with a
  one-hour limit, so the hang went unnoticed for that long. A later background
  run whose output was not redirected kept the tool call open (about 1.5 h)
  until the user stopped it. When a backgrounded job's stdout/stderr are not
  redirected (`> /dev/null 2>&1`), the tool waits for EOF. Run long builds as
  `slop -c '... > log 2>&1' > /dev/null 2>&1 &`, under `timeout`, and poll the
  log with short commands.

## 8. Files

| Path | What |
|---|---|
| `~/.local/ccwrap/{cc,c++,patch}` | the wrappers above |
| `/workspace/fetchgh.js` | GitHub tree fetcher (Janis) |
| `/workspace/packwraps.py` | packs `srcs/` into matplotlib's Meson packagecache and rewrites the wraps |
| `/workspace/srcs/` | fetched FreeType, HarfBuzz, libraqm, SheenBidi and qhull sources |
| `/workspace/matplotlib-3.11.2/` | the sdist, with edited wraps and `subprojects/packagecache/` |
| `/workspace/ehtest/` | C++ exception reproductions (section 3) |
| `/workspace/pildbg/`, `/workspace/pildbg-env/` | copy of the Pillow build tree and its build environment (section 2) |
| `/tmp/*.log` | build logs (lost on reload) |
