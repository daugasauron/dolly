# An image that downloads and runs Claude Code, opening on a notice of its terms and limits

- STATUS: OPEN
- PRIORITY: 320
- TAGS: javascript,janis,agent,demo,licence

Owner (2026-10-07): "It should be ok licence wise to have an image that can
download it and run it?" Then: "Add a high priority task to add claude code,
the task should mention these license issues, I think if someone launches that
image first show a start screen with this analysis or something that you can
just press any key to close", and then the application starts.

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
   here fails with Claude Code's own message.
3. "Customers may not pay for, resell, or intermediate Claude usage on their
   end users' behalf." No relay (`131e2120` removed the last one), no shared
   key, no key in the image, the tests or the evidence. Requests go from the
   user's browser to Anthropic through the broker, which "never stores,
   injects or rewrites credentials" (`docs/http.md`).
4. "You can accurately say, in plain text, that your product has Claude Code
   preinstalled or that it runs Claude Code. But you can't use the Claude Code
   or Anthropic names or logos as part of your own product, feature, or
   company name". No logo. The catalog line and README say in plain text that
   the image runs Claude Code. The image and its route get a neutral name:
   the conservative reading, which the owner may overrule.
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

**Owner:** confirm that Anthropic's Commercial Terms are accepted (an API
Console account normally has), and supply a funded API key for the one real
run. The key is never committed, logged or shown in a screenshot.

## Start screen

Opening the image shows a notice before anything is downloaded. Any key
continues: download, integrity check, Claude Code starts. Ctrl+C ends the
image without downloading. It is shown every time the image opens.

