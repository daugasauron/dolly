function driver(t, s) {
  // All assigned actuator keys remain available individually.
  const out = {}, keys = {...s.input, ...s.pressed};
  for (const block of s.blueprint) {
    if (block.joint === 0 || block.joint === 6) continue;
    for (const code of [block.negative, block.positive]) {
      const key = String.fromCharCode(code);
      if (code && keys[key]) out[key] = keys[key];
    }
  }
  // Differential drive from the wheel layout and the Eyes direction.
  const wheels = s.blueprint.filter(b => b.joint === 4 && b.axis !== 1);
  const eyes = s.blueprint.find(b => b.joint === 6 && b.axis !== 1);
  const forward = eyes ? eyes.axis : 2, direction = eyes ? eyes.direction : 1;
  const center = [0, 0, 0];
  for (const b of wheels) { center[0] += b.x / wheels.length; center[2] += b.z / wheels.length; }
  const throttle = (keys.W || 0) - (keys.S || 0);
  const turn = (keys.D || 0) - (keys.A || 0);
  if (throttle || turn) for (const block of wheels) {
    const side = Math.sign((block.axis === 0 ? block.x : block.z) - center[block.axis]);
    const alignment = block.axis === forward ? 0 : (block.axis === 0 ? 1 : -1) * direction;
    const drive = Math.max(-1, Math.min(1, throttle * alignment + turn * side));
    if (block.negative) out[String.fromCharCode(block.negative)] = Math.max(0, -drive);
    if (block.positive) out[String.fromCharCode(block.positive)] = Math.max(0, drive);
  }
  return out;
}
