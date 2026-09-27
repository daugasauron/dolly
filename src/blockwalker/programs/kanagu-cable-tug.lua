local status={seek='Looking for tether handles',approach='Approaching the rope handle',wait='Waiting for interception',hold='Holding the rope handle',haul='Towing captured aircraft'}
return function(t,s,m)
  local function clamp(x,n) return math.max(-n,math.min(n,x)) end
  local function wrap(x) return math.atan(math.sin(x),math.cos(x)) end
  local function phase(p) m.phase=p;m.at=t end
  if not m.home then m.home={s.x,s.z};phase('seek') end
  local wheels,steering={},{};local head,rams=nil,{}
  local center=0
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
  local grip=s.magnets[head];local tip=s.positions[head];local job,handle,catch
  local distance=math.huge
  for _,c in ipairs(s.nearby) do
    if c.cargo and (c.team==s.team or c.team==0) then
      local parts=s.parts(c.id);local rope,hook
      for _,p in ipairs(parts) do
        if p.joint==8 then rope=p end
        if p.joint==5 and p.target~=0 then hook=p.target end
      end
      if rope then
        for _,p in ipairs(parts) do
          if p.body==rope.body and p.joint==0 and p.y<s.ground+2 then
            local d=hypot(p.x-tip[1],p.z-tip[3])
            if grip.attached and grip.creature==c.id or not grip.attached and d<distance then job,handle,catch,distance=c,p,hook,d end
          end
        end
      end
    end
  end
  local q=s.rotation;local yaw=math.atan(2*(q[1]*q[3]+q[2]*q[4]),1-2*(q[2]^2+q[3]^2))
  local throttle,turn,power=0,0,false;local out={}
  local function set(b,u) u=clamp(u,1);if b.negative~=0 then out[string.char(b.negative)]=math.max(0,-u) end;if b.positive~=0 then out[string.char(b.positive)]=math.max(0,u) end end
  if job and handle then
    if m.job~=job.id then m.park={handle.x,handle.z} end
    m.job=job.id;m.handle={handle.x,handle.y,handle.z}
    if grip.attached and grip.creature==job.id then
      power=true
      if catch then
        if m.phase~='haul' then m.heading=yaw;m.begin={s.x,s.z};phase('haul') end
        throttle=-.3;turn=clamp(1.2*wrap(m.heading-yaw)-.5*s.gyroscope[2],.6)
        if hypot(s.x-m.begin[1],s.z-m.begin[2])>12 then throttle=0 end
      else phase('hold') end
    else
      phase('approach')
      local target=catch and {handle.x,handle.z} or m.park
      local bearing=wrap(math.atan(target[1]-s.x,target[2]-s.z)-yaw)
      local length=hypot(target[1]-s.x,target[2]-s.z)
      local reach=hypot(tip[1]-s.x,tip[3]-s.z)+(catch and 1.05 or 1.5)
      local want=clamp(.6*(length-reach),1)
      if math.abs(bearing)>1.7 then want=-.35;bearing=wrap(bearing+math.pi) end
      if math.abs(bearing)>.1 and math.abs(want)<.2 then want=.2 end
      throttle=clamp(.35*want+.7*(want-s.localVelocity[3]),.7)
      turn=clamp(1.5*bearing-.5*s.gyroscope[2],.6)
      power=catch and hypot(handle.x-tip[1],handle.z-tip[3])<1.5
      if not catch and hypot(target[1]-tip[1],target[2]-tip[3])<1.8 then throttle=0;turn=0;phase('wait') end
    end
  else phase('seek') end
  if grip.attached and (not job or grip.creature~=job.id) then power=false end
  if s.up<.7 then throttle=0;turn=0 end
  for _,v in ipairs(steering) do
    local b=s.blueprint[v.i];local target=turn*v.side*(throttle<0 and -1 or 1)
    set(b,3*(target-s.angles[v.i])-.45*s.rates[v.i])
  end
  for _,w in ipairs(wheels) do set(w.b,throttle) end
  for _,i in ipairs(rams) do set(s.blueprint[i],-2*s.angles[i]-.3*s.rates[i]) end
  set(s.blueprint[head],power and 1 or -1)
  m.status=status[m.phase] or m.phase
  return out
end
