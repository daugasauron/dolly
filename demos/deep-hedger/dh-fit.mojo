"""dh-fit: fits the deep hedger's path law to one option chain, on the GPU.

The model is demos/deep-hedger/THEORY.md, sections 3 and 4, with the stock as
the only hedge instrument. Every number of an iteration is made by the kernels
below; the host keeps the parameters (the law's weights and its volatility state's
three numbers, the hedger's network) and their Adam moments.

  dh-fit CHAIN PATHS SEED [ITERATIONS]     fit, reporting on stdout until killed
  dh-fit check CHAIN PATHS [ITERATIONS]    the gradients against finite differences
  dh-fit time CHAIN PATHS                  seconds of an iteration's parts
"""

from std.collections.array import Array
from std.math import exp, log, sqrt, tanh
from std.pathlib import Path
from std.sys import argv
from std.time import perf_counter_ns

from gpu import global_idx
from gpu.host import DeviceBuffer, DeviceContext

# The generator: KERNELS hat-shaped densities of a day's shock on a fixed
# grid, dense near zero and reaching +-20%. Their number is the model's one
# structural choice.
comptime KERNELS = 49
comptime NODES = KERNELS + 2
comptime GRID_SCALE = 0.01019
comptime GRID_STRETCH = 3.68

# The hedger: INPUTS -> HIDDEN relu -> HIDDEN relu -> tanh, one position.
comptime INPUTS = 7
comptime HIDDEN = 16
comptime B1 = HIDDEN * INPUTS
comptime W2 = B1 + HIDDEN
comptime B2 = W2 + HIDDEN * HIDDEN
comptime W3 = B2 + HIDDEN
comptime B3 = W3 + HIDDEN
comptime PARAMS = B3 + 1

comptime MAX_DAYS = 64
# Each path's books are shared among GROUPS threads; a thread sums its books'
# gradient in words of its own, so GROUPS bounds that buffer.
comptime GROUPS = 8
comptime BLOCK = 64
# A contract is strike, expiry day, +1 call or -1 put, bid, ask, band unit, and the charge its
# quotes carry: the nearest closure's at the last report, nothing before the first.
comptime CONTRACT = 7
# A contract's results: bid, ask (the two books' mean replication costs), cost short, cost
# long, deviation short, deviation long, loss, deviation unhedged.
comptime RESULT = 8
# A book's numbers for the backward pass: its residual's mean and deviation, the loss's
# derivative by its price.
comptime BOOK = 3

# The volatility state's numbers: what a day keeps of it, what the size of a day's shock adds,
# what its sign adds. They follow the law's tables in their buffer, then each interval's unit.
comptime STATE = 3
# The mean size of a standard normal number: a shock of that size leaves the state alone.
comptime MEAN_SIZE = 0.7978846
# The state's bounds: a day's scale is between exp(-1.5) and exp(1.5).
comptime MAX_LOG_SCALE = 1.5
# A day of a path: the law's density at its shock, its log scale, its mean move less one, and
# that mean move's derivative by the log scale.
comptime DRAW = 4


# The days at which a book's cost-to-go is looked at again: 1, 2, 3, 5, 8, 12, 17, 23, 30, 38.
comptime CHECKS = 10
# The paths nearest in the stock over which a check day's cost-to-go is averaged.
comptime NEAR = 64

comptime Floats = Pointer[Float32, MutAnyOrigin]


def check_day(k: Int) -> Int:
    return 1 if k == 0 else 2 + (k - 1) * k // 2


def uniform(path: Int, day: Int, seed: UInt32) -> Float32:
    """A number in (0, 1) for a path's day; paths 2n and 2n+1 are antithetic."""
    var h = UInt32(path >> 1) * 0x9E3779B9 + UInt32(day) * 0x85EBCA6B + seed
    h ^= h >> 16
    h *= 0x21F0AAAD
    h ^= h >> 15
    h *= 0x735A2D97
    h ^= h >> 15
    var u = (Float32(h >> 8) + 0.5) / 16777216.0
    return 1 - u if (path & 1) == 1 else u


def curve(h: Float32) -> Float32:
    """(exp(h) - 1 - h) / h^2 of a small h, by its series."""
    return 0.5 + h * (1.0 / 6 + h * (1.0 / 24 + h * (1.0 / 120 + h * (1.0 / 720 + h / 5040))))


def curve_slope(h: Float32) -> Float32:
    """The derivative of curve."""
    return 1.0 / 6 + h * (1.0 / 12 + h * (1.0 / 40 + h * (1.0 / 180 + h / 1008)))


def kernel_growth(lo: Float32, peak: Float32, hi: Float32, scale: Float32) -> Float32:
    """A kernel's mean of exp(scale * shock), less one; the kernel is a hat from
    lo over its peak to hi."""
    var body = (peak - lo) * curve(scale * (lo - peak)) + (hi - peak) * curve(scale * (hi - peak))
    return 2 / (hi - lo) * exp(scale * peak) * body - 1


def simulate(
    law: Floats,
    nodes: Floats,
    interval_of_day: Floats,
    logx: Floats,
    draw: Floats,
    paths: Int,
    days: Int,
    intervals: Int,
    kernels: Int,
    seed: UInt32,
):
    """A path. A day's return is its scale times a shock; the shock is the
    day's law at a uniform number, the law being piecewise linear between the
    nodes (heights, then cumulative mass). The scale is the path's volatility
    state: its logarithm keeps a share of itself each day and moves with the
    size and the sign of the day's shock, in units of the interval's own.
    `kernels` is KERNELS, as a value the compiler does not unroll a loop by."""
    var p = global_idx.x
    if p >= paths:
        return
    var tail = intervals * NODES * 2
    var keep = law[unsafe_offset=tail]
    var swing = law[unsafe_offset=tail + 1]
    var lean = law[unsafe_offset=tail + 2]
    var level = Float32(0)
    var log_scale = Float32(0)
    logx[unsafe_offset=p * (days + 1)] = 0
    for t in range(days):
        var interval = Int(interval_of_day[unsafe_offset=t])
        var base = interval * NODES * 2
        var u = uniform(p, t, seed)
        var lo = 0
        var hi = NODES - 1
        while hi - lo > 1:
            var middle = (lo + hi) // 2
            if law[unsafe_offset=base + NODES + middle] <= u:
                lo = middle
            else:
                hi = middle
        var height = law[unsafe_offset=base + lo]
        var left = nodes[unsafe_offset=lo]
        var width = nodes[unsafe_offset=lo + 1] - left
        var slope = (law[unsafe_offset=base + lo + 1] - height) / width
        var mass = max(u - law[unsafe_offset=base + NODES + lo], 0)
        var root = sqrt(max(height * height + 2 * slope * mass, 0))
        var step = min(2 * mass / (height + root + 1e-30), width)
        var shock = left + step
        var scale = exp(log_scale)
        level += scale * shock
        logx[unsafe_offset=p * (days + 1) + t + 1] = level
        # The day's mean move under its law at this scale, and how it moves with the scale.
        var growth = Float32(0)
        var growth_slope = Float32(0)
        for k in range(kernels):
            var a = nodes[unsafe_offset=k]
            var peak = nodes[unsafe_offset=k + 1]
            var b = nodes[unsafe_offset=k + 2]
            var weight = law[unsafe_offset=base + k + 1] * (b - a) / 2
            var down = scale * (a - peak)
            var up = scale * (b - peak)
            var body = (peak - a) * curve(down) + (b - peak) * curve(up)
            var front = 2 / (b - a) * exp(scale * peak)
            growth += weight * (front * body - 1)
            growth_slope += weight * front * (
                scale * peak * body + (peak - a) * down * curve_slope(down) + (b - peak) * up * curve_slope(up)
            )
        var d = (p * days + t) * DRAW
        draw[unsafe_offset=d] = max(height + slope * step, 0.01)
        draw[unsafe_offset=d + 1] = log_scale
        draw[unsafe_offset=d + 2] = growth
        draw[unsafe_offset=d + 3] = growth_slope
        var e = shock / law[unsafe_offset=tail + STATE + interval]
        log_scale = min(max(keep * log_scale + swing * (abs(e) - MEAN_SIZE) + lean * e, -MAX_LOG_SCALE), MAX_LOG_SCALE)


def policy(
    phi: Floats,
    moneyness: Float32,
    days_left: Float32,
    call: Float32,
    side: Float32,
    log_scale: Float32,
    held: Float32,
    mut inputs: Array[Float32, INPUTS],
    mut first: Array[Float32, HIDDEN],
    mut second: Array[Float32, HIDDEN],
    hidden: Int,
) -> Float32:
    """The position to hold from tomorrow, from what is seen today. `hidden`
    is HIDDEN, as a value the compiler does not know: with constant bounds it
    unrolls every loop of the network, and the adjoint kernel is then more
    WGSL than a software adapter compiles before the browser gives up on it."""
    var horizon = sqrt(days_left / Float32(MAX_DAYS))
    inputs[0] = 8 * moneyness
    inputs[1] = horizon
    inputs[2] = min(max(moneyness / (horizon * 0.15), -4), 4)
    inputs[3] = call
    inputs[4] = side
    inputs[5] = log_scale
    inputs[6] = held
    for i in range(hidden):
        var z = phi[unsafe_offset=B1 + i]
        for m in range(INPUTS + hidden - HIDDEN):
            z += phi[unsafe_offset=i * INPUTS + m] * inputs[m]
        first[i] = max(z, 0)
    for j in range(hidden):
        var z = phi[unsafe_offset=B2 + j]
        for i in range(hidden):
            z += phi[unsafe_offset=W2 + j * HIDDEN + i] * first[i]
        second[j] = max(z, 0)
    var out = phi[unsafe_offset=B3]
    for j in range(hidden):
        out += phi[unsafe_offset=W3 + j] * second[j]
    return tanh(out)


