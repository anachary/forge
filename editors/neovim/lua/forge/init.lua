-- Forge: Local AI Coding Agent for Neovim
-- Requires: curl, Ollama running locally

local M = {}

M.config = {
    ollama_url = "http://localhost:11434",
    model = "qwen2.5-coder:7b",
    temperature = 0.7,
    max_tokens = 2048,
    keymaps = true,
}

local chat_history = {}
local chat_buf = nil
local chat_win = nil

function M.setup(opts)
    M.config = vim.tbl_deep_extend("force", M.config, opts or {})
    
    if M.config.keymaps then
        vim.keymap.set("n", "<leader>fc", M.chat, { desc = "Forge: Open Chat" })
        vim.keymap.set("v", "<leader>fe", M.explain, { desc = "Forge: Explain Code" })
        vim.keymap.set("v", "<leader>ft", M.generate_tests, { desc = "Forge: Generate Tests" })
        vim.keymap.set("v", "<leader>fr", M.refactor, { desc = "Forge: Refactor Code" })
        vim.keymap.set("v", "<leader>ff", M.fix_bug, { desc = "Forge: Fix Bug" })
    end
    
    vim.api.nvim_create_user_command("ForgeChat", M.chat, {})
    vim.api.nvim_create_user_command("ForgeExplain", M.explain, { range = true })
    vim.api.nvim_create_user_command("ForgeTests", M.generate_tests, { range = true })
    vim.api.nvim_create_user_command("ForgeRefactor", M.refactor, { range = true })
    vim.api.nvim_create_user_command("ForgeFix", M.fix_bug, { range = true })
    vim.api.nvim_create_user_command("ForgeClear", M.clear_chat, {})
end

