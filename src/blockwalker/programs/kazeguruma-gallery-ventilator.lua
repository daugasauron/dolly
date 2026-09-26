return function(t, s, m, r)
  (m).turns = ((function() local value = (m).turns; if active(value) then return value else return 0 end end)() + ((math.abs(at((s).rates, 6)) * (s).dt) / (2 * math.pi)));
  do return {W = (0.65 + (0.2 * math.sin((t * 0.2))))} end
end
