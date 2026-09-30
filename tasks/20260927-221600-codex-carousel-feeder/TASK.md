# Restore the shed-loader to carousel cargo chain

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: game,logistics

In the real 20-minute world, Nekote makes no pickups and the carousel exhausts
its initial parcels. All eight fixed six-metre pickup staging points for the
chosen parcel are obstructed. Delayed steering-rate feedback and repeated gear
reversals then prevent the car from completing alignment even on a viable route.

The controller now sizes staging clearance from its observed footprint, rejects
blocked staging points, and replans if they become obstructed. Steering uses the
velocity-motor contract directly. Pickup alignment holds its gear, starts the
progress watchdog after the steering settles, and reverses or replans when its
observed swept path is obstructed. Driven-wheel speeds fit the observed wheel
positions and steering angles; motor forces and cargo masses are unchanged.

A 20-second flat-ground comparison with identical 0.15 throttle, 0.6-radian
steering and force limits measures 0.0171 rad/s turning with equal wheel speeds
versus 0.0732 rad/s with the geometry fit (4.28 times faster). Forward speeds are
0.319 and 0.362 m/s; minimum up is 0.999998. Evidence: `wheel-locked` and
`wheel-twist` in `build/action-front-20260927/`.

The complete populated proof starts from the actual 163-actor, 1200-second save,
changing only Nekote's embedded source. Recursive comparison verifies every
other input field. Nekote physically retrieves parcel 74, transports it, and
releases it at 1510.933 s with 22.531 N external support for its 3.651 N weight
and speed 0.0126 m/s. Carousel 65 physically grips that same parcel at 1618.250 s.
At 1800 s all original actors remain, 172 objects exist, and there are no
controller faults or removals. Other teams complete deliveries during the run.

The initial browser was interrupted after its 1440-second checkpoint during a
host-wide memory shortage. The proof continues that exact checkpoint and cached
Wasm binary without changing state; the resumed six minutes finish successfully.
Host memory remains healthy and the disposable browser stays near 1.4 GiB.
Evidence: `build/action-front-20260927/nekote-full-v7/`, `nekote-resume-v7/`, and
`build/overnight-20260928/nekote-complete-proof.json`. Source SHA-256:
`1d566894d76b7d18f7bc9f97d0c09f45cf40d6c91309ac7956e5625a785c2704`.

The retained `slopyard-carousel-feeder.c` regression uses three real actors
and the warehouse terrain: pickup 78.667 s, supported placement 238.617 s,
carousel grip 249.333 s. The exact fixture compiles/runs inside Dolly with no
faults (`build/action-front-20260927/nekote-regression/`).
