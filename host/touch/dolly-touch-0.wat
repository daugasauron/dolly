(module
  ;; Fingers on a touchscreen. No callable host import: the page copies the
  ;; Pointer Events of pointerType "touch" on the canvas into bounded records;
  ;; what fingers mean (a tap, a drag, two fingers moving apart) is decided in
  ;; Wasm.
  (import "env" "memory" (memory i64 1024 131072 shared))

  ;; The mailbox starts with four atomic little-endian u32 words (touch.h
  ;; mirrors them; kernel.c checks the offsets), then 512 fixed 32-byte records
  ;; at byte 16. The page is the one producer of records and the kernel their
  ;; one consumer. The lease word is the kernel's: the low 32 bits of the
  ;; holder's lease, nonzero while a program holds it. The page sets the last
  ;; word to 1 while it listens: without it ACQUIRE and READ return ENOSYS.
  ;; A record is one finger: u32 id, phase; i32 x, y; u32 pressure, dropped,
  ;; time, lease. The id is nonzero, from the finger's down to its up or
  ;; cancel, and is not given to another finger of the page. x and y are
  ;; pixels of the frame the canvas shows, as input@0's pointer records are;
  ;; a finger that went down on the canvas may move outside it. Pressure is
  ;; the browser's, in thousandths. Dropped counts the records the page had no
  ;; room for since the one before. Time is milliseconds of the browser's
  ;; event clock, wrapping. Lease is the lease word the page wrote it under:
  ;; READ returns only the holder's.
  (global (export "DOLLY_TOUCH_HEADER_SIZE") i32 (i32.const 16))
  (global (export "DOLLY_TOUCH_RECORD_SIZE") i32 (i32.const 32))
  (global (export "DOLLY_TOUCH_CAPACITY") i32 (i32.const 512))
  (global (export "DOLLY_TOUCH_WORD_READ") i32 (i32.const 0))
  (global (export "DOLLY_TOUCH_WORD_WRITE") i32 (i32.const 1))
  (global (export "DOLLY_TOUCH_WORD_LEASE") i32 (i32.const 2))
  (global (export "DOLLY_TOUCH_WORD_ENABLED") i32 (i32.const 3))
  (global (export "DOLLY_TOUCH_DOWN") i32 (i32.const 1))
  (global (export "DOLLY_TOUCH_MOVE") i32 (i32.const 2))
  (global (export "DOLLY_TOUCH_UP") i32 (i32.const 3))
  (global (export "DOLLY_TOUCH_CANCEL") i32 (i32.const 4))
  (func (export "dolly_touch_mailbox_address") (result i64)
    i64.const 0)

  ;; At most ten fingers are down at once; an eleventh is not delivered. The
  ;; page writes every move the browser reports, coalesced ones included,
  ;; while more than twice that many records are free. A down is written while
  ;; the ring keeps room for it and the up or cancel of every finger that is
  ;; down, so a delivered finger's end is never dropped; a finger whose down
  ;; finds no room is not delivered at all. What is not delivered is counted
  ;; in the next record's dropped.
  (global (export "DOLLY_TOUCH_FINGERS") i32 (i32.const 10))

  ;; Process operations of the touch lease; their packets are defined in
  ;; touch.h. Only the foreground command or a descendant may hold it, one at
  ;; a time. While it is held every finger on the canvas is a touch record
  ;; and none is input@0's pointer; without a holder the page's fingers are
  ;; input@0's. READ returns up to 64 records.
  (global (export "DOLLY_TOUCH_ACQUIRE") i32 (i32.const 92))
  (global (export "DOLLY_TOUCH_READ") i32 (i32.const 93))
  (global (export "DOLLY_TOUCH_RELEASE") i32 (i32.const 94))
  (global (export "DOLLY_TOUCH_READ_RECORDS") i32 (i32.const 64))
)
