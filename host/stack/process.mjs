/*
 * The stack@0 provider inside the process Worker of an executable that
 * records stack@0 (dolly-stack-0.wat, docs/browser-stack.md). It runs the
 * program's dolly_stack_continue on a fresh browser stack and sets the room
 * each stack gives. It adds no browser capability or import to the executable.
 */
import { DOLLY_ERRNO, DOLLY_STACK_CONTINUE } from "./abi.mjs";

// WebAssembly.promising runs an export on a stack of its own. JavaScript runs
// on the thread's first stack wherever it is called from, so the program is
// entered from WebAssembly: this module calls dolly_stack_continue there and
// catches what it throws, which the caller's stack throws again.
// (import "program" "continue" (func $continue))
// (global $caught (mut exnref) (ref.null exn)) (global (export "done") (mut i32) (i32.const 0))
// (func (export "enter") (block $thrown (result exnref)
//   (try_table (catch_all_ref $thrown) (call $continue)) (global.set $done 1) (return))
//   (global.set $caught) (global.set $done 2))
// (func (export "rethrow") throw_ref of $caught, which is cleared)
const entry = new WebAssembly.Module(Uint8Array.from(atob(
  "AGFzbQEAAAABBAFgAAACFAEHcHJvZ3JhbQhjb250aW51ZQAAAwMCAAAGCwJpAdBpC38BQQALBxoDBGRvbmUDAQVlbnRlcgABB3JldGhyb3cAAgoq" +
  "AhgAAmkfQAEDABAAC0EBJAEPCyQAQQIkAQsPAQFpIwAhANBpJAAgAAoL"), character => character.charCodeAt(0)));

// A stack's room in the slots stack-wrap charges: half of what the supervisor's
// probe nests on it, whose frame is 23 slots (56 bytes of its own and sixteen
// values). The half is the margin for frames larger than stack-wrap's estimate
// and for JavaScript, which runs on the thread's first stack.
const probeSlots = 23;
const roomOf = probes => Math.floor(probes * probeSlots / 2);

export function serve({ instance, stack }) {
  const { dolly_stack_room: room, dolly_stack_continue: resume } = instance.exports;
  if (!(room instanceof WebAssembly.Global) || typeof resume !== "function") {
    throw new TypeError("an executable recording stack@0 must export dolly_stack_room and dolly_stack_continue");
  }
  const fresh = roomOf(stack.depths.promising);
  room.value = stack.promisingEntry ? fresh : roomOf(stack.depths.direct);
  // The reason of the first trap on a fresh stack. Its caller traps too, as the
  // call returns 1; the rejection that carries the reason arrives a moment later.
  let failure, helper, enter;
  return {
    handles: operation => operation === DOLLY_STACK_CONTINUE,
    call(operation, request, response) {
      if (request.size || response.size) return -BigInt(DOLLY_ERRNO.EINVAL);
      if (!WebAssembly.promising) {
        failure ??= new Error("this browser has no WebAssembly.promising, which stack@0 needs");
        return -BigInt(DOLLY_ERRNO.ENOSYS);
      }
      helper ??= new WebAssembly.Instance(entry, { program: { continue: resume } });
      enter ??= WebAssembly.promising(helper.exports.enter);
      const { done, rethrow } = helper.exports;
      const saved = room.value;
      room.value = fresh;
      done.value = 0;
      enter().catch(error => { failure ??= error; });
      room.value = saved;
      const outcome = done.value;
      // Cleared, so that the stack this call returns to reads 0 if it traps later.
      done.value = 0;
      if (outcome === 2) rethrow();
      return outcome === 1 ? 0n : 1n;
    },
    get failure() { return failure; },
  };
}
