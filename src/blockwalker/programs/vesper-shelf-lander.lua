return function(t, s, m, r)
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
  (m).offset = (at(C, 1) - (s).y);
  (m).tx = (s).x;
  (m).tz = (s).z;
  (m).h = ((m).g + 3.4);
  (m).ts = t;
  (m).pause = (0.75 + (0.2 * r()));
  (m).prev = slice(C);
  (m).v = {0, 0, 0};
  (m).gy = {0, 0, 0};
  (m).pi = 0;
  (m).ri = 0;
  (m).hi = 0;
  (m).hit = 0;
  (m).cycles = 0;
end
do
  local k = 0;
  while (k < 3) do
    do
      do
        ((m).v)[index(k)] = (at((m).v, k) + ((dt / (0.12 + dt)) * (((at(C, k) - at((m).prev, k)) / dt) - at((m).v, k))));
        ((m).prev)[index(k)] = at(C, k);
        ((m).gy)[index(k)] = (at((m).gy, k) + ((dt / (0.06 + dt)) * (at((s).gyroscope, k) - at((m).gy, k))));
      end
    end
    ::continue_1::
    k = k + 1;
  end
end
local feet = {32, 36, 40, 44};
local contacts = 0;
local minfoot = 1000000000;
do
  local i = 0;
  while (i < 4) do
    do
      do
        local j = at(feet, i);
        minfoot = math.min(minfoot, ((at(at((s).positions, j), 1) - 0.485) - (s).ground));
        if (active(at((s).touching, j)) and (at(at((s).positions, j), 1) < ((s).ground + 0.65))) then
          contacts = contacts + 1;
        end
      end
    end
    ::continue_2::
    i = i + 1;
  end
end
local sp = hypot(at((m).v, 0), at((m).v, 2));
local home = hypot(((s).x - (m).x), ((s).z - (m).z));
local function next(p)
(m).p = p;
(m).ts = t;
(m).hit = 0;
end
if ((m).p == 0) then
  (m).pi = 0;
  (m).ri = 0;
  (m).hi = 0;
  (m).tx = (m).x;
  (m).tz = (m).z;
  if ((contacts >= 3) and ((t - (m).ts) > (m).pause)) then
    (m).dx = (((r() < 0.5) and (-1) or 1) * (1 + (0.3 * r())));
    (m).dz = (5 + (0.4 * r()));
    (m).hoverPause = (0.45 + (0.2 * r()));
    (m).h = ((m).g + 5.6);
    (m).launch = t;
    next(1);
  else
    do return {} end
  end
end
if ((((m).p == 1) and ((s).y > ((m).g + 5.1))) and (minfoot > 1.4)) then
  (m).tx = ((m).x + (m).dx);
  (m).tz = ((m).z + (m).dz);
  next(2);
end
if ((((m).p == 2) and (hypot(((s).x - (m).tx), ((s).z - (m).tz)) < 0.23)) and (sp < 0.28)) then
  next(3);
end
if (((m).p == 3) and ((t - (m).ts) > (m).hoverPause)) then
  (m).tx = (m).x;
  (m).tz = (m).z;
  next(4);
end
if ((((m).p == 4) and (home < 1.2)) and (sp < 0.9)) then
  (m).h = (s).y;
  next(5);
end
if ((m).p == 5) then
  if ((home > 1.6) or ((s).up < 0.96)) then
    (m).h = ((m).g + 5.6);
    next(4);
  else
    (m).h = math.max(((m).g + 3.17), ((m).h - (0.85 * dt)));
    (m).hit = (((((contacts >= 3) and (home < 0.2)) and (sp < 0.15)) and (math.abs(at((m).v, 1)) < 0.2)) and ((m).hit + dt) or 0);
    if ((m).hit > 0.3) then
      (m).cycles = (m).cycles + 1;
      (m).pause = (2.5 + (0.9 * r()));
      next(0);
      do return {} end
    end
  end
end
if (((((math.abs(((s).x - (m).x)) > 2.5) or (((s).z - (m).z) > 6.5)) or (((s).z - (m).z) < (-1.5))) or ((((m).p == 2) or ((m).p == 3)) and ((t - (m).launch) > 22))) and ((m).p ~= 0)) then
  (m).tx = (m).x;
  (m).tz = (m).z;
  (m).h = ((m).g + 5.6);
  next(4);
end
local wx = (0.95 * ((m).tx - (s).x));
local wz = (0.95 * ((m).tz - (s).z));
local scale = math.min(1, (1.4 / math.max(0.001, hypot(wx, wz))));
wx = (wx * scale);
wz = (wz * scale);
local ax = cl((1.7 * (wx - at((m).v, 0))), 0.85);
local az = cl((1.7 * (wz - at((m).v, 2))), 0.8);
local acc = local_({ax, 0, az});
local com = local_({(at(C, 0) - (s).x), (at(C, 1) - (s).y), (at(C, 2) - (s).z)});
local g = (s).gravity;
local G = hypot(at(g, 0), at(g, 1), at(g, 2));
local ep = (-math.atan(at(g, 2), (-at(g, 1))));
local er = (-math.atan((-at(g, 0)), (-at(g, 1))));
(m).pi = cl(((m).pi + (ep * dt)), 0.3);
(m).ri = cl(((m).ri + (er * dt)), 0.3);
local eh = (((m).h + (m).offset) - at(C, 1));
(m).hi = cl(((m).hi + (eh * dt)), 0.8);
local ay = cl((((2 * eh) - (2.7 * at((m).v, 1))) + (0.18 * (m).hi)), 1.6);
local total = (((s).mass * (G + ay)) / math.max(0.7, (s).up));
local base = (total / 4);
local fx = cl(((s).mass * at(acc, 0)), 20);
local fz = cl(((s).mass * at(acc, 2)), 16);
local p52 = at_(52);
local p53 = at_(53);
local p62 = at_(62);
local p63 = at_(63);
local hyz = ((at(p52, 1) + at(p53, 1)) / 2);
local hyx = ((at(p62, 1) + at(p63, 1)) / 2);
local mx = (((((310 * ep) - (245 * at((m).gy, 0))) + (5 * (m).pi)) - (total * at(com, 2))) - (hyz * fz));
local mz = (((((430 * er) - (365 * at((m).gy, 2))) + (5 * (m).ri)) + (total * at(com, 0))) + (hyx * fx));
local function jet(f)
do return math.max(0, math.min(1, (f / 45))) end
end
local out = {A = jet(((base - (mx / 8)) - (mz / 16))), S = jet(((base - (mx / 8)) + (mz / 16))), D = jet(((base + (mx / 8)) - (mz / 16))), F = jet(((base + (mx / 8)) + (mz / 16)))};
local yaw = math.atan((2 * ((x * z) + (y * w))), (1 - (2 * ((x * x) + (y * y)))));
local my = (((((-110) * yaw) - (145 * at((m).gy, 1))) - ((fx * (at(p62, 2) + at(p63, 2))) / 2)) + ((fz * (at(p52, 0) + at(p53, 0))) / 2));
local u = cl((my / 80), 0.22);
local l = cl(((fz / 20) + u), 1);
local rr = cl(((fz / 20) - u), 1);
local side = cl((fx / 24), 1);
(out)[index(((l >= 0) and "H" or "Y"))] = math.abs(l);
(out)[index(((rr >= 0) and "J" or "U"))] = math.abs(rr);
(out)[index(((side >= 0) and "G" or "T"))] = math.abs(side);
(out)[index(((side >= 0) and "K" or "I"))] = math.abs(side);
do return out end
end
