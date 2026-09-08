export function createHttpRedirectFixture() {
  const observations = [];
  return async (request, response, url) => {
    if (!["/fixture/http-redirect", "/fixture/http-echo", "/fixture/http-observations"].includes(url.pathname)) return false;
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    response.setHeader("access-control-allow-headers", request.headers["access-control-request-headers"] ?? "");
    if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return true; }
    if (url.pathname === "/fixture/http-redirect") {
      const target = new URL(`http://${request.headers.host}/fixture/http-echo`);
      target.hostname = target.hostname === "localhost" ? "127.0.0.1" : "localhost";
      response.writeHead(url.searchParams.get("status") === "302" ? 302 : 307, { location: target.href });
      response.end();
    } else {
      if (url.pathname === "/fixture/http-echo") {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        observations.push({ method: request.method, body: Buffer.concat(chunks).toString(),
          authorization: request.headers.authorization ?? null, apiKey: request.headers["x-api-key"] ?? null,
          cookie: request.headers.cookie ?? null, referer: request.headers.referer ?? null });
      }
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify(url.pathname === "/fixture/http-echo" ? observations.at(-1) : observations));
    }
    return true;
  };
}
