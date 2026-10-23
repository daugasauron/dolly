# Claude Code with the owner's own subscription inside Dolly: what the terms allow

- STATUS: OPEN
- PRIORITY: 60
- TAGS: agent,owner

Paused by the owner (2026-10-23): "pause this investigation for now."

Owner (2026-10-23): "I think claude updated their policy agreement so now it should be ok to
build a local proxy similar to codex so I can run claude sub from inside the environment
against a local proxy?"

## State (2026-10-23, 15:00): tried with the owner's token; Anthropic refuses it from a browser

The owner made a token with `claude setup-token` (`~/.claude-oauth`) and asked for a try in
Dolly. Run on the v0.1.3 release (`:9014`, `closed-source-agent`), the token typed at
`secretenv CLAUDE_CODE_OAUTH_TOKEN ... closed-source-agent` and Claude Code 2.1.112 started as
published (`p`; `--bare` ignores the token); the token appears in no log (checked).

- As published, Claude Code stops at "Unable to connect to Anthropic services": its first-run
  checks (`HEAD https://api.anthropic.com/`, `/api/hello`,
  `https://platform.claude.com/v1/oauth/hello`) send no CORS header.
- With `{"hasCompletedOnboarding":true}` in `/home/dolly/.claude.json` (the user's own
  setting) it skips them and opens its REPL; the first turn's `POST /v1/messages` reaches the
  API and is refused: `401 authentication_error`, "CORS requests are not allowed for this
  Organization because of its settings. If you believe this in error, contact support".

So a subscription token works only from outside a browser: the one way is a relay that sends
the token for the page, which is the intermediation the legal page forbids and a way around a
refusal Anthropic sets on purpose. Not built. What is left is Anthropic's: the error itself
names support. An API key works (`closed-source-agent`, Enter).

## Read and measured first

https://code.claude.com/docs/en/legal-and-compliance, read on 2026-10-23 (no date on the page):

- New since the relay was removed (`131e2120`, 2026-10-01): "Nor does it prevent an end user
  from signing in to the unmodified Claude Code binary with their own Claude subscription,
  including where a platform hosts Claude Code". So `closed-source-agent` with the owner's own
  subscription is allowed in itself.
- Still there: "sign-in to a Claude account must complete through Anthropic's own flow", and
  "developers may not collect, store, or intermediate Claude.ai credentials or session
  tokens"; "Anthropic does not permit third-party developers ... to route requests through
  Free, Pro, or Max plan credentials on behalf of their users." The page says nothing of a
  proxy a user runs for themselves.

Measured (CORS preflight from `https://slopshare.dev`, no credentials):
`https://api.anthropic.com/v1/messages` answers `access-control-allow-origin: *` with the
`authorization` and `anthropic-beta` headers allowed, so model requests need no proxy. The
OAuth token endpoints (`console.anthropic.com`, `platform.claude.com`, `claude.ai`,
`/v1/oauth/token`) answer 400 with no `access-control-allow-origin`, so a browser cannot
complete sign-in. A relay would be needed for exactly the step the page says must not be
intermediated (the session token passes through it). Which token URL Claude Code 2.1.112
uses was not read (nothing of the package is downloaded here).

Not built: a Codex-style relay for the subscription. The owner's to settle: ask Anthropic
(the page's contact link) whether a relay the user runs on their own machine for the token
exchange of the unmodified CLI is allowed. An API key works today without any proxy.
