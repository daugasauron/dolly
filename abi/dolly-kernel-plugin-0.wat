(module
  ;; Internal contract for trusted modules that become resident in the Dolly
  ;; kernel address space. Ordinary commands never compile against this ABI;
  ;; they use dolly-process-0 and a private memory. Version 0 is intentionally
  ;; the exact surface required by the source-built Ghostty display driver.
  (import "env" "memory" (memory i64 1024 131072 shared))
  (import "env" "__indirect_function_table" (table i64 1 funcref))
  (import "env" "__stack_pointer" (global (mut i64)))
  (import "env" "__memory_base" (global i64))
  (import "env" "__table_base" (global i64))

  (import "env" "fopen" (func $fopen (param i64 i64) (result i64)))
  (import "env" "fseek" (func $fseek (param i64 i64 i32) (result i32)))
  (import "env" "dolly_fclose"
    (func $dolly_fclose (param i64) (result i32)))
  (import "env" "ftell" (func $ftell (param i64) (result i64)))
  (import "env" "malloc" (func $malloc (param i64) (result i64)))
  (import "env" "fread"
    (func $fread (param i64 i64 i64 i64) (result i64)))
  (import "env" "free" (func $free (param i64)))
  (import "env" "dolly_assert_fail"
    (func $dolly_assert_fail (param i64 i64 i32 i64)))
  (import "env" "realloc"
    (func $realloc (param i64 i64) (result i64)))
  (import "env" "strcmp"
    (func $strcmp (param i64 i64) (result i32)))
  (import "env" "strncmp"
    (func $strncmp (param i64 i64 i64) (result i32)))
  (import "env" "write"
    (func $write (param i32 i64 i64) (result i64)))
  (import "env" "__errno_location"
    (func $__errno_location (result i64)))
  (import "env" "lseek"
    (func $lseek (param i32 i64 i32) (result i64)))
  (import "env" "preadv"
    (func $preadv (param i32 i64 i32 i64) (result i64)))
  (import "env" "close" (func $close (param i32) (result i32)))
  (import "env" "fstat"
    (func $fstat (param i32 i64) (result i32)))
  (import "env" "unlinkat"
    (func $unlinkat (param i32 i64 i32) (result i32)))
  (import "env" "openat"
    (func $openat (param i32 i64 i32 i64) (result i32)))
  (import "env" "realpath"
    (func $realpath (param i64 i64) (result i64)))
  (import "env" "readv"
    (func $readv (param i32 i64 i32) (result i64)))
)
