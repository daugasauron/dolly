# A built image whose ENTRY program was not retained builds green and opens to a blank terminal

- STATUS: OPEN
- PRIORITY: 280
- TAGS: bug,dollyfile,studio

Found while recording the Studio video (`20261006-094507-studio-video-game`,
take g2): the agent compiled its game to `/usr/bin/neon-drift`, forgot
`EXPORTS TOOL neon-drift`, and `dollyfile-build` reported success. Open image
then showed an empty terminal with a cursor and nothing else.

## Reproduce (release `c60a2c6f` on localhost:9005, headless Chrome)

Paste on `/custom/` (Run a Dollyfile) and press Build and run:

```text
DOLLY 6
APPLICATION entry-missing
REQUIRES HOST display@0
REQUIRES HOST download@0
REQUIRES HOST http@0
REQUIRES HOST snapshot@0
REQUIRES HOST upload@0

FROM https://daugasauron.com/Dollyfile-system 041c6f482c61b6afba4741e202fdbffb09adb3c6f25fa0be64af02a7f06fafa4

SLOP cp /bin/echo /usr/bin/greet
SLOP /usr/bin/greet built

ENTRY /bin/foreground -i /usr/bin/greet hello
```

Observed: the build log ends `dollyfile: image entry-missing complete;
retained 2201 paths … starting image entry...`; then
`document.documentElement.dataset.dollyStatus` is `exited` and the page is a
blank terminal with only the cursor: no error text, no shell. The same recipe
through Studio's `dollyfile-build` ends "built. Open the completed image in a
new tab", and that tab is equally blank.

From a shell in such an image the cause is one line:
`foreground: /usr/bin/greet: No such file or directory` (status 127). As the
image's ENTRY that message never reaches the screen.

## Why it matters

An unretained program is the most likely recipe mistake (retention is
explicit), and both the agent and the visitor get a green build followed by a
screen that says nothing. Unsupported or failed operations should fail
explicitly.

## Done when

- A recipe whose ENTRY program (the word after `/bin/foreground [-i]`, or the
  ENTRY program itself) is not in the finished image fails the build, naming
  the ENTRY line and the missing path; or, at least,
- an image whose entry exits at once shows why (the entry's stderr and exit
  status) instead of a blank terminal.
