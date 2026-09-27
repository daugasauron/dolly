return function(t, s, m)
  local clamp = function(v, a)
    if a == nil then a = 1 end
    return math.max((-a), math.min(a, v))
  end;
  local wrap = function(v)
    return math.atan(math.sin(v), math.cos(v))
  end;
  local q = (s).rotation;
  local yaw = math.atan((2 * ((at(q, 0) * at(q, 2)) + (at(q, 1) * at(q, 3)))), (1 - (2 * ((at(q, 0) * at(q, 0)) + (at(q, 1) * at(q, 1))))));
  local parts = map((s).blueprint, function(b, i)
    return merge({}, b, {i = i})
  end);
  local wheels = filter(parts, function(b)
    return (function() local value = ((b).joint == 4); if active(value) then return ((b).axis == 0) else return value end end)()
  end);
  local hook = find(parts, function(b)
    return ((b).joint == 5)
  end);
  local ram = find(parts, function(b)
    return ((b).joint == 2)
  end);
  local grip = at((s).magnets, (hook).i);
  local out = {};
  local set = function(b, u)
    if active((b).negative) then
      (out)[index(string.char((b).negative))] = math.max(0, (-u));
    end
    if active((b).positive) then
      (out)[index(string.char((b).positive))] = math.max(0, u);
    end
  end;
  if (not active((m).home)) then
    (m).home = {(s).x, (s).z};
    (m).floor = (s).ground;
    (m).phase = "seek";
    (m).at = t;
    (m).trips = 0;
  end
  local phase = function(p)
    (m).phase = p;
    (m).at = t;
  end;
  local job = find((s).nearby, function(b)
    return ((b).id == (m).job)
  end);
  local speed = 0;
  local lift = 0.65;
  local power = false;
  local lane = at((m).home, 0);
  if ((m).phase == "seek") then
    local jobs = sort(filter((s).nearby, function(b)
      return (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (b).cargo; if active(value) then return (not active((b).delivered)) else return value end end)(); if active(value) then return (not active((b).carriedBy)) else return value end end)(); if active(value) then return ((b).mass < ((s).mass * 0.5)) else return value end end)(); if active(value) then return ((b).y > ((m).floor + 2)) else return value end end)(); if active(value) then return (math.abs(((b).x - at((m).home, 0))) < 5) else return value end end)(); if active(value) then return ((b).z < (at((m).home, 1) - 15)) else return value end end)()
    end), function(a, b)
      return (hypot(((a).x - (s).x), ((a).z - (s).z)) - hypot(((b).x - (s).x), ((b).z - (s).z)))
    end);
    if active(#(jobs)) then
      (m).job = (at(jobs, 0)).id;
      phase("climb");
    end
  end
  if ((m).phase == "climb") then
    if (active((grip).attached) and ((grip).creature == (m).job)) then
      power = true;
      phase("raise");
    else
      if (((not active(job)) or active((job).delivered)) or active((job).carriedBy)) then
        phase("seek");
      else
        speed = 0.7;
        if ((s).ground > ((job).y - 1.2)) then
          lift = 0;
          lane = (job).x;
          speed = clamp(((at(at((s).positions, (hook).i), 2) - (job).z) * 0.7), 0.5);
          power = (math.abs(wrap((math.pi - yaw))) < 0.2);
        end
        if (active((grip).attached) and ((grip).creature == (m).job)) then
          phase("raise");
        end
      end
    end
  end
  if ((m).phase == "raise") then
    power = true;
    if (at((s).angles, (ram).i) > 0.6) then
      phase("descend");
    end
  end
  if ((m).phase == "descend") then
    power = true;
    speed = (-math.min(0.6, math.max(0, (((at((m).home, 1) + 2) - (s).z) * 0.5))));
    if (not active((grip).attached)) then
      phase("seek");
    else
      if (((s).z > (at((m).home, 1) + 1.7)) and (hypot((s).vx, (s).vz) < 0.15)) then
        phase("lower");
      end
    end
  end
  if ((m).phase == "lower") then
    power = true;
    lift = 0;
    if ((at((s).angles, (ram).i) < 0.04) and ((grip).cargoSupportForce > 1)) then
      phase("release");
    end
  end
  if (((m).phase == "release") and ((t - (m).at) > 2)) then
    (m).trips = (m).trips + 1;
    phase("clear");
  end
  if ((m).phase == "clear") then
    speed = (-0.6);
    if ((not active(job)) or (hypot(((s).x - (job).x), ((s).z - (job).z)) > 11)) then
      phase("wait");
    end
  end
  if (((m).phase == "wait") and (not active(some((s).nearby, function(b)
    return (function() local value = (function() local value = (b).cargo; if active(value) then return (not active((b).carriedBy)) else return value end end)(); if active(value) then return (hypot(((b).x - at((m).home, 0)), ((b).z - at((m).home, 1))) < 4) else return value end end)()
  end)))) then
    phase("return");
  end
  if ((m).phase == "return") then
    speed = clamp((((s).z - at((m).home, 1)) * 0.5), 0.6);
    if (math.abs(((s).z - at((m).home, 1))) < 0.2) then
      phase("seek");
    end
  end
  local heading = (math.pi + clamp(((((s).x - lane) * sign(speed)) * 0.25), 0.3));
  local error = wrap((heading - yaw));
  speed = (speed * math.max(0, (1 - (math.abs(error) / 0.4))));
  local drive = clamp(((0.28 * speed) + (0.4 * (speed - at((s).localVelocity, 2)))), 0.8);
  local turn = clamp(((0.8 * error) - (0.35 * at((s).gyroscope, 1))), 0.6);
  for _, b in ipairs(wheels) do
    do
      set(b, clamp((drive - (turn * sign(((b).x - (at(parts, 0)).x))))));
    end
    ::continue_1::
  end
  set(ram, clamp(((2 * (lift - at((s).angles, (ram).i))) - (0.3 * at((s).rates, (ram).i)))));
  set(hook, (active(power) and 1 or (-1)));
  if (((active(includes({"clear", "wait"}, (m).phase)) and active(job)) and (not active((job).carriedBy))) and (not active((job).delivered))) then
    (out).radio = {kind = "release", cargo = (job).id};
  end
  do return out end
end
