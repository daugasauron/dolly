# Stop failed practice runs when the world would remove the creature

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: game,agent,iteration

XXXV collapsed by123.383s but its requested300s trial ran to the end. Falling
also inflated its displacement. Practice now shares the world's physical
failure classification and grace counting, stopping on a sustained fall or
immediate controller error. The result retains actual steps, failure cause,
final GPU picture and controller memory. Reset clears it; cancellation remains
an interruption. Successful trials and recoverable stumbles retain their time.

Verified C compilation inside Dolly and real GPU browser behavior:

- Falling and sinking probes stop at tick301 (5.016667s), matching world removal.
  A runaway controller stops before its first step, preserving prior memory.
- An anchored mechanism completes. A22s flyer recovers from three brief
  up<.15 intervals and finishes upright. Release pauses without a false failure.
- Existing full integration/reopen checks pass, including boats,magnets,flight
  and51 objects. Sidelight II completes all18000 ticks:18 scored steps,7.212m
  forward,minUp .98721045,three pictures and300.043s wall time.
- Actual Astra/xhigh Pi requests300s for a saved4-part Toppler. The tool returns
  posture failure at tick301,`memory.last=5`,two images. Pi reopens biped#55 and
  continues. The probe stays in the library and is not released into the world.

The update was compiled in the existing live Dolly filesystem. All five saved
workspace files matched before/after hashes; the named session contains the new
binary/tools and remains compatible. Subsequent real Pi activity preserves all
54 earlier creations and the entire362960038-byte native-history prefix.
Current native history363582174bytes; ten verified gpt-6-astra/xhigh requests.
No host C compilation, physics assistance or new outer imports.

Evidence: build/blockwalker-trial-failure/{proof.json,trial-failures.json},
build/blockwalker-failure-integration/, and
build/blockwalker-walking/practice-stop-{before,after,updated,live}-proof.json.
These are source and live-session checks. The fresh packaged image remains at
39e1971; include this change in the next image checkpoint under the world task.
