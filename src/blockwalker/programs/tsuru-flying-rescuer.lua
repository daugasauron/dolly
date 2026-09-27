local status={seek='Scouting for stalled machines',approach='Aligning recovery hook',lower='Lowering recovery magnet',lift='Lifting and straightening',settle='Setting the machine down',release='Releasing supported machine'}
return function(t,s,m)
  local gravity=hypot(table.unpack(s.gravity))
  local function clamp(x,n) return math.max(-n,math.min(n,x)) end
  local function phase(name) m.phase=name;m.at=t;m.stable=0;m.contactY=nil;m.support=0 end
  if not m.home then m.home={s.x,s.z};m.cooldown={};m.rescues=0;phase('seek') end
  local jets,rope,hooks={},nil,{}
  for i,b in ipairs(s.blueprint) do
    if b.joint==3 and b.axis==1 then jets[#jets+1]={i=i,b=b} end
    if b.joint==8 then rope=i end
    if b.joint==5 then hooks[#hooks+1]=i end
  end
  if not rope or #hooks==0 then return {} end
  local hook=hooks[1];local grip=s.magnets[hook];local tip=s.positions[hook];local cable=s.winches[rope]
  local target
  for _,c in ipairs(s.nearby) do if c.id==m.target then target=c end end
  if grip.attached and target and grip.creature~=target.id then
    m.cooldown[target.id]=t+30;m.target=nil;m.length=nil;target=nil;phase('seek')
  end
  if m.phase=='seek' then
    local nearest=math.huge;local tipped={}
    for _,c in ipairs(s.nearby) do
      if not c.cargo and not c.anchored and (c.team==0 or c.team==s.team) and c.up<.94 and c.carriedBy==0 and (m.cooldown[c.id] or 0)<t and c.mass*gravity<s.blueprint[hook].force*.7 then
        if hypot(c.vx,c.vy,c.vz)<.15 then tipped[c.id]=(m.tipped and m.tipped[c.id]) or t end
        local hinges,wheels,jets=0,0,0
        for _,p in ipairs(s.parts(c.id)) do hinges=hinges+(p.joint==1 and 1 or 0);wheels=wheels+(p.joint==4 and 1 or 0);jets=jets+(p.joint==3 and 1 or 0) end
        local d=hypot(c.x-s.x,c.z-s.z)
        if (hinges>=4 or wheels>=4) and jets==0 and tipped[c.id] and t-tipped[c.id]>5 and d<nearest then target=c;m.target=c.id;m.wheeled=wheels>=4;nearest=d end
      end
    end
    m.tipped=tipped
    if target then phase('approach') end
  end
  local tx,tz=m.home[1],m.home[2];local height=math.max(12,s.ground+10);local length=3;local power=false;local payload=0
  if target and m.phase~='seek' then
    local eye,top;local support=0
    for _,p in ipairs(s.parts(target.id)) do
      support=support+(p.supportForce or 0)
      if p.body==0 and (not top or p.y>top.y) then top=p end
      if p.joint==6 and p.body==0 then eye=p end
    end
    local point=eye or top or target
    if m.wheeled then
      local observed=s.parts(target.id);local q=observed[1].rotation
      local x,y,z,w=q[1],q[2],q[3],q[4]
      local up={2*(x*y-z*w),1-2*(x*x+z*z),2*(y*z+x*w)}
      local com=target.centerOfMass;local best
      for _,p in ipairs(observed) do
        if p.joint~=4 then
          local dx,dy,dz=p.x-com[1],p.y-com[2],p.z-com[3]
          local vertical=dx*up[1]+dy*up[2]+dz*up[3]
          local horizontal=math.sqrt(math.max(0,dx*dx+dy*dy+dz*dz-vertical*vertical))
          local score=vertical/math.max(.5,horizontal)
          if not best or score>best then best=score;point={x=p.x+.65*up[1],y=p.y+.65*up[2],z=p.z+.65*up[3]} end
        end
      end
    end
    tx=point.x;tz=point.z
    height=math.max(s.ground+6,point.y+6);length=1
    if m.phase=='approach' and hypot(tip[1]-point.x,tip[3]-point.z)<.5 and hypot(s.vx,s.vz)<.4 then phase('lower') end
    if m.phase=='lower' then
      power=true;length=math.max(1,math.min(s.blueprint[rope].travel,cable.paidOut+(tip[2]-point.y-.8)))
      if grip.attached and grip.creature==target.id then m.liftY=s.y;m.hold={s.x,s.z};m.payloadY=target.y;m.extracting=nil;m.extract={0,0}
        for _,b in ipairs(s.terrain) do
          if b.high>target.y+.5 and b.low<target.y+5 then
            local dx=target.x-math.max(b.x-b.halfX,math.min(b.x+b.halfX,target.x))
            local dz=target.z-math.max(b.z-b.halfZ,math.min(b.z+b.halfZ,target.z))
            local d=hypot(dx,dz)
            if d>.01 and d<5 then m.extract[1]=m.extract[1]+dx/d^2;m.extract[2]=m.extract[2]+dz/d^2 end
          end
        end
        local d=hypot(table.unpack(m.extract));if d>.01 then m.extract={m.extract[1]/d,m.extract[2]/d} end
        phase('lift') end
    end
    if m.phase=='lift' then
      power=true;payload=target.mass;length=m.length or cable.paidOut;m.length=length
      height=m.liftY+math.min(10,(t-m.at)*.5)
      tx=m.hold[1];tz=m.hold[2]
      if t-m.at>6 and target.y<m.payloadY+.5 then m.extracting=true end
      if m.extracting then local d=math.min(8,math.max(0,(t-m.at-6)*.5));tx=tx+m.extract[1]*d;tz=tz+m.extract[2]*d end
      m.stable=target.up>(m.wheeled and .6 or .9) and m.stable+s.dt or 0
      if m.stable>2 then m.lowerY=s.y;m.hold={s.x,s.z};m.extracting=nil;phase('settle') end
    end
    if m.phase=='settle' then
      power=true;payload=math.max(0,target.mass-support/hypot(table.unpack(s.gravity)));length=m.length
      tx=m.hold[1];tz=m.hold[2]
      m.support=m.support+.1*(support-m.support)
      if m.support>target.mass*gravity*.9 and not m.contactY then m.contactY=s.y end
      if m.contactY and m.support<target.mass*gravity*.9 then m.contactY=m.contactY-.1*s.dt end
      height=m.contactY or m.lowerY-math.min(10,(t-m.at)*.2)
      local unloaded=m.support>target.mass*gravity*.85 or cable.tension<target.mass*gravity*.1 and s.angles[rope]<cable.paidOut-.15
      local supported=unloaded and target.up>.9 and hypot(target.vx,target.vy,target.vz)<.2
      m.stable=supported and m.stable+s.dt or 0
      if m.stable>2 then m.releaseY=s.y;phase('release') end
    end
    if m.phase=='release' then
      tx=m.hold[1];tz=m.hold[2]
      height=m.releaseY+math.min(3,(t-m.at)*.6);length=m.length
      if not grip.attached and t-m.at>4 then
        if target.up>.93 then m.rescues=m.rescues+1 end
        m.cooldown[target.id]=t+30;m.target=nil;m.length=nil;phase('seek')
      end
    end
    if t-m.at>90 then m.cooldown[target.id]=t+30;m.target=nil;m.length=nil;phase('seek');power=false end
    if (m.phase=='lift' or m.phase=='settle') and not grip.attached then m.length=nil;phase('approach') end
  elseif m.phase~='seek' then m.target=nil;m.length=nil;phase('seek') end
  if m.phase=='seek' and not target then
    m.patrol=m.patrol or 0
    local stops={{0,0},{35,0},{0,35},{-35,0},{0,-35}}
    tx=m.home[1]+stops[m.patrol+1][1];tz=m.home[2]+stops[m.patrol+1][2]
    if hypot(tx-s.x,tz-s.z)<1 then
      m.arrived=m.arrived or t
      if t-m.arrived>5 then m.patrol=(m.patrol+1)%#stops;m.arrived=nil end
    else m.arrived=nil end
  end
  local clearance=math.max(12,s.ground+5)
  for _,b in ipairs(s.terrain) do
    local left,right=math.min(s.x,tx)-3.5,math.max(s.x,tx)+3.5
    local back,front=math.min(s.z,tz)-3.5,math.max(s.z,tz)+3.5
    if b.x+b.halfX>left and b.x-b.halfX<right and b.z+b.halfZ>back and b.z-b.halfZ<front then clearance=math.max(clearance,b.high+4) end
  end
  if m.phase=='seek' or m.phase=='approach' or m.phase=='lower' then height=math.max(height,clearance)
  elseif m.phase=='settle' and height<clearance then length=math.min(s.blueprint[rope].travel,length+clearance-height);height=clearance end
  if s.y<clearance-1 and (m.phase=='seek' or m.phase=='approach') then tx=s.x;tz=s.z end
  local q=s.rotation;local x,y,z,w=q[1],q[2],q[3],q[4]
  local function localv(v)
    return {(1-2*(y*y+z*z))*v[1]+2*(x*y+z*w)*v[2]+2*(x*z-y*w)*v[3],2*(x*y-z*w)*v[1]+(1-2*(x*x+z*z))*v[2]+2*(y*z+x*w)*v[3],2*(x*z+y*w)*v[1]+2*(y*z-x*w)*v[2]+(1-2*(x*x+y*y))*v[3]}
  end
  local a=localv({clamp(.9*(clamp(.5*(tx-s.x),1)-s.vx),.45),0,clamp(.9*(clamp(.5*(tz-s.z),1)-s.vz),.45)})
  local G=hypot(table.unpack(s.gravity));local ep=clamp(a[3]/G,.15)-math.atan(s.gravity[3],-s.gravity[2]);local er=clamp(-a[1]/G,.15)-math.atan(-s.gravity[1],-s.gravity[2])
  local ay=clamp(1.5*(clamp(.8*(height-s.y),1.5)-s.vy),2)
  local total=(s.mass+payload)*(G+ay)/math.max(.6,s.up)
  local com=localv({s.centerOfMass[1]-s.x,s.centerOfMass[2]-s.y,s.centerOfMass[3]-s.z})
  local mx=140*ep-80*s.gyroscope[1]-total*com[3];local mz=140*er-80*s.gyroscope[3]+total*com[1]
  local cx,cz,n=0,0,0
  for _,j in ipairs(jets) do if j.b.direction<0 then cx=cx+j.b.x;cz=cz+j.b.z;n=n+1 end end
  cx=cx/n;cz=cz/n;local xx,zz=0,0
  for _,j in ipairs(jets) do if j.b.direction<0 then xx=xx+(j.b.x-cx)^2;zz=zz+(j.b.z-cz)^2 end end
  local out={}
  local function set(b,u) if b.negative~=0 then out[string.char(b.negative)]=math.max(0,-u) end;if b.positive~=0 then out[string.char(b.positive)]=math.max(0,u) end end
  for _,j in ipairs(jets) do local b=j.b;local force=total/n-mx*(b.z-cz)/zz+mz*(b.x-cx)/xx;set(b,math.max(0,math.min(1,-b.direction*force/b.force))) end
  set(s.blueprint[rope],clamp((length-cable.paidOut)*2,1))
  for _,i in ipairs(hooks) do local g=s.magnets[i];set(s.blueprint[i],power and (not g.attached or target and g.creature==target.id) and 1 or -1) end
  m.flight={height=height,goal={tx,tz},length=length,payload=payload,hook={tip[1],tip[2],tip[3]},up=s.up}
  m.status=status[m.phase] or m.phase
  return out
end
