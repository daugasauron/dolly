return function(t, s, m, r)
  if s.carriedBy~=0 or m.assisted then
    local a=m.assisted or {since=t,stable=0};m.assisted=a
    local out={};local support=0
    for i,b in ipairs(s.blueprint) do
      support=support+(s.supportForce[i] or 0)
      if b.joint==1 then
        local u=math.max(-1,math.min(1,-2*s.angles[i]-.5*s.rates[i]))
        if b.negative~=0 then out[string.char(b.negative)]=math.max(0,-u) end
        if b.positive~=0 then out[string.char(b.positive)]=math.max(0,u) end
      end
    end
    local supported=s.carriedBy==0 and s.up>.97 and support>s.mass*hypot(table.unpack(s.gravity))*.8 and hypot(s.vx,s.vy,s.vz)<.2
    a.stable=supported and a.stable+s.dt or 0
    m.status=s.carriedBy~=0 and 'Straightening during rescue' or 'Balancing after rescue'
    if a.stable<2 then return out end
    local q=s.rotation;local yaw=math.atan(2*(q[1]*q[3]+q[2]*q[4]),1-2*(q[2]^2+q[3]^2))
    local recoveries=(m.assistedRecoveries or 0)+1
    for key in pairs(m) do m[key]=nil end
    m.assistedRecoveries=recoveries;m.gaitFrame={s.x,s.z,yaw}
  end
  if m.gaitFrame then
    local f=m.gaitFrame;local c,h=math.cos(f[3]),math.sin(f[3])
    local function vector(v) return {c*v[1]-h*v[3],v[2],h*v[1]+c*v[3]} end
    local function point(v) return vector({v[1]-f[1],v[2],v[3]-f[2]}) end
    local copy=merge({},s);local p=point({s.x,s.y,s.z});copy.x,copy.y,copy.z=table.unpack(p)
    copy.vx,copy.vy,copy.vz=table.unpack(vector({s.vx,s.vy,s.vz}))
    copy.centerOfMass=point(s.centerOfMass);copy.positions=map(s.positions,point)
    copy.nearby=map(s.nearby,function(b) local n=merge({},b);n.x,n.y,n.z=table.unpack(point({b.x,b.y,b.z}));return n end)
    local samples=map(s.groundSamples,point);copy.groundSamples={}
    for i=1,#samples do
      local angle=(i-1)%8*math.pi/4;local best,score
      for j,v in ipairs(samples) do
        if math.floor((j-1)/8)==math.floor((i-1)/8) then
          local d=(v[1]-copy.x)*math.sin(angle)+(v[3]-copy.z)*math.cos(angle)
          if not score or d>score then best,score=v,d end
        end
      end
      copy.groundSamples[i]=best
    end
    local q=s.rotation;local c,h=math.cos(f[3]/2),math.sin(f[3]/2)
    copy.rotation={c*q[1]-h*q[3],c*q[2]-h*q[4],c*q[3]+h*q[1],c*q[4]+h*q[2]}
    s=copy
  end
  local dt = (s).dt;
  local a = (s).angles;
  local p = (s).positions;
  local cl = function(x, b)
    return math.max((-b), math.min(b, x))
  end;
  local bound = function(x, l, h)
    return math.max(l, math.min(h, x))
  end;
  local rd = function(x)
    return (round((x * 1000)) / 1000)
  end;
  local wrap = function(x)
    return math.atan(math.sin(x), math.cos(x))
  end;
  local ids = {{5, 6, 7, 8, 9}, {18, 19, 20, 21, 22}};
  local bases = {10, 23};
  local keys = {{"QA", "WS", "ED", "RF", "TG"}, {"YH", "UJ", "IK", "OL", "PB"}};
  local out = {};
  local Q = (s).rotation;
  local dot = function(a, b)
    return reduce(a, function(v, x, i)
      return (v + (x * at(b, i)))
    end, 0)
  end;
  local norm = function(a)
    local d = hypot(table.unpack(a));
    do return map(a, function(x)
      return (x / math.max(0.001, d))
    end) end
  end;
  local right = norm({(1 - (2 * ((at(Q, 1) * at(Q, 1)) + (at(Q, 2) * at(Q, 2))))), 0, (2 * ((at(Q, 0) * at(Q, 2)) - (at(Q, 3) * at(Q, 1))))});
  local function foot(j)
  local b = at(bases, j);
  local rows = {};
  local cols = {};
  do
    local k = 0;
    while (k < 3) do
      do
        do
          local d = map(at(p, ((b + (2 * k)) + 1)), function(x, i)
            return ((x - at(at(p, (b + (2 * k))), i)) * (active(j) and 1 or (-1)))
          end);
          append(rows, math.asin(cl((at(d, 1) / hypot(table.unpack(d))), 1)));
        end
      end
      ::continue_1::
      k = k + 1;
    end
  end
  do
    local k = 0;
    while (k < 2) do
      do
        do
          local d = map(at(p, ((b + 2) + k)), function(x, i)
            return (x - at(at(p, ((b + 4) + k)), i))
          end);
          append(cols, (-math.asin(cl((at(d, 1) / hypot(table.unpack(d))), 1))));
        end
      end
      ::continue_2::
      k = k + 1;
    end
  end
  local roll = (reduce(rows, function(x, y)
    return (x + y)
  end, 0) / 3);
  local pitch = ((at(cols, 0) + at(cols, 1)) / 2);
  local ex = (0.485 * ((math.abs(math.sin(roll)) + math.abs(math.sin(pitch))) + math.sqrt(math.max(0, ((1 - (math.sin(roll) ^ 2)) - (math.sin(pitch) ^ 2))))));
  local lo = math.huge;
  local hi = (-math.huge);
  local zlo = math.huge;
  local zhi = (-math.huge);
  local n = 0;
  local mask = 0;
  local clear = math.huge;
  do
    local k = 0;
    while (k < 6) do
      do
        do
          local q = at(p, (b + k));
          local low = ((at(q, 1) - ex) - (s).ground);
          clear = math.min(clear, low);
          if (active(at((s).touching, (b + k))) and (low < 0.06)) then
            n = n + 1;
            mask = (mask | (1 << k));
            lo = math.min(lo, (at(q, 0) - 0.46));
            hi = math.max(hi, (at(q, 0) + 0.46));
            zlo = math.min(zlo, (at(q, 2) - 0.46));
            zhi = math.max(zhi, (at(q, 2) + 0.46));
          end
        end
      end
      ::continue_3::
      k = k + 1;
    end
  end
  local X = norm(map(at(p, (b + 1)), function(x, i)
    return ((x - at(at(p, b), i)) * (active(j) and 1 or (-1)))
  end));
  local Z = norm(map(at(p, (b + 2)), function(x, i)
    return (x - at(at(p, (b + 4)), i))
  end));
  local Y = norm({((at(Z, 1) * at(X, 2)) - (at(Z, 2) * at(X, 1))), ((at(Z, 2) * at(X, 0)) - (at(Z, 0) * at(X, 2))), ((at(Z, 0) * at(X, 1)) - (at(Z, 1) * at(X, 0)))});
  local extent = ((0.485 * ((math.abs(dot(X, right)) + math.abs(dot(Y, right))) + math.abs(dot(Z, right)))) + 0.03);
  local pr = map(slice(p, b, (b + 6)), function(q)
    return dot(q, right)
  end);
  local pts = slice(p, b, (b + 6));
  local ys = map(pts, function(q)
    return at(q, 1)
  end);
  local yr = (math.max(table.unpack(ys)) - math.min(table.unpack(ys)));
  do return {x = at(at(p, b), 0), y = at(at(p, b), 1), z = at(at(p, b), 2), cx = ((at(at(p, b), 0) + at(at(p, (b + 1)), 0)) / 2), n = n, mask = mask, lo = lo, hi = hi, zlo = zlo, zhi = zhi, clear = clear, roll = roll, pitch = pitch, any = some(slice((s).touching, (b - 1), (b + 6)), active), edgeLo = (math.min(table.unpack(pr)) - extent), edgeHi = (math.max(table.unpack(pr)) + extent), yaw = math.atan(at(Z, 0), at(Z, 2)), cen = map({0, 2}, function(k)
    return reduce(pts, function(z, q)
      return (z + (at(q, k) / 6))
    end, 0)
  end), flat = (function() local value = (function() local value = (n == 6); if active(value) then return (yr < 0.015) else return value end end)(); if active(value) then return (math.max(table.unpack(ys)) < ((s).ground + 0.52)) else return value end end)(), yr = yr} end
