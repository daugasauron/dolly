# Dollyfile Studio

Write, lint and build Dollyfiles with Pi, local models and Neovim. Builds use the
core `build@0` service ([Studio builds](../../docs/image-build-service.md)).

## Images

- `dollyfile-studio`: Create images with Pi, local models and Neovim.

Open `/dollyfile-studio/`. `dollyfile-lint FILE` checks one file's syntax;
`dollyfile-build /workspace/Dollyfile` builds it in a disposable sandbox and
streams the log; **Open image** runs the result. In Neovim, directives are
highlighted and lint errors refresh on edit; `:DollyLint` checks at once.

Key files: [`Dollyfile-dollyfile-studio`](Dollyfile-dollyfile-studio), [`lint.mjs`](lint.mjs),
[`build.mjs`](build.mjs), the Pi skill in [`skills/dollyfiles/`](skills/dollyfiles/SKILL.md),
and [`nvim/`](nvim/). The agent reads `docs/dollyfile.md` from the `dolly-docs`
package its base installs, at `/usr/share/doc/dolly/docs/`.

Test: `npm run test:demos -- studio` ([`test/`](test/)).
