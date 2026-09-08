vim.cmd("edit /workspace/Dollyfile")
assert(vim.bo.filetype == "dollyfile", "missing Dollyfile filetype")
assert(vim.b.current_syntax == "dollyfile", "missing syntax highlighting")
assert(vim.bo.shiftwidth == 4 and vim.bo.expandtab, "FILE bodies need four spaces")
local namespace = vim.api.nvim_create_namespace("dollyfile")
assert(vim.diagnostic.config(nil, namespace).virtual_text, "inline errors are disabled")
local function syntax(line, column)
  return vim.fn.synIDattr(vim.fn.synID(line, column, 1), "name")
end
assert(syntax(1, 1) == "dollyDirective", "DOLLY directive is not highlighted")
assert(syntax(6, 1) == "dollyDirective", "FILE region swallowed its directive")
assert(syntax(7, 5) == "dollyBody", "FILE body is not plain text")
assert(vim.api.nvim_get_hl(0, { name = "dollyDirective", link = false }).fg == 0xf2d45c,
  "directives need visible contrast, not the default white syntax groups")
vim.cmd("DollyLint")
assert(#vim.diagnostic.get(0, {namespace = namespace}) == 0, "valid recipe rejected")
vim.api.nvim_buf_set_lines(0, 0, 1, false, {"DOLLY 2"})
vim.cmd("DollyLint")
local errors = vim.diagnostic.get(0, {namespace = namespace})
assert(#errors == 1 and errors[1].lnum == 0, "missing unsaved-buffer diagnostic")
assert(errors[1].message:find("DOLLY 3", 1, true), "wrong syntax diagnostic")
local disk = vim.fn.readfile("/workspace/Dollyfile")
assert(disk[1] == "DOLLY 3", "lint unexpectedly saved the buffer")
vim.api.nvim_buf_set_lines(0, 0, 1, false, {"DOLLY 3"})
vim.cmd("write /tmp/Dollyfile-studio-lint")
assert(vim.wait(3000, function() return #vim.diagnostic.get(0, {namespace = namespace}) == 0 end),
  "save did not clear stale diagnostics")
for _, name in ipairs({"Dollyfile-draft", "draft.dm"}) do
  vim.cmd("edit /tmp/" .. name)
  assert(vim.bo.filetype == "dollyfile", "filetype missing for " .. name)
  assert(vim.wait(3000, function() return #vim.diagnostic.get(0, {namespace = namespace}) == 1 end),
    "opening an invalid recipe did not lint")
end
vim.cmd("qa!")
