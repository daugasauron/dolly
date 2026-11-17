# Deep hedger: event dates as inputs of the law

- STATUS: OPEN
- PRIORITY: 110
- TAGS: dh,demo

The owner's generator knows the calendar's events and nothing else about them: "the only
information I want to give it is the actual date of events" (braut, 2026-08-05;
`demos/deep-hedger/THEORY.md`, decision 18).

## State 2026-11-17

Not in the demo. The law's weights depend on the interval between listed expiries and its
volatility state on the path's own past (task dh-17); a day is not marked. What it takes: the
dates (the feed has none: earnings would be typed, or read from another source the page can
read), and a scale of its own for a marked day, fitted with the rest. Done when a chain that
spans an earnings date fits with the event's day visibly its own on the Law tab.
