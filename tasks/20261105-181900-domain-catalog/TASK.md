# The site's catalog lacks python-data, ffmpeg and openblas

- STATUS: OPEN
- PRIORITY: 200
- TAGS: bug,site,0.1.6

v0.1.5 (deployed 6 Nov) has neither the images nor their recipes: config/domain-pages-images.txt
never listed them, though this cycle added them and closed the plots task (a Matplotlib PNG in the
terminal), which slopshare.dev's visitors therefore cannot try. 0.1.6's npm work makes numpy,
python-dateutil, pandas, matplotlib and seaborn packages (core/npm-offline); the list should name
them, python-data, ffmpeg and openblas, within the 20,000-file limit (task pages-files: v0.1.6
does not fit as is).

## State (2026-11-07)

`config/domain-pages-images.txt` names python-data, numpy, pandas, matplotlib, seaborn,
python-dateutil, openblas and ffmpeg (`catalog/0.1.6`); `test/dollyfile-graph.test.mjs` passes.
Left: the 0.1.6 round builds them into the domain site, which must fit `tasks/20261105-005808-pages-files`,
and the live check.

Done when: 0.1.6's deployment serves them and `amy install matplotlib` plots in the terminal on
the live site.

## State (2026-11-12)

On the domain release served locally (`127.0.0.1:9045`, release `0d27c879…`, main `03372976a`):
`default`, `amy install matplotlib` (python-dateutil and the rest with it), then a Matplotlib
plot saved as a PNG (16,986 bytes, nothing on standard error), in headless Chrome. Left: the same
on the live site, once the owner deploys 0.1.6.
