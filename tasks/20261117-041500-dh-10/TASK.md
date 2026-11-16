# Deep hedger, for the owner: pathwise option prices

- STATUS: OPEN
- PRIORITY: 40
- TAGS: dh,owner

Conflict 4 of `demos/deep-hedger/THEORY.md` (section 5; decision 13 in section 2).

- **The owner, every time:** "the price of the option at t is the *actual* cost of hedging it
  until expiry using the *current* hedger for this path only" (braut, 2026-07-23); "I disagreed
  with the state binned sheets. I like the current ones." (braut, 2026-08-12); "I disagree
  (again) with your prices depend on the future." (braut, 2026-08-13).
- **The other side is the agents'**, never the owner's: a fill price made of the path's own
  future is not known on the day, so prices should be averages over states.
- **How the owner wanted it settled:** "Regarding measuring instead of arguing - excellent
  idea!!" (braut, 2026-07-22).

## State 2026-11-17

Not measured in any project. It does not arise in the demo, whose hedger trades the stock
only; it arises with task dh-06, where the measurement belongs: the same paths' prefixes with
different futures, the residual's deviation under either fill price.
