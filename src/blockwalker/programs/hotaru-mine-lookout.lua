return (function()
  local drive = function(t, s, m, r)
    local clamp = function(v, a)
      return math.max((-a), math.min(a, v))
    end;
    local wrap = function(v)
      return math.atan(math.sin(v), math.cos(v))
    end;
    local q = (s).rotation;
    local yaw = math.atan((2 * ((at(q, 0) * at(q, 2)) + (at(q, 1) * at(q, 3)))), (1 - (2 * ((at(q, 0) * at(q, 0)) + (at(q, 1) * at(q, 1))))));
    local peers = filter((s).nearby, function(p)
      return (function() local value = ((p).low < ((s).y + 3)); if active(value) then return ((p).high > ((s).y - 2)) else return value end end)()
    end);
    if (not active((m).home)) then
      (m).home = {(s).x, (s).z};
      (m).goal = nil;
      (m).arrivals = 0;
      (m).visits = 0;
      (m).choices = 0;
      (m).wait = 0;
      (m).stuck = 0;
      (m).back = 0;
      (m).next = 0;
      (m).tracked = 0;
      (m).yielded = 0;
    end
    local bounds = {(-94), (-67), (-12), 14};
    local distance = (function() if active((m).goal) then return hypot((at((m).goal, 0) - (s).x), (at((m).goal, 1) - (s).z)) else return math.huge end end)();
    if (((not active((m).goal)) or (distance < 2)) or (t > (m).next)) then
      if (distance < 2) then
        (m).arrivals = (m).arrivals + 1;
        if (active((m).friend) and active(some(peers, function(p)
          return (function() local value = ((p).id == (m).friend); if active(value) then return (hypot(((p).x - (s).x), ((p).z - (s).z)) < ((p).radius + 9)) else return value end end)()
        end))) then
          (m).visits = (m).visits + 1;
        end
        (m).wait = ((t + 1) + (r() * 2));
      end
      local goal = nil;
      do
        local i = 0;
        while (i < 24) do
          do
            do
              local friends = filter(peers, function(p)
                return (function() local value = (function() local value = (not active((p).cargo)); if active(value) then return (not active((p).anchored)) else return value end end)(); if active(value) then return (hypot(((p).x - (s).x), ((p).z - (s).z)) > ((p).radius + 7)) else return value end end)()
              end);
              local friend = (function() if (active(#(friends)) and (r() < 0.45)) then return at(friends, math.floor((r() * #(friends)))) else return nil end end)();
              local a = ((r() * math.pi) * 2);
              local d = (active(friend) and ((friend).radius + 7) or (12 + (24 * r())));
              goal = {math.max(at(bounds, 0), math.min(at(bounds, 1), ((function() if active(friend) then return (friend).x else return (s).x end end)() + (math.sin(a) * d)))), math.max(at(bounds, 2), math.min(at(bounds, 3), ((function() if active(friend) then return (friend).z else return (s).z end end)() + (math.cos(a) * d))))};
              if (((hypot((at(goal, 0) - (s).x), (at(goal, 1) - (s).z)) < 6) or active(some(peers, function(p)
                return (hypot(((p).x - at(goal, 0)), ((p).z - at(goal, 1))) < ((p).radius + 5))
              end))) or active(some((s).obstacles, function(p)
                return (function() local value = (function() local value = ((p).low < ((s).y + 3.6)); if active(value) then return (math.abs((at(goal, 0) - (p).x)) < ((p).halfX + 3)) else return value end end)(); if active(value) then return (math.abs((at(goal, 1) - (p).z)) < ((p).halfZ + 3)) else return value end end)()
              end))) then
                goto continue_1
              end
              (m).friend = (function() local value = optional(friend, "id"); if active(value) then return value else return 0 end end)();
              break
            end
          end
          ::continue_1::
          i = i + 1;
        end
      end
      (m).goal = goal;
      (m).next = ((t + 35) + (25 * r()));
      (m).choices = (m).choices + 1;
    end
    local mobile = sort(filter(peers, function(p)
      return (function() local value = (not active((p).cargo)); if active(value) then return (not active((p).anchored)) else return value end end)()
    end), function(a, b)
      return ((hypot(((a).x - (s).x), ((a).z - (s).z)) - (a).radius) - (hypot(((b).x - (s).x), ((b).z - (s).z)) - (b).radius))
    end);
    local nearest = at(mobile, 0);
    local evading = (function() local value = (function() local value = nearest; if active(value) then return (hypot(((nearest).x - (s).x), ((nearest).z - (s).z)) < ((nearest).radius + 5)) else return value end end)(); if active(value) then return value else return some(peers, function(p)
      return (function() local value = (function() local value = (function() local value = (function() local value = (p).team; if active(value) then return ((p).team ~= (s).team) else return value end end)(); if active(value) then return (not active((p).cargo)) else return value end end)(); if active(value) then return (not active((p).anchored)) else return value end end)(); if active(value) then return (hypot(((p).x - (s).x), ((p).z - (s).z)) < ((p).radius + 10)) else return value end end)()
    end) end end)();
    local dx = (at((m).goal, 0) - (s).x);
    local dz = (at((m).goal, 1) - (s).z);
    local d = hypot(dx, dz);
    local vx = (dx / math.max(d, 0.01));
    local vz = (dz / math.max(d, 0.01));
    local speed = math.min(1.5, (d * 0.5));
    local yielding = false;
    if active(evading) then
      local range = math.max(0.01, hypot(((s).x - (nearest).x), ((s).z - (nearest).z)));
      vx = (((s).x - (nearest).x) / range);
      vz = (((s).z - (nearest).z) / range);
      speed = 1.8;
      (m).wait = 0;
      (m).back = 0;
      (m).next = (t + 2);
    end
    for _, p in ipairs(peers) do
      do
        do
          local px = ((((s).x + (0.7 * (s).vx)) - (p).x) - (0.7 * (p).vx));
          local pz = ((((s).z + (0.7 * (s).vz)) - (p).z) - (0.7 * (p).vz));
          local dist = hypot(px, pz);
          local safe = ((p).radius + 3.5);
          if (dist > (safe + 6)) then
            goto continue_2
          end
          local nx = (px / math.max(0.01, dist));
          local nz = (pz / math.max(0.01, dist));
          local weight = math.max(0, (((safe + 6) - dist) / 6));
          vx = (vx + (weight * (nx + (0.7 * nz))));
          vz = (vz + (weight * (nz - (0.7 * nx))));
          if ((dist < safe) and ((((-nx) * dx) - (nz * dz)) > 0)) then
            if (not active(evading)) then
              speed = (speed * math.max(0, (((dist - safe) + 1.5) / 1.5)));
            end
            yielding = true;
          end
        end
      end
      ::continue_2::
    end
    for _, p in ipairs((s).obstacles) do
      do
        do
          if ((p).low > ((s).y + 3.6)) then
            goto continue_3
          end
          local px = ((s).x - math.max(((p).x - (p).halfX), math.min(((p).x + (p).halfX), (s).x)));
          local pz = ((s).z - math.max(((p).z - (p).halfZ), math.min(((p).z + (p).halfZ), (s).z)));
          local dist = hypot(px, pz);
          if (dist > 8) then
            goto continue_3
          end
          local nx = (px / math.max(0.01, dist));
          local nz = (pz / math.max(0.01, dist));
          local weight = ((8 - dist) / 4);
          vx = (vx + (weight * (nx + (0.8 * nz))));
          vz = (vz + (weight * (nz - (0.8 * nx))));
        end
      end
      ::continue_3::
    end
    for _, p in ipairs(slice((s).groundSamples, 0, 8)) do
      do
        if (math.abs((at(p, 1) - (s).ground)) > 0.4) then
          local nx = (((s).x - at(p, 0)) / 6);
          local nz = (((s).z - at(p, 2)) / 6);
          if (((vx * nx) + (vz * nz)) < (-0.1)) then
            vx = (vx + (2 * nx));
            vz = (vz + (2 * nz));
            yielding = true;
          end
        end
      end
      ::continue_4::
    end
    local ownRadius = math.max(table.unpack(map((s).positions, function(p, i)
      return (hypot((at(p, 0) - (s).x), (at(p, 2) - (s).z)) + (0.7 * (function() local value = (at((s).blueprint, i)).size; if active(value) then return value else return 1 end end)()))
    end)));
    local traffic = filter(peers, function(p)
      return (hypot(((p).x - (s).x), ((p).z - (s).z)) < (((p).radius + ownRadius) + 14))
    end);
    local clearance = function(ux, uz, horizon, margin)
      local loss = 0;
      for _, p in ipairs(traffic) do
        do
          do
            local radius = ((((p).radius + ownRadius) + margin) + ((((active((p).team) and ((p).team ~= (s).team)) and (not active((p).cargo))) and (not active((p).anchored))) and 3 or 0));
            local x = ((s).x - (p).x);
            local z = ((s).z - (p).z);
            local dx = (ux - (p).vx);
            local dz = (uz - (p).vz);
            local now = (hypot(x, z) - radius);
            local at_ = math.max(0, math.min(horizon, ((-((x * dx) + (z * dz))) / math.max(0.001, ((dx * dx) + (dz * dz))))));
            local gap = (hypot((x + (at_ * dx)), (z + (at_ * dz))) - radius);
            loss = (loss + (math.max(0, (math.min(0, now) - gap)) ^ 2));
          end
        end
        ::continue_5::
      end
      do return loss end
    end;
    if active(#(traffic)) then
      local scale = math.max(0.01, hypot(vx, vz));
      local wantX = (vx / scale);
      local wantZ = (vz / scale);
      local best = nil;
      do
        local i = 0;
        while (i < 16) do
          do
            do
              local angle = (yaw + ((i * math.pi) / 8));
              local x = math.sin(angle);
              local z = math.cos(angle);
              local error = wrap((angle - yaw));
              local score = ((((40 * clearance((speed * x), (speed * z), 3, 1.2)) + ((x - wantX) ^ 2)) + ((z - wantZ) ^ 2)) + (0.05 * math.min(math.abs(error), (math.pi - math.abs(error)))));
              if ((not active(best)) or (score < (best).score)) then
                best = {x = x, z = z, score = score};
              end
            end
          end
          ::continue_6::
          i = i + 1;
        end
      end
      vx = (best).x;
      vz = (best).z;
    end
    local travelHeading = wrap((math.atan(vx, vz) - yaw));
    local reverse = (function() local value = evading; if active(value) then return (math.abs(travelHeading) > (active((m).reverse) and (math.pi * 0.42) or (math.pi * 0.58))) else return value end end)();
    local error = wrap((travelHeading + (function() if active(reverse) then return math.pi else return 0 end end)()));
    (m).reverse = reverse;
    speed = (speed * ((active(reverse) and (-1) or 1) * math.max(0, (1 - (math.abs(error) / 0.45)))));
    if (t < (m).wait) then
      speed = 0;
    end
    if active(#(traffic)) then
      local best = speed;
      local loss = math.huge;
      for _, u in ipairs({speed, (speed * 0.5), 0}) do
        do
          do
            local risk = clearance((math.sin(yaw) * u), (math.cos(yaw) * u), 1.5, 0.6);
            local score = ((100 * risk) + ((u - speed) ^ 2));
            if (score < loss) then
              loss = score;
              best = u;
            end
          end
        end
        ::continue_7::
      end
      speed = best;
    end
    (m).stuck = ((((not active(evading)) and (speed > 0.4)) and (math.abs(at((s).localVelocity, 2)) < 0.08)) and ((m).stuck + (s).dt) or 0);
    if ((m).stuck > 3) then
      (m).back = (t + 1.5);
      (m).next = (t + 2);
      (m).stuck = 0;
    end
    local drive = ((t < (m).back) and (-0.28) or clamp(((speed / 2.8) + (0.22 * (speed - at((s).localVelocity, 2)))), 0.65));
    local turn = ((t < (m).back) and 0.25 or clamp(((0.8 * error) - (0.25 * at((s).gyroscope, 1))), 0.45));
    local out = {};
    do
      local i = 0;
      while (i < 4) do
        do
          do
            local value = clamp((drive + ((active(math.fmod(i, 2)) and (-1) or 1) * turn)), 1);
            (out)[index(tostring(((1 + (i * 2)) + ((value >= 0) and 1 or 0))))] = math.abs(value);
          end
        end
        ::continue_8::
        i = i + 1;
      end
    end
    local friend = at(sort(filter(peers, function(p)
      return (function() local value = (not active((p).cargo)); if active(value) then return (not active((p).anchored)) else return value end end)()
    end), function(a, b)
      return (hypot(((a).x - (s).x), ((a).z - (s).z)) - hypot(((b).x - (s).x), ((b).z - (s).z)))
    end), 0);
    local heading = (function() if active(friend) then return math.atan(((friend).x - (s).x), ((friend).z - (s).z)) else return (yaw + (math.sin((t * 0.45)) * 1.4)) end end)();
    (m).tracked = (function() local value = optional(friend, "id"); if active(value) then return value else return 0 end end)();
    local head = clamp(((2 * wrap(((heading - yaw) - at((s).angles, 8)))) - (0.2 * at((s).rates, 8))), 0.65);
    (out)[index(((head < 0) and "I" or "K"))] = math.abs(head);
    if active(yielding) then
      (m).yielded = ((m).yielded + (s).dt);
    end
    do return out end
  end;
  do return function(t, s, m, r)
    local out = drive(t, s, m, r);
    local seen = filter((s).nearby, function(c)
      return (function() local value = (function() local value = (function() local value = (function() local value = (c).cargo; if active(value) then return (c).supply else return value end end)(); if active(value) then return (not active((c).delivered)) else return value end end)(); if active(value) then return (not active((c).carriedBy)) else return value end end)(); if active(value) then return (c).visible else return value end end)()
    end);
    if (active(#(seen)) and (t >= (function() local value = (m).reportAt; if active(value) then return value else return 0 end end)())) then
      (m).report = (at(seen, math.fmod((function() local value = (m).reports; if active(value) then return value else return 0 end end)(), #(seen)))).id;
      (m).reports = ((function() local value = (m).reports; if active(value) then return value else return 0 end end)() + 1);
      (m).reportAt = (t + 3.1);
    end
    if active((m).report) then
      (out).radio = {kind = "sight", cargo = (m).report};
    end
    do return out end
  end end
end)()
