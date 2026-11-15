# The demos page's recordings, made again on the published site

- STATUS: CLOSED
- PRIORITY: 2
- TAGS: demo,recording,0.1.7

Owner (2026-11-14): "The problem I have is that some of the demo videos refer to localhost, I don't
like that. I want them to use the deployed slopshare.dev environment (so need to be recreated)."

0.1.7 was deployed without `/v0.1.7/agents/`; the page goes out once its recordings show the
published site. Branch `feature/videos-live` (`work/vidlive`), from `v0.1.7`. Brief:
`work/briefs-2026-11-15/videos-live.md`. Only `sites/slopshare.dev/agents/` changes.

## Which recordings showed a local address

The text of the page's 44 videos was read by OCR (RapidOCR on a full-size frame every 3 s,
`work/videos-2026-11-15/scan/ocr.py`, texts in `scan/txt/`; it reads the 10-pixel terminal text of
the agent recordings, their `https://daugasauron.com/…` recipe lines for one) and searched for
`127.`, `localhost`, `0.0.0.0`, `192.168.`, `[::1]`, a host with a port and `http://`. Contact
sheets of the 36 recordings of 1, 2 and 8 November were also looked at: all are kiosk recordings
with no address bar.

- On screen: `rclone-sync` (address bar, CORS origin, amy), `session-travel` (both address bars,
  amy), `x11-workbench` (amy's "fetching … from http://127.0.0.1:9148/" in xterm and Ghostty) and
  `npm-pi-agent`, which stays: its subject is serving your own build on your own machine.
- Recorded from a local server with nothing on screen (kiosk mode): `godot-airtime`, `wine-tcc`,
  `local-model` (its last caption said "the local server") and `voxel-flyover` (a checkout).
- The other 36: no local address found.

## Done when

Each of the seven is recorded from `https://slopshare.dev/v0.1.7/`, in place with its poster and
its section's text, under 25 MiB, playing from the page in headless Chrome and Firefox, with no
address of a local server of Dolly's in any frame.

## Closed (2026-11-15)

All seven are in place (`ad0ee49bf`, `c69669274` and the commit that closes this), each recorded in
Chrome 156 (and Firefox 155 for the sessions) from `https://slopshare.dev/v0.1.7/` with a new
browser profile; how each was made is in `work/videos-2026-11-15/NAME-live/README.md`.

| video | was | is |
| --- | --- | --- |
| godot-airtime | 2:10, 16.0 MiB | 2:08, 17.3 MiB |
| wine-tcc | 1:18, 7.7 MiB | 1:18, 7.6 MiB |
| x11-workbench | 2:30, 7.4 MiB | 2:32, 10.5 MiB |
| local-model | 1:09, 1.9 MiB | 1:07, 2.6 MiB |
| rclone-sync | 1:57, 2.6 MiB | 2:19, 3.1 MiB |
| session-travel | 1:00, 1.6 MiB | 1:05, 1.6 MiB |
| voxel-flyover | 2:09, 24.05 MiB | 2:10, 24.16 MiB |

- No local address: the OCR search above, on a frame every 2 s of the seven cuts
  (`scan/txt-new/`), finds none in six. `rclone-sync` shows `127.0.0.1:8090`, the machine's own
  WebDAV server that the story is about, and nothing else local: its page is
  `slopshare.dev/v0.1.7/default/`, and its section says so. The published page reaches that
  server after Chrome's prompt ("slopshare.dev wants to: Access other apps and services on this
  device"), which the take shows and allows with a real click.
- Each plays a second from the page in headless Chrome 156 and Playwright's Firefox 155, 1920 by
  1080, with its poster (`work/videos-2026-11-15/plays.log`); `test/site-release.test.mjs` passes
  (each file within 25 MiB).
- What the takes measured differently, in the captions and the page: the local model's image is a
  download of 1,567 MiB (12 minutes here, shown at 60x) and it answered in 35 s at 17 to 25 tokens
  a second; Airtime's export took 2.3 s and its autopilot ran at 59.5 frames a second; `mojo build`
  took 6.8 s. 0.1.7's Airtime has a `_ready()` in `foundry.gd`, so the edit is on lines 147 and
  148.
- Seen and not looked into: the game that Godot's editor runs presents 30 frames a second on gpu@0
  where the page's own start of it presents 60 (`godot-airtime-live/README.md`).
- `voxel-flyover` is version 3's game as v0.1.7 serves it; version 4's recording replaces it.
