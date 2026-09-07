import errno
import os
import signal
import subprocess as sp
import sys
import termios
import time
import tty
import warnings

root = sys.argv[1]
failures = []


def cleanup(child):
    try:
        child.kill()
    except (OSError, TypeError, NotImplementedError):
        pass
    try:
        child.wait(timeout=1)
    except sp.TimeoutExpired:
        pass
    for stream in (child.stdin, child.stdout, child.stderr):
        if stream is not None:
            stream.close()


def check(name, operation):
    try:
        operation()
        print("PYTHON-PROCESS PASS:", name, flush=True)
    except Exception as error:
        failures.append(name)
        print("PYTHON-PROCESS FAIL:", name, type(error).__name__, str(error), flush=True)


def terminal_modes():
    assert os.isatty(0)
    before = termios.tcgetattr(0)
    try:
        assert len(termios.tcgetwinsize(0)) == 2
        tty.setraw(0)
        assert termios.tcgetattr(0)[3] & termios.ICANON == 0
    finally:
        termios.tcsetattr(0, termios.TCSANOW, before)
    assert termios.tcgetattr(0) == before


def starts_before_wait():
    marker = root + "/started"
    child = sp.Popen(["/bin/slop", "-c", "echo started > " + marker + "; sleep 30"])
    try:
        assert isinstance(child.pid, int) and child.pid > 0, "no real PID at creation"
        deadline = time.monotonic() + 5
        while not os.path.exists(marker) and time.monotonic() < deadline:
            time.sleep(.01)
        assert os.path.exists(marker), "child did not start before wait/poll"
        started = time.monotonic()
        assert child.poll() is None, "running child reported an exit"
        assert time.monotonic() - started < .5, "poll blocked"
        child.terminate()
        assert child.wait(timeout=3) == -signal.SIGTERM
    finally:
        cleanup(child)


def creation_state():
    previous_cwd = os.getcwd()
    previous_env = os.environ.get("DOLLY_PROCESS_PROBE")
    os.mkdir(root + "/before")
    os.mkdir(root + "/after")
    try:
        os.chdir(root + "/before")
        os.environ["DOLLY_PROCESS_PROBE"] = "before"
        child = sp.Popen([sys.executable, "-c",
                          "import os; print(os.getcwd()); print(os.environ['DOLLY_PROCESS_PROBE'])"],
                         stdout=sp.PIPE, text=True)
        try:
            os.chdir(root + "/after")
            os.environ["DOLLY_PROCESS_PROBE"] = "after"
            output, _ = child.communicate(timeout=10)
            assert output.splitlines() == [root + "/before", "before"], output
        finally:
            cleanup(child)
        result = sp.run(["/bin/slop", "-c", '/bin/printf "%s" "$DOLLY_PROCESS_PROBE"'],
                        env={"DOLLY_PROCESS_PROBE": "custom"}, capture_output=True, text=True, check=True)
        assert result.stdout == "custom"
    finally:
        os.chdir(previous_cwd)
        if previous_env is None:
            os.environ.pop("DOLLY_PROCESS_PROBE", None)
        else:
            os.environ["DOLLY_PROCESS_PROBE"] = previous_env


def streaming_and_timeout():
    child = sp.Popen(["/bin/slop", "-c", "echo prefix; sleep 30"], stdout=sp.PIPE, text=True)
    try:
        assert child.stdout.readline() == "prefix\n"
        assert child.poll() is None, "stdout was held until exit"
        try:
            child.wait(timeout=.05)
            raise AssertionError("wait did not time out")
        except sp.TimeoutExpired:
            pass
        assert child.poll() is None, "wait timeout killed the process"
        child.kill()
        assert child.wait(timeout=3) == -signal.SIGKILL
    finally:
        cleanup(child)


def signal_cleanup():
    marker = root + "/signal.lock"
    child = sp.Popen([sys.executable, "-c",
                      "import os, signal, sys, time\n"
                      "def stop(number, frame):\n"
                      " os.unlink(sys.argv[1]); sys.exit(37)\n"
                      "signal.signal(signal.SIGTERM, stop)\n"
                      "open(sys.argv[1], 'w').close()\n"
                      "print('ready', flush=True)\n"
                      "time.sleep(30)\n", marker], stdout=sp.PIPE, text=True)
    try:
        assert child.stdout.readline() == "ready\n"
        child.terminate()
        assert child.wait(timeout=3) == 37, "Python handler did not complete"
        assert not os.path.exists(marker), "Python signal cleanup left its lock"
    finally:
        cleanup(child)


