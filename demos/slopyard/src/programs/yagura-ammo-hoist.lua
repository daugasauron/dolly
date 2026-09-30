local status={seek='Waiting for the ammunition car',lower='Lowering the cargo hook',lift='Hoisting ammunition above the roof',traverse='Moving ammunition to the roof magazine',deposit='Lowering onto the magazine',release='Releasing supported ammunition',returning='Returning the crane trolley'}
return function(t,s,m)
  local rails,rope,head={},nil,nil
  for i,b in ipairs(s.blueprint) do
    if b.joint==2 then rails[#rails+1]={i=i,b=b} elseif b.joint==8 then rope=i elseif b.joint==5 then head=i end
  end
  if not rope or not head or #rails==0 then return {} end
  local out={};local function set(b,u) u=math.max(-1,math.min(1,u));if b.negative~=0 then out[string.char(b.negative)]=math.max(0,-u) end;if b.positive~=0 then out[string.char(b.positive)]=math.max(0,u) end end
  local function phase(p) m.phase=p;m.at=t;m.stable=0 end
  local tip=s.positions[head];local grip=s.magnets[head];local cable=s.winches[rope]
  local extension,travel=0,0
  for _,v in ipairs(rails) do extension=extension+s.angles[v.i];travel=travel+v.b.travel end
  m.home=m.home or {tip[1],tip[3]+extension}
  local home=m.home
  if not m.phase then m.jobs=0;m.failed={};phase('seek') end
  if not m.bay then
    local nearest=math.huge
    for _,c in ipairs(s.nearby) do if c.anchored and c.team==s.team then
      local parts=s.parts(c.id);local axes={}
      local hx,hz,tx,tz,magnet=0,0,0,0,nil
      for _,p in ipairs(parts) do
        if p.joint==2 then
          if math.abs(p.axisX)>.8 then axes.x=true;hx=hx+p.angle*p.axisX;tx=tx+p.travel end
          if math.abs(p.axisZ)>.8 then axes.z=true;hz=hz+p.angle*p.axisZ;tz=tz+p.travel end
        elseif p.joint==5 then magnet=p end
      end
      local d=hypot(c.x-s.x,c.z-s.z)
      if axes.x and axes.z and magnet and c.y>s.y+3 and d<nearest then
        nearest=d;m.station=c.id;m.bay={magnet.x-hx-tx/3,c.y,magnet.z-hz-tz*2/3}
      end
    end end
  end
  if m.bay and not m.deck then
    for _,b in ipairs(s.terrain) do
      if math.abs(m.bay[1]-b.x)<b.halfX and math.abs(m.bay[3]-b.z)<b.halfZ and b.high<m.bay[2]+.1 then m.deck=math.max(m.deck or -math.huge,b.high) end
    end
  end
  local box
  for _,c in ipairs(s.nearby) do if c.id==m.job then box=c end end
  local claimed={};for _,v in ipairs(s.radio) do if v.kind=='claim' and v.from~=s.id and s.worldTime-v.time<10 then claimed[v.cargo]=true end end
  local occupied=false
  if m.bay then for _,c in ipairs(s.nearby) do
    if c.cargo and math.abs(c.y-m.bay[2])<2 and hypot(c.x-m.bay[1],c.z-m.bay[3])<1.6 then occupied=true end
  end end
  if m.phase=='seek' and m.bay and not occupied then
    local nearest=math.huge
    for _,c in ipairs(s.nearby) do
      local d=hypot(c.x-home[1],c.z-home[2])
      if c.cargo and c.team==s.team and c.supply==0 and c.mass<1.5 and c.carriedBy==0 and not claimed[c.id]
        and c.y<s.y+2 and d<.8 and d<nearest and (m.failed[c.id] or 0)<t then box=c;nearest=d end
    end
    if box then m.job=box.id;phase('lower') end
  end
  local power=false;local length=1;local reach=0;local holdRails=false;local unpinch=false
  if box and m.phase~='seek' and m.phase~='returning' then
    out.radio={kind='claim',cargo=box.id}
    if t-m.at>45 or grip.attached and grip.creature~=box.id then m.failed[box.id]=t+30;phase('returning')
    elseif m.phase=='lower' then
      length=math.max(1,math.min(s.blueprint[rope].travel,cable.paidOut+tip[2]-box.high-.6))
      local edge=math.huge
      for _,b in ipairs(s.bounds(box.id)) do edge=math.min(edge,hypot(math.max(0,math.abs(tip[1]-b.x)-b.halfX),math.max(0,math.abs(tip[3]-b.z)-b.halfZ))) end
      power=edge<.65 and tip[2]-box.high<1.3
      if grip.attached and grip.creature==box.id then phase('lift') end
    elseif m.phase=='lift' then
      power=true
      if not grip.attached then phase('returning')
      elseif cable.paidOut<1.1 and box.low>(m.deck or m.bay[2])+.25 then phase('traverse') end
    elseif m.phase=='traverse' or m.phase=='deposit' then
      power=true;reach=math.max(0,math.min(travel,home[2]-m.bay[3]))
      if not grip.attached then phase('returning')
      elseif m.phase=='traverse' and hypot(box.x-m.bay[1],box.z-m.bay[3])<.8 and math.abs(s.rates[rails[#rails].i])<.1 then phase('deposit') end
      if m.phase=='deposit' then
        length=math.max(1,math.min(s.blueprint[rope].travel,cable.paidOut+box.y-m.bay[2]))
        local supported=grip.cargoSupportForce>box.mass*hypot(table.unpack(s.gravity))*.6
        m.stable=supported and hypot(box.vx,box.vy,box.vz)<.25 and m.stable+s.dt or 0
        if m.stable>.4 then m.releaseLength=cable.paidOut;phase('release');power=false end
      end
    elseif m.phase=='release' then
      reach=math.max(0,math.min(travel,home[2]-m.bay[3]));length=m.releaseLength
      out.radio={kind='ready',cargo=box.id}
      if not grip.attached and t-m.at>1 then m.jobs=m.jobs+1;phase('returning') end
    end
  elseif m.phase~='seek' and m.phase~='returning' then phase('returning') end
  if m.phase=='returning' then
    length=math.min(2,s.blueprint[rope].travel)
    local anchor=s.positions[s.blueprint[rope].parent+1]
    local drop=anchor[2]-s.positions[rope][2]
    unpinch=math.abs(cable.paidOut-length)<=.1 and drop<math.min(1.5,length-.1)
    holdRails=math.abs(cable.paidOut-length)>.1 or unpinch
    if not holdRails and extension<.1 then m.job=nil;phase('seek') end
  end
  for _,v in ipairs(rails) do
    local wanted=holdRails and s.angles[v.i] or math.min(v.b.travel,reach)
    if unpinch and v.i==rails[#rails].i then wanted=math.min(v.b.travel,wanted+.5) end
    set(v.b,(2*(wanted-s.angles[v.i])-.35*s.rates[v.i])/v.b.speed);reach=reach-wanted
  end
  local error=length-cable.paidOut
  local reel=math.abs(error)<.025 and 0 or error<0 and math.min(-.4,error*1.5) or error*1.5
  set(s.blueprint[rope],reel);set(s.blueprint[head],power and 1 or -1)
  m.status=not m.bay and 'Needs a rooftop loader within reach' or status[m.phase] or m.phase
  return out
end
