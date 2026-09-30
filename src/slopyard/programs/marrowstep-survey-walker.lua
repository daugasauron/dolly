return function(t, s, m, r)
  local function cl(v, a)
  do return math.max((-a), math.min(a, v)) end
end
local function phi(b)
do return math.atan((1.5 * math.sin(b)), (0.5 + (1.5 * math.cos(b)))) end
end
if ((m).p == nil) then
  (m).p = 0;
  (m).a = 0;
  (m).t = t;
  (m).hit = 0;
  (m).st = {0, 0, 0, 0};
  (m).x = (s).x;
  (m).z = (s).z;
  (m).d = 1;
  (m).turn = t;
  (m).reach = (0.28 + (0.015 * r()));
end
local H = {5, 9, 13, 17};
local K = {6, 10, 14, 18};
local F = {8, 12, 16, 20};
local hn = {"Q", "O", "E", "F"};
local hp = {"A", "K", "R", "G"};
local kn = {"W", "P", "D", "Y"};
local kp = {"S", "L", "T", "H"};
local out = {};
if s.team~=0 and t>=(m.reportAt or 0) then
  local seen={}
  for _,c in ipairs(s.nearby) do
    if c.carriedBy==0 then
      if c.cargo and c.visible and c.team==0 and not c.delivered then seen[#seen+1]={kind='sight',target=c.id}
      elseif not c.cargo and not c.anchored and c.team~=0 and c.team~=s.team and c.up>.25 then seen[#seen+1]={kind='threat',target=c.id} end
    end
  end
  m.reportAt=t+3.2;m.reports=(m.reports or 0)+1
  m.report=seen[((m.reports-1)%math.max(1,#seen))+1]
end
if m.report then out.radio=m.report end

local p = (m).p;
local u = (t - (m).t);
local d = (m).d;
local lift = true;
local swung = true;
local land = true;
local q = (s).rotation;
local yaw = math.atan((2 * ((at(q, 0) * at(q, 2)) + (at(q, 3) * at(q, 1)))), (1 - (2 * ((at(q, 0) * at(q, 0)) + (at(q, 1) * at(q, 1))))));
local corr = 0;
local wrap = function(v)
  return math.atan(math.sin(v), math.cos(v))
end;
local flat = function(x, z)
  return (function() local value = every({(-3.5), 0, 3.5}, function(dx)
    return every({(-3.5), 0, 3.5}, function(dz)
      return some((s).terrain, function(b)
        return (function() local value = (function() local value = (math.abs(((b).high - (s).ground)) < 0.3); if active(value) then return (math.abs(((x + dx) - (b).x)) <= (b).halfX) else return value end end)(); if active(value) then return (math.abs(((z + dz) - (b).z)) <= (b).halfZ) else return value end end)()
      end)
    end)
  end); if active(value) then return (not active(some((s).obstacles, function(b)
    return (function() local value = (function() local value = (function() local value = ((b).low < ((s).ground + 6)); if active(value) then return ((b).high > ((s).ground + 0.4)) else return value end end)(); if active(value) then return (math.abs((x - (b).x)) < ((b).halfX + 3.5)) else return value end end)(); if active(value) then return (math.abs((z - (b).z)) < ((b).halfZ + 3.5)) else return value end end)()
  end))) else return value end end)()
end;
local blocker = (function() if active((m).goal) then return find((s).nearby, function(c)
  return (function() local value = (function() local value = (function() local value = ((c).low < ((s).y + 3)); if active(value) then return ((c).high > ((s).y - 3)) else return value end end)(); if active(value) then return (hypot(((c).x - (s).x), ((c).z - (s).z)) < ((c).radius + 9)) else return value end end)(); if active(value) then return (((((c).x - (s).x) * (at((m).goal, 0) - (s).x)) + (((c).z - (s).z) * (at((m).goal, 1) - (s).z))) > 0) else return value end end)()
end) else return nil end end)();
if ((((not active((m).goal)) or (hypot(((s).x - at((m).goal, 0)), ((s).z - at((m).goal, 1))) < 3)) or ((t - (function() local value = (m).goalTime; if active(value) then return value else return 0 end end)()) > 75)) or (active(blocker) and ((t - (function() local value = (m).goalTime; if active(value) then return value else return 0 end end)()) > 6))) then
  local options = filter(slice((s).groundSamples, 8), function(p)
    return (function() local value = (function() local value = (function() local value = (math.abs((at(p, 1) - (s).ground)) < 0.3); if active(value) then return flat(at(p, 0), at(p, 2)) else return value end end)(); if active(value) then return (hypot((at(p, 0) - (m).x), (at(p, 2) - (m).z)) < 20) else return value end end)(); if active(value) then return (not active(some((s).nearby, function(c)
      return (function() local value = (function() local value = ((c).low < ((s).y + 3)); if active(value) then return ((c).high > ((s).y - 3)) else return value end end)(); if active(value) then return (hypot((at(p, 0) - (c).x), (at(p, 2) - (c).z)) < ((c).radius + 6)) else return value end end)()
    end))) else return value end end)()
  end);
  if active(blocker) then
    sort(options, function(a, b)
      return (hypot((at(b, 0) - (blocker).x), (at(b, 2) - (blocker).z)) - hypot((at(a, 0) - (blocker).x), (at(a, 2) - (blocker).z)))
    end);
  end
  local next = (function() if active(#(options)) then return at(options, (active(blocker) and 0 or math.floor((r() * #(options))))) else return {(m).x, (s).ground, (m).z} end end)();
  (m).goal = {at(next, 0), at(next, 2)};
  (m).goalTime = t;
  (m).waypoints = ((function() local value = (m).waypoints; if active(value) then return value else return 0 end end)() + 1);
end
local heading = math.atan((at((m).goal, 0) - (s).x), (at((m).goal, 1) - (s).z));
local difference = wrap((heading - yaw));
local backwards = (math.abs(difference) > (math.pi / 2));
heading = wrap((heading + (function() if active(backwards) then return math.pi else return 0 end end)()));
local error = wrap((heading - yaw));
local walk = math.max(0.25, math.cos((1.7 * error)));
corr = cl((((-0.8) * error) + (0.35 * at((s).gyroscope, 1))), 0.16);
(m).reach = (0.28 * walk);
local nd = (active(backwards) and (-1) or 1);
if (nd ~= d) then
  (m).d = (function() d = nd;
  return d end)();
  (m).p = (function() p = 3;
  return p end)();
  (m).t = t;
  u = 0;
  (m).hit = 0;
end
if ((p < 3) and (u > 4)) then
  (m).p = (function() p = 3;
  return p end)();
  (m).t = t;
  (m).hit = 0;
  (m).replants = ((function() local value = (m).replants; if active(value) then return value else return 0 end end)() + 1);
end
local planted = true;
local contacts = 0;
do
  local i = 0;
  while (i < 4) do
    do
      do
        local active_ = ((function() local value = (i == 0); if active(value) then return value else return (i == 3) end end)() == ((m).a == 0));
        local b = at((s).angles, at(K, i));
        local h = at((s).angles, at(H, i));
        local fy = math.min(at(at((s).positions, at(F, i)), 1), at(at((s).positions, (at(F, i) - 1)), 1));
        local contact = (function() local value = (function() local value = at((s).touching, at(F, i)); if active(value) then return value else return at((s).touching, (at(F, i) - 1)) end end)(); if active(value) then return (fy < ((s).ground + 0.88)) else return value end end)();
        local bt = 0;
        local ht = h;
        local hip = 0;
        local side = ((math.fmod(i, 2) == 0) and (-1) or 1);
        local ang = (h + b);
        local c = math.cos(ang);
        local sn = math.sin(ang);
        local ux = ((-at((s).gravity, 0)) / 4);
        local uy = ((-at((s).gravity, 1)) / 4);
        local uz = ((-at((s).gravity, 2)) / 4);
        local clear = ((fy - (s).ground) - (0.5 * ((math.abs(ux) + math.abs(((uy * c) + (uz * sn)))) + math.abs((((-uy) * sn) + (uz * c))))));
        if active(active_) then
          if (((b < 1.3) or active(contact)) or (clear < 0.12)) then
            lift = false;
          end
          if ((d * (h + phi(b))) > ((-(m).reach) + 0.035)) then
            swung = false;
          end
          if ((not active(contact)) or (math.abs(b) > 0.07)) then
            land = false;
          end
          bt = ((p < 2) and 1.38 or 0);
          ht = ((function() if (p == 0) then return at((m).st, i) else return ((-d) * (m).reach) end end)() - phi(b));
        else
          if (active(contact) and ((d * h) < 0.32)) then
            hip = (((d * 0.195) * walk) + (side * corr));
          end
        end
        if (p == 3) then
          bt = 0;
          ht = 0;
          if active(contact) then
            contacts = contacts + 1;
          end
          planted = (function() local value = (function() local value = planted; if active(value) then return (math.abs(b) < 0.07) else return value end end)(); if active(value) then return (math.abs(h) < 0.06) else return value end end)();
        end
        local knee = cl(((3.5 * (bt - b)) - (0.04 * at((s).rates, at(K, i)))), 1);
        if active(active_) then
          local dp = ((2.25 + (0.75 * math.cos(b))) / (2.5 + (1.5 * math.cos(b))));
          hip = cl(((3.5 * (ht - h)) - ((dp * at((s).rates, at(K, i))) / 4)), 1);
        end
        if (p == 3) then
          hip = cl((((-2) * h) - (0.15 * at((s).rates, at(H, i)))), 0.35);
        end
        if (t < 0.5) then
          hip = cl(((-3.5) * h), 1);
          knee = cl(((-3.5) * b), 1);
          (m).t = t;
        end
        if ((s).up < 0.96) then
          hip = (hip * 0.6);
        end
        (out)[index((function() if (hip > 0) then return at(hp, i) else return at(hn, i) end end)())] = math.abs(hip);
        (out)[index((function() if (knee > 0) then return at(kp, i) else return at(kn, i) end end)())] = math.abs(knee);
      end
    end
    ::continue_1::
    i = i + 1;
  end
end
if (p == 3) then
  (m).hit = (((active(planted) and (contacts >= 3)) and ((s).up > 0.98)) and ((m).hit + (s).dt) or 0);
  if ((m).hit > 0.4) then
    (m).p = 0;
    (m).t = t;
    (m).hit = 0;
    (m).a = (1 - (m).a);
    do
      local j = 0;
      while (j < 4) do
        do
          ((m).st)[index(j)] = cl((at((s).angles, at(H, j)) + phi(at((s).angles, at(K, j)))), 0.33);
        end
        ::continue_2::
        j = j + 1;
      end
    end
  end
  do return out end
end
(m).hit = (active(land) and ((m).hit + (s).dt) or 0);
local done = (function() if (p == 0) then return (function() local value = (u > 0.3); if active(value) then return lift else return value end end)() else return (function() if (p == 1) then return (function() local value = (u > 0.18); if active(value) then return swung else return value end end)() else return (function() local value = (u > 0.3); if active(value) then return ((m).hit > 0.05) else return value end end)() end end)() end end)();
if (active(done) and (t > 0.5)) then
  (m).p = math.fmod((p + 1), 3);
  (m).t = t;
  (m).hit = 0;
  if ((m).p == 0) then
    (m).a = (1 - (m).a);
    do
      local j = 0;
      while (j < 4) do
        do
          ((m).st)[index(j)] = cl((at((s).angles, at(H, j)) + phi(at((s).angles, at(K, j)))), 0.33);
        end
        ::continue_3::
        j = j + 1;
      end
    end
  end
end
do return out end
end
