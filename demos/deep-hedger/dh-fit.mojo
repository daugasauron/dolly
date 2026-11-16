"""dh-fit: fits the deep hedger's path law to one option chain, on the GPU.

The model is demos/deep-hedger/THEORY.md, sections 3 and 4, with the stock as
the only hedge instrument. Every number of an iteration is made by the kernels
below; the host keeps the two parameter vectors and their Adam moments.

  dh-fit CHAIN PATHS SEED [ITERATIONS]     fit, reporting on stdout until killed
  dh-fit check CHAIN PATHS [ITERATIONS]    both gradients against finite differences
  dh-fit time CHAIN PATHS                  seconds of an iteration's parts
"""

from std.collections.array import Array
from std.math import exp, log, sqrt, tanh
from std.pathlib import Path
from std.sys import argv
from std.time import perf_counter_ns

from gpu import global_idx
from gpu.host import DeviceBuffer, DeviceContext

# The generator: KERNELS hat-shaped densities of the daily log return on a fixed
# grid, dense near zero and reaching +-20%. Their number is the model's one
# structural choice.
comptime KERNELS = 49
comptime NODES = KERNELS + 2
comptime GRID_SCALE = 0.01019
comptime GRID_STRETCH = 3.68

# The hedger: INPUTS -> HIDDEN relu -> HIDDEN relu -> tanh, one position.
comptime INPUTS = 6
comptime HIDDEN = 16
comptime B1 = HIDDEN * INPUTS
comptime W2 = B1 + HIDDEN
comptime B2 = W2 + HIDDEN * HIDDEN
comptime W3 = B2 + HIDDEN
comptime B3 = W3 + HIDDEN
comptime PARAMS = B3 + 1

comptime MAX_DAYS = 64
# Each path's books are shared among GROUPS threads; a thread keeps its books'
# gradient in a row of its own, so GROUPS bounds that buffer.
comptime GROUPS = 8
comptime BLOCK = 64
# A contract is strike, expiry day, +1 call or -1 put, bid, ask, band unit.
comptime CONTRACT = 6
# A contract's results: bid, ask, cost short, cost long, risk short, risk long, loss, risk unhedged.
comptime RESULT = 8
# A book's statistics for the backward pass: mean, deviation, the loss's derivative.
comptime BOOK = 4

comptime Floats = Pointer[Float32, MutAnyOrigin]


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


def simulate(
    law: Floats,
    nodes: Floats,
    interval_of_day: Floats,
    logx: Floats,
    density: Floats,
    paths: Int,
    days: Int,
    seed: UInt32,
):
    """A path: each day's return is the day's law at a uniform number, the law
    being piecewise linear between the nodes (heights, then cumulative mass)."""
    var p = global_idx.x
    if p >= paths:
        return
    var level = Float32(0)
    logx[unsafe_offset=p * (days + 1)] = 0
    for t in range(days):
        var base = Int(interval_of_day[unsafe_offset=t]) * NODES * 2
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
        level += left + step
        logx[unsafe_offset=p * (days + 1) + t + 1] = level
        density[unsafe_offset=p * days + t] = max(height + slope * step, 0.01)


def policy(
    phi: Floats,
    moneyness: Float32,
    days_left: Float32,
    call: Float32,
    side: Float32,
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
    inputs[5] = held
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
    growth: Floats,
    paths: Int,
    days: Int,
    books: Int,
    cost: Float32,
    hidden: Int,
):
    """Every book of a path, hedged from empty to its expiry: what is left
    with the dealer, and what the hedge paid in costs. A position decided on
    day u-1 is bought at day u's price and held from then; it is bought
    forward, so a day earns it the move less the law's mean move (`growth`),
    and holding stock is a fair game under any law. Neighbouring threads
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
        for u in range(1, expiry):
            var price = exp(logx[unsafe_offset=row + u])
            var target = policy(
                phi,
                logx[unsafe_offset=row + u - 1] - log_strike,
                Float32(expiry - u + 1),
                call,
                side,
                position,
                inputs,
                first,
                second,
                hidden,
            )
            var fee = cost * abs(target - position) * price
            cash += target * (exp(logx[unsafe_offset=row + u + 1]) - growth[unsafe_offset=u] * price) - fee
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
    risk: Float32,
    offset: Int,
):
    """A contract's two books: each one's funding, mean plus risk times
    deviation of its residual, is the model's ask and minus its bid. The
    loss is their distance outside the market's band."""
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
        funding[s] = mean + risk * deviation[s]
        fees[s] = fee / Float32(paths)
        book_stats[unsafe_offset=b * BOOK] = mean
        book_stats[unsafe_offset=b * BOOK + 1] = deviation[s]
    var c = i * CONTRACT
    var market_bid = contracts[unsafe_offset=c + 3]
    var market_ask = contracts[unsafe_offset=c + 4]
    var unit = contracts[unsafe_offset=c + 5]
    var ask = funding[0]
    var bid = -funding[1]
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
    result[unsafe_offset=r] = bid
    result[unsafe_offset=r + 1] = ask
    result[unsafe_offset=r + 2] = fees[0]
    result[unsafe_offset=r + 3] = fees[1]
    result[unsafe_offset=r + 4] = deviation[0]
    result[unsafe_offset=r + 5] = deviation[1]
    result[unsafe_offset=r + 6] = beyond(ask_error) + beyond(bid_error)
    result[unsafe_offset=r + 7] = sqrt(max(payoff_squares / Float32(paths) - payoff * payoff, 0))


