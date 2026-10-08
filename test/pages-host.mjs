// A local stand-in for Cloudflare Pages serving an exported deployment, as far
// as Dolly depends on the host: static _redirects, _headers rules (one greedy
// *, :name for one path segment, every matching rule applied in order, "! Name"
// removing a header), pages served without .html and index.html and redirected
// (308) to those URLs, and the nearest 404.html with status 404 and no-store.
// The rule syntax is Pages' documented one; the rest was measured on
// daugasauron.com.
//   node test/pages-host.mjs DEPLOYMENT [PORT]
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { mimeTypes } from "../scripts/serve.mjs";

const isFile = path => stat(path).then(entry => entry.isFile(), () => false);

export async function startPagesHost(directory, port = 0) {
  directory = resolve(directory);
  const text = name => readFile(resolve(directory, name), "utf8").catch(() => "");
  const redirects = new Map((await text("_redirects")).split("\n").filter(Boolean).map(line => {
    const [from, to, status] = line.split(/\s+/);
    return [from, { location: to, status: Number(status) }];
  }));
  const rules = (await text("_headers")).trim().split("\n\n").filter(Boolean).map(block => {
    const [path, ...lines] = block.split("\n").map(line => line.trim());
    const pattern = path.split("*").map(part => part.replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&")).join(".*")
      .replace(/:[A-Za-z]\w*/g, "[^/]+");
    return { pattern: new RegExp(`^${pattern}$`), lines };
  });
  const requests = [];
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    requests.push(path);
    if (redirects.has(path)) {
      const { status, location } = redirects.get(path);
      response.writeHead(status, { location }).end();
      return;
    }
    const headers = new Map(), ruled = new Set();
    function respond(status, file, size) {
      if (file) headers.set("content-type", mimeTypes.get(extname(file)) ?? "application/octet-stream");
      for (const { pattern, lines } of rules) if (pattern.test(path)) for (const line of lines) {
        const name = line.slice(line.startsWith("! ") ? 2 : 0).split(":")[0].toLowerCase();
        if (line.startsWith("! ")) headers.delete(name);
        else {
          const value = line.slice(line.indexOf(":") + 1).trim();
          headers.set(name, ruled.has(name) && headers.has(name) ? `${headers.get(name)}, ${value}` : value);
          ruled.add(name);
        }
      }
      // Measured: Pages answers 404 with no-store whatever the rules say.
      if (status === 404) headers.set("cache-control", "no-store");
      if (file) headers.set("content-length", size);
      response.writeHead(status, Object.fromEntries(headers));
      if (file && request.method !== "HEAD") createReadStream(file).pipe(response); else response.end();
    }
    const serve = async (status, file) => respond(status, file, (await stat(file)).size);
    const redirect = location => { headers.set("location", location); respond(308); };
    async function notFound() {
      let folder = dirname(file);
      while (folder.startsWith(directory) && !await isFile(resolve(folder, "404.html"))) folder = dirname(folder);
      if (folder.startsWith(directory)) await serve(404, resolve(folder, "404.html")); else respond(404);
    }
    const file = resolve(directory, `.${path}`), index = resolve(file, "index.html");
    if (!["GET", "HEAD"].includes(request.method) || /[\\\0]/.test(path) || ["/_headers", "/_redirects"].includes(path) ||
        path.split("/").some(part => part === "." || part === "..")) respond(404);
    else if (path.endsWith(".html") && await isFile(file)) redirect(path.slice(0, -(path.endsWith("/index.html") ? "index.html" : ".html").length));
    else if (path.endsWith("/")) await (await isFile(index) ? serve(200, index) : notFound());
    else if (await isFile(file)) await serve(200, file);
    else if (await isFile(`${file}.html`)) await serve(200, `${file}.html`);
    else if (await isFile(index)) redirect(`${path}/`);
    else await notFound();
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolveListen);
  });
  return { origin: `http://127.0.0.1:${server.address().port}`, requests,
    close: () => new Promise(resolveClose => { server.close(resolveClose); server.closeAllConnections(); }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw new Error("usage: pages-host.mjs DEPLOYMENT [PORT]");
  console.log(`dolly: ${(await startPagesHost(process.argv[2], Number(process.argv[3] ?? 0))).origin}/`);
}
