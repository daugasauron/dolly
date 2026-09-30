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
  local rams = filter(parts, function(b)
    return (function() local value = ((b).joint == 2); if active(value) then return ((b).axis == 1) else return value end end)()
  end);
  local head = find(parts, function(b)
    return ((b).joint == 5)
  end);
  local grip = at((s).magnets, (head).i);
  local out = {};
  local width = math.max(table.unpack(map(wheels, function(b)
    return (math.abs(((b).x - (at(parts, 0)).x)) + 0.8)
  end)));
  local pads = filter((s).depots, function(p)
    return ((p).team == (s).team)
  end);
  local speed = hypot((s).vx, (s).vz);
  local set = function(b, u)
    if active((b).negative) then
      (out)[index(string.char((b).negative))] = math.max(0, (-u));
    end
    if active((b).positive) then
      (out)[index(string.char((b).positive))] = math.max(0, u);
    end
  end;
  local phase = function(p)
    (m).phase = p;
    (m).at = t;
    (m).nav = nil;
    (m).progress = t;
    (m).best = nil;
  end;
  if (not active((m).home)) then
    (m).home = {(s).x, (s).z};
  end
  if (not active((m).phase)) then
    (m).jobs = 0;
    (m).job = (function() if active((grip).attached) then return (grip).creature else return 0 end end)();
    phase((active((grip).attached) and "plan_store" or "seek"));
  end
  m.failed=m.failed or {}
  local box = find((s).nearby, function(b)
    return ((b).id == (m).job)
  end);
  local pickupLift=0
  if box and #rams>0 then
    local extension=0
    for _,b in ipairs(rams) do extension=extension+s.angles[b.i+1] end
    pickupLift=math.max(0,(box.centerOfMass[2]-s.positions[head.i+1][2]+extension)/#rams)
    for _,b in ipairs(rams) do pickupLift=math.min(pickupLift,b.travel) end
  end
  if not m.workPosition or hypot(s.x-m.workPosition[1],s.z-m.workPosition[2])>.3 then
    m.workPosition={s.x,s.z};m.lastMoved=t
  end
  if grip.attached and t-(m.lastMoved or t)>90 and (m.phase=='plan_store' or m.phase=='route_store' or m.phase=='unstick') then
    m.restack=true;m.failed[m.job]=t+90;phase('lower')
  end
  local throttle = 0;
  local turn = 0;
  local lift = 1.4;
  local power = (grip).attached;
  local driving = false;
  local goal = nil;
  local ground = filter((s).terrain, function(b)
    return (math.abs(((b).high - (s).ground)) < 0.3)
  end);
  local walls = filter((s).terrain, function(b)
    return (function() local value = ((b).high > ((s).ground + 0.3)); if active(value) then return ((b).low < ((s).ground + 5)) else return value end end)()
  end);
  local blockers = map(filter((s).nearby, function(b)
    return (function() local value = ((b).low < ((s).ground + 5)); if active(value) then return ((b).high > ((s).ground + 0.2)) else return value end end)()
  end), function(b)
    return {(function() if active((b).anchored) then return (b).x else return at((b).centerOfMass, 0) end end)(), (function() if active((b).anchored) then return (b).z else return at((b).centerOfMass, 2) end end)(), ((active((b).anchored) and 1.2 or (b).radius) + 0.2), (b).id, b.low, b.high}
  end);
  local function floor(x,z,radius)
    radius=radius or width
    if s.ground<=s.waterHeight+.5 then return false end
    for _,b in ipairs(ground) do
      if math.abs(x-b.x)+radius<b.halfX and math.abs(z-b.z)+radius<b.halfZ then return true end
    end
    return false
  end
  local land = function(x, z, r)
    if r == nil then r = width end
    return (function() local value = floor(x, z, r); if active(value) then return (not active(some(walls, function(b)
      return (function() local value = (math.abs((x - (b).x)) < ((b).halfX + r)); if active(value) then return (math.abs((z - (b).z)) < ((b).halfZ + r)) else return value end end)()
    end))) else return value end end)()
  end;
  local overlap = function(x, z, r)
    if r == nil then r = width end
    local sum = 0;
    for _, b in ipairs(blockers) do
      do
        do
          if (at(b, 3) == (m).job) then
            goto continue_1
          end
          local distance = ((r + at(b, 2)) - hypot((x - at(b, 0)), (z - at(b, 1))));
          if (distance > 0) then
            sum = (sum + (distance * distance));
          end
        end
      end
      ::continue_1::
    end
    do return sum end
  end;
  local clear = function(x, z, r)
    if r == nil then r = width end
    return (function() local value = land(x, z, r); if active(value) then return (overlap(x, z, r) == 0) else return value end end)()
  end;
  local room = function(x, z, r)
    return (function() local value = (function() local value = clear(x, z, r); if active(value) then return every(pads, function(p)
      return (hypot((x - (p).x), (z - (p).z)) > (((p).radius + r) + 6))
    end) else return value end end)(); if active(value) then return some(pads, function(p)
      return (hypot((x - (p).x), (z - (p).z)) < 32)
    end) else return value end end)()
  end;
  local cos = math.cos(yaw);
  local sin = math.sin(yaw);
  local pivot = reduce(wheels, function(v, b)
    return {(at(v, 0) + (at(at((s).positions, (b).i), 0) / #(wheels))), (at(v, 1) + (at(at((s).positions, (b).i), 2) / #(wheels)))}
  end, {0, 0});
  local offset = {(((at(pivot, 0) - (s).x) * cos) - ((at(pivot, 1) - (s).z) * sin)), (((at(pivot, 0) - (s).x) * sin) + ((at(pivot, 1) - (s).z) * cos))};
  local toPivot = function(x, z, a)
    return {((x + (at(offset, 0) * math.cos(a))) + (at(offset, 1) * math.sin(a))), ((z - (at(offset, 0) * math.sin(a))) + (at(offset, 1) * math.cos(a)))}
  end;
  local shape = map(parts, function(b, i)
    local p = at((s).positions, i);
    local dx = (at(p, 0) - at(pivot, 0));
    local dz = (at(p, 2) - at(pivot, 1));
    local r = ((function() local value = (b).size; if active(value) then return value else return 1 end end)() * 0.7);
    do return {((dx * cos) - (dz * sin)), ((dx * sin) + (dz * cos)), (at(p, 1) - r), (at(p, 1) + r), (r + 0.1), ((b).joint == 4)} end
  end);
  if (active((grip).attached) and active(box)) then
    local dx = (at((box).centerOfMass, 0) - at(pivot, 0));
    local dz = (at((box).centerOfMass, 2) - at(pivot, 1));
    append(shape, {((dx * cos) - (dz * sin)), ((dx * sin) + (dz * cos)), (box).low, (box).high, ((box).radius + 0.2), false});
  end
  local radius = math.max(table.unpack(map(shape, function(p)
    return (hypot(at(p, 0), at(p, 1)) + at(p, 4))
  end)));
  local solid = map(walls, function(b)
    return merge({}, b, {parts = filter(map(shape, function(p, i)
      return (function() if ((at(p, 3) > ((b).low + 0.03)) and (at(p, 2) < ((b).high - 0.03))) then return i else return (-1) end end)()
    end), function(i)
      return (i >= 0)
    end)})
  end);
  local poseCache={}
  local function obstruction(x,z,angle)
    local key=x..','..z..','..angle
    local cached=poseCache[key]
    if cached~=nil then return cached end
    local c,d=math.cos(angle),math.sin(angle)
    local points={}
    for i,p in ipairs(shape) do points[i]={x+p[1]*c+p[2]*d,z-p[1]*d+p[2]*c} end
    local sum=0
    for _,b in ipairs(solid) do
      if math.abs(x-b.x)<=b.halfX+radius and math.abs(z-b.z)<=b.halfZ+radius then
        for _,index in ipairs(b.parts) do
          local p,a=points[index+1],shape[index+1]
          local dx=math.max(0,math.abs(p[1]-b.x)-b.halfX)
          local dz=math.max(0,math.abs(p[2]-b.z)-b.halfZ)
          local over=a[5]-math.sqrt(dx*dx+dz*dz)
          if over>0 then sum=sum+over*over end
        end
      end
    end
    for _,b in ipairs(blockers) do
      local dx,dz=x-b[1],z-b[2]
      if b[4]~=m.job and dx*dx+dz*dz<=(radius+b[3])^2 then
        for i,a in ipairs(shape) do
          local p=points[i]
          local dx,dz=p[1]-b[1],p[2]-b[2]
          local over=a[5]+b[3]-math.sqrt(dx*dx+dz*dz)
          if over>0 and a[4]>b[5]+.03 and a[3]<b[6]-.03 then sum=sum+over*over end
        end
      end
    end
    for i,p in ipairs(points) do
      if shape[i][6] and not floor(p[1],p[2],.85) then sum=sum+100;break end
    end
    poseCache[key]=sum
    return sum
  end
  local fits = function(x, z, angle)
    return (obstruction(x, z, angle) == 0)
  end;
  local rootFits = function(x, z, angle)
    return fits(table.unpack(concat(toPivot(x, z, angle), {angle})))
  end;
  local sweep = function(x, z, a, b)
    return every({0.25, 0.5, 0.75, 1}, function(u)
      return fits(x, z, wrap((a + (u * wrap((b - a))))))
    end)
  end;
  local navigate = function(rootTarget, heading)
    heading = (function() local value = (function() local value = heading; if value ~= nil then return value else return optional((m).nav, "heading") end end)(); if value ~= nil then return value else return yaw end end)();
    local target = toPivot(table.unpack(concat(rootTarget, {heading})));
    if (not active(fits(table.unpack(concat(target, {heading}))))) then
      do return false end
    end
    if (active((m).nav) and (not active(((m).nav).nodes))) then
      (m).nav = nil;
    end
    if (not active((m).nav)) then
      (m).nav = {ox = at(pivot, 0), oz = at(pivot, 1), yaw = yaw, heading = heading, nodes = {{at(pivot, 0), at(pivot, 1), 0, (-1), 0}}, queue = {{0, 0}}, best = {["0,0,0"] = 0}, closed = {}, path = nil, at = 0, closest = 0, remaining = hypot(target[1]-pivot[1],target[2]-pivot[2])};
    end
    local v = (m).nav;
    local angle = function(d)
      return wrap(((v).yaw + ((d * math.pi) / 16)))
    end;
    local key = function(p)
      return ((((round(((at(p, 0) - (v).ox) / 0.5)) .. ",") .. round(((at(p, 1) - (v).oz) / 0.5))) .. ",") .. at(p, 2))
    end;
    local pose = function(p)
      return {at(p, 0), at(p, 1), angle(at(p, 2))}
    end;
    local push = function(rank, id)
      local i = #((v).queue);
      append((v).queue, {rank, id});
      while active(i) do
        do
          do
            local p = ((i - 1) >> 1);
            if (at(at((v).queue, p), 0) <= rank) then
              break
            end
            ((v).queue)[index(i)] = at((v).queue, p);
            i = p;
          end
        end
        ::continue_6::
      end
      ((v).queue)[index(i)] = {rank, id};
    end;
    local pop = function()
      local first = at((v).queue, 0);
      local last = table.remove((v).queue);
      if active(#((v).queue)) then
        local i = 0;
        while (((2 * i) + 1) < #((v).queue)) do
          do
            do
              local j = ((2 * i) + 1);
              if (((j + 1) < #((v).queue)) and (at(at((v).queue, (j + 1)), 0) < at(at((v).queue, j), 0))) then
                j = j + 1;
              end
              if (at(at((v).queue, j), 0) >= at(last, 0)) then
                break
              end
              ((v).queue)[index(i)] = at((v).queue, j);
              i = j;
            end
          end
          ::continue_7::
        end
        ((v).queue)[index(i)] = last;
      end
      do return at(first, 1) end
    end;
    do
      local count = 0;
      while ((((not active((v).path)) and active(#((v).queue))) and (#((v).nodes) < 1500)) and (count < 2)) do
        do
          do
            local id = pop();
            local node = at((v).nodes, id);
            local state = key(node);
            if (active(at((v).closed, state)) or (at((v).best, state) ~= id)) then
              goto continue_8
            end
            ((v).closed)[index(state)] = true;
            local a = pose(node);
            local before = obstruction(table.unpack(a));
            local distance = hypot((at(a, 0) - at(target, 0)), (at(a, 1) - at(target, 1)));
            if before==0 and distance<v.remaining then v.remaining=distance;v.closest=id end
            if (distance < 1.2) then
              local travel = (function() if (distance < 0.1) then return at(a, 2) else return math.atan((at(target, 0) - at(a, 0)), (at(target, 1) - at(a, 1))) end end)();
              if (math.abs(wrap((travel - at(a, 2)))) > (math.pi / 2)) then
                travel = wrap((travel + math.pi));
              end
              if (((active(sweep(at(a, 0), at(a, 1), at(a, 2), travel)) and active(fits(((at(a, 0) + at(target, 0)) / 2), ((at(a, 1) + at(target, 1)) / 2), travel))) and active(fits(table.unpack(concat(target, {travel}))))) and active(sweep(table.unpack(concat(target, {travel}, {heading}))))) then
                (v).path = {};
                do
                  local i = id;
                  while (at(at((v).nodes, i), 3) ~= (-1)) do
                    do
                      prepend((v).path, pose(at((v).nodes, i)));
                    end
                    ::continue_9::
                    i = at(at((v).nodes, i), 3);
                  end
                end
                append((v).path, {at(a, 0), at(a, 1), travel}, concat(target, {travel}), concat(target, {heading}));
                break
              end
            end
            local moves = {{at(a, 0), at(a, 1), math.fmod((at(node, 2) + 1), 32), 0.3}, {at(a, 0), at(a, 1), math.fmod((at(node, 2) + 31), 32), 0.3}};
            for _, sign_ in ipairs({(-1), 1}) do
              do
                append(moves, {(at(a, 0) + (sign_ * .75 * math.sin(at(a, 2)))), (at(a, 1) + (sign_ * .75 * math.cos(at(a, 2)))), at(node, 2), 1});
              end
              ::continue_10::
            end
            for _, move in ipairs(moves) do
              do
                do
                  if ((math.abs((at(move, 0) - (v).ox)) > 24) or (math.abs((at(move, 1) - (v).oz)) > 24)) then
                    goto continue_11
                  end
                  local state = key(move);
                  local cost = (at(node, 4) + at(move, 3));
                  local old = at((v).best, state);
                  if (active(at((v).closed, state)) or ((old ~= nil) and (at(at((v).nodes, old), 4) <= cost))) then
                    goto continue_11
                  end
                  local b = pose(move);
                  local after = obstruction(table.unpack(b));
                  if ((after ~= 0) and (after >= (before - 0.02))) then
                    goto continue_11
                  end
                  local half = obstruction(((at(a, 0) + at(b, 0)) / 2), ((at(a, 1) + at(b, 1)) / 2), wrap((at(a, 2) + (wrap((at(b, 2) - at(a, 2))) / 2))));
                  if ((half ~= 0) and (half >= (before - 0.01))) then
                    goto continue_11
                  end
                  local next = #((v).nodes);
                  append((v).nodes, {at(move, 0), at(move, 1), at(move, 2), id, cost});
                  ((v).best)[index(state)] = next;
                  push(cost+1.5*hypot(b[1]-target[1],b[2]-target[2]),next);
                end
              end
              ::continue_11::
            end
          end
        end
        ::continue_8::
        count = count + 1;
      end
    end
    if not v.path and (#v.queue==0 or #v.nodes>=1500) then
      local initial=hypot(target[1]-v.ox,target[2]-v.oz)
      if v.remaining>initial-3 then return false end
      v.path={};v.partial=true
      local id=v.closest
      while v.nodes[id+1][4]~=-1 do
        table.insert(v.path,1,pose(v.nodes[id+1]))
        id=v.nodes[id+1][4]
      end
    end
    if active((v).path) then
      while ((v).at < (#((v).path) - 1)) do
        do
          do
            local next = at((v).path, (v).at);
            local previous = (function() if active((v).at) then return at((v).path, ((v).at - 1)) else return {(v).ox, (v).oz} end end)();
            local rotation = (hypot((at(next, 0) - at(previous, 0)), (at(next, 1) - at(previous, 1))) < 0.1);
            if (active((function() if active(rotation) then return (math.abs(wrap((at(next, 2) - yaw))) >= 0.12) else return (hypot((at(next, 0) - at(pivot, 0)), (at(next, 1) - at(pivot, 1))) >= 0.25) end end)()) or (speed >= 0.25)) then
              break
            end
            (v).at = (v).at + 1;
          end
        end
        ::continue_12::
      end
      goal = at((v).path, (v).at);
      if v.partial and v.at==#v.path-1 and hypot(goal[1]-pivot[1],goal[2]-pivot[2])<.3 and speed<.25 then
        m.nav=nil;return true
      end
      if (obstruction(table.unpack(goal)) > (obstruction(at(pivot, 0), at(pivot, 1), yaw) + 0.05)) then
        do return false end
      end
      driving = true;
    end
    do return true end
  end;
  if ((((m).phase == "seek") and (not active((grip).attached))) and (t > (function() local value = (m).wait; if active(value) then return value else return 0 end end)())) then
    local resting = find((s).nearby, function(b)
      return (function() local value = (function() local value = (b).cargo; if active(value) then return ((b).carriedBy == (s).id) else return value end end)(); if active(value) then return (not active((b).magnetHeld)) else return value end end)()
    end);
    if active(resting) then
      (m).job = (resting).id;
      (m).shedYaw = yaw;
      (m).shedDirection = (((((at((resting).centerOfMass, 0) - (s).x) * math.sin(yaw)) + ((at((resting).centerOfMass, 2) - (s).z) * math.cos(yaw))) > 0) and (-1) or 1);
      phase("shed");
    end
  end
  if ((m).phase == "shed") then
    lift = 0;
    power = false;
    local resting = find((s).nearby, function(b)
      return ((b).id == (m).job)
    end);
    if (((not active(resting)) or ((resting).carriedBy ~= (s).id)) or ((t - (m).at) > 8)) then
      (m).job = 0;
      (m).wait = (t + 3);
      phase("seek");
    else
      throttle = (0.3 * (m).shedDirection);
      turn = clamp(((0.8 * wrap(((m).shedYaw - yaw))) - (0.65 * at((s).gyroscope, 1))), 0.4);
    end
  end
  if ((m).phase == "seek") then
    lift = 0;
    power = false;
    local jobs = sort(filter((s).nearby, function(b)
      if t<(m.failed[b.id] or 0) then return false end
      return (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (b).cargo; if active(value) then return (b).delivered else return value end end)(); if active(value) then return ((b).mass > 8) else return value end end)(); if active(value) then return (not active((b).carriedBy)) else return value end end)(); if active(value) then return (not active((b).magnetHeld)) else return value end end)(); if active(value) then return (math.abs(((b).y - (s).y)) < 2) else return value end end)(); if active(value) then return some(pads, function(p)
        return (hypot((at((b).centerOfMass, 0) - (p).x), (at((b).centerOfMass, 2) - (p).z)) < (((p).radius + (b).radius) + 2))
      end) else return value end end)()
    end), function(a, b)
      return (hypot(((a).x - (s).x), ((a).z - (s).z)) - hypot(((b).x - (s).x), ((b).z - (s).z)))
    end);
    if (active(#(jobs)) and (t > (function() local value = (m).wait; if active(value) then return value else return 0 end end)())) then
      box = at(jobs, 0);
      (m).job = (box).id;
      (m).picks = {};
      (m).pickIndex = 0;
      phase("plan_pick");
    end
  end
  if ((m).phase == "plan_pick") then
    if ((not active(box)) or active((box).carriedBy)) then
      phase("seek");
    else
      local angle = (((function() local old = (m).pickIndex; (m).pickIndex = (m).pickIndex + 1;
      return old end)() * math.pi) / 4);
      local c = (box).centerOfMass;
      local d = {math.sin(angle), math.cos(angle)};
      local p = {(at(c, 0) + (7 * at(d, 0))), (at(c, 2) + (7 * at(d, 1)))};
      local blocked = 0;
      do
        local k = 2;
        while (k <= 7) do
          do
            if (not active(rootFits((at(c, 0) + (k * at(d, 0))), (at(c, 2) + (k * at(d, 1))), math.atan((-at(d, 0)), (-at(d, 1)))))) then
              blocked = blocked + 1;
            end
          end
          ::continue_13::
          k = k + 1;
        end
      end
      append((m).picks, {point = p, yaw = math.atan((-at(d, 0)), (-at(d, 1))), score = ((blocked * 50) + hypot((at(p, 0) - (s).x), (at(p, 1) - (s).z)))});
      if ((m).pickIndex == 8) then
        sort((m).picks, function(a, b)
          return ((a).score - (b).score)
        end);
        (m).pick = shift((m).picks);
        phase("route_pick");
      end
    end
  end
  if ((m).phase == "route_pick") then
    if ((not active(box)) or active((box).carriedBy)) then
      (m).wait = (t + 5);
      phase("seek");
    else
      if (not active(navigate(((m).pick).point, ((m).pick).yaw))) then
        (m).pick = shift((m).picks);
        (m).nav = nil;
        if (not active((m).pick)) then
          m.failed[m.job]=t+90
          (m).resume = "seek";
          phase("unstick");
        end
      else
        if ((active(optional((m).nav, "path")) and not m.nav.partial and (((m).nav).at == (#(((m).nav).path) - 1))) and (speed < 0.2)) then
          phase("align_pick");
        end
      end
    end
  end
  if ((m).phase == "align_pick") then
    turn = clamp(((0.8 * wrap((((m).pick).yaw - yaw))) - (0.65 * at((s).gyroscope, 1))), 0.7);
    if ((math.abs(wrap((((m).pick).yaw - yaw))) < 0.07) and (math.abs(at((s).gyroscope, 1)) < 0.1)) then
      phase("lower_pick");
    else
      if ((t - (m).at) > 15) then
        (m).resume = "seek";
        phase("unstick");
      end
    end
  end
  if ((m).phase == "lower_pick") then
    lift = pickupLift;
    if active(every(rams, function(b)
      return math.abs(at(s.angles,b.i)-pickupLift)<.04
    end)) then
      phase("approach");
    end
  end
  if ((m).phase == "approach") then
    lift = pickupLift;
    power = true;
    if (active((grip).attached) and ((grip).creature == (m).job)) then
      phase("lift");
    else
      if ((not active(box)) or ((t - (m).at) > 20)) then
        (m).resume = "seek";
        phase("unstick");
      else
        local tip = at((s).positions, (head).i);
        local dx = (at((box).centerOfMass, 0) - at(tip, 0));
        local dz = (at((box).centerOfMass, 2) - at(tip, 2));
        local forward = ((dx * math.sin(yaw)) + (dz * math.cos(yaw)));
        local side = ((dx * math.cos(yaw)) - (dz * math.sin(yaw)));
        local error = math.atan(side, math.max(1, forward));
        local want = (0.3 * math.max(0, (1 - (math.abs(error) / 0.2))));
        turn = clamp(((0.8 * error) - (0.65 * at((s).gyroscope, 1))), 0.5);
        throttle = clamp(((0.2 * want) + (0.5 * (want - at((s).localVelocity, 2)))), 0.4);
        if (forward < (-0.5)) then
          (m).resume = "seek";
          phase("unstick");
        end
      end
    end
  end
  if ((m).phase == "lift") then
    power = true;
    if (active(every(rams, function(b)
      return (at((s).angles, (b).i) > math.min(1.3, ((b).travel - 0.05)))
    end)) and ((t - (m).at) > 1)) then
      (m).retreat = {(s).x, (s).z, yaw};
      phase("clear_pick");
    end
  end
  if ((m).phase == "clear_pick") then
    throttle = (-0.4);
    turn = clamp(((0.8 * wrap((at((m).retreat, 2) - yaw))) - (0.65 * at((s).gyroscope, 1))), 0.4);
    if ((hypot(((s).x - at((m).retreat, 0)), ((s).z - at((m).retreat, 1))) > 3) or ((t - (m).at) > 6)) then
      phase("plan_store");
    end
  end
  if (((m).phase == "plan_store") and active(box)) then
    if (not active((m).plan)) then
      (m).plan = {at = 0, options = {}};
    end
    local angle = (yaw + ((((active(math.fmod(((m).plan).at, 2)) and (-1) or 1) * math.ceil((((m).plan).at / 2))) * math.pi) / 12));
    local dx = math.sin(angle);
    local dz = math.cos(angle);
    local reach = hypot((at((box).centerOfMass, 0) - (s).x), (at((box).centerOfMass, 2) - (s).z));
    local space = ((box).radius + 0.5);
    for _, length in ipairs({12, 16, 20, 24}) do
      do
        do
          local point = {((s).x + (dx * length)), ((s).z + (dz * length))};
          local cargo = {(at(point, 0) + (dx * reach)), (at(point, 1) + (dz * reach))};
          if ((active(rootFits(table.unpack(concat(point, {angle})))) and active(rootFits((at(point, 0) - (dx * 3)), (at(point, 1) - (dz * 3)), angle))) and active(room(table.unpack(concat(cargo, {space}))))) then
            append(((m).plan).options, {point = point, yaw = wrap(angle), score = (length + math.abs(wrap((angle - yaw))))});
          end
        end
      end
      ::continue_14::
    end
    if ((function() local old = ((m).plan).at; ((m).plan).at = ((m).plan).at + 1;
    return ((m).plan).at end)() == 24) then
      (m).options = sort(((m).plan).options, function(a, b)
        return ((a).score - (b).score)
      end);
      (m).plan = nil;
      if active(#((m).options)) then
        phase("route_store");
      else
        (m).resume = "plan_store";
        phase("unstick");
      end
    end
  end
  if (((((m).phase == "route_store") and active(box)) and active(room(at((box).centerOfMass, 0), at((box).centerOfMass, 2), ((box).radius + 0.5)))) and active(rootFits((s).x, (s).z, yaw))) then
    (m).options = {{point = {(s).x, (s).z}, yaw = yaw}};
    phase("align_store");
  end
  if ((m).phase == "route_store") then
    local target = optional((m).options, 0, true);
    if (not active(target)) then
      phase("plan_store");
    else
      if ((not active(rootFits(table.unpack(concat((target).point, {(target).yaw}))))) or (not active(navigate((target).point, (target).yaw)))) then
        shift((m).options);
        (m).nav = nil;
      else
        if ((active(optional((m).nav, "path")) and not m.nav.partial and (((m).nav).at == (#(((m).nav).path) - 1))) and (speed < 0.2)) then
          phase("align_store");
        end
      end
    end
  end
  if ((m).phase == "align_store") then
    driving = false;
    local target = optional((m).options, 0, true);
    if (not active(box)) then
      phase("seek");
    else
      if (not active(target)) then
        phase("plan_store");
      else
        local error = wrap(((target).yaw - yaw));
        turn = clamp(((0.8 * error) - (0.65 * at((s).gyroscope, 1))), 0.5);
        if (((math.abs(error) < 0.07) and (math.abs(at((s).gyroscope, 1)) < 0.1)) and active(room(at((box).centerOfMass, 0), at((box).centerOfMass, 2), ((box).radius + 0.5)))) then
          phase("settle");
        else
          if ((t - (m).at) > 40) then
            shift((m).options);
            phase("route_store");
          end
        end
      end
    end
  end
  if ((m).phase == "settle") then
    if (((speed < 0.08) and (math.abs(at((s).gyroscope, 1)) < 0.08)) and ((t - (m).at) > 1)) then
      phase("lower");
    end
  end
  if ((m).phase == "lower") then
    lift = 0;
    if (((grip).cargoSupportForce > 8) and ((t - (m).at) > 1)) then
      phase("release");
    end
  end
  if ((m).phase == "release") then
    lift = 0;
    power = false;
    if ((t - (m).at) > 1.5) then
      if m.restack then m.restack=nil;m.rearranged=(m.rearranged or 0)+1 else m.jobs=m.jobs+1 end
      (m).job = 0;
      phase("back");
    end
  end
  if ((m).phase == "back") then
    power = false;
    throttle = (-0.4);
    if ((t - (m).at) > 2.5) then
      phase("route_home");
    end
  end
  if ((m).phase == "route_home") then
    power = false;
    if (not active(navigate((m).home))) then
      phase("seek");
    else
      if ((hypot(((s).x - at((m).home, 0)), ((s).z - at((m).home, 1))) < 1.2) and (speed < 0.35)) then
        phase("seek");
      end
    end
  end
  if (active(driving) and active(optional((m).nav, "path"))) then
    local previous = (function() if active(((m).nav).at) then return at(((m).nav).path, (((m).nav).at - 1)) else return {((m).nav).ox, ((m).nav).oz} end end)();
    local turning = (hypot((at(goal, 0) - at(previous, 0)), (at(goal, 1) - at(previous, 1))) < 0.1);
    local distance = hypot((at(goal, 0) - at(pivot, 0)), (at(goal, 1) - at(pivot, 1)));
    local aim = wrap((math.atan((at(goal, 0) - at(pivot, 0)), (at(goal, 1) - at(pivot, 1))) - yaw));
    local gear = ((math.abs(aim) > (math.pi / 2)) and (-1) or 1);
    local error = (function() if (active(turning) or (distance < 0.25)) then return wrap((at(goal, 2) - yaw)) else return wrap((aim + (function() if (gear < 0) then return math.pi else return 0 end end)())) end end)();
    local want = ((active(turning) or (distance < 0.25)) and 0 or ((gear * math.min(0.65, (distance * 0.6))) * math.max(0, (1 - (math.abs(error) / 0.35)))));
    turn = clamp(((0.8 * error) - (0.65 * at((s).gyroscope, 1))), 0.7);
    throttle = clamp(((0.2 * want) + (0.5 * (want - at((s).localVelocity, 2)))), 0.65);
    if ((((not active((m).best)) or (at(goal, 0) ~= at((m).best, 0))) or (at(goal, 1) ~= at((m).best, 1))) or (at(goal, 2) ~= at((m).best, 4))) then
      (m).best = {at(goal, 0), at(goal, 1), distance, math.abs(error), at(goal, 2)};
      (m).progress = t;
    end
    if ((distance < (at((m).best, 2) - 0.15)) or (math.abs(error) < (at((m).best, 3) - 0.05))) then
      ((m).best)[index(2)] = math.min(at((m).best, 2), distance);
      ((m).best)[index(3)] = math.min(at((m).best, 3), math.abs(error));
      (m).progress = t;
    end
    if ((t - (m).progress) > 8) then
      (m).resume = (m).phase;
      phase("unstick");
    end
  end
  if ((m).phase == "unstick") then
    throttle = (-0.4);
    turn = 0;
    if (not active((grip).attached)) then
      power = false;
    end
    if ((t - (m).at) > 2) then
      phase((m).resume);
    end
  end
  if (active((grip).attached) and ((grip).creature ~= (m).job)) then
    power = false;
    (m).resume = "seek";
    phase("unstick");
  end
  if (active(includes({"lift", "clear_pick", "plan_store", "route_store", "align_store", "settle", "lower"}, (m).phase)) and (not active((grip).attached))) then
    (m).plan = nil;
    phase("seek");
  end
  if active(throttle) then
    local ahead=driving and goal and math.min(1.2,hypot(goal[1]-pivot[1],goal[2]-pivot[2])) or 1.2
    local dx = math.sin(yaw)*sign(throttle)*ahead;
    local dz = math.cos(yaw)*sign(throttle)*ahead;
    if (not active(every(wheels, function(b)
      return floor((at(at((s).positions, (b).i), 0) + dx), (at(at((s).positions, (b).i), 2) + dz), 0.85)
    end))) then
      throttle = 0;
      if ((m).phase == "clear_pick") then
        phase("plan_store");
      end
    end
  end
  if (((s).up < 0.25) or ((s).ground < ((s).waterHeight + 0.5))) then
    throttle = (function() turn = 0;
    return turn end)();
  end
  for _, b in ipairs(wheels) do
    do
      set(b, clamp((throttle - (turn * sign(((b).x - (at(parts, 0)).x))))));
    end
    ::continue_15::
  end
  for _, b in ipairs(rams) do
    do
      set(b, clamp((((math.min(lift, (b).travel) - at((s).angles, (b).i)) * 2) - (0.3 * at((s).rates, (b).i)))));
    end
    ::continue_16::
  end
  set(head, (active(power) and 1 or (-1)));
  do return out end
end
