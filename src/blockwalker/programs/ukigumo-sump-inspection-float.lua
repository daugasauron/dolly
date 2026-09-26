return function(t, s, m, r)
  local cl = function(v, a)
    return math.max((-a), math.min(a, v))
  end;
  local wrap = function(v)
    return math.atan(math.sin(v), math.cos(v))
  end;
  local q = (s).rotation;
  local yaw = math.atan((2 * ((at(q, 0) * at(q, 2)) + (at(q, 1) * at(q, 3)))), (1 - (2 * ((at(q, 0) * at(q, 0)) + (at(q, 1) * at(q, 1))))));
  if (not active((m).goal)) then
    (m).goal = {(-60), (-69)};
    (m).visits = 0;
    (m).wait = 0;
  end
  local distance = hypot(((s).x - at((m).goal, 0)), ((s).z - at((m).goal, 1)));
  if (((distance < 0.6) and (hypot((s).vx, (s).vz) < 0.25)) and (t > (m).wait)) then
    (m).visits = (m).visits + 1;
    (m).goal = {((-60) + ((r() - 0.5) * 1.5)), (active(math.fmod((m).visits, 2)) and (-74) or (-68))};
    (m).wait = (t + 3);
  end
  local error = wrap((math.atan((at((m).goal, 0) - (s).x), (at((m).goal, 1) - (s).z)) - yaw));
  local speed = ((t < (m).wait) and 0 or (math.min(0.5, (0.4 * distance)) * math.max(0, math.cos(error))));
  local drive = cl(((0.16 * speed) + (0.35 * (speed - at((s).localVelocity, 2)))), 0.3);
  local turn = cl(((0.35 * error) - (0.55 * at((s).gyroscope, 1))), 0.25);
  local l = cl((drive + turn), 0.5);
  local rr = cl((drive - turn), 0.5);
  do return {E = math.max(0, (-l)), R = math.max(0, l), D = math.max(0, (-rr)), T = math.max(0, rr)} end
end
