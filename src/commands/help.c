#include <stdio.h>
#include <string.h>

int main(int argc, char **argv) {
  if (argc > 2 || (argc == 2 && strcmp(argv[1], "--help") != 0)) {
    fputs("usage: help\n", stderr);
    return 2;
  }
  fputs("Slop is Dolly's shell: POSIX-like, not Bash\n", stdout);
  fputs("commands are files on PATH (echo $PATH): ls /bin /usr/bin lists them; man NAME prints a command's page and NAME --help its usage (ls /usr/share/man/cat1 /usr/share/man/man1 lists the pages)\n", stdout);
  fputs("the platform is described in /usr/share/doc/dolly/docs: slop.md is the shell language, process-model.md processes and their limits; amy install dolly-docs brings the directory to an image without it\n", stdout);
  fputs("not supported: job control (jobs, fg, bg), aliases, umask, ulimit, brace expansion {a,b}, ${VAR/a/b}, ${VAR:1:2}, $'...'; a glob that matches nothing stays as typed\n", stdout);
  fputs("pipelines: programs run at the same time, so seq 1 999999999 | head -n1 ends at once; a builtin, function or compound stage finishes before the next stage reads its output\n", stdout);
  fputs("background: PROGRAM & and a | b & start programs; $! is the last PID; wait [PID...] collects them; wrap anything else as slop -c '...' &\n", stdout);
  fputs("one user and no permission bits: the modes ls -l prints are fixed and nothing checks them; there is no chmod, chown, id, whoami, ps or df, and install -m changes nothing\n", stdout);
  fputs("limits: 256 descriptors and 8 GiB of memory per process, 32 processes, 16 threads per process (64 in all), 64 KiB pipes; getrlimit reports them\n", stdout);
  fputs("a program that exits 126 was refused or failed: its stderr says why\n", stdout);
  return 0;
}
