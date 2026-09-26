return function(t, s, m, r)
  local phase = math.fmod(t, 24);
  local target = (((phase > 4) and (phase < 18)) and 2 or 0);
  local u = math.max((-1), math.min(1, ((2 * (target - at((s).angles, 12))) - (0.25 * at((s).rates, 12)))));
  (m).bores = math.floor((t / 24));
  (m).phase = ((phase < 4) and "rest" or ((phase < 18) and "bore" or "withdraw"));
  do return {I = math.max(0, (-u)), K = math.max(0, u), J = (((phase > 4) and (phase < 20)) and 0.85 or 0)} end
end
