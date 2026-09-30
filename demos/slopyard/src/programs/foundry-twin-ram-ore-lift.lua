return function(t, s, m)
  local ids = {7, 8, 9, 41, 42, 43};
  local loaded = some((s).nearby, function(c)
    return (function() local value = (c).cargo; if active(value) then return ((c).carriedBy == (s).id) else return value end end)()
  end);
  local a = (reduce(ids, function(sum, i)
    return (sum + at((s).angles, i))
  end, 0) / 2);
  local rate = reduce(ids, function(sum, i)
    return (sum + math.abs(at((s).rates, i)))
  end, 0);
  if (not active((m).phase)) then
    (m).phase = "lower";
    (m).since = t;
  end
  local go = function(p)
    (m).phase = p;
    (m).since = t;
  end;
  if ((((m).phase == "lower") and (a > 7.93)) and (rate < 0.08)) then
    go("load");
  end
  if ((((m).phase == "load") and active(loaded)) and ((t - (m).since) > 2)) then
    go("raise");
  end
  if ((((m).phase == "raise") and (a < 0.06)) and (rate < 0.08)) then
    go("unload");
  end
  if ((((m).phase == "unload") and (not active(loaded))) and ((t - (m).since) > 3)) then
    go("lower");
  end
  local down = (function() local value = ((m).phase == "lower"); if active(value) then return value else return ((m).phase == "load") end end)();
  local out = {};
  local keys = {"RF", "TG", "YH", "QA", "WS", "ED"};
  do
    local j = 0;
    while (j < #(ids)) do
      do
        do
          local i = at(ids, j);
          local target = (function() if active(down) then return at({3, 3, 2}, math.fmod(j, 3)) else return 0 end end)();
          local u = math.max((-1), math.min(1, ((3 * (target - at((s).angles, i))) - (0.3 * at((s).rates, i)))));
          (out)[index(at(at(keys, j), 0))] = math.max(0, (-u));
          (out)[index(at(at(keys, j), 1))] = math.max(0, u);
        end
      end
      ::continue_1::
      j = j + 1;
    end
  end
  do return out end
end
