local status={seek='Waiting to replenish the hoist bay',approach='Fetching reserve or recovered ammunition',align='Aligning the magnetic fork',pickup='Grasping ammunition',carry='Driving ammunition to the hoist',place='Placing ammunition below the crane',release='Releasing supported ammunition',clear='Clearing the crane pickup bay',returning='Returning through the service lane'}
return function(t,s,m)
  local function clamp(x,n) return math.max(-n,math.min(n,x)) end
  local function wrap(x) return math.atan(math.sin(x),math.cos(x)) end
  local function phase(p) m.phase=p;m.at=t;m.stable=0;if p=='carry' then m.leg=1;m.departureX=s.x;m.lane=nil end end
  local out={};local function set(b,u)u=clamp(u,1);if b.negative~=0 then out[string.char(b.negative)]=math.max(0,-u) end;if b.positive~=0 then out[string.char(b.positive)]=math.max(0,u) end end
  local wheels,steering,rams={}, {},{};local head,center=nil,0
  for i,b in ipairs(s.blueprint) do if b.joint==4 then wheels[#wheels+1]={i=i,b=b};center=center+b.z elseif b.joint==5 then head=i elseif b.joint==2 then rams[#rams+1]=i end end
  if not head or #wheels==0 then return out end
  center=center/#wheels
  for i,b in ipairs(s.blueprint) do if b.joint==1 and b.axis==1 then
    local n,z=0,0
    for _,v in ipairs(wheels) do local p=v.b.parent+1;while p>0 and p~=i do p=s.blueprint[p].parent+1 end;if p==i then n=n+1;z=z+v.b.z end end
    if n>0 and n<#wheels then
      steering[#steering+1]={i=i,side=z/n>=center and 1 or -1}
    end
  end end
  if not m.home then m.home={s.x,s.z};m.failed={};m.jobs=0;phase('seek') end
  local grip=s.magnets[head];local tip=s.positions[head];local q=s.rotation
  local yaw=math.atan(2*(q[1]*q[3]+q[2]*q[4]),1-2*(q[1]^2+q[2]^2))
  local reach=hypot(tip[1]-s.x,tip[3]-s.z)
  if not m.bay then
    local distance=math.huge
    for _,c in ipairs(s.nearby) do if c.anchored and c.team==s.team then
      local rope,magnet,dx,dz=false,nil,0,0
      for _,p in ipairs(s.parts(c.id)) do if p.joint==8 then rope=true elseif p.joint==5 then magnet=p elseif p.joint==2 then dx=dx+p.axisX*p.angle;dz=dz+p.axisZ*p.angle end end
      local d=hypot(c.x-s.x,c.z-s.z)
      if rope and magnet and d<distance then distance=d;m.station=c.id;m.bay={magnet.x-dx,c.y,magnet.z-dz} end
    end end
  end
  local box;for _,c in ipairs(s.nearby) do if c.id==m.job then box=c end end
  local claims={};for _,v in ipairs(s.radio) do if v.kind=='claim' and v.from~=s.id and s.worldTime-v.time<10 then claims[v.cargo]=true end end
  if m.phase=='seek' and m.bay then
    local occupied=false
    for _,c in ipairs(s.nearby) do if c.cargo and c.y<m.bay[2]+3 and hypot(c.x-m.bay[1],c.z-m.bay[3])<1.6 then occupied=true end end
    m.needsAmmo=not occupied
    if not occupied then
      local best=math.huge
      for _,c in ipairs(s.nearby) do
        local d=hypot(c.x-m.home[1],c.z-m.home[2])
        local recovery=s.combat and math.abs(c.x-s.combat.x)<s.combat.halfX+4 and math.abs(c.z-s.combat.z)<s.combat.halfZ and c.low<3 and hypot(c.vx,c.vy,c.vz)<1
        local score=d<8 and d or 1000+hypot(c.x-s.x,c.z-s.z)
        if c.cargo and c.team==s.team and c.supply==0 and c.mass<1.5 and c.carriedBy==0 and not claims[c.id]
          and (d<8 or recovery or m.failed[c.id]) and score<best and (m.failed[c.id] or 0)<t then box=c;best=score end
      end
      if box then m.delivered=false;m.job=box.id;m.recovery=best>=1000;m.pickYaw=math.atan(box.x-s.x,box.z-s.z);phase(hypot(box.x-s.x,box.z-s.z)<reach+4 and 'align' or 'approach') end
    end
  end
  local walls={}
  for _,b in ipairs(s.terrain) do if b.high>s.ground+.3 and b.low<s.ground+4 then walls[#walls+1]=b end end
  for _,c in ipairs(s.nearby) do if c.anchored then for _,b in ipairs(s.bounds(c.id)) do if b.high>s.ground+.3 and b.low<s.ground+4 then walls[#walls+1]=b end end end end
  local throttle,turn,power,raise,gear=0,0,false,0,1
  local function drive(x,z,limit,heading)
    local d=hypot(x-s.x,z-s.z);local aim=math.atan(x-s.x,z-s.z)
    if not heading and d>3 then
      local best=math.huge;local desired=aim;local look=math.min(6,d)
      for _,offset in ipairs({0,-.4,.4,-.8,.8,-1.2,1.2,-1.8,1.8,math.pi}) do
        local a=desired+offset;local nx,nz=math.sin(a),math.cos(a);local cost=hypot(x-s.x-nx*look,z-s.z-nz*look)+.2*math.abs(offset)
        for _,length in ipairs({2,4,look}) do for _,b in ipairs(walls) do if math.abs(s.x+nx*length-b.x)<b.halfX+2 and math.abs(s.z+nz*length-b.z)<b.halfZ+2 then cost=cost+100 end end end
        if cost<best then best=cost;aim=a end
      end
    end
    local bearing=wrap((heading or aim)-yaw);local want
    if heading then want=clamp(((x-s.x)*math.sin(yaw)+(z-s.z)*math.cos(yaw))*.5,limit);gear=want<0 and -1 or 1
    else gear=math.abs(bearing)>math.pi/2 and -1 or 1;bearing=wrap(bearing+(gear<0 and math.pi or 0));want=gear*math.min(limit,d*.5)*math.max(.25,math.cos(bearing)) end
    throttle=clamp(.3*want+.5*(want-s.localVelocity[3]),.65);turn=clamp(2*bearing-.5*s.gyroscope[2],.6)
    return d
  end
  if box and m.phase~='seek' and m.phase~='clear' and m.phase~='returning' then
    if t-m.at>(m.recovery and 180 or 90) or grip.attached and grip.creature~=box.id then m.failed[box.id]=t+30;phase('clear')
    elseif m.phase=='approach' then
      local x=box.x-math.sin(m.pickYaw)*(reach+3);local z=box.z-math.cos(m.pickYaw)*(reach+3)
      if drive(x,z,1)<2.2 then phase('align') end
    elseif m.phase=='align' then
      local error=wrap(math.atan(box.x-s.x,box.z-s.z)-yaw)
      local want=math.abs(error)>.07 and -.35 or 0
      gear=-1;throttle=clamp(.3*want+.5*(want-s.localVelocity[3]),.4);turn=clamp(1.7*error-.5*s.gyroscope[2],.6)
      if math.abs(error)<.07 and math.abs(s.gyroscope[2])<.12 then phase('pickup') end
    elseif m.phase=='pickup' then
      local dx,dz=box.x-tip[1],box.z-tip[3];local forward=dx*math.sin(yaw)+dz*math.cos(yaw)
      local error=math.atan(dx*math.cos(yaw)-dz*math.sin(yaw),math.max(1,forward))
      local want=.35*math.max(.3,math.cos(error));gear=1
      throttle=clamp(.3*want+.5*(want-s.localVelocity[3]),.4);turn=clamp(1.7*error-.5*s.gyroscope[2],.6);power=true
      if grip.attached and grip.creature==box.id then phase('carry') end
    elseif m.phase=='carry' then
      power=true;raise=1
      if not grip.attached then phase('clear') else
        if not m.lane then
          m.lane=m.bay[3]+8
          for _,b in ipairs(walls) do
            if b.x+b.halfX>math.min(m.departureX,m.bay[1]-10)-3 and b.x-b.halfX<math.max(m.departureX,m.bay[1]-10)+3
              and b.z+b.halfZ>m.bay[3]-4 and b.z-b.halfZ<m.bay[3]+5 then m.lane=math.max(m.lane,b.z+b.halfZ+4) end
          end
        end
        local x=m.leg==1 and m.departureX or m.bay[1]-10;local z=m.leg<3 and m.lane or m.bay[3]
        if drive(x,z,1)<2.5 then if m.leg<3 then m.leg=m.leg+1;m.at=t else phase('place') end end
      end
    elseif m.phase=='place' then
      power=true
      local dx,dz=m.bay[1]-box.x,m.bay[3]-box.z
      local error=wrap(math.atan(m.bay[1]-s.x,m.bay[3]-s.z)-math.atan(box.x-s.x,box.z-s.z))
      local forward=dx*math.sin(yaw)+dz*math.cos(yaw);local want=math.abs(error)>.035 and -.4 or clamp(forward*.5,.3)
      gear=want<0 and -1 or 1;throttle=clamp(.3*want+.5*(want-s.localVelocity[3]),.3);turn=clamp(2*error-.5*s.gyroscope[2],.6)
      raise=hypot(dx,dz)<.65 and 0 or 1
      if raise==0 then throttle=clamp(-.5*s.localVelocity[3],.3);turn=0 end
      m.stable=raise==0 and grip.cargoSupportForce>box.mass*hypot(table.unpack(s.gravity))*.6 and hypot(box.vx,box.vy,box.vz)<.25 and m.stable+s.dt or 0
      if not grip.attached then phase('clear') elseif m.stable>.4 then phase('release') end
    elseif m.phase=='release' then
      out.radio={kind='ready',cargo=box.id}
      if not grip.attached and t-m.at>1 then
        m.jobs=m.jobs+1;m.delivered=true;m.exit={s.x-math.sin(yaw)*(reach+1),s.z-math.cos(yaw)*(reach+1),yaw};phase('clear')
      end
    end
    if m.phase~='release' and m.phase~='clear' then out.radio={kind='claim',cargo=box.id} end
  elseif m.phase~='seek' and m.phase~='clear' and m.phase~='returning' then phase('clear') end
  if m.phase=='clear' then
    power=false;throttle=-.3;gear=-1
    if t-m.at>4 then m.job=nil;m.leg=1;phase(m.delivered and 'returning' or 'seek') end
  end
  if m.phase=='returning' then
    m.exit=m.exit or {s.x-math.sin(yaw)*(reach+1),s.z-math.cos(yaw)*(reach+1),yaw}
    local x=m.leg<3 and m.exit[1] or m.home[1]
    local z=m.leg==1 and m.exit[2] or m.leg<4 and m.lane or m.home[2]
    if drive(x,z,1,m.leg==1 and m.exit[3] or nil)<(m.leg==1 and 1 or 2.5) then if m.leg<4 then m.leg=m.leg+1 else m.delivered=false;phase('seek') end end
    if t-m.at>180 then m.delivered=false;phase('seek') end
  end
  if m.phase=='seek' then
    local x,z=m.home[1],m.home[2]
    if m.needsAmmo and s.combat then
      if not m.patrolAt or t>m.patrolAt then m.patrol=not m.patrol;m.patrolAt=t+90 end
      if m.patrol then x=s.combat.x+(m.home[1]<s.combat.x and -1 or 1)*s.combat.halfX*.65;z=s.combat.z+clamp(m.home[2]-s.combat.z,s.combat.halfZ*.6) end
    end
    drive(x,z,1)
  end
  if s.up<.7 then throttle=0;turn=0 end
  for _,v in ipairs(steering) do set(s.blueprint[v.i],3*(turn*v.side*gear-s.angles[v.i])-.45*s.rates[v.i]) end
  for _,v in ipairs(wheels) do set(v.b,throttle) end
  for _,i in ipairs(rams) do set(s.blueprint[i],2*(math.min(raise,s.blueprint[i].travel)-s.angles[i])-.3*s.rates[i]) end
  set(s.blueprint[head],power and 1 or -1);m.status=not m.bay and 'Needs an ammunition hoist' or status[m.phase] or m.phase
  return out
end
