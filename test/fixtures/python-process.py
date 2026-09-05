import os
import signal
import subprocess as sp
import sys
import time

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


def bidirectional_pipes():
    payload = bytes(range(256)) * 1024
    child = sp.Popen([sys.executable, "-c",
                      "import sys\nwhile data := sys.stdin.buffer.read(4096):\n"
                      " sys.stdout.buffer.write(data); sys.stdout.buffer.flush()\n"
                      " sys.stderr.buffer.write(data); sys.stderr.buffer.flush()"],
                     stdin=sp.PIPE, stdout=sp.PIPE, stderr=sp.PIPE)
    try:
        output, error = child.communicate(payload, timeout=15)
        assert child.returncode == 0
        assert output == payload and error == payload, "pipe bytes were lost"
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
    for options in ({"start_new_session": True}, {"pass_fds": (0,)},
                    {"close_fds": False}, {"pipesize": 4096, "stdin": sp.PIPE}):
        try:
            child = sp.Popen(["/bin/slop", "-c", "exit 0"], **options)
        except NotImplementedError:
            continue
        cleanup(child)
        raise AssertionError("unsupported options accepted: " + repr(options))


for name, operation in (
    ("observable start, PID, nonblocking poll and terminate", starts_before_wait),
    ("creation-time cwd/environment and explicit environment", creation_state),
    ("streaming, non-destructive wait timeout and kill", streaming_and_timeout),
    ("communicate drains simultaneous bounded stdin/stdout/stderr", bidirectional_pipes),
    ("normal status and explicit unsupported options", status_and_options),
):
    check(name, operation)
if failures:
    raise AssertionError(f"{len(failures)} Python process groups failed")
print("PYTHON-PROCESS-OK")
