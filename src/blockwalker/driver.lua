return function(t, sensors)
  local out, keys, wheels, steering = {}, {}, {}, {}
  for key, value in pairs(sensors.input) do keys[key] = value end
  for key, value in pairs(sensors.pressed) do keys[key] = value end
  local forward, direction, have_eyes = 2, 1, false
  local center = {0, 0, 0}
  for _, block in ipairs(sensors.blueprint) do
    if block.joint ~= 0 and block.joint ~= 6 then
      for _, code in ipairs({block.negative, block.positive}) do
        if code ~= 0 then
          local key = string.char(code)
          if keys[key] then out[key] = keys[key] end
        end
      end
    end
    if block.joint == 4 and block.axis ~= 1 then
      wheels[#wheels + 1] = block
      center[1], center[3] = center[1] + block.x, center[3] + block.z
    elseif block.joint == 6 and block.axis ~= 1 and not have_eyes then
      forward, direction, have_eyes = block.axis, block.direction, true
    end
  end
  for i, block in ipairs(sensors.blueprint) do
    if block.joint == 1 and block.axis == 1 then
      local axle, count = 0, 0
      for _, wheel in ipairs(wheels) do
        local parent = wheel.parent + 1
        while parent > 0 and parent ~= i do parent = sensors.blueprint[parent].parent + 1 end
        if parent == i then axle = axle + (forward == 2 and wheel.z or wheel.x); count = count + 1 end
      end
      if count > 0 and count < #wheels then
        local offset = axle / count - center[forward + 1] / #wheels
        steering[#steering + 1] = {block = block, index = i, side = offset * direction >= 0 and 1 or -1}
      end
    end
  end
  local throttle = (keys.W or 0) - (keys.S or 0)
  local turn = (keys.D or 0) - (keys.A or 0)
  for _, joint in ipairs(steering) do
    local block, i = joint.block, joint.index
    if not keys[string.char(block.negative)] and not keys[string.char(block.positive)] then
      local target = -turn * math.min(block.limit * math.pi / 180, .6) * joint.side
      local command = math.max(-1, math.min(1, 3 * (target - sensors.angles[i]) - .45 * sensors.rates[i]))
      if block.negative ~= 0 then out[string.char(block.negative)] = math.max(0, -command) end
      if block.positive ~= 0 then out[string.char(block.positive)] = math.max(0, command) end
    end
  end
  if throttle ~= 0 or turn ~= 0 then
    for _, block in ipairs(wheels) do
      local position = block.axis == 0 and block.x or block.z
      local offset = position - center[block.axis + 1] / #wheels
      local side = offset < 0 and -1 or offset > 0 and 1 or 0
      local alignment = block.axis == forward and 0 or (block.axis == 0 and 1 or -1) * direction
      local drive = math.max(-1, math.min(1, throttle * alignment + (#steering == 0 and turn * side or 0)))
      if block.negative ~= 0 then out[string.char(block.negative)] = math.max(0, -drive) end
      if block.positive ~= 0 then out[string.char(block.positive)] = math.max(0, drive) end
    end
  end
  return out
end
