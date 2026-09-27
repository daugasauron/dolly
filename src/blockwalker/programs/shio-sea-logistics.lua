return function(t,s,m)
  local function clamp(v,n) return math.max(-n,math.min(n,v)) end
  local function wrap(v) return math.atan(math.sin(v),math.cos(v)) end
  local out,head,winch,bearing,boom,mast={},nil,nil,nil,nil,nil
  local jets,counts,moments={},{[0]=0,[2]=0},{[0]=0,[2]=0}
  for i,b in ipairs(s.blueprint) do
    if b.joint==5 then head=i end
    if b.joint==8 then winch=i end
    if b.joint==7 and b.axis==1 then bearing=i end
    if b.joint==2 and b.axis==0 then boom=i end
    if b.joint==2 and b.axis==1 then mast=i end
    if b.joint==3 and b.axis~=1 then
      jets[#jets+1]=i;counts[b.axis]=counts[b.axis]+1
      moments[b.axis]=moments[b.axis]+(b.axis==0 and b.z^2 or b.x^2)
    end
  end
  if not head then return out end
  local function set(i,u)
    local b=s.blueprint[i];u=clamp(u,1)
    if b.negative~=0 then out[string.char(b.negative)]=math.max(0,-u) end
    if b.positive~=0 then out[string.char(b.positive)]=math.max(0,u) end
  end
  local function phase(p) m.phase=p;m.at=t;m.still=0;m.best=nil;m.progress=t end
  local neutral=s.team==0
  local berth={-104.5,-20};local fairway={-112,-20};local corner={-112,-120};local exchange={0,-120}
  local side=s.team==1 and 1 or -1
  local home=s.team==1 and {129.4,27.8} or {-131.2,-56}
  local seaLane=s.team==1 and {130,-120} or {-124,-120}
  local waiting={exchange[1]+side*12,exchange[2]-12}
  local harborLane={seaLane[1],home[2]}
  if not m.phase then m.job=0;m.transfers=0;m.deliveries=0;m.handoffs=0;m.failed={};phase(neutral and 'load' or 'outbound');m.route=neutral and 1 or (hypot(s.x-home[1],s.z-home[2])<25 and 1 or s.z<exchange[2]+8 and math.abs(s.x)<math.abs(seaLane[1]) and 3 or 2) end
  local q=s.rotation;local yaw=math.atan(2*(q[1]*q[3]+q[2]*q[4]),1-2*(q[1]^2+q[2]^2))
  local mag=s.magnets[head];local tip=s.positions[head];local cargo,provider
  for _,b in ipairs(s.nearby) do if b.id==m.job then cargo=b end;if b.id==m.provider then provider=b end end
  local goal={s.x,s.z};local power=false;local reel=0;local slew=-math.pi/2;local extension=0;local speed=1.5
  local function route(points,done)
    local p=points[m.route or 1];goal=p
    if hypot(s.x-p[1],s.z-p[2])<.7 then
      if (m.route or 1)<#points then m.route=(m.route or 1)+1 else m.route=1;phase(done) end
    end
  end
  local function attached() return mag.attached and cargo and mag.creature==cargo.id end
  if neutral then
    if m.phase=='load' then
      goal=berth
      for _,b in ipairs(s.nearby) do
        if b.cargo and not b.delivered and b.carriedBy==s.id and hypot(b.x-tip[1],b.z-tip[3])<2 then cargo=b;m.job=b.id;break end
      end
      power=cargo and cargo.carriedBy==s.id and not cargo.magnetHeld
      if mag.attached and cargo and mag.creature==cargo.id then
        power=true;m.still=cargo.magnetCount==1 and m.still+s.dt or 0
        if m.still>2 then phase('outbound');m.route=1 end
      end
    elseif m.phase=='outbound' then
      power=true;route({fairway,corner,exchange},'offer')
      if not attached() then phase('return');m.route=1 end
    elseif m.phase=='offer' then
      goal=exchange
      if cargo and cargo.carriedBy~=s.id and cargo.carriedBy~=0 and hypot(cargo.x-s.x,cargo.z-s.z)>3 then
        m.transfers=m.transfers+1;m.job=0;phase('return');m.route=1
      elseif not cargo or t-m.at>150 then m.job=0;phase('return');m.route=1 end
    elseif m.phase=='return' then
      route({corner,fairway,berth},'load')
    end
  else
    if not winch or not bearing or not boom then return out end
    local paid=s.winches[winch].paidOut
    local function raise(length) reel=paid>(length or 1.8) and -1 or 0 end
    local function abort()
      if m.job~=0 then m.failed[m.job]=t+45 end
      m.job=0;m.provider=0;phase('raise')
    end
    if mag.attached and (not cargo or mag.creature~=cargo.id or not cargo.cargo) then abort() end
    if (m.phase=='hoist' or m.phase=='fold' or m.phase=='stow' or m.phase=='unload_lift' or m.phase=='unload_turn') and t-m.at>90 or m.phase=='home' and t-m.at>600 then abort() end
    if m.phase=='outbound' then
      raise();route({harborLane,seaLane,waiting},'seek')
    elseif m.phase=='seek' then
      goal=waiting;raise()
      for _,b in ipairs(s.nearby) do
        if b.cargo and not b.delivered and not b.magnetHeld and b.mass*hypot(table.unpack(s.gravity))<s.blueprint[head].force*.7 and t>(m.failed[b.id] or 0) then
          for _,boat in ipairs(s.nearby) do
            if boat.id==b.carriedBy and boat.team==0 and not boat.anchored and not boat.cargo and boat.low<s.waterHeight
              and hypot(boat.vx,boat.vz)<.2 then
              m.job=b.id;m.provider=boat.id;cargo=b;provider=boat;phase('approach');break
            end
          end
          if m.phase=='approach' then break end
        end
      end
    elseif m.phase=='approach' or m.phase=='lower' then
      if not cargo or cargo.delivered or cargo.magnetHeld and not attached() or not provider or t-m.progress>90 then abort()
      else
        slew=side>0 and 0 or math.pi;extension=s.blueprint[boom].travel
        local reach=math.abs(s.blueprint[head].x-s.blueprint[1].x)+extension
        goal={cargo.centerOfMass[1]+side*reach,cargo.centerOfMass[3]};speed=.45
        local error=hypot(tip[1]-cargo.centerOfMass[1],tip[3]-cargo.centerOfMass[3])
        if not m.best or error<m.best-.2 then m.best=error;m.progress=t end
        local aligned=error<.45 and hypot(s.vx,s.vz)<.15 and math.abs(s.rates[bearing])<.08
        if m.phase=='approach' then raise();m.still=aligned and m.still+s.dt or 0;if m.still>.7 then phase('lower') end
        else reel=aligned and tip[2]>cargo.high+.55 and 1 or 0;power=error<.55 and tip[2]<cargo.high+1.2 end
        if attached() then m.transfers=m.transfers+1;phase('hoist') end
      end
    elseif m.phase=='hoist' then
      power=true;slew=side>0 and 0 or math.pi;extension=s.blueprint[boom].travel;raise()
      if not attached() then abort() elseif paid<1.9 then phase('fold') end
    elseif m.phase=='fold' then
      power=true;raise();slew=side>0 and 0 or math.pi
      if not attached() then abort()
      else
        m.still=s.angles[boom]<.08 and math.abs(s.rates[boom])<.08 and s.up>.94 and m.still+s.dt or 0
        if m.still>.4 then phase('stow') end
      end
    elseif m.phase=='stow' then
      power=true;raise()
      if not attached() then abort()
      elseif s.up>.9 and s.angles[boom]<.08 and math.abs(wrap(slew-s.angles[bearing]))<.12 and math.abs(s.rates[bearing])<.08 then
        local supported=mag.targetSupportForce>cargo.mass*hypot(table.unpack(s.gravity))*.55
        reel=supported and 0 or 1
        m.still=supported and hypot(cargo.vx,cargo.vy,cargo.vz)<.35 and m.still+s.dt or 0
        if m.still>.7 then m.carryCable=paid;phase('home');m.route=1 end
      end
    elseif m.phase=='home' then
      power=true;reel=(m.carryCable-paid)*1.5/s.blueprint[winch].speed;route({seaLane,harborLane,home},'unload_lift')
      if not attached() then abort() end
    elseif m.phase=='unload_lift' then
      goal=home;power=true;raise(1.05)
      if not attached() then abort() elseif paid<1.1 and (not mast or s.angles[mast]>.95 and math.abs(s.rates[mast])<.08) then phase('unload_turn') end
    elseif m.phase=='unload_turn' then
      goal=home;power=true;raise(1.05);slew=side>0 and math.pi or 0
      if not attached() then abort()
      elseif math.abs(wrap(slew-s.angles[bearing]))<.06 and math.abs(s.rates[bearing])<.08 and math.abs(yaw)<.08 then phase('land') end
    elseif m.phase=='land' then
      goal=home;power=true;slew=side>0 and math.pi or 0;extension=s.blueprint[boom].travel
      if not attached() then abort()
      else
        local supported=mag.cargoSupportForce>cargo.mass*hypot(table.unpack(s.gravity))*.55
        local surface
        for _,b in ipairs(s.terrain) do
          if math.abs(cargo.centerOfMass[1]-b.x)<b.halfX and math.abs(cargo.centerOfMass[3]-b.z)<b.halfZ and b.high>s.waterHeight+.5 and b.high<cargo.centerOfMass[2] then surface=math.max(surface or -math.huge,b.high) end
        end
        local aligned=math.abs(wrap(slew-s.angles[bearing]))<.06 and math.abs(s.rates[bearing])<.08 and math.abs(extension-s.angles[boom])<.1 and math.abs(yaw)<.08
        reel=aligned and surface and not supported and 1 or 0
        m.still=aligned and surface and supported and hypot(cargo.vx,cargo.vy,cargo.vz)<.3 and m.still+s.dt or 0
        if m.still>.7 then phase('handoff') end
        if t-m.at>60 then phase('stow') end
      end
    elseif m.phase=='handoff' then
      goal=home;slew=side>0 and math.pi or 0;raise();if paid<2 then out.radio={kind='ready',cargo=m.job} end
      if cargo and cargo.delivered then m.deliveries=m.deliveries+1;m.job=0;phase('raise')
      elseif cargo and cargo.carriedBy~=0 and cargo.carriedBy~=s.id then m.handoffs=m.handoffs+1;m.job=0;phase('raise')
      elseif not cargo or t-m.at>90 then m.job=0;phase('raise') end
    elseif m.phase=='raise' then
      raise();if paid<1.9 then phase(hypot(s.x-exchange[1],s.z-exchange[2])<35 and 'seek' or 'outbound');m.route=1 end
    end
    if m.job~=0 and m.phase~='handoff' then out.radio={kind='claim',cargo=m.job} end
    set(winch,reel>0 and math.min(reel,.7/s.blueprint[winch].speed) or reel)
    set(boom,(2*(extension-s.angles[boom])-.3*s.rates[boom])/s.blueprint[boom].speed)
    if mast then
      local height=(m.phase=='unload_lift' or m.phase=='unload_turn' or m.phase=='land' or m.phase=='handoff') and s.blueprint[mast].travel or 0
      set(mast,(2*(height-s.angles[mast])-.3*s.rates[mast])/s.blueprint[mast].speed)
    end
    local stable=s.up>.9 and hypot(s.gyroscope[1],s.gyroscope[3])<.3
    set(bearing,stable and clamp((.9*wrap(slew-s.angles[bearing])-.7*s.rates[bearing])/s.blueprint[bearing].speed,attached() and .18 or .3) or 0)
    if math.abs(wrap(slew-s.angles[bearing]))>.15 or s.up<.9 then goal={s.x,s.z} end
  end
  set(head,power and 1 or -1)
  local dx,dz=goal[1]-s.x,goal[2]-s.z
  local halfX,halfZ=0,0
  for i,b in ipairs(s.blueprint) do if b.joint==0 and b.y<=1 then halfX=math.max(halfX,math.abs(b.x)+.7);halfZ=math.max(halfZ,math.abs(b.z)+.7) end end
  local function overlap(x,z)
    local cost=0
    for _,b in ipairs(s.terrain) do
      if b.high>s.waterHeight-.4 and b.low<s.waterHeight+.5 then
        local a,c=b.halfX+halfX-math.abs(x-b.x),b.halfZ+halfZ-math.abs(z-b.z)
        if a>0 and c>0 then cost=cost+math.min(a,c)^2 end
      end
    end
    return cost
  end
  local distance=hypot(dx,dz);local angle=math.atan(dx,dz);local step=math.min(3,distance)
  local before,best=overlap(s.x,s.z),nil;local steer
  for _,offset in ipairs({0,-.4,.4,-.8,.8,-1.2,1.2,-1.57,1.57}) do
    local x,z=s.x+math.sin(angle+offset)*step,s.z+math.cos(angle+offset)*step
    local cost=overlap(x,z);local middle=overlap((x+s.x)/2,(z+s.z)/2)
    if cost<.001 and middle<.001 or cost<before-.05 and middle<before then
      local score=hypot(x-goal[1],z-goal[2])+cost*100
      if not best or score<best then best=score;steer={x-s.x,z-s.z} end
    end
  end
  if steer then dx,dz=steer[1],steer[2] elseif before>0 then dx,dz=0,0 end
  local x=math.cos(yaw)*dx-math.sin(yaw)*dz;local z=math.sin(yaw)*dx+math.cos(yaw)*dz
  local wantX,wantZ=clamp(.45*x,speed),clamp(.45*z,speed)
  local fx=s.mass*(.35*wantX+.9*(wantX-s.localVelocity[1]))
  local fz=s.mass*(.35*wantZ+.9*(wantZ-s.localVelocity[3]))
  local torque=clamp(-90*wrap(yaw)-180*s.gyroscope[2],80)
  for _,i in ipairs(jets) do
    local b=s.blueprint[i];local lever=b.axis==0 and b.z or -b.x
    local force=(b.axis==0 and fx or fz)/math.max(1,counts[b.axis]/2)+torque*lever/math.max(1,moments[b.axis])
    set(i,math.max(0,force*-b.direction/b.force))
  end
  m.goal=goal
  for id,untilTime in pairs(m.failed) do if t>untilTime then m.failed[id]=nil end end
  return out
end
