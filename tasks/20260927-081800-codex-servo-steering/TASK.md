# Steer wheeled vehicles through articulated servo axles

- STATUS: OPEN
- PRIORITY: 270
- TAGS: game,controls,physics

The user wants a servo hinge between wheel axles instead of clunky differential
wheel-speed/friction steering. Use existing suitable joints or add a small
physical servo mode only if needed. Character programs must visibly command the
steering joint and propulsion through the generic input/sensor interface.

Start with a builder car and representative working cargo vehicles; replace
turning by wheel-speed difference with joint-angle steering. Verify left/right,
reverse, centering, turning radius, loaded stability and terrain navigation with
real contact forces. Preserve configurable controls, visible Lua programs, old
saves and builder editing; no vehicle-name rules. Complete after autonomous and
manual browser driving, populated deliveries and local image verification.
Requested September 27; work deadline 12:00 JST (03:00 UTC). Evidence root:
`build/mechanics-20260927/`. Preserve the 07:45 checkpoint while iterating.

First in-Dolly trial `steering` passes the new articulated builder car. The
visible generic driver discovers vertical hinges with descendant wheel axles,
servos their angle and commands equal wheel speeds. Four seconds straight moves
9.545 m; left/right end at x−3.750/+3.764 m with body headings−54/+53 degrees.
Reverse steering and automatic centering pass; up remains1.0, maximum joint
separation .00966 m. Loaded/autonomous vehicles, save/reload and rendered builder
verification remain due. Sources are not packaged into9097 yet.
