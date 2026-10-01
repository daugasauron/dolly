import sys
import urllib.request

import requests

origin = sys.argv[1]
text = "FETCHED-THROUGH-BROWSER\n"
with urllib.request.urlopen(f"{origin}/fixture/http.txt") as response:
    assert response.status == 200 and response.read().decode() == text
with urllib.request.urlopen(urllib.request.Request(f"{origin}/fixture/echo", b"posted")) as response:
    assert response.read() == b"posted"
assert requests.get(f"{origin}/fixture/http.txt").text == text
assert requests.post(f"{origin}/fixture/echo", data=b"posted").content == b"posted"
assert requests.get(f"{origin}/fixture/missing").status_code == 404
for denied in (urllib.request.urlopen, requests.get):
    try:
        denied(f"{origin}/denied")
    except OSError as error:
        assert "Browser HTTP policy denied the request" in str(error), error
    else:
        raise AssertionError(f"{denied.__module__} reached a denied URL")
