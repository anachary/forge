import * as vscode from 'vscode';
import { ChatViewProvider } from './chatViewProvider';
import { AIService } from './aiService';

export function activate(context: vscode.ExtensionContext) {
    console.log('Forge extension is now active');

    const aiService = new AIService(context);
    const chatProvider = new ChatViewProvider(context.extensionUri, aiService);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('forge.chatView', chatProvider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('forge.openChat', () => {
            vscode.commands.executeCommand('forge.chatView.focus');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('forge.explainCode', async () => {
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
            chatProvider.sendMessage(
                `Explain this ${language} code:\n\n\`\`\`${language}\n${selection}\n\`\`\``
            );
            vscode.commands.executeCommand('forge.chatView.focus');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('forge.generateTests', async () => {
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
            chatProvider.sendMessage(
                `Generate unit tests for this ${language} code:\n\n\`\`\`${language}\n${selection}\n\`\`\``
            );
            vscode.commands.executeCommand('forge.chatView.focus');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('forge.refactorCode', async () => {
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
            chatProvider.sendMessage(
                `Refactor this ${language} code:\n\n\`\`\`${language}\n${selection}\n\`\`\``
            );
            vscode.commands.executeCommand('forge.chatView.focus');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('forge.fixBug', async () => {
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
            chatProvider.sendMessage(
                `Fix bugs in this ${language} code:\n\n\`\`\`${language}\n${selection}\n\`\`\``
            );
            vscode.commands.executeCommand('forge.chatView.focus');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('forge.clearChat', () => {
            chatProvider.clearChat();
        })
    );

    vscode.window.showInformationMessage(
        'Forge is ready. Click the Forge icon in the sidebar.',
        'Open Chat'
    ).then(selection => {
        if (selection === 'Open Chat') {
            vscode.commands.executeCommand('forge.openChat');
        }
    });
}

export function deactivate() {}

