return function(t, s, m, r)
  s = merge({}, s, {nearby = map((s).nearby, function(p)
    return ((active((p).cargo) and ((p).mass > 8)) and merge({}, p, {x = at((p).centerOfMass, 0), z = at((p).centerOfMass, 2)}) or p)
  end)});
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
  local magnet = at((s).magnets, 11);
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
    local jobs=filter(s.nearby,function(p)
      if not p.cargo or p.team~=0 or p.delivered or p.mass*hypot(table.unpack(s.gravity))>s.blueprint[12].force*.8
        or hypot(p.x-m.home[1],p.z-m.home[2])>18 or math.abs(p.y-s.ground-.5)>.8 then return false end
      if p.carriedBy==0 then return true end
      if p.magnetHeld then return false end
      for _,c in ipairs(s.nearby) do if c.id==p.carriedBy and c.anchored then return true end end
      return false
    end)
    sort(jobs, function(a, b)
      return (hypot(((a).x - (s).x), ((a).z - (s).z)) - hypot(((b).x - (s).x), ((b).z - (s).z)))
    end);
    if (active(#(jobs)) and (t > (m).wait)) then
      (m).job = (at(jobs, 0)).id;
      (m).approach = math.pi;
      go("pickup");
    else
      if ((not active(#(jobs))) and (hypot(((s).x - at((m).home, 0)), ((s).z - at((m).home, 1))) > 2)) then
        (m).job = 0;
        (m).route = (((s).z > (-42)) and 0 or (((s).z > (-59)) and 1 or 2));
        go("return");
      end
    end
    goal = (m).home;
    speedLimit = 0;
  end
  if ((m).phase == "pickup") then
    if (((((not active(box)) or ((box).team ~= 0)) or active((box).delivered)) or ((active((box).carriedBy) and ((box).carriedBy ~= (s).id)) and (active((box).magnetHeld) or (not active(some((s).nearby, function(c)
      return (function() local value = ((c).id == (box).carriedBy); if active(value) then return (c).anchored else return value end end)()
    end)))))) or ((t - (m).at) > 50)) then
      (m).wait = (t + 2);
      go("search");
    else
      local dx = math.sin((m).approach);
      local dz = math.cos((m).approach);
      goal = {((box).x - (dx * 4)), ((box).z - (dz * 4))};
      wantHeading = (m).approach;
      speedLimit = 0.7;
      avoid = false;
      (out).E = (((math.abs(wrap(((m).approach - yaw))) < 0.4) and (hypot((at(at((s).positions, 11), 0) - (box).x), (at(at((s).positions, 11), 2) - (box).z)) < 0.22)) and 1 or 0);
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
      if (at((s).angles, 8) > 0.95) then
        (m).depot = {x = (-74), z = (-20), radius = 3.5};
        (m).route = 0;
        go("clear");
      end
    end
  end
  if ((m).phase == "clear") then
    lift = 1.1;
    (out).E = 1;
    speedLimit = 0;
    avoid = false;
    if ((t - (m).at) > 5) then
      go("carry");
    end
  end
  if ((m).phase == "carry") then
    local bays = {-74, -76, -72};
    local function free(x)
      for _, p in ipairs(s.nearby) do
        if p.cargo and p.id ~= m.job and p.low<s.ground+2 and hypot(p.x-x, p.z+20) < p.radius+(carried and carried.radius or .7)+.3 then return false end
      end
      return true
    end
    if not free(m.depot.x) then
      for _, x in ipairs(bays) do if free(x) then m.depot.x = x; break end end
    end
    local occupied = not free(m.depot.x);
    local route = {{-74, -59}, {-74, -38}, {m.depot.x, -24}};
    lift = 1.1;
    out.E = 1;
    goal = m.route == 2 and occupied and {-74, -32} or route[m.route+1];
    speedLimit = 0.6;
    avoid = false;
    if ((m).route == 2) then
      wantHeading = 0;
    end
    if (not active((magnet).attached)) then
      (m).wait = (t + 1);
      go("search");
    else
      if (((m).route < 2) and (hypot(((s).x - at(goal, 0)), ((s).z - at(goal, 1))) < 0.3)) then
        (m).route = (m).route + 1;
      else
        if ((((((m).route == 2) and (not active(occupied))) and active(carried)) and (hypot(((carried).x - ((m).depot).x), ((carried).z - ((m).depot).z)) < (((m).depot).radius - 1.2))) and (hypot((s).vx, (s).vz) < 0.2)) then
          go("lower");
        end
      end
    end
  end
  if ((m).phase == "lower") then
    speedLimit = 0;
    (out).E = 1;
    if ((at((s).angles, 8) < 0.07) and ((t - (m).at) > 1)) then
      go("release");
    end
  end
  if ((m).phase == "release") then
    (out).Q = 1;
    speedLimit = 0;
    if ((t - (m).at) > 1) then
      (m).handoffs = ((function() local value = (m).handoffs; if active(value) then return value else return 0 end end)() + 1);
      go("back");
    end
  end
  if ((m).phase == "back") then
    lift = 1.1;
    (out).Q = 1;
    speedLimit = 0;
    if ((t - (m).at) > 3) then
      (m).route = 0;
      go("return");
    end
  end
  if ((m).phase == "return") then
    lift = 1.1;
    local route = {{(-74), (-42)}, {(-74), (-59)}, (m).home};
    goal = at(route, (m).route);
    speedLimit = 0.9;
    avoid = false;
    (out).Q = 1;
    if (hypot(((s).x - at(goal, 0)), ((s).z - at(goal, 1))) < 0.3) then
      if ((m).route < 2) then
        (m).route = (m).route + 1;
      else
        (m).wait = (t + 1);
        go("align");
      end
    end
  end
  if ((m).phase == "align") then
    goal = (m).home;
    speedLimit = 0.4;
    wantHeading = math.pi;
    avoid = false;
    (out).Q = 1;
    if ((math.abs(wrap((yaw - math.pi))) < 0.04) and (math.abs(at((s).gyroscope, 1)) < 0.08)) then
      go("search");
    end
  end
  local liftControl = clamp(((2.5 * (lift - at((s).angles, 8))) - (0.2 * at((s).rates, 8))), 1);
  (out)[index(((liftControl < 0) and "I" or "K"))] = math.abs(liftControl);
  local dx = (at(goal, 0) - (s).x);
  local dz = (at(goal, 1) - (s).z);
  local d = hypot(dx, dz);
  local vx = (dx / math.max(0.01, d));
  local vz = (dz / math.max(0.01, d));
  local yielding = false;
  if active(avoid) then
    for _, p in ipairs((s).nearby) do
      do
        do
          if ((active((p).cargo) or ((p).low > ((s).y + 3))) or ((p).high < ((s).y - 2))) then
            goto continue_1
          end
          local px = ((s).x - (p).x);
          local pz = ((s).z - (p).z);
          local dist = hypot(px, pz);
          local safe = ((p).radius + 4);
          if (dist > (safe + 5)) then
            goto continue_1
          end
          local nx = (px / math.max(0.01, dist));
          local nz = (pz / math.max(0.01, dist));
          local f = math.max(0, (((safe + 5) - dist) / 5));
          vx = (vx + (f * (nx + (0.7 * nz))));
          vz = (vz + (f * (nz - (0.7 * nx))));
          if ((dist < safe) and ((((-nx) * dx) - (nz * dz)) > 0)) then
            yielding = true;
          end
        end
      end
      ::continue_1::
    end
  end
  if active(avoid) then
    for _, p in ipairs((s).obstacles) do
      do
        do
          if ((p).low > ((s).y + 3.6)) then
            goto continue_2
          end
          local px = ((s).x - math.max(((p).x - (p).halfX), math.min(((p).x + (p).halfX), (s).x)));
          local pz = ((s).z - math.max(((p).z - (p).halfZ), math.min(((p).z + (p).halfZ), (s).z)));
          local dist = hypot(px, pz);
          if (dist > 8) then
            goto continue_2
          end
          local nx = (px / math.max(0.01, dist));
          local nz = (pz / math.max(0.01, dist));
          local weight = ((8 - dist) / 4);
          vx = (vx + (weight * (nx + (0.8 * nz))));
          vz = (vz + (weight * (nz - (0.8 * nx))));
        end
      end
      ::continue_2::
    end
  end
  if active(avoid) then
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
      ::continue_3::
    end
  end
  local reversing = m.phase == "return" and m.route == 0 and math.abs(wrap(math.atan(vx, vz)-yaw)) > math.pi/2;
  local target = (active(reversing) and (math.atan(vx, vz) + math.pi) or (function() if ((m).phase == "align") then return math.pi else return (function() if ((wantHeading ~= nil) and (d < 1)) then return wantHeading else return math.atan(vx, vz) end end)() end end)());
  local error = wrap((target - yaw));
  local speed = (math.min(speedLimit, (d * 0.8)) * math.max(0, math.cos(error)));
  if ((d < 0.15) or active(yielding)) then
    speed = 0;
  end
  if ((m).phase == "align") then
    speed = 0;
  end
  if active(reversing) then
    speed = ((-math.min(0.7, (d * 0.8))) * math.max(0, math.cos(error)));
  end
  if active(includes({"carry", "return"}, m.phase)) and math.abs(error)>.25 then
    speed=0
    if m.phase=='return' then
      if not m.turning or math.abs(wrap(yaw-m.turning.yaw))>.06 then m.turning={at=t,yaw=yaw} end
      if t-m.turning.at>3 then speed=reversing and -.25 or .25 end
    end
  else m.turning=nil end
  if ((m).phase == "back") then
    speed = (-0.7);
  end
  if ((m).phase == "clear") then
    speed = (-0.5);
  end
  if (((m).phase == "pickup") and active(box)) then
    local tip = at((s).positions, 11);
    local dx = ((box).x - at(tip, 0));
    local dz = ((box).z - at(tip, 2));
    speed = clamp((0.7 * ((dx * math.sin(yaw)) + (dz * math.cos(yaw)))), 0.5);
  end
  local drive = clamp(((speed / 2.8) + (0.3 * (speed - at((s).localVelocity, 2)))), 0.65);
  local turn = (function() if (((m).phase == "pickup") and active(box)) then return clamp(((0.7 * wrap((math.atan(((box).x - (s).x), ((box).z - (s).z)) - yaw))) - (0.3 * at((s).gyroscope, 1))), 0.3) else return ((speedLimit == 0) and 0 or clamp(((0.8 * error) - (0.3 * at((s).gyroscope, 1))), 0.45)) end end)();
  do
    local i = 0;
    while (i < 4) do
      do
        do
          local value = clamp((drive + ((active(math.fmod(i, 2)) and (-1) or 1) * turn)), 1);
          (out)[index(tostring(((1 + (i * 2)) + ((value >= 0) and 1 or 0))))] = math.abs(value);
        end
      end
      ::continue_4::
      i = i + 1;
    end
  end
  local extension = (active(includes({"search", "pickup", "lift"}, (m).phase)) and 1 or 0);
  local u = clamp((((2.5 * (extension - at((s).angles, 10))) - (0.2 * at((s).rates, 10))) / 0.7), 1);
  (out)[index(((u < 0) and "Z" or "X"))] = math.abs(u);
  do return out end
end
