// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
  State,
} from "vscode-languageclient/node";

import fs from "fs";
import path from "path";
import which from "which";

let client: LanguageClient | undefined;
let outputChannel: vscode.OutputChannel;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Faust');
  
  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('faust.restartLsp', restartLsp),
    vscode.commands.registerCommand('faust.createConfigFile', createConfigFile),
    outputChannel
  );

  // Start LSP client
  await startLspClient(context);

  // Watch for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration('faust')) {
        outputChannel.appendLine('Faust configuration changed, restarting LSP...');
        await restartLsp();
      }
    })
  );

  // Watch for config file creation/changes
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders) {
    const configFileName = getConfigFileName();
    const pattern = new vscode.RelativePattern(workspaceFolders[0], configFileName);
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    
    context.subscriptions.push(
      watcher.onDidCreate(async () => {
        outputChannel.appendLine('Faust config file created, starting LSP...');
        await startLspClient(context);
      }),
      watcher.onDidChange(async () => {
        outputChannel.appendLine('Faust config file changed, restarting LSP...');
        await restartLsp();
      }),
      watcher
    );
  }
}

async function startLspClient(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration('faust');
  
  if (!config.get<boolean>('lsp.enabled', true)) {
    outputChannel.appendLine('Faust LSP is disabled in settings');
    return;
  }

  const executablePath = config.get<string>('lsp.executable', 'faustlsp');
  const configFileName = getConfigFileName();
  
  // Check if workspace has folders
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    outputChannel.appendLine('No workspace folder found');
    return;
  }

  const workspaceFolderPath = workspaceFolders[0].uri.fsPath;
  const configFilePath = path.join(workspaceFolderPath, configFileName);

  // Check if config file exists
  const configFileExists = await checkFileExists(configFilePath);
  if (!configFileExists) {
    const action = await vscode.window.showWarningMessage(
      `Faust config file (${configFileName}) not found in workspace root.`,
      'Create Config File',
      'Ignore'
    );
    
    if (action === 'Create Config File') {
      await createConfigFile();
      return;
    } else {
      outputChannel.appendLine(`Config file ${configFileName} not found, LSP not started`);
      return;
    }
  }

  // Check if faustlsp executable exists
  const executableExists = await checkExecutableExists(executablePath);
  if (!executableExists) {
    vscode.window.showErrorMessage(
      `Could not find ${executablePath} in PATH. Please install faustlsp or update the 'faust.lsp.executable' setting.`
    );
    outputChannel.appendLine(`Executable ${executablePath} not found in PATH`);
    return;
  }

  // Stop existing client if running
  if (client && client.state === State.Running) {
    await client.stop();
  }

  // Configure LSP client
  const serverOptions: ServerOptions = {
    run: { command: executablePath, transport: TransportKind.stdio },
    debug: { command: executablePath, transport: TransportKind.stdio },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "faust" }],
    outputChannel: outputChannel,
  };

  // Create and start the language client
  client = new LanguageClient(
    "faustlsp",
    "Faust LSP",
    serverOptions,
    clientOptions
  );

  try {
    await client.start();
    outputChannel.appendLine('Faust LSP started successfully');
    vscode.window.showInformationMessage('Faust LSP started');
  } catch (error) {
    outputChannel.appendLine(`Failed to start Faust LSP: ${error}`);
    vscode.window.showErrorMessage(`Failed to start Faust LSP: ${error}`);
  }
}

async function restartLsp(): Promise<void> {
  if (client) {
    await client.stop();
  }
  
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders) {
    await startLspClient(vscode.extensions.getExtension('your-publisher-name.vscode-faust')?.extensionUri as any);
  }
}

async function createConfigFile(): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('No workspace folder found');
    return;
  }

  const configFileName = getConfigFileName();
  const configFilePath = path.join(workspaceFolders[0].uri.fsPath, configFileName);
  
  const defaultConfig = {
    "command": "faust",              // Faust Compiler Executable to use
    "process_name": "process",       // Process Name passed as -pn to compiler
    "process_files": ["a.dsp"],      // Files that have top-level processes defined
    "compiler_diagnostics": true     // Show Compiler Errors 
  };

  try {
    await fs.promises.writeFile(configFilePath, JSON.stringify(defaultConfig, null, 2));
    vscode.window.showInformationMessage(`Created ${configFileName} in workspace root`);
    outputChannel.appendLine(`Created config file: ${configFilePath}`);
    
    // Open the config file for editing
    const document = await vscode.workspace.openTextDocument(configFilePath);
    await vscode.window.showTextDocument(document);
    
    // Start LSP now that config file exists
    await startLspClient(vscode.extensions.getExtension('your-publisher-name.vscode-faust')?.extensionUri as any);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to create config file: ${error}`);
    outputChannel.appendLine(`Failed to create config file: ${error}`);
  }
}

function getConfigFileName(): string {
  const config = vscode.workspace.getConfiguration('faust');
  return config.get<string>('configFile', '.faustcfg.json');
}

async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function checkExecutableExists(executable: string): Promise<boolean> {
  try {
    await which(executable);
    return true;
  } catch {
    return false;
  }
}

// This method is called when your extension is deactivated
export async function deactivate() {
  if (client) {
    outputChannel.appendLine('Stopping Faust LSP...');
    await client.stop();
    outputChannel.appendLine('Faust LSP stopped');
  }
}

