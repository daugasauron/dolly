"""Synchronous subprocess compatibility for Dolly.

Dolly version 0 has process-shaped nested command invocations but deliberately
has no concurrency.  This module preserves the useful CPython subprocess API
by spooling PIPE data through WasmFS and running a child at the first operation
that needs its result.  No operation crosses the browser boundary.
"""

from __future__ import annotations

import io
import os
import shlex
import sys
import tempfile

import _dolly_process
from subprocess import DEVNULL, PIPE, STDOUT, SubprocessError, TimeoutExpired


class _OutputPipe:
    def __init__(self, process: "Popen", stream: str):
        self._process = process
        self._stream = stream

    def _target(self):
        self._process._start(None)
        return getattr(self._process, f"_{self._stream}_view")

    def read(self, *args, **kwargs):
        return self._target().read(*args, **kwargs)

    def readline(self, *args, **kwargs):
        return self._target().readline(*args, **kwargs)

    def readlines(self, *args, **kwargs):
        return self._target().readlines(*args, **kwargs)

    def __iter__(self):
        return iter(self._target())

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def fileno(self):
        return getattr(self._process, f"_{self._stream}_raw").fileno()

    def close(self):
        view = getattr(self._process, f"_{self._stream}_view", None)
        if view is not None:
            view.close()

    @property
    def closed(self):
        view = getattr(self._process, f"_{self._stream}_view", None)
        return view.closed if view is not None else False


def _which(program, path):
    """Resolve a Dolly command without inventing Unix mode permissions."""
    search_path = os.environ.get("PATH", os.defpath) if path is None else path
    for directory in search_path.split(os.pathsep):
        candidate = os.path.join(directory or os.curdir, program)
        if os.path.isfile(candidate):
            return candidate
    return None


def _command_arguments(args, executable, shell, environment):
    if shell:
        if isinstance(args, (str, bytes, os.PathLike)):
            command = os.fsdecode(args)
        else:
            command = " ".join(shlex.quote(os.fsdecode(item)) for item in args)
        return "/bin/slop", ["/bin/slop", "-c", command]

    if isinstance(args, (str, bytes, os.PathLike)):
        result = [os.fsdecode(args)]
    else:
        result = [os.fsdecode(item) for item in args]
    if not result:
        raise ValueError("process argument list is empty")
    program = os.fsdecode(executable) if executable is not None else result[0]
    if "/" not in program:
        path = None if environment is None else environment.get("PATH", os.defpath)
        resolved = _which(program, path)
        if resolved is None:
            raise FileNotFoundError(2, os.strerror(2), program)
        program = resolved
    return program, result


