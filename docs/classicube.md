# ClassiCube agent world

`Dollyfile-classicube` opens directly into an offline world. Controls, cost,
activity and the prompt editor live in a side panel. The complete game view fits
beside it, including the game's own HUD. **Tab** hides every panel and dialog so
the game fills the canvas; Tab shows the controls again. Panel and activity
visibility are saved in `ui.conf`. Starting or restoring makes no model calls.

| Control | Action |
| --- | --- |
| Tab / Hide | Hide or show the entire interface, retaining unfinished input |
| Backtick | Switch between your controls and the agent's controls |
| Ctrl+, / Settings | Open or close agent settings |
| Enter / instruction field | Write an instruction |
| Enter / Send | Send an instruction or steer the working agent |
| Shift+Enter | Insert a newline |
| Ctrl+Enter | Interrupt the current task and send a replacement |
| Escape / Interrupt | Interrupt the agent; Escape backs out of settings |
| Activity button | Hide or show activity independently |
| Scroll / Page Up / Page Down / End | Browse activity / follow live output |
| Save & exit button | Save the world and exit to Dolly's shell |

ClassiCube's agent interface assigns no function-key shortcuts. To play, hide
the panel with Tab or **Play yourself**, then click the game to capture the
mouse. WASD moves, Space jumps, left/right click breaks/places, and B opens
inventory. Escape releases capture; Escape again opens the game menu. Showing
the panel releases manual inputs and frees the cursor for clicking controls.
The agent continues working when you show or hide its panel. Switching to human
control interrupts inference and releases held inputs; switching back lets the
agent inspect the changed world and continue its task.

The provider selector offers **OpenRouter** and **Codex (local proxy)** even
before connection. Choose a provider, then connect it through its own
**Connection** page. OpenRouter offers sign-in or a hidden API-key field. The
sign-in flow downloads a page containing the authorization link; open it and
paste the resulting code into Dolly. No callback server is needed.

Model selection has its own search field, Clear button, scrolling list and
scrollbar. Click a visible row to apply it, or use arrows and Enter. Back returns
to settings without changing the selection. Reasoning effort is a separate
selector. The live OpenRouter catalog includes image input and tool calling; a
cached catalog remains available if refresh fails. Credentials live in Pi's
in-Wasm store and are never included in the distributed image.

For development with your Codex subscription, use an existing `codex login` and
start the same loopback proxy used by RTS Arena:

```sh
node scripts/codex-relay.mjs 9092 http://127.0.0.1:9091
```

Use the exact local origin where Dolly is open as the final argument. Choose
**Provider → Codex (local proxy) → Connect local proxy**, upload the private `models.json` path printed by the
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
reported usage and unfinished input. `ui.conf` stores panel visibility. Pi credentials and proxy configuration live
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
agent flow against an explicitly scripted provider in Chrome through DevTools
automation. Checks cover unobstructed game pixels, panel toggles, mouse/keyboard
selection, scrolling and empty searches, provider connection, interruption,
handoff and session restoration. The opt-in
`classicube-agent-live` mode reads an OpenRouter key from stdin without echoing
and runs a bounded live test in a fresh browser profile. `DOLLY_CLASSICUBE_MODEL`
selects the model. Set `DOLLY_CLASSICUBE_MODELS_FILE` to the proxy's configuration
path to test Codex through the upload flow without an OpenRouter key. Allow the
test's exact origin on the proxy; `DOLLY_BROWSER_PORT` selects a stable port.
Reports are exported only after checking that they contain no credential.
