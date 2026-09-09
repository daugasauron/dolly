# RTS arena experiment

Branch: `rts-arena`, not deployed. Seven Kingdoms: Ancient Adversaries 2.15.7
and SDL2 compile from pinned source inside Dolly. The game's GPL source and
data are included, with notices and corresponding source. Separate music is
omitted. Audio and thread creation are unavailable; the browser ABI is unchanged.

Build and serve a separate local release (leaves the normal release untouched):

```sh
npm run image -- rts-arena
DOLLY_BUILD_IMAGES=rts-arena ./scripts/package-pages.sh build/rts-pages.tar.gz build/rts-releases
DOLLY_PORT=9001 npm run serve -- build/rts-releases
```

Open `/rts-arena/`. The in-sandbox launcher offers an offline recorded match,
OpenRouter key setup, local Codex import, and live fuzzy provider/model pickers.
Type to filter, use arrows and Enter to select, or Escape to go back. Only vision
models are shown, with reasoning support and pricing. Both players and the spending/time limits are confirmed before any
model calls. OpenRouter uses Pi's credential store and cached/refreshable catalog.
Save your Dolly session to retain credentials and matches across reloads.
Choose **Shell** for the original command-line interface:

```sh
rts-arena [PROVIDER::]MODEL_1 [PROVIDER::]MODEL_2 [seconds] [USD]
```

OpenRouter is the default provider. Both models must accept images; Pi's
`:low`/`:high` thinking suffixes work.
The defaults are 600 seconds and $1 in Pi-reported model costs. This is an
application stop threshold, not a billing guarantee: in-flight calls can exceed
it and provider pricing may differ. Use an OpenRouter key limit for a hard cap.
Loading the image makes no paid calls.
Escape stops the match, saves replays and returns to its launcher (or Slop when run directly). Ctrl-C is the runtime's
forced-cancellation fallback: existing files survive, but final replay capture
and match scratch cleanup are not guaranteed.

Replay a saved match in the same split-screen viewer, with continuous native
game animation and recorded thinking/tool events:

```sh
rts-arena --replay /workspace/rts-matches/MATCH
```

Space pauses both games and the traces; +/- changes speed; Escape exits playback.
An optional final argument sets initial speed (0.25–64, default 1).
Playback makes no model calls and leaves the match folder unchanged. It needs
`match.json`, both `playerN.events.jsonl`, and each `playerN-game` folder's
`NONAME.RPL` and `inputs.log`. For a downloaded bundle, upload the `.tar.gz` and
extract it with `gzip -dc /workspace/match.tar.gz | tar -xf - -C /workspace` first.
Native recordings drive simulation; logged inputs restore each player's camera
and selection without issuing new simulation commands. Recorded events follow
the shared playback clock. No Pi processes are started.

To watch only a battle from a standalone `.RPL` file, without the arena/traces:

```sh
upload /workspace/match.rpl
seven-kingdoms -noaudio -win -replay /workspace/match.rpl
```

Playback makes no model calls and returns to Slop at EOF. Add `-speed 99` for
fast-forward; ordinary replay camera and speed controls remain available.
Use `download /workspace/rts-matches/MATCH/player1-game/NONAME.RPL` to save a
recording to your computer (or choose `player2-game`). Keep the matching image
version: upstream recordings are not guaranteed portable across game builds.

## Local subscription testing

With an existing `codex login`, start this on your computer:

```sh
node scripts/codex-relay.mjs 9002 http://localhost:9001
```

This separate loopback inference service reads the Codex login and cached
vision-model catalog; it never runs game tools or serves files. It prints the
path of a private, temporary Pi `models.json`. Choose **Import local Codex relay**
in the launcher and select that file. It adds only `codex-local` to Pi's model
configuration, preserving other providers. Never upload native `auth.json`.

The relay capability is not an OpenAI token. Stopping the relay removes its
temporary configuration and invalidates that capability. It rereads credentials
for each request; refresh expired credentials with Codex.

Subscription usage is governed by your Codex allowance, not the arena's dollar
counter. Keep a match time limit. The public OpenRouter image needs no relay.
For an automated browser run, allow `http://127.0.0.1:9011` as another relay
origin and set `DOLLY_BROWSER_PORT=9011`, `DOLLY_RTS_MODELS_FILE` to its printed
configuration path, and `DOLLY_RTS_MODELS` to two comma-separated selectors when
running the `rts-live` mode below. This still uses the real browser HTTP broker.

## How it works

- Two real game processes exchange the upstream multiplayer protocol over
  in-Wasm pipes, at 20 simulation frames/second with a fixed map seed.
  Arena mode disables player lifecycle menus, save/screenshot dialogs and speed
  changes inside the game. Reports and gameplay keys remain available; the
  spectator owns shutdown. Normal standalone/replay menus are unchanged.
- Each Pi RPC session receives only its own player's 800×600 view and fog of
  war. Its sole tool sends ordinary clicks, drags, keys and waits: at most
  16 sequential actions and 2000 ms in requested durations, one active batch per player.
  Each release is processed before the next action changes the held state or pointer.
- Every batch returns a fresh screenshot; an empty batch just observes.
  Captions include the actual SDL pointer coordinates, not an inferred unit position.
  A move-only batch positions the visible cursor without clicking, allowing
  an agent to inspect its aim before a separate click. Batches have no intermediate views.
  There are no decision intervals or barriers and the game never waits for
  model decisions. **HTTP requests are currently serialized**, as explained below.
