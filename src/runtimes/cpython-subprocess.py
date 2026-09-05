"""Upstream Popen with Dolly spawn; pipes, waits and signals use Dolly libc."""

import errno
import os
import subprocess as _subprocess

import _dolly_process

# subprocess deliberately skipped importing native fork_exec on this target.
# Its destructor-safe references still need the actual in-Wasm POSIX functions.
for _name in ("waitpid", "waitstatus_to_exitcode", "WIFSTOPPED", "WSTOPSIG", "WNOHANG"):
    setattr(_subprocess._del_safe, _name, getattr(os, _name))


class Popen(_subprocess.Popen):
    def _get_handles(self, stdin, stdout, stderr):
        if self.pipesize > 0:
            raise NotImplementedError("Dolly pipes have a fixed capacity")
        return super()._get_handles(stdin, stdout, stderr)

    def _execute_child(self, args, executable, preexec_fn, close_fds,
                       pass_fds, cwd, env, startupinfo, creationflags, shell,
                       p2cread, p2cwrite, c2pread, c2pwrite, errread, errwrite,
                       restore_signals, gid, gids, uid, umask,
                       start_new_session, process_group):
        if preexec_fn is not None or not close_fds or pass_fds or \
                startupinfo is not None or creationflags or start_new_session or \
                gid is not None or gids is not None or uid is not None or \
                umask != -1 or process_group != -1:
            raise NotImplementedError(
                "Dolly spawn supports stdio, cwd and environment, not identity/session controls or inherited extra FDs"
            )
        arguments = ([os.fsdecode(args)] if isinstance(args, (str, bytes, os.PathLike))
                     else [os.fsdecode(value) for value in args])
        if not arguments:
            raise ValueError("process argument list is empty")
        if shell:
            arguments = [os.fsdecode(executable) if executable is not None else "/bin/slop",
                         "-c", *arguments]
        program = os.fsdecode(executable) if executable is not None else arguments[0]
        directory = os.getcwd() if cwd is None else os.path.abspath(os.fsdecode(cwd))
        environment = {os.fsdecode(key): os.fsdecode(value)
                       for key, value in (os.environ if env is None else env).items()}
        if any("=" in key or "\0" in key or "\0" in value for key, value in environment.items()):
            raise ValueError("invalid environment entry")
        if "/" not in program:
            # Executability is the Wasm ABI, not permission bits.
            for entry in environment.get("PATH", os.defpath).split(os.pathsep):
                candidate = os.path.join(directory, entry, program)
                if os.path.isfile(candidate):
                    program = candidate
                    break
            else:
                raise FileNotFoundError(errno.ENOENT, os.strerror(errno.ENOENT), program)
        else:
            program = os.path.join(directory, program)
        self.pid = _dolly_process.spawn(
            program, arguments, [f"{key}={value}" for key, value in environment.items()],
            directory, p2cread if p2cread != -1 else 0,
            c2pwrite if c2pwrite != -1 else 1, errwrite if errwrite != -1 else 2,
        )
        self._child_created = True
        self._close_pipe_fds(p2cread, p2cwrite, c2pread, c2pwrite, errread, errwrite)
