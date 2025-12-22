# Forge for Neovim

Local AI coding agent for Neovim. Requires Ollama running locally.

## Installation

### lazy.nvim

```lua
{
    "forge/editors/neovim",
    config = function()
        require("forge").setup({
            ollama_url = "http://localhost:11434",
            model = "qwen2.5-coder:7b",
        })
    end
}
```

### Manual

Copy `lua/forge/` to your Neovim runtime path.

## Commands

| Command | Description |
|---------|-------------|
| `:ForgeChat` | Open chat window |
| `:ForgeExplain` | Explain selected code |
| `:ForgeTests` | Generate tests for selection |
| `:ForgeRefactor` | Refactor selected code |
| `:ForgeFix` | Fix bugs in selection |
| `:ForgeClear` | Clear chat history |

## Keymaps (default)

| Key | Mode | Action |
|-----|------|--------|
| `<leader>fc` | Normal | Open chat |
| `<leader>fe` | Visual | Explain code |
| `<leader>ft` | Visual | Generate tests |
| `<leader>fr` | Visual | Refactor |
| `<leader>ff` | Visual | Fix bug |

## Configuration

```lua
require("forge").setup({
    ollama_url = "http://localhost:11434",
    model = "qwen2.5-coder:7b",
    temperature = 0.7,
    max_tokens = 2048,
    keymaps = true,  -- Set to false to disable default keymaps
})
```

