return function(t, s, m, r)
  local function cl(v, a)
  do return math.max((-a), math.min(a, v)) end
end
local dt = (s).dt;
local g = (s).gravity;
local q = (s).rotation;
local w = (s).gyroscope;
local pitch = math.atan(at(g, 2), (-at(g, 1)));
if ((m).z == nil) then
  (m).z = (s).z;
  (m).x = (s).x;
  (m).v = 0;
  (m).w = 0;
  (m).u = 0;
  (m).i = 0;
  (m).lean = 0;
  (m).a = (3 + (0.2 * r()));
end
(m).v = ((m).v + ((dt / (0.1 + dt)) * ((at((s).localVelocity, 2) - at(w, 0)) - (m).v)));
(m).w = ((m).w + ((dt / (0.05 + dt)) * (at(w, 0) - (m).w)));
local nav = (function(t, s, m, r, flying)
  local clamp = function(v, lo, hi)
    return math.max(lo, math.min(hi, v))
  end;
  local n = (function() local value = (m).nav; if value ~= nil then return value else return (function() (m).nav = {goal = nil, next = 0, visits = 0, choices = 0, meetings = 0, yieldTime = 0, path = 0, previous = {(s).x, (s).z}, goals = {}};
  return (m).nav end)() end end)();
  (n).path = ((n).path + hypot(((s).x - at((n).previous, 0)), ((s).z - at((n).previous, 1))));
  (n).previous = {(s).x, (s).z};
  local peers = filter((function() local value = (s).nearby; if active(value) then return value else return {} end end)(), function(p)
    return (function() local value = (function() local value = (not active((p).cargo)); if active(value) then return ((p).high > ((s).y - 3)) else return value end end)(); if active(value) then return ((p).low < ((s).y + 4)) else return value end end)()
  end);
  local own = (active(flying) and 4 or 3);
  local reached = (function() local value = (n).goal; if active(value) then return (hypot(((s).x - at((n).goal, 0)), ((s).z - at((n).goal, 1))) < 1.7) else return value end end)();
  if (((not active((n).goal)) or active(reached)) or (t > (n).next)) then
    if active(reached) then
      (n).visits = (n).visits + 1;
      local friend = find(peers, function(p)
        return ((p).id == (n).visiting)
      end);
      if (active(friend) and (hypot(((s).x - (friend).x), ((s).z - (friend).z)) < (((friend).radius + own) + 8))) then
        (n).meetings = (n).meetings + 1;
      end
    end
    local friends = filter(peers, function(p)
      return (function() local value = (not active((p).anchored)); if active(value) then return (hypot(((p).x - (s).x), ((p).z - (s).z)) > ((own + (p).radius) + 3)) else return value end end)()
    end);
    local candidate = nil;
    do
      local i = 0;
      while (i < 20) do
        do
          do
            local friend = (function() if (active(#(friends)) and (r() < 0.35)) then return at(friends, math.floor((r() * #(friends)))) else return nil end end)();
            local angle = ((r() * math.pi) * 2);
            local d = (active(friend) and (((friend).radius + own) + 4) or (10 + (20 * r())));
            candidate = {((function() if active(friend) then return (friend).x else return (s).x end end)() + (math.sin(angle) * d)), ((function() if active(friend) then return (friend).z else return (s).z end end)() + (math.cos(angle) * d))};
            candidate = map(candidate, function(v)
              return clamp(v, (-82), 82)
            end);
            if ((hypot((at(candidate, 0) - (s).x), (at(candidate, 1) - (s).z)) < 6) or active(some(peers, function(p)
              return (hypot(((p).x - at(candidate, 0)), ((p).z - at(candidate, 1))) < (((p).radius + own) + 2))
            end))) then
              goto continue_1
            end
            (n).visiting = (function() local value = optional(friend, "id"); if active(value) then return value else return 0 end end)();
            break
          end
        end
        ::continue_1::
        i = i + 1;
      end
    end
    (n).goal = candidate;
    (n).next = ((t + 35) + (25 * r()));
    (n).choices = (n).choices + 1;
    append((n).goals, concat({t}, candidate, {(n).visiting}));
    if (#((n).goals) > 12) then
      shift((n).goals);
    end
  end
  local dx = (at((n).goal, 0) - (s).x);
  local dz = (at((n).goal, 1) - (s).z);
  local d = hypot(dx, dz);
  local vx = (dx / math.max(0.01, d));
  local vz = (dz / math.max(0.01, d));
  local speed = math.min((active(flying) and 1.4 or 0.55), (d * 0.4));
  local yielding = false;
  for _, p in ipairs(peers) do
    do
      do
        local px = ((((s).x + (0.8 * (s).vx)) - (p).x) - (0.8 * (p).vx));
        local pz = ((((s).z + (0.8 * (s).vz)) - (p).z) - (0.8 * (p).vz));
        local dist = hypot(px, pz);
        local safe = ((own + (p).radius) + 2);
        if (dist >= (safe + 5)) then
          goto continue_2
        end
        local nx = (px / math.max(0.01, dist));
        local nz = (pz / math.max(0.01, dist));
        local weight = clamp((((safe + 5) - dist) / 5), 0, 2);
        vx = (vx + (weight * (nx + (0.6 * nz))));
        vz = (vz + (weight * (nz - (0.6 * nx))));
        if (((dist < safe) and ((((-nx) * dx) - (nz * dz)) > 0)) and (active((p).anchored) or ((s).id > (p).id))) then
          speed = (speed * clamp((((dist - safe) + 2) / 2), 0, 0.5));
          yielding = true;
        end
      end
    end
    ::continue_2::
  end
  if (not active(flying)) then
    for _, point in ipairs(slice((function() local value = (s).groundSamples; if active(value) then return value else return {} end end)(), 0, 8)) do
      do
        if (math.abs((at(point, 1) - (s).ground)) > 0.5) then
          local nx = (((s).x - at(point, 0)) / 6);
          local nz = (((s).z - at(point, 2)) / 6);
          if (((vx * nx) + (vz * nz)) < (-0.25)) then
            vx = (vx + (2 * nx));
            vz = (vz + (2 * nz));
            speed = (speed * 0.25);
            yielding = true;
          end
        end
      end
      ::continue_3::
    end
  end
  if active(yielding) then
    (n).yieldTime = ((n).yieldTime + (s).dt);
  end
  local norm = hypot(vx, vz);
  do return {x = ((vx / math.max(0.01, norm)) * speed), z = ((vz / math.max(0.01, norm)) * speed), heading = math.atan(vx, vz), speed = speed} end
end)(t, s, m, r, false);
local yawNow = math.atan((2 * ((at(q, 0) * at(q, 2)) + (at(q, 1) * at(q, 3)))), (1 - (2 * ((at(q, 0) * at(q, 0)) + (at(q, 1) * at(q, 1))))));
local error = math.atan(math.sin(((nav).heading - yawNow)), math.cos(((nav).heading - yawNow)));
local want = ((t < 2) and 0 or ((nav).speed * math.max(0, math.cos(error))));
(m).i = cl(((m).i + ((want - (m).v) * dt)), 2);
local ask = cl(((0.12 * (want - (m).v)) + (0.025 * (m).i)), 0.15);
(m).lean = ((m).lean + cl((ask - (m).lean), (0.1 * dt)));
local target = cl((((((m).v / 0.7) + (14 * (pitch - (m).lean))) + (4.5 * (m).w)) / 6), 0.94);
(m).u = ((m).u + ((dt / (0.05 + dt)) * (target - (m).u)));
local yaw = math.atan((2 * ((at(q, 0) * at(q, 2)) + (at(q, 1) * at(q, 3)))), (1 - (2 * ((at(q, 0) * at(q, 0)) + (at(q, 1) * at(q, 1))))));
local heading = (nav).heading;
local turn = cl(((1.4 * math.atan(math.sin((heading - yaw)), math.cos((heading - yaw)))) - (0.4 * at(w, 1))), math.min(0.12, (1 - math.abs((m).u))));
local l = cl(((m).u + turn), 1);
local rr = cl(((m).u - turn), 1);
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

(out)[index(((l >= 0) and "A" or "Q"))] = math.abs(l);
(out)[index(((rr >= 0) and "S" or "W"))] = math.abs(rr);
local h = ((t < 3) and 0 or (0.8 * (1 - math.cos(((t - 3) * 0.26)))));
local p = cl(((2 * (h - at((s).angles, 13))) - (0.2 * at((s).rates, 13))), 0.6);
if (math.abs(pitch) > 0.3) then
  p = (-0.5);
end
(out)[index(((p >= 0) and "D" or "E"))] = math.abs(p);
do return out end
end
