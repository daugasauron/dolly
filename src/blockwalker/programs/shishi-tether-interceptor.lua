return function(t, s, m)
  local function clamp(v,n) n=n or 1; return math.max(-n,math.min(n,v)) end
  local function sub(a,b) return {a[1]-b[1],a[2]-b[2],a[3]-b[3]} end
  local function dot(a,b) return a[1]*b[1]+a[2]*b[2]+a[3]*b[3] end
  local function cross(a,b) return {a[2]*b[3]-a[3]*b[2],a[3]*b[1]-a[1]*b[3],a[1]*b[2]-a[2]*b[1]} end
  local function unit(a) local n=math.max(.0001,math.sqrt(dot(a,a))); return {a[1]/n,a[2]/n,a[3]/n} end
  if not m.parts then
    m.parts={head={},jets={},magnets={},basis={}}
    local p=m.parts
    for i,b in ipairs(s.blueprint) do if b.joint==8 then p.rope=i; break end end
    if not p.rope then return {} end
    for i,b in ipairs(s.blueprint) do
      local ancestor=i
      while ancestor>0 and ancestor~=p.rope do ancestor=s.blueprint[ancestor].parent+1 end
      if ancestor==p.rope then
        p.head[#p.head+1]=i
        if b.joint==3 and b.axis==1 then p.jets[#p.jets+1]=i end
        if b.joint==5 then p.magnets[#p.magnets+1]=i end
      end
    end
    for axis,key in ipairs({'x','y','z'}) do
      for _,i in ipairs(p.head) do for _,j in ipairs(p.head) do
        local a,b=s.blueprint[i],s.blueprint[j]
        if j>i and a[key]~=b[key] then
          local aligned=true
          for _,other in ipairs({'x','y','z'}) do if key~=other and a[other]~=b[other] then aligned=false end end
          if aligned and not p.basis[axis] then p.basis[axis]={i,j,b[key]>a[key] and 1 or -1} end
        end
      end end
    end
  end
  local p=m.parts
  if not p.rope or not p.magnets[1] then return {} end
  local rope,hook=s.blueprint[p.rope],p.magnets[1]
  local anchor,pos=s.positions[rope.parent+1],s.positions[hook]
  local function basis(axis)
    local a=p.basis[axis];local v=unit(sub(s.positions[a[2]],s.positions[a[1]]))
    return {v[1]*a[3],v[2]*a[3],v[3]*a[3]}
  end
  local right,forward=basis(1),basis(3);local up=unit(cross(forward,right))
  local dt=math.max(.001,s.dt);local velocity,omega={0,0,0},{0,0,0}
  if m.previous then
    local delta=sub(pos,m.previous.pos)
    local dr,du,df=cross(m.previous.right,right),cross(m.previous.up,up),cross(m.previous.forward,forward)
    for i=1,3 do velocity[i]=delta[i]/dt;omega[i]=(dr[i]+du[i]+df[i])/(2*dt) end
  end
  m.previous={pos=pos,right=right,up=up,forward=forward}
  if not m.home then m.home={anchor[1],anchor[2]-4,anchor[3]+6};m.hover=.25;m.phase='patrol';m.captures=0 end
  local function enemy(b) return b.team~=0 and b.team~=s.team and not b.cargo and not b.anchored end
  local function reachable(b)
    local dy=b.high+.45+rope.y-s.blueprint[hook].y-anchor[2]
    return hypot(b.centerOfMass[1]-anchor[1],dy,b.centerOfMass[3]-anchor[3])<rope.travel-2
  end
  local function airborne(b)
    local ground=s.waterHeight
    for _,box in ipairs(s.terrain) do
      if box.high<b.y+.5 and math.abs(b.x-box.x)<box.halfX and math.abs(b.z-box.z)<box.halfZ then ground=math.max(ground,box.high) end
    end
    return b.low>ground+3
  end
  local grip=s.magnets[hook];local target,held
  for _,b in ipairs(s.nearby) do if b.id==m.target and enemy(b) then target=b end;if grip.attached and b.id==grip.creature then held=b end end
  if held and enemy(held) then
    if m.phase~='capture' then m.captures=m.captures+1;m.captureAt=t end
    m.phase='capture';m.target=held.id;target=held
  elseif m.phase=='capture' then m.phase='patrol';m.target=0;m.launched=false;m.hover=.25;m.rearmAt=t+20 end
  if m.phase~='capture' then
    if target and (not airborne(target) or not reachable(target)) then target=nil end
    if not target and t>8 and t>(m.rearmAt or 0) then
      local distance=math.huge
      for _,b in ipairs(s.nearby) do
        local d=hypot(b.x-pos[1],b.z-pos[3])
        if enemy(b) and airborne(b) and reachable(b) and d<distance then target=b;distance=d end
      end
    end
    m.target=target and target.id or 0;m.phase=target and 'intercept' or 'patrol'
  end
  if not m.launched and hypot(pos[1]-m.home[1],pos[3]-m.home[3])<.5 and math.abs(velocity[2])<.2 then m.launched=true end
  local goal=m.launched and {m.home[1],anchor[2]+math.min(12,rope.travel*.5),m.home[3]} or m.home
  if target and m.phase=='intercept' then goal={target.centerOfMass[1]+target.vx*.4,target.high+.45,target.centerOfMass[3]+target.vz*.4} end
  if m.phase=='capture' then goal={pos[1],pos[2],pos[3]} end
  local vertical=goal[2]+rope.y-s.blueprint[hook].y-anchor[2]
  local reach=math.sqrt(math.max(1,(rope.travel-2)^2-vertical^2))
  local horizontal=hypot(goal[1]-anchor[1],goal[3]-anchor[3])
  if horizontal>reach then goal={anchor[1]+(goal[1]-anchor[1])*reach/horizontal,goal[2],anchor[3]+(goal[3]-anchor[3])*reach/horizontal} end
  local error=sub(goal,pos)
  local desired=unit({clamp(.35*error[1]-.9*(velocity[1]-(target and m.phase=='intercept' and target.vx or 0)),2),hypot(table.unpack(s.gravity)),clamp(.35*error[3]-.9*(velocity[3]-(target and m.phase=='intercept' and target.vz or 0)),2)})
  local attitude=cross(up,desired)
  local torque={};for i=1,3 do torque[i]=40*attitude[i]-30*omega[i] end
  if m.phase~='capture' then m.hover=math.max(0,math.min(.8,m.hover+.015*clamp(error[2],3)*dt)) end
  local lift=m.phase=='capture' and 0 or clamp((m.hover+.08*error[2]-.25*(velocity[2]-(target and m.phase=='intercept' and target.vy or 0)))/math.max(.5,up[2]))
  local cx,cz,n=0,0,0
  for _,i in ipairs(p.jets) do local b=s.blueprint[i];if b.direction<0 then cx=cx+b.x;cz=cz+b.z;n=n+1 end end
  cx=cx/n;cz=cz/n;local xx,zz=0,0
  for _,i in ipairs(p.jets) do local b=s.blueprint[i];if b.direction<0 then xx=xx+(b.x-cx)^2;zz=zz+(b.z-cz)^2 end end
  local roll,pitch=dot(torque,forward),dot(torque,right)
  local out={}
  local function set(b,u) if b.negative~=0 then out[string.char(b.negative)]=math.max(0,-u) end;if b.positive~=0 then out[string.char(b.positive)]=math.max(0,u) end end
  for _,i in ipairs(p.jets) do local b=s.blueprint[i];local force=lift*b.force+roll*(b.x-cx)/xx-pitch*(b.z-cz)/zz;set(b,clamp(math.max(0,-b.direction*force/b.force))) end
  set(rope,m.phase=='capture' and -1 or 1)
  for _,i in ipairs(p.magnets) do local g=s.magnets[i];set(s.blueprint[i],target and (not g.attached or g.creature==target.id) and 1 or -1) end
  m.flight={goal=goal,pos=pos,velocity=velocity,up=up[2],hover=m.hover,lift=lift,rope=s.winches[p.rope]}
  return out
end
