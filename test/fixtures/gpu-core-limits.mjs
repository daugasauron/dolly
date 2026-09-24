// Exercise a real device with core limits and no optional GPU features.
const requestAdapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
navigator.gpu.requestAdapter = async options => {
  const adapter = await requestAdapter(options);
  if (!adapter) return adapter;
  const defaults = {maxBufferSize: 268435456, maxStorageBufferBindingSize: 134217728, maxStorageBuffersPerShaderStage: 8,
    maxComputeWorkgroupStorageSize: 16384, maxComputeInvocationsPerWorkgroup: 256, maxComputeWorkgroupSizeX: 256, maxComputeWorkgroupSizeY: 256};
  const limits = new Proxy(adapter.limits, {get(target, key) {return defaults[key] ?? Reflect.get(target, key, target);}});
  Object.defineProperty(adapter, "limits", {value: limits});
  Object.defineProperty(adapter, "features", {value: new Set()});
  const requestDevice = adapter.requestDevice.bind(adapter);
  adapter.requestDevice = async descriptor => {
    const device = await requestDevice(descriptor);
    for (const [name, value] of Object.entries(defaults))
      if (device.limits[name] !== value) throw new Error("Core device limit mismatch: " + name);
    if ([...device.features].some(feature => feature !== "core-features-and-limits"))
      throw new Error("Core device enabled an optional feature");
    return device;
  };
  return adapter;
};
