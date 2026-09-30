vim.filetype.add({ filename = { Dollyfile = "dollyfile" },
  pattern = { [".*/Dollyfile%-.*"] = "dollyfile" }, extension = { dm = "dollyfile" } })
local namespace = vim.api.nvim_create_namespace("dollyfile")
vim.diagnostic.config({ virtual_text = { prefix = "!" }, signs = true, underline = true }, namespace)
vim.api.nvim_set_hl(0, "DiagnosticError", { fg = "#f2d45c", ctermfg = 3 })
local function lint(buffer)
  local name = vim.api.nvim_buf_get_name(buffer)
  if name == "" then name = "Dollyfile" end
  local lines = vim.api.nvim_buf_get_lines(buffer, 0, -1, false)
  local output = vim.fn.system({"dollyfile-lint", "--stdin", name}, table.concat(lines, "\n") .. "\n")
  local diagnostics = {}
  if vim.v.shell_error ~= 0 then
    local line, message = output:match(":(%d+): (.+)")
    diagnostics[1] = { lnum = math.max(0, math.min(#lines - 1, (tonumber(line) or 1) - 1)), col = 0,
      message = (message or output):gsub("%s+$", ""), severity = vim.diagnostic.severity.ERROR,
      source = "dollyfile-lint" }
  end
  vim.diagnostic.set(namespace, buffer, diagnostics)
  return #diagnostics == 0
end
local pending = {}
local function lint_later(buffer)
  if pending[buffer] then return end
  pending[buffer] = true
  vim.schedule(function()
    pending[buffer] = nil
    if vim.api.nvim_buf_is_loaded(buffer) then lint(buffer) end
  end)
end
vim.api.nvim_create_autocmd("FileType", {
  pattern = "dollyfile",
  callback = function(event)
    vim.bo[event.buf].expandtab = true
    vim.bo[event.buf].shiftwidth = 4
    vim.bo[event.buf].commentstring = "# %s"
    vim.wo.signcolumn = "yes"
    vim.api.nvim_buf_create_user_command(event.buf, "DollyLint", function()
      if lint(event.buf) then print("Dollyfile syntax OK; a build still verifies commands and pins") end
    end, {})
    vim.api.nvim_create_autocmd({ "BufWritePost", "InsertLeave", "TextChanged" }, {
      buffer = event.buf, callback = function() lint_later(event.buf) end,
    })
    lint_later(event.buf)
  end,
})
