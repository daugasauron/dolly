# closed-source-agent

Runs Claude Code, Anthropic's command-line coding agent, unchanged under
Janis ([JavaScript](../javascript/README.md)) in a session of `system`,
`javascript` and `ripgrep`. Claude Code is Anthropic's software under its
[Commercial Terms](https://code.claude.com/docs/en/legal-and-compliance), not
part of Dolly, which is not affiliated with Anthropic: nothing of it is in
this repository, in the image or on the sites ([licences](../../docs/licences.md)).

## Images

- `closed-source-agent`: runs Claude Code, downloaded from npm into the session after a notice of its terms.

Open `/closed-source-agent/`; build with `npm run image -- closed-source-agent`.
Leave Claude Code's REPL with `/exit` (Ctrl+C and Ctrl+D do not end it here).

## How it works

- The image opens on `/usr/share/doc/closed-source-agent/NOTICE`: who owns the
  software, what continuing downloads, where requests go, and the limits.
  Nothing is requested until one key chooses:
  - Enter, or any other key, starts Claude Code with its own `--bare` flag
    and your API key. When `ANTHROPIC_API_KEY` is not set, the launcher asks
    for the key once without showing it, and `secretenv` sets it in the
    environment of that one Claude Code process: it passes through no file,
    log or shell variable. Enter alone starts `--bare` without a key.
  - `p` starts Claude Code as published, without any flag.
  - Ctrl+C, here or at the key prompt, leaves without starting Claude Code.
- `/usr/bin/closed-source-agent` fetches `@anthropic-ai/claude-code` 2.1.112
  (18.7 MB, the last release that is JavaScript; later ones are native
  executables) from `registry.npmjs.org` through the HTTP broker, checks the
  tarball's SHA-256 with `sha256sum`, unpacks it to `/opt/claude-code` and
  runs `cli.js` as published with `USE_BUILTIN_RIPGREP=0`, so its Grep and
  Glob tools use the session's `rg`. A session that already holds the package
  starts it without a download.
- Arguments pass through unchanged: `closed-source-agent -p 'request'` with
  `ANTHROPIC_API_KEY` exported is print mode. With arguments the notice shows
  only while the package must still be downloaded.
- The image writes no `~/.claude.json`, removes or hides no sign-in method,
  and ships no key and no relay. What Claude Code stores lives in
  `/home/dolly/.claude*`: after "Yes" to its question about the key, the
  key's last 20 characters in `.claude.json`. A saved or exported session
  contains that and the downloaded package.
- Requests go from the browser to `api.anthropic.com`; the public sites set
  no policy and no relay, so nothing of them passes through the site. Its
  Messages requests carry `anthropic-dangerous-direct-browser-access`, which
  Anthropic's CORS preflight requires from a browser. Its other requests
  (settings, policy limits, event logging, and its plugin marketplace on
  `downloads.claude.ai` and `github.com`) fail in a browser for want of CORS
  headers: the REPL shows "Failed to install Anthropic marketplace".

## Key files

- [`Dollyfile-closed-source-agent`](Dollyfile-closed-source-agent): the
  recipe, the notice, `anykey`, `secretenv` and the launcher.
- Tests: [`test/`](test/).

## Limits

- `--bare` is Claude Code's "Minimal mode: skip hooks, LSP, plugin sync,
  attribution, auto-memory, background prefetches, keychain reads, and
  CLAUDE.md auto-discovery … Anthropic auth is strictly ANTHROPIC_API_KEY or
  apiKeyHelper". It offers the model three tools, Bash, Edit and Read;
  without the flag, as in print mode, Claude Code offers nine, Write, Grep
  and Glob among them.
- The Bash tool answers "No suitable shell found": Claude Code wants a shell
  named `bash` or `zsh`, and Slop is neither.
- A wrong key shows the API's 401 only after Claude Code's own retries, about
  three minutes; `export CLAUDE_CODE_MAX_RETRIES=1` before starting shortens
  that.
- Signing in with a Claude or Console account does not work. Started as
  published (`p`), Claude Code ends at its own "Unable to connect to
  Anthropic services": its first-run check fetches
  `api.anthropic.com/api/hello` and `platform.claude.com/v1/oauth/hello`,
  which send no CORS headers, so a browser cannot read them. `--bare` runs no
  such check, and without a key its REPL answers "Not logged in · Please run
  /login"; `/login` there offers both account methods, which stop at "Failed
  to start OAuth callback server": Janis has no listening sockets. The
  [task](../../tasks/20261007-085236-claude-code-image/TASK.md) records each
  start's behaviour per browser.
- Anthropic or npm may stop serving 2.1.112; the image then stops working.

Test: `npm run test:demos -- closed-source-agent` ([`test/`](test/)). It
downloads the tarball into `build/claude-code-cache/` (never committed) and
fails when it cannot.
