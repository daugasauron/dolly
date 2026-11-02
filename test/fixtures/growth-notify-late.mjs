// Imported before host/runtime/grower.mjs: each notify is sent again once
// the runtime Worker waits for the next growth, as a grower stopped between
// its store and its notify sends it late.
const { notify, wait } = Atomics;
let late = null;
Atomics.notify = (array, index, count) => {
  late = [array, index];
  return notify(array, index, count);
};
Atomics.wait = (array, index, value, timeout) => {
  const result = wait(array, index, value, timeout);
  if (late) {
    const [word, at] = late;
    late = null;
    while (Atomics.load(word, at) === 1 && notify(word, at) === 0);
  }
  return result;
};