def bidirectional_pipes():
    payload = bytes(range(256)) * 1024
    child = sp.Popen([sys.executable, "-c",
                      "import sys\nwhile data := sys.stdin.buffer.read(4096):\n"
                      " sys.stdout.buffer.write(data); sys.stdout.buffer.flush()\n"
                      " sys.stderr.buffer.write(data); sys.stderr.buffer.flush()"],
                     stdin=sp.PIPE, stdout=sp.PIPE, stderr=sp.PIPE, close_fds=False)
    try:
        output, error = child.communicate(payload, timeout=15)
        assert child.returncode == 0
        assert output == payload and error == payload, "pipe bytes were lost"
    finally:
        cleanup(child)


def descriptor_inheritance():
    descriptor = os.open(root + "/inherited", os.O_RDWR | os.O_CREAT | os.O_TRUNC)
    duplicate = os.dup(descriptor)
    reader, writer = os.pipe()
    descriptors = (descriptor, duplicate, reader, writer)
    try:
        assert all(not os.get_inheritable(fd) for fd in descriptors)
        os.write(descriptor, b"offset")
        os.lseek(descriptor, 0, os.SEEK_SET)
        os.set_inheritable(descriptor, True)
        assert not os.get_inheritable(duplicate), "descriptor flags were shared by dup"
        probe = (
            "import errno, os, sys\n"
            "for fd in map(int, sys.argv[1:]):\n"
            " try: print(fd, int(os.get_inheritable(fd)))\n"
            " except OSError as e:\n"
            "  assert e.errno == errno.EBADF\n"
            "  print(fd, 'closed')\n"
        )
        for options, inherited in (({"close_fds": False}, {descriptor}),
                                    ({}, set()), ({"pass_fds": (duplicate, duplicate)}, {duplicate})):
            result = sp.run([sys.executable, "-c", probe, *map(str, descriptors)],
                            stdout=sp.PIPE, stderr=sp.PIPE, text=True, check=True, timeout=10,
                            **options)
            expected = [f"{fd} {'1' if fd in inherited else 'closed'}" for fd in descriptors]
            assert result.stdout.splitlines() == expected, (options, result.stdout, result.stderr)
        result = sp.run([sys.executable, "-c",
                         "import os,sys; fd=int(sys.argv[1]); "
                         "assert os.get_inheritable(fd); assert os.read(fd,2)==b'of'", str(duplicate)],
                        pass_fds=(duplicate,), timeout=10)
        assert result.returncode == 0
        assert os.lseek(descriptor, 0, os.SEEK_CUR) == 2, "inherited files did not share their offset"
        assert os.get_inheritable(descriptor) and not os.get_inheritable(duplicate)
        with warnings.catch_warnings(record=True) as recorded:
            warnings.simplefilter("always")
            result = sp.run([sys.executable, "-c", probe, str(descriptor), str(duplicate)],
                            close_fds=False, pass_fds=(duplicate,), capture_output=True,
                            text=True, check=True, timeout=10)
            assert result.stdout.splitlines() == [f"{descriptor} closed", f"{duplicate} 1"]
            assert any("pass_fds overriding close_fds" in str(item.message) for item in recorded)
    finally:
        for fd in descriptors:
            os.close(fd)


def descriptor_errors():
    def available_pipe():
        pair = os.pipe()
        for fd in pair:
            os.close(fd)
        return pair

    before = available_pipe()
    cases = [({"pass_fds": (fd,)}, exception)
             for fd, exception in ((-1, ValueError), (1.5, ValueError), ("1", ValueError),
                                   (1 << 40, ValueError), (255, OSError))]
    cases.append(({"stdin": -4}, OSError))
    for options, exception in cases:
        try:
            child = sp.Popen([sys.executable, "-c", "pass"],
                             **({"stdin": sp.PIPE, "stdout": sp.PIPE, "stderr": sp.PIPE} | options))
        except exception as error:
            if isinstance(error, OSError):
                assert error.errno == errno.EBADF, error
        else:
            cleanup(child)
            raise AssertionError("invalid descriptors accepted: " + repr(options))
        assert available_pipe() == before, "failed spawn leaked pipe descriptors"


