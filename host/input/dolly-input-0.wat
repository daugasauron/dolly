(module
  ;; Keyboard, pointer, wheel, focus, IME text and paste. No callable host
  ;; import: the page copies ordinary DOM event data into bounded records
  ;; without terminal encoding; what a record means is decided in Wasm.
  (import "env" "memory" (memory i64 1024 131072 shared))

  ;; The mailbox starts with six atomic little-endian u32 words (input.h
  ;; mirrors them; kernel.c checks the offsets), then 256 fixed 128-byte
  ;; records at byte 24. The page is the one producer of records and the
  ;; kernel their one consumer. Flags are the kernel's: bit 0 while a program
  ;; holds the input lease and reads every record, bit 1 while it asks for
  ;; relative pointer motion, which the page grants only after a user's press
  ;; on the canvas.
  ;; Records: 1 key, 2 text, 4 window focus (action 1 gain, 0 loss), 5 paste,
  ;; 6 pointer, 7 scroll, 8 relative motion, 9 pointer capture, 10 pointer
  ;; presence (action 1 enter, 0 leave), 11 dropped. The page keeps the ring's
  ;; last slot for one dropped record, written in place of the first record
  ;; that found no room, so a reader learns where it lost input.
  (global (export "DOLLY_INPUT_HEADER_SIZE") i32 (i32.const 24))
  (global (export "DOLLY_INPUT_EVENT_SIZE") i32 (i32.const 128))
  (global (export "DOLLY_INPUT_EVENT_DATA_SIZE") i32 (i32.const 88))
  (global (export "DOLLY_INPUT_EVENT_CAPACITY") i32 (i32.const 256))
  (global (export "DOLLY_INPUT_WORD_EVENT_READ") i32 (i32.const 0))
  (global (export "DOLLY_INPUT_WORD_EVENT_WRITE") i32 (i32.const 1))
  (global (export "DOLLY_INPUT_WORD_FLAGS") i32 (i32.const 2))
  (global (export "DOLLY_INPUT_WORD_PASTE_SEQUENCE") i32 (i32.const 3))
  (global (export "DOLLY_INPUT_WORD_PASTE_CONSUMED_SEQUENCE") i32 (i32.const 4))
  (global (export "DOLLY_INPUT_WORD_PASTE_LENGTH") i32 (i32.const 5))
  (func (export "dolly_input_mailbox_address") (result i64)
    i64.const 0)

  ;; One explicit user paste for the terminal: the page writes the bytes,
  ;; then the length and sequence, then a paste record; the kernel acknowledges
  ;; the sequence once the terminal has consumed it, so one paste is in flight.
  ;; A program holding the lease receives a paste as text records instead.
  (global (export "DOLLY_INPUT_PASTE_CAPACITY") i32 (i32.const 262144))
  (func (export "dolly_input_paste_buffer_address") (result i64)
    i64.const 0)

  ;; Process operations of a foreground command's input lease; their packets
  ;; are defined in input.h.
  (global (export "DOLLY_INPUT_ACQUIRE") i32 (i32.const 88))
  (global (export "DOLLY_INPUT_NEXT_EVENT") i32 (i32.const 89))
  (global (export "DOLLY_INPUT_SET_POINTER") i32 (i32.const 90))
  (global (export "DOLLY_INPUT_RELEASE") i32 (i32.const 91))
)
