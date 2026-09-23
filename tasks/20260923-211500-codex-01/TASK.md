# Replace Blockwalker JavaScript controllers and JSON game data with Lua and YAML

- STATUS: OPEN
- PRIORITY: 200
- TAGS: game,architecture,scripting

User requested Lua instead of embedded JavaScript and YAML instead of JSON for
Blockwalker. The C game currently creates a QuickJS runtime for each movement
controller (`src/blockwalker/world.c`). Catalogs, archived designs and world
saves contain JSON, including controller source and persistent controller memory.
QuickJS is also used by the separate embedded Pi integration.

Keep the engine, physics and rendering integration in C. Compile Lua and the
chosen YAML reader/writer inside Dolly; evaluate dependency size and iteration
cost before adding them. Define one small controller interface for time, physics
sensors, persistent memory, seeded randomness and joint commands. Preserve the
current memory/execution limits and prevent scripts from receiving ambient host
capabilities. Pi must generate and install Lua movement programs through the
same direct game tools.

Convert the maintained and archived character programs and authored catalogs.
Use a data-only YAML schema with explicit validation and versioning for game
data and saves. Preserve poses, velocities, programs, controller memory, seeds,
magnet attachments and removal history when migrating existing JSON worlds.
Keep original saves recoverable; report conversions that cannot be made safely.
The existing plain-text `.character` format needs an explicit compatibility
decision rather than an accidental format change.

Scope the remaining JavaScript deliberately: game-owned scripting and data are
the target; upstream Pi, its protocol payloads and Dolly's browser runtime are
separate dependencies, not an implicit request to rewrite those projects.

Done when the biped walks, PID vehicles balance, boats sail and cranes handle
cargo using Lua in a real browser; YAML save/reload preserves the same physical
and controller state; older worlds migrate without lost designs; runaway scripts
remain bounded; and obsolete game controller/JSON paths are removed after
compatibility coverage. Record startup, simulation throughput and image-size
measurements against the current implementation.
