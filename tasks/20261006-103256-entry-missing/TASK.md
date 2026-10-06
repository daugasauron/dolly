# A built image whose ENTRY program was not retained builds green and opens to a blank terminal

- STATUS: CLOSED
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

## Fix (branch `fix/entry-missing`, 2026-10-06; browser checks still to run)

Rule, enforced by the engine when it seals (`entry_retained`, `src/dollyfile.c`,
against the same retained set the manifest is written from):

- ENTRY's program, and the program `/bin/foreground [-i]` starts, must be
  retained regular files (link targets too). `/bin/foreground` without an
  absolute program fails as well.
- Every other word naming a file or directory that exists when the recipe
  finishes must be retained too: it would be gone when the image opens.
- A word that names nothing at seal time passes: it may be a file the program
  creates or a `-c` command string, which the engine cannot tell from a typo.
  `/tmp` and `/workspace` themselves pass (every image has them, empty).

Rejected: "every absolute-path word must be retained" fails legitimate
entries (`-c '/usr/bin/x; y'`, a file to create in `/workspace`).

Messages (one line, with the declaration to add):

    dollyfile: ENTRY needs /usr/bin/greet, which the image does not retain: add EXPORTS TOOL greet
    dollyfile: ENTRY needs PATH, which the image does not retain: add FILE PATH | add FOLDER PATH
    dollyfile: ENTRY needs PATH, which no image retains: /tmp and /workspace start empty
    dollyfile: ENTRY program PATH is not a file when the recipe finishes
    dollyfile: ENTRY /bin/foreground [-i] takes the absolute path of a program

Lint: `npm run lint:dollyfiles` rejects an ENTRY program that no recipe of the
chain declares (FILE, exported TOOL of that name, or under a FOLDER, path
export or COPY destination) or that lies in scratch. It cannot know whether a
file exists, what a FOLDER holds, or which arguments name files. Studio's
`dollyfile-lint` reads one file and cannot see the base, so it is unchanged:
there the build's message is the check.

Verified natively (no browser, no image build tonight):
`node --test test/dollyfile-parser.test.mjs test/dollyfile-graph.test.mjs`
pass; all 61 catalog recipes lint; the `/bin/foreground -i PROGRAM` chain was
checked once with the native engine in a user-namespace overlay
(`build/entry-evidence/native-foreground.log`).

Unverified, for the integrator after the next seed build (`src/dollyfile.c`
is seed content: the `image inputs` hash changes):

    node test/image-browser.mjs chromium
    node test/custom-session-browser.mjs chromium

Not done: the second done-when item (an entry that exits at once shows why)
is the page's, `20261006-103306-page-ending`.

## Closed 2026-10-07

`fix/entry-missing` (`adce6385`) is in the candidate, which rebuilt every
image on the seed that carries `entry_retained` (`src/dollyfile.c`). The
`image` and `custom-session` suites passed in Chromium and Firefox in the
main round (`work/next/build/next-evidence/browser-final/summary.txt`,
`round-3.log`); `npm run lint:dollyfiles` holds the ENTRY check for the 66
catalog recipes. The second done-when item is also met now, by
`20261006-103306-page-ending` (closed): an entry that exits at once is named
in the page's notice.
