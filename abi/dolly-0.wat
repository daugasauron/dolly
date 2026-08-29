(module
  ;; This module is a schema, not executable runtime code. Its imports are the
  ;; facilities a Dolly command may use, and its exports are the entry points a
  ;; Dolly command must provide.

  ;; Shared-everything wasm64 dynamic-linking infrastructure. The runtime
  ;; guarantees at least 64 MiB and may grow to 8 GiB. The loader grows the
  ;; shared table to accommodate each command's dylink metadata.
  (import "env" "memory" (memory i64 1024 131072 shared))
  (import "env" "__indirect_function_table" (table i64 1 funcref))
  (import "env" "__stack_pointer" (global (mut i64)))
  (import "env" "__memory_base" (global i64))
  (import "env" "__table_base" (global i64))

  ;; Files, streams, and diagnostics. These operate on the runtime-owned
  ;; WasmFS; no filesystem operation is delegated to the browser.
  (import "env" "chdir" (func $chdir (param i64) (result i32)))
  (import "env" "clearerr" (func $clearerr (param i64)))
  (import "env" "closedir" (func $closedir (param i64) (result i32)))
  (import "env" "feof" (func $feof (param i64) (result i32)))
  (import "env" "ferror" (func $ferror (param i64) (result i32)))
  (import "env" "fgetc" (func $fgetc (param i64) (result i32)))
  (import "env" "fflush" (func $fflush (param i64) (result i32)))
  (import "env" "fgets" (func $fgets (param i64 i32 i64) (result i64)))
  (import "env" "fmemopen" (func $fmemopen (param i64 i64 i64) (result i64)))
  (import "env" "fiprintf" (func $fiprintf (param i64 i64 i64) (result i32)))
  (import "env" "fileno" (func $fileno (param i64) (result i32)))
  (import "env" "fopen" (func $fopen (param i64 i64) (result i64)))
  (import "env" "fputc" (func $fputc (param i32 i64) (result i32)))
  (import "env" "fputs" (func $fputs (param i64 i64) (result i32)))
  (import "env" "fread" (func $fread (param i64 i64 i64 i64) (result i64)))
  (import "env" "freopen" (func $freopen (param i64 i64 i64) (result i64)))
  (import "env" "fgetpos" (func $fgetpos (param i64 i64) (result i32)))
  (import "env" "fsetpos" (func $fsetpos (param i64 i64) (result i32)))
  (import "env" "fseek" (func $fseek (param i64 i64 i32) (result i32)))
  (import "env" "ftell" (func $ftell (param i64) (result i64)))
  (import "env" "ftello" (func $ftello (param i64) (result i64)))
  (import "env" "fwrite" (func $fwrite (param i64 i64 i64 i64) (result i64)))
  (import "env" "getc" (func $getc (param i64) (result i32)))
  (import "env" "getline" (func $getline (param i64 i64 i64) (result i64)))
  (import "env" "getcwd" (func $getcwd (param i64 i64) (result i64)))
  (import "env" "iprintf" (func $iprintf (param i64 i64) (result i32)))
  (import "env" "mkdir" (func $mkdir (param i64 i32) (result i32)))
  (import "env" "opendir" (func $opendir (param i64) (result i64)))
  (import "env" "perror" (func $perror (param i64)))
  (import "env" "puts" (func $puts (param i64) (result i32)))
  (import "env" "putchar" (func $putchar (param i32) (result i32)))
  (import "env" "putc" (func $putc (param i32 i64) (result i32)))
  (import "env" "readdir" (func $readdir (param i64) (result i64)))
  (import "env" "remove" (func $remove (param i64) (result i32)))
  (import "env" "rename" (func $rename (param i64 i64) (result i32)))
  (import "env" "setvbuf" (func $setvbuf (param i64 i64 i32 i64) (result i32)))
  (import "env" "tmpfile" (func $tmpfile (result i64)))
  (import "env" "tmpnam" (func $tmpnam (param i64) (result i64)))
  (import "env" "ungetc" (func $ungetc (param i32 i64) (result i32)))
  (import "env" "vfprintf" (func $vfprintf (param i64 i64 i64) (result i32)))
  (import "env" "__small_printf" (func $__small_printf (param i64 i64) (result i32)))
  (import "env" "__small_fprintf" (func $__small_fprintf (param i64 i64 i64) (result i32)))

  ;; Descriptor and path operations remain entirely inside runtime-owned
  ;; WasmFS. Dolly has no host filesystem adapter.
  (import "env" "fstat" (func $fstat (param i32 i64) (result i32)))
  (import "env" "lstat" (func $lstat (param i64 i64) (result i32)))
  (import "env" "open" (func $open (param i64 i32 i64) (result i32)))
  (import "env" "close" (func $close (param i32) (result i32)))
  (import "env" "read" (func $read (param i32 i64 i64) (result i64)))
  (import "env" "write" (func $write (param i32 i64 i64) (result i64)))
  (import "env" "lseek" (func $lseek (param i32 i64 i32) (result i64)))
  (import "env" "unlink" (func $unlink (param i64) (result i32)))
  (import "env" "rmdir" (func $rmdir (param i64) (result i32)))
  (import "env" "access" (func $access (param i64 i32) (result i32)))
  (import "env" "link" (func $link (param i64 i64) (result i32)))
  (import "env" "symlink" (func $symlink (param i64 i64) (result i32)))
  (import "env" "readlink" (func $readlink (param i64 i64 i64) (result i64)))
  (import "env" "realpath" (func $realpath (param i64 i64) (result i64)))
  (import "env" "ftruncate" (func $ftruncate (param i32 i64) (result i32)))
  (import "env" "fsync" (func $fsync (param i32) (result i32)))
  (import "env" "utime" (func $utime (param i64 i64) (result i32)))
  (import "env" "statvfs" (func $statvfs (param i64 i64) (result i32)))
  (import "env" "dup" (func $dup (param i32) (result i32)))
  (import "env" "dup2" (func $dup2 (param i32 i32) (result i32)))
  (import "env" "pipe" (func $pipe (param i64) (result i32)))
  (import "env" "fdopen" (func $fdopen (param i32 i64) (result i64)))
  (import "env" "isatty" (func $isatty (param i32) (result i32)))
  (import "env" "ioctl" (func $ioctl (param i32 i32 i64) (result i32)))
  (import "env" "mkdtemp" (func $mkdtemp (param i64) (result i64)))
  (import "env" "mkstemp" (func $mkstemp (param i64) (result i32)))
  (import "env" "dirname" (func $dirname (param i64) (result i64)))
  (import "env" "basename" (func $basename (param i64) (result i64)))
  (import "env" "setbuf" (func $setbuf (param i64 i64)))
  (import "env" "rewind" (func $rewind (param i64)))
  (import "env" "fscanf" (func $fscanf (param i64 i64 i64) (result i32)))
  (import "env" "vprintf" (func $vprintf (param i64 i64) (result i32)))
  (import "env" "flockfile" (func $flockfile (param i64)))
  (import "env" "funlockfile" (func $funlockfile (param i64)))
  (import "env" "getc_unlocked" (func $getc_unlocked (param i64) (result i32)))

  ;; Allocation and errno.
  (import "env" "__errno_location" (func $__errno_location (result i64)))
  (import "env" "calloc" (func $calloc (param i64 i64) (result i64)))
  (import "env" "free" (func $free (param i64)))
  (import "env" "malloc" (func $malloc (param i64) (result i64)))
  (import "env" "realloc" (func $realloc (param i64 i64) (result i64)))
  (import "env" "strerror" (func $strerror (param i32) (result i64)))

  ;; Byte strings and character classification.
  (import "env" "isalnum" (func $isalnum (param i32) (result i32)))
  (import "env" "isalpha" (func $isalpha (param i32) (result i32)))
  (import "env" "iscntrl" (func $iscntrl (param i32) (result i32)))
  (import "env" "isdigit" (func $isdigit (param i32) (result i32)))
  (import "env" "isgraph" (func $isgraph (param i32) (result i32)))
  (import "env" "islower" (func $islower (param i32) (result i32)))
  (import "env" "isprint" (func $isprint (param i32) (result i32)))
  (import "env" "ispunct" (func $ispunct (param i32) (result i32)))
  (import "env" "isspace" (func $isspace (param i32) (result i32)))
  (import "env" "isupper" (func $isupper (param i32) (result i32)))
  (import "env" "isxdigit" (func $isxdigit (param i32) (result i32)))
  (import "env" "mbtowc" (func $mbtowc (param i64 i64 i64) (result i32)))
  (import "env" "memchr" (func $memchr (param i64 i32 i64) (result i64)))
  (import "env" "memcmp" (func $memcmp (param i64 i64 i64) (result i32)))
  (import "env" "memmove" (func $memmove (param i64 i64 i64) (result i64)))
  (import "env" "snprintf" (func $snprintf (param i64 i64 i64 i64) (result i32)))
  (import "env" "siprintf" (func $siprintf (param i64 i64 i64) (result i32)))
  (import "env" "sscanf" (func $sscanf (param i64 i64 i64) (result i32)))
  (import "env" "strcasecmp" (func $strcasecmp (param i64 i64) (result i32)))
  (import "env" "strcat" (func $strcat (param i64 i64) (result i64)))
  (import "env" "strchr" (func $strchr (param i64 i32) (result i64)))
  (import "env" "strcoll" (func $strcoll (param i64 i64) (result i32)))
  (import "env" "strcmp" (func $strcmp (param i64 i64) (result i32)))
  (import "env" "strcspn" (func $strcspn (param i64 i64) (result i64)))
  (import "env" "strcpy" (func $strcpy (param i64 i64) (result i64)))
  (import "env" "strdup" (func $strdup (param i64) (result i64)))
  (import "env" "stpcpy" (func $stpcpy (param i64 i64) (result i64)))
  (import "env" "strlen" (func $strlen (param i64) (result i64)))
  (import "env" "strncmp" (func $strncmp (param i64 i64 i64) (result i32)))
  (import "env" "strncasecmp" (func $strncasecmp (param i64 i64 i64) (result i32)))
  (import "env" "strncpy" (func $strncpy (param i64 i64 i64) (result i64)))
  (import "env" "strndup" (func $strndup (param i64 i64) (result i64)))
  (import "env" "strpbrk" (func $strpbrk (param i64 i64) (result i64)))
  (import "env" "strrchr" (func $strrchr (param i64 i32) (result i64)))
  (import "env" "strspn" (func $strspn (param i64 i64) (result i64)))
  (import "env" "strstr" (func $strstr (param i64 i64) (result i64)))
  (import "env" "strsignal" (func $strsignal (param i32) (result i64)))
  (import "env" "strtod" (func $strtod (param i64 i64) (result f64)))
  (import "env" "strtol" (func $strtol (param i64 i64 i32) (result i64)))
  (import "env" "strtoll" (func $strtoll (param i64 i64 i32) (result i64)))
  (import "env" "strtoul" (func $strtoul (param i64 i64 i32) (result i64)))
  (import "env" "strtoull" (func $strtoull (param i64 i64 i32) (result i64)))
  (import "env" "atol" (func $atol (param i64) (result i64)))
  (import "env" "tolower" (func $tolower (param i32) (result i32)))
  (import "env" "towlower" (func $towlower (param i32) (result i32)))
  (import "env" "toupper" (func $toupper (param i32) (result i32)))
  (import "env" "towupper" (func $towupper (param i32) (result i32)))
  (import "env" "vsnprintf" (func $vsnprintf (param i64 i64 i64 i64) (result i32)))
  (import "env" "wctomb" (func $wctomb (param i64 i32) (result i32)))
  (import "env" "memrchr" (func $memrchr (param i64 i32 i64) (result i64)))
  (import "env" "vsprintf" (func $vsprintf (param i64 i64 i64) (result i32)))
  (import "env" "__small_sprintf" (func $__small_sprintf (param i64 i64 i64) (result i32)))
  (import "env" "__ctype_get_mb_cur_max" (func $__ctype_get_mb_cur_max (result i64)))

  ;; POSIX regular expressions. The first upstream text-search utility uses
  ;; these without needing any browser capability.
  (import "env" "regcomp" (func $regcomp (param i64 i64 i32) (result i32)))
  (import "env" "regerror" (func $regerror (param i32 i64 i64 i64) (result i64)))
  (import "env" "regexec" (func $regexec (param i64 i64 i64 i64 i32) (result i32)))
  (import "env" "regfree" (func $regfree (param i64)))

  ;; Numeric library.
  (import "env" "acos" (func $acos (param f64) (result f64)))
  (import "env" "acosh" (func $acosh (param f64) (result f64)))
  (import "env" "asin" (func $asin (param f64) (result f64)))
  (import "env" "asinh" (func $asinh (param f64) (result f64)))
  (import "env" "atan" (func $atan (param f64) (result f64)))
  (import "env" "atan2" (func $atan2 (param f64 f64) (result f64)))
  (import "env" "atanh" (func $atanh (param f64) (result f64)))
  (import "env" "cbrt" (func $cbrt (param f64) (result f64)))
  (import "env" "cos" (func $cos (param f64) (result f64)))
  (import "env" "cosh" (func $cosh (param f64) (result f64)))
  (import "env" "exp" (func $exp (param f64) (result f64)))
  (import "env" "expm1" (func $expm1 (param f64) (result f64)))
  (import "env" "fmod" (func $fmod (param f64 f64) (result f64)))
  (import "env" "frexp" (func $frexp (param f64 i64) (result f64)))
  (import "env" "hypot" (func $hypot (param f64 f64) (result f64)))
  (import "env" "ldexp" (func $ldexp (param f64 i32) (result f64)))
  (import "env" "lrint" (func $lrint (param f64) (result i64)))
  (import "env" "log" (func $log (param f64) (result f64)))
  (import "env" "log1p" (func $log1p (param f64) (result f64)))
  (import "env" "log2" (func $log2 (param f64) (result f64)))
  (import "env" "log10" (func $log10 (param f64) (result f64)))
  (import "env" "modf" (func $modf (param f64 i64) (result f64)))
  (import "env" "pow" (func $pow (param f64 f64) (result f64)))
  (import "env" "scalbn" (func $scalbn (param f64 i32) (result f64)))
  (import "env" "sin" (func $sin (param f64) (result f64)))
  (import "env" "sinh" (func $sinh (param f64) (result f64)))
  (import "env" "tan" (func $tan (param f64) (result f64)))
  (import "env" "tanh" (func $tanh (param f64) (result f64)))

  ;; Time, locale, and immutable environment access.
  (import "env" "clock" (func $clock (result i32)))
  (import "env" "clock_gettime" (func $clock_gettime (param i32 i64) (result i32)))
  (import "env" "ctime" (func $ctime (param i64) (result i64)))
  (import "env" "difftime" (func $difftime (param i64 i64) (result f64)))
  (import "env" "gettimeofday" (func $gettimeofday (param i64 i64) (result i32)))
  (import "env" "getenv" (func $getenv (param i64) (result i64)))
  (import "env" "setenv" (func $setenv (param i64 i64 i32) (result i32)))
  (import "env" "putenv" (func $putenv (param i64) (result i32)))
  (import "env" "unsetenv" (func $unsetenv (param i64) (result i32)))
  (import "env" "gmtime" (func $gmtime (param i64) (result i64)))
  (import "env" "gmtime_r" (func $gmtime_r (param i64 i64) (result i64)))
  (import "env" "localeconv" (func $localeconv (result i64)))
  (import "env" "localtime" (func $localtime (param i64) (result i64)))
  (import "env" "localtime_r" (func $localtime_r (param i64 i64) (result i64)))
  (import "env" "mktime" (func $mktime (param i64) (result i64)))
  (import "env" "setlocale" (func $setlocale (param i32 i64) (result i64)))
  (import "env" "strftime" (func $strftime (param i64 i64 i64 i64) (result i64)))
  (import "env" "time" (func $time (param i64) (result i64)))
  (import "env" "random" (func $random (result i64)))
  (import "env" "srandom" (func $srandom (param i32)))
  (import "env" "srand" (func $srand (param i32)))
  (import "env" "rand" (func $rand (result i32)))

  ;; Synthetic userspace identity and platform queries. They expose no host
  ;; account, process, or filesystem state.
  (import "env" "getpid" (func $getpid (result i32)))
  (import "env" "getppid" (func $getppid (result i32)))
  (import "env" "getuid" (func $getuid (result i32)))
  (import "env" "geteuid" (func $geteuid (result i32)))
  (import "env" "getpwuid" (func $getpwuid (param i32) (result i64)))
  (import "env" "getpwnam" (func $getpwnam (param i64) (result i64)))
  (import "env" "getlogin" (func $getlogin (result i64)))
  (import "env" "gethostname" (func $gethostname (param i64 i64) (result i32)))
  (import "env" "uname" (func $uname (param i64) (result i32)))
  (import "env" "sysconf" (func $sysconf (param i32) (result i64)))
  (import "env" "getpagesize" (func $getpagesize (result i32)))
  (import "env" "getrlimit" (func $getrlimit (param i32 i64) (result i32)))

  ;; Pure byte-order/address formatting helpers. Address lookup and raw
  ;; sockets themselves are redirected to explicit Dolly failures below.
  (import "env" "htons" (func $htons (param i32) (result i32)))
  (import "env" "ntohs" (func $ntohs (param i32) (result i32)))
  (import "env" "inet_ntoa" (func $inet_ntoa (param i32) (result i64)))
  (import "env" "__h_errno_location" (func $__h_errno_location (result i64)))
  (import "env" "hstrerror" (func $hstrerror (param i32) (result i64)))

  ;; Control transfer. The compiler redirects system/popen/pclose to the typed
  ;; Dolly lifecycle wrappers below, which fail with ENOSYS rather than reaching
  ;; an Emscripten or browser fallback. abort still terminates the shared
  ;; runtime instance.
  (import "env" "__wasm_setjmp" (func $__wasm_setjmp (param i64 i32 i64)))
  (import "env" "__wasm_setjmp_test" (func $__wasm_setjmp_test (param i64 i64) (result i32)))
  (import "env" "abort" (func $abort))
  (import "env" "raise" (func $raise (param i32) (result i32)))
  (import "env" "sigaddset" (func $sigaddset (param i64 i32) (result i32)))
  (import "env" "sigfillset" (func $sigfillset (param i64) (result i32)))
  (import "env" "sigprocmask" (func $sigprocmask (param i32 i64 i64) (result i32)))
  (import "env" "emscripten_longjmp" (func $emscripten_longjmp (param i64 i32)))
  (import "env" "getTempRet0" (func $getTempRet0 (result i32)))
  (import "env" "invoke_ijj" (func $invoke_ijj (param i64 i64 i64) (result i32)))
  (import "env" "invoke_ijji" (func $invoke_ijji (param i64 i64 i64 i32) (result i32)))
  (import "env" "invoke_jj" (func $invoke_jj (param i64 i64) (result i64)))
  (import "env" "invoke_vjj" (func $invoke_vjj (param i64 i64 i64)))
  (import "env" "setTempRet0" (func $setTempRet0 (param i32)))
  (import "env" "signal" (func $signal (param i32 i64) (result i64)))
  (import "env" "bsd_signal" (func $bsd_signal (param i32 i64) (result i64)))

  ;; Pure in-Wasm libc and compiler helpers observed from current source ports.
  (import "env" "__ashlti3"
    (func $__ashlti3 (param i64 i64 i64 i32)))
  (import "env" "__fixunsdfdi"
    (func $__fixunsdfdi (param f64) (result i64)))
  (import "env" "__fixunsdfsi"
    (func $__fixunsdfsi (param f64) (result i32)))
  (import "env" "__floatundidf"
    (func $__floatundidf (param i64) (result f64)))
  (import "env" "__floatunsidf"
    (func $__floatunsidf (param i32) (result f64)))
  (import "env" "__multi3"
    (func $__multi3 (param i64 i64 i64 i64 i64)))
  (import "env" "bsearch"
    (func $bsearch (param i64 i64 i64 i64 i64) (result i64)))
  (import "env" "qsort"
    (func $qsort (param i64 i64 i64 i64)))
  (import "env" "atoi" (func $atoi (param i64) (result i32)))
  (import "env" "atof" (func $atof (param i64) (result f64)))
  (import "env" "fcntl" (func $fcntl (param i32 i32 i64) (result i32)))
  (import "env" "sigaction" (func $sigaction (param i32 i64 i64) (result i32)))
  (import "env" "sigemptyset" (func $sigemptyset (param i64) (result i32)))
  (import "env" "stat" (func $stat (param i64 i64) (result i32)))

  ;; Dolly lifecycle operations. Version 0 executes a spawn synchronously but
  ;; records a process-shaped state transition and requires an explicit wait
  ;; to collect its status. The three trailing descriptors route stdin,
  ;; stdout, and stderr entirely within WasmFS.
  (import "env" "dolly_spawn"
    (func $dolly_spawn (param i64 i32 i64 i32 i32 i32) (result i32)))
  (import "env" "dolly_spawn_env"
    (func $dolly_spawn_env (param i64 i32 i64 i64 i32 i32 i32) (result i32)))
  (import "env" "dolly_wait"
    (func $dolly_wait (param i32 i64) (result i32)))
  ;; Runtime-owned filesystem mutation used by dynamic language adapters.
  ;; This is an in-Wasm command/runtime edge, never a browser import.
  (import "env" "dolly_write_file"
    (func $dolly_write_file (param i64 i64 i64) (result i32)))
  (import "env" "dolly_terminal_publish_result"
    (func $dolly_terminal_publish_result (param i32)))
  (import "env" "dolly_exit" (func $dolly_exit (param i32)))
  (import "env" "dolly_fclose"
    (func $dolly_fclose (param i64) (result i32)))
  (import "env" "dolly_system"
    (func $dolly_system (param i64) (result i32)))
  (import "env" "dolly_popen"
    (func $dolly_popen (param i64 i64) (result i64)))
  (import "env" "dolly_pclose"
    (func $dolly_pclose (param i64) (result i32)))
  (import "env" "dolly_assert_fail"
    (func $dolly_assert_fail (param i64 i64 i32 i64)))
  (import "env" "dolly_atexit"
    (func $dolly_atexit (param i64) (result i32)))
  (import "env" "dolly_chmod"
    (func $dolly_chmod (param i64 i32) (result i32)))
  (import "env" "dolly_umask"
    (func $dolly_umask (param i32) (result i32)))
  (import "env" "dolly_getpass"
    (func $dolly_getpass (param i64) (result i64)))
  (import "env" "dolly_getrandom"
    (func $dolly_getrandom (param i64 i64 i32) (result i64)))

  ;; Native-style processes and sockets are named, typed denial points, not
  ;; ambient browser capabilities. Version 0 returns ENOSYS from these calls.
  (import "env" "dolly_fork" (func $dolly_fork (result i32)))
  (import "env" "dolly_execve"
    (func $dolly_execve (param i64 i64 i64) (result i32)))
  (import "env" "dolly_execvp"
    (func $dolly_execvp (param i64 i64) (result i32)))
  (import "env" "dolly_execl"
    (func $dolly_execl (param i64 i64 i64) (result i32)))
  (import "env" "dolly_execlp"
    (func $dolly_execlp (param i64 i64 i64) (result i32)))
  (import "env" "dolly_waitpid"
    (func $dolly_waitpid (param i32 i64 i32) (result i32)))
  (import "env" "dolly_wait_any"
    (func $dolly_wait_any (param i64) (result i32)))
  (import "env" "dolly_kill"
    (func $dolly_kill (param i32 i32) (result i32)))
  (import "env" "dolly_setsid" (func $dolly_setsid (result i32)))
  (import "env" "dolly_getpgid"
    (func $dolly_getpgid (param i32) (result i32)))
  (import "env" "dolly_tcgetpgrp"
    (func $dolly_tcgetpgrp (param i32) (result i32)))
  (import "env" "dolly_alarm"
    (func $dolly_alarm (param i32) (result i32)))
  (import "env" "dolly_sleep"
    (func $dolly_sleep (param i32) (result i32)))
  (import "env" "dolly_setitimer"
    (func $dolly_setitimer (param i32 i64 i64) (result i32)))
  (import "env" "dolly_select"
    (func $dolly_select (param i32 i64 i64 i64 i64) (result i32)))
  (import "env" "dolly__exit" (func $dolly__exit (param i32)))
  (import "env" "dolly_socket"
    (func $dolly_socket (param i32 i32 i32) (result i32)))
  (import "env" "dolly_connect"
    (func $dolly_connect (param i32 i64 i32) (result i32)))
  (import "env" "dolly_recv"
    (func $dolly_recv (param i32 i64 i64 i32) (result i64)))
  (import "env" "dolly_setsockopt"
    (func $dolly_setsockopt (param i32 i32 i32 i64 i32) (result i32)))
  (import "env" "dolly_shutdown"
    (func $dolly_shutdown (param i32 i32) (result i32)))
  (import "env" "dolly_gethostbyname"
    (func $dolly_gethostbyname (param i64) (result i64)))
  (import "env" "dolly_getservbyname"
    (func $dolly_getservbyname (param i64 i64) (result i64)))
  ;; Optional source toolchain service. The small /bin/cc and /bin/c++ command
  ;; modules provide the user-facing executable interface; the Clang/LLD engine
  ;; stays in the trusted runtime to avoid making its C++ implementation
  ;; dependencies part of every command's ABI.
  (import "env" "dolly_toolchain_main"
    (func $dolly_toolchain_main (param i32 i64 i32) (result i32)))
  (import "env" "dolly_http_perform"
    (func $dolly_http_perform (param i64 i64) (result i32)))
  (import "env" "dolly_http_response_dispose"
    (func $dolly_http_response_dispose (param i64)))

  ;; Runtime-owned data addresses used by libc and setjmp. Function-address
  ;; GOT slots are derived from matching env functions by the loader convention
  ;; and are intentionally not duplicated in this contract.
  (import "GOT.mem" "__THREW__" (global (mut i64)))
  (import "GOT.mem" "__threwValue" (global (mut i64)))
  (import "GOT.mem" "environ" (global (mut i64)))
  (import "GOT.mem" "stderr" (global (mut i64)))
  (import "GOT.mem" "stdin" (global (mut i64)))
  (import "GOT.mem" "stdout" (global (mut i64)))

  ;; A real command supplies these. Bodies exist only so their exact lowered
  ;; signatures are represented in the contract binary.
  (func (export "__wasm_call_ctors"))
  (func (export "dolly_main") (param i32 i64) (result i32)
    i32.const 0)
)