Facts it carries, on one screen (the wording is the builder's):

- Claude Code is Anthropic's software and not part of Dolly, which is not
  affiliated with or endorsed by Anthropic.
- Continuing downloads Claude Code 2.1.112 (April 2026, 18.7 MB) from the npm
  registry into this browser session. Its use is under Anthropic's terms, with
  the URL above.
- You sign in with your own API key or account and the usage is billed to you.
  Requests go from this browser to Anthropic; the site serving Dolly does not
  receive them. An exported session file contains your sign-in.
- Limits here: an old release, run on Janis instead of Node, no Bash tool, and
  whichever sign-in methods step 3 finds not to work.

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

Decisions:

- Name: `code-agent` (directory `demos/code-agent`, recipe
  `Dollyfile-code-agent`, route `/code-agent/`). Alternatives the owner can
  rename to in one move: `agent-cli`, `coding-agent`, `npm-agent`. `cc-*` was
  rejected because `cc` is Dolly's compiler package.
- The tarball is never in git or in an image. The browser test downloads it
  from `registry.npmjs.org` at test time into the untracked
  `build/claude-code-cache/claude-code-2.1.112.tgz`, checks npm's sha512, and
  serves it to the page from the test origin in place of the registry; the
  test fails when it cannot obtain it. The launcher pins the SHA-256 of the
  same bytes, `84379969ea53a0e5fd231a8f77debe4c7cb17dd971f4809d10d33f9aeca5de09`
  (18,679,326 bytes; `sha256sum` is in `system`, no SHA-512 tool is), checked
  with the session's `sha256sum` before anything is unpacked.
- Launcher: a Slop script `/usr/bin/code-agent` (notice from
  `/usr/share/doc/code-agent/NOTICE`, `anykey` for the key, `curl`,
  `sha256sum`, `gzip`, `tar`, then `env USE_BUILTIN_RIPGREP=0 janis
  …/cli.js "$@"`). `anykey` is a 20-line C program in the recipe that puts
  the terminal in raw mode and reads one byte; Ctrl+C is SIGINT (ISIG stays
  on), status 130, and the image's `init.slop` then enters the recovery
  shell, as `pi` does, so a user can `export ANTHROPIC_API_KEY=…` and run
  `code-agent` again. Only `USE_BUILTIN_RIPGREP=0` is set (the vendored `rg`
  cannot run on wasm64; Grep and Glob need the session's `rg`); nothing
  else of Claude Code's environment is changed.

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
What works in a browser without that file is print mode: `code-agent -p …`
with `ANTHROPIC_API_KEY` exported, which runs no onboarding and no check.

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

Sign-in methods per browser, on the public site (no fixture): none of
Claude Code's interactive methods can start in Chromium or Firefox, because
its connectivity check exits first; `ANTHROPIC_API_KEY` in the environment
with `code-agent -p …` works in both (the 401 from the real API proves the
request path). Behind the check (fixture): the key is accepted by the
onboarding and the REPL works in both; Claude account and Console account
both stop at the callback-server error in both; 3rd-party platforms are out
of scope.

The notice therefore says that the interactive start stops at Claude Code's
"Unable to connect to Anthropic services" and that print mode with the
user's key works; the README has the reasons.

Step 4, the test (`demos/code-agent/test/code-agent-browser.mjs`, Chromium
by default, `DOLLY_BROWSER=firefox`): an explicit policy admits only the
tarball URL, `api.anthropic.com` (`/v1/` POST with the key headers, `/api/`
GET) and `platform.claude.com/v1/oauth/hello`; the page's fetches of those
origins go to the test server (`redirectFetch`), which serves the cached
tarball and the scripted Messages endpoint and answers both hello checks
200. It asserts: no request while the notice shows and none after Ctrl+C;
the recovery shell has no `/opt/claude-code` and no `~/.claude.json`; after
`export ANTHROPIC_API_KEY=…` and `code-agent`, no request until a key, then
exactly one GET of the tarball; Claude Code's onboarding answered as a user
would (theme, "Yes" to the detected key, trust the folder); a typed Read
request completes in the REPL with two Messages requests that carry the key
and the browser-access header, the second with the file's content as the
tool result; `/exit` leaves with status 0 (measured: neither Ctrl+C, twice,
from the keyboard or as raw bytes, nor Ctrl+D leaves this REPL in the
browser; `/exit` does); the session now holds the package and
`~/.claude.json`. `code-agent.artifacts.mjs` decodes the sealed snapshot:
no path names Claude or Anthropic, and no retained file has the SHA-256 of
a tarball member (its vendored ripgrep crate licences excepted: ripgrep's own
build retains the same texts).

Results (2026-10-07, image built from commit `98e6a934`'s pins, tarball
served from the cache): `code-agent: chromium passed in 25.2s`,
`code-agent: firefox passed in 26.6s`; the artifacts test passes (2635
snapshot entries); `npm run lint:dollyfiles` and the source suite (415)
pass. The image build (typescript-build, javascript, code-agent) took about
five minutes in one build slot.

Licence conditions, evidence:

1. Unmodified, run as published: the launcher's `curl` of the registry URL,
   `sha256sum` against the pin and `tar -xf` are the only steps; the test
   asserts one GET of the tarball and the artifacts test that the image holds
   none of it. Gaps are fixed in Janis only (`141b7cdb`).
2. No sign-in method removed: the image writes no `~/.claude.json` (asserted
   at the recovery shell) and sets only `USE_BUILTIN_RIPGREP=0`; the test
   drives Claude Code's own onboarding; the methods that cannot work fail
   with Claude Code's own messages (above).
3. No intermediation: no relay, no key anywhere in the tree (the test's
   key is a made-up string and the fixture stands for the model); the
   broker policy on the public site is the default (no relay).
4. Names: the image, directory and route are `code-agent`; the README and
   the catalog line say in plain text that it runs Claude Code; no logo.
5. Credentials stay in the session (`/home/dolly/.claude*`); the notice and
   README say that a saved or exported session contains them.

Left for the owner and the integrator: step 5 (a real-model turn with a
funded key, in print mode: `export ANTHROPIC_API_KEY=…; code-agent -p
'Read /workspace/hello.txt'` after a file is written; the interactive REPL
needs a `~/.claude.json` the user brings, since the check fails in
browsers); the Commercial Terms confirmation; whether `code-agent` joins
`config/github-pages-images.txt` and `config/domain-pages-images.txt` (it is
in neither, so no packaged release holds it yet); the name; and the images
that install `javascript` (`pi-*`, `bhop`, `slopyard`, `classicube`,
`rts-arena`, `dollyfile-studio`), which the Janis change re-pins and which
were not rebuilt here. The scratch drivers and screenshots are under
`build/claude-code-evidence/` (not committed).

## Related

`20261005-133044-claude-code`, `20261005-132750-janis-node-gaps`.
