DOLLY 3
MODULE neovim

# Upstream generators and the editor itself execute inside Dolly.
REQUIRES HEADER lua
REQUIRES HEADER luv
REQUIRES HEADER uv
REQUIRES HEADER treesitter
REQUIRES HEADER utf8proc
REQUIRES LIB lua
REQUIRES LIB luv
REQUIRES LIB uv
REQUIRES LIB lpeg
REQUIRES LIB lua-lpeg
REQUIRES LIB lua-luv
REQUIRES LIB treesitter
REQUIRES LIB utf8proc
REQUIRES TOOL cmake
REQUIRES TOOL cc
REQUIRES TOOL lua
REQUIRES TOOL make
REQUIRES TOOL slop
REQUIRES TOOL sh
REQUIRES TOOL sleep
REQUIRES TOOL tar
REQUIRES TOOL timeout
REQUIRES TOOL rm

SOURCE HOST /static/neovim/neovim.tar /tmp/neovim/source.tar c090bbf588fdecbed00599904583da903f0ddf7d875c5a35f00d1b458fbd7371
SLOP tar -xf /tmp/neovim/source.tar -C /
SLOP cmake -S /tmp/neovim/source -B /tmp/neovim/build \
  -DCMAKE_INSTALL_PREFIX=/usr -DCMAKE_INSTALL_LIBDIR=lib \
  -DCMAKE_BUILD_TYPE=Debug -DCMAKE_C_FLAGS=-DDOLLY -DCMAKE_C_FLAGS_DEBUG=-O0 \
  -DPREFER_LUA=ON -DENABLE_LTO=OFF -DENABLE_LIBINTL=OFF \
  -DENABLE_UNIBILIUM=OFF -DENABLE_WASMTIME=OFF \
  -DLUA_INCLUDE_DIR=/usr/include/lua5.1 -DLUA_LIBRARY=/usr/lib/liblua.a -DLUA_MATH_LIBRARY:STRING=m
SLOP cmake --build /tmp/neovim/build --target nvim
SLOP cmake --install /tmp/neovim/build

FILE /tmp/neovim/check.lua
    vim.api.nvim_buf_set_lines(0, 0, -1, false, {"Dolly", "日本語"})
    vim.cmd("write /tmp/neovim/check.txt")
    vim.cmd("bdelete!")
    vim.cmd("edit /tmp/neovim/check.txt")
    assert(vim.deep_equal(vim.api.nvim_buf_get_lines(0, 0, -1, false), {"Dolly", "日本語"}))
    local result = vim.fn.system({"/bin/slop", "-c", "printf SLOP-CHILD"})
    assert(result == "SLOP-CHILD" and vim.v.shell_error == 0,
      "Slop child status " .. vim.v.shell_error .. ": " .. vim.inspect(result))
    local stopped, output = false, ""
    local job = vim.fn.jobstart({"/bin/slop", "-c", "printf FIRST; read answer; printf SECOND; sleep 30"}, {
      on_stdout = function(_, data) output = output .. table.concat(data, "\n") end,
      on_exit = function() stopped = true end,
    })
    assert(job > 0)
    assert(vim.wait(3000, function() return output:find("FIRST", 1, true) end))
    assert(vim.fn.chansend(job, "go\n") > 0)
    assert(vim.wait(3000, function() return output:find("SECOND", 1, true) end))
    assert(vim.fn.jobstop(job) == 1)
    assert(vim.wait(3000, function() return stopped end))
    vim.cmd("quit!")
SLOP timeout 60 nvim --clean --headless -l /tmp/neovim/check.lua

EXPORTS TOOL nvim
EXPORTS FOLDER nvim-runtime /usr/share/nvim
EXPORTS FOLDER nvim-libraries /usr/lib/nvim
FILE /usr/share/licenses/neovim/LICENSE.txt
FILE /usr/share/licenses/neovim/mpack
FILE /usr/share/licenses/neovim/vterm
SLOP rm -rf /tmp/neovim
