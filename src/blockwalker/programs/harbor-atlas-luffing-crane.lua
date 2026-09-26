return function(t, s, m, r)
  local clamp = function(x, a)
    return math.max((-a), math.min(a, x))
  end;
  local out = {};
  if (not active((m).phase)) then
    (m).phase = "seek";
    (m).at = t;
    (m).yaw = 0;
    (m).jobs = 0;
  end
  local go = function(p)
    (m).phase = p;
    (m).at = t;
  end;
  local servo = function(i, goal, neg, pos, speed)
    local u = clamp((((2.2 * (goal - at((s).angles, i))) - (0.2 * at((s).rates, i))) / speed), 1);
    (out)[index((function() if (u < 0) then return neg else return pos end end)())] = math.abs(u);
  end;
  local yaw = (m).yaw;
  local travel = 0;
  local luff = 0;
  local attached = (at((s).magnets, 30)).attached;
  if ((m).phase == "seek") then
    (out).F = 1;
    yaw = ((-1.15) + (0.2 * math.sin((t * 0.13))));
    local jobs = filter((s).nearby, function(p)
      return (function() local value = (function() local value = (function() local value = (function() local value = (p).cargo; if active(value) then return (not active((p).delivered)) else return value end end)(); if active(value) then return (not active((p).carriedBy)) else return value end end)(); if active(value) then return ((p).z > ((s).z + 4.5)) else return value end end)(); if active(value) then return (math.abs((hypot(((p).x - (s).x), ((p).z - (s).z)) - 6)) < 0.5) else return value end end)()
    end);
    if active(#(jobs)) then
      local p = at(jobs, 0);
      (m).yaw = math.atan((-((p).z - (s).z)), ((p).x - (s).x));
      (m).job = (p).id;
      go("align");
    end
  end
  if ((m).phase == "align") then
    yaw = (m).yaw;
    (out).F = 1;
    if ((math.abs((at((s).angles, 13) - yaw)) < 0.035) and (math.abs(at((s).rates, 13)) < 0.08)) then
      go("pickup");
    end
  end
  if ((m).phase == "pickup") then
    local box = find((s).nearby, function(p)
      return ((p).id == (m).job)
    end);
    local tip = at((s).positions, 30);
    if active(box) then
      local aim = math.atan((-((box).z - (s).z)), ((box).x - (s).x));
      local actual = math.atan((-(at(tip, 2) - (s).z)), (at(tip, 0) - (s).x));
      (m).yaw = (at((s).angles, 13) + math.atan(math.sin((aim - actual)), math.cos((aim - actual))));
    end
    yaw = (m).yaw;
    travel = 2.4;
    (out).G = 1;
    if active(attached) then
      (m).drop = at({0, 0.18, (-0.18)}, math.fmod((m).jobs, 3));
      (m).jobs = (m).jobs + 1;
      go("lift");
    else
      if ((t - (m).at) > 16) then
        go("seek");
      end
    end
  end
  if ((m).phase == "lift") then
    yaw = (m).yaw;
    luff = 0.16;
    (out).G = 1;
    if (not active(attached)) then
      go("seek");
    else
      if (((at((s).angles, 20) < 0.08) and (at((s).angles, 14) > 0.14)) and (math.abs(at((s).rates, 14)) < 0.04)) then
        go("carry");
      end
    end
  end
  if ((m).phase == "carry") then
    yaw = (m).drop;
    luff = 0.16;
    (out).G = 1;
    if (not active(attached)) then
      go("seek");
    else
      if ((math.abs((at((s).angles, 13) - (m).drop)) < 0.035) and (math.abs(at((s).rates, 13)) < 0.08)) then
        go("lower");
      end
    end
  end
  if ((m).phase == "lower") then
    yaw = (m).drop;
    (out).G = 1;
    local a = at((s).magnets, 30);
    local supported = ((a).targetSupportForce > (((a).targetMass * hypot(table.unpack((s).gravity))) * 0.5));
    luff = math.max((-0.08), (at((s).angles, 14) - (active(supported) and 0 or 0.015)));
    (m).lower = luff;
    (m).settled = (((active((s).contactsReady) and active(supported)) and (math.abs(at((s).rates, 14)) < 0.035)) and ((function() local value = (m).settled; if active(value) then return value else return 0 end end)() + (s).dt) or 0);
    if ((m).settled > 0.4) then
      (m).settled = 0;
      go("release");
    end
  end
  if ((m).phase == "release") then
    yaw = (m).drop;
    luff = (m).lower;
    (out).F = 1;
    if ((t - (m).at) > 2) then
      go("return");
    end
  end
  if ((m).phase == "return") then
    yaw = (m).drop;
    (out).F = 1;
    if (at((s).angles, 20) < 0.08) then
      go("seek");
    end
  end
  (m).deliveries = (s).cargoDelivered;
  servo(13, yaw, "Q", "A", 0.5);
  servo(14, luff, "W", "S", 0.5);
  servo(20, travel, "E", "D", 0.75);
  do return out end
end
