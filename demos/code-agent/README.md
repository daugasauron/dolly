# code-agent

Runs Claude Code, Anthropic's command-line coding agent, unchanged under
Janis ([JavaScript](../javascript/README.md)) in a session of `system`,
`javascript` and `ripgrep`. Claude Code is Anthropic's software under its
[Commercial Terms](https://code.claude.com/docs/en/legal-and-compliance), not
part of Dolly: nothing of it is in this repository, in the image or on the
sites ([licences](../../docs/licences.md)).

## Images

- `code-agent`: runs Claude Code, downloaded from npm into the session after a notice of its terms.

Open `/code-agent/`; build with `npm run image -- code-agent`. Leave Claude
Code's REPL with `/exit` (Ctrl+C and Ctrl+D do not end it here).

## How it works

- The image opens on `/usr/share/doc/code-agent/NOTICE`, every time: who owns
  the software, what continuing downloads, where requests go, and the limits.
  Any key continues; Ctrl+C leaves for the recovery shell without a download.
- `/usr/bin/code-agent` then fetches `@anthropic-ai/claude-code` 2.1.112
  (18.7 MB, the last release that is JavaScript; later ones are native
  executables) from `registry.npmjs.org` through the HTTP broker, checks the
  tarball's SHA-256 with `sha256sum`, unpacks it to `/opt/claude-code` and
  runs `cli.js` as published with `USE_BUILTIN_RIPGREP=0`, so its Grep and
  Glob tools use the session's `rg`. A session that already holds the package
  starts it without a download. Arguments pass through: `code-agent -p …`.
- Claude Code's own onboarding runs: no `~/.claude.json` is written by the
  image, no sign-in method is removed or hidden, no key and no relay ship.
  To use an API key: Ctrl+C at the notice, `export ANTHROPIC_API_KEY=…`, then
  `code-agent -p 'your request'`. Credentials and conversations live in
  `/home/dolly/.claude*`; a saved or exported session contains them and the
  downloaded package.
- Requests go from the browser to `api.anthropic.com`; the public sites set
  no policy and no relay, so nothing of them passes through the site. Its
  Messages requests carry `anthropic-dangerous-direct-browser-access`, which
  Anthropic's CORS preflight requires from a browser.

## Key files

- [`Dollyfile-code-agent`](Dollyfile-code-agent): the recipe, the notice,
  `anykey` and the launcher.
- Tests: [`test/`](test/).

## Limits

- No Bash tool: Claude Code wants a shell named `bash` or `zsh`, and Slop is
  neither; Read, Write, Edit, Grep and Glob work.
- The interactive start (`code-agent` without arguments) ends at Claude
  Code's own "Unable to connect to Anthropic services": its first-run check
  fetches `api.anthropic.com/api/hello` and `platform.claude.com/v1/oauth/hello`,
  which send no CORS headers, so a browser cannot read them. The sign-in
  methods behind that check are therefore unreachable here, and both account
  methods would first need a `localhost` callback listener Janis does not
  have. The test answers the check from its fixture to drive the rest of the
  onboarding and the REPL; the [task](../../tasks/20261007-085236-claude-code-image/TASK.md)
  records each method's behaviour per browser.
- Anthropic or npm may stop serving 2.1.112; the image then stops working.

Test: `npm run test:demos -- code-agent` ([`test/`](test/)). It downloads the
tarball into `build/claude-code-cache/` (never committed) and fails when it
cannot.
