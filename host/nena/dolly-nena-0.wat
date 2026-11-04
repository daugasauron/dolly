(module
  (import "env" "memory" (memory i64 1024 131072 shared))
  (import "env" "dolly_nena_dispatch" (func (param i64 i64) (result i32)))
  (func (export "dolly_nena_mailbox_address") (result i64) i64.const 0)
  (global (export "DOLLY_NENA_VERSION") i32 (i32.const 0))
  (global (export "DOLLY_NENA_PROCESS_OP") i32 (i32.const 133))
  (global (export "DOLLY_NENA_SLOTS") i32 (i32.const 2))
  (global (export "DOLLY_NENA_REPLY_BYTES") i32 (i32.const 256))
  (global (export "DOLLY_NENA_PACKET_BYTES") i32 (i32.const 72))
  (global (export "DOLLY_NENA_NAME_BYTES") i32 (i32.const 32))
  (global (export "DOLLY_NENA_GIVES_BYTES") i32 (i32.const 120))
  (global (export "DOLLY_NENA_REASON_BYTES") i32 (i32.const 96))
  (global (export "DOLLY_NENA_OPEN") i32 (i32.const 1))
  (global (export "DOLLY_NENA_MODULE") i32 (i32.const 2))
  (global (export "DOLLY_NENA_ENABLE") i32 (i32.const 3))
  (global (export "DOLLY_NENA_DISABLE") i32 (i32.const 4))
  (global (export "DOLLY_NENA_CLOSE") i32 (i32.const 5))
  (global (export "DOLLY_NENA_ENABLED") i32 (i32.const 1))
  (global (export "DOLLY_NENA_DECLARED") i32 (i32.const 2))
  (global (export "DOLLY_NENA_FIXED") i32 (i32.const 4))
  ;; A device leased per process: each call is a packet, a
  ;; dolly_device_header (runtime.h) and the body below, answered in a
  ;; reply slot of dolly-supervisor-0.wat. Sizes in brackets are of bodies.
  ;; Each process owns at most one lease, in slot (scope-1)%2.
  ;; OPEN [0] reply [8]: u64 scope.
  ;; MODULE [8]: u32 index,reserved. Reply [256], the index-th host module of
  ;; the page: char name[32]; u32 version,state; char gives[120]; char
  ;; reason[96]. Texts are NUL-terminated UTF-8. State is a set of ENABLED (the
  ;; session has the module now), DECLARED (the page started with it: the image
  ;; declares it) and FIXED (it cannot be switched; reason says why). gives is
  ;; one line of what the module gives a session. ENOENT past the last module.
  ;; ENABLE, DISABLE [40]: char name[32]; u32 version,reserved. Reply [256]: the
  ;; module as MODULE gives it, after the switch. A refused switch leaves the
  ;; state and says why in reason. ENOENT for a module the page does not have.
  ;; Enabling an enabled module and disabling a disabled one change nothing.
  ;; A disabled module is refused to executables that record it, and its
  ;; kernel imports answer ENOSYS, to a running process too.
  ;; DISABLE of nena itself is answered before it takes effect; afterwards
  ;; every call, CLOSE among them, is ENOSYS for the rest of the page's life.
  ;; CLOSE [0] retires the lease; empty reply. Reaping a process revokes it.
  ;; The page holds the set of modules and makes every switch; an image that
  ;; does not declare nena@0 has no provider, and its set is the image's list.
  ;; The provider records what a session enabled beyond that list in
  ;; /etc/dolly/enabled, a name@version a line, and enables what the file
  ;; lists when the session is loaded again.
  ;; A switch grants what the module grants: its own bounds, the browser's
  ;; permission prompts and the page's HTTP policy apply as if it were declared.
)
