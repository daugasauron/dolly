# Deep hedger: SPY, SPX and live quotes, with a token

- STATUS: OPEN
- PRIORITY: 100
- TAGS: dh,demo,http

Owner (2026-11-16): "load option price data from somewhere (live), yahoo or something (if they
accept CORS)". Without an account marketdata.app serves AAPL alone, with the last session's
quotes (task dh-02). `dh-gui` has a field for a token and sends it as the request's
`Authorization: Bearer` header to that host; it is kept nowhere.

## State 2026-11-17

Not tried: there was no token. Unknown until one is used: whether the answer for another symbol
has the same columns; whether `updated` then moves during the session; SPX's symbol and
whether its chain (European, so task dh-12 does not arise) fits the request's `strikeLimit=60`
and the 64-business-day horizon; index options have no stock quote to take the carry from
(`dh-gui.cpp`, `carry`, uses `underlyingPrice`).

Done when a chain other than AAPL's loads and fits in the image with the owner's token.
