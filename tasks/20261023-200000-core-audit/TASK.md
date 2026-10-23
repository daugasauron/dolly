# Audit of the core after the 0.1.4 work: small and well thought out

- STATUS: OPEN
- PRIORITY: 280
- TAGS: core,audit,architecture,0.1.4

Owner (2026-10-23): "go ahead and audit stuff its very important to keep the core small and
well thought out", after "llvm should always be useful?" on the seed compiler's report that
the `llvm` package now duplicates `cc` and that the recipes building the core's compiler live
in `demos/`.

What changed today and is audited: the host registry from the embedding and device modules
that import only their own files (`main`); `boot()`, images under their own base and the npm
packages (`main`); `touch@0` replacing `buttons@0` (`core/touch-module`); the seed taking the
compiler built in Dolly (`core/seed-compiler`); the environment audit's fixes
(`core/audit-fixes`, in progress); the Janis installer (`demo/janis-install`).

Done when: the findings are in `audit.md` here, each fixed before the 0.1.4 round where the
fix is clear, or one line for the owner where it is a decision.
