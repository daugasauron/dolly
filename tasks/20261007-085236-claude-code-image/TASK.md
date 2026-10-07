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

## Related

`20261005-133044-claude-code`, `20261005-132750-janis-node-gaps`.