- Players discover the game themselves: no supplied game guide, strategy or
  scripted opening. Ordinary assistant text records their observations and
  intent before tool calls; it stays in the conversation, not just a thinking stream.
- Model context keeps text/action history and the two latest screenshots
  (only the latest when the pair exceeds 640 KiB of base64). PNGs use lossless
  palette encoding where possible; their 800×600 pixels are unchanged. Full Pi
  histories, including old screenshots, remain in `/workspace/rts-matches/match-*`,
  alongside timestamped thinking/tool events, execution frames, logs and replays.
- A separate in-Wasm SDL spectator renders both views and the thinking deltas
  the provider actually exposes. It does not manufacture hidden reasoning.

The browser pointer currently supplies left-button input only. Agent tools
synthesize right/middle clicks inside SDL without changing host capabilities.
Swap model arguments for a return match with the opposite starting positions.

## Validation and remaining work

Chrome proofs: `DOLLY_IMAGE=sdl2-build DOLLY_BROWSER_MODE=sdl2
./scripts/test-browser.sh`, then `DOLLY_IMAGE=rts-arena DOLLY_BROWSER_MODE=rts
./scripts/test-browser.sh`. They cover real rendering/input, process reload,
PNG encoding, visible move-only cursor positioning, lifecycle-menu/shortcut guards, rejected/cancelled batches,
separate player views, continuous simulation, real Pi RPC/tool/history streaming against an explicitly scripted
local HTTP provider, and orderly shutdown. A normal town click and recruit key
produce a unit; both engines record the same recruitment command/frame, and
both replays play through the upstream loader to EOF with its state CRC checks.
A damaged checksum must report a synchronization failure and exit with status 74.
These are short replay checks, not a completed live-model battle.

HTTP mailbox v4 permits one request in flight across Dolly. A slow model can
delay the opponent; this is accepted for the initial experiment, which is not a
fair model-latency benchmark. The browser contract remains unchanged. There are
no artificial decision intervals.

The process-call packet limit is also 1 MiB, below the broker's 8 MiB request
limit. Limiting recent images leaves room for text history, but does not fix
that general payload-limit mismatch for arbitrarily long conversations.

The image includes `src/rts/demo.tar.gz`, a replay-only recording of Astra high
versus xhigh. The module extracts it to `/usr/share/dolly/rts/rts-high-vs-xhigh`.
It contains both native recordings, input logs and exposed thinking/tool traces,
not credentials or the bulky screenshot histories. Player 2 won at frame 27741.
Replay engines animate between recorded observations; playback needs no account
or network. The viewer samples current game frames on a 33 ms redraw cadence.

The opt-in `rts-live` browser mode defaults to an inexpensive OpenRouter match,
bounded by 20 minutes and $0.50 in reported costs. Override the comma-separated models
with `DOLLY_RTS_MODELS`, duration with `DOLLY_RTS_SECONDS`, and the reported-cost
cutoff (at most $2) with `DOLLY_RTS_USD`. It reads
one key from stdin without echoing, uses a fresh profile, and exports verified
histories/replays to `build/rts-live-match.json` (base64 file contents), using
bounded download chunks for long histories. OpenRouter runs include
the key's billed usage delta (which may include other concurrent users of that key).
Native recordings are also downloaded independently to
`build/rts-live-player1.rpl` and `build/rts-live-player2.rpl` and compared with
their archived bytes. Test an uploaded recording through the native loader with
`DOLLY_IMAGE=rts-arena DOLLY_BROWSER_MODE=rts-replay DOLLY_RTS_REPLAY_FILE=FILE
./scripts/test-browser.sh`.
The September 8 live proof completed with 7 DeepSeek actions and 11 Grok actions,
both thinking streams, no API errors, and a clean timed exit. Reported usage was
about $0.048; this is not an invoice or a latency comparison.

```sh
DOLLY_BUILD_IMAGES=rts-arena DOLLY_IMAGE=rts-arena DOLLY_BROWSER_MODE=rts-live ./scripts/test-browser.sh
```

On September 9, a browser match using the local Codex subscription relay reached
an engine-declared victory: Astra `high` (player 2) defeated Astra `xhigh` at frame
39,511, about 33 minutes in. Each Pi session completed 92 tool calls: 480 inputs
and 186 saved screenshots in total, with no rejected batches, provider errors or
retries. Neither player received a game guide or scripted opening. This is a
working-game proof, not evidence that one reasoning level is stronger.

A second run, with `high` as player 1 and `xhigh` as player 2, ended with player 2
winning at frame 27,741. Both downloaded `.RPL` files were independently uploaded
into fresh browser sessions and replayed through native EOF at exactly that
frame. The files and full histories are in `build/rts-high-vs-xhigh/`.
The `rts-split-replay` browser proof uploads that match, checks animation between
observations, synchronized pause/speed controls, both native EOFs, exact final
traces, unchanged recordings, zero HTTP requests and shell recovery. Set
`DOLLY_RTS_REPLAY_BUNDLE` to test its smaller replay-only `.tar.gz` bundle.

The first winning run's directory-based export omitted replay files. Required
artifacts are now included by their explicit filenames, each native replay is
downloaded separately and compared with the archive, and an omitted-entry unit
test guards retention. The underlying directory-enumeration cause is not yet
isolated; the old run's missing recordings cannot be recovered.

Keys belong in the live sandbox, never source archives, snapshots or match logs.
Ordinary V4 Flash and V4 Pro are text-only; use the vision variant.
