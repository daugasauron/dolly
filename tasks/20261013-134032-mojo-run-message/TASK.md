# mojo run's refusal says what to type instead

- STATUS: OPEN
- PRIORITY: 200
- TAGS: toolchain,mojo,demo

Owner (2026-10-13), after deciding that `mojo run` stays refused
([mojo run](../20261013-133400-mojo-run/TASK.md)): "Change/create new task to
make the error message more descriptive."

Done when: `mojo run NAME.mojo` and `mojo NAME.mojo` say in a sentence why
they cannot work here and print the line that does the same for the file
named, and the port's patch is no more than that message; checked in the
`mojo-gpu` image and after `amy install mojo`.

## As filed (2026-10-13, main `7ab3f1f2`)

- Today, one hunk of six lines in `demos/mojo/mojo-dolly.patch`
  (`Mojo/tools/mojo/Run/mojo-run.cpp`, before the arguments are parsed):
  ``error: `mojo run` compiles and executes a program in one process, which
  WebAssembly does not allow; build it with `mojo build` ``. It names
  neither the file nor the second step, and "does not allow" does not say
  what is missing.
- Proposed text, for `mojo run yeah.mojo`:

  ```
  error: `mojo run` is not available here: it runs a program through a JIT,
  and a WebAssembly process cannot execute code it has just generated.
  Build the program, then start it:
    mojo build yeah.mojo && ./yeah
  ```

- The owner wants few patches: the hunk stays one hunk in the file the port
  already changes, and takes the file's name from the arguments only if
  that needs no more of upstream's code than the refusal has now; otherwise
  it prints the line with `NAME.mojo`.
- `mojo repl` and `mojo debug` fail with upstream's own words (no LLDB) and
  are not patched; they stay so.
- Cost: `mojo-build` again (12 minutes), then `mojo` and `mojo-gpu`; no
  catalog round. Worth doing with the next change that rebuilds
  `mojo-build`, not for itself.
