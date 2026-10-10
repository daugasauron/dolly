(module
  (import "env" "memory" (memory i64 1024 131072 shared))
  (import "env" "dolly_buttons_dispatch" (func (param i64 i64) (result i32)))
  (func (export "dolly_buttons_mailbox_address") (result i64) i64.const 0)
  (global (export "DOLLY_BUTTONS_VERSION") i32 (i32.const 0))
  (global (export "DOLLY_BUTTONS_PROCESS_OP") i32 (i32.const 131))
  (global (export "DOLLY_BUTTONS_TYPE_OP") i32 (i32.const 132))
  (global (export "DOLLY_BUTTONS_SLOTS") i32 (i32.const 1))
  (global (export "DOLLY_BUTTONS_PACKET_BYTES") i32 (i32.const 856))
  (global (export "DOLLY_BUTTONS_REPLY_BYTES") i32 (i32.const 4116))
  (global (export "DOLLY_BUTTONS_MAX") i32 (i32.const 12))
  (global (export "DOLLY_BUTTONS_LABEL_BYTES") i32 (i32.const 24))
  (global (export "DOLLY_BUTTONS_CAPTION_BYTES") i32 (i32.const 480))
  (global (export "DOLLY_BUTTONS_PASTE_BYTES") i32 (i32.const 4096))
  (global (export "DOLLY_BUTTONS_TYPE_BYTES") i32 (i32.const 4096))
  (global (export "DOLLY_BUTTONS_EVENTS") i32 (i32.const 16))
  (global (export "DOLLY_BUTTONS_OPEN") i32 (i32.const 1))
  (global (export "DOLLY_BUTTONS_SHOW") i32 (i32.const 2))
  (global (export "DOLLY_BUTTONS_READ") i32 (i32.const 3))
  (global (export "DOLLY_BUTTONS_CLOSE") i32 (i32.const 4))
  (global (export "DOLLY_BUTTON_PRESS") i32 (i32.const 1))
  (global (export "DOLLY_BUTTON_PASTE") i32 (i32.const 2))
  ;; A program that holds the buttons stands in for a keyboard: the page shows
  ;; its caption and buttons in a strip below the terminal, the program reads
  ;; the presses and types into the terminal. One process holds them at a time.
  ;; Process operation 131 carries the packets below to the page. LE header
  ;; [32]: u32 version,operation; u64 scope,sequence; u32 body,reserved. Scope
  ;; is a non-reused u32 lease. OPEN begins with scope=0; the kernel binds its
  ;; process-owned lease before dispatch. Sequence is a nonzero, increasing
  ;; u32; it must not wrap. Close/reopen before exhaustion. A second OPEN fails
  ;; EBUSY. All reserved fields and upper u64 bits are zero.
  ;; OPEN [32] reply [8]: u64 scope. Nothing is shown yet.
  ;; SHOW [40+28n+c]: u32 n,c; n buttons, each u32 kind and a 24-byte label;
  ;; then c caption bytes; n <= 12, c <= 480. It replaces what the strip shows;
  ;; n=0 with c=0 hides the strip. A label is UTF-8 up to its first zero byte
  ;; and zero from there on; the caption is UTF-8. Kind 1 PRESS shows its
  ;; label. Kind 2 PASTE is the page's own button, which the page names: its
  ;; label is all zero. Reply [4]: u32 layout, the number of the buttons now
  ;; shown: nonzero, greater whenever a SHOW changes the buttons and the same
  ;; while only the caption changes, so a press stays good across captions.
  ;; READ [32] reply [0] while no event is queued, else [20+t]: u32 layout,
  ;; button,kind,status,t; then t bytes of UTF-8. Layout and button, its index
  ;; there, say what the user pressed. A PRESS has status 0 and t=0. A PASTE
  ;; carries the clipboard's text, which the page reads inside that press:
  ;; status 0 and t <= 4096, or t=0 and status EACCES (the browser or its user
  ;; refused, or the read failed) or E2BIG (more than 4096 bytes). The lease
  ;; queues 16 events; a press that finds the queue full is dropped.
  ;; CLOSE [32] removes the strip and retires the lease; empty reply. Reaping a
  ;; process revokes its lease and removes the strip the same way.
  ;; Dispatch(NULL,scope) is revocation. Other calls use copied bounded packets.
  ;; Reply mailbox: one slot at a 64-byte-aligned base. Five atomic u32 fields:
  ;; state,scope,sequence,errno,length; 44 padding bytes; 4116 reply bytes.
  ;; Provider publishes state=1 last, with release ordering.
  ;; Process operation 132 never reaches the page. Its request is 1 to 4096
  ;; bytes, which the kernel appends to the terminal's input for the process
  ;; that holds the lease (EBADF for any other): whoever reads the terminal
  ;; reads them as if typed, in order with the keyboard's input. EAGAIN while
  ;; the queue is full. Byte 3 is Ctrl+C: while the terminal's ISIG is set it
  ;; interrupts the foreground program, as the key does, and is not queued.
  ;; The strip is page DOM outside the display: text shown as text, on buttons
  ;; of the page's making. It grants no markup, style, image, link, position or
  ;; size, no key or pointer of the page, no clipboard but by the user's press
  ;; of the page's own Paste button, no file, URL or network authority.
)
