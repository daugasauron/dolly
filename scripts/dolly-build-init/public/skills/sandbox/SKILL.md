---
name: sandbox
description: What this sandbox holds and reaches - the requests it may make, its packages, its files and the user's. Read it before a task that uses the network or a tool the sandbox may lack, and when a request fails.
---
- The page lets this sandbox make only the requests its recipe declares: the
  `HTTP` rows of `/etc/dolly/Dollyfile` (`/network` lists them). Any other is
  refused before it leaves the browser: curl ends with status 9. Do not try
  another host or spelling; tell the user which row the project's recipe
  would need, such as `HTTP GET https://pypi.org/simple/*`.
- The tools are the image's: `cat /etc/dolly/installed` lists its packages.
  Nothing installs another here (no npm, apt or `amy install`); one more is
  a row the project adds to its recipe.
- `/workspace` is the project, written from the site at each boot. Changes
  stay in this tab: the user keeps them with Save (Ctrl+Shift+S), and the
  `download` tool hands them a file. The `upload` tool asks them for one.
