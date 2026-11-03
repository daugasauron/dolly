/*
 * dso@0 in a host using threads@0. Each thread's Worker has a function table
 * of its own, so what the loader or an FFI closure adds to one, every other
 * thread's Worker adds too, in the same order and so at the same indices. Each
 * change goes into a record in the host's __dolly_dso_threads (dolly-dso-0.wat),
 * and a Worker applies the records it has not applied before its thread runs
 * the program again: at the thread's start, after a call that waited for the
 * host and around a futex wait. The thread that changed its table returns once
 * every other thread has applied the change or waits in the host, which it
 * leaves only through the records.
 */
import { DOLLY_DSO_THREADS_SIZE } from "./abi.mjs";

// __dolly_dso_threads as 32-bit words: a lock (the owner's slot plus one), the
// number of records, at 8 the address of their array, its capacity, then a
// word for each Worker: taken, waiting in the host, how many records it applied.
const LOCK = 0, COUNT = 1, RECORDS = 1, CAPACITY = 4, SLOTS = 5;
const SLOT_COUNT = DOLLY_DSO_THREADS_SIZE / 4 - SLOTS;
const TAKEN = 1 << 31, WAITING = 1 << 30, APPLIED = WAITING - 1;
// A record: a kind, a word and five values. Its array doubles from 64 records;
// one a reader may still hold is never freed.
const RECORD_SIZE = 48, FIRST_CAPACITY = 64;

// A record this Worker could not apply: its table is no longer the others',
// and the process cannot go on.
export class ThreadRecordError extends Error {}

// allocate(size, alignment): process memory, or 0n. apply(records, index):
// makes in this Worker the change another thread's records[index] describes;
// those after it are published already.
export function createThreadRecords({ memory, address, allocate, apply }) {
  let words, bigWords;
  function view() {
    if (words?.buffer !== memory.buffer) {
      words = new Int32Array(memory.buffer, Number(address), DOLLY_DSO_THREADS_SIZE / 4);
      bigWords = new BigInt64Array(memory.buffer, Number(address), 2);
    }
    return words;
  }
  // A thread's Worker starts waiting: it applies the records at its start.
  let slot = -1, applied = 0, waiting = true, applying = false, locks = 0;
  for (let index = 0; slot < 0 && index < SLOT_COUNT; ++index) {
    if (Atomics.compareExchange(view(), SLOTS + index, 0, TAKEN | WAITING) === 0) slot = index;
  }
  if (slot < 0) throw new RangeError("dso@0 has no room for another thread");

  function publishState() {
    Atomics.store(view(), SLOTS + slot, TAKEN | (waiting ? WAITING : 0) | applied);
    Atomics.notify(view(), SLOTS + slot);
  }

  function recordView(array, index) {
    return new DataView(memory.buffer, Number(array) + index * RECORD_SIZE, RECORD_SIZE);
  }

  function readRecord(array, index) {
    const data = recordView(array, index);
    return { kind: data.getUint32(0, true), word: data.getUint32(4, true),
      values: [8, 16, 24, 32, 40].map(offset => data.getBigUint64(offset, true)) };
  }

  function synchronize() {
    if (applying) return;
    applying = true;
    try {
      for (let count; applied < (count = Atomics.load(view(), COUNT));) {
        const array = Atomics.load(bigWords, RECORDS);
        const records = Array.from({ length: count - applied }, (_, index) => readRecord(array, applied + index));
        records.forEach((_, index) => {
          try {
            apply(records, index);
          } catch (error) {
            throw error instanceof ThreadRecordError ? error
              : new ThreadRecordError(`dso@0: this thread could not make another's change: ${error.message}`, { cause: error });
          }
          ++applied;
          publishState();
        });
      }
    } finally {
      applying = false;
    }
  }

  function enterHost() {
    waiting = true;
    publishState();
  }

  function leaveHost() {
    waiting = false;
    publishState();
    synchronize();
  }

  function awaitApplied(target) {
    enterHost();
    for (let index = 0; index < SLOT_COUNT; ++index) {
      if (index === slot) continue;
      for (;;) {
        const state = Atomics.load(view(), SLOTS + index);
        if (!(state & TAKEN) || (state & WAITING) || (state & APPLIED) >= target) break;
        Atomics.wait(view(), SLOTS + index, state);
      }
    }
    leaveHost();
  }

  // Room for the next record, taken before the change it describes is made.
  function reserve() {
    const count = Atomics.load(view(), COUNT), current = view()[CAPACITY];
    if (count < current) return;
    const capacity = current === 0 ? FIRST_CAPACITY : current * 2;
    const grown = allocate(BigInt(capacity * RECORD_SIZE), 8n);
    if (!grown) throw new RangeError("process could not reserve dso@0's thread records");
    if (count !== 0) {
      new Uint8Array(memory.buffer, Number(grown), count * RECORD_SIZE)
        .set(new Uint8Array(memory.buffer, Number(Atomics.load(bigWords, RECORDS)), count * RECORD_SIZE));
    }
    Atomics.store(bigWords, RECORDS, grown);
    view()[CAPACITY] = capacity;
  }

  // The record of a change this Worker made, which the others then make. With
  // acknowledged it returns once each has, or waits in the host.
  function publish({ kind, word = 0, values }, acknowledged) {
    const count = Atomics.load(view(), COUNT);
    const data = recordView(Atomics.load(bigWords, RECORDS), count);
    data.setUint32(0, kind, true);
    data.setUint32(4, word, true);
    values.forEach((value, index) => data.setBigUint64(8 + index * 8, value, true));
    applied = count + 1;
    publishState();
    Atomics.store(view(), COUNT, applied);
    if (acknowledged) awaitApplied(applied);
  }

  function lock() {
    if (locks++) return;
    const owner = slot + 1;
    if (Atomics.compareExchange(view(), LOCK, 0, owner) === 0) return;
    enterHost();
    for (let holder; (holder = Atomics.compareExchange(view(), LOCK, 0, owner)) !== 0;) {
      Atomics.wait(view(), LOCK, holder);
    }
    leaveHost();
  }

  function unlock() {
    if (--locks) return;
    Atomics.store(view(), LOCK, 0);
    Atomics.notify(view(), LOCK, 1);
  }

  return {
    synchronize,
    // run(publish) changes this Worker's table and publishes the record of
    // the change; one change at a time in the process.
    change(run) {
      lock();
      try {
        synchronize();
        reserve();
        return run(publish);
      } finally {
        unlock();
      }
    },
    // A wait for the host's answer, during which no change waits for this
    // thread: it applies them before it returns.
    awaitHost(run) {
      enterHost();
      const result = run();
      leaveHost();
      return result;
    },
    // A futex wait on the 32-bit word at address, or none: Atomics.wait's outcome.
    wait(wordAddress, value, milliseconds) {
      if (wordAddress === 0) {
        leaveHost();
        return "ok";
      }
      enterHost();
      const outcome = Atomics.wait(new Int32Array(memory.buffer, wordAddress, 1), 0, value, milliseconds);
      leaveHost();
      return outcome;
    },
    // The thread ends: no change waits for it again.
    leaving() {
      Atomics.store(view(), SLOTS + slot, 0);
      Atomics.notify(view(), SLOTS + slot);
    },
  };
}
