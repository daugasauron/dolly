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
    if p=="withdraw" then m.withdrawYaw=yaw end
    if p=="clear" then m.clearStart={s.x,s.z,yaw} end
    if p=="lower" then m.lowerPower=1 end
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
      go(math.abs(jobs[1].x-s.x)<.4 and math.abs(yaw)<.1 and "pickup" or "withdraw");
    end
    goal = (m).home;
    speedLimit = 0;
  end
  if m.phase=="withdraw" then
    out[OFF]=1;speedLimit=0;avoid=false
    local radius=0
    for _,b in ipairs(s.blueprint) do radius=math.max(radius,hypot(b.x-s.blueprint[1].x,b.z-s.blueprint[1].z)+.7) end
    local clear=true
    local function blocks(b) return b.high>s.ground+.3 and b.low<s.y+4 and hypot(math.max(0,math.abs(s.x-b.x)-b.halfX),math.max(0,math.abs(s.z-b.z)-b.halfZ))<radius end
    for _,b in ipairs(s.terrain) do if blocks(b) then clear=false end end
    for _,c in ipairs(s.nearby) do if c.anchored and hypot(c.x-s.x,c.z-s.z)<c.radius+radius then
      for _,b in ipairs(s.bounds(c.id)) do if blocks(b) then clear=false end end
    end end
    if t-m.at>4 and clear and s.angles[extension.i+1]<.1 then go("stage") end
  end
  if m.phase=="stage" then
    if not box then go("search") else
      goal={box.x-math.sin(m.approach)*8,box.z-math.cos(m.approach)*8};speedLimit=.6;avoid=false
      if hypot(s.x-goal[1],s.z-goal[2])<.3 then go("orient") end
    end
  end
  if m.phase=="orient" then
    goal={s.x+math.sin(m.approach),s.z+math.cos(m.approach)};speedLimit=.4;avoid=false
    if math.abs(wrap(m.approach-yaw))<.05 and math.abs(s.gyroscope[2])<.08 then go("pickup") end
  end
  if ((m).phase == "pickup") then
    local supporting=box and box.carriedBy~=s.id and box.carriedBy~=0 and (box.magnetHeld or not some(s.nearby,function(c) return c.id==box.carriedBy and c.anchored end))
    if not box or box.supply~=2 or box.delivered or supporting then
      (m).wait = (t + 2);
      go("search");
    else
      if t-m.at>25 then go("withdraw") end
      local dx = math.sin((m).approach);
      local dz = math.cos((m).approach);
      goal = {((box).x - (dx * 4)), ((box).z - (dz * 4))};
      wantHeading = (m).approach;
      speedLimit = 0.7;
      lift=math.max(0,math.min(height,box.high+.6-s.positions[head.i+1][2]+stroke));
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
    m.clearStart=m.clearStart or {s.x,s.z,yaw}
    local retreat=(m.clearStart[1]-s.x)*math.sin(m.clearStart[3])+(m.clearStart[2]-s.z)*math.cos(m.clearStart[3])
    if retreat>3.5 and s.angles[extension.i+1]<.1 then go("carry") end
    if t-m.at>10 and retreat<3.5 then lift=0 end
  end
  if ((m).phase == "carry") then
    local route = {{(-37), 52}, {(-37), 75}, {(-43), 75}, {(-43), 106.1}};
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
    m.stuck=hypot(s.vx,s.vz)<.03 and math.abs(s.gyroscope[2])<.03 and hypot(s.x-goal[1],s.z-goal[2])>.3 and (m.stuck+s.dt) or 0
    if m.stuck>5 then m.route=0;m.recoveries=(m.recoveries or 0)+1;go("clear") end
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
    if box and stroke<.05 and box.low<s.ground+.25 then
      m.lowerPower=math.max(.05,(m.lowerPower or 1)-s.dt*.15)
    end
    (out)[index(ON)] = m.lowerPower or 1;
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
    local route = {{(-43), 75}, {(-37), 75}, {(-37), 52}, (m).home};
    goal = follow(route, (m).route);
    speedLimit = 0.9;
    avoid = false;
    (out)[index(OFF)] = 1;
    m.stuck=hypot(s.vx,s.vz)<.03 and math.abs(s.gyroscope[2])<.03 and hypot(s.x-goal[1],s.z-goal[2])>.3 and (m.stuck+s.dt) or 0
    if m.stuck>5 then m.recoveries=(m.recoveries or 0)+1;go("back") end
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
  if m.phase=="orient" then speed=0 end
  if m.phase=="stage" and math.abs(error)>.6 then speed=0 end
  if m.phase=="withdraw" then speed=-.5 end
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
  if m.phase=="withdraw" then turn=clamp(.8*wrap((m.withdrawYaw or yaw)-yaw)-.3*s.gyroscope[2],.45) end
  if m.phase=="clear" then turn=clamp(.8*wrap((m.clearStart and m.clearStart[3] or yaw)-yaw)-.3*s.gyroscope[2],.45) end
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
  local length = (function() if active(includes({"pickup"}, (m).phase)) then return (extension).travel else return 0 end end)();
  local u = clamp((((2.5 * (length - at((s).angles, (extension).i))) - (0.2 * at((s).rates, (extension).i))) / (extension).speed), 1);
  (out)[index(string.char((function() if (u < 0) then return (extension).negative else return (extension).positive end end)()))] = math.abs(u);
  do return out end
end
