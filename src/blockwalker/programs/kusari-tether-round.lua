local status={pay_out='Slack cable / ready to load',caught='Attached / waiting for tug',haul='Winching aircraft down'}
return function(t,s,m)
  local out,rope,magnets={},nil,{}
  local function set(b,u) if b.negative~=0 then out[string.char(b.negative)]=math.max(0,-u) end;if b.positive~=0 then out[string.char(b.positive)]=math.max(0,u) end end
  for i,b in ipairs(s.blueprint) do if b.joint==8 then rope=i elseif b.joint==5 then magnets[#magnets+1]=i end end
  if not rope or #magnets==0 then return out end
  local captured
  for _,i in ipairs(magnets) do
    local grip=s.magnets[i];local pos=s.positions[i];local held,enemy,closest=nil,nil,math.huge
    for _,c in ipairs(s.nearby) do
      if grip.attached and grip.creature==c.id then held=c end
      if not c.anchored and not c.cargo and c.team~=0 then
        for _,b in ipairs(s.bounds(c.id)) do
          local dx=math.max(0,math.abs(pos[1]-b.x)-b.halfX);local dz=math.max(0,math.abs(pos[3]-b.z)-b.halfZ)
          local dy=math.max(0,b.low-pos[2],pos[2]-b.high);local d=hypot(dx,dy,dz)
          if d<closest then closest=d;enemy=c.team~=s.team and c or nil end
        end
      end
    end
    local ownCapture=held and held.team~=0 and held.team~=s.team and not held.cargo
    if ownCapture then captured=held end
    if enemy and closest<(m.closest or math.huge) then m.closest=closest;m.encounter={t=t,part=i,target=enemy.id,position={pos[1],pos[2],pos[3]}} end
    local armed=ownCapture or enemy and closest<1.4 and s.y>s.ground+3
    set(s.blueprint[i],armed and 1 or -1)
  end
  local tug
  if captured and s.magnetCount>0 then
    for _,c in ipairs(s.nearby) do
      if c.team==s.team and not c.anchored and not c.cargo then
        local wheels,holding=false,false
        for _,p in ipairs(s.parts(c.id)) do
          wheels=wheels or p.joint==4;holding=holding or p.target==s.id
        end
        if wheels and holding then tug=c;break end
      end
    end
  end
  set(s.blueprint[rope],captured and (tug and -1 or 0) or 1)
  if captured and not m.held then m.captures=(m.captures or 0)+1 end
  m.held=captured and captured.id or nil;m.phase=captured and (tug and 'haul' or 'caught') or 'pay_out'
  m.status=status[m.phase] or m.phase
  return out
end
