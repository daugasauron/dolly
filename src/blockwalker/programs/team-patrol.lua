return function(t,s,m,r)
  local function clamp(v,n) return math.max(-n,math.min(n,v)) end
  local function wrap(v) return math.atan(math.sin(v),math.cos(v)) end
  local q=s.rotation
  local yaw=math.atan(2*(q[1]*q[3]+q[2]*q[4]),1-2*(q[1]^2+q[2]^2))
  local wheels,rams,magnets={},{},{}
  local width,height,reach=0,0,0
  for i,b in ipairs(s.blueprint) do
    if b.joint==4 and b.axis==0 then wheels[#wheels+1]=i;width=math.max(width,math.abs(b.x-s.blueprint[1].x)+.8) end
    if b.joint==2 then rams[#rams+1]=i end
    if b.joint==5 then magnets[#magnets+1]=i;reach=math.max(reach,b.z-s.blueprint[1].z) end
    height=math.max(height,s.positions[i][2]-s.ground+.7)
  end
  local liftReach=0
  for _,i in ipairs(magnets) do
    local extra,parent=0,i
    while parent>0 do
      local b=s.blueprint[parent]
      if b.joint==2 and b.axis==1 then extra=extra+math.max(0,b.travel-s.angles[parent]) end
      parent=b.parent+1
    end
    liftReach=math.max(liftReach,s.positions[i][2]-s.ground+extra+.65)
  end
  if not m.home then m.home={s.x,s.z} end
  if not m.cooldown then
    m.phase='patrol';m.target=0;m.since=t;m.cooldown={};m.rescues=0;m.captures=0;m.visits=0
  end
  local function phase(name) m.phase=name;m.since=t;m.best=nil;m.progress=t;m.route=nil end
  local nearby={}
  for _,b in ipairs(s.nearby) do nearby[b.id]=b end
  local held
  for _,i in ipairs(magnets) do local g=s.magnets[i];if g.attached then held=nearby[g.creature];break end end
  local function ally(b) return b.team==s.team and s.team~=0 end
  local function rival(b) return b.team~=0 and b.team~=s.team end
  local function ground_actor(b) return not b.cargo and not b.anchored and (b.low<s.ground+1 and b.high>s.ground+.1 or ally(b) and b.carriedBy~=0 and b.low<s.ground+liftReach) end
  local target=nearby[m.target]
  if (m.phase=='patrol' or m.phase=='approach' and not m.rescue) and t>(m.wait or 0) and t>(m.assessAt or 0) then
    m.assessAt=t+.5
    local best,score
    for _,b in ipairs(s.nearby) do
      if ground_actor(b) and b.mass<s.mass*.95 and t>(m.cooldown[b.id] or 0) then
        local holder=nearby[b.carriedBy]
        local rescue=ally(b) and (b.up<.5 or holder and rival(holder))
        local busy=false
        for _,c in ipairs(s.nearby) do if c.cargo and not c.delivered and c.carriedBy==b.id then busy=true;break end end
        local protect=false
        if rival(b) then
          for _,c in ipairs(s.nearby) do if ally(c) and ground_actor(c) and hypot(c.x-b.x,c.z-b.z)<12 then protect=true;break end end
        end
        if rescue or rival(b) and b.up>.3 and (busy or protect) then
          local value=(rescue and 200 or busy and 60 or 30)-hypot(b.x-s.x,b.z-s.z)
          if not score or value>score then best,score=b,value end
        end
      end
    end
    if best and (m.phase=='patrol' or ally(best)) then target=best;m.target=best.id;m.rescue=ally(best);m.freeRescue=m.rescue and best.up>=.5;phase('approach') end
  end
  if held and (held.id~=m.target or held.cargo or not (rival(held) or m.rescue and ally(held))) then phase('back') end
  if m.phase=='approach' then
    if not target or not ground_actor(target) or t-m.since>600 or (m.rescue and not m.freeRescue and target.up>.85) then
      m.cooldown[m.target]=t+20;phase('back')
    elseif held and held.id==m.target then
      if not m.rescue then m.captures=m.captures+1 end
      m.lift=0;for _,i in ipairs(rams) do m.lift=m.lift+s.angles[i]/#rams end
      m.rescueWatch=m.rescue and target.id or nil;m.rescueAir=m.freeRescue;m.releasedAt=nil
      phase('lift')
    end
  end
  local basket=magnets[1] and s.blueprint[magnets[1]].axis==1
  local goal,power,lift=nil,false,1.2
  if m.phase=='patrol' then
    local escort
    for _,c in ipairs(s.nearby) do
      local carrier=nearby[c.carriedBy]
      if c.cargo and not c.delivered and carrier and ally(carrier) and ground_actor(carrier) and carrier.up>.8 and hypot(carrier.vx,carrier.vz)>.15 then escort=carrier;break end
    end
    local help
    for _,v in ipairs(s.radio) do
      local friend=nearby[v.target]
      if v.kind=='help' and v.target~=s.id and s.worldTime-v.time<20 and t>(m.cooldown[v.target] or 0)
        and v.y<s.ground+liftReach+1 and (not friend or ground_actor(friend) and (friend.up<.5 or friend.carriedBy~=0)) then
        if not help or hypot(v.x-s.x,v.z-s.z)<hypot(help.x-s.x,help.z-s.z) then help=v end
      end
    end
    if help then goal={help.x,help.z,help.y};m.responding=help.target
    elseif m.returning and hypot(s.x-m.home[1],s.z-m.home[2])>4.5 then goal={m.home[1],m.home[2]}
    elseif escort then
      local distance=math.max(1,hypot(s.x-escort.x,s.z-escort.z))
      goal={escort.x+(s.x-escort.x)/distance*9,escort.z+(s.z-escort.z)/distance*9};m.escort=escort.id
    else
      m.returning=nil;m.escort=0
      if not m.goal or hypot(s.x-m.goal[1],s.z-m.goal[2])<2 or t>(m.goalUntil or 0) then
        if m.goal and hypot(s.x-m.goal[1],s.z-m.goal[2])<2 then m.visits=m.visits+1 end
        local interest
        for i=#s.radio,1,-1 do local v=s.radio[i];if s.worldTime-v.time<60 and hypot(v.x-s.x,v.z-s.z)<45 then interest=v;break end end
        local angle=r()*math.pi*2
        local x,z=s.x,s.z
        if interest then
          local distance=math.max(1,hypot(interest.x-x,interest.z-z));x=x+(interest.x-x)/distance*math.min(14,distance);z=z+(interest.z-z)/distance*math.min(14,distance)
        end
        m.goal={x+math.sin(angle)*12,z+math.cos(angle)*12};m.goalUntil=t+30
      end
      goal=m.goal
    end
  elseif m.phase=='approach' and target then
    goal={target.x,target.z,target.y};power=hypot(target.x-s.x,target.z-s.z)<reach+target.radius+2
    if hypot(target.x-s.x,target.z-s.z)<8 then
      local extension=0;for _,i in ipairs(rams) do extension=extension+s.angles[i] end
      lift=math.max(0,math.min(3,(target.centerOfMass[2]-(m.freeRescue and basket and 1 or 0)-s.positions[magnets[1]][2]+extension)/math.max(1,#rams)))
    end
  elseif m.phase=='lift' then
    power=true;lift=m.freeRescue and m.lift or 3
    if m.freeRescue and target then lift=math.max(0,m.lift-(t-m.since)*.15) end
    local grips=0
    for _,i in ipairs(magnets) do local g=s.magnets[i];if g.attached and target and g.creature==target.id then grips=grips+1 end end
    if m.freeRescue and target and grips>0 and target.magnetCount==grips then m.releasedAt=m.releasedAt or t else m.releasedAt=nil end
    if m.releasedAt and t-m.releasedAt>1 then phase('back')
    elseif m.rescue and not m.freeRescue and target and target.up>.85 and t-m.since>1 then phase('back')
    elseif not held or t-m.since>(m.freeRescue and 30 or 10) then phase('back') end
  elseif m.phase=='back' and t-m.since>2.5 then
    m.returning=m.rescue;m.cooldown[m.target]=t+25;m.wait=t+3;m.target=0;phase('patrol');m.goal=nil
  end
  local walls={}
  m.geometry=m.geometry or {}
  local refresh
  for _,b in ipairs(s.nearby) do if b.anchored and (not m.geometry[b.id] or t-m.geometry[b.id].at>1) then refresh=b;break end end
  if refresh then
    local boxes,groups={},{}
    for _,b in ipairs(s.bounds(refresh.id)) do
      if b.high>s.ground+.3 and b.low<s.ground+height then
        local key=b.body+1
        local g=groups[key] or {left=math.huge,right=-math.huge,back=math.huge,front=-math.huge}
        g.left=math.min(g.left,b.x-b.halfX);g.right=math.max(g.right,b.x+b.halfX)
        g.back=math.min(g.back,b.z-b.halfZ);g.front=math.max(g.front,b.z+b.halfZ);groups[key]=g
      end
    end
    for _,g in pairs(groups) do boxes[#boxes+1]={x=(g.left+g.right)/2,z=(g.back+g.front)/2,halfX=(g.right-g.left)/2,halfZ=(g.front-g.back)/2} end
    m.geometry[refresh.id]={at=t,boxes=boxes}
  end
  for id,cache in pairs(m.geometry) do
    if not nearby[id] then m.geometry[id]=nil else for _,b in ipairs(cache.boxes) do walls[#walls+1]=b end end
  end
  local function navigate(goal)
    local step=1.5
    m.map=m.map or {};m.mapKeys=m.mapKeys or {};m.survey=m.survey or {}
    local last=m.survey[#m.survey]
    if not last or hypot(s.x-last[1],s.z-last[2])>4 then
      m.survey[#m.survey+1]={s.x,s.z}
      for _,b in ipairs(s.terrain) do
        local key=table.concat({b.x,b.z,b.halfX,b.halfZ,b.low,b.high},':')
        if not m.mapKeys[key] then m.mapKeys[key]=true;m.map[#m.map+1]=b end
      end
    end
    local reachHeight=height
    for i,b in ipairs(s.blueprint) do if b.joint==2 and b.axis==1 then reachHeight=reachHeight+math.max(0,b.travel-s.angles[i]) end end
    local function remaining(x,z,y) return hypot(x-goal[1],z-goal[2])+2*math.max(0,(goal[3] or y)-reachHeight-y) end
    local patch
    local function window(x,z,margin)
      patch={}
      local radius=width+margin+.2
      for _,b in ipairs(m.map) do
        if math.abs(x-b.x)<=b.halfX+radius and math.abs(z-b.z)<=b.halfZ+radius then patch[#patch+1]=b end
      end
    end
    local function surface(x,z,reference)
      local high=-math.huge
      for _,b in ipairs(patch) do
        if math.abs(x-b.x)<=b.halfX and math.abs(z-b.z)<=b.halfZ and b.high<=reference+.8 then high=math.max(high,b.high) end
      end
      return high
    end
    local function accessible(x,z,reference,dx,dz)
      local known=false
      for i=#m.survey,1,-1 do local p=m.survey[i];if (x-p[1])^2+(z-p[2])^2<400 then known=true;break end end
      if not known then return nil,'unseen' end
      local high=surface(x,z,reference)
      if high<reference-.8 or high<s.waterHeight+.4 then return nil end
      local length=hypot(dx,dz);if length<.001 then dx=math.sin(yaw);dz=math.cos(yaw) else dx=dx/length;dz=dz/length end
      for _,p in ipairs({{dz*width,-dx*width,.4},{-dz*width,dx*width,.4},{dx*width,dz*width,1.2},{-dx*width,-dz*width,1.2}}) do
        local h=surface(x+p[1],z+p[2],high+1.1)
        if h<high-p[3] or h>high+p[3] then return nil end
      end
      for _,b in ipairs(patch) do
        if b.high>high+1.3 and b.low<high+height then
          local d=hypot(math.max(0,math.abs(x-b.x)-b.halfX),math.max(0,math.abs(z-b.z)-b.halfZ))
          if d<width+.1 then return nil end
        end
      end
      for _,b in ipairs(walls) do
        if (not b.low or b.low<high+height) and (not b.high or b.high>high+.3) then
          local d=hypot(math.max(0,math.abs(x-b.x)-b.halfX),math.max(0,math.abs(z-b.z)-b.halfZ))
          if d<width+.1 then return nil end
        end
      end
      for _,b in ipairs(s.nearby) do
        if b.id~=m.target and not b.anchored and (not held or b.id~=held.id)
          and b.low<high+height and b.high>high+.3 and b.y<high+3
          and hypot(x-b.centerOfMass[1],z-b.centerOfMass[3])<width+b.radius+.2 then return nil end
      end
      return high
    end
    if m.route and m.route.path and t>(m.route.checked or 0) then
      m.route.checked=t+1
      for i=m.route.at,math.min(#m.route.path,m.route.at+3) do
        local p=m.route.path[i]
        local previous=m.route.path[math.max(1,i-1)]
        window(p[1],p[2],0)
        local high=accessible(p[1],p[2],p[3],p[1]-previous[1],p[2]-previous[2])
        if not high or math.abs(high-p[3])>.4 then m.route=nil;break end
      end
    end
    if not m.searchGoal or hypot(goal[1]-m.searchGoal[1],goal[2]-m.searchGoal[2])>3 then
      m.searchGoal={goal[1],goal[2]};m.closestGoal=remaining(s.x,s.z,s.ground)
    end
    if not m.route or hypot(goal[1]-m.route.goal[1],goal[2]-m.route.goal[2])>3 then
      local start={x=s.x,z=s.z,y=s.ground,g=0,f=0,key='0:0:'..math.floor(s.ground*4+.5)}
      m.route={goal=goal,ox=s.x,oz=s.z,open={start},nodes={[start.key]=start},expanded=0,best=start.key,bestDistance=remaining(start.x,start.z,start.y)}
    end
    local route=m.route
    local function push(node)
      local at=#route.open+1
      while at>1 do
        local parent=math.floor(at/2)
        if route.open[parent].f<=node.f then break end
        route.open[at]=route.open[parent];at=parent
      end
      route.open[at]=node
    end
    local function pop()
      local first,last=route.open[1],table.remove(route.open)
      if #route.open>0 then
        local at=1
        while at*2<=#route.open do
          local child=at*2
          if child<#route.open and route.open[child+1].f<route.open[child].f then child=child+1 end
          if last.f<=route.open[child].f then break end
          route.open[at]=route.open[child];at=child
        end
        route.open[at]=last
      end
      return first
    end
    local function finish(node,partial)
      route.path={};route.at=1;route.partial=partial
      while node do table.insert(route.path,1,{node.x,node.z,node.y});node=route.nodes[node.parent] end
      route.nodes=nil;route.open={};route.closed=nil
    end
    for _=1,3 do
      if route.path or route.failed then break end
      local node=pop()
      if not node or route.expanded>1800 then
        local best=route.nodes[route.best]
        if best and route.bestDistance<(m.closestGoal or math.huge)-1 then m.closestGoal=route.bestDistance;finish(best,true)
        elseif route.frontier then finish(route.nodes[route.frontier],true)
        else route.failed=true end
        break
      end
      if not route.closed then route.closed={} end
      if not route.closed[node.key] then
        route.closed[node.key]=true;route.expanded=route.expanded+1
        local distance=remaining(node.x,node.z,node.y)
        if distance<route.bestDistance then route.best=node.key;route.bestDistance=distance end
        if distance<4 and (not goal[3] or goal[3]-node.y<reachHeight) then finish(node,false);break end
        window(node.x,node.z,step)
        for dx=-1,1 do for dz=-1,1 do
          if dx~=0 or dz~=0 then
            local x,z=node.x+dx*step,node.z+dz*step
            if hypot(x-route.ox,z-route.oz)<50 then
              local high,reason=accessible(x,z,node.y,dx,dz)
              if reason=='unseen' and hypot(node.x-route.ox,node.z-route.oz)>4 then
                local score=remaining(node.x,node.z,node.y)+node.g*.35
                if not route.frontierScore or score<route.frontierScore then route.frontier=node.key;route.frontierScore=score end
              end
              if high then
                local ix,iz=math.floor((x-route.ox)/step+.5),math.floor((z-route.oz)/step+.5)
                local key=ix..':'..iz..':'..math.floor(high*4+.5)
                local cost=node.g+hypot(dx,dz)*step+math.abs(high-node.y)*2
                local previous=route.nodes[key]
                if not route.closed[key] and (not previous or cost<previous.g) then
                  local next={x=x,z=z,y=high,g=cost,f=cost+remaining(x,z,high),key=key,parent=node.key}
                  route.nodes[key]=next;push(next)
                end
              end
            end
          end
        end end
      end
    end
    if route.path then
      while route.at<#route.path and hypot(s.x-route.path[route.at][1],s.z-route.path[route.at][2])<.7 do route.at=route.at+1 end
      local point=route.path[route.at]
      if route.partial and route.at==#route.path and hypot(s.x-point[1],s.z-point[2])<.8 then m.route=nil;return nil end
      return point
    end
    return nil
  end
  local throttle,turn=0,0
  if s.up>.5 and goal and (m.phase=='patrol' or m.phase=='approach') then
    local point=t>=(m.reverseUntil or 0) and navigate(goal) or nil
    if m.route and m.route.failed and t>(m.failedRecovery or 0) then
      m.reverseUntil=t+2;m.failedRecovery=t+5;m.route=nil
    end
    if point then
      local distance=hypot(point[1]-s.x,point[2]-s.z)
      if m.navPoint~=m.route.at or not m.best then m.navPoint=m.route.at;m.best=distance;m.progress=t;m.turnBest=nil end
      if distance<m.best-.2 then m.best=distance;m.progress=t end
      if t-m.progress>7 then m.reverseUntil=t+2;m.route=nil;m.best=nil end
      local angle=math.atan(point[1]-s.x,point[2]-s.z)
      local gear=m.phase=='patrol' and math.abs(wrap(angle-yaw))>math.pi/2 and -1 or 1
      if gear<0 then angle=wrap(angle+math.pi) end
      local speed=gear*math.min(.7,distance*.5)
      if m.route and m.route.at==#m.route.path and distance<.7 then
        speed=0;m.progress=t
        if m.phase=='approach' then angle=math.atan(goal[1]-s.x,goal[2]-s.z)
        else angle=yaw;m.route=nil;m.goal=nil;m.goalUntil=0 end
      end
      local error=wrap(angle-yaw)
      if not m.turnBest or math.abs(error)<m.turnBest-.04 then m.turnBest=math.abs(error);m.progress=t end
      speed=speed*math.max(0,1-math.abs(error)/.5)
      turn=clamp(error*1.1-.65*s.gyroscope[2],.65)
      throttle=clamp(.3*speed+.6*(speed-s.localVelocity[3]),.8)
    end
  end
  if m.phase=='back' or t<(m.reverseUntil or 0) then throttle=-.3;turn=0 end
  if m.phase=='lift' and m.freeRescue and target then
    local speed=t-m.since>1 and -.15 or 0
    throttle=clamp(.3*speed+.6*(speed-s.localVelocity[3]),.5)
    turn=0
  end
  if throttle<0 then
    local dx,dz=math.sin(yaw)*sign(throttle)*1.5,math.cos(yaw)*sign(throttle)*1.5
    local supports={}
    for _,i in ipairs(wheels) do
      local p=s.positions[i]
      local x,z=p[1]+dx,p[3]+dz
      local high=-math.huge
      for _,b in ipairs(s.terrain) do
        if math.abs(x-b.x)<b.halfX and math.abs(z-b.z)<b.halfZ and b.high<p[2]+.3 then high=math.max(high,b.high) end
      end
      if high>=p[2]-1.8 and high>s.waterHeight+.5 then supports[#supports+1]={x,z} end
    end
    local center={s.centerOfMass[1]+dx,s.centerOfMass[3]+dz}
    local function side(a,b,p) return (b[1]-a[1])*(p[2]-a[2])-(b[2]-a[2])*(p[1]-a[1]) end
    local stable=false
    for i=1,#supports-2 do for j=i+1,#supports-1 do for k=j+1,#supports do
      local a,b,c=supports[i],supports[j],supports[k]
      local area=side(a,b,c)
      if math.abs(area)>.1 then
        local direction=area>0 and 1 or -1
        if side(a,b,center)*direction>=0 and side(b,c,center)*direction>=0 and side(c,a,center)*direction>=0 then stable=true end
      end
    end end end
    if not stable then throttle=0 end
  end
  if s.up<.25 then throttle=0;turn=0;power=false;lift=0 end
  local out={}
  local function set(i,u)
    local b=s.blueprint[i];u=clamp(u,1)
    if b.negative~=0 then out[string.char(b.negative)]=math.max(0,-u) end
    if b.positive~=0 then out[string.char(b.positive)]=math.max(0,u) end
  end
  for _,i in ipairs(wheels) do set(i,throttle-turn*sign(s.blueprint[i].x-s.blueprint[1].x)) end
  for _,i in ipairs(rams) do set(i,2*(math.min(lift,s.blueprint[i].travel)-s.angles[i])-.3*s.rates[i]) end
  local rescueMagnet=magnets[1]
  for _,i in ipairs(magnets) do
    if math.abs(s.blueprint[i].x-s.blueprint[1].x)>math.abs(s.blueprint[rescueMagnet].x-s.blueprint[1].x) then rescueMagnet=i end
  end
  for _,i in ipairs(magnets) do set(i,power and (not m.rescue or m.freeRescue or i==rescueMagnet) and 1 or -1) end
  local rescued=nearby[m.rescueWatch]
  if rescued then
    local settled=rescued.up>.9 and rescued.carriedBy==0 and (m.rescueAir or rescued.low<s.ground+.6 and hypot(rescued.vx,rescued.vy,rescued.vz)<.4)
    m.rescueStable=settled and (m.rescueStable or 0)+s.dt or 0
    if m.rescueStable>2 then m.rescues=m.rescues+1;m.rescueWatch=nil;m.rescueStable=0 end
  end
  if s.up<.5 or s.carriedBy~=0 then out.radio={kind='help',target=s.id}
  elseif m.rescue and target and m.phase=='approach' then out.radio={kind='help',target=target.id}
  elseif target and rival(target) and m.phase=='approach' then out.radio={kind='threat',target=target.id}
  elseif t>(m.reportAt or 0) then
    local seen={}
    for _,b in ipairs(s.nearby) do if b.cargo and b.team==0 and b.visible and not b.delivered and b.carriedBy==0 then seen[#seen+1]=b end end
    if #seen>0 then m.reports=(m.reports or 0)+1;out.radio={kind='sight',cargo=seen[(m.reports-1)%#seen+1].id};m.reportAt=t+3.1 end
  end
  return out
end
