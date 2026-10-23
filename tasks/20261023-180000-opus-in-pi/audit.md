# Dolly environment audit (from the inside)

Tested from Pi's `bash` tool in `/workspace`. Outputs are trimmed but not edited.

## System identity
```
$ echo $0; uname -a
slop
Dolly dolly 0 dolly-process-0 wasm64
$ ls /bin /usr/bin | wc -l
103
$ grep 'REQUIRES HOST' /etc/dolly/Dollyfile
runtime@0 display@0 input@0 download@0 http@0 packages@0 snapshot@0 threads@0 upload@0
```
This image has **no `dso@0` and no `sockets@0`**, and there is **no `nena`**
(`slop: nena: command not found`), so you can't add host modules from inside the image.

## Shell (Slop)
- POSIX features work: `$((2+3))` printed `5`, `$?` after `ls nope` was `1`, and `&` ran a background job.
- Bash features don't: `[[ 1 ]]` printed `slop: [[: command not found` (status 127).
- **Surprise:** `kill %1` printed `kill: strtonum %1: invalid`. Job specs don't work, so use a PID.

## Files
- `echo hi > t.txt && cat t.txt` printed `hi`. Files are in memory and are lost on reload unless you save the session (Ctrl+Shift+S).
- `df` printed `slop: df: command not found`.

## Processes
There is no `ps` by default and no general `/proc`. `cat /proc/processes` works:
```
100 0 running /bin/foreground -i /bin/slop /etc/dolly/init.slop
116 114 running pi
166 120 running sleep 5
```
- **Surprise:** each `cc` call shows up as two processes (`cc h.c -o h` → `cc --dolly-toolchain-mode=c ...`).
- There is no fork/exec: programs start other programs with `posix_spawn`.

## Packages (amy)
`amy list` shows a large catalogue (cargo/rust, cmake, emacs, glib, imgui, jq, less...).
```
$ amy install jq
amy: jq installed: 4 files, 1265531 bytes, commands: jq
$ echo '{"a":1}' | jq .a
1
$ amy install python
dollyfile: .../Dollyfile-python needs dso@0: add REQUIRES HOST dso@0
amy: python: not installed
```
- **Surprise:** after the python install failed, `echo st=$?` printed `st=0`. That `$?` belongs to `tail` at the end of my pipeline (`amy install python 2>&1 | tail -3`), so it says nothing about amy's own exit status. Check the text amy prints.
- `amy list` shows `cc` as not installed (`-`), but `/bin/cc` exists and works.

## Compilers
```
$ cc h.c -o h && ./h         # prints sizeof(void*)
hello 8
$ c++ h.cc -o hh && ./hh     # iostream
c++ ok
```
C and C++ (Clang) both work out of the box and build wasm64 programs (8-byte pointers).

## JavaScript (janis)
```
$ janis -e 'console.log(process.version, typeof fetch, require("fs").readFileSync("t.txt","utf8"))'
v22.19.0-janis function hi
```
janis is QuickJS with a Node-like API: `require`, `fs` and `fetch` all work. There is no `node` or `npm`.

## Python
```
$ python3 -c 1   ->  slop: python3: command not found
```
Python isn't installed, and it can't be installed in this image because it needs `dso@0` and `sockets@0`.

## Network (HTTP only, through the browser, needs CORS)
```
raw.githubusercontent.com  200
api.github.com             200
pypi.org/simple/           200
github.com                 000  curl: (7) Browser could not fetch the URL: blocked (no CORS headers, ...)
example.com                000  curl: (7) same
```
- **Surprise:** example.com fails because it sends no CORS headers. A host being reachable is not enough: it must allow cross-origin requests.

## Git
Local repositories work:
```
$ git init -q . && git add a && git -c user.name=x -c user.email=x@x commit -qm i && git log --oneline
ea49e55 i
```
Cloning from GitHub fails:
```
$ git clone https://github.com/git/git x
fatal: unable to access 'https://github.com/git/git/': Browser could not fetch the URL: blocked ...
```
To get source, fetch files from raw.githubusercontent.com or the GitHub API instead.

## Moving files in and out
- **Out:** `download FILE` (or Pi's download tool) offers a file to the browser. This report was delivered that way.
- **In:** `upload PATH` asks you to pick a file. I didn't test it because it needs someone to click.
- **Archives:** the built-in `tar` only extracts (`usage: tar -xf ARCHIVE ... This tar extracts only; git archive creates archives.`) and `gzip` only decompresses. This worked:
```
$ git add t.txt h.c && git archive -o a.zip $(git write-tree) && ls -l a.zip
-rw-r--r--   1 0 0        297 Oct 23 07:05 a.zip
```

## Summary
| Area | Status |
|---|---|
| POSIX shell, files, pipes | works; no bash-isms, no `kill %N`, no `df` |
| Processes | `/proc/processes` only; `ps` via amy |
| cc / c++ | works out of the box (wasm64) |
| JavaScript | janis works (Node-like API, fetch) |
| Python | **not possible in this image** (needs dso, sockets) |
| Packages | amy works; refuses packages that need missing host modules |
| Network | HTTP(S) to CORS-enabled hosts only |
| Git | local works; can't clone from github.com |
| File transfer | download/upload; archives via `git archive` |
