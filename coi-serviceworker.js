// GitHub Pages cannot configure COOP/COEP response headers. This worker adds
// them only to Dolly's same-origin static responses so shared wasm64 memory is
// available there. Cross-origin requests, including the explicit HTTP broker,
// pass through unchanged.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  const target = new URL(event.request.url);
  if (target.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const response = await fetch(event.request);
    if (response.type === "opaque" || response.type === "opaqueredirect") return response;
    const headers = new Headers(response.headers);
    // Fetch exposes a decoded body while origin transport headers can still
    // describe its compressed representation. A reconstructed Response must
    // let the browser derive framing for the decoded stream.
    headers.delete("Content-Encoding");
    headers.delete("Content-Length");
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    headers.set("Cross-Origin-Resource-Policy", "same-origin");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  })());
});
