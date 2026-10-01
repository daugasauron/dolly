"""HTTP transports over Dolly's browser HTTP broker (the _dolly_http module).

Importing this module (dolly-http.pth does so at startup) makes urllib.request's
default opener and requests' HTTPAdapter.send, including pip's vendored copy,
send through env.dolly_http_dispatch. There is no socket or ssl emulation:
the browser owns TLS, redirects and content decoding, and its policy decides.
"""

import io
import sys


def _body(data):
    if data is None:
        return b""
    if isinstance(data, str):
        return data.encode("iso-8859-1")
    if hasattr(data, "read"):
        return _body(data.read())
    try:
        return bytes(memoryview(data))
    except TypeError:
        return b"".join(map(_body, data))


class Response(io.RawIOBase):
    """One brokered request: status and headers on creation, then body bytes."""

    def __init__(self, method, url, headers, body, timeout=None):
        """`timeout` bounds the wait for each record, like a socket read timeout."""
        import _dolly_http
        import errno
        import time
        self._http, self._time, self._timeout = _dolly_http, time, timeout
        header_block = "".join(f"{name}: {value}\r\n" for name, value in headers)
        self._sequence = None
        while self._sequence is None:
            try:
                self._sequence = _dolly_http.start(
                    method, url, header_block, _body(body), _dolly_http.FOLLOW_REDIRECTS)
            except OSError as error:
                if error.errno != errno.EBUSY:
                    raise
                time.sleep(0.01)
        self._pending = memoryview(b"")
        self.url, lines = url, []
        try:
            while True:
                kind, self.status, _, data = self._next()
                if kind == _dolly_http.KIND_URL:
                    self.url = data.decode()
                elif data != b"\r\n":
                    lines.append(data.decode().rstrip("\r\n"))
                else:
                    break
        except BaseException:
            self.close()
            raise
        self.reason = lines[0].split(" ", 2)[2]
        # The browser already removed transfer and content codings. CORS may
        # hide Content-Encoding but show the encoded Content-Length.
        self.headers = [field for field in (line.split(": ", 1) for line in lines[1:])
                        if field[0] not in {"content-encoding", "content-length", "transfer-encoding"}]

    def _next(self):
        deadline = None if self._timeout is None else self._time.monotonic() + self._timeout
        while True:
            try:
                record = self._http.poll(self._sequence)
            except OSError:
                self._sequence = None
                raise
            if record is not None:
                if record[2]:
                    self._sequence = None
                return record
            if deadline is not None and self._time.monotonic() > deadline:
                self.close()
                raise TimeoutError("Browser HTTP response timed out")
            self._time.sleep(0.01)

    def readable(self):
        return True

    def readinto(self, buffer):
        while not self._pending and self._sequence is not None:
            self._pending = memoryview(self._next()[3])
        count = min(len(buffer), len(self._pending))
        buffer[:count] = self._pending[:count]
        self._pending = self._pending[count:]
        return count

    def close(self):
        if self._sequence is not None:
            sequence, self._sequence = self._sequence, None
            self._http.cancel(sequence)
        super().close()


def _install_urllib(request):
    import http.client
    import socket
    import urllib.response

    class HTTPHandler(request.HTTPHandler):
        def http_open(self, req):
            timeout = req.timeout if req.timeout is not socket._GLOBAL_DEFAULT_TIMEOUT else socket.getdefaulttimeout()
            try:
                raw = Response(req.get_method(), req.full_url, req.header_items(), req.data, timeout)
            except OSError as error:
                raise request.URLError(error) from error
            headers = http.client.HTTPMessage()
            for name, value in raw.headers:
                headers[name] = value
            response = urllib.response.addinfourl(io.BufferedReader(raw), headers, raw.url, raw.status)
            response.msg = response.reason = raw.reason
            return response

        https_open = http_open
        https_request = request.AbstractHTTPHandler.do_request_

    request.HTTPHandler = HTTPHandler


def _install_requests(adapters):
    import importlib
    urllib3 = adapters.PoolManager.__module__.rpartition(".")[0]
    HTTPResponse = importlib.import_module(urllib3 + ".response").HTTPResponse

    def send(self, request, stream=False, timeout=None, verify=True, cert=None, proxies=None):
        if verify is not True or cert is not None:
            raise adapters.SSLError("The browser owns TLS: no client certificates or custom verification",
                                    request=request)
        if isinstance(timeout, tuple):
            timeout = timeout[1]  # (connect, read)
        try:
            raw = Response(request.method, request.url, request.headers.items(), request.body,
                           getattr(timeout, "read_timeout", timeout))
        except TimeoutError as error:
            raise adapters.ReadTimeout(error, request=request) from error
        except OSError as error:
            raise adapters.ConnectionError(error, request=request) from error
        response = self.build_response(request, HTTPResponse(
            body=io.BufferedReader(raw), headers=raw.headers, status=raw.status, reason=raw.reason,
            preload_content=False, decode_content=False,
            request_method=request.method, request_url=raw.url))
        response.url = raw.url
        return response

    adapters.HTTPAdapter.send = send


_INSTALLERS = {
    "urllib.request": _install_urllib,
    "requests.adapters": _install_requests,
    "pip._vendor.requests.adapters": _install_requests,
}


class _InstallOnImport:
    """Installs a transport right after its target module executes."""

    @staticmethod
    def find_spec(name, path, target=None):
        install = _INSTALLERS.get(name)
        if install is None:
            return None
        for finder in sys.meta_path[sys.meta_path.index(_InstallOnImport) + 1:]:
            spec = finder.find_spec(name, path, target)
            if spec is not None:
                break
        else:
            return None
        execute = spec.loader.exec_module

        def exec_module(module):
            execute(module)
            if module.__name__ == name:  # A zip importer's loader is shared.
                install(module)

        spec.loader.exec_module = exec_module
        return spec


sys.meta_path.insert(0, _InstallOnImport)
