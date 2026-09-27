local status={ready='Compact round / ready to load',deploy='Caught aircraft / lowering ground handle',caught='Ground handle ready / calling cable tug',haul='Tug attached / hauling aircraft down',release='Aircraft grounded / releasing magnets',recover='Reeling in the spent round'}
return function(t,s,m)
  local out,rope,handle,magnets={},nil,nil,{}
  local function set(b,u) if b.negative~=0 then out[string.char(b.negative)]=math.max(0,-u) end;if b.positive~=0 then out[string.char(b.positive)]=math.max(0,u) end end
  local function phase(name) m.phase=name;m.at=t;m.supported=0;m.fold=nil end
  for i,b in ipairs(s.blueprint) do if b.joint==8 then rope=i elseif b.joint==5 then magnets[#magnets+1]=i end end
  if not rope or #magnets==0 then return out end
  for i,b in ipairs(s.blueprint) do
    local parent=b.parent+1
    while parent>0 and parent~=rope do parent=s.blueprint[parent].parent+1 end
    if parent==rope and b.joint==0 then handle=i end
  end
  handle=handle or rope
  local cable=s.winches[rope];local tip=s.positions[handle]
  local function ground(x,z,y)
    local floor=s.ground
    for _,b in ipairs(s.terrain) do
      if math.abs(x-b.x)<=b.halfX and math.abs(z-b.z)<=b.halfZ and b.high<y+.8 then floor=math.max(floor,b.high) end
    end
    return floor
  end
  if not m.phase then phase('ready') end
  local captured
  for _,i in ipairs(magnets) do
    local grip=s.magnets[i]
    if grip.attached then for _,c in ipairs(s.nearby) do
      if c.id==grip.creature and c.team~=0 and c.team~=s.team and not c.cargo and not c.anchored then
        if not captured or c.id==m.target then captured=c end
      end
    end end
    set(s.blueprint[i],-1)
  end
  if captured and m.phase=='ready' then m.compactLength=nil;m.target=captured.id;m.captureAt=t;m.captures=(m.captures or 0)+1;phase('deploy') end
  if captured and (m.phase=='deploy' or m.phase=='caught' or m.phase=='haul') then
    local tug
    for _,c in ipairs(s.nearby) do
      if c.team==s.team and not c.cargo then
        local support,holding=0,false
        for _,p in ipairs(s.parts(c.id)) do support=support+p.supportForce;holding=holding or p.target==s.id end
        if holding and (c.anchored or support>c.mass*hypot(table.unpack(s.gravity))*.2) then tug=c;break end
      end
    end
    local support=0
    for _,p in ipairs(s.parts(captured.id)) do support=support+p.supportForce end
    local grounded=captured.low<ground(captured.x,captured.z,captured.y)+1.5 and support>captured.mass*hypot(table.unpack(s.gravity))*.35 and math.abs(captured.vy)<.5
    m.supported=grounded and m.supported+s.dt or 0
    if m.supported>2 or t-(m.captureAt or m.at)>180 then
      local grounded=m.supported>2
      m.releases=(m.releases or 0)+(grounded and 1 or 0);m.aborts=(m.aborts or 0)+(grounded and 0 or 1)
      m.lastRelease={time=t,target=captured.id,grounded=grounded};phase('release')
    else
      local nextPhase=tug and 'haul' or tip[2]>ground(tip[1],tip[3],tip[2])+1.2 and 'deploy' or 'caught'
      if m.phase~=nextPhase then local supported=m.supported;phase(nextPhase);m.supported=supported end
      for _,i in ipairs(magnets) do
        local grip=s.magnets[i]
        set(s.blueprint[i],grip.attached and grip.creature==captured.id and 1 or -1)
      end
      set(s.blueprint[rope],tug and -1 or m.phase=='deploy' and 1 or 0)
      out.radio={kind='claim',cargo=s.id}
    end
  elseif m.phase=='deploy' or m.phase=='caught' or m.phase=='haul' then phase('recover') end
  if m.phase=='release' then
    out.radio={kind='threat',target=m.target}
    set(s.blueprint[rope],0)
    if not captured and t-m.at>1 then phase('recover') end
  end
  if m.phase=='recover' then
    set(s.blueprint[rope],-1)
    local span,handleRadius=0,0
    for i,p in ipairs(s.parts(s.id)) do
      local radius=p.size*math.sqrt(3)/2
      if p.body==0 then span=math.max(span,hypot(p.x-s.x,p.y-s.y,p.z-s.z)+radius) end
      if i==handle then handleRadius=radius end
    end
    span=span+handleRadius
    m.fold=m.fold or {t,cable.paidOut,tip[1],tip[2],tip[3]}
    local folded=cable.paidOut<1.15
    if t-m.fold[1]>2 then
      local anchor=s.positions[s.blueprint[rope].parent+1]
      local settled=hypot(s.vx,s.vy,s.vz)<.3 and hypot(tip[1]-m.fold[3],tip[2]-m.fold[4],tip[3]-m.fold[5])<.2
      folded=folded or settled and m.fold[2]-cable.paidOut<.1 and cable.paidOut<span
        and hypot(tip[1]-anchor[1],tip[2]-anchor[2],tip[3]-anchor[3])<span
      m.fold={t,cable.paidOut,tip[1],tip[2],tip[3]}
    end
    if folded and t-m.at>3 and s.y<s.ground+3 and tip[2]<ground(tip[1],tip[3],tip[2])+2 then
      m.compactLength=cable.paidOut;m.target=nil;phase('ready')
    end
  end
  if m.phase=='ready' then
    set(s.blueprint[rope],cable.paidOut>(m.compactLength or 1)+.05 and -1 or 0)
    local carrier
    for _,c in ipairs(s.nearby) do if c.id==s.carriedBy then carrier=c end end
    local hostileCarrier=carrier and carrier.team~=0 and carrier.team~=s.team
    if (s.carriedBy==0 or hostileCarrier) and s.y>s.ground+3 then
      for _,i in ipairs(magnets) do
        local pos=s.positions[i];local enemy,closest=nil,math.huge
        for _,c in ipairs(s.nearby) do
          if not c.anchored and not c.cargo and c.team~=0 then
            for _,b in ipairs(s.bounds(c.id)) do
              local dx=math.max(0,math.abs(pos[1]-b.x)-b.halfX);local dz=math.max(0,math.abs(pos[3]-b.z)-b.halfZ)
              local dy=math.max(0,b.low-pos[2],pos[2]-b.high);local d=hypot(dx,dy,dz)
              if d<closest then closest=d;enemy=c.team~=s.team and c or nil end
            end
          end
        end
        set(s.blueprint[i],enemy and closest<1.4 and 1 or -1)
      end
    end
  end
  m.held=captured and captured.id or nil;m.handle={tip[1],tip[2],tip[3]};m.status=m.phase=='ready' and (m.compactLength or 1)>1.15 and 'Compact round / cable folded against hull' or status[m.phase] or m.phase
  return out
end
