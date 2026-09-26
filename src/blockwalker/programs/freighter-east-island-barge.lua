return function(t, s, m, r)
  local cl = function(v, a)
    return math.max((-a), math.min(a, v))
  end;
  local wrap = function(v)
    return math.atan(math.sin(v), math.cos(v))
  end;
  local q = (s).rotation;
  local yaw = math.atan((2 * ((at(q, 0) * at(q, 2)) + (at(q, 1) * at(q, 3)))), (1 - (2 * ((at(q, 0) * at(q, 0)) + (at(q, 1) * at(q, 1))))));
  local o = {};
  local east = ((s).team == 1);
  local berth = {(-48), 116.75};
  local waiting = (active(east) and {(-32), 130} or {(-64), 130});
  local dock = (active(east) and {139.2, 24} or {(-132.8), (-49)});
  local exit = (active(east) and {130, 24} or {(-124), (-49)});
  local outbound = (active(east) and {{(-48), 130}, {116, 130}, {130, 110}, {130, 24}, dock} or {{(-48), 130}, {(-116), 130}, {(-130), 110}, {(-130), (-49)}, dock});
  local inbound = (active(east) and {{130, 110}, {116, 140}, {(-32), 140}, waiting} or {{(-124), 110}, {(-116), 140}, {(-64), 140}, waiting});
  if (not active((m).phase)) then
    (m).phase = (active(east) and "dock" or "wait");
    (m).route = 0;
    (m).job = 0;
    (m).deliveries = 0;
    (m).at = t;
  end
  local go = function(p)
    (m).phase = p;
    (m).at = t;
    (m).route = 0;
  end;
  local cargo = find((s).nearby, function(c)
    return ((c).id == (m).job)
  end);
  local load = find((s).nearby, function(c)
    return (function() local value = (function() local value = (c).cargo; if active(value) then return (not active((c).delivered)) else return value end end)(); if active(value) then return ((c).carriedBy == (s).id) else return value end end)()
  end);
  local radius = math.max(table.unpack(map((s).positions, function(p)
    return (hypot((at(p, 0) - (s).x), (at(p, 2) - (s).z)) + 0.7)
  end)));
  local walls = filter((s).terrain, function(p)
    return (function() local value = ((p).high > ((s).y - 1)); if active(value) then return ((p).low < ((s).y + 3)) else return value end end)()
  end);
  local clear = function(target)
    return (not active(some(walls, function(p)
      local low = 0;
      local high = 1;
      local delta = {(at(target, 0) - (s).x), (at(target, 1) - (s).z)};
      local start = {(s).x, (s).z};
      local min = {(((p).x - (p).halfX) - radius), (((p).z - (p).halfZ) - radius)};
      local max = {(((p).x + (p).halfX) + radius), (((p).z + (p).halfZ) + radius)};
      do
        local axis = 0;
        while (axis < 2) do
          do
            do
              if (math.abs(at(delta, axis)) < 0.000001) then
                if ((at(start, axis) < at(min, axis)) or (at(start, axis) > at(max, axis))) then
                  do return false end
                end
              else
                local a = ((at(min, axis) - at(start, axis)) / at(delta, axis));
                local b = ((at(max, axis) - at(start, axis)) / at(delta, axis));
                low = math.max(low, math.min(a, b));
                high = math.min(high, math.max(a, b));
                if (low > high) then
                  do return false end
                end
              end
            end
          end
          ::continue_1::
          axis = axis + 1;
        end
      end
      do return (low <= high) end
    end)))
  end;
  local advance = function(route)
    local best = hypot((at(at(route, (m).route), 0) - (s).x), (at(at(route, (m).route), 1) - (s).z));
    do
      local i = ((m).route + 1);
      while (i < (#(route) - 1)) do
        do
          do
            local d = hypot((at(at(route, i), 0) - (s).x), (at(at(route, i), 1) - (s).z));
            if ((d < best) and active(clear(at(route, i)))) then
              (m).route = i;
              best = d;
            end
          end
        end
        ::continue_2::
        i = i + 1;
      end
    end
  end;
  local goal = waiting;
  local holding = true;
  local heading = 0;
  if ((m).phase == "wait") then
    local busy = some((s).nearby, function(c)
      return (function() local value = (function() local value = ((c).id ~= (s).id); if active(value) then return startsWith((c).name, "Freighter") else return value end end)(); if active(value) then return (function() local value = (hypot(((c).x - at(berth, 0)), ((c).z - at(berth, 1))) < 18); if active(value) then return value else return (function() local value = ((c).id < (s).id); if active(value) then return (hypot(((c).x - at(berth, 0)), ((c).z - at(berth, 1))) < 26) else return value end end)() end end)() else return value end end)()
    end);
    if ((not active(busy)) and (hypot(((s).x - at(waiting, 0)), ((s).z - at(waiting, 1))) < 1)) then
      go("approach");
    end
  end
  if ((m).phase == "approach") then
    goal = {(-48), 130};
    if ((hypot(((s).x - at(goal, 0)), ((s).z - at(goal, 1))) < 0.35) and (hypot((s).vx, (s).vz) < 0.15)) then
      go("dock");
    end
  end
  if (((m).phase == "dock") or ((m).phase == "load")) then
    goal = berth;
    if (((m).phase == "dock") and (hypot(((s).x - at(goal, 0)), ((s).z - at(goal, 1))) < 0.3)) then
      go("load");
    end
    if active(load) then
      if ((m).job ~= (load).id) then
        (m).job = (load).id;
        (m).loaded = t;
      end
      if ((t - (m).loaded) > 8) then
        go("sail");
      end
    end
  end
  if ((m).phase == "sail") then
    advance(outbound);
    goal = at(outbound, (m).route);
    holding = ((m).route == (#(outbound) - 1));
    if ((not active(holding)) and (hypot(((s).x - at(goal, 0)), ((s).z - at(goal, 1))) < 1.3)) then
      (m).route = (m).route + 1;
    end
    if ((active(holding) and (hypot(((s).x - at(goal, 0)), ((s).z - at(goal, 1))) < 0.3)) and (hypot((s).vx, (s).vz) < 0.15)) then
      go("unload");
    end
  end
  if ((m).phase == "unload") then
    goal = dock;
    if active(optional(cargo, "delivered")) then
      (m).deliveries = (m).deliveries + 1;
      (m).job = 0;
      go("exit");
    end
  end
  if ((m).phase == "exit") then
    goal = exit;
    if ((hypot(((s).x - at(goal, 0)), ((s).z - at(goal, 1))) < 0.3) and (hypot((s).vx, (s).vz) < 0.15)) then
      go("return");
    end
  end
  if ((m).phase == "return") then
    advance(inbound);
    goal = at(inbound, (m).route);
    holding = ((m).route == (#(inbound) - 1));
    if ((not active(holding)) and (hypot(((s).x - at(goal, 0)), ((s).z - at(goal, 1))) < 1.3)) then
      (m).route = (m).route + 1;
    end
    if ((active(holding) and (hypot(((s).x - at(goal, 0)), ((s).z - at(goal, 1))) < 0.3)) and (hypot((s).vx, (s).vz) < 0.15)) then
      go("wait");
    end
  end
  local dx = (at(goal, 0) - (s).x);
  local dz = (at(goal, 1) - (s).z);
  local d = hypot(dx, dz);
  local forward = 0;
  local side = 0;
  (m).blocked = ((((not active(holding)) and (d > 3)) and (hypot((s).vx, (s).vz) < 0.12)) and ((function() local value = (m).blocked; if active(value) then return value else return 0 end end)() + (s).dt) or 0);
  if (active((m).escape) and ((t > ((m).escape)["until"]) or (hypot(((s).x - ((m).escape).x), ((s).z - ((m).escape).z)) < 0.8))) then
    (m).escape = nil;
  end
  if (((m).blocked > 4) and (not active((m).escape))) then
    local peers = filter((s).nearby, function(c)
      return (function() local value = (function() local value = (not active((c).cargo)); if active(value) then return ((c).high > ((s).y - 1)) else return value end end)(); if active(value) then return ((c).low < ((s).y + 3)) else return value end end)()
    end);
    local depths = function(x, z)
      return concat(map(walls, function(p)
        return math.max(0, (radius - hypot(math.max(0, (math.abs((x - (p).x)) - (p).halfX)), math.max(0, (math.abs((z - (p).z)) - (p).halfZ)))))
      end), map(peers, function(c)
        return math.max(0, ((radius + (c).radius) - hypot(((c).x - x), ((c).z - z))))
      end))
    end;
    local start = depths((s).x, (s).z);
    local best = ((4 * reduce(start, function(a, b)
      return (a + b)
    end, 0)) + d);
    local target = nil;
    local scan = (function() local value = (m).escapeScan; if active(value) then return value else return 0 end end)();
    local length = at({4, 8, 12}, math.floor((scan / 16)));
    local angle = ((math.fmod(scan, 16) * math.pi) / 8);
    (m).escapeScan = math.fmod((scan + 1), 48);
    local x = ((s).x + (length * math.sin(angle)));
    local z = ((s).z + (length * math.cos(angle)));
    local safe = true;
    do
      local step = 1;
      while ((step <= 8) and active(safe)) do
        do
          do
            local overlap = depths(((s).x + (((x - (s).x) * step) / 8)), ((s).z + (((z - (s).z) * step) / 8)));
            safe = every(overlap, function(v, j)
              return (v <= (at(start, j) + 0.05))
            end);
          end
        end
        ::continue_3::
        step = step + 1;
      end
    end
    if active(safe) then
      local cost = (((4 * reduce(depths(x, z), function(a, b)
        return (a + b)
      end, 0)) + hypot((at(goal, 0) - x), (at(goal, 1) - z))) + (0.1 * length));
      if (cost < (best - 0.1)) then
        target = {x = x, z = z, yaw = yaw, ["until"] = (t + 30)};
      end
    end
    if active(target) then
      (m).escape = target;
      (m).blocked = 0;
      (m).backUntil = 0;
      (m).escapeScan = 0;
      (m).recoveries = ((function() local value = (m).recoveries; if active(value) then return value else return 0 end end)() + 1);
    end
  else
    (m).escapeScan = 0;
  end
  if active(holding) then
    local x = ((math.cos(yaw) * dx) - (math.sin(yaw) * dz));
    local z = ((math.sin(yaw) * dx) + (math.cos(yaw) * dz));
    local aligned = (math.abs(yaw) < 0.15);
    forward = cl(((active(aligned) and (0.28 * z) or 0) - (0.8 * at((s).localVelocity, 2))), 0.55);
    side = cl(((active(aligned) and (0.35 * x) or 0) - (0.8 * at((s).localVelocity, 0))), 0.8);
  else
    local vx = (dx / math.max(0.01, d));
    local vz = (dz / math.max(0.01, d));
    for _, p in ipairs(walls) do
      do
        do
          local px = ((s).x - math.max(((p).x - (p).halfX), math.min(((p).x + (p).halfX), (s).x)));
          local pz = ((s).z - math.max(((p).z - (p).halfZ), math.min(((p).z + (p).halfZ), (s).z)));
          local distance = hypot(px, pz);
          if (distance > (radius + 3)) then
            goto continue_4
          end
          local weight = (((radius + 3) - distance) / 3);
          vx = (vx + ((weight * px) / math.max(0.01, distance)));
          vz = (vz + ((weight * pz) / math.max(0.01, distance)));
        end
      end
      ::continue_4::
    end
    heading = math.atan(vx, vz);
    local err = wrap((heading - yaw));
    local want = ((math.abs(err) > 0.55) and 0 or (math.min(1.2, (d * 0.6)) * math.max(0, math.cos(err))));
    forward = cl(((0.42 * want) + (0.5 * (want - at((s).localVelocity, 2)))), 0.85);
  end
  if active((m).escape) then
    local ex = (((m).escape).x - (s).x);
    local ez = (((m).escape).z - (s).z);
    local x = ((math.cos(yaw) * ex) - (math.sin(yaw) * ez));
    local z = ((math.sin(yaw) * ex) + (math.cos(yaw) * ez));
    heading = ((m).escape).yaw;
    forward = cl(((0.28 * z) - (0.8 * at((s).localVelocity, 2))), 0.55);
    side = cl(((0.35 * x) - (0.8 * at((s).localVelocity, 0))), 0.6);
  end
  local turn = cl(((0.5 * wrap((heading - yaw))) - (1.4 * at((s).gyroscope, 1))), (active(load) and 0.14 or 0.35));
  local set = function(n, p, v)
    return (function() (o)[index((function() if (v < 0) then return n else return p end end)())] = math.abs(v);
    return at(o, (function() if (v < 0) then return n else return p end end)()) end)()
  end;
  set("Q", "A", cl((forward + turn), 1));
  set("W", "S", cl((forward - turn), 1));
  set("E", "D", side);
  set("R", "F", side);
  (o)[index(((active((m).job) and active(includes({"load", "sail"}, (m).phase))) and "X" or "Z"))] = 1;
  if active((m).job) then
    (o).radio = {kind = (((m).phase == "unload") and "ready" or "claim"), cargo = (m).job};
  end
  do return o end
end
