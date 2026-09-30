return function(t, s, m, r)
  local cl = function(v, a)
    return math.max((-a), math.min(a, v))
  end;
  local wrap = function(v)
    return math.atan(math.sin(v), math.cos(v))
  end;
  local out = {};
  local q = (s).rotation;
  local yaw = math.atan((2 * ((at(q, 0) * at(q, 2)) + (at(q, 1) * at(q, 3)))), (1 - (2 * ((at(q, 0) * at(q, 0)) + (at(q, 1) * at(q, 1))))));
  local crane = find((s).nearby, function(p)
    return startsWith((p).name, "Harbor Atlas")
  end);
  if (not active((m).phase)) then
    (m).phase = "search";
    (m).at = t;
    (m).home = {100.6, 10};
    (m).job = 0;
    (m).trips = 0;
    (m).handoffs = 0;
    (m).failed = 0;
    (m).ignore = 0;
  end
  if active(crane) then
    (m).home = {(crane).x, (crane).z};
  end
  local go = function(p)
    (m).phase = p;
    (m).at = t;
    (m).iv = 0;
  end;
  local home = (m).home;
  local attached = (at((s).magnets, 18)).attached;
  local box = find((s).nearby, function(p)
    return ((p).id == (m).job)
  end);
  local goal = {(at(home, 0) + 18), (at(home, 1) + 34)};
  local speed = 0.85;
  local heading = nil;
  (out).F = 1;
  if ((m).phase == "search") then
    local jobs = filter((s).nearby, function(p)
      return (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (p).cargo; if active(value) then return (not active((p).delivered)) else return value end end)(); if active(value) then return (not active((p).carriedBy)) else return value end end)(); if active(value) then return ((p).id ~= (m).ignore) else return value end end)(); if active(value) then return ((p).y < ((s).waterHeight + 1)) else return value end end)(); if active(value) then return (hypot(((p).x - at(home, 0)), ((p).z - at(home, 1))) > 10) else return value end end)(); if active(value) then return ((p).x > 104) else return value end end)(); if active(value) then return ((p).x < 142) else return value end end)(); if active(value) then return ((p).z > 36) else return value end end)(); if active(value) then return ((p).z < 78) else return value end end)()
    end);
    sort(jobs, function(a, b)
      return (hypot(((a).x - (s).x), ((a).z - (s).z)) - hypot(((b).x - (s).x), ((b).z - (s).z)))
    end);
    if active(#(jobs)) then
      box = at(jobs, 0);
      (m).job = (box).id;
      (m).approach = math.atan(((box).x - (s).x), ((box).z - (s).z));
      go("pickup");
    end
    if (((not active((m).roam)) or (t > (m).next)) or (hypot(((s).x - at((m).roam, 0)), ((s).z - at((m).roam, 1))) < 2)) then
      (m).roam = {(110 + (22 * r())), (40 + (25 * r()))};
      (m).next = (t + 40);
    end
    goal = (m).roam;
  end
  if ((m).phase == "pickup") then
    if ((((not active(box)) or active((box).delivered)) or (active((box).carriedBy) and ((box).carriedBy ~= (s).id))) or ((t - (m).at) > 90)) then
      (m).failed = (m).failed + 1;
      go("search");
    else
      goal = {((box).x - (3 * math.sin((m).approach))), ((box).z - (3 * math.cos((m).approach)))};
      speed = 0.6;
      if (hypot((at(goal, 0) - (s).x), (at(goal, 1) - (s).z)) < 0.45) then
        heading = (m).approach;
      end
      (out).F = 0;
      (out).G = ((math.abs(wrap(((m).approach - yaw))) < 0.2) and 1 or 0);
      if (active(attached) and ((box).carriedBy == (s).id)) then
        (m).trips = (m).trips + 1;
        go("gate");
      end
    end
  end
  if ((m).phase == "gate") then
    (out).F = 0;
    (out).G = 1;
    goal = {(at(home, 0) + 5.4), (at(home, 1) + 30)};
    if (not active(attached)) then
      (m).failed = (m).failed + 1;
      go("search");
    else
      if (hypot((at(goal, 0) - (s).x), (at(goal, 1) - (s).z)) < 1) then
        go("approach");
      end
    end
  end
  local dockAngle = 1.2;
  local pole = {(at(home, 0) + (6 * math.cos(dockAngle))), (at(home, 1) + (6 * math.sin(dockAngle)))};
  local dock = {(at(home, 0) + (9 * math.cos(dockAngle))), (at(home, 1) + (9 * math.sin(dockAngle)))};
  local dockHeading = math.atan((-math.cos(dockAngle)), (-math.sin(dockAngle)));
  if ((m).phase == "approach") then
    (out).F = 0;
    (out).G = 1;
    goal = {(at(home, 0) + (15 * math.cos(dockAngle))), (at(home, 1) + (15 * math.sin(dockAngle)))};
    speed = 0.65;
    if (not active(attached)) then
      (m).failed = (m).failed + 1;
      go("search");
    else
      if (hypot((at(goal, 0) - (s).x), (at(goal, 1) - (s).z)) < 0.8) then
        go("dock");
      end
    end
  end
  if ((m).phase == "dock") then
    (out).F = 0;
    (out).G = 1;
    goal = dock;
    speed = 0.55;
    local dx = (at(goal, 0) - (s).x);
    local dz = (at(goal, 1) - (s).z);
    local forward = ((dx * math.sin(dockHeading)) + (dz * math.cos(dockHeading)));
    local side = ((dx * math.cos(dockHeading)) - (dz * math.sin(dockHeading)));
    heading = (dockHeading + cl(((side * 0.25) * ((forward < 0) and (-1) or 1)), 0.35));
    (m).forward = (active(box) and (((at(pole, 0) - (box).x) * math.sin(dockHeading)) + ((at(pole, 1) - (box).z) * math.cos(dockHeading))) or forward);
    if (not active(attached)) then
      (m).failed = (m).failed + 1;
      go("search");
    else
      if ((((active(box) and (math.abs((hypot(((box).x - at(home, 0)), ((box).z - at(home, 1))) - 6)) < 0.3)) and ((box).z > (at(home, 1) + 4.8))) and (hypot((s).vx, (s).vz) < 0.15)) and (math.abs(wrap((dockHeading - yaw))) < 0.1)) then
        go("release");
      end
    end
  end
  if ((m).phase == "release") then
    goal = dock;
    heading = dockHeading;
    speed = 0;
    if ((t - (m).at) > 1) then
      go("retreat");
    end
  end
  if ((m).phase == "retreat") then
    goal = dock;
    heading = dockHeading;
    speed = 0;
    if (active(box) and ((active(crane) and ((box).carriedBy == (crane).id)) or active((box).delivered))) then
      (m).handoffs = (m).handoffs + 1;
      (m).ignore = (m).job;
      go("clear");
    else
      if ((t - (m).at) > 18) then
        (m).failed = (m).failed + 1;
        (m).ignore = (m).job;
        go("clear");
      end
    end
  end
  if ((m).phase == "clear") then
    goal = {(at(home, 0) + 5.4), (at(home, 1) + 30)};
    speed = 0.7;
    if (hypot((at(goal, 0) - (s).x), (at(goal, 1) - (s).z)) < 2) then
      go("search");
    end
  end
  local dx = (at(goal, 0) - (s).x);
  local dz = (at(goal, 1) - (s).z);
  local d = hypot(dx, dz);
  local vx = (dx / math.max(0.01, d));
  local vz = (dz / math.max(0.01, d));
  if ((((m).phase ~= "dock") and ((m).phase ~= "release")) and ((m).phase ~= "retreat")) then
    for _, p in ipairs((s).obstacles) do
      do
        do
          if ((p).low > ((s).y + 1.5)) then
            goto continue_1
          end
          local px = ((s).x - math.max(((p).x - (p).halfX), math.min(((p).x + (p).halfX), (s).x)));
          local pz = ((s).z - math.max(((p).z - (p).halfZ), math.min(((p).z + (p).halfZ), (s).z)));
          local dist = hypot(px, pz);
          if (dist > 6) then
            goto continue_1
          end
          local nx = (px / math.max(0.01, dist));
          local nz = (pz / math.max(0.01, dist));
          local w = ((6 - dist) / 3);
          vx = (vx + (w * (nx + (0.5 * nz))));
          vz = (vz + (w * (nz - (0.5 * nx))));
        end
      end
      ::continue_1::
    end
    for _, p in ipairs((s).nearby) do
      do
        do
          if ((active((p).cargo) or ((p).low > 0)) or ((p).id == optional(crane, "id"))) then
            goto continue_2
          end
          local px = ((s).x - (p).x);
          local pz = ((s).z - (p).z);
          local dist = hypot(px, pz);
          local safe = ((p).radius + 4);
          if (dist > (safe + 4)) then
            goto continue_2
          end
          local nx = (px / math.max(0.01, dist));
          local nz = (pz / math.max(0.01, dist));
          local w = (((safe + 4) - dist) / 4);
          vx = (vx + (w * (nx + (0.6 * nz))));
          vz = (vz + (w * (nz - (0.6 * nx))));
        end
      end
      ::continue_2::
    end
  end
  local error = wrap(((function() local value = heading; if value ~= nil then return value else return math.atan(vx, vz) end end)() - yaw));
  local want = (math.min(speed, (0.55 * d)) * math.max(0, math.cos(error)));
  if ((m).phase == "dock") then
    want = (cl((0.45 * (m).forward), 0.55) * math.max(0, math.cos(error)));
  end
  if (math.abs(error) > 0.65) then
    want = math.min(want, 0.06);
  end
  if ((m).phase == "retreat") then
    want = (-0.45);
  end
  if (t < 2) then
    want = 0;
  end
  (m).iv = cl(((function() local value = (m).iv; if active(value) then return value else return 0 end end)() + ((want - at((s).localVelocity, 2)) * (s).dt)), 1.2);
  local base = cl((((0.17 * want) + (0.32 * (want - at((s).localVelocity, 2)))) + (0.045 * (m).iv)), 0.45);
  local turn = ((t < 2) and 0 or cl(((0.65 * error) - (0.95 * at((s).gyroscope, 1))), 0.32));
  local left = cl((base + turn), 0.65);
  local right = cl((base - turn), 0.65);
  (out)[index(((left >= 0) and "R" or "E"))] = math.abs(left);
  (out)[index(((right >= 0) and "T" or "D"))] = math.abs(right);
  (m).goal = goal;
  (m).error = error;
  (m).distance = d;
  (m).cargo = (active(box) and {(box).x, (box).y, (box).z, (box).carriedBy} or nil);
  do return out end
end
