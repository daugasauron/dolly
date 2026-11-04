(module
  ;; Keyboard, pointer, wheel, focus, IME text and paste. No callable host
  ;; import: the page copies ordinary DOM event data into bounded records
  ;; without terminal encoding; what a record means is decided in Wasm.
  (import "env" "memory" (memory i64 1024 131072 shared))

  ;; The mailbox starts with seven atomic little-endian u32 words (input.h
  ;; mirrors them; kernel.c checks the offsets), then 256 fixed 128-byte
  ;; records at byte 28. The page is the one producer of records and the
  ;; kernel their one consumer. Flags are the kernel's: LEASED while a program
  ;; holds the input lease and reads every record, POINTER_RELATIVE while it
  ;; asks for relative pointer motion, which the page grants only after a
  ;; user's press on the canvas and ends on Escape. The page sets the last
  ;; word to 1 while it listens: without it (an image that declares no input,
  ;; a build) ACQUIRE returns ENOSYS.
  ;; The page keeps the ring's last slot for one dropped record, written in
  ;; place of the first record that found no room, so a reader learns where it
  ;; lost input. input.h says which fields each record type uses.
  (global (export "DOLLY_INPUT_HEADER_SIZE") i32 (i32.const 28))
  (global (export "DOLLY_INPUT_EVENT_SIZE") i32 (i32.const 128))
  (global (export "DOLLY_INPUT_EVENT_DATA_SIZE") i32 (i32.const 88))
  (global (export "DOLLY_INPUT_EVENT_CAPACITY") i32 (i32.const 256))
  (global (export "DOLLY_INPUT_WORD_EVENT_READ") i32 (i32.const 0))
  (global (export "DOLLY_INPUT_WORD_EVENT_WRITE") i32 (i32.const 1))
  (global (export "DOLLY_INPUT_WORD_FLAGS") i32 (i32.const 2))
  (global (export "DOLLY_INPUT_WORD_PASTE_SEQUENCE") i32 (i32.const 3))
  (global (export "DOLLY_INPUT_WORD_PASTE_CONSUMED_SEQUENCE") i32 (i32.const 4))
  (global (export "DOLLY_INPUT_WORD_PASTE_LENGTH") i32 (i32.const 5))
  (global (export "DOLLY_INPUT_WORD_ENABLED") i32 (i32.const 6))
  (global (export "DOLLY_INPUT_LEASED") i32 (i32.const 1))
  (global (export "DOLLY_INPUT_POINTER_RELATIVE") i32 (i32.const 2))
  (func (export "dolly_input_mailbox_address") (result i64)
    i64.const 0)

  ;; A record's type.
  (global (export "DOLLY_INPUT_EVENT_KEY") i32 (i32.const 1))
  (global (export "DOLLY_INPUT_EVENT_TEXT") i32 (i32.const 2))
  (global (export "DOLLY_INPUT_EVENT_FOCUS") i32 (i32.const 4))
  (global (export "DOLLY_INPUT_EVENT_PASTE") i32 (i32.const 5))
  (global (export "DOLLY_INPUT_EVENT_POINTER") i32 (i32.const 6))
  (global (export "DOLLY_INPUT_EVENT_SCROLL") i32 (i32.const 7))
  (global (export "DOLLY_INPUT_EVENT_POINTER_MOTION") i32 (i32.const 8))
  (global (export "DOLLY_INPUT_EVENT_POINTER_CAPTURE") i32 (i32.const 9))
  (global (export "DOLLY_INPUT_EVENT_POINTER_PRESENCE") i32 (i32.const 10))
  (global (export "DOLLY_INPUT_EVENT_DROPPED") i32 (i32.const 11))
  ;; A key record's action, a pointer record's action and a scroll record's
  ;; unit, as a browser WheelEvent's deltaMode numbers it.
  (global (export "DOLLY_KEY_ACTION_RELEASE") i32 (i32.const 0))
  (global (export "DOLLY_KEY_ACTION_PRESS") i32 (i32.const 1))
  (global (export "DOLLY_KEY_ACTION_REPEAT") i32 (i32.const 2))
  (global (export "DOLLY_POINTER_ACTION_RELEASE") i32 (i32.const 0))
  (global (export "DOLLY_POINTER_ACTION_PRESS") i32 (i32.const 1))
  (global (export "DOLLY_POINTER_ACTION_DRAG") i32 (i32.const 2))
  (global (export "DOLLY_SCROLL_UNIT_PIXEL") i32 (i32.const 0))
  (global (export "DOLLY_SCROLL_UNIT_LINE") i32 (i32.const 1))
  (global (export "DOLLY_SCROLL_UNIT_PAGE") i32 (i32.const 2))
  ;; Bits of a record's modifiers, and of a key record's flags.
  (global (export "DOLLY_INPUT_MOD_SHIFT") i32 (i32.const 1))
  (global (export "DOLLY_INPUT_MOD_CONTROL") i32 (i32.const 2))
  (global (export "DOLLY_INPUT_MOD_ALT") i32 (i32.const 4))
  (global (export "DOLLY_INPUT_MOD_META") i32 (i32.const 8))
  (global (export "DOLLY_INPUT_MOD_CAPS_LOCK") i32 (i32.const 16))
  (global (export "DOLLY_INPUT_MOD_NUM_LOCK") i32 (i32.const 32))
  (global (export "DOLLY_INPUT_FLAG_COMPOSING") i32 (i32.const 1))

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