end
local f = {foot(0), foot(1)};
local c = (s).centerOfMass;
local U = {(2 * ((at(Q, 0) * at(Q, 1)) - (at(Q, 3) * at(Q, 2)))), (1 - (2 * ((at(Q, 0) * at(Q, 0)) + (at(Q, 2) * at(Q, 2))))), (2 * ((at(Q, 1) * at(Q, 2)) + (at(Q, 3) * at(Q, 0))))};
local bodyRoll = (-math.atan(at((s).gravity, 0), (-at((s).gravity, 1))));
local bodyPitch = math.atan(at((s).gravity, 2), (-at((s).gravity, 1)));
local bodyYaw = math.atan((2 * ((at(Q, 0) * at(Q, 2)) + (at(Q, 3) * at(Q, 1)))), (1 - (2 * ((at(Q, 0) ^ 2) + (at(Q, 1) ^ 2)))));
local edgeGap = ((at(f, 1)).edgeLo - (at(f, 0)).edgeHi);
if ((m).phase == nil) then
  merge(m, {phase = 0, at = t, side = 1, ready = 0, rx = (s).x, ry = (s).y, rz = (s).z, F = map(f, function(q)
    return {(q).x, (q).y, (q).z}
  end), prev = map(f, function(q)
    return {(q).x, (q).y, (q).z, (q).roll, (q).pitch}
  end), fv = {{0, 0, 0, 0, 0}, {0, 0, 0, 0, 0}}, lastC = slice(c), cv = {0, 0, 0}, z0 = (s).z, events = {}, trace = {}, next = 0, steps = {0, 0}, landings = {0, 0}, lifts = {0, 0}, aborts = 0, recoveries = 0, air = false, airRun = 0, slip = 0, maxSlip = 0, minUp = 1, minHeight = 99, maxReachError = 0, goalY = ((s).ground + 0.485), catchAt = (-99), catchQ = nil, airAdvance = 0, supportBad = 0, strokeGround = 0, touches = 0, wasContact = true, approachQ = nil, approachAt = (-99), hipPrev = {slice(at(p, 4)), slice(at(p, 17))}, hv = {{0, 0, 0}, {0, 0, 0}}, maxDamp = 0, dir = 1, yaw = {prev = map(f, function(q)
    return (q).yaw
  end), rate = {0, 0}, rootMax = 0, skid = {{0}, {0}}, yawMax = {0, 0}, start = nil}, patrol = {bounds = {(-1.5), 1.5}, turns = {}, reversals = 0, range = {0, 0}, capped = 0, by = map({1, (-1)}, function(d)
    return {dir = d, lifts = {0, 0}, placements = {0, 0}, steps = {0, 0}, clean = {0, 0}, minUp = 1, stanceMax = 0, supportTime = 0, contactTime = 0, groundStroke = 0, supportBad = 0, advanceSum = 0, leadSum = 0, minSignedAdvance = 99, minAirProgress = 99}
  end)}, diag = {blocked = 0, maxError = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0}, phaseTime = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0}, preBad = 0, transferSlip = {0, 0}, transferContactBad = 0, refs = nil, rows = {}, g = nil, alternationErrors = 0, lastSide = (-1), leadSum = 0, landingCount = 0, cleanSteps = {0, 0}, raisedContactTime = 0, supportedAirTime = 0, supportedAirContact = 0, maxOutShift = 0}});
