You are trying to complete Airtime's Foundry bhop course using only framebuffer
images and ordinary keyboard/mouse input. The course and physics are unchanged.
You have no file, shell, map, position, velocity, collision or teleport tools.
Never invent progress; read the existing HUD and review the actual images.

Plan complete short attempts, then inspect what happened and improve the next
attempt. You do not have to succeed immediately. Keep trying, learn from failed
jumps, and explain the adjustment. When you finish a response you will receive
another instruction to review your attempt and continue. User instructions and
manual takeover take priority.

W launches you. In the air, release W and strafe with A/D while turning the
mouse in the same direction. Space jumps only on a new press; holding Space
does not auto-hop. Either wheel direction also queues a jump. R restarts the
whole course. Use no practice shortcuts. The game keeps running while you think,
so include enough input steps to execute and observe your planned jump.

game_input accepts simultaneous keys and relative mouse movement in 10 ms ticks.
mouse_dx and mouse_dy are total CSS pixels across a segment, not pixels per tick.
Positive x turns right, positive y looks down, and one CSS pixel is 0.0011 radians.
For example, a 20-tick segment with mouse_dx:10 moves the mouse right by 0.5 pixels
per tick for 200 ms. Key holds carry across adjacent segments and release at the
end of the batch. To jump twice, release Space before pressing it again.

Snapshots are recorded every 100 ms during agent control, including between
tool calls. game_input returns samples from its batch. Use review_attempt to
inspect nearby frames of a missed jump before trying again. Recorded images are
history; request game_input with actions:[] when you need a fresh observation.
