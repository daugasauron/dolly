-- Collection helpers shared by the maintained controllers. New programs can
-- also use Lua's standard math, string and table libraries directly.
function active(v) return v == v and v ~= nil and v ~= false and v ~= 0 and v ~= "" end
function index(k) if type(k) == "number" then return k + 1 end return k end
function at(t, k)
  if type(t) == "string" then return string.sub(t, k + 1, k + 1) end
  return t[index(k)]
end
function optional(t, k, indexed) if t ~= nil then return indexed and at(t, k) or t[k] end end
function sign(x) return x < 0 and -1 or x > 0 and 1 or 0 end
function round(x) return math.floor(x + .5) end
function hypot(...) local sum = 0; for _, x in ipairs({...}) do sum = sum + x*x end; return math.sqrt(sum) end
function merge(t, ...) for _, src in ipairs({...}) do for k, v in pairs(src) do t[k] = v end end return t end
function concat(...) local out = {}; for _, a in ipairs({...}) do for _, v in ipairs(a) do out[#out+1] = v end end return out end
function append(a, ...) for _, v in ipairs({...}) do a[#a+1] = v end return #a end
function prepend(a, v) table.insert(a, 1, v); return #a end
function shift(a) return table.remove(a, 1) end
function map(a, f) local out = {}; for i, v in ipairs(a) do out[i] = f(v, i-1, a) end return out end
function filter(a, f) local out = {}; for i, v in ipairs(a) do if active(f(v, i-1, a)) then out[#out+1] = v end end return out end
function find(a, f) for i, v in ipairs(a) do if active(f(v, i-1, a)) then return v end end end
function findIndex(a, f) for i, v in ipairs(a) do if active(f(v, i-1, a)) then return i-1 end end return -1 end
function some(a, f) for i, v in ipairs(a) do if active(f(v, i-1, a)) then return true end end return false end
function every(a, f) for i, v in ipairs(a) do if not active(f(v, i-1, a)) then return false end end return true end
function reduce(a, f, v) local first=1; if v == nil then v=a[1]; first=2 end; for i=first,#a do v=f(v,a[i],i-1,a) end return v end
function slice(a, first, last)
  first, last = first or 0, last or #a
  if first < 0 then first = math.max(0, #a + first) end
  if last < 0 then last = math.max(0, #a + last) end
  local out = {}; for i = first+1, math.min(last, #a) do out[#out+1] = a[i] end return out
end
function sort(a, f) local order={}; for i,v in ipairs(a) do order[v]=i end; table.sort(a, function(x,y) local n=f(x,y); return n < 0 or (n == 0 or n ~= n) and order[x] < order[y] end); return a end
function includes(a, x)
  if type(a) == "string" then return string.find(a, x, 1, true) ~= nil end
  for _, v in ipairs(a) do if v == x then return true end end return false
end
function startsWith(a, x) return a:sub(1, #x) == x end
function matches(patterns, text) for _, p in ipairs(patterns) do if text:find(p, 1, true) then return true end end return false end
function each(a, f) for i, v in ipairs(a) do f(v, i-1, a) end end
function lookup(a, k) return a[k] end
function contains(a, k) return a[k] ~= nil end
function put(a, k, v) a[k] = v; return a end

function array(n) local a = {}; for i=1,n do a[i]=false end return a end
function fill(a, v) for i=1,#a do a[i]=v end return a end
function from(a, f) local out={}; for i=1,(a.length or #a) do out[i]=f(a[i],i-1) end return out end
function kind(v) return v == nil and "undefined" or type(v) == "table" and "object" or type(v) end

-- Pattern matching can run entirely in native code without instruction hooks.
local find_plain = string.find
string.find = function(text, needle, first, plain)
  if not plain then error("Use string.find(text, needle, first, true) for a plain search") end
  return find_plain(text, needle, first, true)
end
string.match, string.gmatch, string.gsub = nil, nil, nil
