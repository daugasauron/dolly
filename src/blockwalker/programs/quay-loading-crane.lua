return function(t, s, m)
  local clamp = function(v, a)
    if a == nil then a = 1 end
    return math.max((-a), math.min(a, v))
  end;
  local wrap = function(v)
    return math.atan(math.sin(v), math.cos(v))
  end;
  local parts = map((s).blueprint, function(b, i)
    return merge({}, b, {i = i})
  end);
  local bearing = find(parts, function(b)
    return (function() local value = includes({1, 7}, (b).joint); if active(value) then return ((b).axis == 1) else return value end end)()
  end);
  local rams = filter(parts, function(b)
    return (function() local value = ((b).joint == 2); if active(value) then return ((b).axis == 1) else return value end end)()
  end);
  local extension = find(parts, function(b)
    return (function() local value = ((b).joint == 2); if active(value) then return ((b).axis == 0) else return value end end)()
  end);
  local head = find(parts, function(b)
    return ((b).joint == 5)
  end);
  local grip = at((s).magnets, (head).i);
  local tip = at((s).positions, (head).i);
  local out = {};
  local set = function(b, u)
    u = clamp(u);
    (out)[index(string.char((b).negative))] = math.max(0, (-u));
    (out)[index(string.char((b).positive))] = math.max(0, u);
  end;
  local servo = function(b, target)
    return set(b, (((2.2 * (target - at((s).angles, (b).i))) - (0.2 * at((s).rates, (b).i))) / (b).speed))
  end;
  local go = function(p)
    (m).phase = p;
    (m).at = t;
    (m).still = 0;
  end;
  local travel = reduce(rams, function(sum, b)
    return (sum + at((s).angles, (b).i))
  end, 0);
  local capacity = reduce(rams, function(sum, b)
    return (sum + (b).travel)
  end, 0);
  local liftRate = reduce(rams, function(sum, b)
    return (sum + math.abs(at((s).rates, (b).i)))
  end, 0);
  local actual = math.atan((-(at(tip, 2) - (s).z)), (at(tip, 0) - (s).x));
  local radius = ((head).x - (at(parts, 0)).x);
  if (not active((m).phase)) then
    (m).jobs = 0;
    (m).job = 0;
    (m).reach = 0;
    go("seek");
  end
  local box = find((s).nearby, function(b)
    return ((b).id == (m).job)
  end);
  local boat = find((s).nearby, function(b)
    return ((b).id == (m).boat)
  end);
  local yaw = ((-math.pi) / 2);
  local lower = 0;
  local power = false;
  local reach = (function() local value = (m).reach; if active(value) then return value else return 0 end end)();
  if active(includes({"align_pick", "pickup", "lift", "swing", "settle", "lower"}, (m).phase)) then
    if ((not active(box)) or ((not active((grip).attached)) and (not active(includes({"align_pick", "pickup"}, (m).phase))))) then
      go("return");
    else
      if (active(includes({"swing", "settle", "lower"}, (m).phase)) and (not active(boat))) then
        set(head, 1);
        do return out end
      end
    end
  end
  if (active((grip).attached) and ((grip).creature ~= (m).job)) then
    go("return");
    set(head, (-1));
    do return out end
  end
  if ((m).phase == "seek") then
    local stock = sort(filter((s).nearby, function(b)
      return (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (b).cargo; if active(value) then return (not active((b).delivered)) else return value end end)(); if active(value) then return (not active((b).carriedBy)) else return value end end)(); if active(value) then return (((b).mass * hypot(table.unpack((s).gravity))) < ((head).force * 0.8)) else return value end end)(); if active(value) then return (at((b).centerOfMass, 0) > ((s).x + 1)) else return value end end)(); if active(value) then return (hypot((at((b).centerOfMass, 0) - (s).x), (at((b).centerOfMass, 2) - (s).z)) > (radius - math.min(0.8, (b).radius))) else return value end end)(); if active(value) then return (hypot((at((b).centerOfMass, 0) - (s).x), (at((b).centerOfMass, 2) - (s).z)) < ((radius + (extension).travel) + math.min(0.8, (b).radius))) else return value end end)()
    end), function(a, b)
      return ((b).high - (a).high)
    end);
    local free = find((s).nearby, function(b)
      return (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (not active((b).cargo)); if active(value) then return (not active((b).anchored)) else return value end end)(); if active(value) then return (b).team else return value end end)(); if active(value) then return ((b).low < (s).waterHeight) else return value end end)(); if active(value) then return (math.abs(((b).x - (s).x)) < 0.4) else return value end end)(); if active(value) then return (((b).z - (s).z) > (radius - 0.3)) else return value end end)(); if active(value) then return (((b).z - (s).z) < ((radius + (extension).travel) + 0.3)) else return value end end)(); if active(value) then return (hypot((b).vx, (b).vz) < 0.15) else return value end end)(); if active(value) then return (not active(some((s).nearby, function(c)
        return (function() local value = (c).cargo; if active(value) then return ((c).carriedBy == (b).id) else return value end end)()
      end))) else return value end end)()
    end);
    local cargo = find(stock, function(b)
      return (not active(some((s).nearby, function(c)
        return (function() local value = (function() local value = (function() local value = (not active((c).cargo)); if active(value) then return (not active((c).anchored)) else return value end end)(); if active(value) then return ((c).id ~= optional(free, "id")) else return value end end)(); if active(value) then return (hypot(((c).x - at((b).centerOfMass, 0)), ((c).z - at((b).centerOfMass, 2))) < ((c).radius + 1.5)) else return value end end)()
      end)))
    end);
    if (active(cargo) and active(free)) then
      (m).job = (cargo).id;
      (m).boat = (free).id;
      go("align_pick");
    end
  end
  if (active(includes({"align_pick", "pickup"}, (m).phase)) and active(box)) then
    local bx = (at((box).centerOfMass, 0) - (s).x);
    local bz = (at((box).centerOfMass, 2) - (s).z);
    local distance = hypot(bx, bz);
    local grasp = math.max(radius, math.min((radius + (extension).travel), distance));
    local gx = ((s).x + ((bx * grasp) / math.max(0.01, distance)));
    local gz = ((s).z + ((bz * grasp) / math.max(0.01, distance)));
    local dx = (gx - at(tip, 0));
    local dz = (gz - at(tip, 2));
    local centered = (hypot(dx, dz) < 0.35);
    yaw = math.atan((-(at((box).centerOfMass, 2) - (s).z)), (at((box).centerOfMass, 0) - (s).x));
    reach = math.max(0, math.min((extension).travel, (at((s).angles, (extension).i) + clamp(((dx * math.cos(actual)) - (dz * math.sin(actual))), 0.15))));
    if ((((m).phase == "pickup") and (not active((grip).attached))) and (hypot(dx, dz) > 0.65)) then
      go("align_pick");
    end
    if ((m).phase == "align_pick") then
      (m).still = (((active(centered) and (travel < 0.08)) and (liftRate < 0.08)) and ((m).still + (s).dt) or 0);
      if ((m).still > 0.3) then
        go("pickup");
      end
    else
      lower = math.max(0, math.min(capacity, (travel + clamp((at(tip, 1) - ((box).high + 0.6)), 0.2))));
      power = (function() local value = centered; if active(value) then return ((at(tip, 1) - (box).high) < 0.8) else return value end end)();
    end
    if (active((grip).attached) and ((grip).creature == (m).job)) then
      (m).reach = at((s).angles, (extension).i);
      (m).pick = yaw;
      (m).jobs = (m).jobs + 1;
      go("lift");
    end
  end
  if ((m).phase == "lift") then
    yaw = (m).pick;
    power = true;
    if (((travel < 0.08) and (liftRate < 0.08)) and ((grip).cargoSupportForce < 1)) then
      go("swing");
    end
  end
  if ((m).phase == "swing") then
    power = true;
    if (((math.abs(wrap((actual - yaw))) < 0.035) and (math.abs((function() local value = (m).yawRate; if active(value) then return value else return 0 end end)()) < 0.08)) and ((t - (m).at) > 5)) then
      go("settle");
    end
  end
  if ((m).phase == "settle") then
    power = true;
    reach = math.max(0, math.min((extension).travel, (at((s).angles, (extension).i) + clamp(((0.35 * ((boat).z - at((box).centerOfMass, 2))) - (0.9 * (box).vz)), 0.15))));
    (m).still = ((hypot((box).vx, (box).vz) < 0.4) and ((m).still + (s).dt) or 0);
    if (((m).still > 0.5) and (math.abs(((boat).z - at((box).centerOfMass, 2))) < 0.3)) then
      (m).reach = at((s).angles, (extension).i);
      go("lower");
    end
  end
  if ((m).phase == "lower") then
    lower = capacity;
    power = true;
    (m).still = ((((grip).cargoSupportForce > (((box).mass * hypot(table.unpack((s).gravity))) * 0.7)) and (hypot((box).vx, (box).vy, (box).vz) < 0.25)) and ((m).still + (s).dt) or 0);
    if ((m).still > 0.5) then
      (m).drop = travel;
      go("release");
    end
  end
  if ((m).phase == "release") then
    lower = (m).drop;
    if ((t - (m).at) > 2) then
      go("return");
    end
  end
  if ((((m).phase == "return") and (travel < 0.08)) and ((t - (m).at) > 2)) then
    go("seek");
  end
  (m).yawRate = at((s).rates, (bearing).i);
  local wanted = clamp(((1.2 * wrap((yaw - at((s).angles, (bearing).i)))) - (0.5 * (m).yawRate)), ((bearing).speed * 0.2));
  (m).turn = ((function() local value = (m).turn; if active(value) then return value else return 0 end end)() + clamp((wanted - (function() local value = (m).turn; if active(value) then return value else return 0 end end)()), (0.25 * (s).dt)));
  set(bearing, ((m).turn / (bearing).speed));
  local remaining = lower;
  for _, b in ipairs(rams) do
    do
      do
        local wanted = math.min((b).travel, math.max(0, remaining));
        servo(b, wanted);
        remaining = (remaining - wanted);
      end
    end
    ::continue_1::
  end
  servo(extension, reach);
  set(head, (active(power) and 1 or (-1)));
  do return out end
end
