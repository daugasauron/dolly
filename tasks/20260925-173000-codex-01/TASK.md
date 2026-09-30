# Keep roaming scouts from driving into nearby walkers

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: game,content,bug

Scout33 became trapped between a raider and Sidelight, alternated forward/reverse,
and drove under the walker's feet. The original encounter had920 contacts,
peak70.05N and a fall at791.833s. Reopening the750s save changes the exact fall
but reproduces contact:410 contacts in60s. See parent20260915-110000.

The generic scout program predicts nearby motion, searches candidate headings,
brakes before turning and uses reverse hysteresis. The first1.2m/s speed cap
made scouts easy to capture; the final variant retains1.8m/s escape speed and
adds hostile clearance. All seven existing patrol/radio variants are retained.

Exact750s replay with the final33 program runs200s with zero contacts and
minimumup.98228; its large trace export failed, but states/results were retained.
The first variant's full exported replay records zero contacts/minup.980523.
Fresh145s final-variant diagnostic has no33/93 contacts. Evidence under
`build/slopyard-compound-regressions-chrome-{scout-clear,fresh-traffic-v2}/`.

Fresh1500s combined catalog preserves every original design; the two tracked
bipeds remain above.950918/.961194 up. This closes the measured traffic defect,
not the broader gait/collision-robustness issue. Ordinary wheel controls only.

Packaged in image37. Chrome/Firefox match all98 catalog programs/blueprints
and restore old plus loaded worlds; see `docs/crash-handoff.md` for evidence.
