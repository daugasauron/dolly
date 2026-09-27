return function(t, s, m, r)
  local cl = function(v, a)
    return math.max((-a), math.min(a, v))
  end;
  local peers = s.nearby
  local zone = s.combat
  local function in_combat(c)
    return not zone or math.abs(c.x-zone.x)<=zone.halfX and math.abs(c.z-zone.z)<=zone.halfZ
  end
  local handoffs = {}
  local home = m.home and m.home[1] or s.x
  for _, p in ipairs(s.radio) do
    if p.kind == "release" and p.from ~= s.id and p.team == s.team and p.mass < 6
      and s.worldTime-p.time < 30 and (not zone or (home-zone.x)*(p.x-zone.x) >= 0
        and math.abs(p.z-zone.z) <= zone.halfZ) then handoffs[p.cargo] = p end
  end
  local function neutral_cargo(c)
    return c.cargo and c.team == 0 and not c.delivered and c.mass < 6 and c.carriedBy == 0
  end
  local function available(c)
    if not neutral_cargo(c) or not in_combat(c) and not handoffs[c.id] then return false end
    for _, part in ipairs(s.parts(c.id)) do if part.target and part.target ~= 0 then return false end end
    return true
  end
  local mag = at((s).magnets, 10);
  local attached = (mag).attached;
  local speed = hypot((s).vx, (s).vz);
  if (not active((m).phase)) then
    (m).phase = "seek";
    (m).home = {(s).x, (s).z};
    (m).goal = (m).home;
    (m).ts = t;
    (m).hi = (function() (m).pi = (function() (m).ri = 0;
    return (m).ri end)();
    return (m).pi end)();
    (m).job = 0;
    (m).cruise = 32;
    (m).missed = {};
    (m).dispatches = 0;
  end
  local sector
  if zone then sector={zone.x,math.max(zone.z-zone.halfZ+18,math.min(zone.z+zone.halfZ-18,m.home[2]))}
  else for _,depot in ipairs(s.depots) do if depot.team==0 then sector={depot.x,depot.z};break end end end
  local function job_distance(x,z) return hypot(x-s.x,z-s.z)+(zone and math.abs(z-sector[2]) or 0) end
  local next = function(p)
    (m).phase = p;
    (m).ts = t;
    (m).hit = 0;
    (m).support = 0;
    (m).lower = 0;
  end;
  local phase = (m).phase;
  local box = find(peers, function(c)
    return ((c).id == (m).job)
  end);
  local depot = find(s.depots, function(d) return d.team == s.team end)
  if not depot then
    if attached and box and box.carriedBy == s.id then
      if phase ~= "lower" and phase ~= "release" then
        m.goal = {s.x, s.z}
        next("lower")
      end
    elseif phase ~= "release" and phase ~= "depart" and phase ~= "return" and phase ~= "no-depot" then
      m.job = 0
      m.goal = m.home
      next("no-depot")
    end
    phase = m.phase
  elseif phase == "no-depot" then
    next("seek")
    phase = m.phase
  end
  local height = math.max((m).cruise, ((s).ground + 6));
  local power = 0;
  if (not active(includes({"pickup", "lower", "release"}, phase))) then
    for _, p in ipairs((s).terrain) do
      do
        if ((math.abs((((s).x + (3 * (s).vx)) - (p).x)) < ((p).halfX + 6)) and (math.abs((((s).z + (3 * (s).vz)) - (p).z)) < ((p).halfZ + 6))) then
          (m).cruise = math.max((m).cruise, ((p).high + 6));
        end
      end
      ::continue_1::
    end
    height = math.max(height, (m).cruise);
  end
  if phase == "seek" then
    local reports, claimed = {}, {}
    for _, p in ipairs(s.radio) do
      if p.kind == "claim" and p.from ~= s.id and s.worldTime-p.time < 12 then claimed[p.cargo] = true end
      if p.kind == "sight" and p.mass < 6 and s.worldTime-p.time < 120 and in_combat(p) or handoffs[p.cargo] == p then
        reports[p.cargo] = p
      end
    end
    local report, distance
    for id, p in pairs(reports) do
      local unavailable = claimed[id] or (m.missed[id+1] or 0) > t
      for _, c in ipairs(peers) do
        if c.id == id and (not available(c)) then unavailable = true end
      end
      local d = job_distance(p.x,p.z)
      if not unavailable and (not distance or d < distance or d == distance and id < report.cargo) then report, distance = p, d end
    end
    if report then
      m.job = report.cargo
      m.goal = {report.x, report.z}
      m.searchCenter = {report.x, report.z}
      m.dispatchedFrom = report.from
      m.dispatches = m.dispatches+1
      next("approach")
    elseif t-m.ts > 15 then
      m.searchCenter=sector
      if m.searchCenter and (not m.patrolAt or t > m.patrolAt) then
        local angle = r()*math.pi*2
        m.goal = {m.searchCenter[1]+math.sin(angle)*18, m.searchCenter[2]+math.cos(angle)*18}
        m.patrolAt = t+35
      end
      local candidate,best
      for _,c in ipairs(peers) do
        if c.visible and not c.parachute and c.mass<6 and not claimed[c.id] and (m.missed[c.id+1] or 0)<t and available(c) then
          local score=job_distance(c.x,c.z)
          if not best or score<best then candidate,best=c,score end
        end
      end
      if candidate then
        m.job=candidate.id
        m.goal={candidate.x,candidate.z}
        m.searchCenter={candidate.x,candidate.z}
        m.dispatchedFrom=s.id
        m.dispatches=m.dispatches+1
        next("approach")
      end
    end
  end
  if phase == "approach" and not attached then
    for _, report in ipairs(s.radio) do
      if report.kind == "claim" and report.cargo == m.job and report.from < s.id and s.worldTime-report.time < 12 then
        m.missed[m.job+1] = t+25
        m.job = 0
        m.goal = {s.x,s.z}
        next("seek")
        phase = m.phase
        break
      end
    end
  end
  if (phase == "approach") then
    local unavailable = box and (box.delivered or box.carriedBy ~= 0 and box.carriedBy ~= s.id
      or not attached and not neutral_cargo(box))
    if unavailable or t-m.ts > 300 then
      ((m).missed)[index((m).job)] = (t + 120);
      (m).job = 0;
      (m).goal = {s.x,s.z};
      next("seek");
    else
      if active(box) then
        (m).goal = {(box).x, (box).z};
        local roof = some((s).terrain, function(p)
          return (function() local value = (function() local value = (function() local value = ((p).high > ((box).y + 1)); if active(value) then return ((p).low < ((s).y + 2)) else return value end end)(); if active(value) then return (math.abs(((box).x - (p).x)) < ((p).halfX + 2.5)) else return value end end)(); if active(value) then return (math.abs(((box).z - (p).z)) < ((p).halfZ + 2.5)) else return value end end)()
        end);
        if active(roof) then
          ((m).missed)[index((m).job)] = (t + 120);
          (m).job = 0;
          (m).goal = {s.x,s.z};
          next("seek");
        else
          if (((active((box).visible) and (not active((box).parachute))) and (hypot(((s).x - (box).x), ((s).z - (box).z)) < 0.2)) and (speed < 0.2)) then
            next("pickup");
          end
        end
      else
        if ((hypot(((s).x - at((m).goal, 0)), ((s).z - at((m).goal, 1))) < 3) and ((t - (m).ts) > 15)) then
          ((m).missed)[index((m).job)] = (t + 120);
          (m).job = 0;
          (m).goal = {s.x,s.z};
          next("seek");
        end
      end
    end
  end
  if phase == "pickup" and t-m.ts > 25 then
    m.missed[m.job+1] = t+120
    m.job = 0
    m.goal = {s.x,s.z}
    next("seek")
    phase = m.phase
  end
  if (phase == "pickup") then
    if (((not active(box)) or active((box).delivered)) or (active((box).carriedBy) and ((box).carriedBy ~= (s).id))) then
      (m).job = 0;
      (m).goal = {s.x,s.z};
      next("seek");
    else
      (m).goal = {(box).x, (box).z};
      height = ((box).y + 3.02);
      power = 1;
      if (active(attached) and ((box).carriedBy == (s).id)) then
        (m).depot = depot;
        (m).cruise = math.max(32, ((box).y + 6));
        next("lift");
      end
    end
  end
  if (phase == "lift") then
    power = 1;
    if (((s).y > (height - 0.3)) and (math.abs((s).vy) < 0.4)) then
      (m).goal = {depot.x, depot.z};
      next("carry");
    end
  end
  if (phase == "carry") then
    power = 1;
    if ((hypot(((s).x - at((m).goal, 0)), ((s).z - at((m).goal, 1))) < 0.22) and (speed < 0.22)) then
      next("lower");
    end
  end
  if (phase == "lower") then
    power = 1;
    (m).floor = math.max((s).ground, table.unpack(map(filter(peers, function(c)
      return (function() local value = (function() local value = (function() local value = (c).cargo; if active(value) then return ((c).id ~= (m).job) else return value end end)(); if active(value) then return (not active((c).carriedBy)) else return value end end)(); if active(value) then return (hypot(((c).x - (s).x), ((c).z - (s).z)) < 1.2) else return value end end)()
    end), function(c)
      return ((c).y + 0.485)
    end)));
    (m).lower = math.min((((m).floor - (s).ground) + 0.4), ((function() local value = (m).lower; if active(value) then return value else return 0 end end)() + (0.15 * (s).dt)));
    height = (((m).floor + 3.5) - (m).lower);
    (m).support = ((m).support + (math.min(1, ((s).dt / 0.2)) * ((mag).cargoSupportForce - (m).support)));
    (m).hit = ((((m).support > (((mag).targetMass * hypot(table.unpack((s).gravity))) * 0.35)) and (speed < 0.3)) and ((m).hit + (s).dt) or 0);
    if ((m).hit > 0.4) then
      next("release");
    end
  end
  if (phase == "release") then
    height = ((m).floor + 3.5);
    if ((t - (m).ts) > 2) then
      (m).deliveries = (s).cargoDelivered;
      next("depart");
    end
  end
  if ((phase == "depart") and ((s).y > (height - 0.3))) then
    (m).job = 0;
    (m).goal = (m).home;
    next("return");
  end
  if (((phase == "return") and (hypot(((s).x - at((m).home, 0)), ((s).z - at((m).home, 1))) < 0.3)) and (speed < 0.2)) then
    (m).cruise = 32;
    next("seek");
  end
  if (((phase == "lift") or (phase == "carry")) and (not active(attached))) then
    (m).job = 0;
    (m).goal = {s.x,s.z};
    next("seek");
    power = 0;
  end
  if (active(attached) and (optional(box, "carriedBy") ~= (s).id)) then
    ((m).missed)[index((m).job)] = (t + 120);
    (m).job = 0;
    (m).goal = {s.x,s.z};
    (m).hi = (function() (m).pi = (function() (m).ri = 0;
    return (m).ri end)();
    return (m).pi end)();
    next("seek");
    phase = (m).phase;
    power = 0;
    height = math.max((m).cruise, ((s).ground + 6));
  end
  if not m.trafficAt or t >= m.trafficAt then
    m.trafficAt = t + .5
    m.trafficHeight = 0
    m.yieldingTo = nil
    local radius = 0
    for _, b in ipairs(s.blueprint) do radius = math.max(radius, hypot(b.x-s.blueprint[1].x, b.z-s.blueprint[1].z)+.75) end
    local bottom = .5
    if s.id>0 then for _, b in ipairs(s.bounds(s.id)) do bottom = math.max(bottom, s.y-b.low) end end
    if attached and box then bottom = math.max(bottom, s.y-box.low+.3) end
    local x, z = s.x+2*s.vx, s.z+2*s.vz
    for _, c in ipairs(peers) do
      local ground = c.low < s.ground+3
      local above = s.y > c.y+.5 or math.abs(s.y-c.y)<=.5 and s.id>c.id
      if not c.cargo and (ground or not c.anchored and above) then
        for _, b in ipairs(s.bounds(c.id)) do
          if math.abs(x-b.x-2*c.vx) < b.halfX+radius and math.abs(z-b.z-2*c.vz) < b.halfZ+radius then
            local clearance = ground and b.high+4 or c.high+bottom+.8
            if clearance > m.trafficHeight then
              m.trafficHeight = clearance
              m.yieldingTo = not ground and c.id or nil
            end
          end
        end
      end
    end
  end
  height = math.max(height, m.trafficHeight)
  local tx = at((m).goal, 0);
  local tz = at((m).goal, 1);
  local roof,top,bottom,radius=nil,0,0,0
  for _,b in ipairs(s.blueprint) do
    top=math.max(top,b.y-s.blueprint[1].y+.5)
    bottom=math.max(bottom,s.blueprint[1].y-b.y+.5)
    radius=math.max(radius,hypot(b.x-s.blueprint[1].x,b.z-s.blueprint[1].z)+.6)
  end
  if attached and box then bottom=math.max(bottom,s.y-box.low+.3) end
  for _,b in ipairs(s.terrain) do
    if b.low>s.y+.2 and math.abs(s.x-b.x)<b.halfX+radius and math.abs(s.z-b.z)<b.halfZ+radius
      and (not roof or b.low<roof.low) then roof=b end
  end
  if roof then
    local fly=math.max(s.ground+bottom+.3,roof.low-top-.4)
    if not m.roofAt or t>=m.roofAt then
      m.roofAt=t+1;m.roofGoal=nil
      local function blocked(x,z)
        for _,b in ipairs(s.terrain) do
          if b.high>fly-bottom-.2 and b.low<fly+top+.2 then
            local lo,hi=0,1
            for _,v in ipairs({{s.x,x-s.x,b.x,b.halfX+radius},{s.z,z-s.z,b.z,b.halfZ+radius}}) do
              if math.abs(v[2])<.00001 then
                if math.abs(v[1]-v[3])>v[4] then lo,hi=1,0 end
              else
                local a,c=(v[3]-v[4]-v[1])/v[2],(v[3]+v[4]-v[1])/v[2]
                lo=math.max(lo,math.min(a,c));hi=math.min(hi,math.max(a,c))
              end
            end
            if lo<=hi then
              local dx,dz=s.x-b.x,s.z-b.z
              local px,pz=b.halfX+radius-math.abs(dx),b.halfZ+radius-math.abs(dz)
              local leaving=px>=0 and pz>=0 and hi<1 and
                (px<pz and (x-s.x)*sign(dx)>=-.001 or pz<=px and (z-s.z)*sign(dz)>=-.001)
              if not leaving then return true end
            end
          end
        end
        return false
      end
      local distance
      for _,p in ipairs({{roof.x-roof.halfX-radius-.5,s.z},{roof.x+roof.halfX+radius+.5,s.z},
        {s.x,roof.z-roof.halfZ-radius-.5},{s.x,roof.z+roof.halfZ+radius+.5}}) do
        local d=hypot(p[1]-s.x,p[2]-s.z)
        if (not distance or d<distance) and not blocked(p[1],p[2]) then m.roofGoal=p;distance=d end
      end
    end
    height=fly;tx=m.roofGoal and m.roofGoal[1] or s.x;tz=m.roofGoal and m.roofGoal[2] or s.z
  else m.roofAt=nil;m.roofGoal=nil end
  local limit = (((not active(includes({"pickup", "lower", "release"}, phase))) and ((s).y < (height - 2))) and 0.15 or 1.4);
  local ax = cl((1.4 * (cl((0.65 * (tx - (s).x)), limit) - (s).vx)), 0.55);
  local az = cl((1.4 * (cl((0.65 * (tz - (s).z)), limit) - (s).vz)), 0.55);
  local q = (s).rotation;
  local x = at(q, 0);
  local y = at(q, 1);
  local z = at(q, 2);
  local w = at(q, 3);
  local function local_(v)
  do return {((((1 - (2 * ((y * y) + (z * z)))) * at(v, 0)) + ((2 * ((x * y) + (z * w))) * at(v, 1))) + ((2 * ((x * z) - (y * w))) * at(v, 2))), ((((2 * ((x * y) - (z * w))) * at(v, 0)) + ((1 - (2 * ((x * x) + (z * z)))) * at(v, 1))) + ((2 * ((y * z) + (x * w))) * at(v, 2))), ((((2 * ((x * z) + (y * w))) * at(v, 0)) + ((2 * ((y * z) - (x * w))) * at(v, 1))) + ((1 - (2 * ((x * x) + (y * y)))) * at(v, 2)))} end