local function get_visual_selection()
    local start_pos = vim.fn.getpos("'<")
    local end_pos = vim.fn.getpos("'>")
    local lines = vim.fn.getline(start_pos[2], end_pos[2])
    if #lines == 0 then return "" end
    lines[#lines] = string.sub(lines[#lines], 1, end_pos[3])
    lines[1] = string.sub(lines[1], start_pos[3])
    return table.concat(lines, "\n")
end

local function create_chat_window()
    if chat_buf and vim.api.nvim_buf_is_valid(chat_buf) then
        if chat_win and vim.api.nvim_win_is_valid(chat_win) then
            vim.api.nvim_set_current_win(chat_win)
            return
        end
    end
    
    chat_buf = vim.api.nvim_create_buf(false, true)
    vim.api.nvim_buf_set_option(chat_buf, "buftype", "nofile")
    vim.api.nvim_buf_set_option(chat_buf, "filetype", "markdown")
    vim.api.nvim_buf_set_name(chat_buf, "Forge Chat")
    
    local width = math.floor(vim.o.columns * 0.4)
    local height = vim.o.lines - 4
    
    chat_win = vim.api.nvim_open_win(chat_buf, true, {
        relative = "editor",
        width = width,
        height = height,
        col = vim.o.columns - width - 2,
        row = 1,
        style = "minimal",
        border = "rounded",
        title = " Forge ",
        title_pos = "center",
    })
    
    vim.api.nvim_buf_set_keymap(chat_buf, "n", "q", ":close<CR>", { noremap = true, silent = true })
    vim.api.nvim_buf_set_keymap(chat_buf, "n", "<CR>", ":lua require('forge').prompt_input()<CR>", { noremap = true, silent = true })
end

local function append_to_chat(text, role)
    if not chat_buf or not vim.api.nvim_buf_is_valid(chat_buf) then
        create_chat_window()
    end
    
    local prefix = role == "user" and "You: " or "Forge: "
    local lines = vim.split(prefix .. text, "\n")
    table.insert(lines, "")
    
    vim.api.nvim_buf_set_option(chat_buf, "modifiable", true)
    local line_count = vim.api.nvim_buf_line_count(chat_buf)
    vim.api.nvim_buf_set_lines(chat_buf, line_count, line_count, false, lines)
    vim.api.nvim_buf_set_option(chat_buf, "modifiable", false)
    
    if chat_win and vim.api.nvim_win_is_valid(chat_win) then
        vim.api.nvim_win_set_cursor(chat_win, { vim.api.nvim_buf_line_count(chat_buf), 0 })
    end
end

local function send_to_ollama(prompt, callback)
    local messages = {}
    for _, msg in ipairs(chat_history) do
        table.insert(messages, msg)
    end
    table.insert(messages, { role = "user", content = prompt })
    
    local body = vim.fn.json_encode({
        model = M.config.model,
        messages = messages,
        stream = false,
        options = {
            temperature = M.config.temperature,
            num_predict = M.config.max_tokens,
        }
    })
    
    local cmd = string.format(
        'curl -s -X POST "%s/api/chat" -H "Content-Type: application/json" -d %s',
        M.config.ollama_url,
        vim.fn.shellescape(body)
    )
    
    vim.fn.jobstart(cmd, {
        stdout_buffered = true,
        on_stdout = function(_, data)
            if data and data[1] ~= "" then
                local ok, result = pcall(vim.fn.json_decode, table.concat(data, ""))
                if ok and result.message then
                    table.insert(chat_history, { role = "user", content = prompt })
                    table.insert(chat_history, { role = "assistant", content = result.message.content })
                    callback(result.message.content)
                else
                    callback("Error: Failed to parse response")
                end
            end
        end,
        on_stderr = function(_, data)
            if data and data[1] ~= "" then
                callback("Error: " .. table.concat(data, "\n"))
            end
        end,
    })
end

function M.chat()
    create_chat_window()
    M.prompt_input()
end

function M.prompt_input()
    vim.ui.input({ prompt = "Forge> " }, function(input)
        if input and input ~= "" then
            append_to_chat(input, "user")
            send_to_ollama(input, function(response)
                vim.schedule(function()
                    append_to_chat(response, "assistant")
                end)
            end)
        end
    end)
end

function M.explain()
    local code = get_visual_selection()
    if code == "" then
        vim.notify("No code selected", vim.log.levels.WARN)
        return
    end
    local ft = vim.bo.filetype
    local prompt = string.format("Explain this %s code:\n\n```%s\n%s\n```", ft, ft, code)
    create_chat_window()
    append_to_chat(prompt, "user")
    send_to_ollama(prompt, function(response)
        vim.schedule(function() append_to_chat(response, "assistant") end)
    end)
end

function M.generate_tests()
    local code = get_visual_selection()
    if code == "" then
        vim.notify("No code selected", vim.log.levels.WARN)
        return
    end
    local ft = vim.bo.filetype
    local prompt = string.format("Generate unit tests for this %s code:\n\n```%s\n%s\n```", ft, ft, code)
    create_chat_window()
    append_to_chat(prompt, "user")
    send_to_ollama(prompt, function(response)
        vim.schedule(function() append_to_chat(response, "assistant") end)
    end)
end

function M.refactor()
    local code = get_visual_selection()
    if code == "" then
        vim.notify("No code selected", vim.log.levels.WARN)
        return
    end
    local ft = vim.bo.filetype
    local prompt = string.format("Refactor this %s code:\n\n```%s\n%s\n```", ft, ft, code)
    create_chat_window()
    append_to_chat(prompt, "user")
    send_to_ollama(prompt, function(response)
        vim.schedule(function() append_to_chat(response, "assistant") end)
    end)
end

function M.fix_bug()
    local code = get_visual_selection()
    if code == "" then
        vim.notify("No code selected", vim.log.levels.WARN)
        return
    end
    local ft = vim.bo.filetype
    local prompt = string.format("Fix bugs in this %s code:\n\n```%s\n%s\n```", ft, ft, code)
    create_chat_window()
    append_to_chat(prompt, "user")
    send_to_ollama(prompt, function(response)
        vim.schedule(function() append_to_chat(response, "assistant") end)
    end)
end

function M.clear_chat()
    chat_history = {}
    if chat_buf and vim.api.nvim_buf_is_valid(chat_buf) then
        vim.api.nvim_buf_set_option(chat_buf, "modifiable", true)
        vim.api.nvim_buf_set_lines(chat_buf, 0, -1, false, {})
        vim.api.nvim_buf_set_option(chat_buf, "modifiable", false)
    end
    vim.notify("Forge chat cleared", vim.log.levels.INFO)
end

return M