class Popen:
    """A serial, spooled implementation of the ordinary Popen surface."""

    def __init__(self, args, bufsize=-1, executable=None, stdin=None,
                 stdout=None, stderr=None, preexec_fn=None, close_fds=True,
                 shell=False, cwd=None, env=None, universal_newlines=None,
                 startupinfo=None, creationflags=0, restore_signals=True,
                 start_new_session=False, pass_fds=(), *, user=None,
                 group=None, extra_groups=None, encoding=None, errors=None,
                 text=None, umask=-1, pipesize=-1, process_group=None):
        del bufsize, close_fds, restore_signals, pipesize
        if preexec_fn is not None or startupinfo is not None or creationflags or \
                start_new_session or pass_fds or user is not None or \
                group is not None or extra_groups is not None or umask != -1 or \
                process_group not in (None, -1):
            raise NotImplementedError(
                "Dolly subprocesses do not emulate OS identity or session controls"
            )
        if stdout is STDOUT:
            raise ValueError("STDOUT can only be used for stderr")
        if text is not None and universal_newlines is not None and \
                bool(text) != bool(universal_newlines):
            raise SubprocessError("text and universal_newlines disagree")

        self.args = args
        self.returncode = None
        self.pid = None
        self._child_created = False
        self.encoding = encoding or ("utf-8" if (text or universal_newlines) else None)
        self.errors = errors or "strict"
        self.text_mode = bool(self.encoding or text or universal_newlines)
        # Dolly starts the child lazily when its result is first observed.
        # Capture the effective environment now, as real Popen does at exec,
        # so a surrounding build-backend context cannot disappear before the
        # private child Worker is launched.
        source_environment = os.environ if env is None else env
        self._environment = {
            os.fsdecode(key): os.fsdecode(value)
            for key, value in source_environment.items()
        }
        self._path, self._argv = _command_arguments(
            args, executable, shell, self._environment
        )
        self._cwd = None if cwd is None else os.fsdecode(cwd)
        self._started = False
        self._timed_out = False
        self._owned = []

        self._stdin_raw = None
        if stdin == PIPE:
            self._stdin_raw = tempfile.TemporaryFile(mode="w+b")
            self._owned.append(self._stdin_raw)
            self.stdin = (io.TextIOWrapper(self._stdin_raw, encoding=self.encoding,
                                           errors=self.errors, write_through=True)
                          if self.text_mode else self._stdin_raw)
        else:
            self.stdin = None
        self._stdin_fd = self._descriptor(stdin, 0, False)

        self._stdout_raw = None
        self._stdout_view = None
        if stdout == PIPE:
            self._stdout_raw = tempfile.TemporaryFile(mode="w+b")
            self._owned.append(self._stdout_raw)
            self.stdout = _OutputPipe(self, "stdout")
            self._stdout_fd = self._stdout_raw.fileno()
        else:
            self.stdout = None
            self._stdout_fd = self._descriptor(stdout, 1, True)

        self._stderr_raw = None
        self._stderr_view = None
        if stderr == PIPE:
            self._stderr_raw = tempfile.TemporaryFile(mode="w+b")
            self._owned.append(self._stderr_raw)
            self.stderr = _OutputPipe(self, "stderr")
            self._stderr_fd = self._stderr_raw.fileno()
        elif stderr == STDOUT:
            self.stderr = None
            self._stderr_fd = self._stdout_fd
        else:
            self.stderr = None
            self._stderr_fd = self._descriptor(stderr, 2, True)

    def _descriptor(self, value, inherited, output):
        if value is None:
            return inherited
        if value == DEVNULL:
            descriptor = os.open(os.devnull, os.O_WRONLY if output else os.O_RDONLY)
            self._owned.append(descriptor)
            return descriptor
        if value == PIPE:
            descriptor = os.dup(self._stdin_raw.fileno())
            self._owned.append(descriptor)
            return descriptor
        if isinstance(value, int):
            return value
        return value.fileno()

    def _finish_output(self, name):
        raw = getattr(self, f"_{name}_raw")
        if raw is None:
            return
        raw.flush()
        raw.seek(0)
        view = (io.TextIOWrapper(raw, encoding=self.encoding, errors=self.errors)
                if self.text_mode else raw)
        setattr(self, f"_{name}_view", view)

    def _start(self, timeout):
        if self._started:
            return
        self._started = True
        # Every Dolly command shares one address space. Flush Python's parent
        # text buffers before the runtime temporarily redirects descriptors,
        # otherwise pending parent output can become the child's captured
        # stdout or stderr (for example, pip progress preceding `meson
        # --version`). The C lifecycle boundary separately flushes libc.
        for stream in (sys.stdout, sys.stderr):
            stream.flush()
        if self._stdin_raw is not None:
            if not self.stdin.closed:
                self.stdin.flush()
            os.lseek(self._stdin_fd, 0, os.SEEK_SET)
        timeout_value = None if timeout is None else float(timeout)
        environment = [
            f"{key}={value}" for key, value in self._environment.items()
        ]
        self.pid, self.returncode = _dolly_process.spawn(
            self._path, self._argv, environment, self._cwd,
            self._stdin_fd, self._stdout_fd, self._stderr_fd, timeout_value
        )
        self._child_created = True
        self._finish_output("stdout")
        self._finish_output("stderr")
        if timeout is not None and self.returncode == 124:
            self._timed_out = True
            raise TimeoutExpired(self.args, timeout)

    def communicate(self, input=None, timeout=None):
        if input is not None:
            if self._stdin_raw is None:
                raise ValueError("stdin argument not PIPE")
            self.stdin.write(input)
        self._start(timeout)
        stdout = self._stdout_view.read() if self._stdout_view is not None else None
        stderr = self._stderr_view.read() if self._stderr_view is not None else None
        return stdout, stderr

    def poll(self):
        self._start(None)
        return self.returncode

    def wait(self, timeout=None):
        self._start(timeout)
        return self.returncode

    @property
    def universal_newlines(self):
        return self.text_mode

    def send_signal(self, signal):
        del signal
        if self.returncode is None:
            raise NotImplementedError(
                "Dolly commands run synchronously; use timeout or outer Ctrl+C"
            )

    terminate = send_signal
    kill = send_signal

    def __enter__(self):
        return self

    def __exit__(self, exc_type, value, traceback):
        del value, traceback
        if not self._started and exc_type is None:
            self.wait()
        for item in self._owned:
            try:
                os.close(item) if isinstance(item, int) else item.close()
            except OSError:
                pass
        return False

    def __repr__(self):
        return f"<Popen: returncode: {self.returncode} args: {self.args!r}>"