def adjoint(
    logx: Floats,
    contracts: Floats,
    phi: Floats,
    book_stats: Floats,
    gradient_rows: Floats,
    level_rows: Floats,
    held_rows: Floats,
    growth: Floats,
    paths: Int,
    days: Int,
    books: Int,
    cost: Float32,
    risk: Float32,
    hidden: Int,
):
    """The backward pass of roll and quote for a thread's books. For the
    hedger, the derivative of the sum of all fundings by its parameters,
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
                before,
                inputs,
                first,
                second,
                hidden,
            )
            held_rows[unsafe_offset=u * threads + thread] = after
            cash += after * (exp(logx[unsafe_offset=row + u + 1]) - growth[unsafe_offset=u] * price) - cost * abs(after - before) * price
            before = after
        var last = exp(logx[unsafe_offset=row + expiry])
        var closing = before
        var left = side * max(call * (last - strike), 0) - (cash - cost * abs(closing) * last)
        # The funding's derivative by this path's residual.
        var seed = (1 + risk * (left - book_stats[unsafe_offset=b * BOOK]) / book_stats[unsafe_offset=b * BOOK + 1]) / Float32(paths)

        var loss_seed = book_stats[unsafe_offset=b * BOOK + 2] * seed
        var in_the_money = max(direction(call * (last - strike)), 0)
        level_rows[unsafe_offset=expiry * threads + thread] += loss_seed * (side * call * in_the_money - closing + cost * abs(closing))

        var carry = seed * cost * direction(closing) * last
        var u = expiry - 1
        while u >= 1:
            var price = exp(logx[unsafe_offset=row + u])
            var now = held_rows[unsafe_offset=u * threads + thread]
            var earlier = held_rows[unsafe_offset=(u - 1) * threads + thread]
            var turn = direction(now - earlier)
            var grown = growth[unsafe_offset=u]
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


def return_adjoint(level_rows: Floats, logx: Floats, on_return: Floats, paths: Int, days: Int):
    """The loss's derivative by each day's return, a return moving every later
    level; and after those, by each day's mean move, summed over the path's threads."""
    var p = global_idx.x
    if p >= paths:
        return
    var threads = paths * GROUPS
    var later = Float32(0)
    var u = days
    while u >= 1:
        var on_level = Float32(0)
        var on_growth = Float32(0)
        for group in range(GROUPS):
            on_level += level_rows[unsafe_offset=u * threads + group * paths + p]
            on_growth += level_rows[unsafe_offset=(MAX_DAYS + 1 + u) * threads + group * paths + p]
        later += on_level * exp(logx[unsafe_offset=p * (days + 1) + u])
        on_return[unsafe_offset=p * days + u - 1] = later
        if u < days:
            on_return[unsafe_offset=(paths + p) * days + u] = on_growth
        u -= 1


def law_gradient(
    on_return: Floats,
    logx: Floats,
    density: Floats,
    nodes: Floats,
    interval_of_day: Floats,
    result: Floats,
    paths: Int,
    days: Int,
    intervals: Int,
    offset: Int,
):
    """The loss's derivative by one kernel's weight in one interval. A return
    drawn at a fixed uniform number moves by minus the kernel's cumulative mass
    there over the law's density there; and the day's mean move is the weights'
    sum of the kernels' own (after the nodes in their buffer)."""
    var id = global_idx.x
    var interval = id // KERNELS
    if interval >= intervals:
        return
    var k = id % KERNELS + 1
    var lo = nodes[unsafe_offset=k - 1]
    var peak = nodes[unsafe_offset=k]
    var hi = nodes[unsafe_offset=k + 1]
    var sum = Float32(0)
    for t in range(days):
        if Int(interval_of_day[unsafe_offset=t]) == interval:
            for p in range(paths):
                var r = logx[unsafe_offset=p * (days + 1) + t + 1] - logx[unsafe_offset=p * (days + 1) + t]
                var below = Float32(1)
                if r <= lo:
                    below = 0
                elif r <= peak:
                    below = (r - lo) * (r - lo) / ((peak - lo) * (hi - lo))
                elif r < hi:
                    below = 1 - (hi - r) * (hi - r) / ((hi - peak) * (hi - lo))
                sum -= on_return[unsafe_offset=p * days + t] * below / density[unsafe_offset=p * days + t]
                sum += on_return[unsafe_offset=(paths + p) * days + t] * nodes[unsafe_offset=NODES + k - 1]
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

    cost C risk R
    days D1 D2 ...             each expiry's business day, increasing
    STRIKE EXPIRY-INDEX CALL(1|-1) BID ASK     one line a contract
    """

    var cost: Float32
    var risk: Float32
    var expiry_days: List[Int]
    var contracts: List[Float32]

    def __init__(out self, path: String) raises:
        self.cost = 0
        self.risk = 0
        self.expiry_days = List[Int]()
        self.contracts = List[Float32]()
        for line in Path(path).read_text().split("\n"):
            var fields = List[String]()
            for field in line.split(" "):
                if field.byte_length() > 0:
                    fields.append(String(field))
            if len(fields) == 4 and fields[0] == "cost":
                self.cost = Float32(number(fields[1]))
                self.risk = Float32(number(fields[3]))
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


def noise(mut state: UInt64) -> Float32:
    """A standard normal number, for the hedger's first weights."""
    var sum = Float64(0)
    for _ in range(12):
        state = state * 6364136223846793005 + 1442695040888963407
        sum += Float64((state >> 40) & 0xFFFFFF) / 16777216.0
    return Float32(sum - 6)


