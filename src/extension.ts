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

// Import faustwasm dynamically
let FaustModule: any;

let client: LanguageClient | undefined;
let outputChannel: vscode.OutputChannel;
let faustModule: any;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Faust');
  
  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('faust.restartLsp', restartLsp),
    vscode.commands.registerCommand('faust.createConfigFile', createConfigFile),
    vscode.commands.registerCommand('faust.compileCurrentFile', compileCurrentFile),
    vscode.commands.registerCommand('faust.launchWebAssembly', launchWebAssembly),
    outputChannel
  );

  // Start LSP client
  await startLspClient(context);

  // Watch for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event: vscode.ConfigurationChangeEvent) => {
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

// Faustwasm compilation functions
async function initializeFaustModule(): Promise<void> {
  if (!faustModule) {
    try {
      // Dynamic import from the specific ESM dist path
      const faustWasm = await import('@grame/faustwasm/dist/esm/index.js');
      
      outputChannel.appendLine('Initializing Faust WebAssembly module...');
      
      // Get the path to the libfaust-wasm.js file
      const libfaustPath = require.resolve('@grame/faustwasm/libfaust-wasm/libfaust-wasm.js');
      outputChannel.appendLine(`Using libfaust-wasm.js from: ${libfaustPath}`);
      
      // Check if the file exists and is readable
      const fs = require('fs');
      if (!fs.existsSync(libfaustPath)) {
        throw new Error(`libfaust-wasm.js not found at ${libfaustPath}`);
      }
      
      const stats = fs.statSync(libfaustPath);
      outputChannel.appendLine(`libfaust-wasm.js size: ${stats.size} bytes`);
      
      // Try to read the first few bytes to check if it's a valid JS file
      const buffer = fs.readFileSync(libfaustPath, { encoding: 'utf8', flag: 'r' });
      const firstLine = buffer.split('\n')[0];
      outputChannel.appendLine(`First line of libfaust-wasm.js: ${firstLine.substring(0, 100)}...`);
      
      // Use the correct API: instantiateFaustModuleFromFile with the JS file path
      const faustModuleInstance = await faustWasm.instantiateFaustModuleFromFile(libfaustPath);
      
      // Create LibFaust instance
      const libFaust = new faustWasm.LibFaust(faustModuleInstance);
      outputChannel.appendLine(`LibFaust version: ${libFaust.version()}`);
      
      // Create FaustCompiler instance
      const compiler = new faustWasm.FaustCompiler(libFaust);
      
      // Store the compiler as our faustModule
      faustModule = {
        compiler,
        libFaust,
        faustWasm
      };
      
      outputChannel.appendLine('Faust WebAssembly module initialized successfully');
    } catch (error) {
      outputChannel.appendLine(`Failed to initialize Faust module: ${error}`);
      vscode.window.showErrorMessage(`Failed to initialize Faust module: ${error}`);
      throw error;
    }
  }
}

async function compileCurrentFile(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor found');
    return;
  }

  const document = editor.document;
  if (!document.fileName.endsWith('.dsp')) {
    vscode.window.showErrorMessage('Current file is not a Faust DSP file (.dsp)');
    return;
  }

  outputChannel.show();
  outputChannel.appendLine(`Compiling ${document.fileName}...`);

  try {
    await initializeFaustModule();
    
    const faustCode = document.getText();
    const fileName = path.basename(document.fileName, '.dsp');
    const fileDir = path.dirname(document.fileName);
    const outputDir = path.join(fileDir, 'build');
    
    // Create output directory
    await fs.promises.mkdir(outputDir, { recursive: true });
    
    // Compile to different targets using faustwasm
    const compilationOptions = '-I libraries/';
    
    // Compile to WebAssembly
    try {
      outputChannel.appendLine('Compiling to WebAssembly...');
      const wasmFactory = await faustModule.compiler.createMonoDSPFactory(fileName, faustCode, compilationOptions);
      
      if (wasmFactory) {
        outputChannel.appendLine('✓ Successfully compiled to WebAssembly');
        
        // Save the WebAssembly module
        const wasmFile = path.join(outputDir, `${fileName}.wasm`);
        await fs.promises.writeFile(wasmFile, wasmFactory.code);
        outputChannel.appendLine(`  WASM saved to: ${wasmFile}`);
        
        // Save the metadata JSON
        const metaFile = path.join(outputDir, `${fileName}-meta.json`);
        await fs.promises.writeFile(metaFile, wasmFactory.json);
        outputChannel.appendLine(`  Metadata saved to: ${metaFile}`);
        
        // Clean up
        faustModule.compiler.deleteDSPFactory(wasmFactory);
      } else {
        outputChannel.appendLine('✗ Failed to compile to WebAssembly');
        const errorMsg = faustModule.compiler.getErrorMessage();
        if (errorMsg) {
          outputChannel.appendLine(`  Error: ${errorMsg}`);
        }
      }
    } catch (error) {
      outputChannel.appendLine(`✗ Error compiling to WebAssembly: ${error}`);
    }
    
    vscode.window.showInformationMessage(`Faust compilation completed for ${fileName}`);
    
  } catch (error) {
    outputChannel.appendLine(`Compilation error: ${error}`);
    vscode.window.showErrorMessage(`Compilation failed: ${error}`);
  }
}

