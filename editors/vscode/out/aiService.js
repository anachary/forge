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
    },
    {
        name: 'run_command',
        description: 'Execute a shell command in the workspace directory. Use for running tests, builds, installing packages, git commands, etc.',
        input_schema: {
            type: 'object',
            properties: {
                command: { type: 'string', description: 'The shell command to execute' },
                cwd: { type: 'string', description: 'Optional subdirectory to run the command in (relative to workspace)' }
            },
            required: ['command']
        }
    },
    {
        name: 'search_files',
        description: 'Search for text or regex pattern across files in the workspace. Returns matching lines with file paths and line numbers.',
        input_schema: {
            type: 'object',
            properties: {
                pattern: { type: 'string', description: 'Text or regex pattern to search for' },
                path: { type: 'string', description: 'Optional directory to search in (relative to workspace). Defaults to entire workspace.' },
                filePattern: { type: 'string', description: 'Optional glob pattern to filter files (e.g., "*.ts", "*.py")' },
                maxResults: { type: 'number', description: 'Maximum number of results to return (default: 50)' }
            },
            required: ['pattern']
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
        const saved = this.context.workspaceState.get(AIService.THREADS_KEY);
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
        this.currentThreadId = this.context.workspaceState.get(AIService.CURRENT_THREAD_KEY, '');
        // Create default thread if none exist
        if (this.threads.length === 0) {
            this.createThread('New Chat');
        }
        else if (!this.currentThreadId || !this.threads.find(t => t.id === this.currentThreadId)) {
            this.currentThreadId = this.threads[0].id;
        }
    }
    async saveThreads() {
        await this.context.workspaceState.update(AIService.THREADS_KEY, this.threads);
        await this.context.workspaceState.update(AIService.CURRENT_THREAD_KEY, this.currentThreadId);
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
        this.context.workspaceState.update(AIService.DRAFT_KEY + '_' + this.currentThreadId, text);
    }
    getDraft() {
        return this.context.workspaceState.get(AIService.DRAFT_KEY + '_' + this.currentThreadId, '');
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
                    // Return success message - the file operation is complete from the LLM's perspective
                    return `Success: ${exists ? 'Modified' : 'Created'} ${input.path}`;
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
                case 'run_command': {
                    const { execSync } = require('child_process');
                    const cwd = input.cwd ? path.join(workspacePath, input.cwd) : workspacePath;
                    if (input.cwd && !fs.existsSync(cwd)) {
                        return `Error: Directory not found: ${input.cwd}`;
                    }
                    try {
                        const output = execSync(input.command, {
                            cwd,
                            encoding: 'utf-8',
                            timeout: 60000, // 60 second timeout
                            maxBuffer: 1024 * 1024 // 1MB buffer
                        });
                        return output || 'Command completed successfully (no output)';
                    }
                    catch (execError) {
                        // Return both stdout and stderr for failed commands
                        const stdout = execError.stdout || '';
                        const stderr = execError.stderr || '';
                        const exitCode = execError.status || 1;
                        return `Command failed (exit code ${exitCode}):\n${stderr}\n${stdout}`.trim();
                    }
                }
                case 'search_files': {
                    const searchDir = input.path ? path.join(workspacePath, input.path) : workspacePath;
                    if (!fs.existsSync(searchDir)) {
                        return `Error: Directory not found: ${input.path}`;
                    }
                    const maxResults = input.maxResults || 50;
                    const results = [];
                    const regex = new RegExp(input.pattern, 'gi');
                    const searchRecursive = (dir) => {
                        if (results.length >= maxResults)
                            return;
                        const entries = fs.readdirSync(dir, { withFileTypes: true });
                        for (const entry of entries) {
                            if (results.length >= maxResults)
                                break;
                            const fullPath = path.join(dir, entry.name);
                            const relativePath = path.relative(workspacePath, fullPath);
                            // Skip common non-code directories
                            if (entry.isDirectory()) {
                                if (['node_modules', '.git', 'dist', 'out', '.next', '__pycache__', 'venv', '.venv'].includes(entry.name)) {
                                    continue;
                                }
                                searchRecursive(fullPath);
                            }
                            else if (entry.isFile()) {
                                // Check file pattern filter
                                if (input.filePattern) {
                                    const pattern = input.filePattern.replace(/\*/g, '.*');
                                    if (!new RegExp(pattern).test(entry.name))
                                        continue;
                                }
                                // Skip binary and large files
                                const stats = fs.statSync(fullPath);
                                if (stats.size > 1024 * 1024)
                                    continue; // Skip files > 1MB
                                try {
                                    const content = fs.readFileSync(fullPath, 'utf-8');
                                    const lines = content.split('\n');
                                    lines.forEach((line, idx) => {
                                        if (results.length >= maxResults)
                                            return;
                                        if (regex.test(line)) {
                                            results.push(`${relativePath}:${idx + 1}: ${line.trim().substring(0, 200)}`);
                                        }
                                        regex.lastIndex = 0; // Reset regex state
                                    });
                                }
                                catch (e) {
                                    // Skip files that can't be read as text
                                }
                            }
                        }
                    };
                    searchRecursive(searchDir);
                    return results.length > 0
                        ? results.join('\n')
                        : `No matches found for "${input.pattern}"`;
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
            deepseekApiKey: config.get('deepseekApiKey', ''),
            claudeModel: config.get('claudeModel', 'claude-sonnet-4-20250514'),
            openaiModel: config.get('openaiModel', 'gpt-4o'),
            deepseekModel: config.get('deepseekModel', 'deepseek-chat'),
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
        if (config.provider === 'deepseek') {
            if (!config.deepseekApiKey) {
                return { supported: false, reason: 'DeepSeek API key not set' };
            }
            // DeepSeek supports function calling with deepseek-chat model
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
        // Wrapper that converts old callback to new event-based callback
        const onEvent = (event) => {
            if (event.type === 'text') {
                onChunk(event.content || '', false);
            }
            else if (event.type === 'tool_start') {
                onChunk(`\n⚡ ${this.getToolDisplayName(event.tool?.name || '')}...\n`, false);
            }
            else if (event.type === 'tool_end') {
                const status = event.tool?.success ? '✓' : '✗';
                onChunk(`${status} Done\n`, false);
            }
            else if (event.type === 'summary') {
                // Show summary
                const s = event.summary;
                if (s) {
                    const lines = ['\n---\n'];
                    if (s.success) {
                        lines.push(`✅ **Completed** (${(s.duration / 1000).toFixed(1)}s)\n`);
                    }
                    else {
                        lines.push(`❌ **Failed**\n`);
                    }
                    if (s.filesCreated.length > 0) {
                        lines.push(`📄 Created: ${s.filesCreated.join(', ')}\n`);
                    }
                    if (s.filesModified.length > 0) {
                        lines.push(`📝 Modified: ${s.filesModified.join(', ')}\n`);
                    }
                    if (s.errors.length > 0) {
                        lines.push(`⚠️ Errors: ${s.errors.join(', ')}\n`);
                    }
                    onChunk(lines.join(''), false);
                }
            }
        };
        return this.sendMessageStreamWithEvents(message, includeContext, onEvent, onChunk);
    }
    async sendMessageStreamWithEvents(message, includeContext, onEvent, onChunk) {
        const startTime = Date.now();
        const config = this.getConfig();
        // Track what happens during this request
        const tracking = {
            filesCreated: [],
            filesModified: [],
            errors: [],
            tasksCompleted: 0,
            tasksFailed: 0
        };
        this.outputChannel.appendLine(`[${new Date().toISOString()}] Using provider: ${config.provider}`);
        this.outputChannel.appendLine(`[${new Date().toISOString()}] Agent mode: ${this.agentMode ? 'ON' : 'OFF'}`);
        onEvent({ type: 'log', content: `Provider: ${config.provider}, Agent: ${this.agentMode}` });
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
        // Create wrapped callback that tracks events
        const wrappedOnEvent = (event) => {
            onEvent(event);
            // Track file operations
            if (event.type === 'tool_end' && event.tool) {
                if (event.tool.name === 'write_file' && event.tool.success) {
                    const filePath = event.tool.input?.path;
                    if (filePath) {
                        // Check if file existed before
                        if (event.tool.input?._wasCreate) {
                            tracking.filesCreated.push(filePath);
                        }
                        else {
                            tracking.filesModified.push(filePath);
                        }
                    }
                }
                if (event.tool.name === 'update_task' && event.tool.success) {
                    const state = event.tool.input?.state;
                    if (state === 'complete')
                        tracking.tasksCompleted++;
                    if (state === 'failed')
                        tracking.tasksFailed++;
                }
                if (!event.tool.success && event.tool.result) {
                    tracking.errors.push(`${event.tool.name}: ${event.tool.result.substring(0, 100)}`);
                }
            }
        };
        try {
            this.outputChannel.appendLine(`[${new Date().toISOString()}] Calling ${config.provider}...`);
            const result = await this.streamWithProviderEvents(config.provider, messages, wrappedOnEvent, config);
            // Send summary if agent mode
            if (this.agentMode) {
                onEvent({
                    type: 'summary',
                    summary: {
                        success: true,
                        tasksCompleted: tracking.tasksCompleted,
                        tasksFailed: tracking.tasksFailed,
                        filesCreated: tracking.filesCreated,
                        filesModified: tracking.filesModified,
                        errors: tracking.errors,
                        duration: Date.now() - startTime
                    }
                });
            }
            onChunk('', true);
            return result;
        }
        catch (error) {
            this.outputChannel.appendLine(`[${new Date().toISOString()}] ${config.provider} failed: ${error.message}`);
            tracking.errors.push(error.message);
            if (config.provider !== 'ollama') {
                onEvent({ type: 'log', content: `${config.provider} failed, falling back to Ollama` });
                onEvent({ type: 'text', content: `\n\n[Falling back to Ollama...]\n\n` });
                try {
                    const result = await this.streamWithProviderEvents('ollama', messages, wrappedOnEvent, config);
                    if (this.agentMode) {
                        onEvent({
                            type: 'summary',
                            summary: {
                                success: true,
                                tasksCompleted: tracking.tasksCompleted,
                                tasksFailed: tracking.tasksFailed,
                                filesCreated: tracking.filesCreated,
                                filesModified: tracking.filesModified,
                                errors: tracking.errors,
                                duration: Date.now() - startTime
                            }
                        });
                    }
                    onChunk('', true);
                    return result;
                }
                catch (ollamaError) {
                    tracking.errors.push(ollamaError.message);
                    onEvent({
                        type: 'summary',
                        summary: {
                            success: false,
                            tasksCompleted: tracking.tasksCompleted,
                            tasksFailed: tracking.tasksFailed,
                            filesCreated: tracking.filesCreated,
                            filesModified: tracking.filesModified,
                            errors: tracking.errors,
                            duration: Date.now() - startTime
                        }
                    });
                    throw new Error(`All providers failed. ${config.provider}: ${error.message}, Ollama: ${ollamaError.message}`);
                }
            }
            onEvent({
                type: 'summary',
                summary: {
                    success: false,
                    tasksCompleted: tracking.tasksCompleted,
                    tasksFailed: tracking.tasksFailed,
                    filesCreated: tracking.filesCreated,
                    filesModified: tracking.filesModified,
                    errors: tracking.errors,
                    duration: Date.now() - startTime
                }
            });
            throw error;
        }
    }
    getToolDisplayName(toolName) {
        const names = {
            'read_file': 'Reading file',
            'write_file': 'Writing file',
            'list_files': 'Listing files',
            'add_task': 'Creating task',
            'update_task': 'Updating task'
        };
        return names[toolName] || toolName;
    }
    async streamWithProviderEvents(provider, messages, onEvent, config) {
        switch (provider) {
            case 'claude':
                return this.streamClaudeEvents(messages, onEvent, config);
            case 'openai':
                return this.streamOpenAIEvents(messages, onEvent, config);
            case 'deepseek':
                return this.streamDeepSeekEvents(messages, onEvent, config);
            case 'ollama':
                return this.streamOllamaEvents(messages, onEvent, config);
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    }
    async streamWithProvider(provider, messages, onChunk, config) {
        switch (provider) {
            case 'claude':
                return this.streamClaude(messages, onChunk, config);
            case 'openai':
                return this.streamOpenAI(messages, onChunk, config);
            case 'deepseek':
                return this.streamDeepSeek(messages, onChunk, config);
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
    async streamDeepSeek(messages, onChunk, config) {
        if (!config.deepseekApiKey) {
            throw new Error('DeepSeek API key not configured. Set it in Settings > forge.deepseekApiKey');
        }
        if (!this.agentMode) {
            return this.deepseekSimple(messages, onChunk, config);
        }
        // Agent mode with tools - DeepSeek uses OpenAI-compatible format
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
        const deepseekTools = AGENT_TOOLS.map(t => ({
            type: 'function',
            function: {
                name: t.name,
                description: t.description,
                parameters: t.input_schema
            }
        }));
        return this.deepseekWithTools(messages, onChunk, config, systemMsg, deepseekTools);
    }
    async deepseekSimple(messages, onChunk, config) {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.deepseekApiKey}`
            },
            body: JSON.stringify({
                model: config.deepseekModel,
                messages: [{ role: 'system', content: 'You are a helpful coding assistant. Be concise and accurate.' }, ...messages],
                temperature: config.temperature,
                max_tokens: config.maxTokens,
                stream: true
            })
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`DeepSeek API error: ${response.status} - ${error}`);
        }
        const reader = response.body?.getReader();
        if (!reader)
            throw new Error('No response body');
        const decoder = new TextDecoder();
        let fullResponse = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(line => line.trim().startsWith('data: '));
            for (const line of lines) {
                const data = line.replace('data: ', '');
                if (data === '[DONE]')
                    continue;
                try {
                    const json = JSON.parse(data);
                    const content = json.choices?.[0]?.delta?.content || '';
                    if (content) {
                        fullResponse += content;
                        onChunk(content, false);
                    }
                }
                catch (e) {
                    // Skip invalid JSON
                }
            }
        }
        onChunk('', true);
        this.saveAssistantMessage(fullResponse);
        return fullResponse;
    }
    async deepseekWithTools(messages, onChunk, config, systemMsg, tools) {
        let fullResponse = '';
        let continueLoop = true;
        let currentMessages = [systemMsg, ...messages.filter(m => m.role !== 'system')];
        this.outputChannel.appendLine(`[${new Date().toISOString()}] DeepSeek agent mode starting with ${tools.length} tools`);
        while (continueLoop) {
            const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.deepseekApiKey}`
                },
                body: JSON.stringify({
                    model: config.deepseekModel,
                    messages: currentMessages,
                    tools: tools,
                    temperature: config.temperature,
                    max_tokens: config.maxTokens
                })
            });
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`DeepSeek API error: ${response.status} - ${error}`);
            }
            const json = await response.json();
            this.outputChannel.appendLine(`[${new Date().toISOString()}] DeepSeek response: ${JSON.stringify(json).substring(0, 500)}`);
            const choice = json.choices?.[0];
            const msg = choice?.message;
            if (!msg) {
                continueLoop = false;
                continue;
            }
            // Add assistant message to history
            currentMessages.push(msg);
            // Output text content
            if (msg.content) {
                fullResponse += msg.content;
                onChunk(msg.content, false);
            }
            // Handle tool calls
            if (msg.tool_calls && msg.tool_calls.length > 0) {
                for (const toolCall of msg.tool_calls) {
                    const name = toolCall.function.name;
                    let args = {};
                    try {
                        args = JSON.parse(toolCall.function.arguments || '{}');
                    }
                    catch (e) {
                        this.outputChannel.appendLine(`[${new Date().toISOString()}] Failed to parse tool args: ${toolCall.function.arguments}`);
                    }
                    onChunk(`\n[Calling ${name}...]\n`, false);
                    fullResponse += `\n[Calling ${name}...]\n`;
                    const result = await this.executeTool(name, args);
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
        this.saveAssistantMessage(fullResponse);
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
    // ========== Event-based streaming methods ==========
    async streamClaudeEvents(messages, onEvent, config) {
        if (!config.claudeApiKey) {
            throw new Error('Claude API key not configured');
        }
        if (!this.agentMode) {
            // Simple mode - just stream text
            const onChunk = (chunk, done) => {
                if (chunk)
                    onEvent({ type: 'text', content: chunk });
            };
            return this.claudeSimple(messages, onChunk, config);
        }
        return this.agentLoopClaude(messages, onEvent, config);
    }
    async streamOpenAIEvents(messages, onEvent, config) {
        if (!config.openaiApiKey) {
            throw new Error('OpenAI API key not configured');
        }
        if (!this.agentMode) {
            const onChunk = (chunk, done) => {
                if (chunk)
                    onEvent({ type: 'text', content: chunk });
            };
            return this.openaiSimple(messages, onChunk, config);
        }
        return this.agentLoopOpenAI(messages, onEvent, config);
    }
    async streamDeepSeekEvents(messages, onEvent, config) {
        if (!config.deepseekApiKey) {
            throw new Error('DeepSeek API key not configured');
        }
        if (!this.agentMode) {
            const onChunk = (chunk, done) => {
                if (chunk)
                    onEvent({ type: 'text', content: chunk });
            };
            return this.deepseekSimple(messages, onChunk, config);
        }
        return this.agentLoopOpenAI(messages, onEvent, config, 'deepseek');
    }
    async streamOllamaEvents(messages, onEvent, config) {
        if (!this.agentMode) {
            const onChunk = (chunk, done) => {
                if (chunk)
                    onEvent({ type: 'text', content: chunk });
            };
            return this.ollamaSimple(messages, onChunk, config);
        }
        return this.agentLoopOllama(messages, onEvent, config);
    }
    // Unified agent loop for OpenAI-compatible APIs (OpenAI, DeepSeek)
    async agentLoopOpenAI(messages, onEvent, config, provider = 'openai') {
        const baseUrl = provider === 'deepseek' ? 'https://api.deepseek.com/v1' : 'https://api.openai.com/v1';
        const apiKey = provider === 'deepseek' ? config.deepseekApiKey : config.openaiApiKey;
        const model = provider === 'deepseek' ? config.deepseekModel : config.openaiModel;
        const systemMsg = {
            role: 'system',
            content: `You are a coding assistant. Use the provided tools to complete tasks. Be concise.`
        };
        const tools = AGENT_TOOLS.map(t => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.input_schema }
        }));
        let fullResponse = '';
        let continueLoop = true;
        let currentMessages = [systemMsg, ...messages.filter(m => m.role !== 'system')];
        while (continueLoop) {
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model,
                    messages: currentMessages,
                    tools,
                    temperature: config.temperature,
                    max_tokens: config.maxTokens
                })
            });
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`${provider} error: ${response.status} - ${error}`);
            }
            const json = await response.json();
            const message = json.choices?.[0]?.message;
            if (!message) {
                continueLoop = false;
                continue;
            }
            currentMessages.push(message);
            if (message.content) {
                fullResponse += message.content;
                onEvent({ type: 'text', content: message.content });
            }
            if (message.tool_calls && message.tool_calls.length > 0) {
                for (const toolCall of message.tool_calls) {
                    const toolName = toolCall.function.name;
                    let toolInput = {};
                    try {
                        toolInput = JSON.parse(toolCall.function.arguments || '{}');
                    }
                    catch (e) { }
                    const startTime = Date.now();
                    onEvent({ type: 'tool_start', tool: { name: toolName, input: toolInput } });
                    this.outputChannel.appendLine(`[${new Date().toISOString()}] Tool: ${toolName} Input: ${JSON.stringify(toolInput)}`);
                    const result = await this.executeTool(toolName, toolInput);
                    const duration = Date.now() - startTime;
                    const success = !result.startsWith('Error');
                    onEvent({ type: 'tool_end', tool: { name: toolName, input: toolInput, result, success, duration } });
                    this.outputChannel.appendLine(`[${new Date().toISOString()}] Tool result (${duration}ms): ${result.substring(0, 200)}`);
                    currentMessages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: result
                    });
                }
            }
            else {
                continueLoop = false;
            }
        }
        this.saveAssistantMessage(fullResponse);
        return fullResponse;
    }
    async agentLoopClaude(messages, onEvent, config) {
        const systemMsg = `You are a coding assistant. Use the provided tools to complete tasks. Be concise.`;
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
                const error = await response.text();
                throw new Error(`Claude error: ${response.status} - ${error}`);
            }
            const data = await response.json();
            const toolUses = [];
            for (const block of data.content || []) {
                if (block.type === 'text') {
                    fullResponse += block.text;
                    onEvent({ type: 'text', content: block.text });
                }
                else if (block.type === 'tool_use') {
                    toolUses.push(block);
                }
            }
            if (toolUses.length > 0 && data.stop_reason === 'tool_use') {
                currentMessages.push({ role: 'assistant', content: data.content });
                const toolResults = [];
                for (const tool of toolUses) {
                    const startTime = Date.now();
                    onEvent({ type: 'tool_start', tool: { name: tool.name, input: tool.input } });
                    this.outputChannel.appendLine(`[${new Date().toISOString()}] Tool: ${tool.name} Input: ${JSON.stringify(tool.input)}`);
                    const result = await this.executeTool(tool.name, tool.input);
                    const duration = Date.now() - startTime;
                    const success = !result.startsWith('Error');
                    onEvent({ type: 'tool_end', tool: { name: tool.name, input: tool.input, result, success, duration } });
                    this.outputChannel.appendLine(`[${new Date().toISOString()}] Tool result (${duration}ms): ${result.substring(0, 200)}`);
                    toolResults.push({ type: 'tool_result', tool_use_id: tool.id, content: result });
                }
                currentMessages.push({ role: 'user', content: toolResults });
            }
            else {
                continueLoop = false;
            }
        }
        this.saveAssistantMessage(fullResponse);
        return fullResponse;
    }
    async agentLoopOllama(messages, onEvent, config) {
        const systemMsg = `You are a coding assistant. Use the provided tools to complete tasks.

IMPORTANT RULES:
- Each tool call that returns "Success" means the operation completed. Do NOT retry.
- After write_file returns "Success: Created/Modified [file]", the file is done. Move on.
- After completing all requested work, respond with a brief summary and STOP.
- Do not output raw JSON. Use the tools provided.`;
        const ollamaTools = AGENT_TOOLS.map(t => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.input_schema }
        }));
        let fullResponse = '';
        let continueLoop = true;
        let iterations = 0;
        const MAX_ITERATIONS = 3; // Prevent infinite loops
        let toolsExecuted = [];
        let currentMessages = [{ role: 'system', content: systemMsg }, ...messages.filter(m => m.role !== 'system')];
        // Helper to extract JSON tool call from content (handles multi-line)
        const parseToolCallFromContent = (content) => {
            if (!content)
                return null;
            // Try to find a JSON object with "name" and "arguments"
            const jsonMatch = content.match(/\{[\s\S]*?"name"\s*:\s*"([^"]+)"[\s\S]*?"arguments"\s*:\s*(\{[\s\S]*?\})\s*\}/);
            if (jsonMatch) {
                try {
                    const name = jsonMatch[1];
                    const args = JSON.parse(jsonMatch[2]);
                    return { name, arguments: args };
                }
                catch (e) {
                    // Try parsing the whole match
                    try {
                        const parsed = JSON.parse(jsonMatch[0]);
                        if (parsed.name && parsed.arguments) {
                            return { name: parsed.name, arguments: parsed.arguments };
                        }
                    }
                    catch (e2) { }
                }
            }
            return null;
        };
        // Helper to filter JSON tool calls from content (handles multi-line)
        const filterToolCallJson = (content) => {
            if (!content)
                return '';
            // Remove JSON blocks that look like tool calls (multi-line aware)
            let filtered = content.replace(/\{[\s\S]*?"name"\s*:\s*"[^"]+"[\s\S]*?"arguments"\s*:\s*\{[\s\S]*?\}\s*\}/g, '');
            // Clean up extra whitespace and leading/trailing }
            filtered = filtered.replace(/^\s*\}\s*/gm, '').trim();
            return filtered;
        };
        while (continueLoop && iterations < MAX_ITERATIONS) {
            iterations++;
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
            const msg = json.message;
            // Check if content contains a JSON tool call (some models do this)
            let toolCallsToExecute = [];
            let filteredContent = '';
            if (msg?.content) {
                const parsedTool = parseToolCallFromContent(msg.content);
                if (parsedTool) {
                    // Content is a tool call JSON - don't display it, execute it
                    toolCallsToExecute.push(parsedTool);
                }
                else {
                    // Filter any embedded tool call JSON from the content
                    filteredContent = filterToolCallJson(msg.content);
                    if (filteredContent) {
                        fullResponse += filteredContent;
                        onEvent({ type: 'text', content: filteredContent });
                    }
                }
            }
            // Add official tool_calls if present
            if (msg?.tool_calls && msg.tool_calls.length > 0) {
                for (const tc of msg.tool_calls) {
                    if (tc.function?.name && tc.function?.arguments) {
                        toolCallsToExecute.push({ name: tc.function.name, arguments: tc.function.arguments });
                    }
                }
            }
            // Execute all tool calls
            if (toolCallsToExecute.length > 0) {
                currentMessages.push(msg);
                for (const toolCall of toolCallsToExecute) {
                    const toolName = toolCall.name;
                    const toolInput = toolCall.arguments;
                    const startTime = Date.now();
                    onEvent({ type: 'tool_start', tool: { name: toolName, input: toolInput } });
                    this.outputChannel.appendLine(`[${new Date().toISOString()}] Tool: ${toolName} Input: ${JSON.stringify(toolInput)}`);
                    const result = await this.executeTool(toolName, toolInput);
                    const duration = Date.now() - startTime;
                    const success = !result.startsWith('Error');
                    onEvent({ type: 'tool_end', tool: { name: toolName, input: toolInput, result, success, duration } });
                    this.outputChannel.appendLine(`[${new Date().toISOString()}] Tool result (${duration}ms): ${result.substring(0, 200)}`);
                    toolsExecuted.push({ name: toolName, success });
                    currentMessages.push({ role: 'tool', content: result });
                }
            }
            else {
                continueLoop = false;
            }
        }
        // Generate summary
        if (toolsExecuted.length > 0) {
            const successCount = toolsExecuted.filter(t => t.success).length;
            const failCount = toolsExecuted.filter(t => !t.success).length;
            const summaryText = successCount === toolsExecuted.length
                ? `✅ Completed ${successCount} action${successCount > 1 ? 's' : ''} successfully`
                : `⚠️ ${successCount} succeeded, ${failCount} failed`;
            onEvent({ type: 'text', content: '\n\n' + summaryText });
            fullResponse += '\n\n' + summaryText;
        }
        if (iterations >= MAX_ITERATIONS) {
            const warningText = '\n\n⚠️ Stopped: Maximum iterations reached';
            onEvent({ type: 'text', content: warningText });
            fullResponse += warningText;
        }
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
            // Auto-update thread title with first user message
            if (message.role === 'user' && thread.messages.length === 1 && thread.name === 'New Chat') {
                // Truncate to first 50 characters
                const title = message.content.length > 50
                    ? message.content.substring(0, 50) + '...'
                    : message.content;
                thread.name = title;
            }
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
            thread.tasks = [];
            thread.edits = [];
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