def descriptor_stdio():
    probe = (
        "import errno,os,sys\n"
        "try: os.fstat(0)\n"
        "except OSError as e:\n"
        " assert e.errno==errno.EBADF\n"
        " assert sys.argv[1]=='closed'\n"
        "else: assert sys.argv[1]=='open' and os.get_inheritable(0)\n"
    )
    driver = (
        "import errno,os,subprocess as s,sys\n"
        "probe=sys.argv[1]\n"
        "os.set_inheritable(0,False)\n"
        "for options,state in (({},'closed'),({'stdin':0},'open'),({'pass_fds':(0,)},'open')):\n"
        " s.run([sys.executable,'-c',probe,state],check=True,timeout=10,**options)\n"
        " assert not os.get_inheritable(0)\n"
        "r=s.run([sys.executable,'-c','print(42)'],pass_fds=(1,),stdout=s.PIPE,text=True,timeout=10)\n"
        "assert r.returncode==0 and r.stdout=='42\\n'\n"
        "os.close(0)\n"
        "s.run([sys.executable,'-c',probe,'closed'],check=True,timeout=10)\n"
        "try: s.Popen([sys.executable,'-c','pass'],stdin=0)\n"
        "except OSError as e: assert e.errno==errno.EBADF\n"
        "else: raise AssertionError('explicit closed stdin accepted')\n"
    )
    result = sp.run([sys.executable, "-c", driver, probe], stdin=sp.DEVNULL,
                    stdout=sp.PIPE, stderr=sp.PIPE, timeout=45, text=True)
    assert result.returncode == 0, (result.stdout, result.stderr)
    result = sp.run([sys.executable, "-c", "import os; os.write(1,b'out'); os.write(2,b'err')"],
                    stdout=sp.PIPE, stderr=sp.STDOUT, close_fds=False, timeout=10)
    assert result.returncode == 0 and result.stdout == b"outerr"


def meson_compiler_probe():
    child = sp.Popen(["cc", "--version"], close_fds=False, stdin=sp.PIPE,
                     stdout=sp.PIPE, stderr=sp.PIPE, universal_newlines=True)
    try:
        output, error = child.communicate(timeout=15)
        assert child.returncode == 0 and output.strip(), (child.returncode, output, error)
    finally:
        cleanup(child)


def status_and_options():
    result = sp.run(["/bin/slop", "-c", "exit 130"])
    assert result.returncode == 130, "normal exit was mistaken for a signal"
    result = sp.run(['printf "%s:%s" "$0" "$1"', "zero", "one"], shell=True, executable="/bin/slop",
                    capture_output=True, text=True)
    assert result.returncode == 0 and result.stdout == "zero:one"
    child = sp.Popen(["/bin/pwd"], cwd=root, stdout=sp.PIPE, text=True)
    try:
        assert child.communicate(timeout=5)[0].strip() == root
    finally:
        cleanup(child)
    try:
        sp.Popen(["/bin/pwd"], cwd=root + "/missing")
        raise AssertionError("missing cwd accepted")
    except FileNotFoundError:
        pass
    try:
        sp.Popen(["/bin/pwd", "bad\0argument"])
        raise AssertionError("embedded NUL argument accepted")
    except ValueError:
        pass
    for options in ({"start_new_session": True}, {"preexec_fn": lambda: None},
                    {"pipesize": 4096, "stdin": sp.PIPE}):
        try:
            child = sp.Popen(["/bin/slop", "-c", "exit 0"], **options)
        except NotImplementedError:
            continue
        cleanup(child)
        raise AssertionError("unsupported options accepted: " + repr(options))


for name, operation in (
    ("interactive stdin terminal mode round-trip", terminal_modes),
    ("observable start, PID, nonblocking poll and terminate", starts_before_wait),
    ("creation-time cwd/environment and explicit environment", creation_state),
    ("streaming, non-destructive wait timeout and kill", streaming_and_timeout),
    ("Python signal handler cleanup", signal_cleanup),
    ("communicate drains simultaneous bounded stdin/stdout/stderr", bidirectional_pipes),
    ("descriptor flags, inheritance, pass_fds and shared offsets", descriptor_inheritance),
    ("invalid descriptors and failed spawn cleanup", descriptor_errors),
    ("inherited versus explicit stdio, pass_fds overrides and merged output", descriptor_stdio),
    ("Meson close_fds=False compiler probe", meson_compiler_probe),
    ("normal status and explicit unsupported options", status_and_options),
):
    check(name, operation)
if failures:
    raise AssertionError(f"{len(failures)} Python process groups failed")
print("PYTHON-PROCESS-OK")
