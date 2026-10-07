# An image that downloads and runs Claude Code, opening on a notice of its terms and limits

- STATUS: OPEN
- PRIORITY: 320
- TAGS: javascript,janis,agent,demo,licence

Owner (2026-10-07): "It should be ok licence wise to have an image that can
download it and run it?" Then: "Add a high priority task to add claude code,
the task should mention these license issues, I think if someone launches that
image first show a start screen with this analysis or something that you can
just press any key to close", and then the application starts.

Owner (2026-10-07, after the first build): "My idea with claude was that it
would be possible to start the application at least to see the TUI. Ideally
some kind of api-key login flow can work… I want the name in dolly to be
closed-source-agent."

## What exists

From `20261005-133044-claude-code` (closed; its commands and the ten Janis
gaps are there):

- The last release that is JavaScript is 2.1.112 (2026-04-16): tarball
  18.7 MB, integrity
  `sha512-9FUgJ0EOvILyhIqxFKNVliebiUjL68dwpEW3eGSSe0vkVDJ1c5qMDNWc22gW3zkD7zRAqtfQPSGv0t4vMM2DPA==`.
  Later releases are native executables that nothing in Dolly can run.
- Under Janis in Chromium (2026-10-06): the interface rendered and a file-tool
  turn completed against a scripted Messages endpoint; an invalid key drew a
  401 from `api.anthropic.com`. A real model answered only on a native host
  build of Janis. Download and unpack 5.7 s, `--version` 4.5 s.
- No Bash tool: Claude Code wants a shell named bash or zsh, and that task's
  decision not to call Slop bash stands.
- Not tested: Firefox, signing in with a Claude account, a real model in a
  browser. The October driver was not committed, no test in the repo covers
  Claude Code, and Janis has changed since.

## Licence (read 2026-10-07; an engineering reading, not legal advice)

The package's `LICENSE.md`: "© Anthropic PBC. All rights reserved. Use is
subject to the Legal Agreements outlined here:
https://code.claude.com/docs/en/legal-and-compliance."

That page, under "Can customers offer Claude Code in their products?":
"preinstalling or running Claude Code in your products or services (e.g. in
hosted sandboxes or other agent infrastructure) requires agreeing to our
Commercial Terms of Service and complying with the conditions below". Each
condition, and what it means for this image:

1. "The Claude Code binary must not be modified. Claude Code must be installed
   and run as published by Anthropic". The image and the site hold no byte of
   the package. The launcher fetches the pinned tarball from
   `registry.npmjs.org` after the user continues, checks its integrity and
   runs it unedited. A gap is fixed in Janis as general Node behaviour, never
   by patching the package (the earlier task's rule: no Claude-specific code
   in the core or in Janis).