end
do
  local j = 0;
  while (j < 2) do
    do
      do
        local now = {(at(f, j)).x, (at(f, j)).y, (at(f, j)).z, (at(f, j)).roll, (at(f, j)).pitch};
        do
          local k = 0;
          while (k < 5) do
            do
              (at((m).fv, j))[index(k)] = ((0.85 * at(at((m).fv, j), k)) + ((0.15 * (at(now, k) - at(at((m).prev, j), k))) / dt));
            end
            ::continue_5::
            k = k + 1;
          end
        end
        ((m).prev)[index(j)] = now;
        local hp = at(p, (active(j) and 17 or 4));
        local w = (1 - math.exp(((-dt) / 0.08)));
        do
          local k = 0;
          while (k < 3) do
            do
              do
                (at((m).hv, j))[index(k)] = (at(at((m).hv, j), k) + (w * (((at(hp, k) - at(at((m).hipPrev, j), k)) / dt) - at(at((m).hv, j), k))));
                (at((m).hipPrev, j))[index(k)] = at(hp, k);
              end
            end
            ::continue_6::
            k = k + 1;
          end
        end
        (((m).yaw).rate)[index(j)] = ((0.85 * at(((m).yaw).rate, j)) + ((0.15 * wrap(((at(f, j)).yaw - at(((m).yaw).prev, j)))) / dt));
        (((m).yaw).prev)[index(j)] = (at(f, j)).yaw;
      end
    end
    ::continue_4::
    j = j + 1;
  end
end
((m).yaw).rootMax = math.max(((m).yaw).rootMax, math.abs(bodyYaw));
do
  local k = 0;
  while (k < 3) do
    do
      do
        ((m).cv)[index(k)] = ((0.95 * at((m).cv, k)) + ((0.05 * (at(c, k) - at((m).lastC, k))) / dt));
        ((m).lastC)[index(k)] = at(c, k);
      end
    end
    ::continue_7::
    k = k + 1;
  end
