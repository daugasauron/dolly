# Deep hedger, for the owner: at a pathwise price an option bought is a stock strategy

- STATUS: CLOSED
- PRIORITY: 145
- TAGS: dh,owner

Two of the owner's decisions meet here (`demos/deep-hedger/THEORY.md`, decisions 12 and 13;
section 5, item 4). Options hedge options: "Other people can hedge with options as well. This is
a core idea" (braut, 2026-07-22). And their prices along a path are pathwise: "the price of the
option at t is the *actual* cost of hedging it until expiry using the *current* hedger for this
path only" (braut, 2026-07-23); "Yes it depends on future prices, but the hedger has no idea
about future prices, and that's what matters." (braut, 2026-07-22).

## State 2026-11-17

An argument of this reconciliation, from the ledger alone; the owner has not seen it.

Let `W_i(t..T)` be what contract `i`'s short hedge gains in the stock from day `t` to its
expiry on a path, costs included. Its pathwise ask on day `t` is `Y_i - W_i(t..T)`. A book that
buys `i` at that price and holds it receives `Y_i` and is left with `W_i(t..T)`: exactly the
result of running `i`'s stock hedge itself. Selling it before expiry at its pathwise bid, `Y_i`
plus the long hedge's gains, leaves the two hedges' gains and no payoff either. So every trade
in pathwise-priced options is a stock strategy, which the book's hedger can already hold; by
induction from the last day back, also when `i`'s own hedge trades options at such prices. The
risk a book can reach is the same as with the stock alone, and no spread tightens. The hedger
not knowing the future does not change it: the sums above hold path by path.

What an option hedges with is a price fixed on the day it trades: then the buyer gives up a
known amount and the seller keeps the path's risk. That is a price made from what is known that
day, an average over the futures of that state, which the agents proposed and the owner refused
three times (task dh-10).

For the owner, since it decides what task dh-06 builds: pathwise prices, and options that
change nothing; or prices of the day's state, and a market in which they hedge. The demo's
measurement points to the second: the confidence AAPL's quotes imply leaves no room for the
risk of a daily stock hedge at the money (task dh-19).

## The owner, 2026-11-17 evening, second answer

Closed: the question does not arise. "there is no such thing as a \"pathwise rule\" [...] At
any time t in a path, the things that are known to me today are the price of the underlying
(including spread), and all the option quotes today, induced backwards from yesterday
*somehow*." So a book that buys an option on a day pays that day's quote, known that day, and
the option hedges: "if the current law has gigantiv downside tail [...] it might be good on
average to get put protection on that even though the spread is large." What task dh-06 builds
is that market; how a day's quotes are made from the next day's is its open design.
