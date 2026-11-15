# Voxel Flyover 7: life by place: boats, gulls, geese, balloons, whales

- STATUS: OPEN
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4`. Branch `feature/flyover-4`. Overlaps `tasks/20261115-121944-research-12` (life by place, season and hour).

Owner (2026-11-15 19:40): "The birds are a super nice addition. [...] I want people to feel like they are exploring a world where they can find new things or combinations of things."

Done when: several kinds of life are met by place, season and hour, each a grid whose shader places it (no state), none popping in or out, looked at in stills; frame times hold on both adapters.

## State (2026-11-15, 23:40)

In the game, each a grid that follows the flight and a shader that places its cell's own: sailing boats on the sea, more of them off a town, each on a round of its own, smaller the shallower the water, a lamp at the bow by night (`afloat.gdshader`); gulls that wheel over a coast and, in spring and autumn, wedges of geese that cross the sky along the wind (`wings.gdshader`); balloons over the board's ceiling, one cell in six, striped in their own two colours, their burners alight at night now and then (`aloft.gdshader`); whales in the deep sea, one cell in five, that show their back, blow and go under every 24 s (`whale.gdshader`). Looked at over the sea (`at.sh`), the balloons and whales with every cell filled and the whale held up. On the AMD GPU with all of it: 30.0 a second at its level. Left: the image's test, the numbers on the NVIDIA card with nothing else drawing, a take; life on land (herds, smoke, lights that move).
