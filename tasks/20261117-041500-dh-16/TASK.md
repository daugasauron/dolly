# Deep hedger, to confirm: in-the-money puts that early exercise prices are left out

- STATUS: OPEN
- PRIORITY: 60
- TAGS: dh,owner

A choice of the reconciliation, not the owner's decision. It answers conflict 6 (task dh-12)
and bends decision 17 of `demos/deep-hedger/THEORY.md` ("NOT show only OTM. I want to show
all.", braut, 2026-08-12).

`dh-gui` keeps a put that is in the money only while the interest on its strike until expiry,
`(1 - D) K`, the most early exercise can be worth, is at most half its band. Calls stay at
every strike: without a dividend before expiry a call is not exercised early.

## State 2026-11-17

In `dh-gui.cpp` (`load_chain`). On AAPL's chain of 2026-11-13 it leaves the in-the-money puts
of the 3- to 25-day expiries in (6 or 7 each) and takes all of the 45-day expiry's out. The
bound is generous: it also drops puts just in the money, whose early exercise is worth a small
part of it.

Also chosen there, for the same confirmation: the carry of an expiry is `D = (S - (C - P)) / K`
over the strikes within 5% of the stock, `F = S / D`, which assumes no dividend before the
expiry; expiries of 2 to 64 business days, at most 8; no quote with a bid under three cents
("quotes in the wings that are limited by tick size are removed", sig-mmd, 2026-07-08).
