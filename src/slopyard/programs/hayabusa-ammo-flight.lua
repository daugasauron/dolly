local status={seek='Waiting for an empty rooftop magazine slot',approach='Fetching reserve or recovered ammunition',lower='Grasping ammunition',lift='Climbing with ammunition',carry='Supplying the rooftop battery',deposit='Landing ammunition in the magazine',release='Releasing supported ammunition',abort='Clearing the failed transfer'}
return function(t,s,m)
  local function clamp(x,n) return math.max(-n,math.min(n,x)) end
  local out={};local function set(b,u) u=clamp(u,1);if b.negative~=0 then out[string.char(b.negative)]=math.max(0,-u) end;if b.positive~=0 then out[string.char(b.positive)]=math.max(0,u) end end
  local function phase(p) m.phase=p;m.at=t;m.stable=0 end
  local jets,head={},nil;local thrust,cx,cz,n=0,0,0,0
  for i,b in ipairs(s.blueprint) do
    if b.joint==5 then head=i elseif b.joint==3 and b.axis==1 then
      jets[#jets+1]={i=i,b=b};if b.direction<0 then thrust=thrust+b.force;cx=cx+b.x;cz=cz+b.z;n=n+1 end
    end
  end
  if not head or n<3 then return out end
  if not m.home then m.home={s.x,s.z};m.failed={};m.jobs=0;phase('seek') end
  local gravity=hypot(table.unpack(s.gravity));local tip=s.positions[head];local grip=s.magnets[head]
  if not m.bays then
    local nearest=math.huge
    for _,c in ipairs(s.nearby) do if c.team==s.team and c.anchored then
      local axes,magnet={},nil;local hx,hz,tx,tz=0,0,0,0
      for _,p in ipairs(s.parts(c.id)) do
        if p.joint==2 then
          if math.abs(p.axisX)>.8 then axes.x=true;hx=hx+p.angle*p.axisX;tx=tx+p.travel end
          if math.abs(p.axisZ)>.8 then axes.z=true;hz=hz+p.angle*p.axisZ;tz=tz+p.travel end
        elseif p.joint==5 then magnet=p end
      end
      local d=hypot(c.x-m.home[1],c.z-m.home[2])
      if axes.x and axes.z and magnet and d<nearest then
        nearest=d;m.station=c.id;m.bays={}
        for _,offset in ipairs({-2,0,2}) do m.bays[#m.bays+1]={magnet.x-hx-tx/3+offset,c.y,magnet.z-hz-tz*2/3} end
      end
    end end
  end
  local box;for _,c in ipairs(s.nearby) do if c.id==m.job then box=c end end
  local claims={};for _,v in ipairs(s.radio) do if v.kind=='claim' and v.from~=s.id and s.worldTime-v.time<10 then claims[v.cargo]=true end end
  if m.phase=='seek' and m.bays then
    local bay
    for _,p in ipairs(m.bays) do
      local occupied=false
      for _,c in ipairs(s.nearby) do if c.cargo and math.abs(c.y-p[2])<2 and hypot(c.x-p[1],c.z-p[3])<1.6 then occupied=true end end
      if not occupied then bay=p;break end
    end
    m.needsAmmo=bay~=nil
    if bay then
      local distance=math.huge;local capacity=math.min(1.5,s.blueprint[head].force*.7/gravity,thrust*.8/gravity-s.mass)
      for _,c in ipairs(s.nearby) do
        local d=hypot(c.x-m.home[1],c.z-m.home[2])
        local recovery=s.combat and math.abs(c.x-s.combat.x)<s.combat.halfX+4 and math.abs(c.z-s.combat.z)<s.combat.halfZ and hypot(c.vx,c.vy,c.vz)<1.5
        local score=d<8 and d or 1000+hypot(c.x-s.x,c.z-s.z)
        if c.cargo and c.team==s.team and c.supply==0 and c.mass<capacity and c.carriedBy==0 and not claims[c.id]
          and (d<8 or recovery or m.failed[c.id]) and score<distance and (m.failed[c.id] or 0)<t then box=c;distance=score end
      end
      if box then m.job=box.id;m.bay=bay;phase('approach') end
    end
  end
  local tx,tz=m.home[1],m.home[2];local height=math.max(8,s.ground+6);local power,payload=false,0
  if m.phase=='seek' and m.needsAmmo and s.combat then
    if not m.patrolAt or t>m.patrolAt then m.patrol=not m.patrol;m.patrolAt=t+90 end
    if m.patrol then
      tx=s.combat.x+(m.home[1]<s.combat.x and -1 or 1)*s.combat.halfX*.65
      tz=s.combat.z+clamp(m.home[2]-s.combat.z,s.combat.halfZ*.6)
    end
  end
  if m.phase~='seek' and m.phase~='abort' and (not box or t-m.at>120 or grip.attached and grip.creature~=m.job) then
    if m.job then m.failed[m.job]=t+30 end;phase('abort')
  end
  if box and m.phase~='seek' and m.phase~='abort' then
    out.radio={kind='claim',cargo=box.id};tx=box.x;tz=box.z
    if m.phase=='approach' then
      height=math.max(box.high+5,s.ground+5)
      if hypot(tip[1]-box.x,tip[3]-box.z)<.2 and hypot(s.vx,s.vz)<.2 then phase('lower') end
    end
    if m.phase=='lower' then
      height=s.y+box.high+.6-tip[2]
      power=hypot(tip[1]-box.x,tip[3]-box.z)<.5 and tip[2]-box.high<1.3
      if grip.attached and grip.creature==box.id then m.hold={s.x,s.z};phase('lift') end
    end
    if m.phase=='lift' or m.phase=='carry' or m.phase=='deposit' then
      power=true;payload=box.mass
      if not grip.attached then phase('abort');power=false;payload=0
      elseif m.phase=='lift' then
        tx=m.hold[1];tz=m.hold[2];height=math.max(s.ground+6,m.bay[2]+8)
        if s.y>height-.5 and math.abs(s.vy)<.4 then phase('carry') end
      elseif m.phase=='carry' then
        tx=s.x+m.bay[1]-box.x;tz=s.z+m.bay[3]-box.z;height=m.bay[2]+8
        if hypot(box.x-m.bay[1],box.z-m.bay[3])<.2 and hypot(s.vx,s.vz)<.2 then phase('deposit') end
      else
        tx=s.x+m.bay[1]-box.x;tz=s.z+m.bay[3]-box.z
        local supported=grip.cargoSupportForce>box.mass*gravity*.6
        height=s.y+m.bay[2]-box.y-.08
        payload=math.max(0,box.mass-grip.cargoSupportForce/gravity)
        m.stable=supported and hypot(box.vx,box.vy,box.vz)<.25 and m.stable+s.dt or 0
        if m.stable>.4 then m.releaseY=s.y;phase('release');power=false end
      end
    end
    if m.phase=='release' then
      tx=m.bay[1];tz=m.bay[3];height=m.releaseY+4;out.radio={kind='ready',cargo=box.id}
      if not grip.attached and t-m.at>2 then m.jobs=m.jobs+1;m.job=nil;phase('seek') end
    end
  end
  if m.phase=='abort' then tx=s.x;tz=s.z;height=math.max(s.y,s.ground+6);if not grip.attached and t-m.at>2 then m.job=nil;phase('seek') end end
  if m.phase=='seek' or m.phase=='approach' or m.phase=='carry' then
    for _,p in ipairs(s.terrain) do
      if p.x+p.halfX>math.min(s.x,tx)-3 and p.x-p.halfX<math.max(s.x,tx)+3 and p.z+p.halfZ>math.min(s.z,tz)-3 and p.z-p.halfZ<math.max(s.z,tz)+3 then height=math.max(height,p.high+6) end
    end
    for _,c in ipairs(s.nearby) do if c.anchored then
      for _,p in ipairs(s.bounds(c.id)) do
        if p.x+p.halfX>math.min(s.x,tx)-3 and p.x-p.halfX<math.max(s.x,tx)+3 and p.z+p.halfZ>math.min(s.z,tz)-3 and p.z-p.halfZ<math.max(s.z,tz)+3 then height=math.max(height,p.high+6) end
      end
    end end
    if s.y<height-2 then tx=s.x;tz=s.z end
  end
  local q=s.rotation;local x,y,z,w=q[1],q[2],q[3],q[4]
  local function localv(v) return {(1-2*(y*y+z*z))*v[1]+2*(x*y+z*w)*v[2]+2*(x*z-y*w)*v[3],2*(x*y-z*w)*v[1]+(1-2*(x*x+z*z))*v[2]+2*(y*z+x*w)*v[3],2*(x*z+y*w)*v[1]+2*(y*z-x*w)*v[2]+(1-2*(x*x+y*y))*v[3]} end
  local speed=payload>0 and 1.6 or 2
  local a=localv({clamp(.9*(clamp(.5*(tx-s.x),speed)-s.vx),.6),0,clamp(.9*(clamp(.5*(tz-s.z),speed)-s.vz),.6)})
  local ep=clamp(a[3]/gravity,.15)-math.atan(s.gravity[3],-s.gravity[2]);local er=clamp(-a[1]/gravity,.15)-math.atan(-s.gravity[1],-s.gravity[2])
  local ay=clamp(1.5*(clamp(.8*(height-s.y),1.6)-s.vy),2)
  local total=(s.mass+payload)*(gravity+ay)/math.max(.6,s.up)
  local com=localv({s.centerOfMass[1]-s.x,s.centerOfMass[2]-s.y,s.centerOfMass[3]-s.z});cx=cx/n;cz=cz/n;local xx,zz=0,0
  for _,j in ipairs(jets) do if j.b.direction<0 then xx=xx+(j.b.x-cx)^2;zz=zz+(j.b.z-cz)^2 end end
  local gain=math.max(140,s.mass*(xx+zz)*3/n);local damping=math.sqrt(gain*s.mass)*1.7
  local mx=gain*ep-damping*s.gyroscope[1]-total*com[3];local mz=gain*er-damping*s.gyroscope[3]+total*com[1]
  for _,j in ipairs(jets) do local b=j.b;local force=total/n-mx*(b.z-cz)/math.max(.1,zz)+mz*(b.x-cx)/math.max(.1,xx);set(b,math.max(0,-b.direction*force/b.force)) end
  if s.up<.4 then power=false;out.radio={kind='help',target=s.id} end
  set(s.blueprint[head],power and 1 or -1);m.status=status[m.phase] or m.phase
  return out
end