struct Model(Movable):
    """Both parameter vectors, their buffers, and one iteration on the GPU."""

    var ctx: DeviceContext
    var paths: Int
    var days: Int
    var intervals: Int
    var books: Int
    var cost: Float32
    var risk: Float32
    var grid: List[Float32]
    var kernel_growth: List[Float64]
    var interval_of_day: List[Int]
    var logits: List[Float32]
    var weights: List[Float32]
    var phi: List[Float32]
    var result: List[Float32]
    var nodes_buffer: DeviceBuffer[DType.float32]
    var interval_buffer: DeviceBuffer[DType.float32]
    var contracts_buffer: DeviceBuffer[DType.float32]
    var law_buffer: DeviceBuffer[DType.float32]
    var phi_buffer: DeviceBuffer[DType.float32]
    var logx_buffer: DeviceBuffer[DType.float32]
    var density_buffer: DeviceBuffer[DType.float32]
    var residual_buffer: DeviceBuffer[DType.float32]
    var paid_buffer: DeviceBuffer[DType.float32]
    var book_buffer: DeviceBuffer[DType.float32]
    var gradient_rows: DeviceBuffer[DType.float32]
    var level_rows: DeviceBuffer[DType.float32]
    var held_rows: DeviceBuffer[DType.float32]
    var return_buffer: DeviceBuffer[DType.float32]
    var growth_buffer: DeviceBuffer[DType.float32]
    var result_buffer: DeviceBuffer[DType.float32]

    def __init__(out self, chain: Chain, paths: Int, seed: UInt64) raises:
        self.ctx = DeviceContext()
        self.paths = paths
        self.intervals = len(chain.expiry_days)
        self.days = chain.expiry_days[self.intervals - 1]
        self.books = 2 * chain.count()
        self.cost = chain.cost
        self.risk = chain.risk
        self.grid = List[Float32](length=NODES, fill=0)
        for j in range(NODES):
            var u = GRID_STRETCH * (2 * Float64(j) / Float64(NODES - 1) - 1)
            self.grid[j] = Float32(GRID_SCALE * (exp(u) - exp(-u)) / 2)
        # Every kernel weighs the same at the start: nothing of the quotes.
        self.logits = List[Float32](length=self.intervals * KERNELS, fill=0)
        self.weights = List[Float32](length=self.intervals * KERNELS, fill=0)
        self.phi = List[Float32](length=PARAMS, fill=0)
        var state = seed
        for n in range(B1):
            self.phi[n] = noise(state) * Float32(sqrt(2.0 / Float64(INPUTS)))
        for n in range(W2, B2):
            self.phi[n] = noise(state) * Float32(sqrt(2.0 / Float64(HIDDEN)))
        for n in range(W3, B3):
            self.phi[n] = noise(state) * Float32(sqrt(1.0 / Float64(HIDDEN)))
        self.result = List[Float32](length=PARAMS + self.intervals * KERNELS + chain.count() * RESULT, fill=0)

        # A kernel's mean of exp(return): a hat from lo over its peak to hi.
        self.kernel_growth = List[Float64](length=KERNELS, fill=0)
        var nodes_and_growth = List[Float32](length=NODES + KERNELS, fill=0)
        for j in range(NODES):
            nodes_and_growth[j] = self.grid[j]
        for k in range(KERNELS):
            var lo = Float64(self.grid[k])
            var peak = Float64(self.grid[k + 1])
            var hi = Float64(self.grid[k + 2])
            var rising = ((peak - lo - 1) * exp(peak) + exp(lo)) / (peak - lo)
            var falling = (exp(hi) - (hi - peak + 1) * exp(peak)) / (hi - peak)
            self.kernel_growth[k] = 2 * (rising + falling) / (hi - lo)
            nodes_and_growth[NODES + k] = Float32(self.kernel_growth[k])
        self.nodes_buffer = self.ctx.enqueue_create_buffer[DType.float32](NODES + KERNELS)
        self.nodes_buffer.enqueue_copy_from(nodes_and_growth.unsafe_ptr())
        self.interval_of_day = List[Int](length=self.days, fill=0)
        self.growth_buffer = self.ctx.enqueue_create_buffer[DType.float32](self.days)
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
        self.law_buffer = self.ctx.enqueue_create_buffer[DType.float32](self.intervals * NODES * 2)
        self.phi_buffer = self.ctx.enqueue_create_buffer[DType.float32](PARAMS)
        self.logx_buffer = self.ctx.enqueue_create_buffer[DType.float32](paths * (self.days + 1))
        self.density_buffer = self.ctx.enqueue_create_buffer[DType.float32](paths * self.days)
        self.residual_buffer = self.ctx.enqueue_create_buffer[DType.float32](paths * self.books)
        self.paid_buffer = self.ctx.enqueue_create_buffer[DType.float32](paths * self.books)
        self.book_buffer = self.ctx.enqueue_create_buffer[DType.float32](self.books * BOOK)
        self.gradient_rows = self.ctx.enqueue_create_buffer[DType.float32](paths * GROUPS * PARAMS)
        self.level_rows = self.ctx.enqueue_create_buffer[DType.float32](paths * GROUPS * 2 * (MAX_DAYS + 1))
        self.held_rows = self.ctx.enqueue_create_buffer[DType.float32](paths * GROUPS * (MAX_DAYS + 1))
        self.return_buffer = self.ctx.enqueue_create_buffer[DType.float32](2 * paths * self.days)
        self.result_buffer = self.ctx.enqueue_create_buffer[DType.float32](len(self.result))

    def law(mut self) -> List[Float32]:
        """Each interval's density at the nodes and its cumulative mass there."""
        var table = List[Float32](length=self.intervals * NODES * 2, fill=0)
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

    def forward(mut self, seed: UInt32) raises:
        """Paths, every book rolled, every contract quoted."""
        var table = self.law()
        self.law_buffer.enqueue_copy_from(table.unsafe_ptr())
        var growth = List[Float32](length=self.days, fill=0)
        for t in range(self.days):
            var mean = Float64(0)
            for k in range(KERNELS):
                mean += Float64(self.weights[self.interval_of_day[t] * KERNELS + k]) * self.kernel_growth[k]
            growth[t] = Float32(mean)
        self.growth_buffer.enqueue_copy_from(growth.unsafe_ptr())
        self.phi_buffer.enqueue_copy_from(self.phi.unsafe_ptr())
        var threads = self.paths * GROUPS
        self.ctx.enqueue_function[simulate](
            self.law_buffer, self.nodes_buffer, self.interval_buffer, self.logx_buffer, self.density_buffer,
            self.paths, self.days, seed, grid_dim=(self.paths + BLOCK - 1) // BLOCK, block_dim=BLOCK,
        )
        self.ctx.enqueue_function[roll](
            self.logx_buffer, self.contracts_buffer, self.phi_buffer, self.residual_buffer, self.paid_buffer,
            self.growth_buffer, self.paths, self.days, self.books, self.cost, HIDDEN, grid_dim=threads // BLOCK, block_dim=BLOCK,
        )
        self.ctx.enqueue_function[quote](
            self.residual_buffer, self.paid_buffer, self.contracts_buffer, self.logx_buffer, self.book_buffer,
            self.result_buffer, self.paths, self.days, self.books, self.risk,
            PARAMS + self.intervals * KERNELS, grid_dim=(self.books // 2 + BLOCK - 1) // BLOCK, block_dim=BLOCK,
        )

    def backward(mut self) raises:
        """Both gradients, into the result beside the quotes."""
        self.differentiate()
        self.sum()

    def differentiate(mut self) raises:
        var threads = self.paths * GROUPS
        self.ctx.enqueue_function[adjoint](
            self.logx_buffer, self.contracts_buffer, self.phi_buffer, self.book_buffer, self.gradient_rows,
            self.level_rows, self.held_rows, self.growth_buffer, self.paths, self.days, self.books, self.cost, self.risk, HIDDEN,
            grid_dim=threads // BLOCK, block_dim=BLOCK,
        )

    def sum(mut self) raises:
        var threads = self.paths * GROUPS
        self.ctx.enqueue_function[sum_gradient](
            self.gradient_rows, self.result_buffer, threads, grid_dim=(PARAMS + BLOCK - 1) // BLOCK, block_dim=BLOCK,
        )
        self.ctx.enqueue_function[return_adjoint](
            self.level_rows, self.logx_buffer, self.return_buffer, self.paths, self.days,
            grid_dim=(self.paths + BLOCK - 1) // BLOCK, block_dim=BLOCK,
        )
        self.ctx.enqueue_function[law_gradient](
            self.return_buffer, self.logx_buffer, self.density_buffer, self.nodes_buffer, self.interval_buffer,
            self.result_buffer, self.paths, self.days, self.intervals, PARAMS,
            grid_dim=(self.intervals * KERNELS + BLOCK - 1) // BLOCK, block_dim=BLOCK,
        )

    def read(mut self) raises:
        self.result_buffer.enqueue_copy_to(self.result.unsafe_ptr())

    def contract(self, i: Int, field: Int) -> Float32:
        return self.result[PARAMS + self.intervals * KERNELS + i * RESULT + field]

    def loss(self) -> Float64:
        """The generator's: mean squared distance outside the bands."""
        var sum = Float64(0)
        for i in range(self.books // 2):
            sum += Float64(self.contract(i, 6))
        return sum / Float64(self.books // 2)

    def funding(self) -> Float64:
        """The hedger's: the sum of every book's funding, ask minus bid."""
        var sum = Float64(0)
        for i in range(self.books // 2):
            sum += Float64(self.contract(i, 1) - self.contract(i, 0))
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


struct Training(Movable):
    """The two optimizers and one joint step: fresh paths, both gradients from
    the same parameters, then both updates."""

    var hedger: Adam
    var generator: Adam

    def __init__(out self, intervals: Int):
        self.hedger = Adam(PARAMS, 0.002)
        self.generator = Adam(intervals * KERNELS, 0.03)

    def step(mut self, mut model: Model, seed: UInt32) raises:
        model.forward(seed)
        model.backward()
        model.read()
        var hedger_gradient = model.hedger_gradient()
        var generator_gradient = model.generator_gradient()
        self.hedger.step(model.phi, hedger_gradient)
        self.generator.step(model.logits, generator_gradient)


def generator_differences(mut model: Model, seed: UInt32) raises:
    """The generator's gradient beside a central difference of its loss."""
    model.forward(seed)
    model.backward()
    model.read()
    var gradient = model.generator_gradient()
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


def check(mut model: Model, iterations: Int) raises:
    """Each gradient beside a central difference of what it differentiates.
    The generator's holds positions fixed: it is exact with a hedger whose
    position is one constant, and after `iterations` of fitting the two
    columns differ by what the hedger's response to the paths adds, which is
    nothing at a hedger that cannot be improved (THEORY.md, section 4)."""
    var seed = UInt32(7)
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
    print("DH check generator, one constant position: logit, gradient, difference")
    generator_differences(model, seed)
    model.phi = trained^
    if iterations > 0:
        var training = Training(model.intervals)
        for iteration in range(iterations):
            training.step(model, UInt32(1000 + iteration))
        print("DH check generator, the hedger of", iterations, "iterations: logit, gradient, difference")
        generator_differences(model, seed)


def fit(mut model: Model, chain: Chain, seed: UInt64, iterations: Int) raises:
    """Generator and hedger move together, each by its own loss, on fresh
    paths every iteration. A report is the mean of the iterations since the
    last one."""
    comptime REPORT = 20
    comptime SHOWN_PATHS = 48
    var training = Training(model.intervals)
    var contracts = chain.count()
    var window = List[Float64](length=contracts * RESULT, fill=0)
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
            window[i] += Float64(model.result[PARAMS + model.intervals * KERNELS + i])
        if iteration % REPORT == 0:
            var seconds = Float64(perf_counter_ns() - started) / 1e9
            # Of the window's mean bids and asks, the share inside the market's band;
            # mean spreads of the market and of the model, the model's two parts (costs,
            # and the deviation the risk price multiplies), and that deviation unhedged.
            var inside = 0
            var market = Float64(0)
            var spread = Float64(0)
            var fees = Float64(0)
            var deviations = Float64(0)
            var unhedged = Float64(0)
            for i in range(contracts):
                var bid = Float64(chain.contracts[i * CONTRACT + 3])
                var ask = Float64(chain.contracts[i * CONTRACT + 4])
                for side in range(2):
                    var price = window[i * RESULT + side] / REPORT
                    if price >= bid and price <= ask:
                        inside += 1
                market += ask - bid
                spread += (window[i * RESULT + 1] - window[i * RESULT]) / REPORT
                fees += (window[i * RESULT + 2] + window[i * RESULT + 3]) / REPORT
                deviations += (window[i * RESULT + 4] + window[i * RESULT + 5]) / REPORT
                unhedged += 2 * window[i * RESULT + 7] / REPORT
            print(
                "DH iteration", iteration, "loss", window_loss / REPORT, "seconds", seconds,
                "inside", Float64(inside) / Float64(2 * contracts), "market", market / Float64(contracts),
                "model", spread / Float64(contracts), "cost", fees / Float64(contracts),
                "risk", deviations / Float64(contracts), "unhedged", unhedged / Float64(contracts), flush=True,
            )
            for i in range(contracts):
                line = String("DH quote ") + String(i)
                for field in range(RESULT):
                    line += " " + String(window[i * RESULT + field] / REPORT)
                    window[i * RESULT + field] = 0
                print(line)
            for interval in range(model.intervals):
                line = String("DH law ") + String(interval)
                for k in range(KERNELS):
                    line += " " + String(model.weights[interval * KERNELS + k])
                print(line)
            var logx = model.logx_buffer.to_host()
            for interval in range(model.intervals):
                var day = chain.expiry_days[interval]
                var mean = Float64(0)
                for p in range(model.paths):
                    mean += exp(Float64(logx[p * (model.days + 1) + day]))
                # The deviation of one day's return in the interval, from its weights: a hat's
                # mean is that of its three nodes, its variance (a2 + b2 + c2 - ab - ac - bc) / 18.
                var first = Float64(0)
                var second = Float64(0)
                for k in range(KERNELS):
                    var a = Float64(model.grid[k])
                    var c = Float64(model.grid[k + 1])
                    var b = Float64(model.grid[k + 2])
                    var centre = (a + b + c) / 3
                    var weight = Float64(model.weights[interval * KERNELS + k])
                    first += weight * centre
                    second += weight * ((a * a + b * b + c * c - a * b - a * c - b * c) / 18 + centre * centre)
                print("DH forward", interval, mean / Float64(model.paths), sqrt(second - first * first))
            for p in range(min(SHOWN_PATHS, model.paths)):
                line = String("DH path ") + String(p)
                for t in range(model.days + 1):
                    line += " " + String(logx[p * (model.days + 1) + t])
                print(line)
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
        check(model, Int(number(String(arguments[4]))) if len(arguments) > 4 else 0)
    elif mode == "time":
        time(model)
    else:
        fit(model, chain, seed, Int(number(String(arguments[4]))) if len(arguments) > 4 else 0)
