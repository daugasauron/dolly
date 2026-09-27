return function(t, s, m)
  local p = map((s).blueprint, function(b, i)
    return merge({}, b, {i = i})
  end);
  local bearing = find(p, function(b)
    return (function() local value = ((b).joint == 7); if active(value) then return ((b).axis == 1) else return value end end)()
  end);
  local arm = find(p, function(b)
    return (function() local value = ((b).joint == 7); if active(value) then return ((b).axis == 0) else return value end end)()
  end);
  local dockLift = find(p, function(b)
    return ((b).joint == 2)
  end);
  local head = find(p, function(b)
    return ((b).joint == 5)
  end);
  local grip = at((s).magnets, (head).i);
  local out = {};
  local clamp = function(v, a)
    if a == nil then a = 1 end
    return math.max((-a), math.min(a, v))
  end;
  local wrap = function(v)
    return math.atan(math.sin(v), math.cos(v))
  end;
  local set = function(b, u)
    u = clamp(u);
    (out)[index(string.char((b).negative))] = math.max(0, (-u));
    (out)[index(string.char((b).positive))] = math.max(0, u);
  end;
  local phase = function(p)
    (m).phase = p;
    (m).at = t;
  end;
  if (not active((m).phase)) then
    (m).shots = 0;
    (m).loader = optional(at(sort(filter((s).nearby, function(b)
      if not b.anchored or b.team ~= s.team then return false end
      local axes = {}
      for _, part in ipairs(s.parts(b.id)) do if part.joint == 2 then axes[math.abs(part.axisY) > .8 and 1 or math.abs(part.axisX) > .8 and 0 or 2] = true end end
      return axes[0] and axes[1] and axes[2]
    end), function(a, b)
      return (hypot(((a).x - (s).x), ((a).z - (s).z)) - hypot(((b).x - (s).x), ((b).z - (s).z)))
    end), 0), "id");
    phase((active((m).loader) and "wait" or "load"));
  end
  local function in_combat(b)
    local zone = s.combat
    return not zone or math.abs(b.x-zone.x) <= zone.halfX and math.abs(b.z-zone.z) <= zone.halfZ
  end
  local target, priority
  for _, b in ipairs(s.nearby) do
    if b.team ~= 0 and b.team ~= s.team and not b.anchored and not b.cargo and not b.controllerStopped and b.visible ~= false
      and b.low > s.ground+5 and b.up > .25 and b.carriedBy == 0 and in_combat(b) then
      local score = -hypot(b.x-s.x, b.z-s.z)
      for _, cargo in ipairs(s.nearby) do
        if cargo.cargo and cargo.team == 0 and not cargo.delivered and cargo.carriedBy == b.id then score = score+120; break end
      end
      for _, report in ipairs(s.radio) do
        if report.kind == "threat" and report.target == b.id and s.worldTime-report.time < 15 then score = score+25; break end
      end
      if b.id == m.target then score = score+5 end
      if not priority or score > priority then target, priority = b, score end
    end
  end
  m.target = target and target.id or 0
  m.blockedBy = 0
  local function intersects(a, b, box, margin)
    local lo, hi = 0, 1
    for _, v in ipairs({{a[1],b[1]-a[1],box.x-box.halfX-margin,box.x+box.halfX+margin},
      {a[2],b[2]-a[2],box.low-margin,box.high+margin},
      {a[3],b[3]-a[3],box.z-box.halfZ-margin,box.z+box.halfZ+margin}}) do
      if math.abs(v[2]) < .00001 then
        if v[1] < v[3] or v[1] > v[4] then return false end
      else
        local x, y = (v[3]-v[1])/v[2], (v[4]-v[1])/v[2]
        lo, hi = math.max(lo,math.min(x,y)), math.min(hi,math.max(x,y))
        if lo > hi then return false end
      end
    end
    return true
  end
  local function safe_shot(ammo, flight, gravity)
    local obstacles = {}
    for _, b in ipairs(s.nearby) do
      if b.id ~= ammo.id and not b.cargo and (b.team == 0 or b.team == s.team) then
        for _, shape in ipairs(s.bounds(b.id)) do
          obstacles[#obstacles+1] = {shape=shape,id=b.id,vx=b.vx,vy=b.vy,vz=b.vz}
        end
      end
    end
    for _, shape in ipairs(s.terrain) do obstacles[#obstacles+1] = {shape=shape,id=-1,vx=0,vy=0,vz=0} end
    local margin = .8
    for _, part in ipairs(s.parts(ammo.id)) do margin = math.max(margin,hypot(part.x-ammo.x,part.y-ammo.y,part.z-ammo.z)+part.size*.7) end
    for _, obstacle in ipairs(obstacles) do
      local x = ammo.x+(ammo.vx-obstacle.vx)*flight
      local z = ammo.z+(ammo.vz-obstacle.vz)*flight
      local peak = math.max(0,math.min(flight,(ammo.vy-obstacle.vy)/gravity))
      local high = ammo.y+(ammo.vy-obstacle.vy)*peak-gravity*peak*peak/2
      local low = math.min(ammo.y,ammo.y+(ammo.vy-obstacle.vy)*flight-gravity*flight*flight/2)
      local shape = obstacle.shape
      if math.max(ammo.x,x)+margin >= shape.x-shape.halfX and math.min(ammo.x,x)-margin <= shape.x+shape.halfX
        and math.max(ammo.z,z)+margin >= shape.z-shape.halfZ and math.min(ammo.z,z)-margin <= shape.z+shape.halfZ
        and high+margin >= shape.low and low-margin <= shape.high then
      local function point(tau)
        return {ammo.x+(ammo.vx-obstacle.vx)*tau,
          ammo.y+(ammo.vy-obstacle.vy)*tau-gravity*tau*tau/2,
          ammo.z+(ammo.vz-obstacle.vz)*tau}
      end
      local previous = point(0)
      for tau = .1, flight+.1, .1 do
        local current = point(math.min(tau,flight))
        if intersects(previous,current,obstacle.shape,margin) then m.blockedBy=obstacle.id; return false end
        previous=current
      end
      end
    end
    return true
  end
  local box = (function() if active((grip).attached) then return find((s).nearby, function(b)
    return ((b).id == (grip).creature)
  end) else return nil end end)();
  local G = hypot(table.unpack((s).gravity));
  if active(target) then
    (m).target = (target).id;
  end
  local power = true;
  local rate = 0;
  local yaw = 0;
  local park = ((-math.pi) / 2);
  local reach = (hypot(((head).x - (arm).x), ((head).y - (arm).y), ((head).z - (arm).z)) + 1.5);
  local dock = {((s).x + (head).x), ((s).z + (arm).z)};
  local loader = find((s).nearby, function(b)
    return ((b).id == (m).loader)
  end);
  local clear = every(filter((s).nearby, function(b)
    return (function() local value = (function() local value = ((b).team == (s).team); if active(value) then return (not active((b).cargo)) else return value end end)(); if active(value) then return ((b).low < (at(at((s).positions, (arm).i), 1) + reach)) else return value end end)()
  end), function(b)
    return ((hypot(((b).x - (s).x), ((b).z - (s).z)) - (b).radius) > (hypot((arm).x, reach) + 0.5))
  end);
  if box and (not box.cargo or box.supply > 0 or box.mass >= 1.5 or box.team ~= 0 and box.team ~= s.team) then
    phase("return")
  end
  if ((m).phase == "wait") then
    power = false;
    park = math.pi;
    if (((math.abs(wrap((park - at((s).angles, (arm).i)))) < 0.08) and (math.abs(at((s).rates, (arm).i)) < 0.08)) and (math.abs(at((s).angles, (bearing).i)) < 0.04)) then
      m.reload = m.reload or {}
      local stock = at(sort(filter(s.nearby, function(b)
        local retry = m.reload[b.id]
        if not b.cargo or b.mass >= 1.5 or b.supply > 0 or b.carriedBy ~= 0
          or b.team ~= 0 and b.team ~= s.team or retry and t < retry.after then return false end
        for _, report in ipairs(s.radio) do
          if report.kind == "claim" and report.cargo == b.id and report.from ~= s.id
            and report.from ~= m.loader and s.worldTime-report.time < 10 then return false end
        end
        local loadingHeight = math.max(s.ground+2,s.positions[dockLift.i+1][2]+2)
        return b.y < loadingHeight
      end), function(a,b)
        local x,z = loader and loader.x or s.x,loader and loader.z or s.z
        return hypot(a.x-x,a.z-z)-hypot(b.x-x,b.z-z)
      end),0)
      if active(stock) then
        (out).radio = {kind = "ready", cargo = (stock).id};
      end
    end
    local ready = find(s.radio, function(report)
      if report.from ~= m.loader or report.kind ~= "ready" or report.time < s.worldTime-(t-m.at)
        or s.worldTime-report.time >= 120 then return false end
      for _, ammo in ipairs(s.nearby) do
        if ammo.id == report.cargo and ammo.cargo and ammo.mass < 1.5 and ammo.supply == 0
          and (ammo.team == 0 or ammo.team == s.team)
          and (ammo.carriedBy == 0 or ammo.carriedBy == m.loader or ammo.carriedBy == s.id)
          and hypot(ammo.x-dock[1],ammo.z-dock[2]) <= 3 then return true end
      end
      return false
    end)
    if active(ready) then
      out.radio = nil
      (m).ammo = (ready).cargo;
      phase("load");
    end
  end
  if ((m).phase == "load") then
    local ammo = find((s).nearby, function(b)
      return ((b).id == (m).ammo)
    end);
    local tip = at((s).positions, (head).i);
    power = (function() local value = active(optional(box, "cargo")); if active(value) then return value else return active((function() local value = (function() local value = ammo; if active(value) then return (math.abs(wrap((((-math.pi) / 2) - at((s).angles, (arm).i)))) < 0.08) else return value end end)(); if active(value) then return (hypot((at(tip, 0) - (ammo).x), ((at(tip, 1) - 1) - (ammo).y), (at(tip, 2) - (ammo).z)) < 0.35) else return value end end)()) end end)();
  end
  if m.phase == "load" and not box and t-m.at > 15 then
    if m.ammo then
      m.reload = m.reload or {}
      local retry = m.reload[m.ammo] or {attempts=0}
      retry.attempts = retry.attempts+1
      retry.after = t+(retry.attempts%3 == 0 and 90 or 8)
      m.reload[m.ammo] = retry
      m.misloads = (m.misloads or 0)+1
    end
    phase("return")
  end
  if (((m).phase == "load") and active(box)) then
    if ((not active((box).cargo)) or ((box).mass >= 1.5)) then
      power = false;
    else
      (out).radio = {kind = "claim", cargo = (box).id};
      if m.reload then m.reload[box.id] = nil end
      if active(clear) then
        phase((active(target) and "spin" or "hold"));
      end
    end
  end
  if ((m).phase == "spin") then
    if (not active(box)) then
      (m).lastLost = t;
      phase("return");
    else
      if ((not active(target)) or (not active(clear))) then
        phase("hold");
      else
        local radius = (hypot(((head).x - (arm).x), ((head).y - (arm).y), ((head).z - (arm).z)) + 1);
        local range = hypot(((target).x - (s).x), ((target).z - (s).z));
        local height = ((target).y - at(at((s).positions, (arm).i), 1));
        rate = math.min(((arm).speed * 0.7), math.sqrt(math.max(0, (((((head).force / (box).mass) - G) * 0.8) / radius))), math.max(2, ((1.8 * math.sqrt((G * (height + hypot(height, range))))) / radius)));
        yaw = (math.atan((((target).x + ((target).vx * 2)) - at(at((s).positions, (arm).i), 0)), (((target).z + ((target).vz * 2)) - at(at((s).positions, (arm).i), 2))) + (function() local value = (m).bias; if active(value) then return value else return 0 end end)());
        local best = math.huge;
        local flight = 0;
        do
          local tau = 0.15;
          while (tau < 7) do
            do
              do
                local dx = ((((box).x + ((box).vx * tau)) - at((target).centerOfMass, 0)) - ((target).vx * tau));
                local dy = (((((box).y + ((box).vy * tau)) - (((G * tau) * tau) / 2)) - at((target).centerOfMass, 1)) - ((target).vy * tau));
                local dz = ((((box).z + ((box).vz * tau)) - at((target).centerOfMass, 2)) - ((target).vz * tau));
                local error = hypot(dx, dy, dz);
                if (error < best) then
                  best = error;
                  flight = tau;
                end
              end
            end
            ::continue_1::
            tau = (tau + 0.1);
          end
        end
        (m).aimError = best;
        (m).flight = flight;
        local projected = {((box).x + ((box).vx * flight)), (((box).y + ((box).vy * flight)) - (((G * flight) * flight) / 2)), ((box).z + ((box).vz * flight))};
        local future = {(at((target).centerOfMass, 0) + ((target).vx * flight)), (at((target).centerOfMass, 1) + ((target).vy * flight)), (at((target).centerOfMass, 2) + ((target).vz * flight))};
        if ((not active((m).best)) or (best < ((m).best).error)) then
          (m).best = {time = t, error = best, projected = projected, future = future, velocity = {(box).vx, (box).vy, (box).vz}};
        end
        if (((((box).vy > 3) and (flight > 1)) and (best < 18)) and ((((box).vx * (at(future, 0) - (box).x)) + ((box).vz * (at(future, 2) - (box).z))) > 0)) then
          local pivot = at((s).positions, (arm).i);
          local correction = wrap((math.atan((at(future, 0) - at(pivot, 0)), (at(future, 2) - at(pivot, 2))) - math.atan((at(projected, 0) - at(pivot, 0)), (at(projected, 2) - at(pivot, 2)))));
          (m).bias = clamp(((function() local value = (m).bias; if active(value) then return value else return 0 end end)() + ((clamp(correction, 0.2) * (s).dt) * 0.8)), 0.6);
        end
        if ((((box).vy > 2) and (best < math.min(2.5, ((target).radius * 0.95)))) and ((t - (m).at) > 2)) then
          if safe_shot(box, flight, G) then
          power = false;
          (m).shots = (m).shots + 1;
          (m).lastShot = {time = t, cargo = (box).id, target = (target).id, error = best, flight = flight, position = {(box).x, (box).y, (box).z}, velocity = {(box).vx, (box).vy, (box).vz}};
          phase("return");
          end
        end
      end
    end
  end
  if ((m).phase == "hold") then
    yaw = at((s).angles, (bearing).i);
    park = (math.pi / 2);
    if (not active(box)) then
      phase("return");
    else
      if (active(target) and active(clear)) then
        phase("spin");
      end
    end
  end
  if ((m).phase == "return") then
    power = false;
    park = math.pi;
    if ((t - (m).at) > 3) then
      phase((active((m).loader) and "wait" or "load"));
    end
  end
  local yawRate = clamp((1.5 * wrap((yaw - at((s).angles, (bearing).i)))), (bearing).speed);
  set(bearing, ((at((s).rates, (bearing).i) + clamp((yawRate - at((s).rates, (bearing).i)), (0.5 * (s).dt))) / (bearing).speed));
  local acceleration = clamp(((4 * wrap((park - at((s).angles, (arm).i)))) - (4 * at((s).rates, (arm).i))), 2);
  local velocity = (((m).phase == "spin") and (at((s).rates, (arm).i) + clamp((rate - at((s).rates, (arm).i)), (1.2 * (s).dt))) or (at((s).rates, (arm).i) + (acceleration * (s).dt)));
  set(arm, clamp((velocity / (arm).speed)));
  set(dockLift, ((((m).phase == "wait") or (((m).phase == "load") and (not active(box)))) and 1 or (-1)));
  if box and box.cargo and power then out.radio = {kind="claim",cargo=box.id} end
  m.status = m.blockedBy > 0 and "Holding fire: friendly in trajectory"
    or m.blockedBy == -1 and "Holding fire: terrain in trajectory"
    or m.phase == "wait" and "Waiting for ammunition loader"
    or m.phase == "spin" and "Intercepting enemy in combat zone"
    or not target and "Watching combat zone" or m.phase
  set(head, (active(power) and 1 or (-1)));
  do return out end
end
