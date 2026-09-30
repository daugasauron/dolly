return function(t, s, m, r)
  local cl = function(v, a)
    return math.max((-a), math.min(a, v))
  end;
  if ((m).goal == nil) then
    (m).goal = 0;
    (m).pitch = (-0.24);
    (m).next = 0;
    (m).tracked = {};
  end
  local origin = at((s).positions, 14);
  local bearing = function(p)
    return math.atan(((p).x - at(origin, 0)), ((p).z - at(origin, 2)))
  end;
  local range = function(p)
    return hypot(((p).x - at(origin, 0)), ((p).z - at(origin, 2)))
  end;
  local targets = filter((s).nearby, function(p)
    return (function() local value = (function() local value = (function() local value = (not active((p).anchored)); if active(value) then return (not active((p).cargo)) else return value end end)(); if active(value) then return ((p).y > 0) else return value end end)(); if active(value) then return (math.abs(bearing(p)) < 1.15) else return value end end)()
  end);
  local current = find(targets, function(p)
    return ((p).id == (m).target)
  end);
  local closest = at(targets, 0);
  local p = (function() if (active(current) and ((not active(closest)) or (range(current) < (range(closest) * 1.35)))) then return current else return closest end end)();
  local yaw = nil;
  local pitch = nil;
  if active(p) then
    if ((m).target ~= (p).id) then
      (m).target = (p).id;
      (m).acquired = t;
    end
    yaw = bearing(p);
    pitch = cl((-math.atan(((p).y - at(origin, 1)), range(p))), 0.55);
    if (not active(includes((m).tracked, (p).id))) then
      append((m).tracked, (p).id);
    end
  else
    (m).target = 0;
    if (t >= (m).next) then
      (m).goal = ((r() - 0.5) * 2.2);
      (m).pitch = ((-0.4) + (0.4 * r()));
      (m).next = ((t + 8) + (10 * r()));
    end
    yaw = (m).goal;
    pitch = (m).pitch;
  end
  local a = cl(((2 * (yaw - at((s).angles, 14))) - (0.25 * at((s).rates, 14))), 0.65);
  local b = cl(((2 * (pitch - at((s).angles, 15))) - (0.25 * at((s).rates, 15))), 0.5);
  do return {[index(((a >= 0) and "A" or "Q"))] = math.abs(a), [index(((b >= 0) and "S" or "W"))] = math.abs(b)} end
end
