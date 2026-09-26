return function(t, sensors)
  local out, keys, wheels = {}, {}, {}
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
  local throttle = (keys.W or 0) - (keys.S or 0)
  local turn = (keys.D or 0) - (keys.A or 0)
  if throttle ~= 0 or turn ~= 0 then
    for _, block in ipairs(wheels) do
      local position = block.axis == 0 and block.x or block.z
      local offset = position - center[block.axis + 1] / #wheels
      local side = offset < 0 and -1 or offset > 0 and 1 or 0
      local alignment = block.axis == forward and 0 or (block.axis == 0 and 1 or -1) * direction
      local drive = math.max(-1, math.min(1, throttle * alignment + turn * side))
      if block.negative ~= 0 then out[string.char(block.negative)] = math.max(0, -drive) end
      if block.positive ~= 0 then out[string.char(block.positive)] = math.max(0, drive) end
    end
  end
  return out
end
