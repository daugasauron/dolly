# Serve /robots.txt that points to the source repository

- STATUS: OPEN
- PRIORITY: 200
- TAGS: site,docs

Owner (2026-10-05): "add a task to add /robots.txt file, linking to the gitrepo
source etc."

`robots.txt` is honoured only at a host root: daugasauron.com can serve it;
`daugasauron.github.io/dolly/robots.txt` is not consulted by crawlers.

## Work

Crawl rules that keep crawlers off the large binary assets, a `Sitemap:` line,
and comment lines naming the source repository and the licences page
(`20261005-131648-licences`). Agents are this project's audience: decide
whether an `llms.txt` earns its place and record the decision.

## Done when

- The local server and the static export serve it, and a test fetches it.
