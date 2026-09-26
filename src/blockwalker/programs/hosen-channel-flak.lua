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
      return (function() local value = (b).anchored; if active(value) then return ((b).team == (s).team) else return value end end)()
    end), function(a, b)
      return (hypot(((a).x - (s).x), ((a).z - (s).z)) - hypot(((b).x - (s).x), ((b).z - (s).z)))
    end), 0), "id");
    phase((active((m).loader) and "wait" or "load"));
  end
  local opponents = filter((s).nearby, function(b)
    return (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (b).team; if active(value) then return ((b).team ~= (s).team) else return value end end)(); if active(value) then return (not active((b).anchored)) else return value end end)(); if active(value) then return (not active((b).cargo)) else return value end end)(); if active(value) then return ((b).low > ((s).ground + 5)) else return value end end)(); if active(value) then return ((b).up > 0.25) else return value end end)()
  end);
  local target = (function() local value = find(opponents, function(b)
    return ((b).id == (m).target)
  end); if active(value) then return value else return at(opponents, 0) end end)();
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
  if ((m).phase == "wait") then
    power = false;
    park = math.pi;
    if (((math.abs(wrap((park - at((s).angles, (arm).i)))) < 0.08) and (math.abs(at((s).rates, (arm).i)) < 0.08)) and (math.abs(at((s).angles, (bearing).i)) < 0.04)) then
      local stock = at(sort(filter((s).nearby, function(b)
        return (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (b).cargo; if active(value) then return ((b).mass < 1.5) else return value end end)(); if active(value) then return (not active((b).carriedBy)) else return value end end)(); if active(value) then return (not active(some((s).radio, function(r)
          return (function() local value = (function() local value = (function() local value = (function() local value = ((r).kind == "claim"); if active(value) then return ((r).cargo == (b).id) else return value end end)(); if active(value) then return ((r).from ~= (s).id) else return value end end)(); if active(value) then return ((r).from ~= (m).loader) else return value end end)(); if active(value) then return (((s).worldTime - (r).time) < 10) else return value end end)()
        end))) else return value end end)(); if active(value) then return ((b).y < ((s).ground + 2)) else return value end end)(); if active(value) then return (hypot(((b).x - at(dock, 0)), ((b).z - at(dock, 1))) > 3) else return value end end)()
      end), function(a, b)
        return (hypot(((a).x - optional(loader, "x")), ((a).z - optional(loader, "z"))) - hypot(((b).x - optional(loader, "x")), ((b).z - optional(loader, "z"))))
      end), 0);
      if active(stock) then
        (out).radio = {kind = "ready", cargo = (stock).id};
      end
    end
    local ready = find((s).radio, function(r)
      return (function() local value = (function() local value = (function() local value = (function() local value = ((r).from == (m).loader); if active(value) then return ((r).kind == "ready") else return value end end)(); if active(value) then return ((r).time >= ((s).worldTime - (t - (m).at))) else return value end end)(); if active(value) then return (((s).worldTime - (r).time) < 120) else return value end end)(); if active(value) then return some((s).nearby, function(b)
        return (function() local value = (function() local value = (function() local value = (function() local value = ((b).id == (r).cargo); if active(value) then return (b).cargo else return value end end)(); if active(value) then return ((b).mass < 1.5) else return value end end)(); if active(value) then return (function() local value = (function() local value = (not active((b).carriedBy)); if active(value) then return value else return ((b).carriedBy == (m).loader) end end)(); if active(value) then return value else return ((b).carriedBy == (s).id) end end)() else return value end end)(); if active(value) then return (hypot(((b).x - at(dock, 0)), ((b).z - at(dock, 1))) < 1) else return value end end)()
      end) else return value end end)()
    end);
    if active(ready) then
      (m).ammo = (ready).cargo;
      phase("load");
    end
  end
  if ((m).phase == "load") then
    local ammo = find((s).nearby, function(b)
      return ((b).id == (m).ammo)
    end);
    local tip = at((s).positions, (head).i);
    power = (function() local value = active(optional(box, "cargo")); if active(value) then return value else return active((function() local value = (function() local value = ammo; if active(value) then return (math.abs(wrap((((-math.pi) / 2) - at((s).angles, (arm).i)))) < 0.08) else return value end end)(); if active(value) then return (hypot((at(tip, 0) - at((ammo).centerOfMass, 0)), ((at(tip, 1) - 1) - at((ammo).centerOfMass, 1)), (at(tip, 2) - at((ammo).centerOfMass, 2))) < 0.35) else return value end end)()) end end)();
  end
  if ((((m).phase == "load") and (not active(box))) and ((t - (m).at) > 15)) then
    phase("return");
  end
  if (((m).phase == "load") and active(box)) then
    if ((not active((box).cargo)) or ((box).mass >= 1.5)) then
      power = false;
    else
      (out).radio = {kind = "claim", cargo = (box).id};
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
        local miss = function(tau)
          return hypot(((((box).x + ((box).vx * tau)) - at((target).centerOfMass, 0)) - ((target).vx * tau)), (((((box).y + ((box).vy * tau)) - (((G * tau) * tau) / 2)) - at((target).centerOfMass, 1)) - ((target).vy * tau)), ((((box).z + ((box).vz * tau)) - at((target).centerOfMass, 2)) - ((target).vz * tau)))
        end;
        do
          local tau = 0.15;
          while (tau < 7) do
            do
              do
                local error = miss(tau);
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
        local start = math.max(0.05, (flight - 0.1));
        local end_ = (flight + 0.1);
        do
          local tau = start;
          while (tau <= end_) do
            do
              do
                local error = miss(tau);
                if (error < best) then
                  best = error;
                  flight = tau;
                end
              end
            end
            ::continue_2::
            tau = (tau + 0.01);
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
        if ((((flight > 0.15) and (best < math.min(1.15, ((target).radius * 0.8)))) and ((((box).vx * (at(future, 0) - (box).x)) + ((box).vz * (at(future, 2) - (box).z))) > 0)) and ((t - (m).at) > 2)) then
          power = false;
          (m).shots = (m).shots + 1;
          (m).lastShot = {time = t, cargo = (box).id, target = (target).id, error = best, flight = flight, position = {(box).x, (box).y, (box).z}, velocity = {(box).vx, (box).vy, (box).vz}};
          phase("return");
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
  if ((active(optional(box, "cargo")) and active(target)) and active(power)) then
    (out).radio = {kind = "claim", cargo = (box).id};
  end
  set(head, (active(power) and 1 or (-1)));
  do return out end
end
