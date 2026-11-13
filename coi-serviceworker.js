// The site's service worker, for its own same-origin GET and HEAD responses; it
// holds no policy and reaches nothing a page's fetch does not. Cross-origin
// requests, including the explicit HTTP broker's, pass through unchanged.
// - GitHub Pages cannot configure COOP/COEP response headers: the worker adds
//   them where a response lacks them, so shared wasm64 memory is available there.
// - Where the network fails, a GET is answered from this site's kept runtime: the
//   files a saved session opens with, which the page stores when a session is
//   saved, each checked against the site's list (site/offline.mjs). A response the
//   server gives, an error among them, is never replaced.
const kept = `dolly-offline ${self.registration.scope} `;
async function keptResponse(request, failure) {
  for (const name of request.method === "GET" ? await caches.keys() : []) {
    const response = name.startsWith(kept) && await (await caches.open(name)).match(request, { ignoreSearch: true });
    if (response) return response;
  }
  throw failure;
}
// It controls the pages loaded after it and never takes over a running one
// (no clients.claim, no skipWaiting): a page whose Workers wait in Atomics.wait
// stalls its fetches in Firefox while its controller changes.
self.addEventListener("fetch", (event) => {
  const target = new URL(event.request.url);
  if (target.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const response = await fetch(event.request).catch(failure => keptResponse(event.request, failure));
    if (response.type === "opaque" || response.type === "opaqueredirect" ||
        response.headers.has("Cross-Origin-Embedder-Policy")) return response;
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
