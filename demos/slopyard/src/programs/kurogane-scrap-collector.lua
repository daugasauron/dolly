local status={seek='Patrolling for incapacitated enemies',approach='Claiming an enemy wreck',lower='Lowering the salvage grapple',lift='Lifting the captured machine',carry='Carrying the wreck to the scrapyard',deposit='Lowering into the scrap pit',release='Releasing the wreck',abort='Clearing the failed pickup'}
return function(t,s,m)
  local function clamp(x,n) return math.max(-n,math.min(n,x)) end
  local function phase(name) m.phase=name;m.at=t;m.stable=0;m.support=0;m.contactY=nil end
  if not m.home then m.home={s.x,s.z};m.cooldown={};m.stalled={};m.deliveries=0;phase('seek') end
  local jets,rope,hook={},nil,nil
  local thrust,cx,cz,n=0,0,0,0
  for i,b in ipairs(s.blueprint) do
    if b.joint==3 and b.axis==1 then
      jets[#jets+1]={i=i,b=b}
      if b.direction<0 then thrust=thrust+b.force;cx=cx+b.x;cz=cz+b.z;n=n+1 end
    end
    if b.joint==8 then rope=i end
    if b.joint==5 then hook=i end
  end
  if not rope or not hook or n<3 then m.status='Needs vertical thrusters, a winch and a magnet';return {} end
  local gravity=hypot(table.unpack(s.gravity))
  local grip=s.magnets[hook];local tip=s.positions[hook];local cable=s.winches[rope]
  local yard,nearest=nil,math.huge
  for _,p in ipairs(s.scrapyards or {}) do
    local d=hypot(p.x-s.x,p.z-s.z)
    if p.team==s.team and d<nearest then yard=p;nearest=d end
  end
  local function inYard(c)
    for _,p in ipairs(s.scrapyards or {}) do if hypot(c.x-p.x,c.z-p.z)<p.radius then return true end end
    return false
  end
  local function ground(c)
    local height=s.waterHeight
    for _,p in ipairs(s.terrain) do
      if math.abs(c.x-p.x)<=p.halfX and math.abs(c.z-p.z)<=p.halfZ and p.high<c.low+1 then height=math.max(height,p.high) end
    end
    return height
  end
  local claims={}
  for _,v in ipairs(s.radio) do
    if v.kind=='claim' and v.from~=s.id and s.worldTime-v.time<10 then claims[v.target]=v.from end
  end
  local target
  for _,c in ipairs(s.nearby) do if c.id==m.target then target=c end end
  local function enemy(c) return c and c.team~=0 and c.team~=s.team and not c.cargo and not c.anchored end
  local function incapacitated(c)
    return enemy(c) and (c.up<.45 or c.controllerStopped) and hypot(c.vx,c.vy,c.vz)<.4 and c.low<ground(c)+.8
  end
  local function abort(reason)
    if m.target then m.cooldown[m.target]=t+60 end
    m.reason=reason;phase('abort')
  end
  if m.phase=='release' and (not target or not yard) then abort('Target or scrapyard unavailable') end
  if m.phase~='seek' and m.phase~='release' and m.phase~='abort' then
    if not enemy(target) or not yard then abort('Target or scrapyard unavailable')
    elseif grip.attached and grip.creature~=target.id then abort('Unintended contact')
    elseif (m.phase=='approach' or m.phase=='lower') and not (grip.attached and grip.creature==target.id) and (not incapacitated(target) or target.carriedBy~=0 or claims[target.id]) then abort('Target recovered or already claimed')
    elseif t-m.at>({approach=90,lower=60,lift=45,carry=240,deposit=60})[m.phase] then abort('Pickup deadline') end
  end
  if m.phase=='seek' and yard then
    local stalled={};local score=math.huge
    local capacity=math.min(s.blueprint[hook].force*.7/gravity,thrust*.8/gravity-s.mass)
    for _,c in ipairs(s.nearby) do
      if incapacitated(c) and c.carriedBy==0 and not inYard(c) and not claims[c.id] and c.mass<capacity and (m.cooldown[c.id] or 0)<t then
        stalled[c.id]=m.stalled[c.id] or t
        local d=hypot(c.x-s.x,c.z-s.z)
        if t-stalled[c.id]>5 and d<score then target=c;score=d end
      end
    end
    m.stalled=stalled
    if target then m.target=target.id;m.reason=nil;phase('approach') end
  end
  local tx,tz=m.home[1],m.home[2]
  local height=math.max(18,s.ground+8);local length=2;local power=false;local payload=0
  local out={}
  if target and m.phase~='seek' and m.phase~='abort' then
    local point,best,support=nil,-math.huge,0
    for _,p in ipairs(s.parts(target.id)) do
      support=support+(p.supportForce or 0)
      if p.body==0 then
        local d=hypot(p.x-target.centerOfMass[1],p.z-target.centerOfMass[3])
        local score=p.y-.25*d*d
        if score>best then best=score;point=p end
      end
    end
    point=point or target
    tx=point.x;tz=point.z
    if m.phase=='approach' or m.phase=='lower' then
      out.radio={kind='claim',target=target.id}
      height=math.max(12,s.ground+8,point.y+7)
      if m.phase=='approach' and hypot(tip[1]-point.x,tip[3]-point.z)<.6 and hypot(s.vx,s.vz)<.3 then phase('lower') end
      if m.phase=='lower' then
        length=clamp(cable.paidOut+tip[2]-point.y-.9,s.blueprint[rope].travel)
        length=math.max(1,length)
        local closest,body=math.huge,nil
        for _,c in ipairs(s.nearby) do
          for _,b in ipairs(s.bounds(c.id)) do
            local d=hypot(math.max(0,math.abs(tip[1]-b.x)-b.halfX),math.max(0,b.low-tip[2],tip[2]-b.high),math.max(0,math.abs(tip[3]-b.z)-b.halfZ))
            if d<closest then closest=d;body=c.id end
          end
        end
        power=body==target.id and closest<1.4
        if grip.attached and grip.creature==target.id then
          m.hold={s.x,s.z};m.liftY=s.y;m.length=cable.paidOut;phase('lift')
        end
      end
    end
    if m.phase=='lift' or m.phase=='carry' or m.phase=='deposit' then
      power=true;payload=target.mass
      length=math.max(2,m.length-math.max(0,t-m.at)*.4)
      out.radio={kind='claim',target=target.id}
      if not grip.attached then abort('Lost the load');power=false;payload=0
      elseif m.phase=='lift' then
        tx=m.hold[1];tz=m.hold[2];height=m.liftY+math.min(8,(t-m.at)*.7)
        m.stable=target.low>ground(target)+2 and m.stable+s.dt or 0
        if m.stable>2 then m.length=cable.paidOut;phase('carry') end
      elseif m.phase=='carry' then
        tx=yard.x;tz=yard.z
        if hypot(target.centerOfMass[1]-yard.x,target.centerOfMass[3]-yard.z)<math.min(1,yard.radius*.2) and hypot(s.vx,s.vz)<.3 then m.length=cable.paidOut;phase('deposit') end
      elseif m.phase=='deposit' then
        tx=yard.x;tz=yard.z;length=m.length
        m.support=m.support+.15*(support-m.support)
        payload=math.max(0,target.mass-m.support/gravity)
        local supported=m.support>target.mass*gravity*.35
        if supported and not m.contactY then m.contactY=s.y end
        if m.contactY and not supported then m.contactY=m.contactY-.2*s.dt end
        height=m.contactY or s.y+yard.y+.7-target.low
        local inside=hypot(target.centerOfMass[1]-yard.x,target.centerOfMass[3]-yard.z)<yard.radius*.6
        m.stable=inside and (supported or target.low<yard.y+1) and hypot(target.vx,target.vy,target.vz)<.5 and m.stable+s.dt or 0
        if m.stable>1 then m.releaseY=s.y;phase('release');power=false end
      end
    end
    if m.phase=='release' then
      tx=yard.x;tz=yard.z;height=m.releaseY+math.min(5,t-m.at);length=m.length
      out.radio={kind='release',target=target.id}
      if not grip.attached and t-m.at>3 then
        if inYard(target) then m.deliveries=m.deliveries+1 end
        m.cooldown[target.id]=t+300;m.target=nil;target=nil;phase('seek')
      end
    end
  end
  if m.phase=='abort' then
    tx=s.x;tz=s.z;height=math.max(s.y,18,s.ground+8);power=false
    if m.target then out.radio={kind='release',target=m.target} end
    if not grip.attached and t-m.at>3 then m.target=nil;target=nil;phase('seek') end
  end
  if m.phase=='seek' then
    m.patrol=m.patrol or 1
    local stops={{m.home[1],m.home[2]},{m.home[1]*.5,m.home[2]-25},{0,m.home[2]},{m.home[1]*.5,m.home[2]+25}}
    local report
    for _,v in ipairs(s.radio) do if v.kind=='threat' and s.worldTime-v.time<30 and (m.cooldown[v.target] or 0)<t then report=v end end
    if report then tx=report.x;tz=report.z else tx=stops[m.patrol][1];tz=stops[m.patrol][2] end
    if hypot(tx-s.x,tz-s.z)<2 then
      m.arrived=m.arrived or t
      if t-m.arrived>6 then m.patrol=m.patrol%#stops+1;m.arrived=nil end
    else m.arrived=nil end
  end
  local clearance=math.max(s.ground+6,12)
  local span=3.5
  if payload>0 and target then span=math.max(span,target.radius+1) end
  for _,p in ipairs(s.terrain) do
    if p.x+p.halfX>math.min(s.x,tx)-span and p.x-p.halfX<math.max(s.x,tx)+span and p.z+p.halfZ>math.min(s.z,tz)-span and p.z-p.halfZ<math.max(s.z,tz)+span then
      local drop=payload>0 and target and math.max(6,s.y-target.low+2) or 6
      clearance=math.max(clearance,p.high+drop)
    end
  end
  if m.phase=='seek' or m.phase=='approach' or m.phase=='lower' or m.phase=='carry' then
    height=math.max(height,clearance)
    if s.y<height-2 and m.phase~='lower' then tx=s.x;tz=s.z end
  end
  local q=s.rotation;local x,y,z,w=q[1],q[2],q[3],q[4]
  local function localv(v)
    return {(1-2*(y*y+z*z))*v[1]+2*(x*y+z*w)*v[2]+2*(x*z-y*w)*v[3],2*(x*y-z*w)*v[1]+(1-2*(x*x+z*z))*v[2]+2*(y*z+x*w)*v[3],2*(x*z+y*w)*v[1]+2*(y*z-x*w)*v[2]+(1-2*(x*x+y*y))*v[3]}
  end
  local speed=payload>0 and 1 or 1.6
  local a=localv({clamp(.9*(clamp(.5*(tx-s.x),speed)-s.vx),.45),0,clamp(.9*(clamp(.5*(tz-s.z),speed)-s.vz),.45)})
  local ep=clamp(a[3]/gravity,.15)-math.atan(s.gravity[3],-s.gravity[2]);local er=clamp(-a[1]/gravity,.15)-math.atan(-s.gravity[1],-s.gravity[2])
  local ay=clamp(1.5*(clamp(.8*(height-s.y),1.2)-s.vy),2)
  local total=(s.mass+payload)*(gravity+ay)/math.max(.6,s.up)
  local com=localv({s.centerOfMass[1]-s.x,s.centerOfMass[2]-s.y,s.centerOfMass[3]-s.z})
  cx=cx/n;cz=cz/n;local xx,zz=0,0
  for _,j in ipairs(jets) do if j.b.direction<0 then xx=xx+(j.b.x-cx)^2;zz=zz+(j.b.z-cz)^2 end end
  local gain=math.max(140,s.mass*(xx+zz)*3/n)
  local damping=math.sqrt(gain*s.mass)*1.7
  local mx=gain*ep-damping*s.gyroscope[1]-total*com[3];local mz=gain*er-damping*s.gyroscope[3]+total*com[1]
  local function set(b,u) u=clamp(u,1);if b.negative~=0 then out[string.char(b.negative)]=math.max(0,-u) end;if b.positive~=0 then out[string.char(b.positive)]=math.max(0,u) end end
  for _,j in ipairs(jets) do local b=j.b;local force=total/n-mx*(b.z-cz)/math.max(.1,zz)+mz*(b.x-cx)/math.max(.1,xx);set(b,math.max(0,-b.direction*force/b.force)) end
  set(s.blueprint[rope],(length-cable.paidOut)*2)
  if s.up<.4 then power=false;out.radio={kind='help',target=s.id} end
  set(s.blueprint[hook],power and 1 or -1)
  m.flight={height=height,goal={tx,tz},length=length,payload=payload,hook={tip[1],tip[2],tip[3]}}
  m.status=not yard and 'Needs a team scrapyard' or status[m.phase] or m.phase
  return out
end
