import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

export interface AIMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
}

export interface Task {
    id: string;
    name: string;
    state: 'pending' | 'in_progress' | 'complete' | 'failed';
    parentId?: string;
    // Metrics
    startTime?: number;
    endTime?: number;
    tokensUsed?: number;
    error?: string;
}

export interface FileEdit {
    path: string;
    type: 'create' | 'modify' | 'delete';
    before?: string;
    after?: string;
    timestamp: number;
    // Staged edit support
    status: 'pending' | 'applied' | 'rejected';
}

export interface Thread {
    id: string;
    name: string;
    messages: AIMessage[];
    createdAt: number;
    updatedAt: number;
    editedFiles: string[];
    tasks: Task[];
    edits: FileEdit[];
}

export type StreamCallback = (chunk: string, done: boolean) => void;

// Rich event callback for agent mode - provides detailed status updates
export interface AgentEvent {
    type: 'text' | 'tool_start' | 'tool_end' | 'log' | 'summary';
    content?: string;
    tool?: {
        name: string;
        input?: any;
        result?: string;
        success?: boolean;
        duration?: number;
    };
    summary?: {
        success: boolean;
        tasksCompleted: number;
        tasksFailed: number;
        filesCreated: string[];
        filesModified: string[];
        errors: string[];
        duration: number;
    };
}
export type AgentEventCallback = (event: AgentEvent) => void;

export type Provider = 'claude' | 'openai' | 'ollama' | 'deepseek';

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
    },
    {
        name: 'get_diagnostics',
        description: 'Get IDE diagnostics (errors, warnings, hints) for files. Use to check for type errors, lint issues, or problems after editing.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Optional file or directory path. If not provided, returns diagnostics for all open files.' },
                severity: { type: 'string', enum: ['error', 'warning', 'info', 'hint', 'all'], description: 'Filter by severity (default: all)' }
            },
            required: []
        }
    },
    {
        name: 'find_references',
        description: 'Find all references/usages of a symbol at a specific location. Use to understand how a function, variable, or class is used across the codebase.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the file containing the symbol' },
                line: { type: 'number', description: 'Line number (1-based) where the symbol is located' },
                character: { type: 'number', description: 'Character/column position (0-based) of the symbol' }
            },
            required: ['path', 'line', 'character']
        }
    },
    {
        name: 'go_to_definition',
        description: 'Get the definition location of a symbol. Use to find where a function, class, or variable is defined.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the file containing the symbol' },
                line: { type: 'number', description: 'Line number (1-based) where the symbol is used' },
                character: { type: 'number', description: 'Character/column position (0-based) of the symbol' }
            },
            required: ['path', 'line', 'character']
        }
    },
    {
        name: 'get_file_symbols',
        description: 'Get all symbols (functions, classes, variables, etc.) defined in a file. Useful for understanding file structure.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the file to analyze' }
            },
            required: ['path']
        }
    },
    {
        name: 'web_search',
        description: 'Search the web for information using DuckDuckGo. Use for documentation, API references, error solutions, etc.',
        input_schema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query' },
                maxResults: { type: 'number', description: 'Maximum number of results (default: 5)' }
            },
            required: ['query']
        }
    },
    {
        name: 'rename_file',
        description: 'Rename or move a file to a new location.',
        input_schema: {
            type: 'object',
            properties: {
                oldPath: { type: 'string', description: 'Current path of the file' },
                newPath: { type: 'string', description: 'New path for the file' }
            },
            required: ['oldPath', 'newPath']
        }
    },
    {
        name: 'delete_file',
        description: 'Delete a file. Use with caution.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the file to delete' }
            },
            required: ['path']
        }
    },
    {
        name: 'create_directory',
        description: 'Create a new directory (including parent directories if needed).',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path of the directory to create' }
            },
            required: ['path']
        }
    },
    {
        name: 'get_hover_info',
        description: 'Get hover information (type info, documentation) for a symbol at a specific location.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the file' },
                line: { type: 'number', description: 'Line number (1-based)' },
                character: { type: 'number', description: 'Character/column position (0-based)' }
            },
            required: ['path', 'line', 'character']
        }
    },
    {
        name: 'open_file',
        description: 'Open a file in the VS Code editor, optionally at a specific line.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the file to open' },
                line: { type: 'number', description: 'Optional line number to jump to (1-based)' }
            },
            required: ['path']
        }
    },
    {
        name: 'get_open_files',
        description: 'Get a list of all currently open files in the editor.',
        input_schema: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'get_git_status',
        description: 'Get the current git status showing modified, staged, and untracked files.',
        input_schema: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'get_git_diff',
        description: 'Get the git diff for a file or all changes.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Optional file path. If not provided, shows diff for all changes.' },
                staged: { type: 'boolean', description: 'If true, show staged changes only (default: false)' }
            },
            required: []
        }
    },
    {
        name: 'apply_edit',
        description: 'Apply a precise text replacement in a file. More accurate than write_file for small edits.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the file to edit' },
                old_text: { type: 'string', description: 'Exact text to find and replace (must match exactly)' },
                new_text: { type: 'string', description: 'New text to replace with' }
            },
            required: ['path', 'old_text', 'new_text']
        }
    },
    {
        name: 'insert_text',
        description: 'Insert text at a specific line in a file.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the file' },
                line: { type: 'number', description: 'Line number after which to insert (0 = beginning of file)' },
                text: { type: 'string', description: 'Text to insert' }
            },
            required: ['path', 'line', 'text']
        }
    },
    {
        name: 'web_fetch',
        description: 'Fetch content from a URL and return it as text. Useful for reading documentation, APIs, etc.',
        input_schema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'The URL to fetch' },
                maxLength: { type: 'number', description: 'Maximum characters to return (default: 10000)' }
            },
            required: ['url']
        }
    },
    {
        name: 'show_message',
        description: 'Show a notification message to the user in VS Code.',
        input_schema: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'The message to display' },
                type: { type: 'string', enum: ['info', 'warning', 'error'], description: 'Message type (default: info)' }
            },
            required: ['message']
        }
    },
    {
        name: 'get_workspace_info',
        description: 'Get information about the current workspace including root path, open folders, and git info.',
        input_schema: {
            type: 'object',
            properties: {},
            required: []
        }
    }
];

