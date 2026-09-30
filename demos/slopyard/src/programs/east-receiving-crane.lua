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
  local radius = hypot(((head).x - (at(parts, 0)).x), ((head).z - (at(parts, 0)).z));
  local pad = at(sort(filter((s).depots, function(d)
    return ((d).team == (s).team)
  end), function(a, b)
    return (hypot(((a).x - (s).x), ((a).z - (s).z)) - hypot(((b).x - (s).x), ((b).z - (s).z)))
  end), 0);
  if (not active((m).phase)) then
    (m).jobs = 0;
    (m).job = 0;
    (m).reach = 0;
    go("seek");
  end
  local box = find((s).nearby, function(b)
    return ((b).id == (m).job)
  end);
  local local_ = {(((head).x - (at(parts, 0)).x) + ((extension).direction * at((s).angles, (extension).i))), ((head).z - (at(parts, 0)).z)};
  local baseYaw = math.atan((-at(local_, 1)), at(local_, 0));
  local actual = math.atan((-(at(tip, 2) - (s).z)), (at(tip, 0) - (s).x));
  local yaw = (function() local value = (m).pick; if value ~= nil then return value else return baseYaw end end)();
  local lower = 0;
  local power = false;
  local reach = (function() local value = (m).reach; if active(value) then return value else return 0 end end)();
  if (active(includes({"align_pick", "pickup", "lift", "swing", "settle", "lower"}, (m).phase)) and ((not active(box)) or ((not active((grip).attached)) and (not active(includes({"align_pick", "pickup"}, (m).phase)))))) then
    go("return");
  end
  if (active((grip).attached) and ((grip).creature ~= (m).job)) then
    go("return");
    set(head, (-1));
    do return out end
  end
  local aim = function(x, z, vx, vz)
    if vx == nil then vx = 0 end
    if vz == nil then vz = 0 end
    yaw = math.atan((-(z - (s).z)), (x - (s).x));
    local direction = (at((s).angles, (bearing).i) + (function() if ((extension).direction < 0) then return math.pi else return 0 end end)());
    local dx = (x - at(tip, 0));
    local dz = (z - at(tip, 2));
    reach = math.max(0, math.min((extension).travel, (at((s).angles, (extension).i) + clamp(((0.5 * ((dx * math.cos(direction)) - (dz * math.sin(direction)))) - (0.8 * ((vx * math.cos(direction)) - (vz * math.sin(direction))))), 0.15))));
  end;
  if ((m).phase == "seek") then
    local cargo = find(filter((s).nearby, function(c)
      return (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (c).cargo; if active(value) then return (not active((c).delivered)) else return value end end)(); if active(value) then return (not active((c).magnetHeld)) else return value end end)(); if active(value) then return (((c).mass * hypot(table.unpack((s).gravity))) < ((head).force * 0.8)) else return value end end)(); if active(value) then return (hypot((at((c).centerOfMass, 0) - (s).x), (at((c).centerOfMass, 2) - (s).z)) < ((radius + (extension).travel) + 0.5)) else return value end end)(); if active(value) then return (hypot((at((c).centerOfMass, 0) - (s).x), (at((c).centerOfMass, 2) - (s).z)) > (radius - 0.5)) else return value end end)()
    end), function(c)
      return (function() local value = some((s).nearby, function(b)
        return (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = ((b).id == (c).carriedBy); if active(value) then return (not active((b).anchored)) else return value end end)(); if active(value) then return ((b).team == (s).team) else return value end end)(); if active(value) then return ((b).low < (s).waterHeight) else return value end end)(); if active(value) then return (hypot((b).vx, (b).vz) < 0.15) else return value end end)(); if active(value) then return some((s).radio, function(r)
          return (function() local value = (function() local value = (function() local value = ((r).kind == "ready"); if active(value) then return ((r).from == (b).id) else return value end end)(); if active(value) then return ((r).cargo == (c).id) else return value end end)(); if active(value) then return (((s).worldTime - (r).time) < 9) else return value end end)()
        end) else return value end end)()
      end); if active(value) then return value else return (function() local value = (function() local value = (not active((c).carriedBy)); if active(value) then return ((c).low > ((s).waterHeight + .5)) else return value end end)(); if active(value) then return (hypot((c).vx, (c).vz) < 0.2) else return value end end)() end end)()
    end);
    if active(cargo) then
      (m).job = (cargo).id;
      go("align_pick");
    end
  end
  if (active(includes({"align_pick", "pickup"}, (m).phase)) and active(box)) then
    aim(at((box).centerOfMass, 0), at((box).centerOfMass, 2));
    local centered = (hypot((at((box).centerOfMass, 0) - at(tip, 0)), (at((box).centerOfMass, 2) - at(tip, 2))) < 0.4);
    if (((((m).phase == "pickup") and (not active((grip).attached))) and (not active(centered))) and (hypot((at((box).centerOfMass, 0) - at(tip, 0)), (at((box).centerOfMass, 2) - at(tip, 2))) > 0.65)) then
      go("align_pick");
    end
    if ((m).phase == "align_pick") then
      (m).still = (((active(centered) and (travel < 0.08)) and (liftRate < 0.08)) and ((m).still + (s).dt) or 0);
      if ((m).still > 0.3) then
        go("pickup");
      end
    else
      lower = math.max(0, math.min(capacity, (travel + clamp((at(tip, 1) - ((box).high + 0.6)), 0.2))));
      power = (function() local value = centered; if active(value) then return ((at(tip, 1) - (box).high) < 1.1) else return value end end)();
    end
    if (active((grip).attached) and ((grip).creature == (m).job)) then
      (m).reach = at((s).angles, (extension).i);
      (m).pick = yaw;
      go("lift");
    end
  end
  if (((((m).phase == "pickup") and (not active((grip).attached))) and ((t - (m).at) > 4)) and (((t - (m).at) > 30) or active(some(parts, function(b)
    if (at((s).supportForce, (b).i) < ((head).force * 0.5)) then
      do return false end
    end
    do
      local i = (b).i;
      while (i >= 0) do
        do
          if (i == (at(rams, 0)).i) then
            do return true end
          end
        end
        ::continue_1::
        i = (at(parts, i)).parent;
      end
    end
    do return false end
  end)))) then
    go("return");
  end
  if ((m).phase == "lift") then
    yaw = (m).pick;
    power = true;
    if (((travel < 0.08) and (liftRate < 0.08)) and ((grip).cargoSupportForce < 1)) then
      go("swing");
    end
  end
  if (active(includes({"swing", "settle", "lower"}, (m).phase)) and active(box)) then
    power = true;
    yaw = math.atan((-((pad).z - (s).z)), ((pad).x - (s).x));
    local distance = hypot(((pad).x - (s).x), ((pad).z - (s).z));
    reach = math.max(0, math.min((extension).travel, (math.sqrt(math.max(0, ((distance * distance) - (at(local_, 1) * at(local_, 1))))) - math.abs(((head).x - (at(parts, 0)).x)))));
    local margin = math.max(0.3, (((pad).radius - 0.75) - hypot(((box).x - at((box).centerOfMass, 0)), ((box).z - at((box).centerOfMass, 2)))));
    local centered = (hypot((at((box).centerOfMass, 0) - (pad).x), (at((box).centerOfMass, 2) - (pad).z)) < margin);
    if (((((m).phase == "swing") and active(centered)) and (math.abs(at((s).rates, (bearing).i)) < 0.08)) and ((t - (m).at) > 12)) then
      go("settle");
    end
    if ((m).phase == "settle") then
      (m).still = ((active(centered) and (hypot((box).vx, (box).vz) < 0.35)) and ((m).still + (s).dt) or 0);
      if ((m).still > 0.5) then
        go("lower");
      end
    end
    if ((m).phase == "lower") then
      lower = capacity;
      (m).still = ((((grip).cargoSupportForce > (((box).mass * hypot(table.unpack((s).gravity))) * 0.7)) and (hypot((box).vx, (box).vy, (box).vz) < 0.25)) and ((m).still + (s).dt) or 0);
      if ((m).still > 0.5) then
        (m).drop = travel;
        (m).dropYaw = yaw;
        (m).reach = reach;
        (m).jobs = (m).jobs + 1;
        go("release");
      end
    end
  end
  if ((m).phase == "release") then
    lower = (m).drop;
    yaw = (m).dropYaw;
    (out).radio = {kind = "release", cargo = (m).job};
    if ((t - (m).at) > 2) then
      go("return");
    end
  end
  if ((m).phase == "return") then
    yaw = (function() local value = (m).dropYaw; if value ~= nil then return value else return yaw end end)();
    if ((travel < 0.08) and ((t - (m).at) > 2)) then
      go("seek");
    end
  end
  local wanted = clamp(((1.2 * wrap(((yaw - baseYaw) - at((s).angles, (bearing).i)))) - (0.5 * at((s).rates, (bearing).i))), ((bearing).speed * 0.2));
  (m).turn = ((function() local value = (m).turn; if active(value) then return value else return 0 end end)() + clamp((wanted - (function() local value = (m).turn; if active(value) then return value else return 0 end end)()), (0.25 * (s).dt)));
  set(bearing, ((m).turn / (bearing).speed));
  local remaining = lower;
  for _, b in ipairs(rams) do
    do
      do
        servo(b, math.min((b).travel, math.max(0, remaining)));
        remaining = (remaining - (b).travel);
      end
    end
    ::continue_2::
  end
  servo(extension, reach);
  set(head, (active(power) and 1 or (-1)));
  do return out end
end
