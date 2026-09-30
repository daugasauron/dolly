return function(t,s,m)
  local function clamp(v,n) return math.max(-n,math.min(n,v)) end
  local function wrap(v) return math.atan(math.sin(v),math.cos(v)) end
  local out,rams,head,bearing,boom={},{},nil,nil,nil
  for i,b in ipairs(s.blueprint) do
    if b.joint==5 then head=i end
    if b.joint==7 and b.axis==1 then bearing=i end
    if b.joint==2 and b.axis==0 then boom=i end
    if b.joint==2 and b.axis==1 and b.direction<0 then rams[#rams+1]=i end
  end
  if not head or not bearing or not boom or #rams==0 then return out end
  local function set(i,u)
    local b=s.blueprint[i];u=clamp(u,1)
    out[string.char(b.negative)]=math.max(0,-u);out[string.char(b.positive)]=math.max(0,u)
  end
  local function phase(p) m.phase=p;m.at=t;m.still=0 end
  local tip,mag=s.positions[head],s.magnets[head]
  local radius=math.abs(s.blueprint[head].x-s.blueprint[1].x)
  local capacity,travel=0,0
  for _,i in ipairs(rams) do capacity=capacity+s.blueprint[i].travel;travel=travel+s.angles[i] end
  if not m.phase then m.job=0;m.boat=0;m.transfers=0;phase('seek') end
  local cargo,boat
  for _,b in ipairs(s.nearby) do if b.id==m.job then cargo=b end;if b.id==m.boat then boat=b end end
  if m.phase=='seek' then
    local deck
    for _,b in ipairs(s.nearby) do
      if b.team==0 and not b.cargo and not b.anchored and b.low<s.waterHeight and hypot(b.vx,b.vz)<.15 then
        for _,p in ipairs(s.parts(b.id)) do
          local distance=hypot(p.x-s.x,p.z-s.z)
          if p.joint==5 and p.axisY>.8 and distance>radius-.5 and distance<radius+s.blueprint[boom].travel+.5 then
            local loaded=false
            for _,c in ipairs(s.nearby) do if c.cargo and not c.delivered and c.carriedBy==b.id then loaded=true;break end end
            if not loaded then boat=b;deck=p;break end
          end
        end
        if deck then break end
      end
    end
    if deck then
      for _,b in ipairs(s.nearby) do
        local distance=hypot(b.centerOfMass[1]-s.x,b.centerOfMass[3]-s.z)
        if b.cargo and not b.delivered and b.carriedBy==0 and b.low>s.waterHeight+.5
          and b.mass*hypot(table.unpack(s.gravity))<s.blueprint[head].force*.8
          and distance>radius-.5 and distance<radius+s.blueprint[boom].travel+.5 then
          cargo=b;m.job=b.id;m.boat=boat.id;phase('pickup');break
        end
      end
    end
  end
  local aim,extension,lower,power=s.angles[bearing],s.angles[boom],0,false
  local function point(x,z)
    aim=math.atan(-(z-s.z),x-s.x)
    extension=math.max(0,math.min(s.blueprint[boom].travel,hypot(x-s.x,z-s.z)-radius))
  end
  if m.phase~='seek' and m.phase~='release' and m.phase~='return' and (not cargo or not boat or t-m.at>80) then phase('return') end
  if mag.attached and (not cargo or mag.creature~=cargo.id) then phase('return') end
  if m.phase=='pickup' and cargo then
    point(cargo.centerOfMass[1],cargo.centerOfMass[3])
    local error=hypot(tip[1]-cargo.centerOfMass[1],tip[3]-cargo.centerOfMass[3])
    lower=error<.45 and math.max(0,math.min(capacity,travel+clamp(tip[2]-cargo.high-.55,.2))) or 0
    power=error<.55 and tip[2]<cargo.high+1.2 and not cargo.magnetHeld
    if mag.attached and mag.creature==cargo.id then power=true;m.pick=aim;m.reach=extension;phase('lift') end
    if cargo.magnetHeld and not mag.attached then phase('return') end
  elseif m.phase=='lift' then
    aim=m.pick;extension=m.reach;power=true
    if not mag.attached then phase('return') elseif travel<.08 and mag.cargoSupportForce<1 then phase('swing') end
  elseif (m.phase=='swing' or m.phase=='lower') and boat and cargo then
    local deck
    for _,p in ipairs(s.parts(boat.id)) do if p.joint==5 and p.axisY>.8 then deck=p;break end end
    if deck then
      point(deck.x,deck.z);power=true
      local error=hypot(cargo.centerOfMass[1]-deck.x,cargo.centerOfMass[3]-deck.z)
      if m.phase=='swing' then
        m.still=error<.45 and hypot(cargo.vx,cargo.vz)<.3 and m.still+s.dt or 0
        if m.still>.6 then phase('lower') end
      else
        local supported=mag.cargoSupportForce>cargo.mass*hypot(table.unpack(s.gravity))*.6
        lower=supported and travel or math.min(capacity,travel+.12)
        m.still=supported and error<.6 and hypot(cargo.vx,cargo.vy,cargo.vz)<.25 and m.still+s.dt or 0
        if m.still>.7 then m.drop=travel;m.dropAim=aim;m.dropReach=extension;phase('release') end
      end
      if not mag.attached then phase('return') end
    else phase('return') end
  elseif m.phase=='release' then
    aim=m.dropAim;extension=m.dropReach;lower=m.drop
    if t-m.at>1 then m.transfers=m.transfers+1;phase('return') end
  elseif m.phase=='return' then
    if travel<.08 and t-m.at>2 then m.job=0;m.boat=0;phase('seek') end
  end
  set(bearing,clamp((.65*wrap(aim-s.angles[bearing])-.7*s.rates[bearing])/s.blueprint[bearing].speed,.25))
  set(boom,(2*(extension-s.angles[boom])-.25*s.rates[boom])/s.blueprint[boom].speed)
  for _,i in ipairs(rams) do local b=s.blueprint[i];local goal=math.min(b.travel,lower);set(i,(2*(goal-s.angles[i])-.25*s.rates[i])/b.speed);lower=lower-goal end
  set(head,power and 1 or -1)
  return out
end
