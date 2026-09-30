return (function()
  local drive = function(t, s, m, r)
    local function cl(v, a)
    do return math.max((-a), math.min(a, v)) end
  end
  local dt = (s).dt;
  local q = (s).rotation;
  local x = at(q, 0);
  local y = at(q, 1);
  local z = at(q, 2);
  local w = at(q, 3);
  local C = (s).centerOfMass;
  local function local_(v)
  do return {((((1 - (2 * ((y * y) + (z * z)))) * at(v, 0)) + ((2 * ((x * y) + (z * w))) * at(v, 1))) + ((2 * ((x * z) - (y * w))) * at(v, 2))), ((((2 * ((x * y) - (z * w))) * at(v, 0)) + ((1 - (2 * ((x * x) + (z * z)))) * at(v, 1))) + ((2 * ((y * z) + (x * w))) * at(v, 2))), ((((2 * ((x * z) + (y * w))) * at(v, 0)) + ((2 * ((y * z) - (x * w))) * at(v, 1))) + ((1 - (2 * ((x * x) + (y * y)))) * at(v, 2)))} end
end
local function at_(i)
do return local_({(at(at((s).positions, i), 0) - at(C, 0)), (at(at((s).positions, i), 1) - at(C, 1)), (at(at((s).positions, i), 2) - at(C, 2))}) end
end
if ((m).p == nil) then
  (m).p = 0;
  (m).x = (s).x;
  (m).z = (s).z;
  (m).g = (s).ground;
  (m).h = (s).y;
  (m).at = t;
  (m).prev = slice(C);
  (m).v = {0, 0, 0};
  (m).gy = {0, 0, 0};
  (m).hi = 0;
  (m).pi = 0;
  (m).ri = 0;
  (m).i = 0;
  (m).hit = 0;
  (m).pause = (1 + (0.3 * r()));
  (m).cycles = 0;
end
do
  local k = 0;
  while (k < 3) do
    do
      do
        ((m).v)[index(k)] = (at((m).v, k) + ((dt / (0.1 + dt)) * (((at(C, k) - at((m).prev, k)) / dt) - at((m).v, k))));
        ((m).prev)[index(k)] = at(C, k);
        ((m).gy)[index(k)] = (at((m).gy, k) + ((dt / (0.06 + dt)) * (at((s).gyroscope, k) - at((m).gy, k))));
      end
    end
    ::continue_1::
    k = k + 1;
  end
end
local feet = {18, 20, 22, 24};
local gears = {17, 19, 21, 23};
local contacts = 0;
local ga = 0;
do
  local i = 0;
  while (i < 4) do
    do
      do
        if (active(at((s).touching, at(feet, i))) and (at(at((s).positions, at(feet, i)), 1) < ((s).ground + 0.7))) then
          contacts = contacts + 1;
        end
        ga = math.max(ga, at((s).angles, at(gears, i)));
      end
    end
    ::continue_2::
    i = i + 1;
  end
end
local function gear(out, target)
do
  local i = 0;
  while (i < 4) do
    do
      do
        local j = at(gears, i);
        local v = cl(((3 * (target - at((s).angles, j))) - (0.12 * at((s).rates, j))), 0.65);
        (out)[index(tostring(((2 * i) + ((v >= 0) and 2 or 1))))] = math.abs(v);
      end
    end
    ::continue_3::
    i = i + 1;
  end
end
do return out end
end
local function next(p)
(m).p = p;
(m).at = t;
(m).hit = 0;
end
local sp = hypot(at((m).v, 0), at((m).v, 2));
local home = hypot(((s).x - (m).x), ((s).z - (m).z));
local tx = (m).x;
local tz = (m).z;
if ((m).p == 0) then
  (m).hi = 0;
  (m).pi = 0;
  (m).ri = 0;
  if ((((t - (m).at) > (m).pause) and (contacts >= 3)) and (ga < 0.04)) then
    (m).h = ((m).g + 14);
    (m).i = 0;
    next(1);
  else
    do return gear({}, 0) end
  end
end
if ((((m).p == 1) and ((s).y > ((m).g + 13))) and (math.abs(at((m).v, 1)) < 0.8)) then
  next(2);
end
local route = {{0, 18}, {12, 18}, {12, 0}, {0, 0}};
if ((m).p == 2) then
  tx = ((m).x + at(at(route, (m).i), 0));
  tz = ((m).z + at(at(route, (m).i), 1));
  local near = (function() local value = (hypot((tx - (s).x), (tz - (s).z)) < 0.25); if active(value) then return (sp < 0.23) else return value end end)();
  (m).hit = (active(near) and ((m).hit + dt) or 0);
  if ((m).hit > 1) then
    (m).i = (m).i + 1;
    (m).hit = 0;
    if ((m).i == 4) then
      (m).h = (s).y;
      next(3);
    end
  end
end
if ((m).p == 3) then
  tx = (m).x;
  tz = (m).z;
  if (((home < 0.45) and (sp < 0.3)) and (ga < 0.035)) then
    (m).h = math.max(((m).g + 2.32), ((m).h - (0.7 * dt)));
  end
  (m).hit = (((((contacts >= 3) and (home < 0.2)) and (sp < 0.15)) and (math.abs(at((m).v, 1)) < 0.2)) and ((m).hit + dt) or 0);
  if ((m).hit > 0.5) then
    (m).cycles = (m).cycles + 1;
    (m).pause = (3 + (0.5 * r()));
    next(0);
    do return gear({}, 0) end
  end
end
local wx = (0.9 * (tx - (s).x));
local wz = (0.9 * (tz - (s).z));
local sc = math.min(1, (2 / math.max(0.001, hypot(wx, wz))));
wx = (wx * sc);
wz = (wz * sc);
local acc = local_({cl((1.8 * (wx - at((m).v, 0))), 1), 0, cl((1.8 * (wz - at((m).v, 2))), 1)});
local g = (s).gravity;
local G = hypot(at(g, 0), at(g, 1), at(g, 2));
local ep = (-math.atan(at(g, 2), (-at(g, 1))));
local er = (-math.atan((-at(g, 0)), (-at(g, 1))));
local com = local_({(at(C, 0) - (s).x), (at(C, 1) - (s).y), (at(C, 2) - (s).z)});
(m).pi = cl(((m).pi + (ep * dt)), 0.3);
(m).ri = cl(((m).ri + (er * dt)), 0.3);
local eh = ((m).h - (s).y);
(m).hi = cl(((m).hi + (eh * dt)), 1);
local ay = cl((((2.2 * eh) - (2.8 * at((m).v, 1))) + (0.16 * (m).hi)), 1.8);
local total = (((s).mass * (G + ay)) / math.max(0.7, (s).up));
local fx = cl(((s).mass * at(acc, 0)), 20);
local fz = cl(((s).mass * at(acc, 2)), 20);
local p37 = at_(37);
local p38 = at_(38);
local p39 = at_(39);
local p40 = at_(40);
local mx = (((((250 * ep) - (175 * at((m).gy, 0))) + (4 * (m).pi)) - (total * at(com, 2))) - (((at(p37, 1) + at(p38, 1)) * fz) / 2));
local mz = (((((250 * er) - (175 * at((m).gy, 2))) + (4 * (m).ri)) + (total * at(com, 0))) + (((at(p39, 1) + at(p40, 1)) * fx) / 2));
local function jet(v)
do return math.max(0, math.min(1, (v / 40))) end
end
local base = (total / 4);
local out = {A = jet((base - (mz / 8))), S = jet((base + (mz / 8))), D = jet((base - (mx / 8))), F = jet((base + (mx / 8)))};
local yaw = math.atan((2 * ((x * z) + (y * w))), (1 - (2 * ((x * x) + (y * y)))));
local my = (((((-70) * yaw) - (100 * at((m).gy, 1))) - ((fx * (at(p39, 2) + at(p40, 2))) / 2)) + ((fz * (at(p37, 0) + at(p38, 0))) / 2));
local u = cl((my / 72), 0.25);
local l = cl(((fz / 24) + u), 1);
local rr = cl(((fz / 24) - u), 1);
local side = cl((fx / 24), 1);
(out)[index(((l >= 0) and "H" or "Y"))] = math.abs(l);
(out)[index(((rr >= 0) and "J" or "U"))] = math.abs(rr);
(out)[index(((side >= 0) and "G" or "T"))] = math.abs(side);
(out)[index(((side >= 0) and "K" or "I"))] = math.abs(side);
local scan = cl(((2 * ((1.5 * math.sin((0.4 * t))) - at((s).angles, 42))) - (0.1 * at((s).rates, 42))), 0.65);
(out)[index(((scan >= 0) and "L" or "O"))] = math.abs(scan);
do return gear(out, (((m).p == 2) and 0.7 or 0)) end
end;
do return function(t, s, m, r)
  local out = drive(t, s, m, r);
  local seen = filter((s).nearby, function(c)
    return (function() local value = (function() local value = (function() local value = (function() local value = (c).cargo; if active(value) then return (c).supply else return value end end)(); if active(value) then return (not active((c).delivered)) else return value end end)(); if active(value) then return (not active((c).carriedBy)) else return value end end)(); if active(value) then return (c).visible else return value end end)()
  end);
  if (active(#(seen)) and (t >= (function() local value = (m).reportAt; if active(value) then return value else return 0 end end)())) then
    (m).report = (at(seen, math.fmod((function() local value = (m).reports; if active(value) then return value else return 0 end end)(), #(seen)))).id;
    (m).reports = ((function() local value = (m).reports; if active(value) then return value else return 0 end end)() + 1);
    (m).reportAt = (t + 3.1);
  end
  if active((m).report) then
    (out).radio = {kind = "sight", cargo = (m).report};
  end
  do return out end
end end
end)()
