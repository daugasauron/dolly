return function(t, s, m, r)
  local cl = function(v, a)
    return math.max((-a), math.min(a, v))
  end;
  local peers = (function() local value = (s).nearby; if active(value) then return value else return {} end end)();
  local cargo = filter(peers, function(c)
    if not c.cargo or c.delivered or c.team~=0 and c.team~=s.team
      or c.mass*hypot(table.unpack(s.gravity))>s.blueprint[11].force*.7 then return false end
    if c.carriedBy==s.id then return true end
    if c.magnetHeld then return false end
    if c.carriedBy==0 then return c.low>s.waterHeight+.5 end
    return some(peers,function(p) return p.id==c.carriedBy and p.anchored end)
  end);
  local mag = at((s).magnets, 10);
  local attached = (function() local value = mag; if active(value) then return (mag).attached else return value end end)();
  local speed = hypot((s).vx, (s).vz);
  if ((m).phase == nil) then
    (m).phase = "seek";
    (m).home = {(s).x, (s).z};
    (m).goal = (m).home;
    (m).ts = t;
    (m).hi = (function() (m).pi = (function() (m).ri = 0;
    return (m).ri end)();
    return (m).pi end)();
    (m).job = 0;
    (m).deliveries = 0;
    (m).cruise = math.max(((s).ground + 5.2), ((function() local value = (s).waterHeight; if value ~= nil then return value else return (s).ground end end)() + 8));
  end
  local next = function(phase)
    (m).phase = phase;
    (m).ts = t;
    (m).hit = 0;
    (m).support = 0;
  end;
  (m).deliveries = (s).cargoDelivered;
  local phase = (m).phase;
  local box = find(cargo, function(c)
    return ((c).id == (m).job)
  end);
  local tx = at((m).goal, 0);
  local tz = at((m).goal, 1);
  local height = math.max((m).cruise, ((function() local value = (s).waterHeight; if value ~= nil then return value else return (s).ground end end)() + 8), table.unpack(map(slice((s).groundSamples, 0, 8), function(p)
    return (at(p, 1) + 5.2)
  end)));
  local power = 0;
  if (phase == "seek") then
    box = find(cargo, function(c)
      return (hypot(((c).x - at((m).home, 0)), ((c).z - at((m).home, 1))) < 24)
    end);
    if active(box) then
      (m).station = (box).carriedBy;
      (m).job = (box).id;
      (m).goal = {(box).x, (box).z};
      next("approach");
    else
      if ((t - (m).ts) > 12) then
        (m).goal = {(at((m).home, 0) + ((r() - 0.5) * 8)), (at((m).home, 1) + ((r() - 0.5) * 10))};
        (m).ts = t;
      end
    end
  end
  if (phase == "approach") then
    if (not active(box)) then
      (m).goal = (m).home;
      next("seek");
    else
      (m).goal = {(box).x, (box).z};
      if ((hypot(((s).x - (box).x), ((s).z - (box).z)) < 0.2) and (speed < 0.2)) then
        next("pickup");
      end
    end
  end
  if (phase == "pickup") then
    if (not active(box)) then
      (m).goal = (m).home;
      next("seek");
    else
      (m).goal = {(box).x, (box).z};
      height = ((box).y + 3.02);
      power = 1;
      if ((active(attached) and ((box).carriedBy == (s).id)) and active((box).magnetHeld)) then
        local depots = sort(filter((function() local value = (s).depots; if active(value) then return value else return {} end end)(), function(d)
          return d.team==s.team and (hypot(((d).x - (box).x), ((d).z - (box).z)) > ((d).radius + 1))
        end), function(a, b)
          return (hypot(((a).x - (box).x), ((a).z - (box).z)) - hypot(((b).x - (box).x), ((b).z - (box).z)))
        end);
        if active(#(depots)) then
          (m).depot = at(depots, 0);
          (m).cruise = math.max(((s).ground + 5.2), ((box).y + 5.2));
          next("lift");
        end
      end
    end
  end
  if (phase == "lift") then
    power = 1;
    if (((s).y > (height - 0.25)) and (math.abs((s).vy) < 0.4)) then
      (m).goal = {((m).depot).x, ((m).depot).z};
      next("carry");
    end
  end
  if (phase == "carry") then
    power = 1;
    if ((hypot(((s).x - at((m).goal, 0)), ((s).z - at((m).goal, 1))) < 0.22) and (speed < 0.22)) then
      m.sink = 0;
      next("lower");
    end
  end
  if (phase == "lower") then
    power = 1;
    m.sink = m.sink or 0;
    (m).floor = math.max((s).ground, table.unpack(map(filter((function() local value = (s).nearby; if active(value) then return value else return {} end end)(), function(c)
      return (function() local value = (function() local value = (function() local value = (c).cargo; if active(value) then return ((c).id ~= (m).job) else return value end end)(); if active(value) then return (not active((c).carriedBy)) else return value end end)(); if active(value) then return (hypot(((c).x - (s).x), ((c).z - (s).z)) < 1.2) else return value end end)()
    end), function(c)
      return ((c).y + 0.485)
    end)));
    (m).cruise = math.max((m).cruise, ((m).floor + 5.2));
    -- The floor estimate takes the highest cargo nearby; keep sinking until the load is supported.
    if math.abs(s.y - (m.floor + 3.5 - m.sink)) < 0.3 and m.support < mag.targetMass * hypot(table.unpack(s.gravity)) * 0.35 then
      m.sink = math.min(3, m.sink + 0.25 * s.dt)
    end
    height = m.floor + 3.5 - m.sink;
    (m).support = ((m).support + (math.min(1, ((s).dt / 0.2)) * ((mag).targetSupportForce - (m).support)));
    (m).hit = ((((m).support > (((mag).targetMass * hypot(table.unpack((s).gravity))) * 0.35)) and (speed < 0.3)) and ((m).hit + (s).dt) or 0);
    if ((m).hit > 0.4) then
      next("release");
    end
  end
  if (phase == "release") then
    height = m.floor + 3.5 - m.sink;
    if ((t - (m).ts) > 2) then
      (m).deliveries = (s).cargoDelivered;
      next("depart");
    end
  end
  if (phase == "depart") then
    tx = ((m).depot).x;
    tz = ((m).depot).z;
    if ((s).y > (height - 0.25)) then
      (m).goal = (m).home;
      next("return");
    end
  end
  if (((phase == "return") and (hypot(((s).x - at((m).home, 0)), ((s).z - at((m).home, 1))) < 0.3)) and (speed < 0.2)) then
    (m).job = 0;
    next("seek");
  end
  if ((((m).phase == "lift") or ((m).phase == "carry")) and (not active(attached))) then
    (m).job = 0;
    (m).goal = (m).home;
    next("seek");
    power = 0;
  end
  if (phase ~= "depart") then
    tx = at((m).goal, 0);
    tz = at((m).goal, 1);
  end
  local traffic = filter(peers, function(c)
    return not c.cargo and c.low<s.ground+3
      and hypot(c.x+2*c.vx-s.x-2*s.vx,c.z+2*c.vz-s.z-2*s.vz)<c.radius+6
  end)
  if #traffic>0 then
    -- Each own part clears only the traffic below it: wide rotors stay high while the magnet descends.
    local own=s.bounds(s.id)
    local raised=false
    for _,c in ipairs(traffic) do
      local dx,dz=2*(s.vx-c.vx),2*(s.vz-c.vz)
      for _,part in ipairs(s.bounds(c.id)) do
        for _,o in ipairs(own) do
          if math.abs(part.x-o.x-dx)<part.halfX+o.halfX+.25
            and math.abs(part.z-o.z-dz)<part.halfZ+o.halfZ+.25 then
            local clearance=part.high+s.y-o.low+.3
            if clearance>height then height=clearance;raised=true end
          end
        end
      end
    end
    if raised then m.trafficTime=(m.trafficTime or 0)+s.dt end
  end
  local ax = cl((1.4 * (cl((0.65 * (tx - (s).x)), 0.9) - (s).vx)), 0.55);
  local az = cl((1.4 * (cl((0.65 * (tz - (s).z)), 0.9) - (s).vz)), 0.55);
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
local ay = cl((((3 * eh) - (3 * (s).vy)) + (0.3 * (m).hi)), 2.4);
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
do return out end
end
