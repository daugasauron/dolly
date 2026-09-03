const databaseName = "dolly-module-cache-v1";
const storeName = "layers";
const maximumLayerBytes = 512 * 1024 * 1024;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName, { keyPath: "id" });
      }
    });
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", resolve, { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error), { once: true });
  });
}

function recordId(buildId, cacheKey) {
  return `${buildId}\n${cacheKey}`;
}

export async function loadModuleLayers(buildId, cacheKeys) {
  const database = await openDatabase();
  try {
    let total = 0;
    const layers = [];
    for (const cacheKey of cacheKeys) {
      const transaction = database.transaction(storeName, "readonly");
      const done = transactionDone(transaction);
      const record = await requestResult(
        transaction.objectStore(storeName).get(recordId(buildId, cacheKey)),
      );
      await done;
      if (record === undefined) continue;
      if (record.buildId !== buildId || record.cacheKey !== cacheKey ||
          record.id !== recordId(buildId, cacheKey) ||
          !(record.bytes instanceof ArrayBuffer) || record.bytes.byteLength < 16 ||
          record.bytes.byteLength > maximumLayerBytes ||
          !/^[0-9a-f]{64}$/.test(record.sha256)) continue;
      if (total > maximumLayerBytes - record.bytes.byteLength) break;
      total += record.bytes.byteLength;
      layers.push({ cacheKey, sha256: record.sha256, bytes: record.bytes });
    }
    return layers;
  } finally {
    database.close();
  }
}

export async function saveModuleLayers(buildId, layers, allowedCacheKeys) {
  const database = await openDatabase();
  try {
    const allowed = new Set(allowedCacheKeys);
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const cursor = store.openCursor();
    cursor.addEventListener("success", () => {
      const item = cursor.result;
      if (item === null) return;
      if (item.value?.buildId !== buildId || !allowed.has(item.value?.cacheKey)) {
        item.delete();
      }
      item.continue();
    });
    let total = 0;
    for (const layer of layers) {
      if (!allowed.has(layer.cacheKey) ||
          !/^[0-9a-f]{64}$/.test(layer.cacheKey) ||
          !/^[0-9a-f]{64}$/.test(layer.sha256) ||
          !(layer.bytes instanceof ArrayBuffer) || layer.bytes.byteLength < 16 ||
          layer.bytes.byteLength > maximumLayerBytes) continue;
      if (total > maximumLayerBytes - layer.bytes.byteLength) break;
      total += layer.bytes.byteLength;
      store.put({
        id: recordId(buildId, layer.cacheKey),
        buildId,
        cacheKey: layer.cacheKey,
        sha256: layer.sha256,
        bytes: layer.bytes,
        updatedAt: Date.now(),
      });
    }
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}
