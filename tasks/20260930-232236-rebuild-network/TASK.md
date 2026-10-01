# Page rebuilds can fetch unpinned bytes into reproducible images

- STATUS: CLOSED
- PRIORITY: 285
- TAGS: bug,build,reproducibility,boundary

`/IMAGE/rebuild/`, custom-session and Studio builds run with the page's HTTP
policy (`src/browser.mjs` `buildNetwork = localServicesTransport(httpPolicy)`),
which is unrestricted on the demo site. A recipe step such as `SLOP curl …`
can therefore fetch bytes no pin names, and the result is cached under an
identity that claims to be reproducible from its recipe graph. CI builds
already get only their pinned inputs. (Dollyfile design gap 1 in
`20260930-223000-dollyfile-design`; raised again by the Fable review,
2026-10-01.)

Owner decision needed: give every build only the URLs its recipe graph pins
(recommended; running images keep the page policy), or mark images built with
unpinned network access as not reproducible.

Since `20260930-230823-full-urls` every build input is a URL in the pinned
graph: published files are already exact grants by canonical URL, fetched from
the page's own release, so a pinned-only build policy adds only the graph's
external `SOURCE` URLs as exact GET rules (as CI builds do today).

## Done when

- A rebuild whose recipe fetches an unpinned URL fails explicitly (or is
  marked non-reproducible, per the decision), with a browser test; pinned
  inputs still build in Chrome and Firefox.

## Decision (owner, 2026-10-01)

Leave as is: builds keep the page's HTTP policy.
