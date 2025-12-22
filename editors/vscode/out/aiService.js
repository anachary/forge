"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIService = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const axios_1 = __importDefault(require("axios"));
// Agent tools definition
const AGENT_TOOLS = [
    {
        name: 'read_file',
        description: 'Read the contents of a file at the given path',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the file relative to workspace' }
            },
            required: ['path']
        }
    },
    {
        name: 'write_file',
        description: 'Write content to a file, creating it if it does not exist',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the file relative to workspace' },
                content: { type: 'string', description: 'Content to write to the file' }
            },
            required: ['path', 'content']
        }
    },
    {
        name: 'list_files',
        description: 'List files in a directory',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to directory relative to workspace' }
            },
            required: ['path']
        }
    },
    {
        name: 'add_task',
        description: 'Add a new task to track progress. Use this to break down work into subtasks.',
        input_schema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Short name of the task' },
                parentId: { type: 'string', description: 'Optional parent task ID for subtasks' }
            },
            required: ['name']
        }
    },
    {
        name: 'update_task',
        description: 'Update task state: pending, in_progress, complete, or failed. Include error message if failed.',
        input_schema: {
            type: 'object',
            properties: {
                taskId: { type: 'string', description: 'ID of the task to update' },
                state: { type: 'string', enum: ['pending', 'in_progress', 'complete', 'failed'], description: 'New state' },
                error: { type: 'string', description: 'Error message if state is failed' }
            },
            required: ['taskId', 'state']
        }
    }
];
class AIService {
    constructor(context) {
        this.threads = [];
        this.currentThreadId = '';
        this.agentMode = true;
        this.context = context;
        this.outputChannel = vscode.window.createOutputChannel('Forge');
        this.loadThreads();
    }
    setAgentMode(enabled) {
        this.agentMode = enabled;
    }
    isAgentMode() {
        return this.agentMode;
    }
    loadThreads() {
        const saved = this.context.globalState.get(AIService.THREADS_KEY);
        if (saved && Array.isArray(saved)) {
            // Migrate old threads that may be missing new properties
            this.threads = saved.map(t => ({
                ...t,
                editedFiles: t.editedFiles || [],
                tasks: (t.tasks || []).map(task => ({
                    ...task,
                    startTime: task.startTime,
                    endTime: task.endTime,
                    tokensUsed: task.tokensUsed || 0,
                    error: task.error
                })),
                edits: (t.edits || []).map(edit => ({
                    ...edit,
                    status: edit.status || 'applied' // Old edits were applied directly
                }))
            }));
        }
        this.currentThreadId = this.context.globalState.get(AIService.CURRENT_THREAD_KEY, '');
        // Create default thread if none exist
        if (this.threads.length === 0) {
            this.createThread('New Chat');
        }
        else if (!this.currentThreadId || !this.threads.find(t => t.id === this.currentThreadId)) {
            this.currentThreadId = this.threads[0].id;
        }
    }
    async saveThreads() {
        await this.context.globalState.update(AIService.THREADS_KEY, this.threads);
        await this.context.globalState.update(AIService.CURRENT_THREAD_KEY, this.currentThreadId);
    }
    getCurrentThread() {
        return this.threads.find(t => t.id === this.currentThreadId);
    }
    get conversationHistory() {
        return this.getCurrentThread()?.messages || [];
    }
    createThread(name) {
        const thread = {
            id: Date.now().toString(),
            name,
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            editedFiles: [],
            tasks: [],
            edits: []
        };
        this.threads.unshift(thread);
        this.currentThreadId = thread.id;
        this.saveThreads();
        return thread;
    }
    getTasks() {
        return this.getCurrentThread()?.tasks || [];
    }
    getEdits() {
        return this.getCurrentThread()?.edits || [];
    }
    addTask(name, parentId) {
        const thread = this.getCurrentThread();
        if (!thread) {
            throw new Error('No active thread');
        }
        const task = {
            id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
            name,
            state: 'pending',
            parentId,
            startTime: undefined,
            endTime: undefined,
            tokensUsed: 0,
            error: undefined
        };
        thread.tasks.push(task);
        this.saveThreads();
        return task;
    }
    updateTask(taskId, state, error) {
        const thread = this.getCurrentThread();
        if (!thread)
            return false;
        const task = thread.tasks.find(t => t.id === taskId);
        if (!task)
            return false;
        const prevState = task.state;
        task.state = state;
        // Track timing
        if (state === 'in_progress' && prevState === 'pending') {
            task.startTime = Date.now();
        }
        if (state === 'complete' || state === 'failed') {
            task.endTime = Date.now();
            if (state === 'failed' && error) {
                task.error = error;
            }
            // Notify user
            const duration = task.startTime ? ((task.endTime - task.startTime) / 1000).toFixed(1) : '?';
            const tokens = task.tokensUsed || 0;
            if (state === 'complete') {
                vscode.window.showInformationMessage(`Task completed: ${task.name} (${duration}s, ${tokens} tokens)`);
            }
            else {
                vscode.window.showErrorMessage(`Task failed: ${task.name} - ${error || 'Unknown error'}`);
            }
        }
        this.saveThreads();
        return true;
    }
    // Update task token count
    addTaskTokens(taskId, tokens) {
        const thread = this.getCurrentThread();
        if (!thread)
            return;
        const task = thread.tasks.find(t => t.id === taskId);
        if (task) {
            task.tokensUsed = (task.tokensUsed || 0) + tokens;
            this.saveThreads();
        }
    }
    addFileEdit(filePath, type, before, after, status = 'pending') {
        const thread = this.getCurrentThread();
        if (!thread) {
            this.outputChannel.appendLine(`[addFileEdit] No current thread!`);
            return;
        }
        this.outputChannel.appendLine(`[addFileEdit] Adding edit for ${filePath}, type=${type}, status=${status}`);
        thread.edits.push({
            path: filePath,
            type,
            before,
            after,
            timestamp: Date.now(),
            status
        });
        this.outputChannel.appendLine(`[addFileEdit] Thread now has ${thread.edits.length} edits`);
        this.saveThreads();
    }
    // Accept a pending edit - write to file system
    acceptEdit(editIndex) {
        const thread = this.getCurrentThread();
        if (!thread)
            return { success: false, message: 'No active thread' };
        const edit = thread.edits[editIndex];
        if (!edit)
            return { success: false, message: 'Edit not found' };
        if (edit.status !== 'pending')
            return { success: false, message: 'Edit already processed' };
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspacePath)
            return { success: false, message: 'No workspace open' };
        try {
            const filePath = path.join(workspacePath, edit.path);
            const dir = path.dirname(filePath);
            if (edit.type === 'delete') {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }
            else {
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(filePath, edit.after || '', 'utf-8');
            }
            edit.status = 'applied';
            this.saveThreads();
            vscode.window.showInformationMessage(`Applied: ${edit.path}`);
            return { success: true, message: `Applied: ${edit.path}` };
        }
        catch (err) {
            return { success: false, message: err.message };
        }
    }
    // Reject a pending edit - discard without writing
    rejectEdit(editIndex) {
        const thread = this.getCurrentThread();
        if (!thread)
            return { success: false, message: 'No active thread' };
        const edit = thread.edits[editIndex];
        if (!edit)
            return { success: false, message: 'Edit not found' };
        if (edit.status !== 'pending')
            return { success: false, message: 'Edit already processed' };
        edit.status = 'rejected';
        this.saveThreads();
        vscode.window.showInformationMessage(`Rejected: ${edit.path}`);
        return { success: true, message: `Rejected: ${edit.path}` };
    }
    // Accept all pending edits
    acceptAllEdits() {
        const thread = this.getCurrentThread();
        if (!thread)
            return { success: false, applied: 0, failed: 0 };
        let applied = 0;
        let failed = 0;
        for (let i = 0; i < thread.edits.length; i++) {
            if (thread.edits[i].status === 'pending') {
                const result = this.acceptEdit(i);
                if (result.success) {
                    applied++;
                }
                else {
                    failed++;
                }
            }
        }
        vscode.window.showInformationMessage(`Applied ${applied} edits, ${failed} failed`);
        return { success: true, applied, failed };
    }
    // Reject all pending edits
    rejectAllEdits() {
        const thread = this.getCurrentThread();
        if (!thread)
            return { success: false, rejected: 0 };
        let rejected = 0;
        for (let i = 0; i < thread.edits.length; i++) {
            if (thread.edits[i].status === 'pending') {
                thread.edits[i].status = 'rejected';
                rejected++;
            }
        }
        this.saveThreads();
        vscode.window.showInformationMessage(`Rejected ${rejected} edits`);
        return { success: true, rejected };
    }
    switchThread(threadId) {
        const thread = this.threads.find(t => t.id === threadId);
        if (thread) {
            this.currentThreadId = threadId;
            this.saveThreads();
            return true;
        }
        return false;
    }
    deleteThread(threadId) {
        const index = this.threads.findIndex(t => t.id === threadId);
        if (index === -1)
            return false;
        this.threads.splice(index, 1);
        // If deleted current thread, switch to another
        if (this.currentThreadId === threadId) {
            if (this.threads.length === 0) {
                this.createThread('New Chat');
            }
            else {
                this.currentThreadId = this.threads[0].id;
            }
        }
        this.saveThreads();
        return true;
    }
    renameThread(threadId, name) {
        const thread = this.threads.find(t => t.id === threadId);
        if (thread) {
            thread.name = name;
            this.saveThreads();
            return true;
        }
        return false;
    }
    getThreads() {
        return this.threads;
    }
    getCurrentThreadId() {
        return this.currentThreadId;
    }
    getEditedFiles() {
        return this.getCurrentThread()?.editedFiles || [];
    }
    addEditedFile(filePath) {
        const thread = this.getCurrentThread();
        if (thread && !thread.editedFiles.includes(filePath)) {
            thread.editedFiles.push(filePath);
            this.saveThreads();
        }
    }
    saveDraft(text) {
        this.context.globalState.update(AIService.DRAFT_KEY + '_' + this.currentThreadId, text);
    }
    getDraft() {
        return this.context.globalState.get(AIService.DRAFT_KEY + '_' + this.currentThreadId, '');
    }
    getWorkspacePath() {
        const folders = vscode.workspace.workspaceFolders;
        return folders && folders.length > 0 ? folders[0].uri.fsPath : '';
    }
    async executeTool(name, input) {
        const workspacePath = this.getWorkspacePath();
        if (!workspacePath) {
            return 'Error: No workspace folder open';
        }
        try {
            switch (name) {
                case 'read_file': {
                    const filePath = path.join(workspacePath, input.path);
                    if (!fs.existsSync(filePath)) {
                        return `Error: File not found: ${input.path}`;
                    }
                    const content = fs.readFileSync(filePath, 'utf-8');
                    return content;
                }
                case 'write_file': {
                    const filePath = path.join(workspacePath, input.path);
                    const exists = fs.existsSync(filePath);
                    const before = exists ? fs.readFileSync(filePath, 'utf-8') : undefined;
                    // Stage the edit - don't write to file yet
                    this.addEditedFile(input.path);
                    this.addFileEdit(input.path, exists ? 'modify' : 'create', before, input.content, 'pending');
                    return `File staged: ${input.path} (pending approval)`;
                }
                case 'list_files': {
                    const dirPath = path.join(workspacePath, input.path || '');
                    if (!fs.existsSync(dirPath)) {
                        return `Error: Directory not found: ${input.path}`;
                    }
                    const files = fs.readdirSync(dirPath);
                    return files.join('\n');
                }
                case 'add_task': {
                    // Accept either 'name' or 'title' for flexibility with different models
                    const taskName = input.name || input.title;
                    if (!taskName) {
                        return `Error: Task name is required`;
                    }
                    const task = this.addTask(taskName, input.parentId);
                    return `Task added: ${task.id} - ${task.name}`;
                }
                case 'update_task': {
                    const success = this.updateTask(input.taskId, input.state, input.error);
                    return success ? `Task ${input.taskId} updated to ${input.state}` : `Task ${input.taskId} not found`;
                }
                default:
                    return `Error: Unknown tool: ${name}`;
            }
        }
        catch (err) {
            return `Error: ${err.message}`;
        }
    }
    getConfig() {
        const config = vscode.workspace.getConfiguration('forge');
        return {
            provider: config.get('provider', 'claude'),
            claudeApiKey: config.get('claudeApiKey', ''),
            openaiApiKey: config.get('openaiApiKey', ''),
            claudeModel: config.get('claudeModel', 'claude-sonnet-4-20250514'),
            openaiModel: config.get('openaiModel', 'gpt-4o'),
            ollamaUrl: config.get('ollamaUrl', 'http://localhost:11434'),
            ollamaModel: config.get('ollamaModel', 'qwen2.5-coder:7b'),
            temperature: config.get('temperature', 0.7),
            maxTokens: config.get('maxTokens', 2048),
            includeFileContext: config.get('includeFileContext', true)
        };
    }
    getToolSupport() {
        const config = this.getConfig();
        if (config.provider === 'claude') {
            if (!config.claudeApiKey) {
                return { supported: false, reason: 'Claude API key not set' };
            }
            return { supported: true };
        }
        if (config.provider === 'openai') {
            if (!config.openaiApiKey) {
                return { supported: false, reason: 'OpenAI API key not set' };
            }
            return { supported: true };
        }
        if (config.provider === 'ollama') {
            const model = config.ollamaModel.toLowerCase();
            const baseModel = model.split(':')[0];
            const isSupported = AIService.TOOL_SUPPORTED_OLLAMA_MODELS.some(m => baseModel.includes(m));
            if (!isSupported) {
                return { supported: false, reason: `Model "${config.ollamaModel}" may not support tools. Try llama3.1 or mistral.` };
            }
            return { supported: true };
        }
        return { supported: false, reason: 'Unknown provider' };
    }
    getFileContext() {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return '';
        const config = this.getConfig();
        if (!config.includeFileContext)
            return '';
        const fileName = editor.document.fileName;
        const language = editor.document.languageId;
        const lines = editor.document.getText().split('\n').slice(0, 300);
        const content = lines.join('\n');
        const truncated = editor.document.lineCount > 300 ? '\n... (truncated)' : '';
        return `\n\nCurrent file:\nFile: ${fileName}\nLanguage: ${language}\n\`\`\`${language}\n${content}${truncated}\n\`\`\``;
    }
    async sendMessageStream(message, includeContext, onChunk) {
        // Re-read config fresh each time to get latest settings
        const config = this.getConfig();
        this.outputChannel.appendLine(`[${new Date().toISOString()}] Using provider: ${config.provider}`);
        this.outputChannel.appendLine(`[${new Date().toISOString()}] OpenAI key set: ${config.openaiApiKey ? 'YES' : 'NO'}`);
        this.outputChannel.appendLine(`[${new Date().toISOString()}] Claude key set: ${config.claudeApiKey ? 'YES' : 'NO'}`);
        this.addMessage({ role: 'user', content: message, timestamp: Date.now() });
        let fullMessage = message;
        if (includeContext) {
            fullMessage += this.getFileContext();
        }
        const messages = this.conversationHistory.slice(-8).map(msg => ({
            role: msg.role,
            content: msg.content
        }));
        messages[messages.length - 1].content = fullMessage;
        // Try primary provider, fallback to Ollama on failure
        try {
            this.outputChannel.appendLine(`[${new Date().toISOString()}] Calling ${config.provider}...`);
            return await this.streamWithProvider(config.provider, messages, onChunk, config);
        }
        catch (error) {
            this.outputChannel.appendLine(`[${new Date().toISOString()}] ${config.provider} failed: ${error.message}`);
            // Fallback to Ollama only if primary provider fails
            if (config.provider !== 'ollama') {
                onChunk(`\n\n[${config.provider} failed: ${error.message}]\nFalling back to Ollama...\n\n`, false);
                try {
                    return await this.streamWithProvider('ollama', messages, onChunk, config);
                }
                catch (ollamaError) {
                    throw new Error(`All providers failed. ${config.provider}: ${error.message}, Ollama: ${ollamaError.message}`);
                }
            }
            throw error;
        }
    }
    async streamWithProvider(provider, messages, onChunk, config) {
        switch (provider) {
            case 'claude':
                return this.streamClaude(messages, onChunk, config);
            case 'openai':
                return this.streamOpenAI(messages, onChunk, config);
            case 'ollama':
                return this.streamOllama(messages, onChunk, config);
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    }
    async streamClaude(messages, onChunk, config) {
        if (!config.claudeApiKey) {
            throw new Error('Claude API key not configured. Set it in Settings > forge.claudeApiKey');
        }
        if (!this.agentMode) {
            return this.claudeSimple(messages, onChunk, config);
        }
        const systemMsg = `You are a coding assistant. You MUST use the provided tools to complete tasks.

IMPORTANT: Always use tools to do work. Never just describe what you would do - actually do it using the tools.

WORKFLOW:
1. First, call add_task to create tasks for the work
2. Call update_task to mark each task as in_progress when you start it
3. Use read_file, write_file, list_files as needed
4. Call update_task to mark tasks as complete when done

Be concise. Always use tools.`;
        return this.claudeWithTools(messages, onChunk, config, systemMsg);
    }
    async claudeSimple(messages, onChunk, config) {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.claudeApiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: config.claudeModel,
                max_tokens: config.maxTokens,
                system: 'You are a helpful coding assistant. Be concise.',
                messages: messages.filter(m => m.role !== 'system'),
                stream: true
            })
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Claude API error: ${response.status} - ${error}`);
        }
        const reader = response.body?.getReader();
        if (!reader)
            throw new Error('No response body');
        let fullResponse = '';
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
            for (const line of lines) {
                const data = line.slice(6);
                if (data === '[DONE]')
                    continue;
                try {
                    const json = JSON.parse(data);
                    if (json.type === 'content_block_delta' && json.delta?.text) {
                        fullResponse += json.delta.text;
                        onChunk(json.delta.text, false);
                    }
                }
                catch { }
            }
        }
        onChunk('', true);
        this.saveAssistantMessage(fullResponse);
        return fullResponse;
    }
    async claudeWithTools(messages, onChunk, config, systemMsg) {
        let fullResponse = '';
        let continueLoop = true;
        let currentMessages = [...messages.filter(m => m.role !== 'system')];
        while (continueLoop) {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': config.claudeApiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: config.claudeModel,
                    max_tokens: config.maxTokens,
                    system: systemMsg,
                    messages: currentMessages,
                    tools: AGENT_TOOLS
                })
            });
            if (!response.ok) {
                const err = await response.text();
                throw new Error(`Claude API error: ${response.status} - ${err}`);
            }
            const data = await response.json();
            // Process response content
            let textContent = '';
            let toolUses = [];
            for (const block of data.content || []) {
                if (block.type === 'text') {
                    textContent += block.text;
                    onChunk(block.text, false);
                    fullResponse += block.text;
                }
                else if (block.type === 'tool_use') {
                    toolUses.push(block);
                }
            }
            // If there are tool uses, execute them and continue
            if (toolUses.length > 0 && data.stop_reason === 'tool_use') {
                currentMessages.push({ role: 'assistant', content: data.content });
                const toolResults = [];
                for (const tool of toolUses) {
                    onChunk(`\n[Using ${tool.name}: ${JSON.stringify(tool.input)}]\n`, false);
                    fullResponse += `\n[Using ${tool.name}: ${JSON.stringify(tool.input)}]\n`;
                    const result = await this.executeTool(tool.name, tool.input);
                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: tool.id,
                        content: result
                    });
                    // Show abbreviated result
                    const shortResult = result.length > 200 ? result.substring(0, 200) + '...' : result;
                    onChunk(`[Result: ${shortResult}]\n`, false);
                    fullResponse += `[Result: ${shortResult}]\n`;
                }
                currentMessages.push({ role: 'user', content: toolResults });
            }
            else {
                continueLoop = false;
            }
        }
        onChunk('', true);
        return fullResponse;
    }
    async streamOpenAI(messages, onChunk, config) {
        if (!config.openaiApiKey) {
            throw new Error('OpenAI API key not configured. Set it in Settings > forge.openaiApiKey');
        }
        if (!this.agentMode) {
            return this.openaiSimple(messages, onChunk, config);
        }
        const systemMsg = {
            role: 'system',
            content: `You are a coding assistant. You MUST use the provided tools to complete tasks.

