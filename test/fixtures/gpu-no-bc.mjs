// Exercise clients' fallback using a device that does not admit BC compression.
const requestAdapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
navigator.gpu.requestAdapter = async options => {
  const adapter = await requestAdapter(options);
  if (adapter) {
    const features = new Set(adapter.features);
    features.delete("texture-compression-bc");
    Object.defineProperty(adapter, "features", {value: features});
  }
  return adapter;
};