end
local acc = local_({ax, 0, az});
local com = local_({(at((s).centerOfMass, 0) - (s).x), (at((s).centerOfMass, 1) - (s).y), (at((s).centerOfMass, 2) - (s).z)});
local g = (s).gravity;
local gy = (s).gyroscope;
local G = hypot(at(g, 0), at(g, 1), at(g, 2));
local ep = (cl((at(acc, 2) / G), 0.15) - math.atan(at(g, 2), (-at(g, 1))));
local er = (cl(((-at(acc, 0)) / G), 0.15) - math.atan((-at(g, 0)), (-at(g, 1))));
(m).pi = cl(((m).pi + (ep * (s).dt)), 0.35);
(m).ri = cl(((m).ri + (er * (s).dt)), 0.35);
local eh = (height - (s).y);
(m).hi = cl(((m).hi + (eh * (s).dt)), 1);
local ay = cl(((2 * (cl((0.9 * eh), 2.5) - (s).vy)) + (0.15 * (m).hi)), 2.4);
local total = ((((s).mass * (G + ay)) + (active(attached) and ((mag).targetMass * G) or 0)) / math.max(0.7, (s).up));
local base = (total / 4);
local mx = ((((180 * ep) - (110 * at(gy, 0))) + (m).pi) - (total * at(com, 2)));
local mz = ((((180 * er) - (110 * at(gy, 2))) + (m).ri) + (total * at(com, 0)));
local function jet(f)
do return math.max(0, math.min(1, (f / 18))) end
end
local out = {A = jet(((base - (mx / 4)) - (mz / 4))), S = jet(((base - (mx / 4)) + (mz / 4))), D = jet(((base + (mx / 4)) - (mz / 4))), F = jet(((base + (mx / 4)) + (mz / 4)))};
if active(power) then
  (out).M = 1;