IMPORTANT: Always use tools to do work. Never just describe what you would do - actually do it using the tools.

WORKFLOW:
1. First, call add_task to create tasks for the work
2. Call update_task to mark each task as in_progress when you start it
3. Use read_file, write_file, list_files as needed
4. Call update_task to mark tasks as complete when done

Be concise. Always use tools.`
        };
        // Convert tools to OpenAI format
        const openaiTools = AGENT_TOOLS.map(t => ({
            type: 'function',
            function: {
                name: t.name,
                description: t.description,
                parameters: t.input_schema
            }
        }));
        return this.openaiWithTools(messages, onChunk, config, systemMsg, openaiTools);
    }
    async openaiSimple(messages, onChunk, config) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.openaiApiKey}`
            },
            body: JSON.stringify({
                model: config.openaiModel,
                messages: [{ role: 'system', content: 'You are a helpful coding assistant. Be concise.' }, ...messages],
                temperature: config.temperature,
                max_tokens: config.maxTokens,
                stream: true
            })
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API error: ${response.status} - ${error}`);
        }
        const reader = response.body?.getReader();
        if (!reader)
            throw new Error('No response body');
        let fullResponse = '';
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
            for (const line of lines) {
                const data = line.slice(6);
                if (data === '[DONE]')
                    continue;
                try {
                    const json = JSON.parse(data);
                    const content = json.choices?.[0]?.delta?.content;
                    if (content) {
                        fullResponse += content;
                        onChunk(content, false);
                    }
                }
                catch { }
            }
        }
        onChunk('', true);
        this.saveAssistantMessage(fullResponse);
        return fullResponse;
    }
    async openaiWithTools(messages, onChunk, config, systemMsg, tools) {
        let fullResponse = '';
        let continueLoop = true;
        let currentMessages = [systemMsg, ...messages];
        while (continueLoop) {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.openaiApiKey}`
                },
                body: JSON.stringify({
                    model: config.openaiModel,
                    max_tokens: config.maxTokens,
                    temperature: config.temperature,
                    messages: currentMessages,
                    tools: tools
                })
            });
            if (!response.ok) {
                const err = await response.text();
                throw new Error(`OpenAI API error: ${response.status} - ${err}`);
            }
            const data = await response.json();
            const message = data.choices[0].message;
            // Output text content
            if (message.content) {
                onChunk(message.content, false);
                fullResponse += message.content;
            }
            // Handle tool calls
            if (message.tool_calls && message.tool_calls.length > 0) {
                currentMessages.push(message);
                for (const toolCall of message.tool_calls) {
                    const args = JSON.parse(toolCall.function.arguments);
                    onChunk(`\n[Using ${toolCall.function.name}: ${JSON.stringify(args)}]\n`, false);
                    fullResponse += `\n[Using ${toolCall.function.name}: ${JSON.stringify(args)}]\n`;
                    const result = await this.executeTool(toolCall.function.name, args);
                    currentMessages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: result
                    });
                    const shortResult = result.length > 200 ? result.substring(0, 200) + '...' : result;
                    onChunk(`[Result: ${shortResult}]\n`, false);
                    fullResponse += `[Result: ${shortResult}]\n`;
                }
            }
            else {
                continueLoop = false;
            }
        }
        onChunk('', true);
        return fullResponse;
    }
    async streamOllama(messages, onChunk, config) {
        if (!this.agentMode) {
            return this.ollamaSimple(messages, onChunk, config);
        }
        const systemMsg = `You are a coding assistant. You MUST use the provided tools to complete tasks.

IMPORTANT: Always use tools to do work. Never just describe what you would do - actually do it using the tools.

AVAILABLE TOOLS:
- add_task: Create a task to track your work. Use this FIRST for any request.
- update_task: Mark a task as in_progress, complete, or failed.
- read_file: Read a file's contents.
- write_file: Create or modify a file.
- list_files: List files in a directory.

WORKFLOW:
1. First, call add_task to create tasks for the work
2. Call update_task to mark each task as in_progress when you start it
3. Use read_file, write_file, list_files as needed
4. Call update_task to mark tasks as complete when done

Be concise. Always use tools.`;
        // Ollama tools format
        const ollamaTools = AGENT_TOOLS.map(t => ({
            type: 'function',
            function: {
                name: t.name,
                description: t.description,
                parameters: t.input_schema
            }
        }));
        let fullResponse = '';
        let continueLoop = true;
        let currentMessages = [{ role: 'system', content: systemMsg }, ...messages.filter(m => m.role !== 'system')];
        this.outputChannel.appendLine(`[${new Date().toISOString()}] Ollama agent mode starting with ${ollamaTools.length} tools`);
        while (continueLoop) {
            const response = await fetch(`${config.ollamaUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: config.ollamaModel,
                    messages: currentMessages,
                    stream: false,
                    tools: ollamaTools,
                    options: { temperature: config.temperature, num_predict: config.maxTokens }
                })
            });
            if (!response.ok) {
                throw new Error(`Ollama error: ${response.status}`);
            }
            const json = await response.json();
            this.outputChannel.appendLine(`[${new Date().toISOString()}] Ollama response: ${JSON.stringify(json).substring(0, 500)}`);
            const msg = json.message;
            if (msg?.content) {
                fullResponse += msg.content;
                onChunk(msg.content, false);
            }
            // Handle tool calls
            if (msg?.tool_calls && msg.tool_calls.length > 0) {
                this.outputChannel.appendLine(`[${new Date().toISOString()}] Ollama tool calls: ${msg.tool_calls.length}`);
                currentMessages.push(msg);
                for (const toolCall of msg.tool_calls) {
                    const toolName = toolCall.function?.name;
                    const toolInput = toolCall.function?.arguments;
                    if (toolName && toolInput) {
                        onChunk(`\n[Tool: ${toolName}]\n`, false);
                        fullResponse += `\n[Tool: ${toolName}]\n`;
                        const result = await this.executeTool(toolName, toolInput);
                        const shortResult = result.length > 200 ? result.substring(0, 200) + '...' : result;
                        onChunk(`[Result: ${shortResult}]\n`, false);
                        fullResponse += `[Result: ${shortResult}]\n`;
                        currentMessages.push({
                            role: 'tool',
                            content: result
                        });
                    }
                }
            }
            else {
                continueLoop = false;
            }
        }
        onChunk('', true);
        this.saveAssistantMessage(fullResponse);
        return fullResponse;
    }
    async ollamaSimple(messages, onChunk, config) {
        const response = await fetch(`${config.ollamaUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: config.ollamaModel,
                messages: [{ role: 'system', content: 'You are a helpful coding assistant. Be concise.' }, ...messages.filter(m => m.role !== 'system')],
                stream: true,
                options: { temperature: config.temperature, num_predict: config.maxTokens }
            })
        });
        if (!response.ok) {
            throw new Error(`Ollama error: ${response.status}`);
        }
        const reader = response.body?.getReader();
        if (!reader)
            throw new Error('No response body');
        let fullResponse = '';
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            const lines = decoder.decode(value, { stream: true }).split('\n').filter(l => l.trim());
            for (const line of lines) {
                try {
                    const json = JSON.parse(line);
                    if (json.message?.content) {
                        fullResponse += json.message.content;
                        onChunk(json.message.content, false);
                    }
                    if (json.done)
                        onChunk('', true);
                }
                catch { }
            }
        }
        this.saveAssistantMessage(fullResponse);
        return fullResponse;
    }
    async processSSEStream(response, onChunk, provider) {
        const reader = response.body?.getReader();
        if (!reader)
            throw new Error('No response body');
        let fullResponse = '';
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (!line.startsWith('data: '))
                    continue;
                const data = line.slice(6);
                if (data === '[DONE]')
                    continue;
                try {
                    const json = JSON.parse(data);
                    let content = '';
                    if (provider === 'claude') {
                        if (json.type === 'content_block_delta') {
                            content = json.delta?.text || '';
                        }
                    }
                    else {
                        content = json.choices?.[0]?.delta?.content || '';
                    }
                    if (content) {
                        fullResponse += content;
                        onChunk(content, false);
                    }
                }
                catch { }
            }
        }
        onChunk('', true);
        this.saveAssistantMessage(fullResponse);
        return fullResponse;
    }
    saveAssistantMessage(content) {
        this.addMessage({ role: 'assistant', content, timestamp: Date.now() });
    }
    addMessage(message) {
        const thread = this.getCurrentThread();
        if (thread) {
            thread.messages.push(message);
            thread.updatedAt = Date.now();
            this.saveThreads();
        }
    }
    async sendMessage(message, includeContext = false) {
        return new Promise((resolve, reject) => {
            let result = '';
            this.sendMessageStream(message, includeContext, (chunk, done) => {
                result += chunk;
                if (done)
                    resolve(result);
            }).catch(reject);
        });
    }
    clearHistory() {
        const thread = this.getCurrentThread();
        if (thread) {
            thread.messages = [];
            thread.editedFiles = [];
            this.saveThreads();
        }
    }
    getHistory() { return this.conversationHistory; }
    async checkHealth() {
        const config = this.getConfig();
        // Check primary provider
        if (config.provider === 'claude' && config.claudeApiKey) {
            return { provider: 'Claude', status: true };
        }
        if (config.provider === 'openai' && config.openaiApiKey) {
            return { provider: 'OpenAI', status: true };
        }
        // Check Ollama
        try {
            await axios_1.default.get(`${config.ollamaUrl}/api/tags`, { timeout: 2000 });
            return { provider: 'Ollama (local)', status: true };
        }
        catch {
            return { provider: 'None', status: false };
        }
    }
}
exports.AIService = AIService;
AIService.THREADS_KEY = 'threads';
AIService.CURRENT_THREAD_KEY = 'currentThreadId';
AIService.DRAFT_KEY = 'draftText';
// Models known to support tool calling
AIService.TOOL_SUPPORTED_OLLAMA_MODELS = [
    'llama3.1', 'llama3.2', 'llama3.3',
    'mistral', 'mixtral',
    'qwen2.5', 'qwen2',
    'command-r', 'command-r-plus',
    'firefunction',
    'smollm2'
];
//# sourceMappingURL=aiService.js.map