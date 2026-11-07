# A graphics frame of another shape than the page is stretched to it

- STATUS: OPEN
- PRIORITY: 140
- TAGS: display,input,page,bug,0.1.6

Found by Godot (`tasks/20261107-131836-godot`, 2026-11-08). Dodge the Creeps draws a 480 by 720
portrait frame; the page, 1600 by 1000 in the session, shows it 3.3 times wider than tall
(`work/godot-dev/uploads/dodge-2.png`). An SDL program's 4:3 frame on a 16:10 page is stretched
too, less visibly. A program picks its frame's size (`dolly_display_set_size`), and the canvas
element fills the terminal's area whatever that size is: `src/browser.mjs` styles `#display` at the
area's full width and height and gives it `object-fit: contain` only once the image has ended.

The pointer follows the stretch: `host/input/input.mjs` (`pushPointer`) maps the element's whole
box onto the frame. So a frame drawn in proportion needs both:

1. While a graphics lease holds the canvas, the frame is drawn at its own shape, centred in the
   area (`object-fit: contain`), and the terminal's frame, which has the area's shape, is unchanged.
2. The pointer maps the frame's box within the element, not the element's; a position in the bars
   is outside the frame.

Done when: Dodge the Creeps shows in proportion with bars beside it, a click on the game lands
where the frame shows it (a test that clicks a known point of a frame of another shape than the
page), and the terminal and the SDL tests pass unchanged in Chromium and Firefox.
