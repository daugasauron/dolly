# Core polish: no workarounds

- STATUS: OPEN
- PRIORITY: 345
- TAGS: core,audit,cleanup

Owner direction (2026-10-01): no workarounds in the core; maximum polish. Audit
the kernel, process ABI and libc adapter, host modules, supervisor and page
shell, compiler driver and build scripts for special cases, compatibility
shims, duplicated mechanisms, test-only surface and stale comments, and remove
them.

## Done when

- Each finding is fixed or recorded with a reason it must stay; source,
  artifact and browser suites pass.