end
(m).minUp = math.min((m).minUp, (s).up);
(m).minHeight = math.min((m).minHeight, ((s).y - (s).ground));
((m).patrol).range = {math.min(at(((m).patrol).range, 0), ((s).z - (m).z0)), math.max(at(((m).patrol).range, 1), ((s).z - (m).z0))};
local function row()
do return map({t, (m).phase, (m).side, (m).dir, (s).up, (s).x, (s).y, ((s).z - (m).z0), at(c, 0), (at(f, 0)).mask, (at(f, 1)).mask, (at(f, 0)).clear, (at(f, 1)).clear, (m).slip, (m).rx, (m).ry, at(a, 7), at(a, 20)}, rd) end
end
local function ev(k)
if (#((m).events) >= 4) then
  shift((m).events);
end
append((m).events, {k, row()});
if ((not active((m).firstFailure)) and active(matches({"timeout", "abort", "lost", "unscored"}, k))) then
  (m).firstFailure = {k, row()};
end
end
local function go(q, k)
ev(k);
(m).phase = q;
(m).at = t;
(m).ready = 0;
end
local S = (m).side;
local W = (1 - S);
local st = at(f, S);
local sw = at(f, W);
local both = every(f, function(q)
  return (function() local value = ((q).n > 0); if active(value) then return ((q).clear < 0.06) else return value end end)()
end);
local stable = (function() local value = (function() local value = (function() local value = (function() local value = both; if active(value) then return ((s).up > 0.985) else return value end end)(); if active(value) then return (hypot(at((m).cv, 0), at((m).cv, 2)) < 0.18) else return value end end)(); if active(value) then return (hypot(table.unpack((s).gyroscope)) < 0.18) else return value end end)(); if active(value) then return every((m).fv, function(q)
  return (hypot(at(q, 0), at(q, 2)) < 0.12)
end) else return value end end)();
local D = (m).diag;
local d = (m).dir;
((D).phaseTime)[index((m).phase)] = (at((D).phaseTime, (m).phase) + dt);
((D).maxError)[index((m).phase)] = math.max(at((D).maxError, (m).phase), math.abs(((m).rx - (s).x)));
if ((m).phase == 1) then
  if (not active((D).refs)) then
    (D).refs = map(bases, function(b)
      return map(slice(p, b, (b + 6)), function(q)
        return {at(q, 0), at(q, 2)}
      end)
    end);
  end
  do
    local j = 0;
    while (j < 2) do
      do
        do
          local k = 0;
          while (k < 6) do
            do
              do
                local q = at(p, (at(bases, j) + k));
                local o = at(at((D).refs, j), k);
                ((D).transferSlip)[index(j)] = math.max(at((D).transferSlip, j), hypot((at(q, 0) - at(o, 0)), (at(q, 2) - at(o, 1))));
              end
            end
            ::continue_9::
            k = k + 1;
          end
        end
      end
      ::continue_8::
      j = j + 1;
    end
  end
  if (not active(both)) then
    (D).transferContactBad = ((D).transferContactBad + dt);
  end
else
  (D).refs = nil;
end
if ((m).phase == 0) then
  (m).ready = (active(stable) and ((m).ready + dt) or 0);
  if ((m).ready > 1.2) then
    (m).F = map(f, function(q)
      return {(q).x, (q).y, (q).z}
    end);
    (m).rx = (s).x;
    (m).rz = (s).z;
    go(1, "standing ready");
  else
    do return "" end
  end
end
local neutral = (function() local value = ((m).phase == 5); if active(value) then return value else return ((m).phase == 9) end end)();
local tx = (active(neutral) and (((at(f, 0)).cx + (at(f, 1)).cx) / 2) or ((st).cx + ((S == 0) and 0.35 or (-0.35))));
local tz = (((at(f, 0)).z + (at(f, 1)).z) / 2);
if (active((st).n) and (not active(neutral))) then
  tx = bound(tx, ((st).lo + 0.18), ((st).hi - 0.18));
end
if ((((m).phase == 1) or ((m).phase == 2)) or active(neutral)) then
  local dx = cl((((((m).phase == 1) and 0.9 or 0.65) * (tx - at(c, 0))) - (0.65 * at((m).cv, 0))), 0.45);
  if ((((m).phase == 2) and (math.abs(((m).rx - (s).x)) >= 0.55)) and ((dx * ((m).rx - (s).x)) > 0)) then
    (D).blocked = ((D).blocked + dt);
    dx = 0;
  end
  (m).rx = ((m).rx + (dx * dt));
  (m).rz = ((m).rz + (cl(((0.4 * (tz - at(c, 2))) - (0.5 * at((m).cv, 2))), 0.18) * dt));
end
local mid = ((at(at((m).F, 0), 0) + at(at((m).F, 1), 0)) / 2);
(m).rx = bound((m).rx, (mid - 3.3), (mid + 3.3));
(m).rz = bound((m).rz, (math.min(at(at((m).F, 0), 2), at(at((m).F, 1), 2)) - 0.6), (math.max(at(at((m).F, 0), 2), at(at((m).F, 1), 2)) + 0.6));
local margin = (function() if active((st).n) then return math.min((at(c, 0) - (st).lo), ((st).hi - at(c, 0)), (at(c, 2) - (st).zlo), ((st).zhi - at(c, 2))) else return (-1) end end)();
if ((m).phase == 1) then
  (m).ready = (((((active(stable) and ((s).up > 0.99)) and (margin > 0.12)) and (math.abs((tx - at(c, 0))) < 0.16)) and (math.abs(at((m).cv, 0)) < 0.15)) and ((m).ready + dt) or 0);
  if ((m).ready > 0.25) then
    if (((m).patrol).limit == nil) then
      ((m).patrol).limit = (5 + (5 * r()));
    end
    local traffic = find((function() local value = (s).nearby; if active(value) then return value else return {} end end)(), function(c)
      return (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (not active((c).cargo)); if active(value) then return ((c).high > ((s).ground + 0.5)) else return value end end)(); if active(value) then return ((c).low < ((s).y + 1)) else return value end end)(); if active(value) then return (math.abs(((c).x - (s).x)) < ((c).radius + 3)) else return value end end)(); if active(value) then return ((d * ((c).z - (s).z)) > 1) else return value end end)(); if active(value) then return (hypot(((c).x - (s).x), ((c).z - (s).z)) < ((c).radius + 9)) else return value end end)()
    end);
    local edge = at((function() local value = (s).groundSamples; if active(value) then return value else return {} end end)(), ((d > 0) and 0 or 4));
    if ((((d * ((s).z - (m).z0)) >= ((m).patrol).limit) or active(traffic)) or (active(edge) and (math.abs((at(edge, 1) - (s).ground)) > 0.4))) then
      if active(traffic) then
        ((m).patrol).yields = ((function() local value = ((m).patrol).yields; if active(value) then return value else return 0 end end)() + 1);
        ((m).patrol).lastYield = (traffic).id;
      end
      ((m).patrol).limit = (5 + (5 * r()));
      d = (-d);
      (m).dir = d;
      ((m).patrol).reversals = ((m).patrol).reversals + 1;
      if (#(((m).patrol).turns) >= 8) then
        shift(((m).patrol).turns);
      end
      append(((m).patrol).turns, map({t, d, ((s).z - (m).z0), (s).up, margin, (at(f, 0)).mask, (at(f, 1)).mask, hypot(at((m).cv, 0), at((m).cv, 2))}, rd));
      ev("stable direction reversal");
    end
    if ((d * ((sw).z - (st).z)) > 0.2) then
      (m).side = W;
      (m).F = map(f, function(q)
        return {(q).x, (q).y, (q).z}
      end);
      (m).rx = (s).x;
      (m).rz = (s).z;
      ((m).patrol).replants = ((function() local value = ((m).patrol).replants; if active(value) then return value else return 0 end end)() + 1);
      go(1, "transfer for trailing foot");
      do return "" end
    end
    (m).F = map(f, function(q)
      return {(q).x, (q).y, (q).z}
    end);
    (m).origin = slice(at((m).F, W));
    (m).stanceStart = slice(at((m).F, S));
    ((m).yaw).start = concat((st).cen, {(st).yaw}, {(st).flat});
    local lead = (function() if (d > 0) then return math.max((at(f, 0)).z, (at(f, 1)).z) else return math.min((at(f, 0)).z, (at(f, 1)).z) end end)();
    local reach = ((d * (lead - at((m).origin, 2))) + 0.7);
    if (reach > 1.35) then
      ((m).patrol).capped = ((m).patrol).capped + 1;
    end
    (m).goalZ = (at((m).origin, 2) + (d * math.min(reach, 1.35)));
    (m).goalY = ((s).ground + 0.485);
    (m).air = false;
    (m).airRun = 0;
    (m).slip = 0;
    (m).strokeAt = nil;
    (m).airAdvance = 0;
    (m).supportBad = 0;
    (m).strokeGround = 0;
    (m).touches = 0;
    (m).wasContact = true;
    (m).catchQ = nil;
    (m).approachQ = nil;
    (D).g = {raw = 0, rawMax = 0, preBad = 0, lead = lead, minUp = 1, clean = 0, cleanMax = 0, cleanZ = (sw).z, cleanAdvance = 0, raisedContact = 0, minGap = 99, supportedAir = 0, contactAir = 0, run = 0, startZ = (sw).z, progress = 0, reach = reach, stanceRef = map(slice(p, at(bases, S), (at(bases, S) + 6)), function(q)
      return {at(q, 0), at(q, 2)}
    end)};
    go(2, "transfer ready");
  else
    if ((t - (m).at) > 20) then
      (m).aborts = (m).aborts + 1;
      (m).F = map(f, function(q)
        return {(q).x, (q).y, (q).z}
      end);
      go(5, "transfer timeout");
    end
  end
end
local B = at(((m).patrol).by, ((d > 0) and 0 or 1));
if ((((m).phase == 2) or ((m).phase == 3)) or ((m).phase == 4)) then
  local ys = ((m).yaw).start;
  local bi = ((d > 0) and 0 or 1);
  if ((active(ys) and active(at(ys, 3))) and active((st).flat)) then
    local dx = (at((st).cen, 0) - at(ys, 0));
    local dz = (at((st).cen, 1) - at(ys, 1));
    local dist = hypot(dx, dz);
    local angle = ((wrap(((st).yaw - at(ys, 2))) * 180) / math.pi);
    (((m).yaw).yawMax)[index(bi)] = math.max(at(((m).yaw).yawMax, bi), math.abs(angle));
    if (dist > at(at(((m).yaw).skid, bi), 0)) then
      (((m).yaw).skid)[index(bi)] = {dist, dx, dz, angle, t, S, (st).yr};
    end
  end
  (m).slip = math.max((m).slip, hypot(((st).x - at((m).stanceStart, 0)), ((st).z - at((m).stanceStart, 2))));
  (m).maxSlip = math.max((m).maxSlip, (m).slip);
  if active((m).air) then
    if (((((sw).n == 0) and ((sw).clear > 0.05)) and ((st).n > 0)) and ((s).up > 0.98)) then
      (m).airAdvance = math.max((m).airAdvance, (d * ((sw).z - at((m).origin, 2))));
    end
    if (((m).phase ~= 4) and ((((st).n == 0) or (margin < 0)) or ((s).up < 0.97))) then
      (m).supportBad = ((m).supportBad + dt);
      (B).supportBad = ((B).supportBad + dt);
    end
    if (active((sw).n) and (not active((m).wasContact))) then
      (m).touches = (m).touches + 1;
      ev("contact edge");
    end
  end
  (m).wasContact = ((sw).n > 0);
  local g = (D).g;
  (g).minUp = math.min((g).minUp, (s).up);
  (B).minUp = math.min((B).minUp, (s).up);
  do
    local k = 0;
    while (k < 6) do
      do
        (B).stanceMax = math.max((B).stanceMax, hypot((at(at(p, (at(bases, S) + k)), 0) - at(at((g).stanceRef, k), 0)), (at(at(p, (at(bases, S) + k)), 2) - at(at((g).stanceRef, k), 1))));
      end
      ::continue_10::
      k = k + 1;
    end
  end
  if ((m).phase ~= 4) then
    (g).raw = ((((sw).n == 0) and ((sw).clear > 0.05)) and ((g).raw + dt) or 0);
    (g).rawMax = math.max((g).rawMax, (g).raw);
    if ((not active((m).air)) and ((((st).n == 0) or (margin < 0)) or ((s).up < 0.97))) then
      (g).preBad = ((g).preBad + dt);
      (D).preBad = ((D).preBad + dt);
    end
    local supported = (function() local value = (function() local value = (function() local value = (function() local value = ((sw).clear > 0.15); if active(value) then return ((sw).n == 0) else return value end end)(); if active(value) then return ((st).n > 0) else return value end end)(); if active(value) then return (margin > 0.08) else return value end end)(); if active(value) then return ((s).up > 0.985) else return value end end)();
    if active(supported) then
      (g).supportedAir = ((g).supportedAir + dt);
      (D).supportedAirTime = ((D).supportedAirTime + dt);
      (B).supportTime = ((B).supportTime + dt);
      if (not active((g).run)) then
        (g).startZ = (sw).z;
      end
      (g).run = ((g).run + dt);
      (g).progress = math.max((g).progress, (d * ((sw).z - (g).startZ)));
      if active((sw).any) then
        (g).contactAir = ((g).contactAir + dt);
        (D).supportedAirContact = ((D).supportedAirContact + dt);
        (B).contactTime = ((B).contactTime + dt);
      end
    else
      (g).run = 0;
    end
    local clean = (function() local value = (function() local value = (function() local value = (function() local value = (not active((sw).any)); if active(value) then return ((sw).clear > 0.05) else return value end end)(); if active(value) then return ((st).n > 0) else return value end end)(); if active(value) then return (margin > 0.08) else return value end end)(); if active(value) then return ((s).up > 0.985) else return value end end)();
    if active(clean) then
      if (not active((g).clean)) then
        (g).cleanZ = (sw).z;
      end
      (g).clean = ((g).clean + dt);
      (g).cleanMax = math.max((g).cleanMax, (g).clean);
      (g).cleanAdvance = math.max((g).cleanAdvance, (d * ((sw).z - (g).cleanZ)));
    else
      (g).clean = 0;
    end
    if (active((sw).any) and ((sw).clear > 0.05)) then
      (g).raisedContact = ((g).raisedContact + dt);
      (D).raisedContactTime = ((D).raisedContactTime + dt);
    end
    if ((sw).clear > 0.05) then
      (g).minGap = math.min((g).minGap, edgeGap);
    end
  end
end
if ((((m).phase == 2) or ((m).phase == 3)) and ((sw).clear > 0.08)) then
  local dir = (active(W) and 1 or (-1));
  local shift_ = (dir * (at(at((m).F, W), 0) - at((m).origin, 0)));
  shift_ = bound((shift_ + (bound((0.6 * (0.3 - edgeGap)), 0, 0.15) * dt)), 0, 0.45);
  (at((m).F, W))[index(0)] = (at((m).origin, 0) + (dir * shift_));
  (D).maxOutShift = math.max((D).maxOutShift, shift_);
end
if ((m).phase == 2) then
  (at((m).F, W))[index(1)] = ((m).goalY + (0.65 * math.min(1, ((t - (m).at) / 1.1))));
  local clear = (function() local value = (function() local value = (function() local value = (function() local value = ((sw).n == 0); if active(value) then return ((sw).clear > 0.15) else return value end end)(); if active(value) then return ((st).n > 0) else return value end end)(); if active(value) then return (margin > 0.08) else return value end end)(); if active(value) then return ((s).up > 0.985) else return value end end)();
  (m).airRun = (active(clear) and ((m).airRun + dt) or 0);
  if (((m).airRun > 0.1) and (not active((m).air))) then
    (m).air = true;
    ((m).lifts)[index(W)] = at((m).lifts, W) + 1;
    ((B).lifts)[index(W)] = at((B).lifts, W) + 1;
    (m).strokeAt = t;
    ev("airborne swing");
  end
  local u = (((m).strokeAt == nil) and 0 or bound(((t - (m).strokeAt) / ((d > 0) and 1.25 or 1.9)), 0, 1));
  local e = ((u * u) * (3 - (2 * u)));
  (at((m).F, W))[index(2)] = (at((m).origin, 2) + (e * ((m).goalZ - at((m).origin, 2))));
  if (active((m).air) and active((sw).n)) then
    (m).strokeGround = ((m).strokeGround + dt);
    (B).groundStroke = ((B).groundStroke + dt);
  end
  if (((active((m).air) and ((t - (m).strokeAt) > ((d > 0) and 1.4 or 2.05))) and ((d * ((sw).z - at((m).origin, 2))) > 0.25)) and ((sw).clear > 0.12)) then
    (m).approachAt = t;
    (m).approachQ = map(at(ids, W), function(i)
      return at(a, i)
    end);
    (m).slew = slice((m).approachQ);
    go(3, "lower swing");
  else
    if (((t - (m).at) > ((d > 0) and 5 or 6)) or ((s).up < 0.94)) then
      (m).aborts = (m).aborts + 1;
      (m).approachAt = t;
      (m).approachQ = map(at(ids, W), function(i)
        return at(a, i)
      end);
      (m).slew = slice((m).approachQ);
      go(3, "swing abort");
    end
  end
end
if ((m).phase == 3) then
  (at((m).F, W))[index(1)] = math.max((m).goalY, (at(at((m).F, W), 1) - (0.28 * dt)));
  if (((sw).n > 0) and ((sw).clear < 0.055)) then
    (m).advance = (d * ((sw).z - at((m).origin, 2)));
    (m).catchState = {t = rd(t), dir = d, root = map({(s).x, (s).y, (s).z}, rd), velocity = map({(s).vx, (s).vy, (s).vz}, rd), footVelocity = map(slice(at((m).fv, W), 0, 3), rd), slip = rd((m).slip)};
    (m).F = map(f, function(q)
      return {(q).x, (q).y, (q).z}
    end);
    (m).rx = (s).x;
    (m).ry = (s).y;
    (m).rz = (s).z;
    (m).catchAt = t;
    (m).catchQ = map(ids, function(row)
      return map(row, function(i)
        return at(a, i)
      end)
    end);
    go(4, "first-contact catch");
  else
    if ((t - (m).at) > 7) then
      (m).aborts = (m).aborts + 1;
      (m).F = map(f, function(q)
        return {(q).x, (q).y, (q).z}
      end);
      go(5, "touchdown timeout");
    end
  end
end
if ((m).phase == 4) then
  if ((t - (m).catchAt) > 0.35) then
    do
      local j = 0;
      while (j < 2) do
        do
          (at((m).F, j))[index(1)] = (at(at((m).F, j), 1) + cl((((s).ground + 0.485) - at(at((m).F, j), 1)), (0.06 * dt)));
        end
        ::continue_11::
        j = j + 1;
      end
    end
  end
  (m).ready = (active(stable) and ((m).ready + dt) or 0);
  if (((m).ready > 0.5) and ((t - (m).at) > 2.85)) then
    (m).advance = (d * ((sw).z - at((m).origin, 2)));
    ((m).landings)[index(W)] = at((m).landings, W) + 1;
    ((B).placements)[index(W)] = at((B).placements, W) + 1;
    local scored = (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (m).air; if active(value) then return ((m).airAdvance > 0.25) else return value end end)(); if active(value) then return (((D).g).progress > 0.25) else return value end end)(); if active(value) then return ((m).advance > 0.25) else return value end end)(); if active(value) then return ((m).slip < 0.25) else return value end end)(); if active(value) then return ((m).supportBad < 0.2) else return value end end)();
    if active(scored) then
      ((m).steps)[index(W)] = at((m).steps, W) + 1;
      ((B).steps)[index(W)] = at((B).steps, W) + 1;
      ev("stable signed landing");
    else
      (m).aborts = (m).aborts + 1;
      ev("stable unscored landing");
    end
    local g = (D).g;
    local lead = (d * ((sw).z - (g).lead));
    if ((D).lastSide == W) then
      (D).alternationErrors = (D).alternationErrors + 1;
    end
    (D).lastSide = W;
    (D).leadSum = ((D).leadSum + lead);
    (D).landingCount = (D).landingCount + 1;
    (B).advanceSum = ((B).advanceSum + (m).advance);
    (B).leadSum = ((B).leadSum + lead);
    (B).minSignedAdvance = math.min((B).minSignedAdvance, (m).advance);
    (B).minAirProgress = math.min((B).minAirProgress, (g).progress);
    if ((active(scored) and ((g).cleanMax > 0.1)) and ((g).cleanAdvance > 0.25)) then
      ((D).cleanSteps)[index(W)] = at((D).cleanSteps, W) + 1;
      ((B).clean)[index(W)] = at((B).clean, W) + 1;
    end
    if (#((D).rows) >= 6) then
      shift((D).rows);
    end
    append((D).rows, map({t, W, d, (m).advance, lead, (m).slip, (g).preBad, (m).supportBad, (active(scored) and 1 or 0), (g).minUp, (g).cleanMax, (g).cleanAdvance, (g).raisedContact, (g).minGap, (g).progress}, rd));
    (m).lastLanding = {t = rd(t), side = W, dir = d, advance = rd((m).advance), airAdvance = rd((m).airAdvance), supportedProgress = rd((g).progress), slip = rd((m).slip), supportBad = rd((m).supportBad), groundStroke = rd((m).strokeGround), z = rd(((s).z - (m).z0))};
    (m).side = W;
    (m).air = false;
    (m).F = map(f, function(q)
      return {(q).x, (q).y, (q).z}
    end);
    go(1, "next weight transfer");
  else
    if ((t - (m).at) > 7) then
      (m).aborts = (m).aborts + 1;
      (m).F = map(f, function(q)
        return {(q).x, (q).y, (q).z}
      end);
      go(5, "settle timeout");
    end
  end
end
if ((m).phase == 5) then
  (m).ready = ((active(stable) and (math.abs((tx - at(c, 0))) < 0.15)) and ((m).ready + dt) or 0);
  if ((m).ready > 0.7) then
    (m).recoveries = (m).recoveries + 1;
    (m).F = map(f, function(q)
      return {(q).x, (q).y, (q).z}
    end);
    go(1, "recovered double support");
  else
    if ((t - (m).at) > 12) then
      go(9, "recovery timeout");
    end
  end
end
if (m.phase == 9) then
  m.ready = stable and (m.ready + dt) or 0;
  if m.ready > 2 then
    m.F = map(f, function(q) return {q.x, q.y, q.z} end);
    m.rx, m.ry, m.rz = s.x, s.y, s.z;
    go(5, "stable footing restored");
  end
end
local height = math.huge;
do
  local j = 0;
  while (j < 2) do
    do
      do
        if (((m).phase == 2) and (j == W)) then
          goto continue_12
        end
        local dx = (at(at((m).F, j), 0) - ((m).rx + (active(j) and 1 or (-1))));
        local dz = (at(at((m).F, j), 2) - (m).rz);
        local L = (2 + math.sqrt(math.max(0.1, ((1.98 * 1.98) - (dz * dz)))));
        height = math.min(height, ((at(at((m).F, j), 1) + 3) + math.sqrt(math.max(0.25, ((L * L) - (dx * dx))))));
      end
    end
    ::continue_12::
    j = j + 1;
  end
end
if (((m).phase ~= 4) or ((t - (m).catchAt) > 0.35)) then
  (m).ry = ((m).ry + cl((height - (m).ry), (0.7 * dt)));
end
local targets = {};
local capture = ((m).phase == 4);
local u = bound((((t - (m).catchAt) - 0.35) / 2), 0, 1);
local blend = ((u * u) * (3 - (2 * u)));
local damps = {};
do
  local j = 0;
  while (j < 2) do
    do
      do
        local free = (function() local value = ((m).phase == 2); if active(value) then return (j == W) else return value end end)();
        local approach = (function() local value = ((m).phase == 3); if active(value) then return (j == W) else return value end end)();
        local dx = (at(at((m).F, j), 0) - ((m).rx + (active(j) and 1 or (-1))));
        local dy = (((m).ry - at(at((m).F, j), 1)) - 3);
        local dz = (at(at((m).F, j), 2) - (m).rz);
        if active(free) then
          local H = map(at(p, ((j == 0) and 4 or 17)), function(x, i)
            return (x - (0.5 * at(U, i)))
          end);
          dx = (at(at((m).F, j), 0) - at(H, 0));
          dy = ((at(H, 1) - at(at((m).F, j), 1)) - 1.5);
          dz = (at(at((m).F, j), 2) - at(H, 2));
        end
        local H = hypot(dx, dy);
        local midY = (H - 2);
        local R = hypot(midY, dz);
        local k = (2 * math.acos(bound((R / 2), 0.64, 0.99995)));
        local theta = math.atan(dx, dy);
        local alpha = math.atan((-dz), midY);
        (m).maxReachError = math.max((m).maxReachError, math.max(0, (R - 2)));
        local q = {cl((theta - (function() if active(free) then return bodyRoll else return 0 end end)()), 1.08), cl(((alpha - (0.5 * k)) - (function() if active(free) then return bodyPitch else return 0 end end)()), 1.5), k, cl(((-alpha) - (0.5 * k)), 1.6), cl((-theta), 1.5)};
        if active(approach) then
          local b = bound(((t - (m).approachAt) / 1.25), 0, 1);
          local e = ((b * b) * (3 - (2 * b)));
          q = map(q, function(x, l)
            return (((1 - e) * at((m).approachQ, l)) + (e * x))
          end);
          local delta = map(q, function(x, l)
            return (x - at((m).slew, l))
          end);
          local sc = math.min(1, ((0.45 * dt) / math.max(0.000001, table.unpack(map(delta, math.abs)))));
          q = map((m).slew, function(x, l)
            return (x + (sc * at(delta, l)))
          end);
          (m).slew = slice(q);
        end
        if active(capture) then
          q = map(q, function(x, l)
            return (((1 - blend) * at(at((m).catchQ, j), l)) + (blend * x))
          end);
        end
        append(targets, map(q, rd));
        local share = (function() if (active(capture) or ((m).phase == 1)) then return (active((at(f, j)).n) and (1 / math.max(1, #(filter(f, function(x)
          return ((x).n > 0)
        end)))) or 0) else return ((((((m).phase == 2) or ((m).phase == 3)) and (j == S)) and active((at(f, j)).n)) and 1 or 0) end end)();
        local dr = (share * cl(((0.65 * at(at((m).hv, j), 0)) / math.max(1.5, (((m).ry - at(at((m).F, j), 1)) - 3))), 0.25));
        local dp = ((-share) * cl(((0.45 * at(at((m).hv, j), 2)) / math.max(0.8, (math.cos(at(a, at(at(ids, j), 1))) + math.cos((at(a, at(at(ids, j), 1)) + at(a, at(at(ids, j), 2))))))), 0.25));
        local rr = (share * cl((0.3 * at((s).gyroscope, 2)), 0.12));
        local rp = (share * cl((0.3 * ((at((s).gyroscope, 0) * math.cos(at(a, at(at(ids, j), 0)))) + (at((s).gyroscope, 1) * math.sin(at(a, at(at(ids, j), 0)))))), 0.12));
        local damp = {((dr + rr) / 1.3), ((dp + rp) / 1.5), 0, ((-dp) / 1.5), ((-dr) / 1.5)};
        append(damps, map(damp, rd));
        (m).maxDamp = math.max((m).maxDamp, table.unpack(map(damp, math.abs)));
        do
          local l = 0;
          while (l < 5) do
            do
              do
                local soft = (function() local value = capture; if active(value) then return value else return approach end end)();
                local cmd = 4*(at(q,l)-at(a,at(at(ids,j),l)))/(1+(active(soft) and .55 or .25)*s.blueprint[at(at(ids,j),l)+1].speed);
                local plane = (function() if active(capture) then return blend else return 1 end end)();
                if (l == 4) then
                  cmd = (cmd - (plane * ((3 * (at(f, j)).roll) + (0.25 * at(at((m).fv, j), 3)))));
                end
                if (l == 3) then
                  cmd = (cmd - (plane * ((3 * (at(f, j)).pitch) + (0.25 * at(at((m).fv, j), 4)))));
                end
                cmd = cl((cmd + at(damp, l)), (active(soft) and 0.45 or 0.8));
                (out)[index(at(at(at(keys, j), l), ((cmd < 0) and 0 or 1)))] = math.abs(cmd);
              end
            end
            ::continue_14::
            l = l + 1;
          end
        end
        local yi = (active(j) and 17 or 4);
        local ycmd = cl(((active(free) or active(approach)) and (((-1.5) * (at(f, j)).yaw) - (0.35 * at(((m).yaw).rate, j))) or (share * ((1.2 * bodyYaw) + (0.4 * at((s).angularVelocity, 1))))), 0.2);
        if (((at(a, yi) * ycmd) > 0) and (math.abs(at(a, yi)) > 0.5)) then
          ycmd = 0;
        end
        (out)[index(at((active(j) and "NM" or "CV"), ((ycmd < 0) and 0 or 1)))] = math.abs(ycmd);
      end
    end
    ::continue_13::
    j = j + 1;
  end
end
(m).audit = {row = row(), target = targets, damping = damps, margin = rd(margin), estimatedEdgeGap = rd(edgeGap), width = rd(((at(f, 1)).x - (at(f, 0)).x)), comError = rd((tx - at(c, 0))), cv = map((m).cv, rd), maxSlip = rd((m).maxSlip)};
if (t >= (m).next) then
  (m).next = (t + 1);
  if (#((m).trace) >= 3) then
    shift((m).trace);
  end
  append((m).trace, row());
end
do return out end
end
