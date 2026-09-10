# ClassiCube agent world

`Dollyfile-classicube` opens an in-sandbox setup screen: connect to OpenRouter,
choose a model provider, vision model and reasoning effort, then enter a task.
The provider picker groups models by their publisher on OpenRouter. The live
catalog includes models with both image input and tool calling; a cached catalog
is available if refresh fails. Loading the image makes no model calls.

Sign in using OpenRouter's [PKCE code flow](https://openrouter.ai/docs/guides/overview/auth/oauth)
or enter an API key with hidden input. The code flow opens an authorization link
in your browser and asks you to paste the resulting code into Dolly; it needs no
local callback server. The key is checked before model selection and stored in
Pi's in-Wasm credential store. Save your Dolly session to retain sign-in and worlds
across reloads. Credentials are never part of the distributed image.

Start launches a real Pi RPC agent, the source-built ClassiCube game and an SDL
spectator. The game fills the canvas, with a collapsible activity panel showing
assistant text, tool actions and only the reasoning the provider exposes.
**Tab** toggles the panel; scroll/Page Up/Page Down browse earlier activity and
**End** follows live output. **Enter** opens a follow-up instruction box.
**Escape** cancels that box, or stops the run and saves the world.

The agent uses the same screenshot-and-input approach as RTS Arena. Its sole tool
is `game_input`: at most 16 sequential actions and 2000 ms of requested duration,
followed by a fresh 640×480 PNG. Inputs are mouse movement, clicks, drags, timed
keys, waits and relative mouse movement for looking around. The game keeps
running during model responses. There are no world-state queries or block-editing
APIs. The agent's images contain only the game, not the spectator's traces.

Runs default to 600 seconds and $1 of reported model cost. The latter is a stop
threshold; an in-flight call can exceed it. When the agent finishes answering it
waits for another instruction, without automatic model calls. Run histories,
prompts, exposed traces and input logs remain in `/workspace/classicube-runs`.
The next run resumes `/home/dolly/classicube/maps/agent-world.cw`.

Build with `npm run image -- classicube`. The separate `Dollyfile-classicube-build`
compiles pinned upstream C source inside Dolly using SDL2, software rendering and
cooperative map generation. `modules/classicube-agent.dm` builds the spectator and
launcher in the sandbox on top of the Pi runtime. No native game process or new
browser capability is involved. The reusable input codec, screenshot history
policy, text rendering and terminal pickers are shared with RTS Arena.

The game remains offline single-player without audio. The agent's OpenRouter
requests use Dolly's existing browser HTTP broker. To play yourself from the
shell, run `cd /home/dolly/classicube; classicube --singleplayer`: click to capture,
WASD moves, Space jumps, left/right click breaks/places, B opens inventory and
Escape opens the game menu. This is ClassiCube's creative game, not modern Minecraft.

Browser modes `classicube` and `classicube-agent` test manual play and the complete
agent flow against an explicitly scripted provider. The opt-in
`classicube-agent-live` mode reads an OpenRouter key from stdin without echoing,
uses a fresh browser profile and runs a bounded live test. It exports run histories
only after checking they contain no credential. `DOLLY_CLASSICUBE_MODEL` selects
the live model. Live tests are never part of the default test suite.