async function launchWebAssembly(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor found');
    return;
  }

  const document = editor.document;
  if (!document.fileName.endsWith('.dsp')) {
    vscode.window.showErrorMessage('Current file is not a Faust DSP file (.dsp)');
    return;
  }

  const fileName = path.basename(document.fileName, '.dsp');
  const fileDir = path.dirname(document.fileName);
  const outputDir = path.join(fileDir, 'build');
  const wasmFile = path.join(outputDir, `${fileName}.wasm`);
  const metaFile = path.join(outputDir, `${fileName}-meta.json`);

  // Check if compiled files exist
  try {
    await fs.promises.access(wasmFile);
    await fs.promises.access(metaFile);
  } catch (error) {
    const compile = await vscode.window.showInformationMessage(
      'WebAssembly files not found. Would you like to compile first?',
      'Compile and Launch',
      'Cancel'
    );
    
    if (compile === 'Compile and Launch') {
      await compileCurrentFile();
      // Check again after compilation
      try {
        await fs.promises.access(wasmFile);
        await fs.promises.access(metaFile);
      } catch {
        vscode.window.showErrorMessage('Compilation failed. Cannot launch WebAssembly.');
        return;
      }
    } else {
      return;
    }
  }

  outputChannel.show();
  outputChannel.appendLine(`Launching WebAssembly for ${fileName}...`);

  try {
    // Create webview panel
    const panel = vscode.window.createWebviewPanel(
      'faustWebAssembly',
      `Faust DSP: ${fileName}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file(outputDir)]
      }
    );

    // Read the compiled files
    const wasmData = await fs.promises.readFile(wasmFile);
    const metaData = await fs.promises.readFile(metaFile, 'utf8');
    const metadata = JSON.parse(metaData);

    // Generate HTML content
    const htmlContent = generateFaustWebAssemblyHTML(fileName, wasmData, metadata, panel.webview, outputDir);
    
    panel.webview.html = htmlContent;

    outputChannel.appendLine(`✓ WebAssembly launched successfully for ${fileName}`);
    
  } catch (error) {
    outputChannel.appendLine(`Launch error: ${error}`);
    vscode.window.showErrorMessage(`Failed to launch WebAssembly: ${error}`);
  }
}

function generateFaustWebAssemblyHTML(fileName: string, wasmData: Buffer, metadata: any, webview: vscode.Webview, outputDir: string): string {
  // Convert WASM data to base64 for embedding
  const wasmBase64 = wasmData.toString('base64');
  
  // Read the HTML template
  const fs = require('fs');
  const path = require('path');
  
  const templatePath = path.join(__dirname, 'webview-template.html');
  let htmlTemplate = fs.readFileSync(templatePath, 'utf8');
  
  // Prepare template variables
  const uiElements = metadata.ui[0]?.items || [];
  const initialParams = uiElements.map((item: any) => ({ address: item.address, init: item.init }));
  const testParams = uiElements.map((item: any) => ({ address: item.address, init: item.init }));
  const debugParams = uiElements.map((item: any) => ({ address: item.address, init: item.init }));
  
  // Replace template placeholders
  const replacements = {
    '{{fileName}}': fileName,
    '{{version}}': metadata.version,
    '{{inputs}}': metadata.inputs,
    '{{outputs}}': metadata.outputs,
    '{{compileOptions}}': metadata.compile_options,
    '{{libraryList}}': metadata.library_list.join(', '),
    '{{uiElementCount}}': uiElements.length.toString(),
    '{{wasmBase64}}': wasmBase64,
    '{{uiElements}}': JSON.stringify(uiElements),
    '{{initialParams}}': JSON.stringify(initialParams),
    '{{testParams}}': JSON.stringify(testParams),
    '{{debugParams}}': JSON.stringify(debugParams),
    '{{numInputs}}': metadata.inputs.toString(),
    '{{numOutputs}}': metadata.outputs.toString()
  };
  
  // Apply replacements
  for (const [placeholder, value] of Object.entries(replacements)) {
    htmlTemplate = htmlTemplate.replace(new RegExp(placeholder, 'g'), value);
  }
  
  return htmlTemplate;
}

// This method is called when your extension is deactivated
export async function deactivate() {
  if (client) {
    outputChannel.appendLine('Stopping Faust LSP...');
    await client.stop();
    outputChannel.appendLine('Faust LSP stopped');
  }
}

