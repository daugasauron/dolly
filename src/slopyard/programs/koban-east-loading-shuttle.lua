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
    m.supported = 0
    m.offered = nil
    if name == "release" then m.handed = true end
  end;
  local extension = reduce(rails, function(v, b)
    return (v + at((s).angles, (b).i))
  end, 0);
  local home = {(at(tip, 0) + extension), (at(tip, 1) - at((s).angles, (lift).i)), (at(tip, 2) + at((s).angles, (cross).i))};
  local travel = reduce(rails, function(v, b)
    return (v + (b).travel)
  end, 0);
  local function pickup(box)
    local point,edge=nil,-math.huge
    if box then for _,shape in ipairs(s.bounds(box.id)) do
      local x=shape.x+shape.halfX+.555
      if shape.body==0 and x<=home[1]+.2 and x>=home[1]-travel
        and shape.z<=home[3]+.2 and shape.z>=home[3]-cross.travel-.2 and x>edge then
        edge=x
        point={math.max(home[1]-travel,math.min(home[1],x)),
          math.max(home[2],math.min(home[2]+lift.travel,(shape.low+shape.high)/2+.7)),
          math.max(home[3]-cross.travel,math.min(home[3],shape.z))}
      end
    end end
    return point
  end
  local function reachable(box) return pickup(box)~=nil end

  if (not active((m).phase)) then
    local station = at(sort(filter((s).nearby, function(b)
      if not b.anchored or b.team ~= s.team then return false end
      local axes = {}
      for _, part in ipairs(s.parts(b.id)) do if part.joint == 7 then axes[math.abs(part.axisY) > .8 and 1 or math.abs(part.axisX) > .8 and 0 or 2] = true end end
      return axes[0] and axes[1]
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
  if (m.phase ~= "idle" and m.phase ~= "clear" and m.phase ~= "release" and t-m.at > 45)
    or grip.attached and grip.creature ~= m.job then
    m.failures = (m.failures or 0)+1
    m.retryAfter = t+15
    m.handed = false
    phase("clear")
  end
  if m.phase == "idle" and t >= (m.retryAfter or 0) then
    local request = find((s).radio, function(r)
      return (function() local value = (function() local value = (function() local value = ((r).from == (m).station); if active(value) then return ((r).kind == "ready") else return value end end)(); if active(value) then return ((r).time > (m).readyAt) else return value end end)(); if active(value) then return (((s).worldTime - (r).time) < 5) else return value end end)()
    end);
    local available = function(b)
      if not b.cargo or b.carriedBy~=0 or b.mass>=1.5 or b.supply>0
        or b.team~=0 and b.team~=s.team or not reachable(b) then return false end
      for _,r in ipairs(s.radio) do
        if r.kind=='claim' and r.cargo==b.id and r.from~=s.id and s.worldTime-r.time<10 then return false end
      end
      return true
    end;
    local cargo = (function() local value = request; if active(value) then return (function() local value = find((s).nearby, function(b)
      return (function() local value = ((b).id == (request).cargo); if active(value) then return available(b) else return value end end)()
    end); if active(value) then return value else return at(sort(filter((s).nearby, available), function(a, b)
      return (hypot(((a).x - at(tip, 0)), ((a).z - at(tip, 2))) - hypot(((b).x - at(tip, 0)), ((b).z - at(tip, 2))))
    end), 0) end end)() else return value end end)();
    if active(cargo) then
      (m).job = (cargo).id;
      m.handed = false
      phase("align");
    end
  end
  if ((m).phase == "align") then
    if (not active(box)) then
      phase("idle");
    else
      local pick=pickup(box)
      target = {pick and pick[1] or tip[1],home[2]+lift.travel,home[3]};
      if ((math.abs((at(tip, 0) - at(target, 0))) < 0.08) and (at((s).angles, (cross).i) < 0.05)) then
        phase("pickup");
      end
    end
  end
  if ((m).phase == "pickup") then
    if ((not active(box)) or (active((box).carriedBy) and ((box).carriedBy ~= (s).id))) then
      phase("idle");
    else
      target = pickup(box) or tip;
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
    target = {at(tip, 0), (at(home, 1) + (lift).travel), at(tip, 2)};
    if ((active(box) and ((box).y > ((s).ground + 2))) and (math.abs(at((s).rates, (lift).i)) < 0.08)) then
      phase("aisle");
    end
  end
  if ((m).phase == "aisle") then
    power = true;
    target = {at(tip, 0), (at(home, 1) + (lift).travel), at(home, 2)};
    if (at((s).angles, (cross).i) < 0.05) then
      phase("deliver");
    end
  end
  if active(includes({"deliver", "handoff"}, (m).phase)) then
    power = true;
    target = {(at((m).dock, 0) + 1), (at(home, 1) + (lift).travel), at((m).dock, 2)};
    if active(box) then
      (target)[index(0)] = (at(tip, 0) + clamp((at((m).dock, 0) - (box).x), 0.8));
      (target)[index(2)] = (at(tip, 2) + clamp((at((m).dock, 2) - (box).z), 0.8));
      if (((m).phase == "deliver") and (hypot(((box).x - at((m).dock, 0)), ((box).z - at((m).dock, 2))) < 0.15)) then
        phase("handoff");
      end
      if ((m).phase == "handoff") then
        (target)[index(1)] = (at(tip, 1) + clamp((at((m).dock, 1) - (box).y), 0.3));
        local settled=hypot(box.vx,box.vy,box.vz)<.15
        m.still=settled and hypot(box.x-m.dock[1],box.y-m.dock[2],box.z-m.dock[3])<.18 and m.still+s.dt or 0
        if settled and hypot(box.x-m.dock[1],box.z-m.dock[3])<.18
          and grip.cargoSupportForce>box.mass*hypot(table.unpack(s.gravity))*.6 then
          m.supported=(m.supported or 0)+s.dt
        else m.supported=0 end
        if m.still>.5 or m.supported>.5 then
          if not m.offered then m.release=concat(tip);m.offered=t end
        end
        if m.offered then
          m.release=concat(tip)
          if t-m.offered>12 then phase("release") end
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
    local raised = at(s.angles, lift.i) > lift.travel-.05
    target = {raised and at(s.angles,cross.i)<.05 and at(home,0) or at(tip,0), at(home,1)+lift.travel, raised and at(home,2) or at(tip,2)};
    if box and box.carriedBy==m.station then
      local edge=box.x
      for _,shape in ipairs(s.bounds(box.id)) do
        if shape.body==0 then edge=math.max(edge,shape.x+shape.halfX) end
      end
      if tip[1]<edge+1.4 then target={math.min(home[1],edge+1.5),tip[2],tip[3]} end
    end
    if ((extension < 0.05) and (at((s).angles, (cross).i) < 0.05)) then
      (m).readyAt = (s).worldTime;
      if m.handed then (out).radio = {kind = "ready", cargo = (m).job} end
      phase("idle");
    end
  end
  if (active(includes({"raise", "aisle", "deliver", "handoff"}, (m).phase)) and (not active((grip).attached))) then
    m.handed = false
    power = false
    phase("clear");
  end
  if includes({"align","pickup","raise","aisle","deliver","handoff"},m.phase) and m.job then
    out.radio = {kind=m.phase=="handoff" and m.offered and "ready" or "claim",cargo=m.job}
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
  m.status = m.phase == "idle" and "Waiting for launcher request" or "Reload: "..m.phase
  set(head, (active(power) and 1 or (-1)));
  do return out end
end
