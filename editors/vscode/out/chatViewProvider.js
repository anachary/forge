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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatViewProvider = void 0;
const vscode = __importStar(require("vscode"));
class ChatViewProvider {
    constructor(_extensionUri, _aiService) {
        this._extensionUri = _extensionUri;
        this._aiService = _aiService;
    }
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    this._aiService.saveDraft('');
                    await this._handleSendMessage(data.message);
                    break;
                case 'clearChat':
                    this.clearChat();
                    break;
                case 'getSettings':
                    this._sendCurrentSettings();
                    break;
                case 'saveSettings':
                    await this._saveSettings(data.settings);
                    break;
                case 'ready':
                    this._sendThreads();
                    this._restoreChatHistory();
                    this._restoreDraft();
                    this._checkHealthWithUI();
                    break;
                case 'saveDraft':
                    this._aiService.saveDraft(data.text);
                    break;
                case 'newThread':
                    console.log('[ChatViewProvider] Creating new thread:', data.name);
                    this._aiService.createThread(data.name || 'New Chat');
                    this._sendThreads();
                    this._view?.webview.postMessage({ type: 'clearChat' });
                    break;
                case 'switchThread':
                    this._aiService.switchThread(data.threadId);
                    this._sendThreads();
                    this._view?.webview.postMessage({ type: 'clearChat' });
                    this._restoreChatHistory();
                    this._restoreDraft();
                    break;
                case 'deleteThread':
                    this._aiService.deleteThread(data.threadId);
                    this._sendThreads();
                    this._view?.webview.postMessage({ type: 'clearChat' });
                    this._restoreChatHistory();
                    break;
                case 'renameThread':
                    this._aiService.renameThread(data.threadId, data.name);
                    this._sendThreads();
                    break;
                case 'setAgentMode':
                    this._aiService.setAgentMode(data.enabled);
                    break;
                case 'fetchOllamaModels':
                    this._fetchOllamaModels();
                    break;
                case 'acceptEdit':
                    this._aiService.acceptEdit(data.index);
                    this._sendThreads();
                    break;
                case 'rejectEdit':
                    this._aiService.rejectEdit(data.index);
                    this._sendThreads();
                    break;
                case 'acceptAllEdits':
                    this._aiService.acceptAllEdits();
                    this._sendThreads();
                    break;
                case 'rejectAllEdits':
                    this._aiService.rejectAllEdits();
                    this._sendThreads();
                    break;
                case 'openFile':
                    this._openFileInEditor(data.path, data.line);
                    break;
            }
        });
    }
    async _fetchOllamaModels() {
        const config = vscode.workspace.getConfiguration('forge');
        const ollamaUrl = config.get('ollamaUrl', 'http://localhost:11434');
        try {
            const response = await fetch(`${ollamaUrl}/api/tags`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            const models = (data.models || []).map((m) => ({
                name: m.name,
                size: this._formatSize(m.size)
            }));
            this._view?.webview.postMessage({ type: 'ollamaModels', models });
        }
        catch (err) {
            this._view?.webview.postMessage({
                type: 'ollamaModels',
                error: 'Could not connect to Ollama at ' + ollamaUrl
            });
        }
    }
    _formatSize(bytes) {
        if (bytes >= 1e9)
            return (bytes / 1e9).toFixed(1) + ' GB';
        if (bytes >= 1e6)
            return (bytes / 1e6).toFixed(1) + ' MB';
        return bytes + ' B';
    }
    _sendThreads() {
        const threads = this._aiService.getThreads();
        const currentId = this._aiService.getCurrentThreadId();
        const editedFiles = this._aiService.getEditedFiles();
        const tasks = this._aiService.getTasks();
        const edits = this._aiService.getEdits();
        this._view?.webview.postMessage({
            type: 'threads',
            threads: threads.map(t => ({ id: t.id, name: t.name, updatedAt: t.updatedAt })),
            currentThreadId: currentId,
            editedFiles,
            tasks,
            edits
        });
    }
    _restoreDraft() {
        const draft = this._aiService.getDraft();
        if (draft) {
            this._view?.webview.postMessage({ type: 'restoreDraft', text: draft });
        }
    }
    _restoreChatHistory() {
        const history = this._aiService.getHistory();
        history.forEach(msg => {
            this._view?.webview.postMessage({
                type: msg.role === 'user' ? 'userMessage' : 'aiMessage',
                message: msg.content
            });
        });
    }
    async _checkHealthWithUI() {
        const health = await this._aiService.checkHealth();
        const config = vscode.workspace.getConfiguration('forge');
        const provider = config.get('provider', 'claude');
        if (health.status) {
            const fallback = provider !== 'ollama' ? ' (Ollama fallback available)' : '';
            this._view?.webview.postMessage({
                type: 'systemMessage',
                message: `Ready. Using ${health.provider}${fallback}`
            });
        }
        else {
            this._view?.webview.postMessage({
                type: 'systemMessage',
                message: 'No AI configured. Add API key in Settings or run: ollama serve'
            });
        }
    }
    async _handleSendMessage(message) {
        if (!message.trim())
            return;
        // Show user message
        this._view?.webview.postMessage({ type: 'userMessage', message });
        // Start streaming AI response
        this._view?.webview.postMessage({ type: 'startAiMessage' });
        // Show progress in status bar
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: 'AI processing...',
            cancellable: false
        }, async () => {
            try {
                let lastRefresh = Date.now();
                // Event callback for rich events (tool status, logs)
                const onEvent = (event) => {
                    if (event.type === 'tool_start' && event.tool) {
                        this._view?.webview.postMessage({
                            type: 'toolStart',
                            tool: { name: event.tool.name, input: event.tool.input }
                        });
                    }
                    else if (event.type === 'tool_end' && event.tool) {
                        this._view?.webview.postMessage({
                            type: 'toolEnd',
                            tool: {
                                name: event.tool.name,
                                result: event.tool.result,
                                success: event.tool.success,
                                duration: event.tool.duration
                            }
                        });
                        // Refresh tasks/edits after tool execution
                        this._sendThreads();
                    }
                    else if (event.type === 'log') {
                        this._view?.webview.postMessage({
                            type: 'logInfo',
                            message: event.content
                        });
                    }
                    else if (event.type === 'text' && event.content) {
                        this._view?.webview.postMessage({ type: 'streamChunk', chunk: event.content });
                    }
                };
                // Chunk callback for done signal
                const onChunk = (chunk, done) => {
                    if (chunk) {
                        this._view?.webview.postMessage({ type: 'streamChunk', chunk });
                        // Refresh tasks/edits periodically
                        if (Date.now() - lastRefresh > 500) {
                            this._sendThreads();
                            lastRefresh = Date.now();
                        }
                    }
                    if (done) {
                        this._view?.webview.postMessage({ type: 'endAiMessage' });
                        this._sendThreads();
                    }
                };
                await this._aiService.sendMessageStreamWithEvents(message, true, onEvent, onChunk);
            }
            catch (error) {
                this._view?.webview.postMessage({
                    type: 'streamChunk',
                    chunk: `\n\nError: ${error.message}`
                });
                this._view?.webview.postMessage({ type: 'endAiMessage' });
            }
        });
    }
    sendMessage(message) {
        this._handleSendMessage(message);
    }
    clearChat() {
        this._aiService.clearHistory();
        this._view?.webview.postMessage({ type: 'clearChat' });
    }
    async _openFileInEditor(filePath, line) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }
        const fullPath = vscode.Uri.joinPath(workspaceFolder.uri, filePath);
        try {
            const document = await vscode.workspace.openTextDocument(fullPath);
            const editor = await vscode.window.showTextDocument(document, {
                preview: false,
                viewColumn: vscode.ViewColumn.One
            });
            // If line number provided, go to that line
            if (line && line > 0) {
                const position = new vscode.Position(line - 1, 0);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
            }
        }
        catch (err) {
            vscode.window.showErrorMessage(`Could not open file: ${filePath}`);
        }
    }
    _sendCurrentSettings() {
        const config = vscode.workspace.getConfiguration('forge');
        const toolSupport = this._aiService.getToolSupport();
        this._view?.webview.postMessage({
            type: 'settings',
            settings: {
                provider: config.get('provider', 'claude'),
                claudeApiKey: config.get('claudeApiKey', ''),
                claudeModel: config.get('claudeModel', 'claude-sonnet-4-20250514'),
                openaiApiKey: config.get('openaiApiKey', ''),
                openaiModel: config.get('openaiModel', 'gpt-4o'),
                deepseekApiKey: config.get('deepseekApiKey', ''),
                deepseekModel: config.get('deepseekModel', 'deepseek-chat'),
                ollamaUrl: config.get('ollamaUrl', 'http://localhost:11434'),
                ollamaModel: config.get('ollamaModel', 'qwen2.5-coder:7b')
            },
            toolSupport
        });
    }
    async _saveSettings(settings) {
        const config = vscode.workspace.getConfiguration('forge');
        try {
            // Always save provider
            await config.update('provider', settings.provider, vscode.ConfigurationTarget.Global);
            // Always save API keys (even if empty to allow clearing)
            await config.update('claudeApiKey', settings.claudeApiKey || '', vscode.ConfigurationTarget.Global);
            await config.update('claudeModel', settings.claudeModel || 'claude-sonnet-4-20250514', vscode.ConfigurationTarget.Global);
            await config.update('openaiApiKey', settings.openaiApiKey || '', vscode.ConfigurationTarget.Global);
            await config.update('openaiModel', settings.openaiModel || 'gpt-4o', vscode.ConfigurationTarget.Global);
            await config.update('deepseekApiKey', settings.deepseekApiKey || '', vscode.ConfigurationTarget.Global);
            await config.update('deepseekModel', settings.deepseekModel || 'deepseek-chat', vscode.ConfigurationTarget.Global);
            await config.update('ollamaUrl', settings.ollamaUrl || 'http://localhost:11434', vscode.ConfigurationTarget.Global);
            await config.update('ollamaModel', settings.ollamaModel || 'qwen2.5-coder:7b', vscode.ConfigurationTarget.Global);
            const providerName = settings.provider === 'claude' ? 'Claude' : settings.provider === 'openai' ? 'OpenAI' : settings.provider === 'deepseek' ? 'DeepSeek' : 'Ollama';
            this._view?.webview.postMessage({ type: 'settingsSaved', success: true, provider: settings.provider });
            this._view?.webview.postMessage({ type: 'systemMessage', message: `Settings saved. Using ${providerName}` });
        }
        catch (error) {
            this._view?.webview.postMessage({ type: 'settingsSaved', success: false, error: error.message });
        }
    }
    _getHtmlForWebview(webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Forge</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: var(--vscode-font-family); font-size: 13px; color: var(--vscode-foreground); background: var(--vscode-editor-background); height: 100vh; display: flex; flex-direction: column; }
        #header { padding: 8px 12px; background: var(--vscode-sideBarSectionHeader-background); border-bottom: 1px solid var(--vscode-panel-border); display: flex; justify-content: space-between; align-items: center; }
        #header h3 { font-size: 12px; font-weight: 600; opacity: 0.9; display: flex; align-items: center; gap: 6px; }
        .header-btns { display: flex; gap: 8px; }
        .header-btn { background: none; border: none; color: var(--vscode-foreground); cursor: pointer; opacity: 0.6; font-size: 11px; padding: 4px 8px; border-radius: 4px; }
        .header-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
        #chat { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
        .msg { padding: 10px 12px; border-radius: 6px; max-width: 95%; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }
        .user { background: var(--vscode-button-background); color: var(--vscode-button-foreground); align-self: flex-end; border-radius: 12px 12px 2px 12px; }
        .ai { background: var(--vscode-editor-inactiveSelectionBackground); align-self: flex-start; border-radius: 12px 12px 12px 2px; }
        .system { background: var(--vscode-editorInfo-background); font-size: 11px; padding: 6px 10px; opacity: 0.8; text-align: center; align-self: center; border-radius: 4px; }
        .streaming { border-left: 2px solid var(--vscode-progressBar-background); animation: pulse 1s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
        /* Tool call cards - Augment style */
        .tool-call { display: flex; align-items: center; gap: 8px; padding: 8px 12px; margin: 4px 0; background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 6px; font-size: 12px; border-left: 3px solid var(--vscode-notificationsInfoIcon-foreground); }
        .tool-call.success { border-left-color: var(--vscode-testing-iconPassed); }
        .tool-call.error { border-left-color: var(--vscode-errorForeground); }
        .tool-call.running { animation: pulse 1s infinite; }
        .tool-icon { font-size: 14px; opacity: 0.8; }
        .tool-name { font-weight: 500; color: var(--vscode-foreground); }
        .tool-detail { opacity: 0.7; margin-left: 4px; font-family: monospace; font-size: 11px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tool-status { margin-left: auto; font-size: 10px; opacity: 0.6; }
        .tool-status-icon { margin-left: auto; }
        .tool-status-icon.success { color: var(--vscode-testing-iconPassed); }
        .tool-status-icon.error { color: var(--vscode-errorForeground); }
        .tool-status-icon.running { color: var(--vscode-notificationsInfoIcon-foreground); }
        pre { background: var(--vscode-textCodeBlock-background); padding: 8px; border-radius: 4px; overflow-x: auto; margin: 6px 0; font-size: 12px; }
        code { font-family: var(--vscode-editor-font-family); }
        #input-area { padding: 10px; border-top: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background); }
        #input-row { display: flex; gap: 6px; }
        #input { flex: 1; padding: 8px 10px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 6px; font-family: inherit; font-size: 13px; resize: none; min-height: 34px; max-height: 100px; }
        #input:focus { outline: none; border-color: var(--vscode-focusBorder); }
        #send { padding: 8px 14px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 6px; cursor: pointer; font-weight: 500; }
        #send:hover { background: var(--vscode-button-hoverBackground); }
        #send:disabled { opacity: 0.5; cursor: not-allowed; }
        /* Settings Panel */
        #settings-panel { display: none; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: var(--vscode-editor-background); z-index: 100; flex-direction: column; }
        #settings-panel.open { display: flex; }
        .settings-header { padding: 12px; background: var(--vscode-sideBarSectionHeader-background); border-bottom: 1px solid var(--vscode-panel-border); display: flex; justify-content: space-between; align-items: center; }
        .settings-header h3 { font-size: 13px; }
        .settings-content { flex: 1; overflow-y: auto; padding: 16px; }
        .setting-group { margin-bottom: 20px; }
        .setting-group label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; color: var(--vscode-foreground); }
        .setting-group small { display: block; font-size: 11px; opacity: 0.7; margin-top: 4px; }
        .setting-group select, .setting-group input { width: 100%; padding: 8px 10px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; font-family: inherit; font-size: 13px; }
        .setting-group select:focus, .setting-group input:focus { outline: none; border-color: var(--vscode-focusBorder); }
        .model-select-row { display: flex; gap: 8px; }
        .model-select-row select { flex: 1; }
        .btn-small { padding: 6px 10px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 4px; cursor: pointer; font-size: 11px; }
        .btn-small:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .status-text { font-size: 11px; margin-top: 4px; opacity: 0.7; }
        .status-text.error { color: var(--vscode-errorForeground); opacity: 1; }
        .provider-section { padding: 12px; background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 6px; margin-top: 12px; }
        .provider-section.hidden { display: none; }
        .provider-section h4 { font-size: 12px; margin-bottom: 12px; color: var(--vscode-foreground); }
        .settings-footer { padding: 12px; border-top: 1px solid var(--vscode-panel-border); display: flex; gap: 8px; justify-content: flex-end; }
        .btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
        .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
        .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
        .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        .provider-badge { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; margin-left: 6px; }
        .badge-claude { background: #d97706; color: white; }
        .badge-openai { background: #10a37f; color: white; }
        .badge-ollama { background: #6366f1; color: white; }
        /* Threads */
        #threads-panel { display: none; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: var(--vscode-editor-background); z-index: 90; flex-direction: column; }
        #threads-panel.open { display: flex; }
        .threads-header { padding: 12px; background: var(--vscode-sideBarSectionHeader-background); border-bottom: 1px solid var(--vscode-panel-border); display: flex; justify-content: space-between; align-items: center; }
        .threads-list { flex: 1; overflow-y: auto; padding: 8px; }
        .thread-item { padding: 10px; margin: 4px 0; border-radius: 6px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: var(--vscode-list-inactiveSelectionBackground); }
        .thread-item:hover { background: var(--vscode-list-hoverBackground); }
        .thread-item.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
        .thread-name { flex: 1; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .thread-delete { opacity: 0.5; padding: 2px 6px; font-size: 11px; cursor: pointer; }
        .thread-delete:hover { opacity: 1; background: var(--vscode-errorForeground); color: white; border-radius: 3px; }
        /* Top tabs */
        #top-tabs { display: flex; background: var(--vscode-sideBarSectionHeader-background); border-bottom: 1px solid var(--vscode-panel-border); }
        .top-tab { flex: 1; padding: 8px 12px; font-size: 12px; border: none; background: transparent; color: var(--vscode-foreground); cursor: pointer; opacity: 0.6; text-align: center; border-bottom: 2px solid transparent; }
        .top-tab:hover { opacity: 0.9; background: var(--vscode-list-hoverBackground); }
        .top-tab.active { opacity: 1; border-bottom-color: var(--vscode-focusBorder); }
        .tab-badge { font-size: 10px; opacity: 0.7; margin-left: 4px; }
        .tab-badge.add { color: var(--vscode-testing-iconPassed); }
        .tab-badge.del { color: var(--vscode-errorForeground); }
        /* Tab content */
        #tab-content { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }
        .tab-pane { display: none; flex: 1; overflow-y: auto; }
        .tab-pane.active { display: flex; flex-direction: column; }
        /* Tasks pane */
        #tasks-pane { padding: 12px; }
        .task-item { display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; }
        .task-checkbox { width: 16px; height: 16px; border: 1px solid var(--vscode-foreground); border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; margin-top: 2px; }
        .task-checkbox.pending { opacity: 0.4; }
        .task-checkbox.in_progress { border-color: var(--vscode-notificationsInfoIcon-foreground); color: var(--vscode-notificationsInfoIcon-foreground); }
        .task-checkbox.complete { background: var(--vscode-testing-iconPassed); border-color: var(--vscode-testing-iconPassed); color: white; }
        .task-checkbox.failed { background: var(--vscode-errorForeground); border-color: var(--vscode-errorForeground); color: white; }
        .task-content { flex: 1; }
        .task-name { font-size: 12px; display: block; }
        .task-name.complete { opacity: 0.6; text-decoration: line-through; }
        .task-name.failed { color: var(--vscode-errorForeground); }
        .task-metrics { font-size: 10px; opacity: 0.6; margin-top: 2px; }
        .task-time { margin-right: 8px; }
        .task-tokens { color: var(--vscode-notificationsInfoIcon-foreground); }
        .task-error { font-size: 10px; color: var(--vscode-errorForeground); margin-top: 2px; }
        .subtask { margin-left: 24px; }
        .no-tasks { opacity: 0.5; font-size: 12px; padding: 20px; text-align: center; }
        /* Edits pane */
        #edits-pane { padding: 8px; }
        .bulk-actions { display: flex; gap: 8px; margin-bottom: 8px; padding: 8px; background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 6px; }
        .accept-all-btn, .reject-all-btn { flex: 1; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
        .accept-all-btn { background: var(--vscode-testing-iconPassed); color: white; }
        .reject-all-btn { background: var(--vscode-errorForeground); color: white; }
        .edit-item { padding: 10px; margin: 4px 0; border-radius: 6px; background: var(--vscode-list-inactiveSelectionBackground); cursor: pointer; }
        .edit-item:hover { background: var(--vscode-list-hoverBackground); }
        .edit-item.applied { opacity: 0.6; border-left: 3px solid var(--vscode-testing-iconPassed); }
        .edit-item.rejected { opacity: 0.5; border-left: 3px solid var(--vscode-errorForeground); }
        .edit-header { display: flex; align-items: center; justify-content: space-between; }
        .edit-path { font-size: 12px; font-weight: 500; }
        .status-badge { font-size: 9px; padding: 2px 6px; border-radius: 3px; text-transform: uppercase; }
        .status-badge.pending { background: var(--vscode-notificationsWarningIcon-foreground); color: white; }
        .status-badge.applied { background: var(--vscode-testing-iconPassed); color: white; }
        .status-badge.rejected { background: var(--vscode-errorForeground); color: white; }
        .edit-meta { font-size: 10px; opacity: 0.7; margin-top: 4px; }
        .edit-add { color: var(--vscode-testing-iconPassed); }
        .edit-del { color: var(--vscode-errorForeground); }
        .pending-count { color: var(--vscode-notificationsWarningIcon-foreground); }
        .edit-actions { display: flex; gap: 6px; margin-top: 8px; }
        .accept-btn, .reject-btn, .open-btn { padding: 4px 10px; border: none; border-radius: 3px; cursor: pointer; font-size: 11px; }
        .accept-btn { background: var(--vscode-testing-iconPassed); color: white; }
        .reject-btn { background: var(--vscode-errorForeground); color: white; }
        .open-btn { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        .open-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .edit-path { cursor: pointer; }
        .edit-path:hover { color: var(--vscode-textLink-foreground); text-decoration: underline; }
        .diff-view { margin-top: 8px; padding: 8px; background: var(--vscode-editor-background); border-radius: 4px; font-family: monospace; font-size: 11px; white-space: pre-wrap; max-height: 200px; overflow-y: auto; display: none; }
        .diff-view.open { display: block; }
        .diff-add { color: var(--vscode-testing-iconPassed); }
        .diff-del { color: var(--vscode-errorForeground); }
        .no-edits { opacity: 0.5; font-size: 12px; padding: 20px; text-align: center; }
        /* Logs pane */
        #logs-pane { padding: 8px; }
        #logs-list { font-family: monospace; font-size: 11px; }
        .log-entry { padding: 4px 8px; border-radius: 3px; margin: 2px 0; }
        .log-entry.tool-start { background: var(--vscode-editorInfo-background); border-left: 3px solid var(--vscode-notificationsInfoIcon-foreground); }
        .log-entry.tool-end { background: var(--vscode-editor-inactiveSelectionBackground); }
        .log-entry.tool-end.success { border-left: 3px solid var(--vscode-testing-iconPassed); }
        .log-entry.tool-end.error { border-left: 3px solid var(--vscode-errorForeground); }
        .log-entry.info { opacity: 0.7; }
        .log-time { opacity: 0.5; margin-right: 8px; }
        .log-tool { font-weight: bold; color: var(--vscode-textLink-foreground); }
        .log-result { margin-left: 16px; opacity: 0.8; white-space: pre-wrap; max-height: 100px; overflow-y: auto; }
        .log-clear-btn { padding: 4px 8px; font-size: 11px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 3px; cursor: pointer; margin-bottom: 8px; }
        .no-logs { opacity: 0.5; font-size: 12px; padding: 20px; text-align: center; }
        /* Image drop zone */
        #image-drop-zone { border: 2px dashed var(--vscode-panel-border); border-radius: 8px; padding: 20px; text-align: center; margin: 8px 12px; background: var(--vscode-input-background); }
        #image-drop-zone.active { border-color: var(--vscode-button-background); background: var(--vscode-button-background); opacity: 0.3; }
        #image-drop-zone.hidden { display: none; }
        #image-preview { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--vscode-input-background); margin: 0 12px 8px 12px; border-radius: 4px; }
        #image-preview.hidden { display: none; }
        #preview-img { max-width: 60px; max-height: 60px; border-radius: 4px; }
        #remove-image { background: var(--vscode-errorForeground); color: white; border: none; border-radius: 50%; width: 20px; height: 20px; cursor: pointer; font-size: 12px; }
        /* Bottom bar */
        #bottom-bar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--vscode-sideBarSectionHeader-background); border-top: 1px solid var(--vscode-panel-border); flex-wrap: wrap; }
        .mode-switch { display: flex; align-items: center; gap: 6px; }
        .mode-switch.disabled { opacity: 0.4; pointer-events: none; }
        .switch { position: relative; width: 32px; height: 18px; background: var(--vscode-input-background); border-radius: 9px; cursor: pointer; border: 1px solid var(--vscode-panel-border); }
        .switch.on { background: var(--vscode-button-background); }
        .switch-knob { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; background: var(--vscode-foreground); border-radius: 50%; transition: left 0.15s; }
        .switch.on .switch-knob { left: 16px; }
        .mode-label { font-size: 11px; opacity: 0.8; }
        #provider-info { margin-left: auto; font-size: 11px; opacity: 0.6; }
        #tool-warning { width: 100%; font-size: 10px; color: var(--vscode-editorWarning-foreground); display: none; margin-top: 4px; }
        #tool-warning.show { display: block; }
    </style>
</head>
<body>
    <div id="header">
        <h3>Forge <span id="provider-badge" class="provider-badge"></span></h3>
        <div class="header-btns">
            <button class="header-btn" id="threads-btn">Threads</button>
            <button class="header-btn" id="settings-btn">Settings</button>
            <button class="header-btn" id="clear-btn">Clear</button>
        </div>
    </div>
    <div id="top-tabs">
        <button class="top-tab active" data-tab="chat">Thread</button>
        <button class="top-tab" data-tab="tasks">Tasks <span class="tab-badge" id="tasks-count"></span></button>
        <button class="top-tab" data-tab="edits">Edits <span class="tab-badge" id="edits-stats"></span></button>
        <button class="top-tab" data-tab="logs">Logs</button>
    </div>
    <div id="tab-content">
        <div id="chat-pane" class="tab-pane active">
            <div id="chat"></div>
        </div>
        <div id="tasks-pane" class="tab-pane">
            <div id="tasks-list"></div>
        </div>
        <div id="edits-pane" class="tab-pane">
            <div id="edits-list"></div>
        </div>
        <div id="logs-pane" class="tab-pane">
            <div id="logs-list"></div>
        </div>
    </div>
    <div id="input-area">
        <div id="image-drop-zone" class="hidden">
            <span>Drop image here to generate code</span>
        </div>
        <div id="image-preview" class="hidden">
            <img id="preview-img" />
            <button id="remove-image">x</button>
        </div>
        <div id="input-row">
            <textarea id="input" placeholder="Ask anything... (drop image to generate code)" rows="1"></textarea>
            <button id="send">Send</button>
        </div>
    </div>
    <div id="bottom-bar">
        <div class="mode-switch" id="agent-switch-container">
            <div class="switch on" id="agent-switch"><div class="switch-knob"></div></div>
            <span class="mode-label">Agent</span>
        </div>
        <div class="mode-switch" id="auto-switch-container" title="Auto mode: auto-apply edits and execute commands">
            <div class="switch on" id="auto-switch"><div class="switch-knob"></div></div>
            <span class="mode-label">Auto</span>
        </div>
        <span id="provider-info"></span>
        <span id="tool-warning"></span>
    </div>

    <div id="settings-panel">
        <div class="settings-header">
            <h3>Settings</h3>
            <button class="header-btn" id="close-settings">Close</button>
        </div>
        <div class="settings-content">
            <div class="setting-group">
                <label>Provider</label>
                <select id="s-provider">
                    <option value="claude">Claude</option>
                    <option value="openai">OpenAI</option>
                    <option value="deepseek">DeepSeek</option>
                    <option value="ollama">Ollama (local)</option>
                </select>
                <small>Claude/OpenAI/DeepSeek are cloud. Ollama is local fallback.</small>
            </div>

            <div class="provider-section" id="claude-settings">
                <h4>Claude</h4>
                <div class="setting-group">
                    <label>API Key</label>
                    <input type="password" id="s-claude-key" placeholder="sk-ant-...">
                    <small>console.anthropic.com</small>
                </div>
                <div class="setting-group">
                    <label>Model</label>
                    <select id="s-claude-model">
                        <option value="claude-sonnet-4-20250514">claude-sonnet-4</option>
                        <option value="claude-3-5-sonnet-20241022">claude-3.5-sonnet</option>
                        <option value="claude-3-haiku-20240307">claude-3-haiku</option>
                    </select>
                </div>
            </div>

            <div class="provider-section hidden" id="openai-settings">
                <h4>OpenAI</h4>
                <div class="setting-group">
                    <label>API Key</label>
                    <input type="password" id="s-openai-key" placeholder="sk-proj-...">
                    <small>platform.openai.com</small>
                </div>
                <div class="setting-group">
                    <label>Model</label>
                    <select id="s-openai-model">
                        <option value="gpt-4o">gpt-4o</option>
                        <option value="gpt-4o-mini">gpt-4o-mini</option>
                        <option value="gpt-4-turbo">gpt-4-turbo</option>
                        <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
                    </select>
                </div>
            </div>

            <div class="provider-section hidden" id="deepseek-settings">
                <h4>DeepSeek</h4>
                <div class="setting-group">
                    <label>API Key</label>
                    <input type="password" id="s-deepseek-key" placeholder="sk-...">
                    <small>platform.deepseek.com</small>
                </div>
                <div class="setting-group">
                    <label>Model</label>
                    <select id="s-deepseek-model">
                        <option value="deepseek-chat">deepseek-chat</option>
                        <option value="deepseek-coder">deepseek-coder</option>
                    </select>
                </div>
            </div>

            <div class="provider-section hidden" id="ollama-settings">
                <h4>Ollama</h4>
                <div class="setting-group">
                    <label>URL</label>
                    <input type="text" id="s-ollama-url" value="http://localhost:11434">
                </div>
                <div class="setting-group">
                    <label>Model</label>
                    <div class="model-select-row">
                        <select id="s-ollama-model"><option value="">Loading...</option></select>
                        <button class="btn-small" id="refresh-ollama-models">Refresh</button>
                    </div>
                    <div id="ollama-status" class="status-text"></div>
                </div>
            </div>
        </div>
        <div class="settings-footer">
            <button class="btn btn-secondary" id="cancel-settings">Cancel</button>
            <button class="btn btn-primary" id="save-settings">Save</button>
        </div>
    </div>

    <div id="threads-panel">
        <div class="threads-header">
            <h3>Threads</h3>
            <div>
                <button class="header-btn" id="new-thread-btn">New</button>
                <button class="header-btn" id="close-threads">Close</button>
            </div>
        </div>
        <div class="threads-list" id="threads-list"></div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const chat = document.getElementById('chat');
        const input = document.getElementById('input');
        const send = document.getElementById('send');
        const settingsPanel = document.getElementById('settings-panel');
        let currentAiMsg = null;
        let isStreaming = false;
        let currentSettings = {};
        let agentModeEnabled = true;
        let autoModeEnabled = true;
        let pendingImage = null;  // Base64 image data

        // Image drag/drop handling
        const dropZone = document.getElementById('image-drop-zone');
        const imagePreview = document.getElementById('image-preview');
        const previewImg = document.getElementById('preview-img');
        const removeImageBtn = document.getElementById('remove-image');
        const inputArea = document.getElementById('input-area');

        inputArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (e.dataTransfer.types.includes('Files')) {
                dropZone.classList.remove('hidden');
                dropZone.classList.add('active');
            }
        });

        inputArea.addEventListener('dragleave', (e) => {
            if (!inputArea.contains(e.relatedTarget)) {
                dropZone.classList.add('hidden');
                dropZone.classList.remove('active');
            }
        });

        inputArea.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.add('hidden');
            dropZone.classList.remove('active');

            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    pendingImage = ev.target.result;
                    previewImg.src = pendingImage;
                    imagePreview.classList.remove('hidden');
                    input.placeholder = 'Describe what to build from this image...';
                };
                reader.readAsDataURL(file);
            }
        });

        removeImageBtn.addEventListener('click', () => {
            pendingImage = null;
            imagePreview.classList.add('hidden');
            input.placeholder = 'Ask anything... (drop image to generate code)';
        });

        // Tab switching
        const tabs = document.querySelectorAll('.top-tab');
        const panes = document.querySelectorAll('.tab-pane');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                panes.forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(tab.dataset.tab + '-pane').classList.add('active');
            });
        });

        // Agent mode switch
        const agentSwitch = document.getElementById('agent-switch');
        const autoSwitchContainer = document.getElementById('auto-switch-container');
        agentSwitch.addEventListener('click', () => {
            agentModeEnabled = !agentModeEnabled;
            agentSwitch.classList.toggle('on', agentModeEnabled);
            autoSwitchContainer.style.display = agentModeEnabled ? 'flex' : 'none';
            vscode.postMessage({ type: 'setAgentMode', enabled: agentModeEnabled && autoModeEnabled });
        });

        // Auto mode switch (controls both file edits and command execution)
        const autoSwitch = document.getElementById('auto-switch');
        autoSwitch.addEventListener('click', () => {
            autoModeEnabled = !autoModeEnabled;
            autoSwitch.classList.toggle('on', autoModeEnabled);
            vscode.postMessage({ type: 'setAgentMode', enabled: agentModeEnabled && autoModeEnabled });
            vscode.postMessage({ type: 'setAutoMode', enabled: autoModeEnabled });
        });

        // Input handling
        input.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 100) + 'px';
        });
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
        });
        send.addEventListener('click', sendMsg);
        document.getElementById('clear-btn').addEventListener('click', () => vscode.postMessage({ type: 'clearChat' }));

        // Threads panel
        const threadsPanel = document.getElementById('threads-panel');
        const threadsList = document.getElementById('threads-list');
        let threads = [];
        let currentThreadId = '';

        document.getElementById('threads-btn').addEventListener('click', () => {
            console.log('Opening threads panel');
            threadsPanel.classList.add('open');
        });
        document.getElementById('close-threads').addEventListener('click', () => threadsPanel.classList.remove('open'));
        document.getElementById('new-thread-btn').addEventListener('click', () => {
            console.log('Creating new thread');
            vscode.postMessage({ type: 'newThread', name: 'New Chat' });
            threadsPanel.classList.remove('open');
        });

        function renderThreads() {
            threadsList.innerHTML = threads.map(t =>
                '<div class="thread-item' + (t.id === currentThreadId ? ' active' : '') + '" data-id="' + t.id + '">' +
                '<span class="thread-name">' + t.name + '</span>' +
                '<span class="thread-delete" data-id="' + t.id + '">x</span>' +
                '</div>'
            ).join('');

            threadsList.querySelectorAll('.thread-item').forEach(el => {
                el.addEventListener('click', e => {
                    if (e.target.classList.contains('thread-delete')) return;
                    vscode.postMessage({ type: 'switchThread', threadId: el.dataset.id });
                    threadsPanel.classList.remove('open');
                });
            });
            threadsList.querySelectorAll('.thread-delete').forEach(el => {
                el.addEventListener('click', e => {
                    e.stopPropagation();
                    if (threads.length > 1) {
                        vscode.postMessage({ type: 'deleteThread', threadId: el.dataset.id });
                    }
                });
            });
        }

        // Edits display
        const editsList = document.getElementById('edits-list');
        const editsStats = document.getElementById('edits-stats');
        let edits = [];

        function renderEdits() {
            if (edits.length === 0) {
                editsList.innerHTML = '<div class="no-edits">No file edits yet</div>';
                editsStats.innerHTML = '';
                return;
            }
            // Calculate stats
            let addLines = 0, delLines = 0;
            const pendingCount = edits.filter(e => e.status === 'pending').length;
            edits.forEach(e => {
                const beforeLines = (e.before || '').split(/\\r?\\n/).length;
                const afterLines = (e.after || '').split(/\\r?\\n/).length;
                if (e.type === 'create') addLines += afterLines;
                else {
                    addLines += Math.max(0, afterLines - beforeLines);
                    delLines += Math.max(0, beforeLines - afterLines);
                }
            });
            editsStats.innerHTML = '<span class="add">+' + addLines + '</span> <span class="del">-' + delLines + '</span>' +
                (pendingCount > 0 ? ' <span class="pending-count">(' + pendingCount + ' pending)</span>' : '');

            // Add accept/reject all buttons if there are pending edits
            const bulkActions = pendingCount > 0 ?
                '<div class="bulk-actions">' +
                '<button class="accept-all-btn">Accept All</button>' +
                '<button class="reject-all-btn">Reject All</button>' +
                '</div>' : '';

            editsList.innerHTML = bulkActions + edits.map((e, i) => {
                const filename = e.path.split(/[\\\\/]/).pop();
                const beforeLen = (e.before || '').split(/\\r?\\n/).length;
                const afterLen = (e.after || '').split(/\\r?\\n/).length;
                const addCount = e.type === 'create' ? afterLen : Math.max(0, afterLen - beforeLen);
                const delCount = e.type === 'create' ? 0 : Math.max(0, beforeLen - afterLen);
                const statusClass = e.status || 'applied';
                const statusBadge = e.status === 'applied' ? '<span class="status-badge applied">Applied</span>' :
                                   e.status === 'rejected' ? '<span class="status-badge rejected">Rejected</span>' :
                                   '<span class="status-badge pending">Pending</span>';
                const actionBtns = e.status === 'pending' ?
                    '<div class="edit-actions">' +
                    '<button class="open-btn" data-path="' + e.path + '">Open</button>' +
                    '<button class="accept-btn" data-idx="' + i + '">Accept</button>' +
                    '<button class="reject-btn" data-idx="' + i + '">Reject</button>' +
                    '</div>' :
                    '<div class="edit-actions">' +
                    '<button class="open-btn" data-path="' + e.path + '">Open</button>' +
                    '</div>';
                return '<div class="edit-item ' + statusClass + '" data-idx="' + i + '" data-path="' + e.path + '">' +
                    '<div class="edit-header">' +
                    '<div class="edit-path" title="Click to open in editor">' + filename + '</div>' +
                    statusBadge +
                    '</div>' +
                    '<div class="edit-meta"><span class="edit-add">+' + addCount + '</span> <span class="edit-del">-' + delCount + '</span></div>' +
                    actionBtns +
                    '<div class="diff-view" id="diff-' + i + '"></div>' +
                    '</div>';
            }).join('');

            // Click on edit item to show diff
            editsList.querySelectorAll('.edit-item').forEach(el => {
                el.addEventListener('click', (e) => {
                    // Don't toggle if clicking on action buttons
                    if (e.target.classList.contains('accept-btn') || e.target.classList.contains('reject-btn')) return;
                    const idx = parseInt(el.dataset.idx);
                    const diffView = document.getElementById('diff-' + idx);
                    if (diffView.classList.contains('open')) {
                        diffView.classList.remove('open');
                    } else {
                        const edit = edits[idx];
                        diffView.innerHTML = renderDiff(edit.before, edit.after);
                        diffView.classList.add('open');
                    }
                });
            });

            // Accept/reject individual edits
            editsList.querySelectorAll('.accept-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = parseInt(btn.dataset.idx);
                    vscode.postMessage({ type: 'acceptEdit', index: idx });
                });
            });
            editsList.querySelectorAll('.reject-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = parseInt(btn.dataset.idx);
                    vscode.postMessage({ type: 'rejectEdit', index: idx });
                });
            });

            // Open file buttons
            editsList.querySelectorAll('.open-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const filePath = btn.dataset.path;
                    vscode.postMessage({ type: 'openFile', path: filePath });
                });
            });

            // Click on file path to open
            editsList.querySelectorAll('.edit-path').forEach(el => {
                el.style.cursor = 'pointer';
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const editItem = el.closest('.edit-item');
                    const filePath = editItem.dataset.path;
                    vscode.postMessage({ type: 'openFile', path: filePath });
                });
            });

            // Accept/reject all
            const acceptAllBtn = editsList.querySelector('.accept-all-btn');
            const rejectAllBtn = editsList.querySelector('.reject-all-btn');
            if (acceptAllBtn) {
                acceptAllBtn.addEventListener('click', () => {
                    vscode.postMessage({ type: 'acceptAllEdits' });
                });
            }
            if (rejectAllBtn) {
                rejectAllBtn.addEventListener('click', () => {
                    vscode.postMessage({ type: 'rejectAllEdits' });
                });
            }
        }

        function renderDiff(before, after) {
            function escapeHtml(text) {
                return (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }
            if (!before) {
                const lines = (after || '').split(/\\r?\\n/).slice(0, 20);
                return lines.map(l => '<span class="diff-add">+ ' + escapeHtml(l) + '</span>').join('<br>');
            }
            const beforeLines = (before || '').split(/\\r?\\n/);
            const afterLines = (after || '').split(/\\r?\\n/);
            let html = '';
            const maxLines = Math.max(beforeLines.length, afterLines.length);
            for (let i = 0; i < Math.min(maxLines, 20); i++) {
                if (beforeLines[i] !== afterLines[i]) {
                    if (beforeLines[i]) html += '<span class="diff-del">- ' + escapeHtml(beforeLines[i]) + '</span><br>';
                    if (afterLines[i]) html += '<span class="diff-add">+ ' + escapeHtml(afterLines[i]) + '</span><br>';
                } else if (afterLines[i]) {
                    html += '  ' + escapeHtml(afterLines[i]) + '<br>';
                }
            }
            if (maxLines > 20) html += '... (' + (maxLines - 20) + ' more lines)';
            return html;
        }

        // Tasks display
        const tasksList = document.getElementById('tasks-list');
        const tasksCount = document.getElementById('tasks-count');
        let tasks = [];

        function renderTasks() {
            if (tasks.length === 0) {
                tasksList.innerHTML = '<div class="no-tasks">No tasks yet</div>';
                tasksCount.textContent = '';
                return;
            }
            const completed = tasks.filter(t => t.state === 'complete').length;
            tasksCount.textContent = completed + '/' + tasks.length;

            const checkIcon = { pending: '', in_progress: '~', complete: 'x', failed: '!' };
            tasksList.innerHTML = tasks.map(t => {
                const isSubtask = t.parentId ? ' subtask' : '';
                const nameClass = t.state === 'complete' ? ' complete' : (t.state === 'failed' ? ' failed' : '');
                // Calculate duration
                let metrics = '';
                if (t.startTime && t.endTime) {
                    const duration = ((t.endTime - t.startTime) / 1000).toFixed(1);
                    metrics = '<span class="task-time">' + duration + 's</span>';
                }
                if (t.tokensUsed) {
                    metrics += '<span class="task-tokens">' + t.tokensUsed + ' tok</span>';
                }
                const metricsHtml = metrics ? '<div class="task-metrics">' + metrics + '</div>' : '';
                const errorHtml = t.error ? '<div class="task-error">' + t.error + '</div>' : '';
                return '<div class="task-item' + isSubtask + '">' +
                    '<div class="task-checkbox ' + t.state + '">' + checkIcon[t.state] + '</div>' +
                    '<div class="task-content"><span class="task-name' + nameClass + '">' + t.name + '</span>' + metricsHtml + errorHtml + '</div>' +
                    '</div>';
            }).join('');
        }

        // Settings panel
        document.getElementById('settings-btn').addEventListener('click', () => {
            vscode.postMessage({ type: 'getSettings' });
            settingsPanel.classList.add('open');
            // Fetch Ollama models when settings open
            setTimeout(() => {
                if (currentSettings?.provider === 'ollama') {
                    vscode.postMessage({ type: 'fetchOllamaModels' });
                }
            }, 100);
        });
        document.getElementById('close-settings').addEventListener('click', () => settingsPanel.classList.remove('open'));
        document.getElementById('cancel-settings').addEventListener('click', () => settingsPanel.classList.remove('open'));

        // Provider toggle
        document.getElementById('s-provider').addEventListener('change', e => {
            const p = e.target.value;
            document.getElementById('claude-settings').classList.toggle('hidden', p !== 'claude');
            document.getElementById('openai-settings').classList.toggle('hidden', p !== 'openai');
            document.getElementById('deepseek-settings').classList.toggle('hidden', p !== 'deepseek');
            document.getElementById('ollama-settings').classList.toggle('hidden', p !== 'ollama');
            if (p === 'ollama') {
                vscode.postMessage({ type: 'fetchOllamaModels' });
            }
        });

        // Refresh Ollama models
        document.getElementById('refresh-ollama-models').addEventListener('click', () => {
            vscode.postMessage({ type: 'fetchOllamaModels' });
        });

        // Save settings
        document.getElementById('save-settings').addEventListener('click', () => {
            const settings = {
                provider: document.getElementById('s-provider').value,
                claudeApiKey: document.getElementById('s-claude-key').value,
                claudeModel: document.getElementById('s-claude-model').value,
                openaiApiKey: document.getElementById('s-openai-key').value,
                openaiModel: document.getElementById('s-openai-model').value,
                deepseekApiKey: document.getElementById('s-deepseek-key').value,
                deepseekModel: document.getElementById('s-deepseek-model').value,
                ollamaUrl: document.getElementById('s-ollama-url').value,
                ollamaModel: document.getElementById('s-ollama-model').value
            };
            vscode.postMessage({ type: 'saveSettings', settings });
        });

        function sendMsg() {
            const msg = input.value.trim();
            if (!msg || isStreaming) return;

            // Include image if present
            const payload = { type: 'sendMessage', message: msg };
            if (pendingImage) {
                payload.image = pendingImage;
                payload.message = '[Image attached] ' + msg;
            }

            vscode.postMessage(payload);
            input.value = '';
            input.style.height = 'auto';

            // Clear image after sending
            if (pendingImage) {
                pendingImage = null;
                imagePreview.classList.add('hidden');
                input.placeholder = 'Ask anything... (drop image to generate code)';
            }
        }

        function addMsg(text, type) {
            const div = document.createElement('div');
            div.className = 'msg ' + type;
            div.innerHTML = formatText(text);
            chat.appendChild(div);
            chat.scrollTop = chat.scrollHeight;
            return div;
        }

        // Logs functionality
        const logsList = document.getElementById('logs-list');
        function addLog(type, data) {
            const time = new Date().toLocaleTimeString();
            const entry = document.createElement('div');
            entry.className = 'log-entry ' + type;

            if (type === 'tool-start') {
                entry.innerHTML = '<span class="log-time">' + time + '</span><span class="log-tool">⚡ ' +
                    getToolDisplayName(data.name) + '</span>';
                if (data.input) {
                    entry.innerHTML += '<div class="log-result">' + JSON.stringify(data.input, null, 2) + '</div>';
                }
            } else if (type === 'tool-end') {
                entry.classList.add(data.success ? 'success' : 'error');
                const icon = data.success ? '✓' : '✗';
                entry.innerHTML = '<span class="log-time">' + time + '</span><span class="log-tool">' + icon + ' ' +
                    getToolDisplayName(data.name) + '</span> <span style="opacity:0.6">(' + data.duration + 'ms)</span>';
                if (data.result) {
                    const shortResult = data.result.length > 300 ? data.result.substring(0, 300) + '...' : data.result;
                    entry.innerHTML += '<div class="log-result">' + escapeHtml(shortResult) + '</div>';
                }
            } else if (type === 'info') {
                entry.innerHTML = '<span class="log-time">' + time + '</span>' + escapeHtml(data);
            }

            logsList.appendChild(entry);
            logsList.scrollTop = logsList.scrollHeight;
        }

        function getToolDisplayName(name) {
            const names = {
                'read_file': 'Reading file',
                'write_file': 'Writing file',
                'list_files': 'Listing files',
                'add_task': 'Creating task',
                'update_task': 'Updating task'
            };
            return names[name] || name;
        }

        function escapeHtml(text) {
            return String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        function clearLogs() {
            logsList.innerHTML = '<div class="no-logs">No logs yet. Logs will appear here when agent mode is used.</div>';
        }
        clearLogs(); // Initialize

        // Tool cards in chat - Augment style
        const activeToolCards = {};

        function getToolIcon(name) {
            const icons = {
                'read_file': '📄',
                'write_file': '✏️',
                'list_files': '📁',
                'add_task': '✅',
                'update_task': '📋'
            };
            return icons[name] || '⚡';
        }

        function getToolLabel(name, input) {
            if (name === 'read_file') return 'Read ' + (input?.path || 'file');
            if (name === 'write_file') return 'Write ' + (input?.path || 'file');
            if (name === 'list_files') return 'List ' + (input?.directory || 'files');
            if (name === 'add_task') return 'Add Task';
            if (name === 'update_task') return 'Update Task';
            return name;
        }

        function addToolCard(tool, status) {
            const card = document.createElement('div');
            card.className = 'tool-call ' + status;
            card.id = 'tool-' + tool.name + '-' + Date.now();

            const icon = getToolIcon(tool.name);
            const label = getToolLabel(tool.name, tool.input);
            const detail = tool.input?.path || tool.input?.directory || tool.input?.description || '';

            card.innerHTML =
                '<span class="tool-icon">' + icon + '</span>' +
                '<span class="tool-name">' + label + '</span>' +
                (detail ? '<span class="tool-detail">' + escapeHtml(detail) + '</span>' : '') +
                '<span class="tool-status-icon running">⏳</span>';

            chat.appendChild(card);
            chat.scrollTop = chat.scrollHeight;
            activeToolCards[tool.name] = card;
        }

        function updateToolCard(tool) {
            const card = activeToolCards[tool.name];
            if (card) {
                card.classList.remove('running');
                card.classList.add(tool.success ? 'success' : 'error');
                const statusIcon = card.querySelector('.tool-status-icon');
                if (statusIcon) {
                    statusIcon.classList.remove('running');
                    statusIcon.classList.add(tool.success ? 'success' : 'error');
                    statusIcon.textContent = tool.success ? '●' : '✗';
                }
                delete activeToolCards[tool.name];
            }
        }

        function formatText(text) {
            return text
                .replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, '<pre><code>$1</code></pre>')
                .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
                .replace(/\\n/g, '<br>');
        }

        function updateProviderBadge(provider) {
            const badge = document.getElementById('provider-badge');
            const badges = { claude: ['Claude', 'badge-claude'], openai: ['GPT', 'badge-openai'], ollama: ['Local', 'badge-ollama'] };
            const [text, cls] = badges[provider] || ['', ''];
            badge.textContent = text;
            badge.className = 'provider-badge ' + cls;
        }

        window.addEventListener('message', e => {
            const m = e.data;
            switch(m.type) {
                case 'userMessage': addMsg(m.message, 'user'); break;
                case 'aiMessage': addMsg(m.message, 'ai'); break;
                case 'systemMessage': addMsg(m.message, 'system'); break;
                case 'startAiMessage':
                    isStreaming = true; send.disabled = true;
                    currentAiMsg = addMsg('', 'ai streaming');
                    break;
                case 'streamChunk':
                    if (currentAiMsg) { currentAiMsg.innerHTML += formatText(m.chunk); chat.scrollTop = chat.scrollHeight; }
                    break;
                case 'endAiMessage':
                    if (currentAiMsg) { currentAiMsg.classList.remove('streaming'); currentAiMsg = null; }
                    isStreaming = false; send.disabled = false;
                    break;
                case 'toolStart':
                    addLog('tool-start', m.tool);
                    addToolCard(m.tool, 'running');
                    break;
                case 'toolEnd':
                    addLog('tool-end', m.tool);
                    updateToolCard(m.tool);
                    break;
                case 'logInfo':
                    addLog('info', m.message);
                    break;
                case 'clearChat': chat.innerHTML = ''; clearLogs(); break;
                case 'settings':
                    currentSettings = m.settings;
                    document.getElementById('s-provider').value = m.settings.provider;
                    document.getElementById('s-claude-key').value = m.settings.claudeApiKey || '';
                    document.getElementById('s-claude-model').value = m.settings.claudeModel;
                    document.getElementById('s-openai-key').value = m.settings.openaiApiKey || '';
                    document.getElementById('s-openai-model').value = m.settings.openaiModel;
                    document.getElementById('s-deepseek-key').value = m.settings.deepseekApiKey || '';
                    document.getElementById('s-deepseek-model').value = m.settings.deepseekModel;
                    document.getElementById('s-ollama-url').value = m.settings.ollamaUrl;
                    document.getElementById('s-ollama-model').value = m.settings.ollamaModel;
                    document.getElementById('claude-settings').classList.toggle('hidden', m.settings.provider !== 'claude');
                    document.getElementById('openai-settings').classList.toggle('hidden', m.settings.provider !== 'openai');
                    document.getElementById('deepseek-settings').classList.toggle('hidden', m.settings.provider !== 'deepseek');
                    document.getElementById('ollama-settings').classList.toggle('hidden', m.settings.provider !== 'ollama');
                    updateProviderBadge(m.settings.provider);
                    // Update provider info in bottom bar
                    const providerNames = { claude: 'Claude', openai: 'OpenAI', deepseek: 'DeepSeek', ollama: 'Ollama' };
                    const model = m.settings.provider === 'claude' ? m.settings.claudeModel :
                                  m.settings.provider === 'openai' ? m.settings.openaiModel :
                                  m.settings.provider === 'deepseek' ? m.settings.deepseekModel : m.settings.ollamaModel;
                    document.getElementById('provider-info').textContent = providerNames[m.settings.provider] + ' - ' + model;
                    // Update tool support indicator
                    const toolWarning = document.getElementById('tool-warning');
                    const agentSwitchContainer = document.getElementById('agent-switch-container');
                    if (m.toolSupport && !m.toolSupport.supported) {
                        toolWarning.textContent = m.toolSupport.reason || 'Agent mode not available';
                        toolWarning.classList.add('show');
                        agentSwitchContainer.classList.add('disabled');
                        // Force agent mode off
                        agentModeEnabled = false;
                        agentSwitch.classList.remove('on');
                        autoSwitchContainer.style.display = 'none';
                    } else {
                        toolWarning.classList.remove('show');
                        agentSwitchContainer.classList.remove('disabled');
                    }
                    break;
                case 'settingsSaved':
                    if (m.success) {
                        settingsPanel.classList.remove('open');
                        addMsg('Settings saved', 'system');
                        updateProviderBadge(document.getElementById('s-provider').value);
                    } else {
                        addMsg('Failed to save: ' + m.error, 'system');
                    }
                    break;
                case 'ollamaModels':
                    const select = document.getElementById('s-ollama-model');
                    const status = document.getElementById('ollama-status');
                    if (m.error) {
                        status.textContent = m.error;
                        status.classList.add('error');
                        select.innerHTML = '<option value="">No models available</option>';
                    } else {
                        status.textContent = m.models.length + ' models available';
                        status.classList.remove('error');
                        const currentModel = currentSettings?.ollamaModel || '';
                        select.innerHTML = m.models.map(model =>
                            '<option value="' + model.name + '"' + (model.name === currentModel ? ' selected' : '') + '>' +
                            model.name + ' (' + model.size + ')' +
                            '</option>'
                        ).join('');
                    }
                    break;
                case 'restoreDraft':
                    input.value = m.text;
                    break;
                case 'threads':
                    threads = m.threads;
                    currentThreadId = m.currentThreadId;
                    renderThreads();
                    // Tasks
                    tasks = m.tasks || [];
                    renderTasks();
                    // Edits
                    edits = m.edits || [];
                    console.log('Received edits:', edits.length, edits);
                    renderEdits();
                    break;
            }
        });

        // Save draft when typing
        input.addEventListener('input', () => {
            vscode.postMessage({ type: 'saveDraft', text: input.value });
        });

        // Signal ready and load settings on init
        vscode.postMessage({ type: 'ready' });
        vscode.postMessage({ type: 'getSettings' });
    </script>
</body>
</html>`;
    }
}
exports.ChatViewProvider = ChatViewProvider;
//# sourceMappingURL=chatViewProvider.js.map