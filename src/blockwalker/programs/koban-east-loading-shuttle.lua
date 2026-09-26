return function(t, s, m)
  local p = map((s).blueprint, function(b, i)
    return merge({}, b, {i = i})
  end);
  local rails = filter(p, function(b)
    return (function() local value = ((b).joint == 2); if active(value) then return ((b).axis == 0) else return value end end)()
  end);
  local cross = find(p, function(b)
    return (function() local value = ((b).joint == 2); if active(value) then return ((b).axis == 2) else return value end end)()
  end);
  local lift = find(p, function(b)
    return (function() local value = ((b).joint == 2); if active(value) then return ((b).axis == 1) else return value end end)()
  end);
  local head = find(p, function(b)
    return ((b).joint == 5)
  end);
  local grip = at((s).magnets, (head).i);
  local tip = at((s).positions, (head).i);
  local out = {};
  local clamp = function(v, a)
    if a == nil then a = 1 end
    return math.max((-a), math.min(a, v))
  end;
  local set = function(b, u)
    u = clamp(u);
    (out)[index(string.char((b).negative))] = math.max(0, (-u));
    (out)[index(string.char((b).positive))] = math.max(0, u);
  end;
  local phase = function(name)
    (m).phase = name;
    (m).at = t;
    (m).still = 0;
  end;
  local extension = reduce(rails, function(v, b)
    return (v + at((s).angles, (b).i))
  end, 0);
  local home = {(at(tip, 0) + extension), (at(tip, 1) - at((s).angles, (lift).i)), (at(tip, 2) + at((s).angles, (cross).i))};
  local travel = reduce(rails, function(v, b)
    return (v + (b).travel)
  end, 0);
  if (not active((m).phase)) then
    local station = at(sort(filter((s).nearby, function(b)
      return (function() local value = (b).anchored; if active(value) then return ((b).team == (s).team) else return value end end)()
    end), function(a, b)
      return (hypot(((a).x - (s).x), ((a).z - (s).z)) - hypot(((b).x - (s).x), ((b).z - (s).z)))
    end), 0);
    if (not active(station)) then
      do return {} end
    end
    (m).station = (station).id;
    (m).dock = {((station).x + 3), ((station).y + 2), (station).z};
    (m).jobs = 0;
    (m).readyAt = (-1);
    phase("idle");
  end
  local box = find((s).nearby, function(b)
    return ((b).id == (m).job)
  end);
  local target = {at(home, 0), (at(home, 1) + 1), at(home, 2)};
  local power = false;
  if ((m).phase == "idle") then
    local request = find((s).radio, function(r)
      return (function() local value = (function() local value = (function() local value = ((r).from == (m).station); if active(value) then return ((r).kind == "ready") else return value end end)(); if active(value) then return ((r).time > (m).readyAt) else return value end end)(); if active(value) then return (((s).worldTime - (r).time) < 5) else return value end end)()
    end);
    local available = function(b)
      return (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (b).cargo; if active(value) then return (not active((b).carriedBy)) else return value end end)(); if active(value) then return ((b).mass < 1.5) else return value end end)(); if active(value) then return (not active(some((s).radio, function(r)
        return (function() local value = (function() local value = (function() local value = ((r).kind == "claim"); if active(value) then return ((r).cargo == (b).id) else return value end end)(); if active(value) then return ((r).from ~= (s).id) else return value end end)(); if active(value) then return (((s).worldTime - (r).time) < 10) else return value end end)()
      end))) else return value end end)(); if active(value) then return (((b).x + 1) <= (at(home, 0) + 0.2)) else return value end end)(); if active(value) then return (((b).x + 1) >= (at(home, 0) - travel)) else return value end end)(); if active(value) then return ((b).z <= (at(home, 2) + 0.2)) else return value end end)(); if active(value) then return ((b).z >= ((at(home, 2) - (cross).travel) - 0.2)) else return value end end)()
    end;
    local cargo = (function() local value = request; if active(value) then return (function() local value = find((s).nearby, function(b)
      return (function() local value = ((b).id == (request).cargo); if active(value) then return available(b) else return value end end)()
    end); if active(value) then return value else return at(sort(filter((s).nearby, available), function(a, b)
      return (hypot(((a).x - at(tip, 0)), ((a).z - at(tip, 2))) - hypot(((b).x - at(tip, 0)), ((b).z - at(tip, 2))))
    end), 0) end end)() else return value end end)();
    if active(cargo) then
      (m).job = (cargo).id;
      phase("align");
    end
  end
  if ((m).phase == "align") then
    if (not active(box)) then
      phase("idle");
    else
      target = {((box).x + 1.04), (at(home, 1) + 2), at(home, 2)};
      if ((math.abs((at(tip, 0) - at(target, 0))) < 0.08) and (at((s).angles, (cross).i) < 0.05)) then
        phase("pickup");
      end
    end
  end
  if ((m).phase == "pickup") then
    if ((not active(box)) or (active((box).carriedBy) and ((box).carriedBy ~= (s).id))) then
      phase("idle");
    else
      target = {(at((box).centerOfMass, 0) + 1.04), at(home, 1), at((box).centerOfMass, 2)};
      power = (function() local value = (grip).attached; if active(value) then return value else return (function() local value = (hypot((at(tip, 0) - at(target, 0)), (at(tip, 2) - at(target, 2))) < 0.3); if active(value) then return ((at(tip, 1) - (box).y) < 1.1) else return value end end)() end end)();
      if (active((grip).attached) and ((grip).creature == (m).job)) then
        phase("raise");
      else
        if active((grip).attached) then
          power = false;
        end
      end
    end
  end
  if ((m).phase == "raise") then
    power = true;
    target = {at(tip, 0), (at(home, 1) + 2), at(tip, 2)};
    if ((active(box) and ((box).y > ((s).ground + 2))) and (math.abs(at((s).rates, (lift).i)) < 0.08)) then
      phase("aisle");
    end
  end
  if ((m).phase == "aisle") then
    power = true;
    target = {at(tip, 0), (at(home, 1) + 2), at(home, 2)};
    if (at((s).angles, (cross).i) < 0.05) then
      phase("deliver");
    end
  end
  if active(includes({"deliver", "handoff"}, (m).phase)) then
    power = true;
    target = {(at((m).dock, 0) + 1), (at(home, 1) + 2), at((m).dock, 2)};
    if active(box) then
      (target)[index(0)] = (at(tip, 0) + clamp((at((m).dock, 0) - at((box).centerOfMass, 0)), 0.3));
      (target)[index(2)] = (at(tip, 2) + clamp((at((m).dock, 2) - at((box).centerOfMass, 2)), 0.3));
      if (((m).phase == "deliver") and (hypot(((box).x - at((m).dock, 0)), ((box).z - at((m).dock, 2))) < 0.15)) then
        phase("handoff");
      end
      if ((m).phase == "handoff") then
        (target)[index(1)] = (at(tip, 1) + clamp((at((m).dock, 1) - at((box).centerOfMass, 1)), 0.15));
        (m).still = ((hypot(((box).x - at((m).dock, 0)), ((box).y - at((m).dock, 1)), ((box).z - at((m).dock, 2))) < 0.18) and ((m).still + (s).dt) or 0);
        if ((m).still > 0.5) then
          (m).release = concat(tip);
          phase("release");
        end
      end
    end
    if active(some((s).radio, function(r)
      return (function() local value = (function() local value = (function() local value = ((r).from == (m).station); if active(value) then return ((r).kind == "claim") else return value end end)(); if active(value) then return ((r).cargo == (m).job) else return value end end)(); if active(value) then return (((s).worldTime - (r).time) < 3) else return value end end)()
    end)) then
      (m).release = concat(tip);
      phase("release");
    end
  end
  if ((m).phase == "release") then
    target = (m).release;
    if ((t - (m).at) > 1) then
      (m).jobs = (m).jobs + 1;
      phase("clear");
    end
  end
  if ((m).phase == "clear") then
    target = {(function() if (at((s).angles, (cross).i) > 0.05) then return at(tip, 0) else return at(home, 0) end end)(), (at(home, 1) + 2), at(home, 2)};
    if ((extension < 0.05) and (at((s).angles, (cross).i) < 0.05)) then
      (m).readyAt = (s).worldTime;
      (out).radio = {kind = "ready", cargo = (m).job};
      phase("idle");
    end
  end
  if (active(includes({"raise", "aisle", "deliver", "handoff"}, (m).phase)) and (not active((grip).attached))) then
    phase("clear");
  end
  local reach = math.max(0, (at(home, 0) - at(target, 0)));
  for _, b in ipairs(rails) do
    do
      do
        local wanted = math.min((b).travel, reach);
        set(b, clamp((((1.5 * (wanted - at((s).angles, (b).i))) - (0.3 * at((s).rates, (b).i))) / (b).speed)));
        reach = (reach - wanted);
      end
    end
    ::continue_1::
  end
  set(cross, clamp((((1.5 * (math.max(0, math.min((cross).travel, (at(home, 2) - at(target, 2)))) - at((s).angles, (cross).i))) - (0.3 * at((s).rates, (cross).i))) / (cross).speed)));
  set(lift, clamp((((1.5 * (math.max(0, math.min((lift).travel, (at(target, 1) - at(home, 1)))) - at((s).angles, (lift).i))) - (0.3 * at((s).rates, (lift).i))) / (lift).speed)));
  set(head, (active(power) and 1 or (-1)));
  do return out end
end
