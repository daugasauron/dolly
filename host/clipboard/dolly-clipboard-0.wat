(module
  ;; The clipboard: text a program copies and text the user pastes into the
  ;; page, which the kernel keeps. No callable host import. The page offers a
  ;; program's copy to the browser's clipboard only while it has the focus and
  ;; the user's activation (a key press or a click on it moments before), and
  ;; reads the browser's clipboard only in a paste the user makes.
  (import "env" "memory" (memory i64 1024 131072 shared))

  ;; The mailbox starts with four atomic little-endian u32 words (clipboard.h
  ;; mirrors them; kernel.c checks the offsets), then the text at byte 16:
  ;; CAPACITY bytes, of which the first LENGTH are the clipboard's, UTF-8.
  ;; COPY is the kernel's: it adds one after each copy a program makes, once
  ;; the text and LENGTH are written. HOLDER is the kernel's: nonzero while a
  ;; program holds the clipboard. The page sets ENABLED to 1 while it listens:
  ;; without it ACQUIRE returns ENOSYS. The runtime Worker, which runs the
  ;; kernel, writes a paste the user makes: its text, then LENGTH; neither side
  ;; writes while the other reads.
  (global (export "DOLLY_CLIPBOARD_HEADER_SIZE") i32 (i32.const 16))
  (global (export "DOLLY_CLIPBOARD_CAPACITY") i32 (i32.const 262144))
  (global (export "DOLLY_CLIPBOARD_WORD_COPY") i32 (i32.const 0))
  (global (export "DOLLY_CLIPBOARD_WORD_LENGTH") i32 (i32.const 1))
  (global (export "DOLLY_CLIPBOARD_WORD_HOLDER") i32 (i32.const 2))
  (global (export "DOLLY_CLIPBOARD_WORD_ENABLED") i32 (i32.const 3))
  (func (export "dolly_clipboard_mailbox_address") (result i64)
    i64.const 0)

  ;; Process operations of the clipboard's lease; their packets are defined in
  ;; clipboard.h. Only the foreground command or a descendant may hold it; a
  ;; descendant of the holder takes it over, as input@0's lease, and the holder
  ;; has it back when the descendant's ends. Only the newest holder writes and
  ;; reads it. While a program holds it and one holds input@0's lease, the
  ;; user's paste chord reaches the input lessee as the chord's keys, after
  ;; the paste is the clipboard's; otherwise a paste reaches input@0 as
  ;; without this module, and is the clipboard's too.
  (global (export "DOLLY_CLIPBOARD_ACQUIRE") i32 (i32.const 208))
  (global (export "DOLLY_CLIPBOARD_WRITE") i32 (i32.const 209))
  (global (export "DOLLY_CLIPBOARD_READ") i32 (i32.const 210))
  (global (export "DOLLY_CLIPBOARD_RELEASE") i32 (i32.const 211))
)