2. "customers may not remove, disable, or restrict any authentication method
   built into it (including methods that permit signing in with a Claude
   account or the user's own API key)". The image writes no `~/.claude.json`,
   skips no onboarding and sets nothing that hides a login method. The October
   run pre-wrote that file; this image must not. A method that cannot work
   here fails with Claude Code's own message. The notice's default key starts
   Claude Code with its own published `--bare` flag; the start as published
   is the other key on the same screen (see the open readings).
3. "Customers may not pay for, resell, or intermediate Claude usage on their
   end users' behalf." No relay (`131e2120` removed the last one), no shared
   key, no key in the image, the tests or the evidence. Requests go from the
   user's browser to Anthropic through the broker, which "never stores,
   injects or rewrites credentials" (`docs/http.md`).
4. "You can accurately say, in plain text, that your product has Claude Code
   preinstalled or that it runs Claude Code. But you can't use the Claude Code
   or Anthropic names or logos as part of your own product, feature, or
   company name". No logo. The catalog line and README say in plain text that
   the image runs Claude Code. The image and its route have a neutral name,
   `closed-source-agent`, the owner's choice.
5. From "Authentication and credential use": developers "may not collect,
   store, or intermediate Claude.ai credentials or session tokens", and
   nothing prevents "an end user from signing in to the unmodified Claude Code
   binary with their own Claude subscription, including where a platform hosts
   Claude Code". Credentials are files in the user's session. A save keeps
   them in that browser profile and an exported `.dolly-session` file holds
   them unencrypted, with the downloaded package (`docs/sessions.md`).

Open readings:

- "Run as published": it is published for Node 18 or later and runs here on
  Janis. The bytes are untouched.
- The page does not speak of old releases. Anthropic or npm may stop serving
  2.1.112, and the image then stops working.
- The page gives a sales contact for questions about a use case.
- `--bare` as the default key of the notice: in that mode Claude Code itself
  reads no account sign-in ("Anthropic auth is strictly ANTHROPIC_API_KEY or
  apiKeyHelper … OAuth and keychain are never read", its `--help`). The image
  removes nothing: `p` on the same screen starts it as published, arguments
  pass through unchanged, and `/login` is offered inside the `--bare` REPL.
  The integrator's decision is that offering a choice among Claude Code's own
  published modes restricts no method; the owner may read it otherwise.

**Owner:** confirm that Anthropic's Commercial Terms are accepted (an API
Console account normally has), and supply a funded API key for the one real
run. The key is never committed, logged or shown in a screenshot.

## Start screen

The launcher shows a notice before anything is downloaded, whenever it runs
without arguments (so every time the image opens) and, with arguments, while
the package is still to be downloaded. One key chooses:

- Enter, or any other key: download, integrity check, and Claude Code starts
  in its own `--bare` mode with the user's API key. When `ANTHROPIC_API_KEY`
  is not set the launcher asks for it once, without echo, and passes it only
  in that Claude Code process's environment; an empty answer starts `--bare`
  without a key.
- `p`: the same download, and Claude Code starts as published.
- Ctrl+C: the image ends without downloading.

With arguments (`closed-source-agent -p '…'`, `--version`, `--bare`, …) the
launcher passes them through unchanged, and once the package is present it
runs directly, without the notice or a key.

Facts the notice carries, on one screen (the wording is the builder's):

- Claude Code is Anthropic's software and not part of Dolly, which is not
  affiliated with or endorsed by Anthropic.
- Continuing downloads Claude Code 2.1.112 (April 2026, 18.7 MB) from the npm
  registry into this browser session. Its use is under Anthropic's terms, with
  the URL above.
- The interface works with the user's own API key through `--bare`, and what
  that mode leaves out. Usage is billed to the user. Requests go from this
  browser to Anthropic; the site serving Dolly does not receive them.
- Account sign-in does not work in a browser; print mode does.
- A saved or exported session contains the sign-in and the package.
- Limits here: an old release, run on Janis instead of Node, no working Bash
  tool.

## Work

1. Rerun the October procedure on current main in Chromium and Firefox. Fix
   regressions as Janis gaps with oracle cases.
2. The demo directory: recipe on `system` with `javascript` and `ripgrep`
   installed, the launcher and notice as the image's ENTRY, README, test, and
   a row in `docs/licences.md` saying that nothing of Claude Code is served.
3. Run Claude Code's own onboarding unassisted, with an API key and with a
   Claude account, in both browsers. Record what works; the notice names what
   does not.
4. A browser test without a model or a key: a scripted Messages endpoint on
   the test origin, as in October. Decide how the test obtains the tarball
   without committing it.
5. One real turn in a browser with the owner's key.

## Done when

- In Chromium and Firefox the image opens on the notice, no request for the
  package leaves before a key is pressed (the test asserts the request, not
  the wording), and after a key Claude Code completes a file-tool turn against
  the fixture.
- The sealed image and the packaged release contain no file of the package.
- One real-model turn in a browser is recorded here, without the key.
- Each condition above has its evidence line here, and the sign-in methods
  that work are listed per browser.

## Builder's log (2026-10-07, branch `demo/claude-code` from `0cece355`)

The first build, to `89bc7a2f`; the rework below changed the name, the start
flow, the notice and the test.

Decisions:

- Name: `closed-source-agent`, the owner's (directory
  `demos/closed-source-agent`, recipe `Dollyfile-closed-source-agent`, route
  `/closed-source-agent/`). The first build was called `code-agent`.
- The tarball is never in git or in an image. The browser test downloads it
  from `registry.npmjs.org` at test time into the untracked
  `build/claude-code-cache/claude-code-2.1.112.tgz`, checks npm's sha512, and
  serves it to the page from the test origin in place of the registry; the
  test fails when it cannot obtain it. The launcher pins the SHA-256 of the
  same bytes, `84379969ea53a0e5fd231a8f77debe4c7cb17dd971f4809d10d33f9aeca5de09`
  (18,679,326 bytes; `sha256sum` is in `system`, no SHA-512 tool is), checked
  with the session's `sha256sum` before anything is unpacked.
- Launcher: a Slop script `/usr/bin/closed-source-agent` (notice from
  `/usr/share/doc/closed-source-agent/NOTICE`, `anykey` for the key, `curl`,
  `sha256sum`, `gzip`, `tar`, then `janis …/cli.js`). `anykey` is a 20-line
  C program in the recipe that puts the terminal in raw mode and reads one
  byte; Ctrl+C is status 130, and the image's `init.slop` then enters the
  recovery shell, as `pi` does, so a user can `export ANTHROPIC_API_KEY=…`
  and run `closed-source-agent` again. Only `USE_BUILTIN_RIPGREP=0` is set
  (the vendored `rg` cannot run on wasm64; Grep and Glob need the session's
  `rg`); nothing else of Claude Code's environment is changed.

Step 1, Chromium (`javascript` image of main `0cece355`, session
`system` + `javascript` + `ripgrep`, 2026-10-07 10:46 UTC): download from the
real registry 2.6 s, unpack 1.8 s, `--version` 2.3 s, `--help` 2.3 s.
Regression found: every Messages request failed with "Unable to connect to
API" after a 200 response. Cause, found by probing the thrown error in the
session: Claude Code's stream watchdog wraps the response body with
`body.pipeThrough(new TransformStream({ start, transform, flush }))`, and
Janis's `ReadableStream` had no `pipeThrough` while its `TransformStream`
ignored its transformer. Fixed as general Node behaviour in `janis.js`
(`pipeTo`, `pipeThrough`, a `WritableStream` that runs its sink in order, a
`TransformStream` with `start`/`transform`/`flush` and a controller with
`enqueue`/`error`/`terminate`); oracle group `webStreams` in
`node-oracle.mjs` (identical in Node 22 and Janis natively). With it the
`-p` file-tool turn against the scripted endpoint completed in 2.8 s.
A made-up key against the real `api.anthropic.com` drew the 401
`authentication_error: API key is invalid` in 4.3 s (`CLAUDE_CODE_MAX_RETRIES=1`
typed for the run; the image sets nothing). Claude Code's bundled SDK client
is constructed with `dangerouslyAllowBrowser: true`, so its Messages requests
carry `anthropic-dangerous-direct-browser-access: true`, and only with that
header does Anthropic's preflight answer `access-control-allow-origin: *`
(measured with curl and an `Origin` header, 2026-10-07 11:05 UTC).

Step 1, Firefox (same session, 2026-10-07 11:58 UTC): download from the real
registry 2.5 s, unpack 2.8 s, `--version` 3.3 s, `--help` 3.3 s; the hello
endpoints fail through the broker exactly as in Chromium (curl 7, EIO).

Step 3, the onboarding (measured 2026-10-07, Chromium; Firefox below): an
interactive start without `~/.claude.json` shows the welcome screen and then
Claude Code's own connectivity check, `GET api.anthropic.com/api/hello`
followed by `GET platform.claude.com/v1/oauth/hello` with axios, each
required to answer 200. Neither endpoint sends
`access-control-allow-origin` (with or without the browser-access header), so
in a browser both fetches are blocked and Claude Code exits 1 with "Unable to
connect to Anthropic services / Failed to connect to api.anthropic.com". The
sign-in methods (Claude account, Console account) are never offered: the
check precedes them. The onboarding is skipped only when `~/.claude.json`
records `theme` and `hasCompletedOnboarding`, which the image never writes.
What works in a browser without that file is print mode,
`closed-source-agent -p …` with `ANTHROPIC_API_KEY` exported, which runs no
onboarding and no check (and, found in the rework, the `--bare` start).

With both hello endpoints answered 200 by a fixture (the test's setting, not
the real world), the onboarding continues and each screen was walked in
Chromium (`build/claude-code-evidence/chromium-walk-*`):

- With `ANTHROPIC_API_KEY` exported: theme → "Detected a custom API key …
  Do you want to use this API key? 1. Yes / 2. No (recommended)" (the
  default is No) → "Yes" → "Quick safety check … 1. Yes, I trust this
  folder" → the REPL ("Sonnet 4.6 · API Usage Billing"). A typed "Read
  /workspace/hello.txt and tell me what it says" showed "Read 1 file" and
  "The file says: DOLLY-FIXTURE-CONTENT" against the scripted endpoint
  (three Messages requests: a Haiku topic check without tools, then the two
  of the turn). The status line reads "Failed to install Anthropic
  marketplace" (its plugin registry fetch is not on the path).