else
  (out).N = 1;
end
if active((m).job) then
  (out).radio = {kind = ((phase == "release") and "release" or "claim"), cargo = (m).job};
end
if s.carriedBy ~= 0 then out.radio = {kind = "help", target = s.id} end
m.status = m.phase == "seek" and "Awaiting scout / searching combat cargo"
  or m.phase == "no-depot" and "Waiting for a team cargo depot"
  or m.phase == "approach" and "Claimed cargo: approaching"
  or m.phase == "carry" and "Delivering cargo to island goal" or m.phase
if m.yieldingTo and m.trafficHeight > m.cruise then m.status = "Clearing airborne traffic" end
if s.up<.5 or m.recovering then
  m.recovering=true
  local gx,gz=-g[1]/G,-g[3]/G
  local length=hypot(gx,gz)
  local angle=math.atan(length,s.up)
  local tx,tz
  if length<.05 and s.up<0 then tx,tz=0,angle else tx,tz=gz/math.max(.001,length)*angle,-gx/math.max(.001,length)*angle end
  tx=80*tx-35*gy[1];tz=80*tz-35*gy[3]
  local cx,cz,count=0,0,0
  for _,b in ipairs(s.blueprint) do if b.joint==3 and b.axis==1 and b.direction<0 then cx=cx+b.x;cz=cz+b.z;count=count+1 end end
  cx=cx/math.max(1,count);cz=cz/math.max(1,count)
  local xx,zz=0,0
  for _,b in ipairs(s.blueprint) do if b.joint==3 and b.axis==1 and b.direction<0 then xx=xx+(b.x-cx)^2;zz=zz+(b.z-cz)^2 end end
  out={radio={kind='help',target=s.id}}
  for _,b in ipairs(s.blueprint) do
    if b.joint==3 and b.axis==1 then
      local force=tz*(b.x-cx)/math.max(1,xx)-tx*(b.z-cz)/math.max(1,zz)
      if b.positive~=0 then out[string.char(b.positive)]=math.max(0,math.min(1,-b.direction*force/b.force)) end
    elseif b.joint==5 and b.negative~=0 then out[string.char(b.negative)]=1 end
  end
  if s.up>.97 and hypot(gy[1],gy[3])<.3 then m.recovering=nil;m.pi=0;m.ri=0;m.hi=0;m.job=0;next('seek') end
end
do return out end
end
