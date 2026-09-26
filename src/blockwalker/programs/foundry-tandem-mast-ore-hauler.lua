return function(t, s, m, r)
  s = merge({}, s, {nearby = map((s).nearby, function(p)
    return ((active((p).cargo) and ((p).mass > 10)) and merge({}, p, {x = at((p).centerOfMass, 0), z = at((p).centerOfMass, 2)}) or p)
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
  local follow = function(route, index_)
    local a = (function() if active(index_) then return at(route, (index_ - 1)) else return (m).home end end)();
    local b = at(route, index_);
    local dx = (at(b, 0) - at(a, 0));
    local dz = (at(b, 1) - at(a, 1));
    local length = hypot(dx, dz);
    local along = math.max(0, math.min(length, ((((((s).x - at(a, 0)) * dx) + (((s).z - at(a, 1)) * dz)) / math.max(0.01, length)) + 3)));
    do return {(at(a, 0) + ((dx * along) / math.max(0.01, length))), (at(a, 1) + ((dz * along) / math.max(0.01, length)))} end
  end;
  local parts = map((s).blueprint, function(b, i)
    return merge({}, b, {i = i})
  end);
  local head = find(parts, function(b)
    return ((b).joint == 5)
  end);
  local rams = filter(parts, function(b)
    return (function() local value = ((b).joint == 2); if active(value) then return ((b).axis == 1) else return value end end)()
  end);
  local extension = find(parts, function(b)
    return (function() local value = ((b).joint == 2); if active(value) then return ((b).axis == 2) else return value end end)()
  end);
  local height = math.min(1.75, table.unpack(map(rams, function(b)
    return (b).travel
  end)));
  local stroke = (reduce(rams, function(sum, b)
    return (sum + at((s).angles, (b).i))
  end, 0) / #(rams));
  local ON = string.char((head).positive);
  local OFF = string.char((head).negative);
  local go = function(p)
    (m).phase = p;
    (m).at = t;
    (m).stuck = 0;
  end;
  local magnet = at((s).magnets, (head).i);
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
    (out)[index(OFF)] = 1;
    local jobs = filter((s).nearby, function(p)
      return (function() local value = (function() local value = (function() local value = (function() local value = (p).cargo; if active(value) then return ((p).supply == 2) else return value end end)(); if active(value) then return (not active((p).delivered)) else return value end end)(); if active(value) then return (function() local value = (not active((p).carriedBy)); if active(value) then return value else return (function() local value = (not active((p).magnetHeld)); if active(value) then return some((s).nearby, function(c)
        return (function() local value = ((c).id == (p).carriedBy); if active(value) then return (c).anchored else return value end end)()
      end) else return value end end)() end end)() else return value end end)(); if active(value) then return (math.abs((((p).y - (s).ground) - 0.5)) < 0.8) else return value end end)()
    end);
    sort(jobs, function(a, b)
      return (hypot(((a).x - (s).x), ((a).z - (s).z)) - hypot(((b).x - (s).x), ((b).z - (s).z)))
    end);
    if (active(#(jobs)) and (t > (m).wait)) then
      (m).job = (at(jobs, 0)).id;
      (m).approach = 0;
      go("pickup");
    end
    goal = (m).home;
    speedLimit = 0;
  end
  if ((m).phase == "pickup") then
    if (((((not active(box)) or ((box).supply ~= 2)) or active((box).delivered)) or ((active((box).carriedBy) and ((box).carriedBy ~= (s).id)) and (active((box).magnetHeld) or (not active(some((s).nearby, function(c)
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
      (out)[index(ON)] = (((math.abs(wrap(((m).approach - yaw))) < 0.4) and (hypot((at(at((s).positions, (head).i), 0) - (box).x), (at(at((s).positions, (head).i), 2) - (box).z)) < ((box).radius + 0.65))) and 1 or 0);
      if (active((magnet).attached) and ((magnet).creature ~= (m).job)) then
        (out)[index(ON)] = 0;
        (out)[index(OFF)] = 1;
      end
      if (active((magnet).attached) and (optional(carried, "id") == (m).job)) then
        (m).trips = (m).trips + 1;
        go("lift");
      end
    end
  end
  if ((m).phase == "lift") then
    speedLimit = 0;
    lift = height;
    (out)[index(ON)] = 1;
    if (not active((magnet).attached)) then
      go("pickup");
    else
      if ((stroke > (height - 0.1)) and ((magnet).cargoSupportForce < 1)) then
        (m).depot = {x = (-43), z = 110, radius = 3.5};
        (m).route = 0;
        go("clear");
      end
    end
  end
  if ((m).phase == "clear") then
    lift = height;
    (out)[index(ON)] = 1;
    speedLimit = 0;
    avoid = false;
    if ((t - (m).at) > 5) then
      go("carry");
    end
  end
  if ((m).phase == "carry") then
    local route = {{(-33), 52}, {(-33), 71}, {(-43), 77}, {(-43), 106.1}};
    local occupied = some((s).nearby, function(p)
      return (function() local value = (function() local value = (p).cargo; if active(value) then return ((p).id ~= (m).job) else return value end end)(); if active(value) then return (hypot(((p).x - ((m).depot).x), ((p).z - ((m).depot).z)) < 3.5) else return value end end)()
    end);
    lift = height;
    (out)[index(ON)] = 1;
    if (((m).route == 3) and active(occupied)) then
      (route)[index(3)] = {(-43), 98};
    end
    goal = follow(route, (m).route);
    speedLimit = 0.6;
    avoid = false;
    if (((m).route == 3) and (hypot(((s).x - at(at(route, 3), 0)), ((s).z - at(at(route, 3), 1))) < 1)) then
      wantHeading = 0;
    end
    if (not active((magnet).attached)) then
      (m).wait = (t + 1);
      go("search");
    else
      if (((m).route < 3) and (hypot(((s).x - at(goal, 0)), ((s).z - at(goal, 1))) < 0.3)) then
        (m).route = (m).route + 1;
      else
        if ((((((m).route == 3) and (not active(occupied))) and active(carried)) and (hypot(((carried).x - ((m).depot).x), ((carried).z - ((m).depot).z)) < (((m).depot).radius - 1.2))) and (hypot((s).vx, (s).vz) < 0.2)) then
          go("lower");
        end
      end
    end
  end
  if ((m).phase == "lower") then
    speedLimit = 0;
    (out)[index(ON)] = 1;
    if (((magnet).cargoSupportForce > (((function() local value = optional(box, "mass"); if active(value) then return value else return 0 end end)() * hypot(table.unpack((s).gravity))) * 0.6)) and ((t - (m).at) > 1)) then
      go("release");
    end
  end
  if ((m).phase == "release") then
    (out)[index(OFF)] = 1;
    speedLimit = 0;
    if ((t - (m).at) > 1) then
      go("back");
    end
  end
  if ((m).phase == "back") then
    lift = height;
    (out)[index(OFF)] = 1;
    speedLimit = 0;
    if ((t - (m).at) > 3) then
      (m).route = 0;
      go("return");
    end
  end
  if ((m).phase == "return") then
    lift = height;
    local route = {{(-43), 77}, {(-33), 71}, {(-33), 52}, (m).home};
    goal = follow(route, (m).route);
    speedLimit = 0.9;
    avoid = false;
    (out)[index(OFF)] = 1;
    if (hypot(((s).x - at(goal, 0)), ((s).z - at(goal, 1))) < 0.3) then
      if ((m).route < 3) then
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
    wantHeading = 0;
    avoid = false;
    (out)[index(OFF)] = 1;
    if ((math.abs(yaw) < 0.04) and (math.abs(at((s).gyroscope, 1)) < 0.08)) then
      go("search");
    end
  end
  for _, b in ipairs(rams) do
    do
      do
        local u = clamp(((2.5 * (lift - at((s).angles, (b).i))) - (0.2 * at((s).rates, (b).i))), 1);
        (out)[index(string.char((function() if (u < 0) then return (b).negative else return (b).positive end end)()))] = math.abs(u);
      end
    end
    ::continue_1::
  end
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
            goto continue_2
          end
          local px = ((s).x - (p).x);
          local pz = ((s).z - (p).z);
          local dist = hypot(px, pz);
          local safe = ((p).radius + 4);
          if (dist > (safe + 5)) then
            goto continue_2
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
      ::continue_2::
    end
  end
  if active(avoid) then
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
      ::continue_4::
    end
  end
  local reversing = (function() local value = ((m).phase == "return"); if active(value) then return ((m).route == 0) else return value end end)();
  local target = (((m).phase == "align") and 0 or (function() if active(reversing) then return wrap((math.atan(vx, vz) + math.pi)) else return (function() if ((wantHeading ~= nil) and (d < 1)) then return wantHeading else return math.atan(vx, vz) end end)() end end)());
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
  if (active(includes({"carry", "return"}, (m).phase)) and (math.abs(error) > 0.6)) then
    speed = 0;
  end
  if ((m).phase == "back") then
    speed = (-0.7);
  end
  if ((m).phase == "clear") then
    speed = (-0.5);
  end
  if (((m).phase == "pickup") and active(box)) then
    local tip = at((s).positions, (head).i);
    local dx = ((box).x - at(tip, 0));
    local dz = ((box).z - at(tip, 2));
    speed = clamp((0.7 * ((dx * math.sin(yaw)) + (dz * math.cos(yaw)))), 0.5);
  end
  local drive = clamp(((speed / 2.8) + (0.3 * (speed - at((s).localVelocity, 2)))), 0.65);
  local turn = (function() if (((m).phase == "pickup") and active(box)) then return clamp(((0.7 * wrap((math.atan(((box).x - (s).x), ((box).z - (s).z)) - yaw))) - (0.3 * at((s).gyroscope, 1))), 0.3) else return ((speedLimit == 0) and 0 or clamp(((0.8 * error) - (0.3 * at((s).gyroscope, 1))), 0.45)) end end)();
  for _, b in ipairs(filter((s).blueprint, function(b)
    return (function() local value = ((b).joint == 4); if active(value) then return ((b).axis == 0) else return value end end)()
  end)) do
    do
      do
        local value = clamp((drive - (turn * sign(((b).x - (at((s).blueprint, 0)).x)))), 1);
        (out)[index(string.char((function() if (value < 0) then return (b).negative else return (b).positive end end)()))] = math.abs(value);
      end
    end
    ::continue_5::
  end
  local length = (function() if active(includes({"search", "pickup"}, (m).phase)) then return (extension).travel else return 0 end end)();
  local u = clamp((((2.5 * (length - at((s).angles, (extension).i))) - (0.2 * at((s).rates, (extension).i))) / (extension).speed), 1);
  (out)[index(string.char((function() if (u < 0) then return (extension).negative else return (extension).positive end end)()))] = math.abs(u);
  do return out end
end
