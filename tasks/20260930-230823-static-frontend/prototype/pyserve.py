# python3 pyserve.py ROOT PORT: stock http.server plus the two isolation headers.
import sys, http.server
class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".mjs": "text/javascript", ".wasm": "application/wasm"}
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()
    def log_message(self, *args): pass
http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[2])),
    lambda *a, **k: Handler(*a, directory=sys.argv[1], **k)).serve_forever()