- "No" to the key, or no key: "Select login method: 1. Claude account with
  subscription · 2. Anthropic Console account · 3. 3rd-party platform".
  Method 1 and 2 start an OAuth flow that first listens on `localhost` for
  the callback: Janis has no listening socket, so Claude Code shows "OAuth
  error: Failed to start OAuth callback server: Janis has no listening
  socket API. Press Enter to retry." before any URL is shown; its manual
  code path (`platform.claude.com/oauth/code/callback`) is never reached.
- Firefox (12:01 UTC, `firefox-walk-*`): the key path reaches the REPL and
  the same Read turn answers "The file says: DOLLY-FIXTURE-CONTENT"; methods
  1 and 2 both end on the same "OAuth error: Failed to start OAuth callback
  server" screen, where Escape, Ctrl+C (twice), Ctrl+D and `q` leave Claude
  Code running (a user reloads the tab); method 3 behaves as in Chromium.
  A made-up key in `-p` against the real `api.anthropic.com` drew the same
  401 from Firefox (5.9 s with one retry, `--debug-to-stderr`); one earlier
  run of it exited 0 after 33.5 s with empty output and did not recur.
- Method 3 opens the "Set up AWS Bedrock" wizard (AWS profile, Bedrock API
  key, access key, or credentials in the environment), then Foundry and
  Vertex: third-party providers outside this task, not followed further.
  On its text prompts Escape, Ctrl+C, Ctrl+D and `q` did not leave Claude
  Code (Chromium); a user closes the tab or reloads.

