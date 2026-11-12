(module
  ;; The packages an image directory publishes, handed to the kernel over this
  ;; module's own mailbox, not through the HTTP broker. A process asks for one
  ;; of three things and names the file it goes to, which must not exist: the
  ;; directory the page loads its images from (KIND_DIRECTORY), a directory's
  ;; amy-index.txt (KIND_INDEX), or the snapshot of the package whose recipe has
  ;; a pin in a directory's catalog (KIND_SNAPSHOT), verified from its packs.
  ;; The kernel writes the request's kind, its directory and its pin after the
  ;; header and reports the request; the page answers in chunks as upload@0
  ;; does (dolly-upload-0.wat): it waits for chunk == consumed, writes the
  ;; bytes, their length, a positive errno (0 on success), EOF and the whole
  ;; size, then publishes chunk+1. The kernel writes each chunk into a
  ;; temporary file before acknowledging it and renames it to the destination
  ;; at EOF, when it holds exactly the size. A directory other than the page's
  ;; is refused (EACCES): the page's HTTP policy does not judge it here yet.
  ;; One request at a time, at most MAX_SIZE bytes; both sides check the bounds.
  (import "env" "memory" (memory i64 1024 131072 shared))
  (func (export "dolly_packages_mailbox_address") (result i64) i64.const 0)

  ;; Twelve atomic little-endian u32 words (packages.h mirrors them; kernel.c
  ;; checks the offsets): request, cancelled and completed sequences, chunk and
  ;; consumed sequences, chunk length, positive errno, EOF, provider enabled
  ;; (1 while the page answers), the whole size, the request's kind and its
  ;; directory's length; then the directory, the pin and one chunk.
  (global (export "DOLLY_PACKAGES_HEADER_SIZE") i32 (i32.const 64))
  (global (export "DOLLY_PACKAGES_WORD_REQUEST") i32 (i32.const 0))
  (global (export "DOLLY_PACKAGES_WORD_CANCELLED") i32 (i32.const 1))
  (global (export "DOLLY_PACKAGES_WORD_COMPLETED") i32 (i32.const 2))
  (global (export "DOLLY_PACKAGES_WORD_CHUNK") i32 (i32.const 3))
  (global (export "DOLLY_PACKAGES_WORD_CONSUMED") i32 (i32.const 4))
  (global (export "DOLLY_PACKAGES_WORD_LENGTH") i32 (i32.const 5))
  (global (export "DOLLY_PACKAGES_WORD_ERROR") i32 (i32.const 6))
  (global (export "DOLLY_PACKAGES_WORD_EOF") i32 (i32.const 7))
  (global (export "DOLLY_PACKAGES_WORD_ENABLED") i32 (i32.const 8))
  (global (export "DOLLY_PACKAGES_WORD_SIZE") i32 (i32.const 9))
  (global (export "DOLLY_PACKAGES_WORD_KIND") i32 (i32.const 10))
  (global (export "DOLLY_PACKAGES_WORD_DIRECTORY_LENGTH") i32 (i32.const 11))
  (global (export "DOLLY_PACKAGES_DIRECTORY_OFFSET") i32 (i32.const 64))
  (global (export "DOLLY_PACKAGES_DIRECTORY_CAPACITY") i32 (i32.const 2048))
  (global (export "DOLLY_PACKAGES_PIN_OFFSET") i32 (i32.const 2112))
  (global (export "DOLLY_PACKAGES_PIN_BYTES") i32 (i32.const 64))
  (global (export "DOLLY_PACKAGES_CHUNK_OFFSET") i32 (i32.const 2176))
  (global (export "DOLLY_PACKAGES_CHUNK_CAPACITY") i32 (i32.const 1048576))
  (global (export "DOLLY_PACKAGES_MAX_SIZE") i32 (i32.const 2147483647))
  (global (export "DOLLY_PACKAGES_KIND_DIRECTORY") i32 (i32.const 1))
  (global (export "DOLLY_PACKAGES_KIND_INDEX") i32 (i32.const 2))
  (global (export "DOLLY_PACKAGES_KIND_SNAPSHOT") i32 (i32.const 3))

  ;; Process operation: a dolly_packages_request (packages.h), then the
  ;; destination path and the directory; no response.
  (global (export "DOLLY_PACKAGES_FETCH") i32 (i32.const 134))
)
