# Deep hedger: a live option chain a browser can read

- STATUS: OPEN
- PRIORITY: 190
- TAGS: dh,demo,http

Owner (2026-11-16): "load option price data from somewhere (live), yahoo or something (if they
accept CORS) [...] Start with a name that is very liquid."

A Dolly program reaches the network through the HTTP broker, which is the page's `fetch`: a
response without CORS headers is an `EIO` (`docs/http.md`). So the source has to send
`Access-Control-Allow-Origin` to any origin. No relay, no broader authority.

## State 2026-11-16

Measured with `curl -D - -H 'Origin: http://127.0.0.1:9050'` on 2026-11-16, 13:45 UTC:

| Source | Answer | CORS header |
| --- | --- | --- |
| `query2.finance.yahoo.com/v7/finance/options/SPY` | 429, and the endpoint wants a cookie and crumb | none |
| `cdn-api.cboe.com/api/global/delayed_quotes/options/SPY.json` | 200, 5.6 MB, bid and ask of every contract | none (`Vary: Origin` only) |
| `api.nasdaq.com/api/quote/SPY/option-chain` | 200 | none |
| `api.marketdata.app/v1/options/chain/AAPL/` | 203, bid, ask, sizes, strike, expiry, underlying price | `access-control-allow-origin: *` |
| `api.marketdata.app/v1/options/chain/SPY/` | 401 without a token | `*` |

Decision: marketdata.app. AAPL is the name it serves without an account, it is among the most
liquid single names, and it is the name every earlier attempt used (the Dubach AAPL data). One
request, `?expiration=all&from=…&to=…&strikeLimit=…`, returns the chain as columns (960 contracts,
159 kB). Without a token the quotes are the last session's (`updated` was Friday's close on Monday
before the open; status 203). With the owner's token in the GUI any symbol and current quotes.
SPX or SPY, European or more liquid, need that token.

Left: the request from the page itself in Chrome and Firefox (the image's test).
