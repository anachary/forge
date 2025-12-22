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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const chatViewProvider_1 = require("./chatViewProvider");
const aiService_1 = require("./aiService");
function activate(context) {
    console.log('Forge extension is now active');
    const aiService = new aiService_1.AIService(context);
    const chatProvider = new chatViewProvider_1.ChatViewProvider(context.extensionUri, aiService);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('forge.chatView', chatProvider));
    context.subscriptions.push(vscode.commands.registerCommand('forge.openChat', () => {
        vscode.commands.executeCommand('forge.chatView.focus');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('forge.explainCode', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }
        const selection = editor.document.getText(editor.selection);
        if (!selection) {
            vscode.window.showErrorMessage('No code selected');
            return;
        }
        const language = editor.document.languageId;
        chatProvider.sendMessage(`Explain this ${language} code:\n\n\`\`\`${language}\n${selection}\n\`\`\``);
        vscode.commands.executeCommand('forge.chatView.focus');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('forge.generateTests', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }
        const selection = editor.document.getText(editor.selection);
        if (!selection) {
            vscode.window.showErrorMessage('No code selected');
            return;
        }
        const language = editor.document.languageId;
        chatProvider.sendMessage(`Generate unit tests for this ${language} code:\n\n\`\`\`${language}\n${selection}\n\`\`\``);
        vscode.commands.executeCommand('forge.chatView.focus');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('forge.refactorCode', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }
        const selection = editor.document.getText(editor.selection);
        if (!selection) {
            vscode.window.showErrorMessage('No code selected');
            return;
        }
        const language = editor.document.languageId;
        chatProvider.sendMessage(`Refactor this ${language} code:\n\n\`\`\`${language}\n${selection}\n\`\`\``);
        vscode.commands.executeCommand('forge.chatView.focus');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('forge.fixBug', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }
        const selection = editor.document.getText(editor.selection);
        if (!selection) {
            vscode.window.showErrorMessage('No code selected');
            return;
        }
        const language = editor.document.languageId;
        chatProvider.sendMessage(`Fix bugs in this ${language} code:\n\n\`\`\`${language}\n${selection}\n\`\`\``);
        vscode.commands.executeCommand('forge.chatView.focus');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('forge.clearChat', () => {
        chatProvider.clearChat();
    }));
    vscode.window.showInformationMessage('Forge is ready. Click the Forge icon in the sidebar.', 'Open Chat').then(selection => {
        if (selection === 'Open Chat') {
            vscode.commands.executeCommand('forge.openChat');
        }
    });
}
function deactivate() { }
//# sourceMappingURL=extension.js.map