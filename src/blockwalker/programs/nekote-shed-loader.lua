return function(t, s, m, r)
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
  local steering={};local axleCenter=0
  for _,b in ipairs(wheels) do axleCenter=axleCenter+b.z end
  axleCenter=axleCenter/#wheels
  for _,b in ipairs(parts) do
    if b.joint==1 and b.axis==1 then
      local count,z=0,0
      for _,w in ipairs(wheels) do
        local parent=w.parent
        while parent>=0 and parent~=b.i do parent=at(parts,parent).parent end
        if parent==b.i then count=count+1;z=z+w.z end
      end
      if count>0 and count<#wheels then steering[#steering+1]={b=b,side=z/count>=axleCenter and 1 or -1} end
    end
  end

  local rams = filter(parts, function(b)
    return (function() local value = ((b).joint == 2); if active(value) then return ((b).axis == 1) else return value end end)()
  end);
  local head = find(parts, function(b)
    return ((b).joint == 5)
  end);
  local grip = at((s).magnets, (head).i);
  local tip = at((s).positions, (head).i);
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
    (m).nav = nil;
    (m).progress = t;
    (m).best = nil;
    (m).still = 0;
    (m).alignError = nil;
  end;
  if (not active((m).home)) then
    (m).home = {(s).x, (s).z};
    (m).bays = map({{(-1), 7}, {1, 7}, {2.5, 7}}, function(p)
      return {((s).x + at(p, 0)), ((s).z + at(p, 1))}
    end);
    (m).jobs = 0;
    (m).failed = {};
    (m).job = (function() if active((grip).attached) then return (grip).creature else return 0 end end)();
    (m).retreat = {(s).x, (s).z, yaw};
    phase((active((grip).attached) and "retreat" or "seek"));
  end
  if not m.receiverAt or t>=m.receiverAt then
    m.receiverAt=t+2
    local receiver,pivot,radius
    for _,c in ipairs(s.nearby) do
      if c.anchored and (c.team==0 or c.team==s.team) then
        local bearing,heads=nil,{}
        for _,p in ipairs(s.parts(c.id)) do
          if p.joint==7 and p.axisY>.9 then bearing=p end
          if p.joint==5 and p.axisY<-.9 then heads[#heads+1]=p end
        end
        if bearing and #heads>=2 then
          local reach=0;for _,h in ipairs(heads) do reach=math.max(reach,hypot(h.x-bearing.x,h.z-bearing.z)) end
          if reach>3 then receiver,pivot,radius=c,bearing,reach;break end
        end
      end
    end
    if receiver and m.receiver~=receiver.id then
      local bearing=math.atan(m.home[1]-pivot.x,m.home[2]-pivot.z)
      local depot,dist
      for _,d in ipairs(s.depots) do local n=hypot(d.x-pivot.x,d.z-pivot.z);if not dist or n<dist then depot,dist=d,n end end
      if depot then
        local outlet=math.atan(depot.x-pivot.x,depot.z-pivot.z)
        if math.abs(wrap(bearing-outlet))<1 then bearing=outlet+math.pi end
      end
      m.bays={}
      for _,delta in ipairs({0,-.3,.3}) do m.bays[#m.bays+1]={pivot.x+radius*math.sin(bearing+delta),pivot.z+radius*math.cos(bearing+delta)} end
      m.receiver=receiver.id;m.receiverSearch=nil
      if grip.attached then phase('wait_bay') end
    elseif not receiver and not m.receiver and (not m.receiverSearch or hypot(s.x-m.receiverSearch[1],s.z-m.receiverSearch[2])<4) then
      local depot,dist
      for _,d in ipairs(s.depots) do local n=hypot(d.x-m.home[1],d.z-m.home[2]);if not dist or n<dist then depot,dist=d,n end end
      if depot then
        local length=math.max(1,hypot(depot.x-s.x,depot.z-s.z));m.receiverSearch={s.x+(depot.x-s.x)*math.min(1,15/length),s.z+(depot.z-s.z)*math.min(1,15/length)}
        m.bays={m.receiverSearch};if grip.attached then phase('wait_bay') end
      end
    end
  end

  local box = find((s).nearby, function(b)
    return ((b).id == (m).job)
  end);
  local speed = hypot((s).vx, (s).vz);
  local width = math.max(table.unpack(map(wheels, function(b)
    return (math.abs(((b).x - (at(parts, 0)).x)) + 0.8)
  end)));
  local reserved = function(id)
    return some((s).radio, function(v)
      return (function() local value = (function() local value = (function() local value = ((v).kind == "claim"); if active(value) then return ((v).cargo == id) else return value end end)(); if active(value) then return ((v).from ~= (s).id) else return value end end)(); if active(value) then return (((s).worldTime - (v).time) < 10) else return value end end)()
    end)
  end;
  local inBay = function(b)
    return some((m).bays, function(p)
      return (hypot(((b).x - at(p, 0)), ((b).z - at(p, 1))) < 2)
    end)
  end;
  local freeBays = function()
    return filter((m).bays, function(p)
      return (not active(some((s).nearby, function(b)
        return (function() local value = (function() local value = (b).cargo; if active(value) then return ((b).id ~= (m).job) else return value end end)(); if active(value) then return (hypot((at((b).centerOfMass, 0) - at(p, 0)), (at((b).centerOfMass, 2) - at(p, 1))) < 1.3) else return value end end)()
      end)))
    end)
  end;
  local clearance = (math.max(width, table.unpack(map((s).positions, function(p)
    return (hypot((at(p, 0) - (s).x), (at(p, 2) - (s).z)) + 0.7)
  end))) + (active((grip).attached) and 1 or 0));
  local height = 0
  for _, p in ipairs(s.positions) do height = math.max(height, p[2]-s.ground+.7) end
  local ground, walls, busy, fixed, blockers = {}, {}, {}, {}, {}
  for _, b in ipairs(s.terrain) do
    if math.abs(b.high-s.ground)<.3 then ground[#ground+1]=b end
    if b.high>s.ground+.3 and b.low<s.ground+height then walls[#walls+1]=b end
  end
  m.geometry=m.geometry or {}
  local refresh
  for _, b in ipairs(s.nearby) do
    local working=false
    if b.anchored and b.team==s.team then
      for _, v in ipairs(s.radio) do
        if v.from==b.id and v.kind=='claim' and s.worldTime-v.time<6 then
          for _, cargo in ipairs(s.nearby) do if cargo.id==v.cargo and cargo.carriedBy==b.id then working=true end end
        end
      end
    end
    if working then busy[#busy+1]=merge({},b,{radius=math.max(b.radius,b.high-s.ground+1)}) end
    if (b.anchored and not working) or (b.radius>10 and b.id~=m.job) then
      fixed[#fixed+1]=b
      local cache=m.geometry[b.id]
      if not refresh and (not cache or t-cache.at>.5 or math.abs(cache.height-height)>.3) then refresh=b end
    elseif b.low<s.ground+height and b.high>s.ground+.2 then
      local radius=working and math.max(b.radius,b.high-s.ground+1) or b.radius
      local enemy=s.team~=0 and b.team~=0 and b.team~=s.team and not b.anchored and not b.cargo and b.carriedBy==0
      blockers[#blockers+1]={b.id,b.anchored and b.x or b.centerOfMass[1],b.anchored and b.z or b.centerOfMass[3],clearance+radius+(enemy and 6.5 or .1)}
    end
  end
  if refresh then
    local groups, boxes = {}, {}
    for _, b in ipairs(s.bounds(refresh.id)) do
      if b.high>s.ground+.3 and b.low<s.ground+height then
        local key=b.body+1
        local g=groups[key] or {left=math.huge,right=-math.huge,back=math.huge,front=-math.huge,low=math.huge,high=-math.huge}
        g.left=math.min(g.left,b.x-b.halfX);g.right=math.max(g.right,b.x+b.halfX)
        g.back=math.min(g.back,b.z-b.halfZ);g.front=math.max(g.front,b.z+b.halfZ)
        g.low=math.min(g.low,b.low);g.high=math.max(g.high,b.high);groups[key]=g
      end
    end
    for _, g in pairs(groups) do boxes[#boxes+1]={x=(g.left+g.right)/2,z=(g.back+g.front)/2,halfX=(g.right-g.left)/2,halfZ=(g.front-g.back)/2,low=g.low,high=g.high} end
    m.geometry[refresh.id]={at=t,height=height,boxes=boxes}
  end
  local present={}
  for _, b in ipairs(fixed) do
    present[b.id]=true
    local cache=m.geometry[b.id]
    if cache then for _, box in ipairs(cache.boxes) do walls[#walls+1]=box end
    else walls[#walls+1]={x=b.x,z=b.z,halfX=b.radius,halfZ=b.radius,low=b.low,high=b.high} end
  end
  for id in pairs(m.geometry) do if not present[id] then m.geometry[id]=nil end end
  local function floor(x,z,radius)
    radius=radius or width
    if s.ground<s.waterHeight+.5 then return false end
    for _, p in ipairs({{0,0},{-radius,-radius},{radius,-radius},{-radius,radius},{radius,radius}}) do
      local supported=false
      for _, b in ipairs(ground) do
        if math.abs(x+p[1]-b.x)<b.halfX and math.abs(z+p[2]-b.z)<b.halfZ then supported=true;break end
      end
      if not supported then return false end
    end
    return true
  end
  local land=floor
  local function overlap(x,z)
    local sum=0
    for _, b in ipairs(walls) do
      local distance=clearance-hypot(math.max(0,math.abs(x-b.x)-b.halfX),math.max(0,math.abs(z-b.z)-b.halfZ))
      if distance>0 then sum=sum+distance*distance end
    end
    for _, b in ipairs(blockers) do
      if b[1]~=m.job then local distance=b[4]-hypot(x-b[2],z-b[3]);if distance>0 then sum=sum+distance*distance end end
    end
    return sum
  end
  local function clear(x,z) return land(x,z) and overlap(x,z)==0 end
  local goal = nil;
  local driving = false;
  local lift = 1.1;
  local power = (grip).attached;
  local throttle = 0;
  local turn = 0;
  local navigate = function(target)
    if (not active((m).nav)) then
      local n = 45;
      local step = 1.5;
      local ox = ((s).x - (22 * step));
      local oz = ((s).z - (22 * step));
      local start = ((22 * n) + 22);
      local distance = hypot((at(target, 0) - (s).x), (at(target, 1) - (s).z));
      (m).nav = {n = n, step = step, ox = ox, oz = oz, start = start, goal = slice(target), distance = distance, queue = {{0, start}}, from = {[index(start)] = (-1)}, cost = {[index(start)] = 0}, closed = {}, path = nil, at = 0, failed = false};
    end
    local v = (m).nav;
    local n = v.n
    local step = v.step
    local ox = v.ox
    local oz = v.oz
    local point = function(i)
      return {(ox + (math.fmod(i, n) * step)), (oz + (math.floor((i / n)) * step))}
    end;
    local push = function(entry)
      local i = #((v).queue);
      append((v).queue, entry);
      while active(i) do
        do
          do
            local parent = ((i - 1) >> 1);
            if (at(at((v).queue, parent), 0) <= at(entry, 0)) then
              break
            end
            ((v).queue)[index(i)] = at((v).queue, parent);
            i = parent;
          end
        end
        ::continue_2::
      end
      ((v).queue)[index(i)] = entry;
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
              if (at(last, 0) <= at(at((v).queue, j), 0)) then
                break
              end
              ((v).queue)[index(i)] = at((v).queue, j);
              i = j;
            end
          end
          ::continue_3::
        end
        ((v).queue)[index(i)] = last;
      end
      do return at(first, 1) end
    end;
    local budget = math.max(1, math.min(2, math.floor((48 / ((#((s).nearby) + #((s).terrain)) + 1)))));
    do
      local count = 0;
      while ((((not active((v).failed)) and (not active((v).path))) and active(#((v).queue))) and (count < budget)) do
        do
          do
            local i = pop();
            if active(at((v).closed, i)) then
              goto continue_4
            end
            ((v).closed)[index(i)] = true;
            local a = point(i);
            local remaining = hypot((at(a, 0) - at((v).goal, 0)), (at(a, 1) - at((v).goal, 1)));
            local finish = (function() local value = (function() local value = (remaining <= step); if active(value) then return clear(table.unpack((v).goal)) else return value end end)(); if active(value) then return clear(((at(a, 0) + at((v).goal, 0)) / 2), ((at(a, 1) + at((v).goal, 1)) / 2)) else return value end end)();
            if (active(finish) or (((hypot((at(a, 0) - (ox + (22 * step))), (at(a, 1) - (oz + (22 * step)))) >= 24) and (remaining < ((v).distance - 6))) and active(clear(table.unpack(a))))) then
              (v).path = {};
              do
                local j = i;
                while (j ~= (v).start) do
                  do
                    prepend((v).path, point(j));
                  end
                  ::continue_5::
                  j = at((v).from, j);
                end
              end
              if active(finish) then
                append((v).path, (v).goal);
              end
              break
            end
            if ((active(clear(table.unpack(a))) and (remaining < ((v).distance - 3))) and ((not active((v).best)) or (remaining < at((v).best, 1)))) then
              (v).best = {i, remaining};
            end
            local before = overlap(table.unpack(a));
            for _, d in ipairs({(-1), 1, (-n), n, ((-n) - 1), ((-n) + 1), (n - 1), (n + 1)}) do
              do
                do
                  local j = (i + d);
                  if ((((j < 0) or (j >= (n * n))) or (math.abs((math.fmod(j, n) - math.fmod(i, n))) > 1)) or active(at((v).closed, j))) then
                    goto continue_6
                  end
                  local p = point(j);
                  local mid = {((at(p, 0) + at(a, 0)) / 2), ((at(p, 1) + at(a, 1)) / 2)};
                  local cost = (at((v).cost, i) + (hypot((at(p, 0) - at(a, 0)), (at(p, 1) - at(a, 1))) / step));
                  if ((((at((v).cost, j) ~= nil) and (cost >= at((v).cost, j))) or (not active(land(table.unpack(p))))) or (not active(land(table.unpack(mid))))) then
                    goto continue_6
                  end
                  local after = overlap(table.unpack(p));
                  local half = overlap(table.unpack(mid));
                  if (((after == 0) or (after < (before - 0.05))) and ((half == 0) or (half < (before - 0.01)))) then
                    ((v).from)[index(j)] = i;
                    ((v).cost)[index(j)] = cost;
                    push({(cost + (hypot((at(p, 0) - at((v).goal, 0)), (at(p, 1) - at((v).goal, 1))) / step)), j});
                  end
                end
              end
              ::continue_6::
            end
          end
        end
        ::continue_4::
        count = count + 1;
      end
    end
    if ((not active((v).path)) and (not active(#((v).queue)))) then
      if active((v).best) then
        (v).path = {};
        do
          local j = at((v).best, 0);
          while (j ~= (v).start) do
            do
              prepend((v).path, point(j));
            end
            ::continue_7::
            j = at((v).from, j);
          end
        end
      else
        (v).failed = true;
      end
    end
    if active((v).path) then
      while (((v).at < (#((v).path) - 1)) and (hypot((at(at((v).path, (v).at), 0) - (s).x), (at(at((v).path, (v).at), 1) - (s).z)) < (#steering>0 and 4 or .8))) do
        do
          (v).at = (v).at + 1;
        end
        ::continue_8::
      end
      goal = at((v).path, (v).at);
      if ((not active(clear(table.unpack(goal)))) and (overlap(table.unpack(goal)) > (overlap((s).x, (s).z) + 0.05))) then
        (m).nav = nil;
        do return true end
      end
      driving = true;
      if ((((v).at == (#((v).path) - 1)) and (hypot((at(goal, 0) - (s).x), (at(goal, 1) - (s).z)) < 1)) and (hypot((at(target, 0) - (s).x), (at(target, 1) - (s).z)) > 2)) then
        (m).nav = nil;
      end
    end
    do return (not active((v).failed)) end
  end;
  local abandon = function()
    ((m).failed)[index((m).job)] = (t + 90);
    (m).job = 0;
    (m).patrol = nil;
    phase("seek");
  end;
  if (active(includes({"plan_pick", "route_pick", "align_pick", "lower_pick", "approach"}, (m).phase)) and ((((not active(box)) or active((box).delivered)) or (active((box).carriedBy) and ((box).carriedBy ~= (s).id))) or active(reserved((m).job)))) then
    abandon();
  end
  local threats = s.team==0 and {} or filter((s).nearby, function(b)
    return s.team~=0 and b.team~=0 and b.team~=s.team and not b.anchored and not b.cargo and b.carriedBy==0 and b.low<s.ground+3 and b.high>s.ground and hypot(b.x-s.x,b.z-s.z)<b.radius+clearance+6
  end);
  if active(#(threats)) then
    (m).danger = t;
    if ((m).phase ~= "evade") then
      phase("evade");
    end
  end
  if ((m).phase == "evade") then
    if ((not active(#(threats))) and ((t - (m).danger) > 3)) then
      if active((grip).attached) then
        phase("wait_bay");
      else
        (m).job = 0;
        phase("seek");
      end
    else
      if active(#(threats)) then
        local dx = 0;
        local dz = 0;
        for _, b in ipairs(threats) do
          do
            do
              local d = math.max(1, hypot(((s).x - (b).x), ((s).z - (b).z)));
              dx = (dx + ((((s).x - (b).x) / d) / d));
              dz = (dz + ((((s).z - (b).z) / d) / d));
            end
          end
          ::continue_9::
        end
        local away = math.atan(dx, dz);
        local before = overlap((s).x, (s).z);
        local options = {};
        for _, length in ipairs({14, 10, 6}) do
          do
            do
              for _, turn in ipairs({0, (-0.5), 0.5, (-1), 1, (-1.5), 1.5, (-2), 2, (-2.5), 2.5, (-3), 3}) do
                do
                  do
                    local a = (away + turn);
                    local p = {((s).x + (length * math.sin(a))), ((s).z + (length * math.cos(a)))};
                    if active(every({0.25, 0.5, 0.75, 1}, function(u)
                      local x = ((s).x + (u * (at(p, 0) - (s).x)));
                      local z = ((s).z + (u * (at(p, 1) - (s).z)));
                      do return (function() local value = land(x, z, clearance); if active(value) then return (overlap(x, z) <= (before + 0.01)) else return value end end)() end
                    end)) then
                      append(options, p);
                    end
                  end
                end
                ::continue_11::
              end
              if active(#(options)) then
                break
              end
            end
          end
          ::continue_10::
        end
        if active(#(options)) then
          goal = at(options, 0);
          driving = true;
        end
      end
    end
  end
  if ((m).phase == "seek") then
    power = false;
    local jobs = (function() if active(#(freeBays())) then return sort(filter((s).nearby, function(b)
      return (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (function() local value = (b).cargo; if active(value) then return (not active((b).delivered)) else return value end end)(); if active(value) then return ((b).mass < 1.5) else return value end end)(); if active(value) then return (not active((b).carriedBy)) else return value end end)(); if active(value) then return (not active((b).magnetHeld)) else return value end end)(); if active(value) then return (not active(inBay(b))) else return value end end)(); if active(value) then return (not active(reserved((b).id))) else return value end end)(); if active(value) then return (t > (function() local value = at((m).failed, (b).id); if active(value) then return value else return 0 end end)()) else return value end end)(); if active(value) then return (math.abs((((b).y - (s).ground) - 0.5)) < 0.6) else return value end end)(); if active(value) then return (hypot((b).vx, (b).vz) < 0.4) else return value end end)()
    end), function(a, b)
      return (hypot(((a).x - (s).x), ((a).z - (s).z)) - hypot(((b).x - (s).x), ((b).z - (s).z)))
    end) else return {} end end)();
    if active(#(jobs)) then
      box = at(jobs, 0);
      (m).job = (box).id;
      (m).picks = {};
      (m).pickIndex = 0;
      phase("plan_pick");
    else
      if (((not active((m).patrol)) or (t > (m).patrolUntil)) or (hypot(((s).x - at((m).patrol, 0)), ((s).z - at((m).patrol, 1))) < 1.5)) then
        (m).patrol = nil;
        local a = ((r() * math.pi) * 2);
        local d = (12 + (60 * r()));
        local p = {(at((m).home, 0) + (math.sin(a) * d)), (at((m).home, 1) + (math.cos(a) * d))};
        if active(clear(table.unpack(p))) then
          (m).patrol = p;
          (m).patrolUntil = (t + math.max(60, ((2 * hypot((at(p, 0) - (s).x), (at(p, 1) - (s).z))) + 30)));
          (m).nav = nil;
        end
      end
      if (active((m).patrol) and (not active(navigate((m).patrol)))) then
        (m).patrol = nil;
      end
    end
  end
  if ((m).phase == "plan_pick") then
    do
      local angle = (((function() local old = (m).pickIndex; (m).pickIndex = (m).pickIndex + 1;
      return old end)() * math.pi) / 4);
      local d = {math.sin(angle), math.cos(angle)};
      local point = {((box).x + (6 * at(d, 0))), ((box).z + (6 * at(d, 1)))};
      local blocked = 0;
      do
        local k = 2;
        while (k <= 6) do
          do
            if (not active(clear(((box).x + (k * at(d, 0))), ((box).z + (k * at(d, 1)))))) then
              blocked = blocked + 1;
            end
          end
          ::continue_12::
          k = k + 1;
        end
      end
      append((m).picks, {point = point, yaw = math.atan((-at(d, 0)), (-at(d, 1))), score = ((blocked * 50) + hypot((at(point, 0) - (s).x), (at(point, 1) - (s).z)))});
      if ((m).pickIndex == 8) then
        sort((m).picks, function(a, b)
          return ((a).score - (b).score)
        end);
        (m).pick = shift((m).picks);
        phase("route_pick");
      end
    end
  end
  if (active((m).job) and active(includes({"plan_pick", "route_pick", "align_pick", "lower_pick", "approach", "lift", "retreat", "route_bay", "align_bay", "lower", "release", "back"}, (m).phase))) then
    (out).radio = {kind = "claim", cargo = (m).job};
  end
  if ((m).phase == "route_pick") then
    if (not active(navigate(((m).pick).point))) then
      (m).pick = shift((m).picks);
      (m).nav = nil;
      if (not active((m).pick)) then
        abandon();
      end
    else
      if ((hypot(((s).x - at(((m).pick).point, 0)), ((s).z - at(((m).pick).point, 1))) < (#steering>0 and 2.2 or .8)) and (speed < (#steering>0 and 1.5 or .3))) then
        phase("align_pick");
      end
    end
  end
  if ((m).phase == "align_pick") then
    turn = clamp(((0.9 * wrap((((m).pick).yaw - yaw))) - (0.45 * at((s).gyroscope, 1))), 0.6);
    local error = math.abs(wrap((((m).pick).yaw - yaw)));
    if (((m).alignError == nil) or (error < ((m).alignError - 0.02))) then
      (m).alignError = error;
      (m).progress = t;
    end
    if ((error < 0.05) and (math.abs(at((s).gyroscope, 1)) < 0.1)) then
      phase("lower_pick");
    else
      if ((t - (m).progress) > 8) then
        abandon();
      end
    end
  end
  if ((m).phase == "lower_pick") then
    lift = 0;
    if active(every(rams, function(b)
      return (at((s).angles, (b).i) < 0.04)
    end)) then
      phase("approach");
    end
  end
  if ((m).phase == "approach") then
    lift = 0;
    power = true;
    if (active((grip).attached) and ((grip).creature == (m).job)) then
      phase("lift");
    else
      if ((not active(box)) or ((t - (m).at) > (#steering>0 and 45 or 25))) then
        abandon();
      else
        local dx = (at((box).centerOfMass, 0) - at(tip, 0));
        local dz = (at((box).centerOfMass, 2) - at(tip, 2));
        local forward = ((dx * math.sin(yaw)) + (dz * math.cos(yaw)));
        local side = ((dx * math.cos(yaw)) - (dz * math.sin(yaw)));
        local error = math.atan(side, math.max(1, forward));
        local want = (0.3 * math.max(0, (1 - (math.abs(error) / 0.2))));
        turn = clamp(((0.9 * error) - (0.45 * at((s).gyroscope, 1))), 0.5);
        throttle = clamp(((0.3 * want) + (0.5 * (want - at((s).localVelocity, 2)))), 0.4);
        if (forward < (-0.5)) then
          abandon();
        end
      end
    end
  end
  if ((m).phase == "lift") then
    power = true;
    if (active(every(rams, function(b)
      return (at((s).angles, (b).i) > 0.95)
    end)) and ((t - (m).at) > 1)) then
      (m).retreat = {(s).x, (s).z, yaw};
      phase("retreat");
    end
  end
  if ((m).phase == "retreat") then
    throttle = (-0.35);
    turn = clamp(((0.9 * wrap((at((m).retreat, 2) - yaw))) - (0.45 * at((s).gyroscope, 1))), 0.4);
    if ((hypot(((s).x - at((m).retreat, 0)), ((s).z - at((m).retreat, 1))) > 2) or ((t - (m).at) > 6)) then
      (m).bay = table.remove(filter(freeBays(), function(p)
        return clear(at(p, 0), ((at(p, 1) - (head).z) - 0.98))
      end));
      if active((m).bay) then
        phase("route_bay");
      else
        phase("wait_bay");
      end
    end
  end
  if ((m).phase == "wait_bay") then
    (m).bay = table.remove(filter(freeBays(), function(p)
      return clear(at(p, 0), ((at(p, 1) - (head).z) - 0.98))
    end));
    if active((m).bay) then
      phase("route_bay");
    else
      if ((hypot(((s).x - at((m).home, 0)), ((s).z - at((m).home, 1))) > 10) and (not active(navigate((m).home)))) then
        (m).resume = "wait_bay";
        phase("unstick");
      end
    end
  end
  if ((m).phase == "route_bay") then
    if (not active(some(freeBays(), function(p)
      return (function() local value = (at(p, 0) == at((m).bay, 0)); if active(value) then return (at(p, 1) == at((m).bay, 1)) else return value end end)()
    end))) then
      phase("wait_bay");
    else
      if (not active(navigate({at((m).bay, 0), ((at((m).bay, 1) - (head).z) - 0.98)}))) then
        (m).resume = "route_bay";
        phase("unstick");
      else
        if ((hypot(((s).x - at((m).bay, 0)), ((s).z - ((at((m).bay, 1) - (head).z) - 0.98))) < (#steering>0 and 2.2 or .7)) and (speed < (#steering>0 and 1.5 or .3))) then
          driving = false;
          phase("align_bay");
        end
      end
    end
  end
  if (((m).phase == "align_bay") and active(box)) then
    local error = wrap((math.atan((at((m).bay, 0) - (s).x), (at((m).bay, 1) - (s).z)) - math.atan(((box).x - (s).x), ((box).z - (s).z))));
    local dx = (at((m).bay, 0) - (box).x);
    local dz = (at((m).bay, 1) - (box).z);
    turn = clamp(((0.9 * error) - (0.45 * at((s).gyroscope, 1))), 0.5);
    if (math.abs(error) < 0.1) then
      local want = clamp((((dx * math.sin(yaw)) + (dz * math.cos(yaw))) * 0.5), 0.25);
      throttle = clamp(((0.3 * want) + (0.5 * (want - at((s).localVelocity, 2)))), 0.3);
      if ((hypot(dx, dz) < 0.18) and (speed < 0.1)) then
        phase("lower");
      end
    end
    if ((t - (m).at) > (#steering>0 and 120 or 30)) then
      phase("route_bay");
    end
  end
  if ((m).phase == "lower") then
    lift = 0;
    local settled = (function() local value = (function() local value = (function() local value = box; if active(value) then return every(rams, function(b)
      return (at((s).angles, (b).i) < 0.04)
    end) else return value end end)(); if active(value) then return ((grip).cargoSupportForce > (((box).mass * hypot(table.unpack((s).gravity))) * 0.6)) else return value end end)(); if active(value) then return (hypot((box).vx, (box).vy, (box).vz) < 0.12) else return value end end)();
    (m).still = (active(settled) and ((m).still + (s).dt) or 0);
    if ((m).still > 0.5) then
      phase("release");
    end
  end
  if ((m).phase == "release") then
    lift = 0;
    power = false;
    if ((t - (m).at) > 1) then
      (m).jobs = (m).jobs + 1;
      (m).back = {(s).x, (s).z, yaw};
      phase("back");
    end
  end
  if ((m).phase == "back") then
    lift = 0;
    power = false;
    throttle = (-0.35);
    turn = clamp(((0.9 * wrap((at((m).back, 2) - yaw))) - (0.45 * at((s).gyroscope, 1))), 0.4);
    if (hypot(((s).x - at((m).back, 0)), ((s).z - at((m).back, 1))) > 3) then
      (m).job = 0;
      (m).patrol = nil;
      phase("seek");
    end
  end
  if grip.attached and m.receiverSearch and not m.receiver then
    if not navigate(m.receiverSearch) then m.nav=nil end
  end
  m.status=m.receiver and ('Feeding carousel / '..m.phase) or 'Finding a cargo receiver'
  if active(driving) then
    local distance = hypot((at(goal, 0) - (s).x), (at(goal, 1) - (s).z));
    local aim = wrap((math.atan((at(goal, 0) - (s).x), (at(goal, 1) - (s).z)) - yaw));
    local gear = ((math.abs(aim) > (math.pi / 2)) and (-1) or 1);
    local error = wrap((aim + (function() if (gear < 0) then return math.pi else return 0 end end)()));
    local want = ((gear * math.min((((m).phase == "evade") and 1.6 or 0.9), (distance * 0.6))) * math.max(0, (1 - (math.abs(error) / 0.5))));
    turn = clamp(((0.9 * error) - (0.45 * at((s).gyroscope, 1))), 0.6);
    throttle = clamp(((0.3 * want) + (0.5 * (want - at((s).localVelocity, 2)))), (((m).phase == "evade") and 0.9 or 0.65));
    if (((not active((m).best)) or (at(goal, 0) ~= at((m).best, 0))) or (at(goal, 1) ~= at((m).best, 1))) then
      (m).best = concat(goal, {distance}, {math.abs(error)});
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
    throttle = (-0.35);
    turn = 0;
    if ((t - (m).at) > 2) then
      phase((m).resume);
    end
  end
  if (active((grip).attached) and ((grip).creature ~= (m).job)) then
    power = false;
    abandon();
  end
  if (active(includes({"lift", "retreat", "wait_bay", "route_bay", "align_bay", "lower"}, (m).phase)) and (not active((grip).attached))) then
    abandon();
  end
  if #steering>0 then
    local velocity=at(s.localVelocity,2)
    local gear=velocity<-.1 and -1 or velocity>.1 and 1 or throttle<0 and -1 or 1
    if driving and goal and m.phase~='unstick' then
      local distance=hypot(goal[1]-s.x,goal[2]-s.z)
      local aim=wrap(math.atan(goal[1]-s.x,goal[2]-s.z)-yaw)
      gear=math.abs(aim)>math.pi/2 and -1 or 1
      local error=wrap(aim+(gear<0 and math.pi or 0))
      local want=gear*math.min(m.phase=='evade' and 1.6 or 1,distance*.5)*math.max(.25,math.cos(error))
      throttle=clamp(.3*want+.5*(want-velocity),.65)
      turn=clamp(2*error-.5*at(s.gyroscope,1),.6)
    end
    if m.phase=='align_pick' and box then
      local aim=wrap(math.atan(box.x-s.x,box.z-s.z)-yaw)
      local want=math.abs(aim)>.07 and -.35 or 0
      gear=-1;throttle=clamp(.3*want+.5*(want-velocity),.4)
      turn=clamp(1.7*aim-.5*at(s.gyroscope,1),.6)
      if math.abs(aim)<.07 and math.abs(at(s.gyroscope,1))<.12 then phase('lower_pick') end
    elseif m.phase=='align_bay' and box then
      local dx,dz=m.bay[1]-box.x,m.bay[2]-box.z
      local forward=dx*math.sin(yaw)+dz*math.cos(yaw)
      local aim=wrap(math.atan(m.bay[1]-s.x,m.bay[2]-s.z)-math.atan(box.x-s.x,box.z-s.z))
      local want=math.abs(aim)>.035 and -.4 or clamp(forward*.5,.3)
      gear=want<0 and -1 or 1
      throttle=clamp(.3*want+.5*(want-velocity),.3)
      turn=clamp(2*aim-.5*at(s.gyroscope,1),.6)
    elseif m.phase=='approach' and box then
      local dx,dz=box.centerOfMass[1]-tip[1],box.centerOfMass[3]-tip[3]
      local forward=dx*math.sin(yaw)+dz*math.cos(yaw)
      local side=dx*math.cos(yaw)-dz*math.sin(yaw)
      local error=math.atan(side,math.max(1,forward))
      gear=1;local want=.35*math.max(.3,math.cos(error))
      throttle=clamp(.3*want+.5*(want-velocity),.4)
      turn=clamp(1.7*error-.5*at(s.gyroscope,1),.6)
    end
    for _,j in ipairs(steering) do
      local target=turn*j.side*gear
      set(j.b,3*(target-at(s.angles,j.b.i))-.45*at(s.rates,j.b.i))
    end
  end

  if active(throttle) then
    local dx = ((math.sin(yaw) * sign(throttle)) * 1.2);
    local dz = ((math.cos(yaw) * sign(throttle)) * 1.2);
    if (not active(every(wheels, function(b)
      return floor((at(at((s).positions, (b).i), 0) + dx), (at(at((s).positions, (b).i), 2) + dz), 0.85)
    end))) then
      throttle = 0;
    end
  end
  if (((s).up < 0.25) or ((s).ground < ((s).waterHeight + 0.5))) then
    throttle = (function() turn = 0;
    return turn end)();
  end
  for _, b in ipairs(wheels) do
    do
      set(b, #steering>0 and throttle or (throttle - turn*sign(b.x-at(parts,0).x)));
    end
    ::continue_13::
  end
  for _, b in ipairs(rams) do
    do
      set(b, (((math.min(lift, (b).travel) - at((s).angles, (b).i)) * 2) - (0.3 * at((s).rates, (b).i))));
    end
    ::continue_14::
  end
  set(head, (active(power) and 1 or (-1)));
  do return out end
end