def direction(value: Float32) -> Float32:
    """1, -1 or 0 as the value's sign, without a branch."""
    return max(min(value * 1e30, 1), -1)


def roll(
    logx: Floats,
    contracts: Floats,
    phi: Floats,
    residual: Floats,
    paid: Floats,
    carried: Floats,
    draw: Floats,
    paths: Int,
    days: Int,
    books: Int,
    cost: Float32,
    hidden: Int,
):
    """Every book of a path, hedged from empty to its expiry: what is left
    with the dealer, and what the hedge paid in costs. A position decided on
    day u-1 is bought at day u's price and held from then; it is bought
    forward, so a day earns it the move less the day's mean move on its path,
    and holding stock is a fair game under any law. The hedger sees the
    volatility state its last seen day had. What the hedge has gained before
    each check day is kept, for `carry`. Neighbouring threads
    are neighbouring paths on the same books, so a block runs in step."""
    var thread = global_idx.x
    if thread >= paths * GROUPS:
        return
    var p = thread % paths
    var inputs = Array[Float32, INPUTS](fill=0)
    var first = Array[Float32, HIDDEN](fill=0)
    var second = Array[Float32, HIDDEN](fill=0)
    var row = p * (days + 1)
    var b = thread // paths
    while b < books:
        var c = (b // 2) * CONTRACT
        var side = Float32(1 - 2 * (b % 2))
        var strike = contracts[unsafe_offset=c]
        var expiry = Int(contracts[unsafe_offset=c + 1])
        var call = contracts[unsafe_offset=c + 2]
        var log_strike = log(strike)
        var position = Float32(0)
        var cash = Float32(0)
        var fees = Float32(0)
        var check = 0
        for u in range(1, expiry):
            if check < CHECKS and u == check_day(check):
                carried[unsafe_offset=(check * books + b) * paths + p] = cash
                check += 1
            var price = exp(logx[unsafe_offset=row + u])
            var target = policy(
                phi,
                logx[unsafe_offset=row + u - 1] - log_strike,
                Float32(expiry - u + 1),
                call,
                side,
                draw[unsafe_offset=(p * days + u - 1) * DRAW + 1],
                position,
                inputs,
                first,
                second,
                hidden,
            )
            var fee = cost * abs(target - position) * price
            var grown = 1 + draw[unsafe_offset=(p * days + u) * DRAW + 2]
            cash += target * (exp(logx[unsafe_offset=row + u + 1]) - grown * price) - fee
            fees += fee
            position = target
        var last = exp(logx[unsafe_offset=row + expiry])
        var fee = cost * abs(position) * last
        residual[unsafe_offset=p * books + b] = side * max(call * (last - strike), 0) - (cash - fee)
        paid[unsafe_offset=p * books + b] = fees + fee
        b += GROUPS


def outside(price: Float32, bid: Float32, ask: Float32, unit: Float32) -> Float32:
    """How far a model price is outside the market's band, in band units."""
    if price > ask:
        return (price - ask) / unit
    if price < bid:
        return (price - bid) / unit
    return 0


def beyond(error: Float32) -> Float32:
    """The loss of a distance outside the band: its square up to one band
    width, linear from there, so that a few quotes far out do not rule the fit."""
    var size = abs(error)
    return size * size if size <= 1 else 2 * size - 1


def quote(
    residual: Floats,
    paid: Floats,
    contracts: Floats,
    logx: Floats,
    book_stats: Floats,
    result: Floats,
    paths: Int,
    days: Int,
    books: Int,
    offset: Int,
):
    """A contract's two books. A book's middle is the mean of its residual, what
    replicating it costs on average: the short book's is the model's ask less
    its charge, the long book's minus its bid less its charge. The generator's
    loss is the ask's and the bid's distance outside the market's band,
    nothing inside it. The hedger's is each book's deviation."""
    var i = global_idx.x
    if i >= books // 2:
        return
    var funding = Array[Float32, 2](fill=0)
    var deviation = Array[Float32, 2](fill=0)
    var fees = Array[Float32, 2](fill=0)
    for s in range(2):
        var b = 2 * i + s
        var sum = Float32(0)
        var fee = Float32(0)
        for p in range(paths):
            sum += residual[unsafe_offset=p * books + b]
            fee += paid[unsafe_offset=p * books + b]
        var mean = sum / Float32(paths)
        var squares = Float32(0)
        for p in range(paths):
            var d = residual[unsafe_offset=p * books + b] - mean
            squares += d * d
        deviation[s] = sqrt(squares / Float32(paths) + 1e-12)
        funding[s] = mean
        book_stats[unsafe_offset=b * BOOK] = mean
        book_stats[unsafe_offset=b * BOOK + 1] = deviation[s]
        fees[s] = fee / Float32(paths)
    var c = i * CONTRACT
    var market_bid = contracts[unsafe_offset=c + 3]
    var market_ask = contracts[unsafe_offset=c + 4]
    var unit = contracts[unsafe_offset=c + 5]
    var ask = funding[0] + contracts[unsafe_offset=c + 6]
    var bid = -funding[1] - contracts[unsafe_offset=c + 6]
    var ask_error = outside(ask, market_bid, market_ask, unit)
    var bid_error = outside(bid, market_bid, market_ask, unit)
    var contracts_count = Float32(books // 2)
    book_stats[unsafe_offset=2 * i * BOOK + 2] = 2 * min(max(ask_error, -1), 1) / (unit * contracts_count)
    book_stats[unsafe_offset=(2 * i + 1) * BOOK + 2] = -2 * min(max(bid_error, -1), 1) / (unit * contracts_count)
    var expiry = Int(contracts[unsafe_offset=c + 1])
    # The payoff's own deviation: the risk of a book that does not hedge.
    var payoff = Float32(0)
    var payoff_squares = Float32(0)
    for p in range(paths):
        var paid_out = max(
            contracts[unsafe_offset=c + 2]
            * (exp(logx[unsafe_offset=p * (days + 1) + expiry]) - contracts[unsafe_offset=c]),
            0,
        )
        payoff += paid_out
        payoff_squares += paid_out * paid_out
    payoff /= Float32(paths)
    var r = offset + i * RESULT
    result[unsafe_offset=r] = -funding[1]
    result[unsafe_offset=r + 1] = funding[0]
    result[unsafe_offset=r + 2] = fees[0]
    result[unsafe_offset=r + 3] = fees[1]
    result[unsafe_offset=r + 4] = deviation[0]
    result[unsafe_offset=r + 5] = deviation[1]
    result[unsafe_offset=r + 6] = beyond(ask_error) + beyond(bid_error)
    result[unsafe_offset=r + 7] = sqrt(max(payoff_squares / Float32(paths) - payoff * payoff, 0))


def carry(
    carried: Floats,
    residual: Floats,
    draw: Floats,
    logx: Floats,
    order: Floats,
    contracts: Floats,
    left: Floats,
    paths: Int,
    days: Int,
    books: Int,
):
    """The variance a book's cost-to-go from a check day still has once that
    day's stock and volatility state are known (THEORY.md, section 4: U_h).
    The cost-to-go is the residual with the hedge's gains before that day
    given back. Its mean given the day is a plane in the stock and the
    volatility state over the NEAR paths nearest in the stock; `order` has the
    paths by their stock of each check day. Minus one for a book that has
    expired by then."""
    var id = global_idx.x
    var k = id // books
    if k >= CHECKS:
        return
    var b = id % books
    var day = check_day(k)
    if Int(contracts[unsafe_offset=(b // 2) * CONTRACT + 1]) <= day:
        left[unsafe_offset=k * books + b] = -1
        return
    var total = Float32(0)
    for j in range(paths):
        var start = min(max(j - NEAR // 2, 0), paths - NEAR)
        var p = Int(order[unsafe_offset=k * paths + j])
        var level = logx[unsafe_offset=p * (days + 1) + day]
        var state = draw[unsafe_offset=(p * days + day) * DRAW + 1]
        # Sums over the neighbours of the stock (in percent of the path's own) and the
        # state, each from the path's own, and of the cost-to-go.
        var x = Float32(0)
        var s = Float32(0)
        var xx = Float32(0)
        var xs = Float32(0)
        var ss = Float32(0)
        var c = Float32(0)
        var cx = Float32(0)
        var cs = Float32(0)
        for n in range(NEAR):
            var q = Int(order[unsafe_offset=k * paths + start + n])
            var dx = 100 * (logx[unsafe_offset=q * (days + 1) + day] - level)
            var ds = draw[unsafe_offset=(q * days + day) * DRAW + 1] - state
            var togo = residual[unsafe_offset=q * books + b] + carried[unsafe_offset=(k * books + b) * paths + q]
            x += dx
            s += ds
            xx += dx * dx
            xs += dx * ds
            ss += ds * ds
            c += togo
            cx += togo * dx
            cs += togo * ds
        x /= NEAR
        s /= NEAR
        c /= NEAR
        # The plane's slopes, from the neighbours' covariances; a little is added to the two
        # variances, so that a state that does not vary gets no slope.
        var vx = xx / NEAR - x * x + 1e-7
        var vs = ss / NEAR - s * s + 1e-7
        var cross = xs / NEAR - x * s
        var by_x = cx / NEAR - c * x
        var by_s = cs / NEAR - c * s
        var det = vx * vs - cross * cross
        var slope_x = (by_x * vs - by_s * cross) / det
        var slope_s = (by_s * vx - by_x * cross) / det
        # The plane at the path's own stock and state.
        var togo = residual[unsafe_offset=p * books + b] + carried[unsafe_offset=(k * books + b) * paths + p]
        var miss = togo - (c - slope_x * x - slope_s * s)
        total += miss * miss
    left[unsafe_offset=k * books + b] = total / Float32(paths) * NEAR / (NEAR - 3)


def adjoint(
    logx: Floats,
    contracts: Floats,
    phi: Floats,
    book_stats: Floats,
    gradient_rows: Floats,
    level_rows: Floats,
    held_rows: Floats,
    draw: Floats,
    paths: Int,
    days: Int,
    books: Int,
    cost: Float32,
    hidden: Int,
):
    """The backward pass of roll and quote for a thread's books. For the
    hedger, the derivative of the sum of its books' deviations by its parameters,
    through every day's position and the position it was decided from. For the
    generator, the derivative of the loss by the path's levels with the
    positions held fixed (THEORY.md, section 4), and by each day's mean move. A thread sums into words of
    its own in the three buffers, beside its neighbours' words for the same
    parameter or day: a block's threads then store side by side."""
    var thread = global_idx.x
    if thread >= paths * GROUPS:
        return
    var p = thread % paths
    var threads = paths * GROUPS
    for n in range(PARAMS + hidden - HIDDEN):
        gradient_rows[unsafe_offset=n * threads + thread] = 0
    for u in range(2 * (MAX_DAYS + 1)):
        level_rows[unsafe_offset=u * threads + thread] = 0
    var inputs = Array[Float32, INPUTS](fill=0)
    var first = Array[Float32, HIDDEN](fill=0)
    var second = Array[Float32, HIDDEN](fill=0)
    var back_second = Array[Float32, HIDDEN](fill=0)
    var row = p * (days + 1)
    var b = thread // paths
    while b < books:
        var c = (b // 2) * CONTRACT
        var side = Float32(1 - 2 * (b % 2))
        var strike = contracts[unsafe_offset=c]
        var expiry = Int(contracts[unsafe_offset=c + 1])
        var call = contracts[unsafe_offset=c + 2]
        var log_strike = log(strike)
        var cash = Float32(0)
        var before = Float32(0)
        held_rows[unsafe_offset=thread] = 0
        for u in range(1, expiry):
            var price = exp(logx[unsafe_offset=row + u])
            var after = policy(
                phi,
                logx[unsafe_offset=row + u - 1] - log_strike,
                Float32(expiry - u + 1),
                call,
                side,
                draw[unsafe_offset=(p * days + u - 1) * DRAW + 1],
                before,
                inputs,
                first,
                second,
                hidden,
            )
            held_rows[unsafe_offset=u * threads + thread] = after
            cash += after * (
                exp(logx[unsafe_offset=row + u + 1]) - (1 + draw[unsafe_offset=(p * days + u) * DRAW + 2]) * price
            ) - cost * abs(after - before) * price
            before = after
        var last = exp(logx[unsafe_offset=row + expiry])
        var closing = before
        var left = side * max(call * (last - strike), 0) - (cash - cost * abs(closing) * last)
        # A deviation's derivative by this path's residual, for the hedger; a mean's, for
        # the loss.
        var seed = (left - book_stats[unsafe_offset=b * BOOK]) / (Float32(paths) * book_stats[unsafe_offset=b * BOOK + 1])
        var loss_seed = book_stats[unsafe_offset=b * BOOK + 2] / Float32(paths)
        var in_the_money = max(direction(call * (last - strike)), 0)
        level_rows[unsafe_offset=expiry * threads + thread] += loss_seed * (side * call * in_the_money - closing + cost * abs(closing))

        var carry = seed * cost * direction(closing) * last
        var u = expiry - 1
        while u >= 1:
            var price = exp(logx[unsafe_offset=row + u])
            var now = held_rows[unsafe_offset=u * threads + thread]
            var earlier = held_rows[unsafe_offset=(u - 1) * threads + thread]
            var turn = direction(now - earlier)
            var grown = 1 + draw[unsafe_offset=(p * days + u) * DRAW + 2]
            level_rows[unsafe_offset=u * threads + thread] += loss_seed * (grown * now - earlier + cost * abs(now - earlier))
            # The day's mean move is the law's too: the loss's derivative by it, after the levels'.
            level_rows[unsafe_offset=(MAX_DAYS + 1 + u) * threads + thread] += loss_seed * now * price
            var on_position = carry - seed * (exp(logx[unsafe_offset=row + u + 1]) - grown * price - cost * turn * price)
            _ = policy(
                phi,
                logx[unsafe_offset=row + u - 1] - log_strike,
                Float32(expiry - u + 1),
                call,
                side,
                draw[unsafe_offset=(p * days + u - 1) * DRAW + 1],
                earlier,
                inputs,
                first,
                second,
                hidden,
            )
            var on_out = on_position * (1 - now * now)
            gradient_rows[unsafe_offset=B3 * threads + thread] += on_out
            for j in range(hidden):
                gradient_rows[unsafe_offset=(W3 + j) * threads + thread] += on_out * second[j]
                back_second[j] = on_out * phi[unsafe_offset=W3 + j] * direction(second[j])
                gradient_rows[unsafe_offset=(B2 + j) * threads + thread] += back_second[j]
            var on_held = Float32(0)
            for i in range(hidden):
                var back = Float32(0)
                for j in range(hidden):
                    back += back_second[j] * phi[unsafe_offset=W2 + j * HIDDEN + i]
                    gradient_rows[unsafe_offset=(W2 + j * HIDDEN + i) * threads + thread] += back_second[j] * first[i]
                # A unit that is off passes nothing back: a factor, not a branch,
                # so that the block's threads stay in step.
                back *= direction(first[i])
                gradient_rows[unsafe_offset=(B1 + i) * threads + thread] += back
                for m in range(INPUTS + hidden - HIDDEN):
                    gradient_rows[unsafe_offset=(i * INPUTS + m) * threads + thread] += back * inputs[m]
                on_held += back * phi[unsafe_offset=i * INPUTS + INPUTS - 1]
            carry = on_held - seed * cost * turn * price
            u -= 1
        b += GROUPS


def sum_gradient(gradient_rows: Floats, result: Floats, rows: Int):
    var n = global_idx.x
    if n >= PARAMS:
        return
    var sum = Float32(0)
    for r in range(rows):
        sum += gradient_rows[unsafe_offset=n * rows + r]
    result[unsafe_offset=n] = sum


def return_adjoint(
    level_rows: Floats,
    logx: Floats,
    on_return: Floats,
    draw: Floats,
    interval_of_day: Floats,
    law: Floats,
    paths: Int,
    days: Int,
    intervals: Int,
):
    """A path's backward pass through its days: the loss's derivative by each
    day's shock and by each day's mean move, and by the state's three numbers.
    A return moves every later level; a shock moves its return and, through
    the state, the scale of every later day."""
    var p = global_idx.x
    if p >= paths:
        return
    var threads = paths * GROUPS
    var tail = intervals * NODES * 2
    var keep = law[unsafe_offset=tail]
    var swing = law[unsafe_offset=tail + 1]
    var lean = law[unsafe_offset=tail + 2]
    var later = Float32(0)
    var on_state = Float32(0)
    var by_keep = Float32(0)
    var by_swing = Float32(0)
    var by_lean = Float32(0)
    var t = days - 1
    while t >= 0:
        var on_level = Float32(0)
        var on_growth = Float32(0)
        for group in range(GROUPS):
            on_level += level_rows[unsafe_offset=(t + 1) * threads + group * paths + p]
            on_growth += level_rows[unsafe_offset=(MAX_DAYS + 1 + t) * threads + group * paths + p]
        later += on_level * exp(logx[unsafe_offset=p * (days + 1) + t + 1])
        var d = (p * days + t) * DRAW
        var log_scale = draw[unsafe_offset=d + 1]
        var scale = exp(log_scale)
        var moved = logx[unsafe_offset=p * (days + 1) + t + 1] - logx[unsafe_offset=p * (days + 1) + t]
        var unit = law[unsafe_offset=tail + STATE + Int(interval_of_day[unsafe_offset=t])]
        var e = moved / (scale * unit)
        var next = keep * log_scale + swing * (abs(e) - MEAN_SIZE) + lean * e
        # At its bound the next day's state does not move.
        var passed = on_state * max(direction(MAX_LOG_SCALE - abs(next)), 0)
        on_return[unsafe_offset=p * days + t] = later * scale + passed * (swing * direction(e) + lean) / unit
        on_return[unsafe_offset=(paths + p) * days + t] = on_growth
        by_keep += passed * log_scale
        by_swing += passed * (abs(e) - MEAN_SIZE)
        by_lean += passed * e
        on_state = later * moved + on_growth * draw[unsafe_offset=d + 3] + keep * passed
        t -= 1
    on_return[unsafe_offset=2 * paths * days + p] = by_keep
    on_return[unsafe_offset=2 * paths * days + paths + p] = by_swing
    on_return[unsafe_offset=2 * paths * days + 2 * paths + p] = by_lean


def law_gradient(
    on_return: Floats,
    logx: Floats,
    draw: Floats,
    nodes: Floats,
    interval_of_day: Floats,
    result: Floats,
    paths: Int,
    days: Int,
    intervals: Int,
    offset: Int,
):
    """The loss's derivative by one kernel's weight in one interval. A shock
    drawn at a fixed uniform number moves by minus the kernel's cumulative mass
    there over the law's density there; and the day's mean move is the weights'
    sum of the kernels' own at the day's scale. Less one for a kernel: a
    constant over the kernels changes no logit's gradient, and the differences
    are what a Float32 sum has to keep. The threads after the kernels' sum the
    paths' derivatives by the state's numbers."""
    var id = global_idx.x
    var interval = id // KERNELS
    if interval >= intervals:
        var n = id - intervals * KERNELS
        if n < STATE:
            var total = Float32(0)
            for p in range(paths):
                total += on_return[unsafe_offset=2 * paths * days + n * paths + p]
            result[unsafe_offset=offset + id] = total
        return
    var k = id % KERNELS + 1
    var lo = nodes[unsafe_offset=k - 1]
    var peak = nodes[unsafe_offset=k]
    var hi = nodes[unsafe_offset=k + 1]
    var sum = Float32(0)
    for t in range(days):
        if Int(interval_of_day[unsafe_offset=t]) == interval:
            for p in range(paths):
                var d = (p * days + t) * DRAW
                var scale = exp(draw[unsafe_offset=d + 1])
                var r = (logx[unsafe_offset=p * (days + 1) + t + 1] - logx[unsafe_offset=p * (days + 1) + t]) / scale
                var below = Float32(1)
                if r <= lo:
                    below = 0
                elif r <= peak:
                    below = (r - lo) * (r - lo) / ((peak - lo) * (hi - lo))
                elif r < hi:
                    below = 1 - (hi - r) * (hi - r) / ((hi - peak) * (hi - lo))
                sum -= on_return[unsafe_offset=p * days + t] * below / draw[unsafe_offset=d]
                sum += on_return[unsafe_offset=(paths + p) * days + t] * kernel_growth(lo, peak, hi, scale)
    result[unsafe_offset=offset + interval * KERNELS + k - 1] = sum


def number(text: String) -> Float64:
    """A decimal number as printf writes it."""
    var value = Float64(0)
    var scale = Float64(1)
    var negative = False
    var fraction = False
    var exponent = 0
    var exponent_sign = 1
    var in_exponent = False
    for byte in text.as_bytes():
        var ch = Int(byte)
        if ch == 45:
            if in_exponent:
                exponent_sign = -1
            else:
                negative = True
        elif ch == 46:
            fraction = True
        elif ch == 101 or ch == 69:
            in_exponent = True
        elif ch >= 48 and ch <= 57:
            if in_exponent:
                exponent = exponent * 10 + ch - 48
            else:
                value = value * 10 + Float64(ch - 48)
                if fraction:
                    scale *= 10
    value /= scale
    for _ in range(exponent):
        value = value * 10 if exponent_sign > 0 else value / 10
    return -value if negative else value


struct Chain(Movable):
    """What dh-gui wrote: prices over the forward, strikes over the forward.

    cost C tick K              a stock trade's cost, the options' tick over the forward
    days D1 D2 ...             each expiry's business day, increasing
    STRIKE EXPIRY-INDEX CALL(1|-1) BID ASK     one line a contract
    """

    var cost: Float32
    var tick: Float32
    var expiry_days: List[Int]
    var contracts: List[Float32]

    def __init__(out self, path: String) raises:
        self.cost = 0
        self.tick = 0
        self.expiry_days = List[Int]()
        self.contracts = List[Float32]()
        for line in Path(path).read_text().split("\n"):
            var fields = List[String]()
            for field in line.split(" "):
                if field.byte_length() > 0:
                    fields.append(String(field))
            if len(fields) == 4 and fields[0] == "cost":
                self.cost = Float32(number(fields[1]))
                self.tick = Float32(number(fields[3]))
            elif len(fields) > 1 and fields[0] == "days":
                for i in range(1, len(fields)):
                    self.expiry_days.append(Int(number(fields[i])))
            elif len(fields) == 5:
                var bid = Float32(number(fields[3]))
                var ask = Float32(number(fields[4]))
                self.contracts.append(Float32(number(fields[0])))
                self.contracts.append(Float32(self.expiry_days[Int(number(fields[1]))]))
                self.contracts.append(Float32(number(fields[2])))
                self.contracts.append(bid)
                self.contracts.append(ask)
                self.contracts.append(ask - bid)
                self.contracts.append(0)
        if len(self.expiry_days) == 0 or len(self.contracts) == 0:
            raise Error("no contracts in ", path)
        if self.expiry_days[len(self.expiry_days) - 1] > MAX_DAYS:
            raise Error("an expiry is beyond ", MAX_DAYS, " business days")

    def count(self) -> Int:
        return len(self.contracts) // CONTRACT


struct Adam(Movable):
    var first: List[Float64]
    var second: List[Float64]
    var steps: Int
    var rate: Float64

    def __init__(out self, size: Int, rate: Float64):
        self.first = List[Float64](length=size, fill=0)
        self.second = List[Float64](length=size, fill=0)
        self.steps = 0
        self.rate = rate

    def step(mut self, mut values: List[Float32], gradient: List[Float64]):
        self.steps += 1
        var first_scale = 1 - 0.9 ** Float64(self.steps)
        var second_scale = 1 - 0.999 ** Float64(self.steps)
        for i in range(len(values)):
            self.first[i] = 0.9 * self.first[i] + 0.1 * gradient[i]
            self.second[i] = 0.999 * self.second[i] + 0.001 * gradient[i] * gradient[i]
            values[i] -= Float32(
                self.rate * (self.first[i] / first_scale) / (sqrt(self.second[i] / second_scale) + 1e-8)
            )

    def report(self, group: Int, values: List[Float32]):
        """Three lines of a report for dh-gui's Network tab: a group's values, and
        Adam's two moments of their gradients without their start-up bias."""
        var first_scale = 1 - 0.9 ** Float64(self.steps)
        var second_scale = 1 - 0.999 ** Float64(self.steps)
        var value_line = String("DH net ") + String(group) + " 0"
        var first_line = String("DH net ") + String(group) + " 1"
        var second_line = String("DH net ") + String(group) + " 2"
        for i in range(len(values)):
            value_line += " " + String(values[i])
            first_line += " " + String(self.first[i] / first_scale)
            second_line += " " + String(self.second[i] / second_scale)
        print(value_line)
        print(first_line)
        print(second_line)


def noise(mut state: UInt64) -> Float32:
    """A standard normal number, for the hedger's first weights."""
    var sum = Float64(0)
    for _ in range(12):
        state = state * 6364136223846793005 + 1442695040888963407
        sum += Float64((state >> 40) & 0xFFFFFF) / 16777216.0
    return Float32(sum - 6)


struct Model(Movable):
    """The parameters, their buffers, and one iteration on the GPU."""

    var ctx: DeviceContext
    var paths: Int
    var days: Int
    var intervals: Int
    var books: Int
    var cost: Float32
    var grid: List[Float32]
    var state: List[Float32]
    var unit: List[Float32]
    var interval_of_day: List[Int]
    var logits: List[Float32]
    var weights: List[Float32]
    var phi: List[Float32]
    var result: List[Float32]
    var left: List[Float32]
    var logx: List[Float32]
    var draw: List[Float32]
    var residual: List[Float32]
    var nodes_buffer: DeviceBuffer[DType.float32]
    var interval_buffer: DeviceBuffer[DType.float32]
    var contracts_buffer: DeviceBuffer[DType.float32]
    var law_buffer: DeviceBuffer[DType.float32]
    var phi_buffer: DeviceBuffer[DType.float32]
    var logx_buffer: DeviceBuffer[DType.float32]
    var draw_buffer: DeviceBuffer[DType.float32]
    var residual_buffer: DeviceBuffer[DType.float32]
    var paid_buffer: DeviceBuffer[DType.float32]
    var carried_buffer: DeviceBuffer[DType.float32]
    var order_buffer: DeviceBuffer[DType.float32]
    var left_buffer: DeviceBuffer[DType.float32]
    var book_buffer: DeviceBuffer[DType.float32]
    var gradient_rows: DeviceBuffer[DType.float32]
    var level_rows: DeviceBuffer[DType.float32]
    var held_rows: DeviceBuffer[DType.float32]
    var return_buffer: DeviceBuffer[DType.float32]
    var result_buffer: DeviceBuffer[DType.float32]

    def __init__(out self, chain: Chain, paths: Int, seed: UInt64) raises:
        self.ctx = DeviceContext()
        self.paths = paths
        self.intervals = len(chain.expiry_days)
        self.days = chain.expiry_days[self.intervals - 1]
        self.books = 2 * chain.count()
        self.cost = chain.cost
        self.grid = List[Float32](length=NODES, fill=0)
        for j in range(NODES):
            var u = GRID_STRETCH * (2 * Float64(j) / Float64(NODES - 1) - 1)
            self.grid[j] = Float32(GRID_SCALE * (exp(u) - exp(-u)) / 2)
        # The law starts normal, each interval at its expiry's own volatility: a call at
        # the forward is worth 0.4 deviations of its expiry. That deviation of a day is
        # also the interval's unit, in which the state measures a shock.
        self.logits = List[Float32](length=self.intervals * KERNELS, fill=0)
        self.unit = List[Float32](length=self.intervals, fill=0)
        for interval in range(self.intervals):
            var nearest = -1
            for i in range(chain.count()):
                if (
                    Int(chain.contracts[i * CONTRACT + 1]) == chain.expiry_days[interval]
                    and chain.contracts[i * CONTRACT + 2] > 0
                    and (nearest < 0 or abs(chain.contracts[i * CONTRACT] - 1) < abs(chain.contracts[nearest * CONTRACT] - 1))
                ):
                    nearest = i
            if nearest < 0:
                raise Error("an expiry without a call")
            var strike = Float64(chain.contracts[nearest * CONTRACT])
            var mid = Float64(chain.contracts[nearest * CONTRACT + 3] + chain.contracts[nearest * CONTRACT + 4]) / 2
            var daily = max((mid + (strike - 1) / 2) / (0.4 * sqrt(Float64(chain.expiry_days[interval]))), 0.002)
            self.unit[interval] = Float32(daily)
            for k in range(KERNELS):
                var z = Float64(self.grid[k + 1]) / daily
                self.logits[interval * KERNELS + k] = Float32(
                    max(-0.5 * z * z + log(Float64(self.grid[k + 2] - self.grid[k]) / 2), -30)
                )
        # The state keeps 0.9 of itself a day and moves a tenth with a shock's size.
        self.state = [Float32(2.2), Float32(0.1), Float32(0)]
        self.weights = List[Float32](length=self.intervals * KERNELS, fill=0)
        self.phi = List[Float32](length=PARAMS, fill=0)
        var state = seed
        for n in range(B1):
            self.phi[n] = noise(state) * Float32(sqrt(2.0 / Float64(INPUTS)))
        for n in range(W2, B2):
            self.phi[n] = noise(state) * Float32(sqrt(2.0 / Float64(HIDDEN)))
        for n in range(W3, B3):
            self.phi[n] = noise(state) * Float32(sqrt(1.0 / Float64(HIDDEN)))
        self.result = List[Float32](length=PARAMS + self.intervals * KERNELS + STATE + chain.count() * RESULT, fill=0)

        self.nodes_buffer = self.ctx.enqueue_create_buffer[DType.float32](NODES)
        self.nodes_buffer.enqueue_copy_from(self.grid.unsafe_ptr())
        self.interval_of_day = List[Int](length=self.days, fill=0)
        var interval_of_day = List[Float32](length=self.days, fill=0)
        var interval = 0
        for t in range(self.days):
            # Day t's return ends at day t + 1.
            while chain.expiry_days[interval] < t + 1:
                interval += 1
            interval_of_day[t] = Float32(interval)
            self.interval_of_day[t] = interval
        self.interval_buffer = self.ctx.enqueue_create_buffer[DType.float32](self.days)
        self.interval_buffer.enqueue_copy_from(interval_of_day.unsafe_ptr())
        self.contracts_buffer = self.ctx.enqueue_create_buffer[DType.float32](len(chain.contracts))
        self.contracts_buffer.enqueue_copy_from(chain.contracts.unsafe_ptr())
        self.law_buffer = self.ctx.enqueue_create_buffer[DType.float32](self.intervals * NODES * 2 + STATE + self.intervals)
        self.phi_buffer = self.ctx.enqueue_create_buffer[DType.float32](PARAMS)
        self.logx_buffer = self.ctx.enqueue_create_buffer[DType.float32](paths * (self.days + 1))
        self.draw_buffer = self.ctx.enqueue_create_buffer[DType.float32](paths * self.days * DRAW)
        self.residual_buffer = self.ctx.enqueue_create_buffer[DType.float32](paths * self.books)
        self.paid_buffer = self.ctx.enqueue_create_buffer[DType.float32](paths * self.books)
        self.carried_buffer = self.ctx.enqueue_create_buffer[DType.float32](paths * self.books * CHECKS)
        self.order_buffer = self.ctx.enqueue_create_buffer[DType.float32](paths * CHECKS)
        self.left_buffer = self.ctx.enqueue_create_buffer[DType.float32](self.books * CHECKS)
        self.left = List[Float32](length=self.books * CHECKS, fill=0)
        self.book_buffer = self.ctx.enqueue_create_buffer[DType.float32](self.books * BOOK)
        self.gradient_rows = self.ctx.enqueue_create_buffer[DType.float32](paths * GROUPS * PARAMS)
        self.level_rows = self.ctx.enqueue_create_buffer[DType.float32](paths * GROUPS * 2 * (MAX_DAYS + 1))
        self.held_rows = self.ctx.enqueue_create_buffer[DType.float32](paths * GROUPS * (MAX_DAYS + 1))
        self.return_buffer = self.ctx.enqueue_create_buffer[DType.float32](2 * paths * self.days + STATE * paths)
        self.result_buffer = self.ctx.enqueue_create_buffer[DType.float32](len(self.result))
        self.logx = List[Float32](length=paths * (self.days + 1), fill=0)
        self.draw = List[Float32](length=paths * self.days * DRAW, fill=0)
        self.residual = List[Float32](length=paths * self.books, fill=0)

    def law(mut self) -> List[Float32]:
        """Each interval's density at the nodes and its cumulative mass there;
        then the state's numbers and each interval's unit."""
        var table = List[Float32](length=self.intervals * NODES * 2 + STATE + self.intervals, fill=0)
        var tail = self.intervals * NODES * 2
        table[tail] = self.keep()
        table[tail + 1] = self.state[1]
        table[tail + 2] = self.state[2]
        for interval in range(self.intervals):
            table[tail + STATE + interval] = self.unit[interval]
        for interval in range(self.intervals):
            var largest = self.logits[interval * KERNELS]
            for k in range(KERNELS):
                largest = max(largest, self.logits[interval * KERNELS + k])
            var total = Float64(0)
            for k in range(KERNELS):
                total += exp(Float64(self.logits[interval * KERNELS + k] - largest))
            var base = interval * NODES * 2
            for k in range(KERNELS):
                var weight = exp(Float64(self.logits[interval * KERNELS + k] - largest)) / total
                self.weights[interval * KERNELS + k] = Float32(weight)
                table[base + k + 1] = Float32(2 * weight / Float64(self.grid[k + 2] - self.grid[k]))
            var mass = Float64(0)
            for j in range(1, NODES):
                mass += Float64(table[base + j - 1] + table[base + j]) / 2 * Float64(self.grid[j] - self.grid[j - 1])
                table[base + NODES + j] = Float32(mass)
        return table^

    def keep(self) -> Float32:
        """The share of its logarithm the volatility state keeps a day."""
        return 1 / (1 + exp(-self.state[0]))

    def forward(mut self, seed: UInt32) raises:
        """Paths, every book rolled, every contract quoted."""
        var table = self.law()
        self.law_buffer.enqueue_copy_from(table.unsafe_ptr())
        self.phi_buffer.enqueue_copy_from(self.phi.unsafe_ptr())
        var threads = self.paths * GROUPS
        self.ctx.enqueue_function[simulate](
            self.law_buffer, self.nodes_buffer, self.interval_buffer, self.logx_buffer, self.draw_buffer,
            self.paths, self.days, self.intervals, KERNELS, seed, grid_dim=(self.paths + BLOCK - 1) // BLOCK, block_dim=BLOCK,
        )
        self.ctx.enqueue_function[roll](
            self.logx_buffer, self.contracts_buffer, self.phi_buffer, self.residual_buffer, self.paid_buffer,
            self.carried_buffer, self.draw_buffer, self.paths, self.days, self.books, self.cost, HIDDEN, grid_dim=threads // BLOCK, block_dim=BLOCK,
        )
        self.ctx.enqueue_function[quote](
            self.residual_buffer, self.paid_buffer, self.contracts_buffer, self.logx_buffer, self.book_buffer,
            self.result_buffer, self.paths, self.days, self.books,
            PARAMS + self.intervals * KERNELS + STATE, grid_dim=(self.books // 2 + BLOCK - 1) // BLOCK, block_dim=BLOCK,
        )

    def backward(mut self) raises:
        """Both gradients, into the result beside the quotes."""
        self.differentiate()
        self.sum()

    def differentiate(mut self) raises:
        var threads = self.paths * GROUPS
        self.ctx.enqueue_function[adjoint](
            self.logx_buffer, self.contracts_buffer, self.phi_buffer, self.book_buffer, self.gradient_rows,
            self.level_rows, self.held_rows, self.draw_buffer, self.paths, self.days, self.books, self.cost, HIDDEN,
            grid_dim=threads // BLOCK, block_dim=BLOCK,
        )

    def sum(mut self) raises:
        var threads = self.paths * GROUPS
        self.ctx.enqueue_function[sum_gradient](
            self.gradient_rows, self.result_buffer, threads, grid_dim=(PARAMS + BLOCK - 1) // BLOCK, block_dim=BLOCK,
        )
        self.ctx.enqueue_function[return_adjoint](
            self.level_rows, self.logx_buffer, self.return_buffer, self.draw_buffer, self.interval_buffer, self.law_buffer,
            self.paths, self.days, self.intervals,
            grid_dim=(self.paths + BLOCK - 1) // BLOCK, block_dim=BLOCK,
        )
        self.ctx.enqueue_function[law_gradient](
            self.return_buffer, self.logx_buffer, self.draw_buffer, self.nodes_buffer, self.interval_buffer,
            self.result_buffer, self.paths, self.days, self.intervals, PARAMS,
            grid_dim=(self.intervals * KERNELS + STATE + BLOCK - 1) // BLOCK, block_dim=BLOCK,
        )

    def carry(mut self) raises:
        """Into `left`, each book's variance still to come at each check day, of the
        batch read_batch has just read."""
        var order = List[Float32](length=self.paths * CHECKS, fill=0)
        for k in range(CHECKS):
            var day = min(check_day(k), self.days)
            for p in range(self.paths):
                var level = self.logx[p * (self.days + 1) + day]
                var rank = 0
                for q in range(self.paths):
                    var other = self.logx[q * (self.days + 1) + day]
                    if other < level or (other == level and q < p):
                        rank += 1
                order[k * self.paths + rank] = Float32(p)
        self.order_buffer.enqueue_copy_from(order.unsafe_ptr())
        self.ctx.enqueue_function[carry](
            self.carried_buffer, self.residual_buffer, self.draw_buffer, self.logx_buffer, self.order_buffer, self.contracts_buffer,
            self.left_buffer, self.paths, self.days, self.books,
            grid_dim=(self.books * CHECKS + BLOCK - 1) // BLOCK, block_dim=BLOCK,
        )
        self.left_buffer.enqueue_copy_to(self.left.unsafe_ptr())

    def read_batch(mut self) raises:
        """The last batch's paths, days and residuals, for the reports."""
        self.logx_buffer.enqueue_copy_to(self.logx.unsafe_ptr())
        self.draw_buffer.enqueue_copy_to(self.draw.unsafe_ptr())
        self.residual_buffer.enqueue_copy_to(self.residual.unsafe_ptr())

    def read(mut self) raises:
        self.result_buffer.enqueue_copy_to(self.result.unsafe_ptr())

    def contract(self, i: Int, field: Int) -> Float32:
        return self.result[PARAMS + self.intervals * KERNELS + STATE + i * RESULT + field]

    def loss(self) -> Float64:
        """The generator's: mean squared distance outside the bands."""
        var sum = Float64(0)
        for i in range(self.books // 2):
            sum += Float64(self.contract(i, 6))
        return sum / Float64(self.books // 2)

    def funding(self) -> Float64:
        """The hedger's: the sum of every book's deviation."""
        var sum = Float64(0)
        for i in range(self.books // 2):
            sum += Float64(self.contract(i, 4) + self.contract(i, 5))
        return sum

    def hedger_gradient(self) -> List[Float64]:
        var gradient = List[Float64](length=PARAMS, fill=0)
        for n in range(PARAMS):
            gradient[n] = Float64(self.result[n])
        return gradient^

    def generator_gradient(self) -> List[Float64]:
        """By the logits: the weights are their softmax."""
        var gradient = List[Float64](length=self.intervals * KERNELS, fill=0)
        for interval in range(self.intervals):
            var mean = Float64(0)
            for k in range(KERNELS):
                var at = interval * KERNELS + k
                mean += Float64(self.weights[at]) * Float64(self.result[PARAMS + at])
            for k in range(KERNELS):
                var at = interval * KERNELS + k
                gradient[at] = Float64(self.weights[at]) * (Float64(self.result[PARAMS + at]) - mean)
        return gradient^

    def state_gradient(self) -> List[Float64]:
        """By the state's numbers as they are stored: the kept share's logit, the two others."""
        var at = PARAMS + self.intervals * KERNELS
        var keep = Float64(self.keep())
        return [Float64(self.result[at]) * keep * (1 - keep), Float64(self.result[at + 1]), Float64(self.result[at + 2])]


struct Training(Movable):
    """The optimizers and one joint step: fresh paths, every gradient from
    the same parameters, then both updates."""

    var hedger: Adam
    var generator: Adam
    var state: Adam

    def __init__(out self, intervals: Int):
        self.hedger = Adam(PARAMS, 0.005)
        self.generator = Adam(intervals * KERNELS, 0.05)
        self.state = Adam(STATE, 0.01)

    def step(mut self, mut model: Model, seed: UInt32) raises:
        model.forward(seed)
        model.backward()
        model.read()
        var hedger_gradient = model.hedger_gradient()
        var generator_gradient = model.generator_gradient()
        var state_gradient = model.state_gradient()
        self.hedger.step(model.phi, hedger_gradient)
        self.generator.step(model.logits, generator_gradient)
        self.state.step(model.state, state_gradient)


def generator_differences(mut model: Model, seed: UInt32) raises:
    """The generator's gradient beside a central difference of its loss."""
    model.forward(seed)
    model.backward()
    model.read()
    var gradient = model.generator_gradient()
    var by_state = model.state_gradient()
    for n in range(STATE):
        var kept = model.state[n]
        var step = Float32(0.02)
        model.state[n] = kept + step
        model.forward(seed)
        model.read()
        var up = model.loss()
        model.state[n] = kept - step
        model.forward(seed)
        model.read()
        var down = model.loss()
        model.state[n] = kept
        print("DH check state", n, by_state[n], (up - down) / Float64(2 * step))
    for n in [3, 20, 24, 25, 30, 45, KERNELS + 24]:
        if n < len(model.logits):
            var kept = model.logits[n]
            var step = Float32(0.05)
            model.logits[n] = kept + step
            model.forward(seed)
            model.read()
            var up = model.loss()
            model.logits[n] = kept - step
            model.forward(seed)
            model.read()
            var down = model.loss()
            model.logits[n] = kept
            print("DH check", n, gradient[n], (up - down) / Float64(2 * step))


def ledger(mut model: Model, chain: Chain, seed: UInt32, position: Float64) raises:
    """Three contracts' bid and ask as the kernels made them, beside the same
    from the kernels' paths by the ledger of THEORY.md, section 4, written out
    here for a hedger that holds one constant position."""
    model.forward(seed)
    model.read()
    model.read_batch()
    var row = model.days + 1
    for i in [0, chain.count() // 2, chain.count() - 1]:
        var strike = Float64(chain.contracts[i * CONTRACT])
        var expiry = Int(chain.contracts[i * CONTRACT + 1])
        var call = Float64(chain.contracts[i * CONTRACT + 2])
        var funding = List[Float64]()
        for side in [Float64(1), Float64(-1)]:
            var residuals = List[Float64]()
            for p in range(model.paths):
                var cash = Float64(0)
                for u in range(1, expiry):
                    cash += position * (
                        exp(Float64(model.logx[p * row + u + 1]))
                        - (1 + Float64(model.draw[(p * model.days + u) * DRAW + 2])) * exp(Float64(model.logx[p * row + u]))
                    )
                if expiry > 1:
                    # Bought once on day 1, sold once at the expiry.
                    cash -= Float64(model.cost) * abs(position) * (
                        exp(Float64(model.logx[p * row + 1])) + exp(Float64(model.logx[p * row + expiry]))
                    )
                residuals.append(side * max(call * (exp(Float64(model.logx[p * row + expiry])) - strike), 0) - cash)
            var sum = Float64(0)
            for p in range(model.paths):
                sum += residuals[p]
            funding.append(sum / Float64(model.paths))
        print("DH check", i, model.contract(i, 0), model.contract(i, 1), -funding[1], funding[0])


def check(mut model: Model, chain: Chain, iterations: Int) raises:
    """The ledger beside its recomputation on the host, and each gradient
    beside a central difference of what it differentiates.
    The generator's holds positions fixed: it is exact with a hedger whose
    position is one constant, and after `iterations` of fitting the two
    columns differ by what the hedger's response to the paths adds, which is
    nothing at a hedger that cannot be improved (THEORY.md, section 4)."""
    var seed = UInt32(7)
    # A state that leans, so that every term of its backward pass is checked.
    model.state[2] = -0.1
    model.forward(seed)
    model.backward()
    model.read()
    var hedger = model.hedger_gradient()
    print("DH check hedger: parameter, gradient, difference")
    for n in [0, 5, B1 + 3, W2 + 17, B2 + 2, W3 + 4, B3]:
        var kept = model.phi[n]
        var step = Float32(0.01)
        model.phi[n] = kept + step
        model.forward(seed)
        model.read()
        var up = model.funding()
        model.phi[n] = kept - step
        model.forward(seed)
        model.read()
        var down = model.funding()
        model.phi[n] = kept
        print("DH check", n, hedger[n], (up - down) / Float64(2 * step))
    var trained = model.phi.copy()
    for n in range(W3, B3):
        model.phi[n] = 0
    model.phi[B3] = 0.3
    print("DH check ledger, one constant position: contract, bid and ask of the kernels, of the host")
    ledger(model, chain, seed, Float64(tanh(model.phi[B3])))
    print("DH check generator, one constant position: logit, gradient, difference")
    generator_differences(model, seed)
    model.phi = trained^
    if iterations > 0:
        var training = Training(model.intervals)
        for iteration in range(iterations):
            training.step(model, UInt32(1000 + iteration))
        print("DH check generator, the hedger of", iterations, "iterations: logit, gradient, difference")
        generator_differences(model, seed)


def stretch(profile: List[Float64], at: Int, expiry: Int, k: Int) -> List[Float64]:
    """The k-th stretch of a book's days, up to its expiry: its first day, its last,
    and the variance still to come at each. `profile` holds, from `at`, the variance
    still to come at day 0 and at each check day; it is taken as never rising."""
    var day = Float64(0)
    var togo = profile[at]
    for n in range(k + 1):
        var next_day = Float64(expiry)
        var next_togo = Float64(0)
        if n < CHECKS and check_day(n) < expiry:
            next_day = Float64(check_day(n))
            next_togo = min(max(profile[at + 1 + n], 0), togo)
        if n == k:
            return [day, next_day, togo, next_togo]
        day = next_day
        togo = next_togo
    return [day, day, togo, togo]


def shed(profile: List[Float64], at: Int, expiry: Int, days: Float64) -> Float64:
    """The variance of a book's first `days` days."""
    var whole = profile[at]
    for k in range(CHECKS + 1):
        var part = stretch(profile, at, expiry, k)
        if days <= part[1] or part[1] >= Float64(expiry):
            var share = min(max((days - part[0]) / max(part[1] - part[0], 1e-9), 0), 1)
            return whole - part[2] + (part[2] - part[3]) * share
    return whole


def chain_of_days(profile: List[Float64], at: Int, expiry: Int) -> Float64:
    """The sum of the days' deviations to expiry, a stretch's days taken as alike."""
    var sum = Float64(0)
    for k in range(CHECKS + 1):
        var part = stretch(profile, at, expiry, k)
        sum += sqrt((part[1] - part[0]) * (part[2] - part[3]))
        if part[1] >= Float64(expiry):
            break
    return sum


def days_implied(profile: List[Float64], at: Int, expiry: Int, excess: Float64) -> Float64:
    """The days after which one deviation of what the book has shed is `excess`;
    nothing for no excess, minus one if not even the whole residual's is."""
    if excess <= 0:
        return 0
    var want = excess * excess
    var whole = profile[at]
    if want >= whole:
        return -1
    for k in range(CHECKS + 1):
        var part = stretch(profile, at, expiry, k)
        if want <= whole - part[3]:
            return part[0] + (part[1] - part[0]) * (want - (whole - part[2])) / max(part[2] - part[3], 1e-30)
    return -1


def quartile(values: List[Float64], share: Float64) -> Float64:
    var sorted = values.copy()
    sort(sorted)
    if len(sorted) == 0:
        return 0
    return sorted[min(Int(share * Float64(len(sorted))), len(sorted) - 1)]


def shown_contracts(chain: Chain, path: String) -> List[Int]:
    """The contracts whose hedges a report shows: those dh-gui wrote beside the
    chain (PATH.shown, their indices on a line), else three calls of the middle
    expiry: its lowest strike, the one nearest the forward, its highest."""
    var chosen = List[Int]()
    try:
        for field in Path(path + ".shown").read_text().split(" "):
            var index = Int(number(String(field.strip())))
            if field.strip().byte_length() > 0 and index < chain.count() and len(chosen) < 3:
                chosen.append(index)
    except:
        pass
    if len(chosen) > 0:
        return chosen^
    var day = Float32(chain.expiry_days[len(chain.expiry_days) // 2])
    var lowest = -1
    var nearest = -1
    var highest = -1
    for i in range(chain.count()):
        var strike = chain.contracts[i * CONTRACT]
        if chain.contracts[i * CONTRACT + 1] == day and chain.contracts[i * CONTRACT + 2] > 0:
            if lowest < 0 or strike < chain.contracts[lowest * CONTRACT]:
                lowest = i
            if highest < 0 or strike > chain.contracts[highest * CONTRACT]:
                highest = i
            if nearest < 0 or abs(strike - 1) < abs(chain.contracts[nearest * CONTRACT] - 1):
                nearest = i
    if lowest >= 0:
        chosen.append(lowest)
        chosen.append(nearest)
        chosen.append(highest)
    return chosen^


def fit(mut model: Model, mut chain: Chain, path: String, seed: UInt64, iterations: Int) raises:
    """Generator and hedger move together, each by its own loss, on fresh
    paths every iteration. A report is the mean of the iterations since the
    last one."""
    comptime REPORT = 20
    comptime RANDOM_PATHS = 28
    comptime EXTREME_PATHS = 10
    comptime HEDGED_PATHS = 12
    var training = Training(model.intervals)
    var contracts = chain.count()
    var window = List[Float64](length=contracts * RESULT, fill=0)
    # Each contract's variance still to come at day 0 and at each check day, smoothed over the reports.
    var profile = List[Float64](length=contracts * (CHECKS + 1), fill=0)
    var window_loss = Float64(0)
    var started = perf_counter_ns()
    var line = String("DH nodes")
    for j in range(NODES):
        line += " " + String(model.grid[j])
    print(line, flush=True)
    var iteration = 0
    while iterations == 0 or iteration < iterations:
        iteration += 1
        training.step(model, UInt32((seed + UInt64(iteration)) * 2654435761 & 0xFFFFFFFF))
        window_loss += model.loss()
        for i in range(contracts * RESULT):
            window[i] += Float64(model.result[PARAMS + model.intervals * KERNELS + STATE + i])
        if iteration % REPORT == 0:
            var seconds = Float64(perf_counter_ns() - started) / 1e9
            # Of the window's mean bids and asks, the share inside the market's band;
            # mean spreads of the market and of the model, the hedges' costs, the deviation
            # of what they leave, and the payoffs' own.
            var inside = [0, 0]
            var market = Float64(0)
            var spread = Float64(0)
            var fees = Float64(0)
            var deviations = Float64(0)
            var unhedged = Float64(0)
            for i in range(contracts):
                var bid = Float64(chain.contracts[i * CONTRACT + 3])
                var ask = Float64(chain.contracts[i * CONTRACT + 4])
                for side in range(2):
                    var price = window[i * RESULT + side] / REPORT + Float64(2 * side - 1) * Float64(chain.contracts[i * CONTRACT + 6])
                    if price >= bid and price <= ask:
                        inside[side] += 1
                market += ask - bid
                spread += (window[i * RESULT + 1] - window[i * RESULT]) / REPORT
                fees += (window[i * RESULT + 2] + window[i * RESULT + 3]) / REPORT
                deviations += (window[i * RESULT + 4] + window[i * RESULT + 5]) / REPORT
                unhedged += 2 * window[i * RESULT + 7] / REPORT
            print(
                "DH iteration", iteration, "loss", window_loss / REPORT, "seconds", seconds,
                "inside", Float64(inside[0] + inside[1]) / Float64(2 * contracts), "market", market / Float64(contracts),
                "model", spread / Float64(contracts), "cost", fees / Float64(contracts),
                "risk", deviations / Float64(contracts), "unhedged", unhedged / Float64(contracts),
                "keep", model.keep(), "swing", model.state[1], "lean", model.state[2],
                "bids", Float64(inside[0]) / Float64(contracts), "asks", Float64(inside[1]) / Float64(contracts), flush=True,
            )
            model.read_batch()
            model.carry()
            # What the spreads imply (THEORY.md, section 4). A contract's risk is the mean
            # of its two books'; its spread counts as three ticks at least.
            var fresh = Float64(1) if iteration == REPORT else Float64(0.3)
            var excess = List[Float64](length=contracts, fill=0)
            var half = List[Float64](length=contracts, fill=0)
            var hedge_cost = List[Float64](length=contracts, fill=0)
            var chain_risk = List[Float64](length=contracts, fill=0)
            var whole_risk = List[Float64](length=contracts, fill=0)
            var out_of_the_money = List[Bool](length=contracts, fill=False)
            for i in range(contracts):
                var at = i * (CHECKS + 1)
                var whole = Float64(model.contract(i, 4) * model.contract(i, 4) + model.contract(i, 5) * model.contract(i, 5)) / 2
                profile[at] += fresh * (whole - profile[at])
                for k in range(CHECKS):
                    var togo = Float64(model.left[k * model.books + 2 * i] + model.left[k * model.books + 2 * i + 1]) / 2
                    profile[at + 1 + k] += fresh * (max(togo, 0) - profile[at + 1 + k])
                half[i] = max(Float64(chain.contracts[i * CONTRACT + 5]), 3 * Float64(chain.tick)) / 2
                hedge_cost[i] = (window[i * RESULT + 2] + window[i * RESULT + 3]) / (2 * REPORT)
                excess[i] = half[i] - hedge_cost[i]
                var expiry = Int(chain.contracts[i * CONTRACT + 1])
                chain_risk[i] = max(chain_of_days(profile, at, expiry), 1e-12)
                whole_risk[i] = max(sqrt(profile[at]), 1e-12)
                out_of_the_money[i] = (chain.contracts[i * CONTRACT] >= 1) == (chain.contracts[i * CONTRACT + 2] > 0)
            # What the spreads imply under each closure: a floor every contract of the name
            # pays, in ticks, and for each expiry the closure's own number (the price of a
            # day's deviation, of the whole residual's, the days to get out), at which half
            # the expiry's out-of-the-money contracts have a wider model spread than market
            # spread. A closure's miss: the middle half of log(model / market half spread)
            # over all the out-of-the-money contracts. `closures` holds, for each closure,
            # the floor, the miss, and the expiries' numbers.
            var expiries = model.intervals
            var closures = List[Float64](length=3 * (2 + expiries), fill=1e9)
            var expiry_of = List[Int](length=contracts, fill=0)
            for i in range(contracts):
                for e in range(expiries):
                    if Int(chain.contracts[i * CONTRACT + 1]) == chain.expiry_days[e]:
                        expiry_of[i] = e
            for ticks in [Float64(0), 0.5, 1, 1.5, 2, 3, 4, 6, 8]:
                var floor = ticks * Float64(chain.tick)
                for closure in range(3):
                    var numbers = List[Float64](length=expiries, fill=0)
                    var errors = List[Float64]()
                    for e in range(expiries):
                        var candidates = List[Float64]()
                        if closure == 2:
                            candidates = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5, 8, 12, 17, 23, 30, 38, 64]
                        else:
                            var prices = List[Float64]()
                            for i in range(contracts):
                                if expiry_of[i] == e and out_of_the_money[i] and excess[i] > floor:
                                    prices.append((excess[i] - floor) / (chain_risk[i] if closure == 0 else whole_risk[i]))
                            candidates = [quartile(prices, 0.5)]
                        var nearest = List[Float64]()
                        var off = Float64(1e9)
                        for candidate in candidates:
                            var these = List[Float64]()
                            for i in range(contracts):
                                if expiry_of[i] == e and out_of_the_money[i]:
                                    var charge = floor
                                    if closure == 0:
                                        charge += candidate * chain_risk[i]
                                    elif closure == 1:
                                        charge += candidate * whole_risk[i]
                                    else:
                                        charge += sqrt(shed(profile, i * (CHECKS + 1), chain.expiry_days[e], candidate))
                                    these.append(log(max(hedge_cost[i] + charge, 1e-12) / half[i]))
                            if abs(quartile(these, 0.5)) < off:
                                off = abs(quartile(these, 0.5))
                                numbers[e] = candidate
                                nearest = these.copy()
                        for error in nearest:
                            errors.append(error)
                    var miss = quartile(errors, 0.75) - quartile(errors, 0.25) + abs(quartile(errors, 0.5))
                    var at = closure * (2 + expiries)
                    if miss < closures[at + 1]:
                        closures[at] = floor
                        closures[at + 1] = miss
                        for e in range(expiries):
                            closures[at + 2 + e] = numbers[e]
            line = String("DH closure")
            for n in range(len(closures)):
                line += " " + String(closures[n])
            print(line)
            var nearest = 0
            for closure in range(3):
                if closures[closure * (2 + expiries) + 1] < closures[nearest * (2 + expiries) + 1]:
                    nearest = closure
            var worst = List[Float32](length=model.paths, fill=0)
            for i in range(contracts):
                line = String("DH quote ") + String(i)
                for field in range(RESULT):
                    line += " " + String(window[i * RESULT + field] / REPORT)
                    window[i * RESULT + field] = 0
                # And of the last batch, the mean of each book's worst twentieth of paths.
                for side in range(2):
                    for p in range(model.paths):
                        worst[p] = model.residual[p * model.books + 2 * i + side]
                    sort(worst)
                    var sum = Float64(0)
                    for p in range(model.paths - model.paths // 20, model.paths):
                        sum += Float64(worst[p])
                    line += " " + String(sum / Float64(model.paths // 20))
                # The days its spread pays for over the floor, and its charge under each closure.
                var at = i * (CHECKS + 1)
                var expiry = Int(chain.contracts[i * CONTRACT + 1])
                var e = expiry_of[i]
                line += " " + String(days_implied(profile, at, expiry, excess[i] - closures[2 * (2 + expiries)]))
                var charges = [
                    closures[0] + closures[2 + e] * chain_risk[i],
                    closures[2 + expiries] + closures[2 + expiries + 2 + e] * whole_risk[i],
                    closures[2 * (2 + expiries)] + sqrt(shed(profile, at, expiry, closures[2 * (2 + expiries) + 2 + e])),
                ]
                for closure in range(3):
                    line += " " + String(charges[closure])
                print(line)
                # The next iterations' quotes carry the nearest closure's charge.
                chain.contracts[i * CONTRACT + 6] = Float32(charges[nearest])
            model.contracts_buffer.enqueue_copy_from(chain.contracts.unsafe_ptr())
            for interval in range(model.intervals):
                line = String("DH law ") + String(interval)
                for k in range(KERNELS):
                    line += " " + String(model.weights[interval * KERNELS + k])
                print(line)
            var row = model.days + 1
            var day = 0
            for interval in range(model.intervals):
                # The law's forward at the expiry. On a path the level over the product of
                # its days' mean moves has mean one, so the batch's mean level is corrected
                # by that ratio's own error: 1 + mean(x (1 - 1 / product)).
                var expiry = chain.expiry_days[interval]
                var correction = Float64(0)
                # And the days of the interval as the batch has them: mean, deviation,
                # skewness, excess kurtosis, and how a day's size goes with the day before's.
                var count = Float64(0)
                var moments = [Float64(0), Float64(0), Float64(0), Float64(0)]
                var sizes = [Float64(0), Float64(0), Float64(0), Float64(0), Float64(0)]
                for p in range(model.paths):
                    var product = Float64(1)
                    for t in range(expiry):
                        product *= 1 + Float64(model.draw[(p * model.days + t) * DRAW + 2])
                    correction += exp(Float64(model.logx[p * row + expiry])) * (1 - 1 / product)
                    for t in range(day, expiry):
                        var moved = Float64(model.logx[p * row + t + 1] - model.logx[p * row + t])
                        count += 1
                        moments[0] += moved
                        moments[1] += moved * moved
                        moments[2] += moved * moved * moved
                        moments[3] += moved * moved * moved * moved
                        if t > 0:
                            var before = abs(Float64(model.logx[p * row + t] - model.logx[p * row + t - 1]))
                            sizes[0] += 1
                            sizes[1] += abs(moved)
                            sizes[2] += before
                            sizes[3] += abs(moved) * before
                            sizes[4] += moved * moved + before * before
                day = expiry
                var mean = moments[0] / count
                var variance = moments[1] / count - mean * mean
                var third = moments[2] / count - 3 * mean * moments[1] / count + 2 * mean * mean * mean
                var fourth = (
                    moments[3] / count - 4 * mean * moments[2] / count + 6 * mean * mean * moments[1] / count
                    - 3 * mean * mean * mean * mean
                )
                var size_mean = (sizes[1] + sizes[2]) / (2 * sizes[0])
                var together = (sizes[3] / sizes[0] - size_mean * size_mean) / (sizes[4] / (2 * sizes[0]) - size_mean * size_mean)
                print(
                    "DH forward", interval, 1 + correction / Float64(model.paths), mean, sqrt(variance),
                    third / (variance * sqrt(variance)), fourth / (variance * variance) - 3, together,
                )
            # The first paths, which are any paths, then the batch's ten lowest at the
            # last day and its ten highest.
            var shown = List[Int]()
            for p in range(RANDOM_PATHS):
                shown.append(p)
            for extreme in range(2 * EXTREME_PATHS):
                var best = -1
                for p in range(model.paths):
                    if p not in shown:
                        var level = model.logx[p * (model.days + 1) + model.days]
                        if best < 0 or (level < model.logx[best * (model.days + 1) + model.days]) == (extreme < EXTREME_PATHS):
                            best = p
                shown.append(best)
            for index in range(len(shown)):
                line = String("DH path ") + String(index)
                for t in range(model.days + 1):
                    line += " " + String(model.logx[shown[index] * (model.days + 1) + t])
                print(line)
                line = String("DH scale ") + String(index)
                for t in range(model.days):
                    line += " " + String(exp(model.draw[(shown[index] * model.days + t) * DRAW + 1]))
                print(line)
            # What the hedger holds along the first paths shown, short each contract shown.
            var inputs = Array[Float32, INPUTS](fill=0)
            var first_layer = Array[Float32, HIDDEN](fill=0)
            var second_layer = Array[Float32, HIDDEN](fill=0)
            var hedge = 0
            # And what each of those hedges left on every path, short and long.
            for chosen in shown_contracts(chain, path):
                for side in range(2):
                    line = String("DH residual ") + String(chosen) + " " + String(side)
                    for p in range(model.paths):
                        line += " " + String(model.residual[p * model.books + 2 * chosen + side])
                    print(line)
                var expiry = Int(chain.contracts[chosen * CONTRACT + 1])
                var log_strike = log(chain.contracts[chosen * CONTRACT])
                for p in range(HEDGED_PATHS):
                    line = String("DH hedge ") + String(hedge) + " " + String(chosen)
                    hedge += 1
                    var position = Float32(0)
                    for u in range(1, expiry):
                        position = policy(
                            rebind[Floats](model.phi.unsafe_ptr()),
                            model.logx[p * (model.days + 1) + u - 1] - log_strike,
                            Float32(expiry - u + 1),
                            chain.contracts[chosen * CONTRACT + 2],
                            1,
                            model.draw[(p * model.days + u - 1) * DRAW + 1],
                            position,
                            inputs,
                            first_layer,
                            second_layer,
                            HIDDEN,
                        )
                        line += " " + String(position)
                    print(line)
            training.hedger.report(0, model.phi)
            training.generator.report(1, model.logits)
            training.state.report(2, model.state)
            print("DH end", iteration, flush=True)
            window_loss = 0


def time(mut model: Model) raises:
    """Seconds of the forward kernels, of the adjoint kernel, of the sums and
    of reading the result, the second iteration: the first compiles the kernels."""
    for round in range(2):
        var started = perf_counter_ns()
        model.forward(UInt32(round))
        model.ctx.synchronize()
        var rolled = perf_counter_ns()
        model.differentiate()
        model.ctx.synchronize()
        var differentiated = perf_counter_ns()
        model.sum()
        model.ctx.synchronize()
        var summed = perf_counter_ns()
        model.read()
        var done = perf_counter_ns()
        if round == 1:
            print(
                "DH time forward", Float64(rolled - started) / 1e9, "adjoint", Float64(differentiated - rolled) / 1e9,
                "sums", Float64(summed - differentiated) / 1e9, "read", Float64(done - summed) / 1e9,
            )


def main() raises:
    var arguments = argv()
    if len(arguments) < 4:
        raise Error("usage: dh-fit CHAIN PATHS SEED [ITERATIONS] | dh-fit check CHAIN PATHS [ITERATIONS] | dh-fit time CHAIN PATHS")
    var mode = String(arguments[1])
    var fitting = mode != "check" and mode != "time"
    var chain = Chain(String(arguments[1 if fitting else 2]))
    var paths = Int(number(String(arguments[2 if fitting else 3])))
    if paths % BLOCK != 0:
        raise Error("PATHS is a multiple of ", BLOCK)
    var seed = UInt64(Int(number(String(arguments[3])))) if fitting else UInt64(1)
    var model = Model(chain, paths, seed)
    print("DH start contracts", chain.count(), "intervals", model.intervals, "days", model.days, "paths", paths, flush=True)
    if mode == "check":
        check(model, chain, Int(number(String(arguments[4]))) if len(arguments) > 4 else 0)
    elif mode == "time":
        time(model)
    else:
        fit(model, chain, String(arguments[1]), seed, Int(number(String(arguments[4]))) if len(arguments) > 4 else 0)