- Chromium, method 2 selected with the arrow key (12:10 UTC): the same
  OAuth callback server error as method 1.

Sign-in methods per browser as the first build found them, started as
published on the public site (no fixture): none of Claude Code's interactive
methods can start in Chromium or Firefox, because its connectivity check
exits first; `ANTHROPIC_API_KEY` in the environment with
`closed-source-agent -p …` works in both (the 401 from the real API proves
the request path). Behind the check (fixture): the key is accepted by the
onboarding and the REPL works in both; Claude account and Console account
both stop at the callback-server error in both; 3rd-party platforms are out
of scope.

## Rework (2026-10-07, from `89bc7a2f`): the interface with an API key

The integrator measured (Chromium, served checkout, real endpoints, 21:38
JST) that `janis /opt/claude-code/package/cli.js --bare` with a made-up
`ANTHROPIC_API_KEY` reaches the REPL without a fixture, and decided: the name
`closed-source-agent`; one notice and one key (Enter is `--bare` with a key,
`p` is as published, Ctrl+C leaves); the launcher asks for the key when
`ANTHROPIC_API_KEY` is not set; arguments pass through unchanged.

Implementation, all in `demos/closed-source-agent/Dollyfile-closed-source-agent`
(Janis and the core are unchanged):

- `anykey PROMPT` prints the key it read, so the launcher can tell `p`. Both
  helpers clear `ISIG` while they read: Ctrl+C is the byte 3, they restore
  the terminal mode and return 130. Both discard earlier input
  (`TCSAFLUSH`) and only then show their prompt, so a key typed while the
  image boots downloads nothing and one typed during the download answers
  no key prompt, while a key pressed as soon as the prompt shows is read.
