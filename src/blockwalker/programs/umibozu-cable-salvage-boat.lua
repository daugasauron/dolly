return function(t, s, m, r)
  local clamp = function(v, a)
    return math.max((-a), math.min(a, v))
  end;
  local wrap = function(a)
    return math.atan(math.sin(a), math.cos(a))
  end;
  local out = {};
  local q = (s).rotation;
  local yaw = math.atan((2 * ((at(q, 0) * at(q, 2)) + (at(q, 1) * at(q, 3)))), (1 - (2 * ((at(q, 0) * at(q, 0)) + (at(q, 1) * at(q, 1))))));
  local winch = findIndex((s).blueprint, function(b)
    return ((b).joint == 8)
  end);
  local magnet = findIndex((s).blueprint, function(b)
    return ((b).joint == 5)
  end);
  local rotor = findIndex((s).blueprint, function(b)
    return ((b).joint == 7)
  end);
  local state = at((s).magnets, magnet);
  local tip = at((s).positions, magnet);
  local drive = function(i, u)
    local b = at((s).blueprint, i);
    local key = (function() if (u < 0) then return (b).negative else return (b).positive end end)();
    if active(key) then
      (out)[index(string.char(key))] = math.abs(u);
    end
  end;
  local go = function(p)
    (m).phase = p;
    (m).at = t;
    (m).settle = 0;
    if (p == "approach") then
      (m).bestDistance = math.huge;
      (m).progressAt = t;
    end
  end;
  if (not active((m).phase)) then
    (m).phase = "settle";
    (m).at = t;
    (m).home = {(s).x, (s).z};
    (m).goal = (m).home;
    (m).job = 0;
    (m).pickups = 0;
    (m).handoffs = 0;
    (m).failures = 0;
  end
  (m).failed = (function() local value = (m).failed; if active(value) then return value else return {} end end)();
  local hull = filter((s).positions, function(p, i)
    return (function() local value = (not active(includes({5, 8}, (at((s).blueprint, i)).joint))); if active(value) then return (at(p, 1) < ((s).waterHeight + 1)) else return value end end)()
  end);
  local halfX = math.max(1, table.unpack(map(hull, function(p)
    return (math.abs((at(p, 0) - (s).x)) + 0.6)
  end)));
  local halfZ = math.max(1, table.unpack(map(hull, function(p)
    return (math.abs((at(p, 2) - (s).z)) + 0.6)
  end)));
  local shore = filter((s).terrain, function(b)
    return (function() local value = ((b).high > ((s).waterHeight - 1)); if active(value) then return ((b).low < ((s).waterHeight + 1)) else return value end end)()
  end);
  local traffic = filter((s).nearby, function(b)
    return (function() local value = (function() local value = (not active((b).cargo)); if active(value) then return ((b).low < ((s).waterHeight + 0.8)) else return value end end)(); if active(value) then return ((b).high > ((s).waterHeight - 1.5)) else return value end end)()
  end);
  local overlap = function(x, z, includeTraffic)
    if includeTraffic == nil then includeTraffic = true end
    local sum = 0;
    for _, b in ipairs(shore) do
      do
        do
          local dx = (((b).halfX + halfX) - math.abs((x - (b).x)));
          local dz = (((b).halfZ + halfZ) - math.abs((z - (b).z)));
          if ((dx > 0) and (dz > 0)) then
            sum = (sum + (math.min(dx, dz) ^ 2));
          end
        end
      end
      ::continue_1::
    end
    if active(includeTraffic) then
      for _, b in ipairs(traffic) do
        do
          do
            local d = ((((b).radius + hypot(halfX, halfZ)) + 0.8) - hypot((x - (b).x), (z - (b).z)));
            if (d > 0) then
              sum = (sum + (d * d));
            end
          end
        end
        ::continue_2::
      end
    end
    do return sum end
  end;
  local stow = 1.8;
  local cargo = find((s).nearby, function(c)
    return ((c).id == (m).job)
  end);
  local goal = (m).goal;
  local angle = 0;
  local reel = 0;
  local power = false;
  if (((m).phase == "settle") and (t > 10)) then
    go("search");
  end
  if ((m).phase == "search") then
    (m).job = 0;
    local patrol = {(m).home, {at((m).home, 0), (at((m).home, 1) + 50)}, {at((m).home, 0), (at((m).home, 1) + 95)}};
    (m).route = (function() local value = (m).route; if active(value) then return value else return 0 end end)();
    goal = at(patrol, (m).route);
    if (hypot((at(goal, 0) - (s).x), (at(goal, 1) - (s).z)) < 1) then
      (m).route = math.fmod(((m).route + 1), #(patrol));
    end
    local jobs = filter((s).nearby, function(c)
      return (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (c).cargo; if active(value) then return (not active((c).delivered)) else return value end end)(); if active(value) then return (not active((c).carriedBy)) else return value end end)(); if active(value) then return ((c).mass < 1.5) else return value end end)(); if active(value) then return ((c).y < ((s).waterHeight - 0.5)) else return value end end)(); if active(value) then return (t > (function() local value = at((m).failed, (c).id); if active(value) then return value else return 0 end end)()) else return value end end)()
    end);
    sort(jobs, function(a, b)
      return (hypot(((a).x - (s).x), ((a).z - (s).z)) - hypot(((b).x - (s).x), ((b).z - (s).z)))
    end);
    if active(#(jobs)) then
      cargo = at(jobs, 0);
      (m).job = (cargo).id;
      go("aim");
    else
      angle = ((-math.pi) / 2);
    end
  end
  if ((m).phase == "aim") then
    goal = {(s).x, (s).z};
    if (((not active(cargo)) or active((cargo).delivered)) or (active((cargo).carriedBy) and ((cargo).carriedBy ~= (s).id))) then
      (m).failures = (m).failures + 1;
      go("raise");
    else
      if (((math.abs(at((s).angles, rotor)) < 0.04) and (math.abs(at((s).rates, rotor)) < 0.05)) and (hypot((s).vx, (s).vz) < 0.1)) then
        go("approach");
      end
    end
  end
  if (((m).phase == "approach") or ((m).phase == "lower")) then
    if ((((not active(cargo)) or active((cargo).delivered)) or (active((cargo).carriedBy) and ((cargo).carriedBy ~= (s).id))) or (((m).progressAt ~= nil) and ((t - (m).progressAt) > 120))) then
      (m).failures = (m).failures + 1;
      ((m).failed)[index((m).job)] = (t + 60);
      go("raise");
    else
      local anchor = at((s).positions, (at((s).blueprint, winch)).parent);
      goal = {(((s).x + (cargo).x) - at(anchor, 0)), (((s).z + (cargo).z) - at(anchor, 2))};
      if (overlap(at(goal, 0), at(goal, 1), false) > 0) then
        ((m).failed)[index((m).job)] = (t + 60);
        (m).failures = (m).failures + 1;
        goal = {(s).x, (s).z};
        go("raise");
      end
      local error = hypot(((cargo).x - at(tip, 0)), ((cargo).z - at(tip, 2)));
      if (((m).bestDistance == nil) or (error < ((m).bestDistance - 0.4))) then
        (m).bestDistance = error;
        (m).progressAt = t;
      end
      (m).settle = (((error < 0.3) and (hypot((s).vx, (s).vz) < 0.08)) and ((m).settle + (s).dt) or 0);
      if (((m).phase == "approach") and ((m).settle > 0.6)) then
        go("lower");
      end
      if ((m).phase == "lower") then
        power = true;
        reel = ((error < 0.5) and 1 or 0);
        if (active((state).attached) and ((state).creature == (m).job)) then
          (m).pickups = (m).pickups + 1;
          go("hoist");
        end
      end
    end
  end
  if (((m).phase == "hoist") or ((m).phase == "raise")) then
    power = ((m).phase == "hoist");
    reel = (((at((s).winches, winch)).paidOut > (stow + 0.03)) and (-1) or 0);
    if (((m).phase == "hoist") and (not active((state).attached))) then
      (m).failures = (m).failures + 1;
      go("raise");
    end
    if (((at((s).winches, winch)).paidOut < (stow + 0.06)) and (math.abs(at((s).rates, winch)) < 0.08)) then
      go((active(power) and "fold" or "search"));
    end
  end
  if (active(includes({"fold", "sail", "unfold", "align", "land"}, (m).phase)) and (not active((state).attached))) then
    (m).failures = (m).failures + 1;
    go("raise");
  end
  if ((m).phase == "fold") then
    power = true;
    angle = ((-math.pi) / 2);
    if ((math.abs((at((s).angles, rotor) - angle)) < 0.04) and (math.abs(at((s).rates, rotor)) < 0.05)) then
      go("sail");
    end
  end
  if ((m).phase == "sail") then
    power = true;
    angle = ((-math.pi) / 2);
    goal = {106, (-26)};
    if (not active((state).attached)) then
      (m).failures = (m).failures + 1;
      go("raise");
    else
      if ((hypot(((s).x - at(goal, 0)), ((s).z - at(goal, 1))) < 0.2) and (hypot((s).vx, (s).vz) < 0.08)) then
        go("unfold");
      end
    end
  end
  if ((m).phase == "unfold") then
    power = true;
    angle = 0;
    goal = {106, (-26)};
    if ((math.abs(at((s).angles, rotor)) < 0.035) and (math.abs(at((s).rates, rotor)) < 0.05)) then
      go("align");
    end
  end
  if (((m).phase == "align") or ((m).phase == "land")) then
    power = true;
    goal = {math.max(104.8, (((s).x + 98.3) - (cargo).x)), (((s).z - 26) - (cargo).z)};
    local aligned = (hypot(((cargo).x - 98.3), ((cargo).z + 26)) < 0.5);
    local supported = (function() local value = (s).contactsReady; if active(value) then return ((state).cargoSupportForce > (((state).targetMass * hypot(table.unpack((s).gravity))) * 0.6)) else return value end end)();
    if ((m).phase == "align") then
      reel = (((at((s).winches, winch)).paidOut > (stow + 0.03)) and (-1) or 0);
      (m).settle = ((active(aligned) and (hypot((s).vx, (s).vz) < 0.08)) and ((m).settle + (s).dt) or 0);
      if ((m).settle > 0.8) then
        go("land");
      end
    else
      reel = (active(supported) and 0 or (active(aligned) and 1 or (-1)));
      (m).settle = (active(supported) and ((m).settle + (s).dt) or 0);
      if ((m).settle > 0.6) then
        (m).handoffs = (m).handoffs + 1;
        (m).readyCargo = (m).job;
        (m).readyUntil = (t + 10);
        go("release");
      else
        if (((at((s).winches, winch)).paidOut > 11.5) or ((t - (m).at) > 45)) then
          go("align");
        end
      end
    end
  end
  if ((m).phase == "release") then
    if ((t - (m).at) > 2) then
      (m).job = 0;
      go("raise");
    end
  end
  if ((at((s).winches, winch)).paidOut < (stow - 0.02)) then
    reel = 1;
  end
  if (((m).slewTarget ~= angle) or ((s).up < 0.9)) then
    (m).slewTarget = angle;
    (m).slewHold = at((s).angles, rotor);
    (m).slewReady = false;
    (m).braking = 0;
  end
  if (not active((m).slewReady)) then
    (m).braking = ((((hypot((s).vx, (s).vz) < 0.1) and ((s).up > 0.98)) and (hypot(at((s).gyroscope, 0), at((s).gyroscope, 2)) < 0.15)) and ((m).braking + (s).dt) or 0);
    if ((m).braking > 0.4) then
      (m).slewReady = true;
    end
  end
  local slew = (function() if active((m).slewReady) then return angle else return (m).slewHold end end)();
  drive(magnet, (active(power) and 1 or (-1)));
  drive(winch, reel);
  drive(rotor, clamp((((1.4 * wrap((slew - at((s).angles, rotor)))) - (0.45 * at((s).rates, rotor))) / 0.5), 0.25));
  local dx = (at(goal, 0) - (s).x);
  local dz = (at(goal, 1) - (s).z);
  local distance = hypot(dx, dz);
  local step = math.min(3, distance);
  local heading = math.atan(dx, dz);
  local before = overlap((s).x, (s).z);
  local options = {};
  for _, offset in ipairs({0, (-0.35), 0.35, (-0.7), 0.7, (-1.05), 1.05, (-1.57), 1.57}) do
    do
      do
        local x = ((s).x + (step * math.sin((heading + offset))));
        local z = ((s).z + (step * math.cos((heading + offset))));
        local cost = overlap(x, z);
        local mid = overlap((((s).x + x) / 2), (((s).z + z) / 2));
        if (((cost == 0) or (cost < (before - 0.05))) and ((mid == 0) or (mid < (before - 0.01)))) then
          append(options, {x = x, z = z, score = ((cost * 100) + hypot((at(goal, 0) - x), (at(goal, 1) - z)))});
        end
      end
    end
    ::continue_3::
  end
  sort(options, function(a, b)
    return ((a).score - (b).score)
  end);
  if active(#(options)) then
    dx = ((at(options, 0)).x - (s).x);
    dz = ((at(options, 0)).z - (s).z);
  else
    dx = (function() dz = 0;
    return dz end)();
  end
  if (((((at((s).winches, winch)).paidOut < (stow - 0.03)) or (not active((m).slewReady))) or (math.abs(wrap((angle - at((s).angles, rotor)))) > 0.08)) or (math.abs(at((s).rates, rotor)) > 0.08)) then
    dx = (function() dz = 0;
    return dz end)();
  end
  local x = ((math.cos(yaw) * dx) - (math.sin(yaw) * dz));
  local z = ((math.sin(yaw) * dx) + (math.cos(yaw) * dz));
  local speed = ((((m).phase == "sail") or ((m).phase == "search")) and 0.85 or 0.3);
  local wantX = clamp((0.35 * x), speed);
  local wantZ = clamp((0.35 * z), speed);
  local fx = ((s).mass * ((0.35 * wantX) + (0.9 * (wantX - at((s).localVelocity, 0)))));
  local fz = ((s).mass * ((0.35 * wantZ) + (0.9 * (wantZ - at((s).localVelocity, 2)))));
  local torque = clamp((((-90) * yaw) - (180 * at((s).gyroscope, 1))), 70);
  do
    local i = 0;
    while (i < #((s).blueprint)) do
      do
        do
          local b = at((s).blueprint, i);
          if ((b).joint ~= 3) then
            goto continue_4
          end
          local force = (((b).axis == 2) and ((fz / 2) - ((torque * (b).x) / 36)) or ((fx / 2) + ((torque * (b).z) / 16)));
          drive(i, math.max(0, clamp(((force * (-(b).direction)) / (b).force), 1)));
        end
      end
      ::continue_4::
      i = i + 1;
    end
  end
  if ((active((m).readyCargo) and (t < (m).readyUntil)) and (not active((state).attached))) then
    (out).radio = {kind = "ready", cargo = (m).readyCargo};
  else
    if (active((m).job) and ((m).phase ~= "release")) then
      (out).radio = {kind = "claim", cargo = (m).job};
    end
  end
  (m).goal = goal;
  (m).cable = (at((s).winches, winch)).paidOut;
  (m).cargo = (active(cargo) and {(cargo).x, (cargo).y, (cargo).z, (cargo).carriedBy} or nil);
  (m).yaw = yaw;
  (m).hook = tip;
  do return out end
end
