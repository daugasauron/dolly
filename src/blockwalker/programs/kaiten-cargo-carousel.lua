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
  local rotor = find(parts, function(b)
    return ((b).joint == 7)
  end);
  local heads = filter(parts, function(b)
    return ((b).joint == 5)
  end);
  local pivot = at((s).positions, (rotor).i);
  local gravity = hypot(table.unpack((s).gravity));
  local out = {};
  local set = function(b, u)
    u = clamp(u);
    if active((b).negative) then
      (out)[index(string.char((b).negative))] = math.max(0, (-u));
    end
    if active((b).positive) then
      (out)[index(string.char((b).positive))] = math.max(0, u);
    end
  end;
  local phase = function(name)
    (m).phase = name;
    (m).at = t;
  end;
  local chain = function(head)
    local result = {};
    do
      local part = at(parts, (head).parent);
      while (optional(part, "joint") == 2) do
        do
          append(result, part);
        end
        ::continue_1::
        part = at(parts, (part).parent);
      end
    end
    do return result end
  end;
  local depot = at(sort(slice((s).depots), function(a, b)
    return (hypot(((a).x - at(pivot, 0)), ((a).z - at(pivot, 2))) - hypot(((b).x - at(pivot, 0)), ((b).z - at(pivot, 2))))
  end), 0);
  if (not active(depot)) then
    do return out end
  end
  local outlet = math.atan(((depot).x - at(pivot, 0)), ((depot).z - at(pivot, 2)));
  local angle = function(x, z)
    return math.atan((x - at(pivot, 0)), (z - at(pivot, 2)))
  end;
  if (not active((m).phase)) then
    (m).handoffs = 0;
    (m).pickups = 0;
    (m).job = 0;
    phase("scan");
  end
  if (((m).phase == "scan") and (t > (function() local value = (m).wait; if active(value) then return value else return 0 end end)())) then
    local jobs = {};
    for _, box in ipairs(filter((s).nearby, function(c)
      return (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (c).cargo; if active(value) then return (not active((c).delivered)) else return value end end)(); if active(value) then return (not active((c).carriedBy)) else return value end end)(); if active(value) then return (not active((c).magnetHeld)) else return value end end)(); if active(value) then return (math.abs((((c).y - (s).ground) - 0.5)) < 0.6) else return value end end)(); if active(value) then return (hypot((c).vx, (c).vz) < 0.2) else return value end end)()
    end)) do
      do
        do
          local c = (box).centerOfMass;
          local bearing = angle(at(c, 0), at(c, 2));
          local radius = hypot((at(c, 0) - at(pivot, 0)), (at(c, 2) - at(pivot, 2)));
          if (math.abs(wrap((bearing - outlet))) < 0.5) then
            goto continue_2
          end
          for _, head in ipairs(heads) do
            do
              do
                local p = at((s).positions, (head).i);
                local reach = hypot((at(p, 0) - at(pivot, 0)), (at(p, 2) - at(pivot, 2)));
                if ((((box).mass * gravity) > ((head).force * 0.6)) or (math.abs((radius - reach)) > 0.4)) then
                  goto continue_3
                end
                append(jobs, {id = (box).id, head = (head).i, score = math.abs(wrap((bearing - angle(at(p, 0), at(p, 2)))))});
              end
            end
            ::continue_3::
          end
        end
      end
      ::continue_2::
    end
    sort(jobs, function(a, b)
      return ((a).score - (b).score)
    end);
    if active(#(jobs)) then
      (m).job = (at(jobs, 0)).id;
      (m).head = (at(jobs, 0)).head;
      phase("align_pick");
    end
  end
  local head = at(parts, (m).head);
  local rams = (function() if active(head) then return chain(head) else return {} end end)();
  local travel = reduce(rams, function(v, b)
    return (v + (b).travel)
  end, 0);
  local stroke = reduce(rams, function(v, b)
    return (v + at((s).angles, (b).i))
  end, 0);
  local rate = reduce(rams, function(v, b)
    return (v + at((s).rates, (b).i))
  end, 0);
  local grip = (function() local value = head; if active(value) then return at((s).magnets, (head).i) else return value end end)();
  local box = find((s).nearby, function(c)
    return ((c).id == (m).job)
  end);
  local length = 0;
  local power = false;
  local turn = 0;
  if (active(head) and ((m).phase ~= "scan")) then
    local tip = at((s).positions, (head).i);
    local bearing = angle(at(tip, 0), at(tip, 2));
    local reach = hypot((at(tip, 0) - at(pivot, 0)), (at(tip, 2) - at(pivot, 2)));
    local swingClear = function()
      return (not active(some((s).nearby, function(c)
        return (function() local value = (function() local value = (function() local value = (function() local value = ((c).id ~= (m).job); if active(value) then return (not active((c).cargo)) else return value end end)(); if active(value) then return ((c).low < ((s).ground + 8)) else return value end end)(); if active(value) then return ((c).high > ((s).ground + 0.8)) else return value end end)(); if active(value) then return (hypot(((c).x - at(pivot, 0)), ((c).z - at(pivot, 2))) < ((reach + (c).radius) + 1)) else return value end end)()
      end)))
    end;
    local outputClear = function()
      local x = (at(pivot, 0) + (reach * math.sin(outlet)));
      local z = (at(pivot, 2) + (reach * math.cos(outlet)));
      do return (function() local value = (not active(some((s).nearby, function(c)
        return (function() local value = (function() local value = (function() local value = ((c).id ~= (m).job); if active(value) then return ((c).low < ((s).ground + 3)) else return value end end)(); if active(value) then return ((c).high > (s).ground) else return value end end)(); if active(value) then return (hypot(((c).x - x), ((c).z - z)) < ((c).radius + 1.2)) else return value end end)()
      end))); if active(value) then return (not active(some((s).terrain, function(b)
        return (function() local value = (function() local value = (function() local value = ((b).high > ((s).ground + 0.2)); if active(value) then return ((b).low < ((s).ground + 2)) else return value end end)(); if active(value) then return (math.abs((x - (b).x)) < ((b).halfX + 1)) else return value end end)(); if active(value) then return (math.abs((z - (b).z)) < ((b).halfZ + 1)) else return value end end)()
      end))) else return value end end)() end
    end;
    if (((not active(box)) or (active((box).carriedBy) and ((box).carriedBy ~= (s).id))) or active((box).delivered)) then
      (m).job = 0;
      (m).wait = (t + 2);
      phase("scan");
    else
      if ((m).phase == "align_pick") then
        local error = wrap((angle(at((box).centerOfMass, 0), at((box).centerOfMass, 2)) - bearing));
        if active(swingClear()) then
          turn = clamp(((0.9 * error) - (0.7 * at((s).rates, (rotor).i))), 0.45);
        end
        if ((math.abs(error) < 0.035) and (math.abs(at((s).rates, (rotor).i)) < 0.025)) then
          phase("pick");
        end
      end
    end
    if ((m).phase == "pick") then
      power = true;
      length = math.min(travel, math.max(0, (((stroke + at(tip, 1)) - (box).high) - 0.54)));
      if (active((grip).attached) and ((grip).creature == (m).job)) then
        (m).pickups = (m).pickups + 1;
        phase("lift");
      else
        if ((t - (m).at) > 12) then
          (m).wait = (t + 8);
          phase("scan");
        end
      end
    end
    if ((m).phase == "lift") then
      power = true;
      if (((stroke < 0.04) and (math.abs(rate) < 0.04)) and ((t - (m).at) > 1)) then
        phase("turn");
      end
    end
    if ((m).phase == "turn") then
      power = true;
      local error = wrap((outlet - bearing));
      if (active(swingClear()) and active(outputClear())) then
        turn = clamp(((0.9 * error) - (0.7 * at((s).rates, (rotor).i))), 0.35);
      end
      if (((math.abs(error) < 0.025) and (math.abs(at((s).rates, (rotor).i)) < 0.025)) and active(outputClear())) then
        phase("lower");
      end
    end
    if ((m).phase == "lower") then
      power = true;
      length = math.min(travel, (stroke + 0.15));
      if ((((grip).cargoSupportForce > (((box).mass * gravity) * 0.6)) and (hypot((box).vx, (box).vy, (box).vz) < 0.15)) and ((t - (m).at) > 1)) then
        phase("release");
      end
    end
    if ((m).phase == "release") then
      length = stroke;
      power = false;
      if ((not active((grip).attached)) and ((t - (m).at) > 1)) then
        (m).handoffs = (m).handoffs + 1;
        (m).job = 0;
        (m).wait = (t + 2);
        phase("scan");
      end
    end
    if ((active((grip).attached) and ((grip).creature ~= (m).job)) and ((m).phase ~= "release")) then
      power = false;
      (m).wait = (t + 3);
      phase("scan");
    end
    if (active(includes({"lift", "turn", "lower"}, (m).phase)) and (not active((grip).attached))) then
      power = false;
      (m).wait = (t + 3);
      phase("scan");
    end
  end
  set(rotor, turn);
  for _, h in ipairs(heads) do
    do
      do
        local stages = chain(h);
        local total = reduce(stages, function(v, b)
          return (v + (b).travel)
        end, 0);
        local desired = (function() if (((h).i == (m).head) and ((m).phase ~= "scan")) then return length else return 0 end end)();
        for _, r in ipairs(stages) do
          do
            set(r, clamp(((2 * (((desired * (r).travel) / total) - at((s).angles, (r).i))) - (0.3 * at((s).rates, (r).i))), 0.5));
          end
          ::continue_5::
        end
        set(h, ((((h).i == (m).head) and active(power)) and 1 or (-1)));
      end
    end
    ::continue_4::
  end
  do return out end
end