export class AIService {
    private threads: Thread[] = [];
    private currentThreadId: string = '';
    private outputChannel: vscode.OutputChannel;
    private context: vscode.ExtensionContext;
    private agentMode: boolean = true;
    private static THREADS_KEY = 'threads';
    private static CURRENT_THREAD_KEY = 'currentThreadId';
    private static DRAFT_KEY = 'draftText';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.outputChannel = vscode.window.createOutputChannel('Forge');
        this.loadThreads();
    }

    setAgentMode(enabled: boolean) {
        this.agentMode = enabled;
    }

    isAgentMode(): boolean {
        return this.agentMode;
    }

    private loadThreads() {
        const saved = this.context.workspaceState.get<Thread[]>(AIService.THREADS_KEY);
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
        this.currentThreadId = this.context.workspaceState.get<string>(AIService.CURRENT_THREAD_KEY, '');

        // Create default thread if none exist
        if (this.threads.length === 0) {
            this.createThread('New Chat');
        } else if (!this.currentThreadId || !this.threads.find(t => t.id === this.currentThreadId)) {
            this.currentThreadId = this.threads[0].id;
        }
    }

    private async saveThreads() {
        await this.context.workspaceState.update(AIService.THREADS_KEY, this.threads);
        await this.context.workspaceState.update(AIService.CURRENT_THREAD_KEY, this.currentThreadId);
    }

    private getCurrentThread(): Thread | undefined {
        return this.threads.find(t => t.id === this.currentThreadId);
    }

    private get conversationHistory(): AIMessage[] {
        return this.getCurrentThread()?.messages || [];
    }

    createThread(name: string): Thread {
        const thread: Thread = {
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

    getTasks(): Task[] {
        return this.getCurrentThread()?.tasks || [];
    }

    getEdits(): FileEdit[] {
        return this.getCurrentThread()?.edits || [];
    }

    addTask(name: string, parentId?: string): Task {
        const thread = this.getCurrentThread();
        if (!thread) {
            throw new Error('No active thread');
        }
        const task: Task = {
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

    updateTask(taskId: string, state: Task['state'], error?: string): boolean {
        const thread = this.getCurrentThread();
        if (!thread) return false;
        const task = thread.tasks.find(t => t.id === taskId);
        if (!task) return false;

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
            } else {
                vscode.window.showErrorMessage(`Task failed: ${task.name} - ${error || 'Unknown error'}`);
            }
        }

        this.saveThreads();
        return true;
    }

    // Update task token count
    addTaskTokens(taskId: string, tokens: number): void {
        const thread = this.getCurrentThread();
        if (!thread) return;
        const task = thread.tasks.find(t => t.id === taskId);
        if (task) {
            task.tokensUsed = (task.tokensUsed || 0) + tokens;
            this.saveThreads();
        }
    }

    addFileEdit(filePath: string, type: FileEdit['type'], before?: string, after?: string, status: FileEdit['status'] = 'pending') {
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
    acceptEdit(editIndex: number): { success: boolean; message: string } {
        const thread = this.getCurrentThread();
        if (!thread) return { success: false, message: 'No active thread' };

        const edit = thread.edits[editIndex];
        if (!edit) return { success: false, message: 'Edit not found' };
        if (edit.status !== 'pending') return { success: false, message: 'Edit already processed' };

        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspacePath) return { success: false, message: 'No workspace open' };

        try {
            const filePath = path.join(workspacePath, edit.path);
            const dir = path.dirname(filePath);

            if (edit.type === 'delete') {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } else {
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(filePath, edit.after || '', 'utf-8');
            }

            edit.status = 'applied';
            this.saveThreads();
            vscode.window.showInformationMessage(`Applied: ${edit.path}`);
            return { success: true, message: `Applied: ${edit.path}` };
        } catch (err: any) {
            return { success: false, message: err.message };
        }
    }

    // Reject a pending edit - discard without writing
    rejectEdit(editIndex: number): { success: boolean; message: string } {
        const thread = this.getCurrentThread();
        if (!thread) return { success: false, message: 'No active thread' };

        const edit = thread.edits[editIndex];
        if (!edit) return { success: false, message: 'Edit not found' };
        if (edit.status !== 'pending') return { success: false, message: 'Edit already processed' };

        edit.status = 'rejected';
        this.saveThreads();
        vscode.window.showInformationMessage(`Rejected: ${edit.path}`);
        return { success: true, message: `Rejected: ${edit.path}` };
    }

    // Accept all pending edits
    acceptAllEdits(): { success: boolean; applied: number; failed: number } {
        const thread = this.getCurrentThread();
        if (!thread) return { success: false, applied: 0, failed: 0 };

        let applied = 0;
        let failed = 0;

        for (let i = 0; i < thread.edits.length; i++) {
            if (thread.edits[i].status === 'pending') {
                const result = this.acceptEdit(i);
                if (result.success) {
                    applied++;
                } else {
                    failed++;
                }
            }
        }

        vscode.window.showInformationMessage(`Applied ${applied} edits, ${failed} failed`);
        return { success: true, applied, failed };
    }

    // Reject all pending edits
    rejectAllEdits(): { success: boolean; rejected: number } {
        const thread = this.getCurrentThread();
        if (!thread) return { success: false, rejected: 0 };

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

    switchThread(threadId: string): boolean {
        const thread = this.threads.find(t => t.id === threadId);
        if (thread) {
            this.currentThreadId = threadId;
            this.saveThreads();
            return true;
        }
        return false;
    }

    deleteThread(threadId: string): boolean {
        const index = this.threads.findIndex(t => t.id === threadId);
        if (index === -1) return false;

        this.threads.splice(index, 1);

        // If deleted current thread, switch to another
        if (this.currentThreadId === threadId) {
            if (this.threads.length === 0) {
                this.createThread('New Chat');
            } else {
                this.currentThreadId = this.threads[0].id;
            }
        }
        this.saveThreads();
        return true;
    }

    renameThread(threadId: string, name: string): boolean {
        const thread = this.threads.find(t => t.id === threadId);
        if (thread) {
            thread.name = name;
            this.saveThreads();
            return true;
        }
        return false;
    }

    getThreads(): Thread[] {
        return this.threads;
    }

    getCurrentThreadId(): string {
        return this.currentThreadId;
    }

    getEditedFiles(): string[] {
        return this.getCurrentThread()?.editedFiles || [];
    }

    addEditedFile(filePath: string) {
        const thread = this.getCurrentThread();
        if (thread && !thread.editedFiles.includes(filePath)) {
            thread.editedFiles.push(filePath);
            this.saveThreads();
        }
    }

    saveDraft(text: string) {
        this.context.workspaceState.update(AIService.DRAFT_KEY + '_' + this.currentThreadId, text);
    }

    getDraft(): string {
        return this.context.workspaceState.get<string>(AIService.DRAFT_KEY + '_' + this.currentThreadId, '');
    }

    private getWorkspacePath(): string {
        const folders = vscode.workspace.workspaceFolders;
        return folders && folders.length > 0 ? folders[0].uri.fsPath : '';
    }

    private async executeTool(name: string, input: any): Promise<string> {
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
                    } catch (execError: any) {
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
                    const results: string[] = [];
                    const regex = new RegExp(input.pattern, 'gi');

                    const searchRecursive = (dir: string) => {
                        if (results.length >= maxResults) return;
                        const entries = fs.readdirSync(dir, { withFileTypes: true });
                        for (const entry of entries) {
                            if (results.length >= maxResults) break;
                            const fullPath = path.join(dir, entry.name);
                            const relativePath = path.relative(workspacePath, fullPath);

                            // Skip common non-code directories
                            if (entry.isDirectory()) {
                                if (['node_modules', '.git', 'dist', 'out', '.next', '__pycache__', 'venv', '.venv'].includes(entry.name)) {
                                    continue;
                                }
                                searchRecursive(fullPath);
                            } else if (entry.isFile()) {
                                // Check file pattern filter
                                if (input.filePattern) {
                                    const pattern = input.filePattern.replace(/\*/g, '.*');
                                    if (!new RegExp(pattern).test(entry.name)) continue;
                                }
                                // Skip binary and large files
                                const stats = fs.statSync(fullPath);
                                if (stats.size > 1024 * 1024) continue; // Skip files > 1MB

                                try {
                                    const content = fs.readFileSync(fullPath, 'utf-8');
                                    const lines = content.split('\n');
                                    lines.forEach((line, idx) => {
                                        if (results.length >= maxResults) return;
                                        if (regex.test(line)) {
                                            results.push(`${relativePath}:${idx + 1}: ${line.trim().substring(0, 200)}`);
                                        }
                                        regex.lastIndex = 0; // Reset regex state
                                    });
                                } catch (e) {
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
                case 'get_diagnostics': {
                    const severityMap: { [key: number]: string } = {
                        0: 'error',
                        1: 'warning',
                        2: 'info',
                        3: 'hint'
                    };
                    const severityFilter = input.severity || 'all';

                    let diagnostics: Array<{ file: string; line: number; severity: string; message: string }> = [];

                    // Get all diagnostics from VS Code
                    const allDiagnostics = vscode.languages.getDiagnostics();

                    for (const [uri, fileDiagnostics] of allDiagnostics) {
                        const relativePath = vscode.workspace.asRelativePath(uri);

                        // Filter by path if specified
                        if (input.path && !relativePath.startsWith(input.path)) {
                            continue;
                        }

                        for (const diag of fileDiagnostics) {
                            const severity = severityMap[diag.severity] || 'unknown';

                            // Filter by severity
                            if (severityFilter !== 'all' && severity !== severityFilter) {
                                continue;
                            }

                            diagnostics.push({
                                file: relativePath,
                                line: diag.range.start.line + 1,
                                severity,
                                message: diag.message
                            });
                        }
                    }

                    if (diagnostics.length === 0) {
                        return input.path
                            ? `No diagnostics found for "${input.path}"`
                            : 'No diagnostics found in workspace';
                    }

                    // Format output
                    const output = diagnostics.map(d =>
                        `${d.file}:${d.line} [${d.severity.toUpperCase()}] ${d.message}`
                    ).join('\n');

                    const summary = `Found ${diagnostics.length} diagnostic(s):\n`;
                    return summary + output;
                }
                case 'find_references': {
                    const filePath = path.join(workspacePath, input.path);
                    if (!fs.existsSync(filePath)) {
                        return `Error: File not found: ${input.path}`;
                    }

                    const uri = vscode.Uri.file(filePath);
                    const position = new vscode.Position(input.line - 1, input.character);

                    // Use VS Code's built-in find references
                    const locations = await vscode.commands.executeCommand<vscode.Location[]>(
                        'vscode.executeReferenceProvider',
                        uri,
                        position
                    );

                    if (!locations || locations.length === 0) {
                        return `No references found at ${input.path}:${input.line}:${input.character}`;
                    }

                    const results = locations.map(loc => {
                        const relativePath = vscode.workspace.asRelativePath(loc.uri);
                        const line = loc.range.start.line + 1;
                        const char = loc.range.start.character;
                        return `${relativePath}:${line}:${char}`;
                    });

                    return `Found ${locations.length} reference(s):\n${results.join('\n')}`;
                }
                case 'go_to_definition': {
                    const filePath = path.join(workspacePath, input.path);
                    if (!fs.existsSync(filePath)) {
                        return `Error: File not found: ${input.path}`;
                    }

                    const uri = vscode.Uri.file(filePath);
                    const position = new vscode.Position(input.line - 1, input.character);

                    // Use VS Code's built-in definition provider
                    const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
                        'vscode.executeDefinitionProvider',
                        uri,
                        position
                    );

                    if (!definitions || definitions.length === 0) {
                        return `No definition found at ${input.path}:${input.line}:${input.character}`;
                    }

                    // Return the first definition with some context
                    const def = definitions[0];
                    const defPath = vscode.workspace.asRelativePath(def.uri);
                    const defLine = def.range.start.line + 1;
                    const defChar = def.range.start.character;

                    // Try to read a few lines around the definition
                    let context = '';
                    try {
                        const defFilePath = def.uri.fsPath;
                        const content = fs.readFileSync(defFilePath, 'utf-8');
                        const lines = content.split('\n');
                        const startLine = Math.max(0, def.range.start.line - 2);
                        const endLine = Math.min(lines.length, def.range.start.line + 5);
                        context = '\n\nContext:\n' + lines.slice(startLine, endLine).map((l, i) =>
                            `${startLine + i + 1}: ${l}`
                        ).join('\n');
                    } catch (e) {
                        // Ignore read errors
                    }

                    return `Definition found at ${defPath}:${defLine}:${defChar}${context}`;
                }
                case 'get_file_symbols': {
                    const filePath = path.join(workspacePath, input.path);
                    if (!fs.existsSync(filePath)) {
                        return `Error: File not found: ${input.path}`;
                    }

                    const uri = vscode.Uri.file(filePath);

                    // Use VS Code's built-in document symbol provider
                    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                        'vscode.executeDocumentSymbolProvider',
                        uri
                    );

                    if (!symbols || symbols.length === 0) {
                        return `No symbols found in ${input.path}`;
                    }

                    const symbolKindNames: { [key: number]: string } = {
                        0: 'File', 1: 'Module', 2: 'Namespace', 3: 'Package',
                        4: 'Class', 5: 'Method', 6: 'Property', 7: 'Field',
                        8: 'Constructor', 9: 'Enum', 10: 'Interface', 11: 'Function',
                        12: 'Variable', 13: 'Constant', 14: 'String', 15: 'Number',
                        16: 'Boolean', 17: 'Array', 18: 'Object', 19: 'Key',
                        20: 'Null', 21: 'EnumMember', 22: 'Struct', 23: 'Event',
                        24: 'Operator', 25: 'TypeParameter'
                    };

                    const formatSymbol = (sym: vscode.DocumentSymbol, indent: string = ''): string => {
                        const kind = symbolKindNames[sym.kind] || 'Unknown';
                        const line = sym.range.start.line + 1;
                        let result = `${indent}${kind}: ${sym.name} (line ${line})`;

                        if (sym.children && sym.children.length > 0) {
                            for (const child of sym.children) {
                                result += '\n' + formatSymbol(child, indent + '  ');
                            }
                        }
                        return result;
                    };

                    const output = symbols.map(s => formatSymbol(s)).join('\n');
                    return `Symbols in ${input.path}:\n${output}`;
                }
                case 'web_search': {
                    const query = encodeURIComponent(input.query);
                    const maxResults = input.maxResults || 5;

                    // Use DuckDuckGo HTML search (no API key required)
                    const https = await import('https');

                    return new Promise((resolve) => {
                        const url = `https://html.duckduckgo.com/html/?q=${query}`;

                        const req = https.request(url, {
                            method: 'GET',
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                            }
                        }, (res) => {
                            let data = '';
                            res.on('data', (chunk: Buffer) => data += chunk.toString());
                            res.on('end', () => {
                                try {
                                    // Parse results from HTML
                                    const results: Array<{ title: string; url: string; snippet: string }> = [];

                                    // Match result blocks
                                    const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([^<]*)/g;
                                    let match;

                                    while ((match = resultRegex.exec(data)) !== null && results.length < maxResults) {
                                        results.push({
                                            url: match[1],
                                            title: match[2].trim(),
                                            snippet: match[3].trim()
                                        });
                                    }

                                    // Fallback: simpler regex if above doesn't match
                                    if (results.length === 0) {
                                        const linkRegex = /<a[^>]*class="result__url"[^>]*href="([^"]*)"[^>]*>/g;
                                        const titleRegex = /<a[^>]*class="result__a"[^>]*>([^<]*)<\/a>/g;

                                        const links: string[] = [];
                                        const titles: string[] = [];

                                        while ((match = linkRegex.exec(data)) !== null) {
                                            links.push(match[1]);
                                        }
                                        while ((match = titleRegex.exec(data)) !== null) {
                                            titles.push(match[1].trim());
                                        }

                                        for (let i = 0; i < Math.min(links.length, titles.length, maxResults); i++) {
                                            results.push({ url: links[i], title: titles[i], snippet: '' });
                                        }
                                    }

                                    if (results.length === 0) {
                                        resolve(`No results found for: ${input.query}`);
                                        return;
                                    }

                                    const output = results.map((r, i) =>
                                        `${i + 1}. ${r.title}\n   URL: ${r.url}${r.snippet ? '\n   ' + r.snippet : ''}`
                                    ).join('\n\n');

                                    resolve(`Search results for "${input.query}":\n\n${output}`);
                                } catch (e) {
                                    resolve(`Error parsing search results: ${e}`);
                                }
                            });
                        });

                        req.on('error', (e) => {
                            resolve(`Search error: ${e.message}`);
                        });

                        req.end();
                    });
                }
                case 'rename_file': {
                    const oldFilePath = path.join(workspacePath, input.oldPath);
                    const newFilePath = path.join(workspacePath, input.newPath);

                    if (!fs.existsSync(oldFilePath)) {
                        return `Error: File not found: ${input.oldPath}`;
                    }

                    if (fs.existsSync(newFilePath)) {
                        return `Error: Target file already exists: ${input.newPath}`;
                    }

                    // Ensure target directory exists
                    const targetDir = path.dirname(newFilePath);
                    if (!fs.existsSync(targetDir)) {
                        fs.mkdirSync(targetDir, { recursive: true });
                    }

                    fs.renameSync(oldFilePath, newFilePath);
                    return `Successfully renamed ${input.oldPath} to ${input.newPath}`;
                }
                case 'delete_file': {
                    const filePath = path.join(workspacePath, input.path);

                    if (!fs.existsSync(filePath)) {
                        return `Error: File not found: ${input.path}`;
                    }

                    const stat = fs.statSync(filePath);
                    if (stat.isDirectory()) {
                        return `Error: Cannot delete directory with this tool. Use for files only.`;
                    }

                    fs.unlinkSync(filePath);
                    return `Successfully deleted ${input.path}`;
                }
                case 'create_directory': {
                    const dirPath = path.join(workspacePath, input.path);

                    if (fs.existsSync(dirPath)) {
                        return `Directory already exists: ${input.path}`;
                    }

                    fs.mkdirSync(dirPath, { recursive: true });
                    return `Successfully created directory: ${input.path}`;
                }
                case 'get_hover_info': {
                    const filePath = path.join(workspacePath, input.path);
                    if (!fs.existsSync(filePath)) {
                        return `Error: File not found: ${input.path}`;
                    }

                    const uri = vscode.Uri.file(filePath);
                    const position = new vscode.Position(input.line - 1, input.character);

                    // Use VS Code's built-in hover provider
                    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
                        'vscode.executeHoverProvider',
                        uri,
                        position
                    );

                    if (!hovers || hovers.length === 0) {
                        return `No hover information at ${input.path}:${input.line}:${input.character}`;
                    }

                    // Extract text from hover contents
                    const contents: string[] = [];
                    for (const hover of hovers) {
                        for (const content of hover.contents) {
                            if (typeof content === 'string') {
                                contents.push(content);
                            } else if ('value' in content) {
                                contents.push(content.value);
                            }
                        }
                    }

                    return `Hover info at ${input.path}:${input.line}:${input.character}:\n\n${contents.join('\n\n')}`;
                }
                case 'open_file': {
                    const filePath = path.join(workspacePath, input.path);
                    if (!fs.existsSync(filePath)) {
                        return `Error: File not found: ${input.path}`;
                    }

                    const uri = vscode.Uri.file(filePath);
                    const doc = await vscode.workspace.openTextDocument(uri);
                    const editor = await vscode.window.showTextDocument(doc);

                    // Jump to line if specified
                    if (input.line) {
                        const line = Math.max(0, input.line - 1);
                        const position = new vscode.Position(line, 0);
                        editor.selection = new vscode.Selection(position, position);
                        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
                    }

                    return `Opened ${input.path}${input.line ? ` at line ${input.line}` : ''}`;
                }
                case 'get_open_files': {
                    const openFiles = vscode.workspace.textDocuments
                        .filter(doc => doc.uri.scheme === 'file')
                        .map(doc => {
                            const relativePath = vscode.workspace.asRelativePath(doc.uri);
                            const isDirty = doc.isDirty ? ' (unsaved)' : '';
                            return `${relativePath}${isDirty}`;
                        });

                    if (openFiles.length === 0) {
                        return 'No files currently open.';
                    }

                    return `Open files (${openFiles.length}):\n${openFiles.join('\n')}`;
                }
                case 'get_git_status': {
                    try {
                        const { execSync } = await import('child_process');
                        const result = execSync('git status --porcelain', {
                            cwd: workspacePath,
                            encoding: 'utf-8',
                            timeout: 10000
                        });

                        if (!result.trim()) {
                            return 'Working directory is clean. No changes to commit.';
                        }

                        // Parse porcelain format
                        const lines = result.trim().split('\n');
                        const staged: string[] = [];
                        const modified: string[] = [];
                        const untracked: string[] = [];

                        for (const line of lines) {
                            const index = line[0];
                            const worktree = line[1];
                            const file = line.substring(3);

                            if (index === '?' && worktree === '?') {
                                untracked.push(file);
                            } else if (index !== ' ' && index !== '?') {
                                staged.push(`${index} ${file}`);
                            }
                            if (worktree !== ' ' && worktree !== '?') {
                                modified.push(`${worktree} ${file}`);
                            }
                        }

                        let output = 'Git Status:\n';
                        if (staged.length > 0) {
                            output += `\nStaged (${staged.length}):\n${staged.map(f => '  ' + f).join('\n')}\n`;
                        }
                        if (modified.length > 0) {
                            output += `\nModified (${modified.length}):\n${modified.map(f => '  ' + f).join('\n')}\n`;
                        }
                        if (untracked.length > 0) {
                            output += `\nUntracked (${untracked.length}):\n${untracked.map(f => '  ' + f).join('\n')}\n`;
                        }

                        return output;
                    } catch (e: any) {
                        return `Error getting git status: ${e.message}`;
                    }
                }
                case 'get_git_diff': {
                    try {
                        const { execSync } = await import('child_process');
                        let cmd = 'git diff';
                        if (input.staged) {
                            cmd += ' --staged';
                        }
                        if (input.path) {
                            cmd += ` -- "${input.path}"`;
                        }

                        const result = execSync(cmd, {
                            cwd: workspacePath,
                            encoding: 'utf-8',
                            timeout: 30000,
                            maxBuffer: 1024 * 1024 * 5 // 5MB
                        });

                        if (!result.trim()) {
                            return input.staged
                                ? 'No staged changes.'
                                : 'No unstaged changes.';
                        }

                        return result;
                    } catch (e: any) {
                        return `Error getting git diff: ${e.message}`;
                    }
                }
                case 'apply_edit': {
                    const filePath = path.join(workspacePath, input.path);
                    if (!fs.existsSync(filePath)) {
                        return `Error: File not found: ${input.path}`;
                    }

                    const content = fs.readFileSync(filePath, 'utf-8');

                    if (!content.includes(input.old_text)) {
                        return `Error: Could not find the text to replace. Make sure old_text matches exactly.`;
                    }

                    // Check for multiple occurrences
                    const occurrences = content.split(input.old_text).length - 1;
                    if (occurrences > 1) {
                        return `Error: Found ${occurrences} occurrences of the text. Please provide more context to make the match unique.`;
                    }

                    const newContent = content.replace(input.old_text, input.new_text);
                    fs.writeFileSync(filePath, newContent);

                    return `Successfully applied edit to ${input.path}`;
                }
                case 'insert_text': {
                    const filePath = path.join(workspacePath, input.path);
                    if (!fs.existsSync(filePath)) {
                        return `Error: File not found: ${input.path}`;
                    }

                    const content = fs.readFileSync(filePath, 'utf-8');
                    const lines = content.split('\n');

                    const insertLine = Math.max(0, Math.min(input.line, lines.length));
                    lines.splice(insertLine, 0, input.text);

                    fs.writeFileSync(filePath, lines.join('\n'));

                    return `Successfully inserted text after line ${input.line} in ${input.path}`;
                }
                case 'web_fetch': {
                    const https = await import('https');
                    const http = await import('http');
                    const maxLength = input.maxLength || 10000;

                    return new Promise((resolve) => {
                        const urlObj = new URL(input.url);
                        const protocol = urlObj.protocol === 'https:' ? https : http;

                        const req = protocol.request(input.url, {
                            method: 'GET',
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                            },
                            timeout: 30000
                        }, (res) => {
                            // Handle redirects
                            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                                resolve(`Redirect to: ${res.headers.location}`);
                                return;
                            }

                            let data = '';
                            res.on('data', (chunk: Buffer) => {
                                data += chunk.toString();
                                // Stop if we've exceeded max length
                                if (data.length > maxLength * 2) {
                                    req.destroy();
                                }
                            });
                            res.on('end', () => {
                                // Basic HTML to text conversion
                                let text = data
                                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                                    .replace(/<[^>]+>/g, ' ')
                                    .replace(/\s+/g, ' ')
                                    .trim();

                                if (text.length > maxLength) {
                                    text = text.substring(0, maxLength) + '\n\n... (truncated)';
                                }

                                resolve(`Content from ${input.url}:\n\n${text}`);
                            });
                        });

                        req.on('error', (e) => {
                            resolve(`Error fetching URL: ${e.message}`);
                        });

                        req.on('timeout', () => {
                            req.destroy();
                            resolve('Error: Request timed out');
                        });

                        req.end();
                    });
                }
                case 'show_message': {
                    const messageType = input.type || 'info';

                    switch (messageType) {
                        case 'error':
                            vscode.window.showErrorMessage(input.message);
                            break;
                        case 'warning':
                            vscode.window.showWarningMessage(input.message);
                            break;
                        default:
                            vscode.window.showInformationMessage(input.message);
                    }

                    return `Displayed ${messageType} message: "${input.message}"`;
                }
                case 'get_workspace_info': {
                    const folders = vscode.workspace.workspaceFolders || [];
                    const info: string[] = [];

                    info.push(`Workspace Name: ${vscode.workspace.name || 'Untitled'}`);
                    info.push(`Root Path: ${workspacePath}`);
                    info.push(`Open Folders (${folders.length}):`);
                    for (const folder of folders) {
                        info.push(`  - ${folder.name}: ${folder.uri.fsPath}`);
                    }

                    // Get git info
                    try {
                        const { execSync } = await import('child_process');
                        const branch = execSync('git rev-parse --abbrev-ref HEAD', {
                            cwd: workspacePath,
                            encoding: 'utf-8',
                            timeout: 5000
                        }).trim();

                        const remote = execSync('git remote get-url origin', {
                            cwd: workspacePath,
                            encoding: 'utf-8',
                            timeout: 5000
                        }).trim();

                        const lastCommit = execSync('git log -1 --format="%h %s"', {
                            cwd: workspacePath,
                            encoding: 'utf-8',
                            timeout: 5000
                        }).trim();

                        info.push(`\nGit Info:`);
                        info.push(`  Branch: ${branch}`);
                        info.push(`  Remote: ${remote}`);
                        info.push(`  Last Commit: ${lastCommit}`);
                    } catch (e) {
                        info.push(`\nGit: Not a git repository or git not available`);
                    }

                    // Get some file stats
                    try {
                        const { execSync } = await import('child_process');
                        const fileCount = execSync('git ls-files | wc -l', {
                            cwd: workspacePath,
                            encoding: 'utf-8',
                            timeout: 10000,
                            shell: 'cmd'
                        }).trim();
                        info.push(`  Tracked Files: ${fileCount}`);
                    } catch (e) {
                        // Ignore
                    }

                    return info.join('\n');
                }
                default:
                    return `Error: Unknown tool: ${name}`;
            }
        } catch (err: any) {
            return `Error: ${err.message}`;
        }
    }

    private getConfig() {
        const config = vscode.workspace.getConfiguration('forge');
        return {
            provider: config.get<Provider>('provider', 'claude'),
            claudeApiKey: config.get<string>('claudeApiKey', ''),
            openaiApiKey: config.get<string>('openaiApiKey', ''),
            deepseekApiKey: config.get<string>('deepseekApiKey', ''),
            claudeModel: config.get<string>('claudeModel', 'claude-sonnet-4-20250514'),
            openaiModel: config.get<string>('openaiModel', 'gpt-4o'),
            deepseekModel: config.get<string>('deepseekModel', 'deepseek-chat'),
            ollamaUrl: config.get<string>('ollamaUrl', 'http://localhost:11434'),
            ollamaModel: config.get<string>('ollamaModel', 'qwen2.5-coder:7b'),
            temperature: config.get<number>('temperature', 0.7),
            maxTokens: config.get<number>('maxTokens', 2048),
            includeFileContext: config.get<boolean>('includeFileContext', true)
        };
    }

    // Models known to support tool calling
    private static TOOL_SUPPORTED_OLLAMA_MODELS = [
        'llama3.1', 'llama3.2', 'llama3.3',
        'mistral', 'mixtral',
        'qwen2.5', 'qwen2',
        'command-r', 'command-r-plus',
        'firefunction',
        'smollm2'
    ];

    getToolSupport(): { supported: boolean; reason?: string } {
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

    private getFileContext(): string {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return '';

        const config = this.getConfig();
        if (!config.includeFileContext) return '';

        const fileName = editor.document.fileName;
        const language = editor.document.languageId;
        const lines = editor.document.getText().split('\n').slice(0, 300);
        const content = lines.join('\n');
        const truncated = editor.document.lineCount > 300 ? '\n... (truncated)' : '';

        return `\n\nCurrent file:\nFile: ${fileName}\nLanguage: ${language}\n\`\`\`${language}\n${content}${truncated}\n\`\`\``;
    }

    async sendMessageStream(message: string, includeContext: boolean, onChunk: StreamCallback): Promise<string> {
        // Wrapper that converts old callback to new event-based callback
        const onEvent: AgentEventCallback = (event) => {
            if (event.type === 'text') {
                onChunk(event.content || '', false);
            } else if (event.type === 'tool_start') {
                onChunk(`\n⚡ ${this.getToolDisplayName(event.tool?.name || '')}...\n`, false);
            } else if (event.type === 'tool_end') {
                const status = event.tool?.success ? '✓' : '✗';
                onChunk(`${status} Done\n`, false);
            } else if (event.type === 'summary') {
                // Show summary
                const s = event.summary;
                if (s) {
                    const lines = ['\n---\n'];
                    if (s.success) {
                        lines.push(`✅ **Completed** (${(s.duration / 1000).toFixed(1)}s)\n`);
                    } else {
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

    async sendMessageStreamWithEvents(
        message: string,
        includeContext: boolean,
        onEvent: AgentEventCallback,
        onChunk: StreamCallback
    ): Promise<string> {
        const startTime = Date.now();
        const config = this.getConfig();

        // Track what happens during this request
        const tracking = {
            filesCreated: [] as string[],
            filesModified: [] as string[],
            errors: [] as string[],
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
        const wrappedOnEvent: AgentEventCallback = (event) => {
            onEvent(event);

            // Track file operations
            if (event.type === 'tool_end' && event.tool) {
                if (event.tool.name === 'write_file' && event.tool.success) {
                    const filePath = event.tool.input?.path;
                    if (filePath) {
                        // Check if file existed before
                        if (event.tool.input?._wasCreate) {
                            tracking.filesCreated.push(filePath);
                        } else {
                            tracking.filesModified.push(filePath);
                        }
                    }
                }
                if (event.tool.name === 'update_task' && event.tool.success) {
                    const state = event.tool.input?.state;
                    if (state === 'complete') tracking.tasksCompleted++;
                    if (state === 'failed') tracking.tasksFailed++;
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
        } catch (error: any) {
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
                } catch (ollamaError: any) {
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

    private getToolDisplayName(toolName: string): string {
        const names: Record<string, string> = {
            'read_file': 'Reading file',
            'write_file': 'Writing file',
            'list_files': 'Listing files',
            'add_task': 'Creating task',
            'update_task': 'Updating task'
        };
        return names[toolName] || toolName;
    }

    private async streamWithProviderEvents(provider: Provider, messages: any[], onEvent: AgentEventCallback, config: any): Promise<string> {
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

    private async streamWithProvider(provider: Provider, messages: any[], onChunk: StreamCallback, config: any): Promise<string> {
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

    private async streamClaude(messages: any[], onChunk: StreamCallback, config: any): Promise<string> {
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

    private async claudeSimple(messages: any[], onChunk: StreamCallback, config: any): Promise<string> {
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
        if (!reader) throw new Error('No response body');

        let fullResponse = '';
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

            for (const line of lines) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;
                try {
                    const json = JSON.parse(data);
                    if (json.type === 'content_block_delta' && json.delta?.text) {
                        fullResponse += json.delta.text;
                        onChunk(json.delta.text, false);
                    }
                } catch {}
            }
        }

        onChunk('', true);
        this.saveAssistantMessage(fullResponse);
        return fullResponse;
    }

    private async claudeWithTools(messages: any[], onChunk: StreamCallback, config: any, systemMsg: string): Promise<string> {
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

            const data: any = await response.json();

            // Process response content
            let textContent = '';
            let toolUses: any[] = [];

            for (const block of data.content || []) {
                if (block.type === 'text') {
                    textContent += block.text;
                    onChunk(block.text, false);
                    fullResponse += block.text;
                } else if (block.type === 'tool_use') {
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
            } else {
                continueLoop = false;
            }
        }

        onChunk('', true);
        return fullResponse;
    }

    private async streamOpenAI(messages: any[], onChunk: StreamCallback, config: any): Promise<string> {
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

    private async openaiSimple(messages: any[], onChunk: StreamCallback, config: any): Promise<string> {
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
        if (!reader) throw new Error('No response body');

        let fullResponse = '';
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

            for (const line of lines) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;
                try {
                    const json = JSON.parse(data);
                    const content = json.choices?.[0]?.delta?.content;
                    if (content) {
                        fullResponse += content;
                        onChunk(content, false);
                    }
                } catch {}
            }
        }

        onChunk('', true);
        this.saveAssistantMessage(fullResponse);
        return fullResponse;
    }

    private async openaiWithTools(messages: any[], onChunk: StreamCallback, config: any, systemMsg: any, tools: any[]): Promise<string> {
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

            const data: any = await response.json();
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
            } else {
                continueLoop = false;
            }
        }

        onChunk('', true);
        return fullResponse;
    }

    private async streamDeepSeek(messages: any[], onChunk: StreamCallback, config: any): Promise<string> {
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

    private async deepseekSimple(messages: any[], onChunk: StreamCallback, config: any): Promise<string> {
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
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let fullResponse = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(line => line.trim().startsWith('data: '));

            for (const line of lines) {
                const data = line.replace('data: ', '');
                if (data === '[DONE]') continue;

                try {
                    const json = JSON.parse(data);
                    const content = json.choices?.[0]?.delta?.content || '';
                    if (content) {
                        fullResponse += content;
                        onChunk(content, false);
                    }
                } catch (e) {
                    // Skip invalid JSON
                }
            }
        }

        onChunk('', true);
        this.saveAssistantMessage(fullResponse);
        return fullResponse;
    }

    private async deepseekWithTools(messages: any[], onChunk: StreamCallback, config: any, systemMsg: any, tools: any[]): Promise<string> {
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

            const json: any = await response.json();
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
                    let args: any = {};
                    try {
                        args = JSON.parse(toolCall.function.arguments || '{}');
                    } catch (e) {
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
            } else {
                continueLoop = false;
            }
        }

        onChunk('', true);
        this.saveAssistantMessage(fullResponse);
        return fullResponse;
    }

    private async streamOllama(messages: any[], onChunk: StreamCallback, config: any): Promise<string> {
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

            const json: any = await response.json();
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
            } else {
                continueLoop = false;
            }
        }

        onChunk('', true);
        this.saveAssistantMessage(fullResponse);
        return fullResponse;
    }

    private async ollamaSimple(messages: any[], onChunk: StreamCallback, config: any): Promise<string> {
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
        if (!reader) throw new Error('No response body');

        let fullResponse = '';
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const lines = decoder.decode(value, { stream: true }).split('\n').filter(l => l.trim());
            for (const line of lines) {
                try {
                    const json = JSON.parse(line);
                    if (json.message?.content) {
                        fullResponse += json.message.content;
                        onChunk(json.message.content, false);
                    }
                    if (json.done) onChunk('', true);
                } catch {}
            }
        }

        this.saveAssistantMessage(fullResponse);
        return fullResponse;
    }

    private async processSSEStream(response: Response, onChunk: StreamCallback, provider: 'claude' | 'openai'): Promise<string> {
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        let fullResponse = '';
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                    const json = JSON.parse(data);
                    let content = '';

                    if (provider === 'claude') {
                        if (json.type === 'content_block_delta') {
                            content = json.delta?.text || '';
                        }
                    } else {
                        content = json.choices?.[0]?.delta?.content || '';
                    }

                    if (content) {
                        fullResponse += content;
                        onChunk(content, false);
                    }
                } catch {}
            }
        }

        onChunk('', true);
        this.saveAssistantMessage(fullResponse);
        return fullResponse;
    }

    // ========== Event-based streaming methods ==========

    private async streamClaudeEvents(messages: any[], onEvent: AgentEventCallback, config: any): Promise<string> {
        if (!config.claudeApiKey) {
            throw new Error('Claude API key not configured');
        }

        if (!this.agentMode) {
            // Simple mode - just stream text
            const onChunk: StreamCallback = (chunk, done) => {
                if (chunk) onEvent({ type: 'text', content: chunk });
            };
            return this.claudeSimple(messages, onChunk, config);
        }

        return this.agentLoopClaude(messages, onEvent, config);
    }

    private async streamOpenAIEvents(messages: any[], onEvent: AgentEventCallback, config: any): Promise<string> {
        if (!config.openaiApiKey) {
            throw new Error('OpenAI API key not configured');
        }

        if (!this.agentMode) {
            const onChunk: StreamCallback = (chunk, done) => {
                if (chunk) onEvent({ type: 'text', content: chunk });
            };
            return this.openaiSimple(messages, onChunk, config);
        }

        return this.agentLoopOpenAI(messages, onEvent, config);
    }

    private async streamDeepSeekEvents(messages: any[], onEvent: AgentEventCallback, config: any): Promise<string> {
        if (!config.deepseekApiKey) {
            throw new Error('DeepSeek API key not configured');
        }

        if (!this.agentMode) {
            const onChunk: StreamCallback = (chunk, done) => {
                if (chunk) onEvent({ type: 'text', content: chunk });
            };
            return this.deepseekSimple(messages, onChunk, config);
        }

        return this.agentLoopOpenAI(messages, onEvent, config, 'deepseek');
    }

    private async streamOllamaEvents(messages: any[], onEvent: AgentEventCallback, config: any): Promise<string> {
        if (!this.agentMode) {
            const onChunk: StreamCallback = (chunk, done) => {
                if (chunk) onEvent({ type: 'text', content: chunk });
            };
            return this.ollamaSimple(messages, onChunk, config);
        }

        return this.agentLoopOllama(messages, onEvent, config);
    }

    // Unified agent loop for OpenAI-compatible APIs (OpenAI, DeepSeek)
    private async agentLoopOpenAI(messages: any[], onEvent: AgentEventCallback, config: any, provider: 'openai' | 'deepseek' = 'openai'): Promise<string> {
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

            const json: any = await response.json();
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
                    let toolInput: any = {};
                    try {
                        toolInput = JSON.parse(toolCall.function.arguments || '{}');
                    } catch (e) {}

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
            } else {
                continueLoop = false;
            }
        }

        this.saveAssistantMessage(fullResponse);
        return fullResponse;
    }

    private async agentLoopClaude(messages: any[], onEvent: AgentEventCallback, config: any): Promise<string> {
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

            const data: any = await response.json();
            const toolUses = [];

            for (const block of data.content || []) {
                if (block.type === 'text') {
                    fullResponse += block.text;
                    onEvent({ type: 'text', content: block.text });
                } else if (block.type === 'tool_use') {
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
            } else {
                continueLoop = false;
            }
        }

        this.saveAssistantMessage(fullResponse);
        return fullResponse;
    }

    private async agentLoopOllama(messages: any[], onEvent: AgentEventCallback, config: any): Promise<string> {
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
        let toolsExecuted: Array<{ name: string; success: boolean }> = [];
        let currentMessages = [{ role: 'system', content: systemMsg }, ...messages.filter(m => m.role !== 'system')];

        // Helper to extract JSON tool call from content (handles multi-line)
        const parseToolCallFromContent = (content: string): { name: string; arguments: any } | null => {
            if (!content) return null;
            // Try to find a JSON object with "name" and "arguments"
            const jsonMatch = content.match(/\{[\s\S]*?"name"\s*:\s*"([^"]+)"[\s\S]*?"arguments"\s*:\s*(\{[\s\S]*?\})\s*\}/);
            if (jsonMatch) {
                try {
                    const name = jsonMatch[1];
                    const args = JSON.parse(jsonMatch[2]);
                    return { name, arguments: args };
                } catch (e) {
                    // Try parsing the whole match
                    try {
                        const parsed = JSON.parse(jsonMatch[0]);
                        if (parsed.name && parsed.arguments) {
                            return { name: parsed.name, arguments: parsed.arguments };
                        }
                    } catch (e2) {}
                }
            }
            return null;
        };

        // Helper to filter JSON tool calls from content (handles multi-line)
        const filterToolCallJson = (content: string): string => {
            if (!content) return '';
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

            const json: any = await response.json();
            const msg = json.message;

            // Check if content contains a JSON tool call (some models do this)
            let toolCallsToExecute: Array<{ name: string; arguments: any }> = [];
            let filteredContent = '';

            if (msg?.content) {
                const parsedTool = parseToolCallFromContent(msg.content);
                if (parsedTool) {
                    // Content is a tool call JSON - don't display it, execute it
                    toolCallsToExecute.push(parsedTool);
                } else {
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
            } else {
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

    private saveAssistantMessage(content: string) {
        this.addMessage({ role: 'assistant', content, timestamp: Date.now() });
    }

    private addMessage(message: AIMessage) {
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

    async sendMessage(message: string, includeContext: boolean = false): Promise<string> {
        return new Promise((resolve, reject) => {
            let result = '';
            this.sendMessageStream(message, includeContext, (chunk, done) => {
                result += chunk;
                if (done) resolve(result);
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

    getHistory(): AIMessage[] { return this.conversationHistory; }

    async checkHealth(): Promise<{ provider: string; status: boolean }> {
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
            await axios.get(`${config.ollamaUrl}/api/tags`, { timeout: 2000 });
            return { provider: 'Ollama (local)', status: true };
        } catch {
            return { provider: 'None', status: false };
        }
    }
}