- `secretenv NAME PROMPT COMMAND…` (C, in the recipe) shows the prompt, reads
  a line without echo (Backspace erases; blanks and control bytes are
  dropped, so a key pasted with a blank before it and a newline after it
  arrives whole), sets NAME in its own environment, starts COMMAND with
  `posix_spawnp` and returns its status. The key is in secretenv's memory and
  in Claude Code's environment, nowhere else. The helper is needed because
  Dolly's terminal has no line discipline (reads return raw bytes and Enter
  is CR, `docs/process-model.md`), Slop's `read` has no `-s` and waits for
  LF, there is no `stty`, and Slop spools a command substitution in a file,
  which the key must not pass through.
- The launcher never uses `set --`: it runs `janis cli.js "$@"` when
  arguments were given or `p` was pressed (`"$@"` is then empty), else
  `janis cli.js --bare`, through `secretenv` when `ANTHROPIC_API_KEY` is
  empty.

Measured with a fixture that answers every Anthropic path but `/v1/messages`
with 404, both hello checks included (Chromium, 21:45–22:01 JST; driver
`build/claude-code-evidence/rework-explore.mjs`, logs `rework-chromium-*`):

- Default start, the key typed (with two Backspaces) or pasted at the
  prompt: never shown. Claude Code's screens are the theme, "Detected a
  custom API key … 1. Yes / 2. No (recommended)", its security notes, the
  folder trust question and the REPL ("Sonnet 4.6 · API Usage Billing"). Its
  requests: `GET /api/claude_code/settings` and `/api/claude_code/policy_limits`
  (twice each), three `POST /v1/messages` carrying the typed key (a Haiku
  request without tools, then the two of the Read turn, answered "The file
  says: DOLLY-FIXTURE-CONTENT"), and `GET
  /api/claude_code/organizations/metrics_enabled` at `/exit`. No hello check
  and nothing to `platform.claude.com`.
- `--bare` offers the model three tools, Bash, Edit and Read (as published
  it offered nine in the first build's runs: Agent, Bash, Edit, Glob, Grep,
  Read, Skill, ToolSearch, Write). A scripted Bash call got the tool result
  "No suitable shell found. Claude CLI requires a Posix shell environment…".
- "No" to the detected key, Claude Code's default: the same REPL, and the
  Messages requests still carry the typed key.
- An empty answer at the launcher's prompt, `--bare` without a key: theme,
  security notes, folder trust and the same REPL; nothing is requested from
  Anthropic. A prompt answers "Not logged in · Please run /login". `/login`
  shows "Select login method: 1. Claude account with subscription · 2.
  Anthropic Console account · 3. 3rd-party platform"; method 1 stops at
  "OAuth error: Failed to start OAuth callback server: Janis has no
  listening socket API · Press Enter to retry"; Escape returns to the REPL
  ("Login interrupted") and `/exit` leaves.
- `p`: `GET api.anthropic.com/api/hello` and `GET
  platform.claude.com/v1/oauth/hello`, then "Unable to connect to Anthropic
  services · Failed to connect to api.anthropic.com: ERR_BAD_REQUEST" (the
  fixture's 404) and exit to the recovery shell.
- What holds the key after the default start with "Yes" (`rg -uuu`; Dolly's
  `grep` has no `-r`): no file under `/tmp`, `/opt`, `/usr`, `/etc` or
  `/workspace`; no file under `/home` holds the whole key; its last 20
  characters are once in `/home/dolly/.claude.json` and, in the real runs
  below, once in `/home/dolly/.claude/backups/.claude.json.backup.*`: Claude
  Code's own record of the key it was allowed to use.
- `/exit` typed and entered at once ran `/add-dir`, the first entry of the
  slash-command menu, in one run (Chromium): the test and the drivers let
  the menu settle before Enter.
- An arrow key at the notice (three bytes) starts the default start, and
  the API key typed afterwards arrives whole: `anykey` discards the rest of
  the sequence.
- With the choice printed before `anykey` starts, as the launcher of
  `5f84135b` did, a key pressed at once was discarded 4 of 12 times in
  Chromium and 1 of 12 in Firefox (`rework-anykey.mjs`; one driver run had
  stalled on it). With the prompt shown by `anykey` itself (`caa3fb4c`): 0
  of 12 in both. A key typed two seconds before either helper's prompt
  answers neither (`rework-typeahead.mjs`, Chromium): each waited for the
  next one.

On a served checkout against the real endpoints (`DOLLY_PORT=9011 node
scripts/serve-checkout.mjs closed-source-agent`; no policy, no fixture, a
made-up key; driver `rework-real.mjs`, logs `rework-real-*-final-*`), the
image as committed in `caa3fb4c`:

- Chromium (22:39–22:46 JST): booted in 2.6 s; nothing left the checkout's
  origin while the notice showed; Enter to the key prompt (download from
  the registry, digest, unpack) 6.1 s; the typed key was not shown; Claude
  Code's four screens to the REPL 13.5 s; "Say hi" first showed the API's
  401 after 157 s and ended, after Claude Code's own "3m 15s" of retries, at
  `Please run /login · API Error: 401 {"type":"error","error":{"type":
  "authentication_error","message":"API key is invalid."},"request_id":null}`;
  `/exit` left.
- Firefox (the same minutes): boot 3.4 s, to the key prompt 7.0 s, to the
  REPL 14.2 s, the 401 first after 147 s and the same final line after
  "3m 0s".
- With the user's own `export CLAUDE_CODE_MAX_RETRIES=1` the 401 showed 2.7 s
  after the prompt (Chromium, 22:28).
- Requests of the default start, the same in both: the tarball; to
  `api.anthropic.com` `HEAD /`, `GET /api/claude_code/settings`, `GET
  /api/claude_code/policy_limits`, `POST /v1/messages`, `POST
  /api/event_logging/batch` and `POST /api/eval/sdk-…`; and Claude Code's
  plugin marketplace, `GET downloads.claude.ai/claude-code-releases/plugins/
  claude-plugins-official/latest` and `GET github.com/anthropics/
  claude-plugins-official.git/info/refs`. Chromium reports every one but the
  tarball and `/v1/messages` as failed (no CORS headers); the REPL's status
  line says "Failed to install Anthropic marketplace".
- The key afterwards, both browsers: as with the fixture (nothing outside
  `/home`; the last 20 characters in `.claude.json` and its backup).
- Print mode as published, `closed-source-agent -p 'Say hi'` with the
  made-up key exported: status 1 with "Failed to authenticate. API Error:
  401 … API key is invalid." after 186 s in Chromium and 187 s in Firefox.
  Its requests add `/api/claude_cli/bootstrap`,
  `/api/claude_code_penguin_mode`, `/mcp-registry/v0/servers` and
  `/api/claude_code/organizations/metrics_enabled`.
- With the key exported, `closed-source-agent` and Enter reached the REPL
  without the launcher's key prompt (both browsers).
- Ctrl+C at the key prompt ended the launcher for the recovery shell, with
  only the tarball requested (both browsers, 22:47).
- The download took 54 s in one run at 22:29 (a native `curl` of the same
  URL then took 29 and 32 s) and 5 to 7 s in the others: the network.
- An earlier pair of runs, on the build before `5f84135b` in which the
  launcher printed the key prompt (Chromium 22:07, Firefox 22:14), gave the
  same results.

The test (`demos/closed-source-agent/test/closed-source-agent-browser.mjs`,
Chromium by default, `DOLLY_BROWSER=firefox`): an explicit policy admits only
the tarball URL, `api.anthropic.com` (`/v1/` POST with the key headers,
`/api/` GET) and `platform.claude.com/v1/oauth/hello`; the page's fetches of
those origins go to the test server, which serves the cached tarball and the
scripted Messages endpoint and answers everything else 404, both hello
checks included. In one session it asserts:

- no request while the notice shows and none after Ctrl+C; the recovery
  shell then has no `/opt/claude-code`, `~/.claude.json` or `~/.claude`;
- `closed-source-agent --version` on the run that downloads: no request
  until a key, then status 0 with the version and one GET of the tarball; a
  second `--version` answers without the notice or a key;
- `p`: Claude Code requests a hello check and exits non-zero;
- Enter: the key typed at the launcher's prompt is not in the visible text;
  Claude Code's own screens are answered as a user would; the Read turn
  completes in the REPL with two Messages requests, the second with the
  file's content as the tool result; every Messages request carries the
  typed key as `x-api-key`; this start requested no hello check; `/exit`
  leaves with status 0;
- `rg -uuu` finds the key in no file under `/tmp`, `/opt`, `/usr`, `/etc`
  and `/workspace` nor in the shell's history;
- the tarball was requested once in the whole test.

`closed-source-agent.artifacts.mjs` is the first build's, renamed: no path of
the sealed snapshot names Claude or Anthropic and no retained file has the
SHA-256 of a tarball member.

Results (2026-10-07, image of `caa3fb4c`, recipe SHA-256 `7a3c9bb9…`, built
in 25 s in one build slot): `closed-source-agent: chromium passed in 41.0s`,
`closed-source-agent: firefox passed in 47.5s`; the artifacts test passes;
`npm run lint:dollyfiles` and the source suite pass (334 in `test/`, 415 with
the demos'). Long typed lines were not truncated: the test types 41
characters at most.

Licence conditions, evidence:

1. Unmodified, run as published: the launcher's `curl` of the registry URL,
   `sha256sum` against the pin and `tar -xf` are the only steps; the test
   asserts one GET of the tarball and the artifacts test that the image holds
   none of it. `--bare` is a flag of the published program, given on its
   command line; with `p` and with arguments the launcher adds nothing. Gaps
   are fixed in Janis only (`141b7cdb`); the rework changed neither Janis nor
   the core.
2. No sign-in method removed: the image writes no `~/.claude.json` (asserted
   at the recovery shell) and sets only `USE_BUILTIN_RIPGREP=0`, plus, in the
   default start, `--bare` and the key the user typed. The start as
   published is the notice's other key (the test asserts its hello check),
   arguments pass through unchanged, and `/login` shows Claude Code's three
   methods inside the `--bare` REPL. The methods that cannot work fail with
   Claude Code's own messages (above). `--bare` as the default key is the
   open reading above.
3. No intermediation: no relay and no key anywhere in the tree (the test's
   key is a made-up string and the fixture stands for the model). The key a
   user types goes from the terminal into Claude Code's environment and from
   the browser to Anthropic (asserted: `x-api-key` on the Messages requests,
   and no file outside Claude Code's own holds it); the broker policy on the
   public site is the default (no relay).
4. Names: the image, directory, route and command are `closed-source-agent`;
   the notice, the README and the catalog line say in plain text that it
   runs Claude Code; no logo.
5. Credentials stay in the session: Claude Code keeps the last 20 characters
   of a key the user approved in `/home/dolly/.claude.json` (measured), and
   the image keeps nothing; the notice and README say that a saved or
   exported session contains Claude Code's files and the package.

Sign-in methods per browser on the public site (no fixture), the same in
Chromium and Firefox:

- API key: works, typed at the launcher's prompt or exported, in the
  interface (`--bare`) and in print mode. The made-up key drew the API's
  401, which proves the request path; a model's answer needs a funded key.
- Claude account and Console account: do not work. As published the
  connectivity check exits before they are offered; `/login` in the `--bare`
  REPL offers them and stops at the callback-server error (method 1
  measured there; methods 1 and 2 behind the first build's fixture).
- 3rd-party platforms: not followed.

Left for the owner and the integrator: step 5, a real-model turn with a
funded key (now in the interface: open the image, Enter, paste the key; or
print mode with the key exported); the Commercial Terms confirmation and the
`--bare` reading; whether `closed-source-agent` joins
`config/github-pages-images.txt` and `config/domain-pages-images.txt` (it is
in neither, so no packaged release holds it yet); the images that install
`javascript` (`pi-*`, `bhop`, `slopyard`, `classicube`, `rts-arena`,
`dollyfile-studio`), which the first build's Janis change re-pins and which
were not rebuilt here; and the unit `dolly-serve-9008`, started for
`code-agent`, which needs a restart for `closed-source-agent`. The scratch
drivers, logs and screenshots are under `build/claude-code-evidence/` (not
committed; the screenshots show the made-up key only as Claude Code
abbreviates it).

## Related

`20261005-133044-claude-code`, `20261005-132750-janis-node-gaps`.
