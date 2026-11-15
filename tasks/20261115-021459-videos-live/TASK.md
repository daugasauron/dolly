# The demos page's recordings, made again on the published site

- STATUS: OPEN
- PRIORITY: 2
- TAGS: demo,recording,0.1.7

Owner (2026-11-14): "The problem I have is that some of the demo videos refer to localhost, I don't
like that. I want them to use the deployed slopshare.dev environment (so need to be recreated)."

0.1.7 was deployed without `/v0.1.7/agents/`; the page goes out once its recordings show the
published site. Branch `feature/videos-live` (`work/vidlive`), from `v0.1.7`. Brief:
`work/briefs-2026-11-15/videos-live.md`. Only `sites/slopshare.dev/agents/` changes.

## Which recordings showed a local address

Every frame text of the page's 44 videos was read by OCR (RapidOCR on a full-size frame every 3 s,
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
