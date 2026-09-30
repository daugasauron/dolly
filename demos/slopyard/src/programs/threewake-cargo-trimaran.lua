return function(t, s, m, r)
  local cl = function(v, a)
    return math.max((-a), math.min(a, v))
  end;
  local wrap = function(a)
    return math.atan(math.sin(a), math.cos(a))
  end;
  local n = (function() local value = (m).roam; if value ~= nil then return value else return (function() (m).roam = {goal = nil, next = 0, visits = 0, choices = 0, path = 0, previous = {(s).x, (s).z}, yieldTime = 0, goals = {}, blocked = 0};
  return (m).roam end)() end end)();
  local peers = filter((function() local value = (s).nearby; if active(value) then return value else return {} end end)(), function(p)
    return (function() local value = (not active((p).cargo)); if active(value) then return ((p).low < 2) else return value end end)()
  end);
  local ground = (function() local value = (s).groundSamples; if active(value) then return value else return {} end end)();
  local own = 6.2;
  (n).path = ((n).path + hypot(((s).x - at((n).previous, 0)), ((s).z - at((n).previous, 1))));
  (n).previous = {(s).x, (s).z};
  local reached = (function() local value = (n).goal; if active(value) then return (hypot(((s).x - at((n).goal, 0)), ((s).z - at((n).goal, 1))) < 2) else return value end end)();
  if ((((not active((n).goal)) or active(reached)) or (t > (n).next)) or ((n).blocked > 10)) then
    if active(reached) then
      (n).visits = (n).visits + 1;
    end
    local choices = filter(slice(ground, 8), function(p, i)
      return (function() local value = (function() local value = (function() local value = (function() local value = (at(p, 1) < (-2.5)); if active(value) then return (at(at(ground, i), 1) < (-2.5)) else return value end end)(); if active(value) then return (math.abs(at(p, 0)) < 230) else return value end end)(); if active(value) then return (math.abs(at(p, 2)) < 230) else return value end end)(); if active(value) then return (not active(some(peers, function(q)
        return (hypot(((q).x - at(p, 0)), ((q).z - at(p, 2))) < (((q).radius + own) + 2))
      end))) else return value end end)()
    end);
    if active(#(choices)) then
      local p = at(choices, math.floor((r() * #(choices))));
      local angle = (math.atan((at(p, 0) - (s).x), (at(p, 2) - (s).z)) + ((r() - 0.5) * 0.18));
      (n).goal = {((s).x + (math.sin(angle) * 16)), ((s).z + (math.cos(angle) * 16))};
    else
      (n).goal = {(s).x, (s).z};
    end
    (n).next = ((t + 35) + (15 * r()));
    (n).choices = (n).choices + 1;
    (n).blocked = 0;
    append((n).goals, concat({t}, (n).goal));
    if (#((n).goals) > 12) then
      shift((n).goals);
    end
  end
  local dx = (at((n).goal, 0) - (s).x);
  local dz = (at((n).goal, 1) - (s).z);
  local d = hypot(dx, dz);
  local vx = (dx / math.max(0.01, d));
  local vz = (dz / math.max(0.01, d));
  local speed = math.min(1.2, (0.55 * d));
  local yielding = false;
  do
    local i = 0;
    while (i < #(ground)) do
      do
        if (at(at(ground, i), 1) >= (-2.5)) then
          local p = at(ground, i);
          local distance = ((i < 8) and 6 or 16);
          local nx = (((s).x - at(p, 0)) / distance);
          local nz = (((s).z - at(p, 2)) / distance);
          if (((vx * nx) + (vz * nz)) < (-0.2)) then
            vx = (vx + (((i < 8) and 3 or 1.1) * nx));
            vz = (vz + (((i < 8) and 3 or 1.1) * nz));
            speed = (speed * ((i < 8) and 0.25 or 0.7));
            yielding = true;
          end
        end
      end
      ::continue_1::
      i = i + 1;
    end
  end
  for _, p in ipairs(peers) do
    do
      do
        local px = ((((s).x + (0.8 * (s).vx)) - (p).x) - (0.8 * (p).vx));
        local pz = ((((s).z + (0.8 * (s).vz)) - (p).z) - (0.8 * (p).vz));
        local dist = hypot(px, pz);
        local safe = ((own + (p).radius) + 2);
        if (dist > (safe + 5)) then
          goto continue_2
        end
        local nx = (px / math.max(0.01, dist));
        local nz = (pz / math.max(0.01, dist));
        local weight = math.max(0, math.min(2, (((safe + 5) - dist) / 5)));
        vx = (vx + (weight * (nx + (0.6 * nz))));
        vz = (vz + (weight * (nz - (0.6 * nx))));
        if (((dist < safe) and ((((-nx) * dx) - (nz * dz)) > 0)) and (active((p).anchored) or ((s).id > (p).id))) then
          speed = (speed * math.max(0, math.min(0.5, (((dist - safe) + 2) / 2))));
          yielding = true;
        end
      end
    end
    ::continue_2::
  end
  if active(yielding) then
    (n).yieldTime = ((n).yieldTime + (s).dt);
  end
  local q = (s).rotation;
  local yaw = math.atan((2 * ((at(q, 0) * at(q, 2)) + (at(q, 3) * at(q, 1)))), (1 - (2 * ((at(q, 0) * at(q, 0)) + (at(q, 1) * at(q, 1))))));
  local err = wrap((math.atan(vx, vz) - yaw));
  local vel = at((s).localVelocity, 2);
  local rate = at((s).gyroscope, 1);
  local want = ((t < 2) and 0 or (speed * math.max(0, math.cos(err))));
  if (math.abs(err) > 0.65) then
    want = math.min(want, 0.06);
  end
  (n).blocked = (((want > 0.2) and (math.abs(vel) < 0.1)) and ((n).blocked + (s).dt) or 0);
  (m).iv = cl(((function() local value = (m).iv; if active(value) then return value else return 0 end end)() + ((want - vel) * (s).dt)), 1.2);
  local base = cl((((0.17 * want) + (0.32 * (want - vel))) + (0.045 * (m).iv)), 0.42);
  local turn = ((t < 2) and 0 or cl(((0.65 * err) - (0.95 * rate)), 0.32));
  local out = {};
  local left = cl((base + turn), 0.65);
  local right = cl((base - turn), 0.65);
  (out)[index(((left >= 0) and "A" or "Q"))] = math.abs(left);
  (out)[index(((right >= 0) and "S" or "W"))] = math.abs(right);
  do return out end
end
