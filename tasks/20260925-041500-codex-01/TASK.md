# Investigate rope and winch links between character parts

- STATUS: OPEN
- PRIORITY: 180
- TAGS: game,physics,builder

Follow up the rope idea from the cargo launcher discussion. Define editable
endpoints and length, render the rope, and save/restore its state. Box3D distance
joints can enforce an upper distance limit with slack below it; verify that the
rope pulls but never pushes. Consider a motor-limited winch controlled by normal
character keys. Test suspended loads, reaction forces, slack and restoration.

The first cargo slinger uses ordinary turntables and a magnet, so it does not
depend on this investigation. Keep any rope behavior generic, with no special
case for a named machine.
