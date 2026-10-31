# npm packages for v0.1.4: what is left before the owner publishes them

- STATUS: DONE
- PRIORITY: 250
- TAGS: packages,release,0.1.4

The npm packages are the main feature of v0.1.4 (owner, 2026-10-24).

## Published (2026-10-31)

On the owner's word ("release 0.1.4 ... publish npm"), the 13 packages the release checklist
packed from `42f0bf21` (`build/npm-v0.1.4/`) are on npmjs.com at `0.1.4`, under `latest`:
the runtime, ten host modules, `dolly-image-default` and `dolly-image-pi-minimal`. npmjs.com
served `latest` 0.1.4 a few minutes after the publish. `test/npm-browser.mjs`'s checks
on the packages as npmjs.com serves them, installed into empty apps with an empty cache and no
login (the guide's command and the README's "Pi with npm" as written): Chromium 4.9 s,
Firefox 5.8 s.

Since the state below: `pi-minimal` (Pi, a shell, POSIX tools, curl; three device host
modules) is the README's image in place of `pi-agent`; `boot()` takes `files`, written over
the image before its `ENTRY` starts, so `docs/agent-frontend.md`'s instructions, skills and
`models.json` are files beside the page; the README's server relays hosts without CORS, which
Copilot and Bedrock need. The four gaps listed under "What the npm path lacks" were, in
order: one agent image is packaged; building a recipe still needs a checkout; the page hands
the guest files (secrets still go through hidden prompts); `pi-minimal` is 27.5 MB.

## State (2026-10-25)

Built by `scripts/package-npm.mjs` from a checkout with its images: `@daugasauron/dolly` (the
runtime and the host modules that are its machinery, 178 KB packed), ten
`@daugasauron/dolly-host-NAME` (one device module each, 1.5 to 17 KB) and
`@daugasauron/dolly-image-default` (7.1 MB). On the owner's word (2026-10-25): no bundler is
needed, and each host module and image depends on the runtime alone, at its own version; an
image does not depend on its host modules, which `docs/embedding.md` names to install. The
packages declare no peer dependencies.

`test/npm-browser.mjs` (Chromium and Firefox, in the round's suites) packs them, serves them from
a registry of their own, installs the guide's own command into an empty app with an empty npm
cache, and checks: the dependency rule over every manifest; the guide's page boots `default`
with exactly its fourteen host modules; a page with `gpu@0`, `microphone@0` and `pty@0` loads
them, enables `gpu@0` and holds the `http@0` policy it gives `boot()`; a page that lacks
`touch@0`, or isolation, says so.

Other package managers, measured once (2026-10-27, Chromium, the test's checks with only its
install command changed): pnpm 12.15.0 (each package a symlink side by side under
`node_modules/@daugasauron/`, which the server follows), Yarn 1.22.22 (flat, as npm) and Yarn
4.18.1 with `nodeLinker: node-modules` pass. Yarn 4's default, Plug'n'Play, writes no
`node_modules` (`.pnp.cjs` and zip archives), so a page has nothing to import; the guide says to
set the linker.

## The first use case (owner, 2026-10-28)

> Regarding npm, the most important thing for me at the moment #1 usecase, is to be able to
> deploy something like pi agent, a set of skills, and a policy that is only allowed to go
> against one site (and the LLM backend provider necessary), such that it can "replace" a
> webapp frontend for an existing system with a good backend API.

`docs/agent-frontend.md` describes it. `demos/pi/test/frontend-browser.mjs` measures it with
the site's in-tab build, not the npm packages (Chromium 12.5 s, Firefox 14.3 s, 2026-10-28): a
recipe on `pi-runtime` with a system prompt, an orders skill, `models.json` and an entry that
reads the token and key with `secretenv`; a policy of two rules (the API's `/api/` prefix,
the model's completions path); a scripted model on its own origin receives the prompt, the
skill and its key; Pi reads the skill, lists and cancels through the API with the token; the
policy refuses `example.com`, another API path and `DELETE` (curl 9). No real model was run:
`~/.openrouter` (OpenRouter's `/api/v1/key`: 401 "User not found") and `~/.claude-api`
(Anthropic's `/v1/models`: 401 "invalid x-api-key") were both refused that day.

What the npm path lacks for it:
- an image package for an agent image: `package-npm.mjs` packages `default` alone;
- building a deployer's recipe without a Dolly checkout (the npm packages do not build);
- a way for the page to hand the guest a token other than `paste()` into a hidden prompt
  (`boot()` takes no files or environment; the broker never injects credentials);
- a smaller first load: `pi-runtime` is 66.5 MB compressed, 35 MB of it the compiler.

Left: publishing to npmjs under `@daugasauron`, with the release: the owner's step; nothing
here publishes.

Done when: the owner has published the v0.1.4 packages, and `npm install` of the guide's line
from npmjs gives what the test installs from its own registry.
