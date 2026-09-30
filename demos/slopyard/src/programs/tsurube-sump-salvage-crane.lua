return function(t,s,m)
  local function clamp(v,n) return math.max(-n,math.min(n,v)) end
  local function wrap(v) return math.atan(math.sin(v),math.cos(v)) end
  local lower,boom,bearing,head={},nil,nil,nil
  for i,b in ipairs(s.blueprint) do
    if b.joint==2 and b.axis==1 and b.direction<0 then lower[#lower+1]=i end
    if b.joint==2 and b.axis==0 then boom=i end
    if b.joint==7 and b.axis==1 then bearing=i end
    if b.joint==5 then head=i end
  end
  if not boom or not bearing or not head or #lower==0 then return {} end
  local tip,mag=s.positions[head],s.magnets[head]
  local stroke,capacity=0,0
  for _,i in ipairs(lower) do stroke=stroke+s.angles[i];capacity=capacity+s.blueprint[i].travel end
  local radius=hypot(tip[1]-s.x,tip[3]-s.z)
  local angle=math.atan(-(tip[3]-s.z),tip[1]-s.x)
  local function phase(name) m.phase=name;m.at=t;m.stable=0 end
  if not m.homeRadius then
    m.homeRadius=radius-s.angles[boom];m.lifts=m.lifts or 0;m.target=mag.attached and mag.creature or 0
    m.pick=angle;m.badBays={};phase(mag.attached and 'lift' or 'seek')
  end
  local cargo
  for _,b in ipairs(s.nearby) do if b.id==m.target then cargo=b end end
  if mag.attached and (not cargo or not cargo.cargo or cargo.id~=mag.creature) then phase('release') end
  if m.phase~='seek' and m.phase~='release' and m.phase~='retract' and not mag.attached then m.target=0;phase('seek') end
  if m.phase=='seek' and not mag.attached then
    cargo=nil
    for _,b in ipairs(s.nearby) do
      local reach=hypot(b.x-s.x,b.z-s.z)
      if b.cargo and not b.delivered and b.carriedBy==0 and b.y<s.ground-.3
        and reach>=m.homeRadius-.2 and reach<=m.homeRadius+s.blueprint[boom].travel+.2
        and b.mass*hypot(table.unpack(s.gravity))<s.blueprint[head].force*.8 then
        if not cargo or reach<hypot(cargo.x-s.x,cargo.z-s.z) then cargo=b end
      end
    end
    if cargo then m.target=cargo.id end
  end
  local aim,reach,travel,power=m.pick,m.homeRadius+math.min(1,s.blueprint[boom].travel),0,mag.attached
  if m.phase=='seek' and cargo then
    aim=math.atan(-(cargo.z-s.z),cargo.x-s.x);reach=hypot(cargo.x-s.x,cargo.z-s.z)
    travel=math.max(0,math.min(capacity,stroke+clamp(tip[2]-cargo.y-1,.15)))
    power=hypot(tip[1]-cargo.x,tip[3]-cargo.z)<.6
    if mag.attached and mag.creature==cargo.id then m.pick=angle;m.bay=nil;phase('lift') end
  end
  local function find_bay()
    local best,score
    for n=0,15 do
      local a,x,z=n*math.pi/8
      x=s.x+math.cos(a)*reach;z=s.z-math.sin(a)*reach
      local floor=-math.huge
      for _,b in ipairs(s.terrain) do
        if math.abs(x-b.x)<b.halfX-.6 and math.abs(z-b.z)<b.halfZ-.6 and b.high<=s.ground+.3 then floor=math.max(floor,b.high) end
      end
      local free=floor>s.waterHeight+.5 and floor>=s.ground-.3 and t>(m.badBays[n+1] or 0)
      for _,b in ipairs(s.terrain) do
        if b.high>floor+.3 and b.low<floor+2 and math.abs(x-b.x)<b.halfX+.7 and math.abs(z-b.z)<b.halfZ+.7 then free=false end
      end
      for _,b in ipairs(s.nearby) do if b.id~=m.target and b.low<floor+2 and hypot(x-b.x,z-b.z)<(b.cargo and 1.7 or 3) then free=false end end
      local value=math.cos(a-m.pick-math.pi)
      if free and (not score or value>score) then best={angle=a,x=x,z=z,index=n+1};score=value end
    end
    return best
  end
  if m.phase=='lift' then
    aim=m.pick;power=true
    if stroke<.08 and t-m.at>2 and t>(m.bayAt or 0) then
      m.bay=find_bay();m.bayAt=t+3
      if m.bay then phase('swing') end
    end
  end
  if m.phase=='swing' then
    aim=m.bay.angle;power=true
    if math.abs(wrap(aim-angle))<.03 and math.abs(s.rates[bearing])<.04 and t-m.at>2 then phase('lower') end
  end
  if m.phase=='lower' then
    aim=m.bay.angle;power=true;travel=math.min(capacity,stroke+.15)
    local supported=mag.cargoSupportForce>mag.targetMass*hypot(table.unpack(s.gravity))*.35
    if supported then travel=stroke end
    m.stable=supported and cargo and hypot(cargo.vx,cargo.vy,cargo.vz)<.25 and m.stable+s.dt or 0
    if m.stable>.6 then m.drop=stroke;m.lifts=m.lifts+1;phase('release')
    elseif t-m.at>30 then m.badBays[m.bay.index]=t+60;m.pick=angle;phase('lift') end
  end
  if m.phase=='release' then
    power=false;travel=m.drop or stroke;aim=m.bay and m.bay.angle or angle
    if t-m.at>1 then phase('retract') end
  elseif m.phase=='retract' then
    power=false;aim=m.bay and m.bay.angle or angle
    if stroke<.08 then m.target=0;phase('seek') end
  end
  local out={}
  local function set(i,u)
    local b=s.blueprint[i];u=clamp(u,1)
    out[string.char(b.negative)]=math.max(0,-u);out[string.char(b.positive)]=math.max(0,u)
  end
  set(bearing,clamp((.65*wrap(aim-angle)-.9*s.rates[bearing])/s.blueprint[bearing].speed,.5))
  for _,i in ipairs(lower) do local wanted=math.min(s.blueprint[i].travel,travel);set(i,(2*(wanted-s.angles[i])-.25*s.rates[i])/s.blueprint[i].speed);travel=travel-wanted end
  set(boom,(2*(math.max(0,math.min(s.blueprint[boom].travel,s.angles[boom]+clamp(reach-radius,.3)))-s.angles[boom])-.25*s.rates[boom])/s.blueprint[boom].speed)
  set(head,power and 1 or -1)
  return out
end
