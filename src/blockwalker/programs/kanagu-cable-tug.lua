local status={seek='Patrolling for deployed rope handles',approach='Approaching the ground handle',haul='Towing captured aircraft',recover='Aircraft released / gathering spent cable',returning='Returning the round to its loading bay',unload='Dropping the recovered round',clear='Clearing the loading bay'}
return function(t,s,m)
  local function clamp(x,n) return math.max(-n,math.min(n,x)) end
  local function wrap(x) return math.atan(math.sin(x),math.cos(x)) end
  local function phase(p) if m.phase~=p then m.phase=p;m.at=t end end
  if not m.home then m.home={s.x,s.z};m.stock={};m.recycled=0;phase('seek') end
  m.stock=m.stock or {};m.grounded=m.grounded or {}
  local wheels,steering={},{};local head,rams=nil,{};local center=0
  for i,b in ipairs(s.blueprint) do
    if b.joint==4 then wheels[#wheels+1]={i=i,b=b};center=center+b.z end
    if b.joint==5 then head=i end
    if b.joint==2 then rams[#rams+1]=i end
  end
  if not head or #wheels==0 then return {} end
  center=center/#wheels
  for i,b in ipairs(s.blueprint) do
    if b.joint==1 and b.axis==1 then
      local count,z=0,0
      for _,w in ipairs(wheels) do
        local parent=w.b.parent+1
        while parent>0 and parent~=i do parent=s.blueprint[parent].parent+1 end
        if parent==i then count=count+1;z=z+w.b.z end
      end
      if count>0 and count<#wheels then steering[#steering+1]={i=i,side=z/count>=center and 1 or -1} end
    end
  end
  local grip=s.magnets[head];local tip=s.positions[head];local job,handle,catch,cable
  local distance=math.huge;local returningRound=false
  for _,c in ipairs(s.nearby) do
    if c.cargo and c.team==s.team then
      local parts=s.parts(c.id);local rope,hook
      for _,p in ipairs(parts) do if p.joint==8 then rope=p end;if p.joint==5 and p.target~=0 then hook=p.target end end
      if rope then
        if not m.stock[c.id] and not hook and c.y<s.ground+3 and rope.angle<3 and t<10 then m.stock[c.id]={c.x,c.z} end
        local bay=m.stock[c.id]
        if not hook and c.magnetCount==0 and c.y<s.ground+3 then m.grounded[c.id]=m.grounded[c.id] or t else m.grounded[c.id]=nil end
        local missed=bay and m.grounded[c.id] and t-m.grounded[c.id]>15 and hypot(c.x-bay[1],c.z-bay[2])>3
        for _,p in ipairs(parts) do
          if p.body==rope.body and (p.joint==0 or p.joint==8) and p.y<s.ground+2 then
            local d=hypot(p.x-tip[1],p.z-tip[3])+(hook and 0 or 50)
            local held=grip.attached and grip.creature==c.id
            if held or not grip.attached and (hook or missed) and d<distance then job,handle,catch,cable,distance=c,p,hook,rope,d;returningRound=missed end
          end
        end
      end
    end
  end
  local q=s.rotation;local yaw=math.atan(2*(q[1]*q[3]+q[2]*q[4]),1-2*(q[2]^2+q[3]^2))
  local throttle,turn,power=0,0,false;local out={}
  local function set(b,u) u=clamp(u,1);if b.negative~=0 then out[string.char(b.negative)]=math.max(0,-u) end;if b.positive~=0 then out[string.char(b.positive)]=math.max(0,u) end end
  local walls={}
  for _,b in ipairs(s.terrain) do if b.high>s.ground+.3 and b.low<s.ground+4 then walls[#walls+1]=b end end
  for _,c in ipairs(s.nearby) do
    if c.id~=(job and job.id) and c.low<s.ground+4 and c.high>s.ground+.3 and c.anchored then
      for _,b in ipairs(s.bounds(c.id)) do if b.high>s.ground+.3 and b.low<s.ground+4 then walls[#walls+1]=b end end
    end
  end
  local function drive(x,z,reach,speed)
    local aim=math.atan(x-s.x,z-s.z);local length=hypot(x-s.x,z-s.z)
    if length>reach+2 then
      local best=math.huge;local desired=aim;local look=math.min(7,length)
      for _,offset in ipairs({0,-.4,.4,-.8,.8,-1.2,1.2,-1.8,1.8,math.pi}) do
        local angle=desired+offset;local nx,nz=math.sin(angle),math.cos(angle)
        local score=hypot(x-s.x-nx*look,z-s.z-nz*look)+.2*math.abs(offset)+.2*math.abs(wrap(angle-yaw))
        for _,distance in ipairs({2,4,look}) do
          local px,pz=s.x+nx*distance,s.z+nz*distance
          for _,b in ipairs(walls) do
            if math.abs(px-b.x)<b.halfX+2.5 and math.abs(pz-b.z)<b.halfZ+2.5 then score=score+100 end
          end
        end
        if score<best then best=score;aim=angle end
      end
    end
    local bearing=wrap(aim-yaw)
    local want=clamp(.6*(length-reach),speed)
    if math.abs(bearing)>1.7 then want=-math.min(.35,speed);bearing=wrap(bearing+math.pi) end
    if math.abs(bearing)>.1 and math.abs(want)<.2 and length>reach+.2 then want=.2 end
    throttle=clamp(.35*want+.7*(want-s.localVelocity[3]),.7);turn=clamp(1.5*bearing-.5*s.gyroscope[2],.6)
    return length
  end
  if m.phase=='unload' then
    out.radio={kind='ready',cargo=m.job}
    if not grip.attached and t-m.at>1 then if m.returned then m.recycled=m.recycled+1 else m.failedReturns=(m.failedReturns or 0)+1 end;phase('clear') end
  elseif m.phase=='clear' then
    throttle=-.3
    if t-m.at>5 then m.job=nil;phase('seek') end
  elseif job and handle then
    if m.job~=job.id then m.job=job.id;phase('approach') end
    m.handle={handle.x,handle.y,handle.z}
    if grip.attached and grip.creature==job.id then
      power=true;out.radio={kind='claim',cargo=job.id}
      if catch then
        if m.phase~='haul' then m.heading=yaw;m.begin={s.x,s.z};phase('haul') end
        throttle=-.3;turn=clamp(1.2*wrap(m.heading-yaw)-.5*s.gyroscope[2],.6)
        if hypot(s.x-m.begin[1],s.z-m.begin[2])>10 then throttle=0 end
      elseif cable.angle>2 then phase('recover')
      else
        if m.phase~='returning' then m.returnHome=true;phase('returning') end
        local bay=m.stock[job.id] or m.home
        local dx,dz=bay[1]-job.x,bay[2]-job.z
        if m.returnHome then
          drive(m.home[1],m.home[2],2,.7)
          if hypot(s.x-m.home[1],s.z-m.home[2])<3 then m.returnHome=false end
        else drive(s.x+dx,s.z+dz,0,.6) end
        m.returned=hypot(dx,dz)<1.1 and hypot(s.vx,s.vz)<.5
        if m.returned or t-m.at>180 then phase('unload');power=false;throttle=0;turn=0 end
      end
    else
      phase('approach')
      local reach=hypot(tip[1]-s.x,tip[3]-s.z)+1.05
      drive(handle.x,handle.z,reach,.9)
      power=(catch or returningRound) and hypot(handle.x-tip[1],handle.z-tip[3])<1.5
      out.radio={kind='claim',cargo=job.id}
    end
  else
    phase('seek');m.job=nil
    local x,z=m.home[1],m.home[2]
    if s.combat then
      local side=m.home[1]<s.combat.x and -1 or 1;m.patrol=m.patrol or 0
      x=s.combat.x+side*math.min(18,s.combat.halfX*.25);z=s.combat.z+(m.patrol==0 and -10 or 10)
      if hypot(s.x-x,s.z-z)<2 then m.arrived=m.arrived or t;if t-m.arrived>4 then m.patrol=1-m.patrol;m.arrived=nil end else m.arrived=nil end
    end
    drive(x,z,1,.5)
  end
  if grip.attached and (not job or grip.creature~=job.id) then power=false end
  if m.phase=='seek' or m.phase=='approach' or m.phase=='returning' then
    m.motion=m.motion or {s.x,s.z,t}
    if t-m.motion[3]>4 then
      if hypot(s.x-m.motion[1],s.z-m.motion[2])<.5 and math.abs(throttle)>.2 then
        m.escapeUntil=t+3;m.escapePower=throttle>0 and -.35 or .35;m.escapeTurn=turn<0 and -.5 or .5
      end
      m.motion={s.x,s.z,t}
    end
    if t<(m.escapeUntil or 0) then throttle=m.escapePower;turn=m.escapeTurn end
  else m.motion=nil;m.escapeUntil=nil end
  if s.up<.7 then throttle=0;turn=0 end
  for _,v in ipairs(steering) do
    local b=s.blueprint[v.i];local target=turn*v.side*(throttle<0 and -1 or 1)
    set(b,3*(target-s.angles[v.i])-.45*s.rates[v.i])
  end
  for _,w in ipairs(wheels) do set(w.b,throttle) end
  for _,i in ipairs(rams) do set(s.blueprint[i],-2*s.angles[i]-.3*s.rates[i]) end
  set(s.blueprint[head],power and 1 or -1)
  m.status=m.phase=='approach' and returningRound and 'Recovering missed ammunition' or status[m.phase] or m.phase
  return out
end
