// Exercise the provider's report when its Worker gets no adapter though the page had one.
navigator.gpu.requestAdapter = async () => null;
