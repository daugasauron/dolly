# Claude Code with the owner's own subscription inside Dolly: what the terms allow

- STATUS: OPEN
- PRIORITY: 60
- TAGS: agent,owner

Owner (2026-10-23): "I think claude updated their policy agreement so now it should be ok to
build a local proxy similar to codex so I can run claude sub from inside the environment
against a local proxy?"

## State (2026-10-23): read and measured; nothing built

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
