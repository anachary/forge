" Forge: Local AI Coding Agent for Neovim
" Auto-load the Lua module

if exists('g:loaded_forge')
    finish
endif
let g:loaded_forge = 1

lua require('forge').setup()

