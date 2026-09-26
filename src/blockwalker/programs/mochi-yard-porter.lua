return function(t, s, m, r)
  local clamp = function(v, a)
    return math.max((-a), math.min(a, v))
  end;
  local wrap = function(v)
    return math.atan(math.sin(v), math.cos(v))
  end;
  local q = (s).rotation;
  local yaw = math.atan((2 * ((at(q, 0) * at(q, 2)) + (at(q, 1) * at(q, 3)))), (1 - (2 * ((at(q, 0) * at(q, 0)) + (at(q, 1) * at(q, 1))))));
  local out = {};
  if (not active((m).home)) then
    (m).home = {(s).x, (s).z};
    (m).phase = "search";
    (m).at = t;
    (m).deliveries = 0;
    (m).trips = 0;
    (m).wait = 0;
    (m).job = 0;
    (m).stuck = 0;
    (m).back = 0;
  end
  (m).deliveries = (s).cargoDelivered;
  local go = function(p)
    (m).phase = p;
    (m).at = t;
    (m).stuck = 0;
  end;
  local magnet = at((s).magnets, 13);
  local box = find((s).nearby, function(p)
    return ((p).id == (m).job)
  end);
  local carried = find((s).nearby, function(p)
    return (function() local value = (p).cargo; if active(value) then return ((p).carriedBy == (s).id) else return value end end)()
  end);
  local goal = (m).home;
  local wantHeading = nil;
  local speedLimit = 1.2;
  local lift = 0;
  local avoid = true;
  if ((m).phase == "search") then
    (out).Q = 1;
    local jobs = filter((s).nearby, function(p)
      return (function() local value = (function() local value = (function() local value = (p).cargo; if active(value) then return (not active((p).delivered)) else return value end end)(); if active(value) then return (not active((p).carriedBy)) else return value end end)(); if active(value) then return (math.abs((((p).y - (s).ground) - 0.5)) < 0.6) else return value end end)()
    end);
    sort(jobs, function(a, b)
      return (hypot(((a).x - (s).x), ((a).z - (s).z)) - hypot(((b).x - (s).x), ((b).z - (s).z)))
    end);
    if (active(#(jobs)) and (t > (m).wait)) then
      (m).job = (at(jobs, 0)).id;
      (m).approach = math.atan(((at(jobs, 0)).x - (s).x), ((at(jobs, 0)).z - (s).z));
      go("pickup");
    end
    if (((not active((m).search)) or (hypot(((s).x - at((m).search, 0)), ((s).z - at((m).search, 1))) < 2)) or (t > (m).searchUntil)) then
      local a = ((r() * math.pi) * 2);
      local d = (12 + (18 * r()));
      (m).search = {math.max((-82), math.min(80, ((s).x + (math.sin(a) * d)))), math.max((-80), math.min(43, ((s).z + (math.cos(a) * d))))};
      (m).searchUntil = (t + 45);
      (m).searches = ((function() local value = (m).searches; if active(value) then return value else return 0 end end)() + 1);
    end
    goal = (m).search;
    speedLimit = 0.8;
  end
  if ((m).phase == "pickup") then
    if ((((not active(box)) or active((box).delivered)) or (active((box).carriedBy) and ((box).carriedBy ~= (s).id))) or ((t - (m).at) > 50)) then
      (m).wait = (t + 2);
      go("search");
    else
      local dx = math.sin((m).approach);
      local dz = math.cos((m).approach);
      goal = {((box).x - (dx * 3.9)), ((box).z - (dz * 3.9))};
      wantHeading = (m).approach;
      speedLimit = 0.7;
      avoid = false;
      (out).E = (((math.abs(wrap(((m).approach - yaw))) < 0.2) and (hypot(((s).x - (box).x), ((s).z - (box).z)) < 6)) and 1 or 0);
      if (active((magnet).attached) and (optional(carried, "id") == (m).job)) then
        (m).trips = (m).trips + 1;
        go("lift");
      end
    end
  end
  if ((m).phase == "lift") then
    speedLimit = 0;
    lift = 1.1;
    (out).E = 1;
    if (not active((magnet).attached)) then
      go("pickup");
    else
      if (at((s).angles, 9) > 0.95) then
        (m).depot = reduce((s).depots, function(a, b)
          return (function() if (hypot(((a).x - at((m).home, 0)), ((a).z - at((m).home, 1))) < hypot(((b).x - at((m).home, 0)), ((b).z - at((m).home, 1)))) then return a else return b end end)()
        end);
        (m).heading = math.atan((((m).depot).x - (s).x), (((m).depot).z - (s).z));
        go("carry");
      end
    end
  end
  if ((m).phase == "carry") then
    local depot = reduce((s).depots, function(a, b)
      return (function() if (hypot(((a).x - at((m).home, 0)), ((a).z - at((m).home, 1))) < hypot(((b).x - at((m).home, 0)), ((b).z - at((m).home, 1)))) then return a else return b end end)()
    end);
    if ((((m).depot).x ~= (depot).x) or (((m).depot).z ~= (depot).z)) then
      (m).depot = depot;
      (m).heading = math.atan(((depot).x - (s).x), ((depot).z - (s).z));
    end
    local approach = function(h)
      return {(((m).depot).x - (3.9 * math.sin(h))), (((m).depot).z - (3.9 * math.cos(h)))}
    end;
    local parked = filter((s).nearby, function(p)
      return (function() local value = (function() local value = (function() local value = (p).cargo; if active(value) then return ((p).carriedBy ~= (s).id) else return value end end)(); if active(value) then return ((p).low < ((s).y + 3)) else return value end end)(); if active(value) then return ((p).high > ((s).y - 2)) else return value end end)()
    end);
    local clear = function(h)
      local q = approach(h);
      do return math.min(20, table.unpack(map(parked, function(p)
        return (hypot(((p).x - at(q, 0)), ((p).z - at(q, 1))) - (p).radius)
      end))) end
    end;
    if ((hypot(((s).x - ((m).depot).x), ((s).z - ((m).depot).z)) < 20) and (clear((m).heading) < 4.5)) then
      local best = (-math.huge);
      do
        local i = 0;
        while (i < 12) do
          do
            do
              local h = ((i * math.pi) / 6);
              local q = approach(h);
              local score = (clear(h) - (0.05 * hypot((at(q, 0) - (s).x), (at(q, 1) - (s).z))));
              if (score > best) then
                best = score;
                (m).heading = h;
              end
            end
          end
          ::continue_1::
          i = i + 1;
        end
      end
    end
    lift = 1.1;
    (out).E = 1;
    goal = approach((m).heading);
    wantHeading = (m).heading;
    speedLimit = math.min(1.2, (0.3 * hypot((at(goal, 0) - (s).x), (at(goal, 1) - (s).z))));
    if (not active((magnet).attached)) then
      (m).wait = (t + 1);
      go("search");
    else
      if ((active(carried) and (hypot(((carried).x - ((m).depot).x), ((carried).z - ((m).depot).z)) < (((m).depot).radius - 1.2))) and (hypot((s).vx, (s).vz) < 0.2)) then
        go("lower");
      end
    end
  end
  if ((m).phase == "lower") then
    speedLimit = 0;
    (out).E = 1;
    if ((at((s).angles, 9) < 0.07) and ((t - (m).at) > 1)) then
      go("release");
    end
  end
  if ((m).phase == "release") then
    (out).Q = 1;
    speedLimit = 0;
    if ((t - (m).at) > 1) then
      go("back");
    end
  end
  if ((m).phase == "back") then
    (out).Q = 1;
    speedLimit = 0;
    if ((t - (m).at) > 3) then
      (m).wait = (t + 1);
      go("search");
    end
  end
  local liftControl = clamp(((2.5 * (lift - at((s).angles, 9))) - (0.2 * at((s).rates, 9))), 1);
  (out)[index(((liftControl < 0) and "I" or "K"))] = math.abs(liftControl);
  local dx = (at(goal, 0) - (s).x);
  local dz = (at(goal, 1) - (s).z);
  local d = hypot(dx, dz);
  local vx = (dx / math.max(0.01, d));
  local vz = (dz / math.max(0.01, d));
  local clearance = {};
  for _, p in ipairs((s).nearby) do
    do
      do
        if ((((((not active(avoid)) and (not active((p).cargo))) or ((p).carriedBy == (s).id)) or (((m).phase == "pickup") and ((p).id == (m).job))) or ((p).low > ((s).y + 3))) or ((p).high < ((s).y - 2))) then
          goto continue_2
        end
        local px, pz = s.x-p.x, s.z-p.z;
        local dist = hypot(px,pz);
        local safe = p.radius + (p.cargo and 2.5 or 4);
        if p.anchored then
          local nearest = math.huge;
          for _, b in ipairs(s.bounds(p.id)) do
            if b.high > s.ground+.3 and b.low < s.y+3.6 then
              local x = s.x-math.max(b.x-b.halfX,math.min(b.x+b.halfX,s.x));
              local z = s.z-math.max(b.z-b.halfZ,math.min(b.z+b.halfZ,s.z));
              local d = hypot(x,z);
              if d < nearest then px,pz,nearest=x,z,d end
            end
          end
          dist,safe=nearest,2.5;
        end
        local margin = (active((p).cargo) and 2 or 5);
        if (dist > (safe + margin)) then
          goto continue_2
        end
        local nx = (px / math.max(0.01, dist));
        local nz = (pz / math.max(0.01, dist));
        local f = math.max(0, (((safe + margin) - dist) / margin));
        vx = (vx + (f * (nx + (0.7 * nz))));
        vz = (vz + (f * (nz - (0.7 * nx))));
        if (dist < safe) then
          append(clearance, {nx, nz});
        end
      end
    end
    ::continue_2::
  end
  for _, p in ipairs((s).obstacles) do
    do
      do
        if ((p).low > ((s).y + 3.6)) then
          goto continue_3
        end
        local px = ((s).x - math.max(((p).x - (p).halfX), math.min(((p).x + (p).halfX), (s).x)));
        local pz = ((s).z - math.max(((p).z - (p).halfZ), math.min(((p).z + (p).halfZ), (s).z)));
        local dist = hypot(px, pz);
        if (dist > 8) then
          goto continue_3
        end
        local nx = (px / math.max(0.01, dist));
        local nz = (pz / math.max(0.01, dist));
        local weight = ((8 - dist) / 4);
        vx = (vx + (weight * (nx + (0.8 * nz))));
        vz = (vz + (weight * (nz - (0.8 * nx))));
      end
    end
    ::continue_3::
  end
  for _, p in ipairs(slice((s).groundSamples, 0, 8)) do
    do
      if (math.abs((at(p, 1) - (s).ground)) > 0.4) then
        local nx = (((s).x - at(p, 0)) / 6);
        local nz = (((s).z - at(p, 2)) / 6);
        if (((vx * nx) + (vz * nz)) < (-0.2)) then
          vx = (vx + (2 * nx));
          vz = (vz + (2 * nz));
        end
      end
    end
    ::continue_4::
  end
  local target = (function() if ((wantHeading ~= nil) and (d < 1)) then return wantHeading else return math.atan(vx, vz) end end)();
  local error = wrap((target - yaw));
  local speed = (math.min(speedLimit, (d * 0.8)) * math.max(0, math.cos(error)));
  if ((d < 0.15) or active(some(clearance, function(n)
    return (((at(n, 0) * math.sin(target)) + (at(n, 1) * math.cos(target))) < 0)
  end))) then
    speed = 0;
  end
  if ((m).phase == "back") then
    speed = (-0.7);
  end
  if speed>.2 and hypot(s.vx,s.vz)<.04 then m.stuck=(m.stuck or 0)+s.dt else m.stuck=0 end
  if m.stuck>6 then
    local best,dot=-1,-math.huge
    for i=1,8 do
      local p=s.groundSamples[i]
      local score=-(p[1]-s.x)*math.sin(yaw)-(p[3]-s.z)*math.cos(yaw)
      if score>dot then best,dot=i,score end
    end
    local ground=s.groundSamples[best][2]
    if math.abs(ground-s.ground)<.4 then m.back=t+2 end
    m.stuck=0
  end
  if t<(m.back or 0) then speed=-.6;error=0 end
  local drive = clamp(((speed / 2.8) + (0.3 * (speed - at((s).localVelocity, 2)))), 0.65);
  local turn = ((speedLimit == 0) and 0 or clamp(((0.8 * error) - (0.3 * at((s).gyroscope, 1))), 0.45));
  do
    local i = 0;
    while (i < 4) do
      do
        do
          local value = clamp((drive + ((active(math.fmod(i, 2)) and (-1) or 1) * turn)), 1);
          (out)[index(tostring(((1 + (i * 2)) + ((value >= 0) and 1 or 0))))] = math.abs(value);
        end
      end
      ::continue_5::
      i = i + 1;
    end
  end
  do return out end
end
