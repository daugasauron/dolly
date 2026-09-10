# ClassiCube agent world

`Dollyfile-classicube` opens directly into a playable offline world. The game fills
Dolly's canvas; an overlay shows the selected provider, vision model, reasoning
effort and accumulated reported cost. Starting or restoring the image makes no
model calls. **F11** toggles browser fullscreen.

| Control | Action |
| --- | --- |
| F2 / Settings | Configure the agent; settings save automatically |
| Enter / instruction button | Open the prompt editor |
| Enter / Send | Send an instruction, or steer the working agent |
| Shift+Enter | Insert a newline |
| Ctrl+Enter | Interrupt the current task and send the new instruction |
| Escape / Interrupt | Interrupt the agent; keep the editor open for a new instruction |
| F6 | Switch between your controls and the agent's controls |
| Tab | Show or hide activity |
| Scroll / Page Up / Page Down / End | Browse activity / follow live output |
| F10 | Save the world and exit to Dolly's shell |

You start with control. Click the world to capture the mouse: WASD moves, Space
jumps, left/right click breaks/places, and B opens inventory. Escape releases
capture; Escape again opens the game's menu. Opening settings or the human
prompt editor releases held inputs. After closing an overlay, double-click the
world to capture the mouse again. F6 interrupts pending inference and releases
held agent inputs before handing control to you. Switching back lets the agent
inspect the changed world and continue the current task. With no task yet, it
opens the prompt editor. Escape closes the editor when you control the game.

Connect OpenRouter through **F2 → OpenRouter API key** (hidden input), or
**Sign in with OpenRouter**. The code flow downloads a small page containing the
sign-in link. Open it, authorize, then paste the resulting code into the overlay;
no callback server is needed. Choose a model and effort with the filter, arrows,
Enter or mouse. The live catalog includes image input and tool calling; a cached
catalog remains available if refresh fails. Credentials live in Pi's in-Wasm
credential store and are never included in the distributed image.

For development with your Codex subscription, use an existing `codex login` and
start the same loopback proxy used by RTS Arena:

```sh
node scripts/codex-relay.mjs 9092 http://127.0.0.1:9091
```

Use the exact local origin where Dolly is open as the final argument. Choose
**F2 → Local Codex proxy**, upload the private `models.json` path printed by the
proxy, and select a vision model and effort. Keep the proxy running; native
`~/.codex/auth.json` stays on the host. Restarting the proxy requires importing
its new configuration. **Disconnect provider** removes it from Dolly.
Subscription runs consume Codex allowance; the displayed cost reflects only
reported dollar usage. They make no OpenRouter requests.

The first instruction starts a real Pi RPC agent with a persistent conversation.
Further instructions steer a running task or start a follow-up. Settings changes
restart Pi with the same conversation. The activity panel shows assistant text,
tool actions and the reasoning the provider exposes. The game keeps running
while the model responds. There is no application time cap or dollar stop limit.
When the agent finishes, it waits for another instruction without making calls.

Preferences are ordinary files in `/home/dolly/.config/classicube`:
`agent.json` contains provider/model/effort; `conversation.jsonl`, `activity.txt`,
`usage.json`, `last-prompt.txt` and `draft.txt` retain conversation, activity,
reported usage and unfinished input. Pi credentials and proxy configuration live
under `/home/dolly/.pi/agent`. The world autosaves every five seconds and on exit
to `/home/dolly/classicube/maps/agent-world.cw`. Use Dolly's **Save session** to
retain these files across page reloads or export/import them with the session.
Restoration starts in human control. Run histories remain under
`/workspace/classicube-runs`.

The sole agent tool is `game_input`, using the same screenshot-and-input approach
as RTS Arena. Each batch permits up to 16 sequential actions and 2000 ms of
requested input duration, followed by a fresh 640×480 PNG. Inputs are mouse
movement, clicks, drags, timed keys, waits and relative mouse movement for looking
around. There are no world queries or block-editing APIs. Agent screenshots
contain only the game. Input ownership and handoff use private files in the
shared Wasm filesystem; all network requests use Dolly's existing HTTP broker.

Build with `npm run image -- classicube`. `Dollyfile-classicube-build` compiles
pinned upstream C inside Dolly using SDL2, software rendering and cooperative map
generation. `modules/classicube-agent.dm` builds the viewer and installs the
supervisor on the Pi runtime. No native game process or new browser capability is
involved. The input codec, screenshot history policy and text renderer are shared
with RTS Arena. This is ClassiCube's creative game, without audio or multiplayer.

Browser modes `classicube` and `classicube-agent` test manual play and the full
agent flow against an explicitly scripted provider, including keyboard/mouse
input, interruption, handoff and session restoration. The opt-in
`classicube-agent-live` mode reads an OpenRouter key from stdin without echoing
and runs a bounded live test in a fresh browser profile. `DOLLY_CLASSICUBE_MODEL`
selects the model. Set `DOLLY_CLASSICUBE_MODELS_FILE` to the proxy's configuration
path to test Codex through the upload flow without an OpenRouter key. Allow the
test's exact origin on the proxy; `DOLLY_BROWSER_PORT` selects a stable port.
Reports are exported only after checking that they contain no credential.
