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
    vscode.commands.registerCommand('faust.compileToWasm', compileToWasm),
    vscode.commands.registerCommand('faust.compileToJavaScript', compileToJavaScript),
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
    
    // Note: JavaScript compilation (AudioWorklet) requires a browser context
    // For now, we focus on WebAssembly compilation which works in Node.js
    
    vscode.window.showInformationMessage(`Faust compilation completed for ${fileName}`);
    
  } catch (error) {
    outputChannel.appendLine(`Compilation error: ${error}`);
    vscode.window.showErrorMessage(`Compilation failed: ${error}`);
  }
}

async function compileToWasm(): Promise<void> {
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
  outputChannel.appendLine(`Compiling ${document.fileName} to WebAssembly...`);

  try {
    await initializeFaustModule();
    
    const faustCode = document.getText();
    const fileName = path.basename(document.fileName, '.dsp');
    const fileDir = path.dirname(document.fileName);
    const outputDir = path.join(fileDir, 'build');
    
    // Create output directory
    await fs.promises.mkdir(outputDir, { recursive: true });
    
    // Compile to WebAssembly using faustwasm
    const compilationOptions = '-I libraries/';
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
      
      vscode.window.showInformationMessage(`WebAssembly compilation completed: ${fileName}.wasm`);
      
      // Clean up
      faustModule.compiler.deleteDSPFactory(wasmFactory);
    } else {
      outputChannel.appendLine('✗ Failed to compile to WebAssembly');
      const errorMsg = faustModule.compiler.getErrorMessage();
      if (errorMsg) {
        outputChannel.appendLine(`  Error: ${errorMsg}`);
      }
      vscode.window.showErrorMessage('WebAssembly compilation failed');
    }
    
  } catch (error) {
    outputChannel.appendLine(`WebAssembly compilation error: ${error}`);
    vscode.window.showErrorMessage(`WebAssembly compilation failed: ${error}`);
  }
}

async function compileToJavaScript(): Promise<void> {
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
  outputChannel.appendLine(`Compiling ${document.fileName} to JavaScript...`);

  try {
    await initializeFaustModule();
    
    const faustCode = document.getText();
    const fileName = path.basename(document.fileName, '.dsp');
    const fileDir = path.dirname(document.fileName);
    const outputDir = path.join(fileDir, 'build');
    
    // Create output directory
    await fs.promises.mkdir(outputDir, { recursive: true });
    
    // Note: JavaScript (AudioWorklet) compilation requires a browser context
    // For now, this command focuses on WebAssembly compilation
    outputChannel.appendLine('Note: JavaScript compilation requires a browser context.');
    outputChannel.appendLine('Use "Faust: Compile to WebAssembly" for WASM compilation.');
    
    vscode.window.showInformationMessage('JavaScript compilation requires a browser context. Use WebAssembly compilation instead.');
    
  } catch (error) {
    outputChannel.appendLine(`JavaScript compilation error: ${error}`);
    vscode.window.showErrorMessage(`JavaScript compilation failed: ${error}`);
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
      await compileToWasm();
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
  
  // Generate HTML with faust-ui integration
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Faust DSP: ${fileName}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            overflow: hidden;
        }
        .header {
            margin-bottom: 20px;
            padding: 15px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 8px;
            border: 1px solid var(--vscode-input-border);
        }
        .main-container {
            display: flex;
            gap: 20px;
            height: calc(100vh - 200px);
        }
        .controls-panel {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .audio-controls {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }
        .faust-ui-container {
            flex: 1;
            border: 1px solid var(--vscode-input-border);
            border-radius: 8px;
            padding: 20px;
            background-color: var(--vscode-editor-background);
            overflow: auto;
        }
        button {
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            cursor: pointer;
            font-size: 14px;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .status {
            padding: 10px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
            margin-top: 10px;
        }
        .status.success { 
            background-color: var(--vscode-inputValidation-infoBackground);
            color: var(--vscode-inputValidation-infoForeground);
        }
        .status.error { 
            background-color: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-inputValidation-errorForeground);
        }
        .info-panel {
            flex: 0 0 300px;
            padding: 15px;
            background-color: var(--vscode-textBlockQuote-background);
            border: 1px solid var(--vscode-textBlockQuote-border);
            border-radius: 8px;
            overflow-y: auto;
        }
        .info-panel h3 {
            margin-top: 0;
            color: var(--vscode-textPreformat-foreground);
        }
        .info-panel p {
            font-size: 12px;
            line-height: 1.4;
        }
        .info-panel strong {
            color: var(--vscode-textPreformat-foreground);
        }
        
        /* Faust UI Integration Styles */
        .faust-ui-root {
            width: 100%;
            height: 100%;
            min-height: 400px;
        }
        
        /* Override faust-ui styles to match VS Code theme */
        .faust-ui-component {
            color: var(--vscode-editor-foreground) !important;
        }
        
        .faust-ui-component input,
        .faust-ui-component select {
            background-color: var(--vscode-input-background) !important;
            color: var(--vscode-input-foreground) !important;
            border: 1px solid var(--vscode-input-border) !important;
        }
        
        .faust-ui-component-label {
            color: var(--vscode-editor-foreground) !important;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Faust DSP: ${fileName}</h1>
        <p>Compiled with Faust ${metadata.version}</p>
        <p>Inputs: ${metadata.inputs}, Outputs: ${metadata.outputs}</p>
    </div>

    <div class="main-container">
        <div class="controls-panel">
            <div class="audio-controls">
                <button id="startBtn">Start Audio</button>
                <button id="stopBtn" disabled>Stop Audio</button>
            </div>
            
            <div class="faust-ui-container">
                <div id="faust-ui-root" class="faust-ui-root"></div>
            </div>
            
            <div class="status" id="status">Ready to start</div>
        </div>

        <div class="info-panel">
            <h3>DSP Information</h3>
            <p><strong>Compilation options:</strong> ${metadata.compile_options}</p>
            <p><strong>Library list:</strong> ${metadata.library_list.join(', ')}</p>
            <p><strong>Sample rate:</strong> Variable (set by Web Audio API)</p>
            <p><strong>UI Elements:</strong> ${metadata.ui[0]?.items?.length || 0} controls</p>
        </div>
    </div>

    <!-- Load faust-ui from CDN -->
    <script src="https://unpkg.com/@shren/faust-ui@latest/dist/index.js"></script>
    <link rel="stylesheet" href="https://unpkg.com/@shren/faust-ui@latest/dist/index.css">
    
    <script>
        let audioContext;
        let faustProcessor;
        let faustNode;
        let faustUI;
        let isRunning = false;
        let dspInstance;

        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        const statusDiv = document.getElementById('status');

        // Convert base64 WASM to ArrayBuffer
        function base64ToArrayBuffer(base64) {
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes.buffer;
        }

        // Initialize FaustUI
        function initFaustUI() {
            const uiRoot = document.getElementById('faust-ui-root');
            
            // Create FaustUI instance
            faustUI = new FaustUI.FaustUI({
                root: uiRoot,
                ui: ${JSON.stringify(metadata.ui[0]?.items || [])},
                listenWindowResize: true,
                listenWindowMessage: false
            });
            
            // Override paramChangeByUI to handle parameter changes
            faustUI.paramChangeByUI = (path, value) => {
                console.log('Parameter change:', path, value);
                if (dspInstance && dspInstance.setParamValue) {
                    try {
                        dspInstance.setParamValue(path, value);
                        console.log('Parameter set successfully:', path, '=', value);
                    } catch (error) {
                        console.error('Error setting parameter:', error);
                    }
                }
            };
            
            statusDiv.textContent = 'UI initialized';
        }

        // Initialize audio context and load WASM
        async function initAudio() {
            try {
                statusDiv.textContent = 'Initializing audio context...';
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                
                statusDiv.textContent = 'Loading WebAssembly module...';
                const wasmArrayBuffer = base64ToArrayBuffer('${wasmBase64}');
                const wasmModule = await WebAssembly.compile(wasmArrayBuffer);
                
                statusDiv.textContent = 'Creating WebAssembly instance...';
                // Create memory that will be shared with the WASM module
                const memory = new WebAssembly.Memory({ initial: 256 });
                
                const wasmInstance = await WebAssembly.instantiate(wasmModule, {
                    env: {
                        memory: memory,
                        _sinf: Math.sin,
                        _cosf: Math.cos,
                        _tanf: Math.tan,
                        _asinf: Math.asin,
                        _acosf: Math.acos,
                        _atanf: Math.atan,
                        _atan2f: Math.atan2,
                        _expf: Math.exp,
                        _logf: Math.log,
                        _sqrtf: Math.sqrt,
                        _powf: Math.pow,
                        _floorf: Math.floor,
                        _ceilf: Math.ceil,
                        _fmodf: function(a, b) { return a % b; },
                        _roundf: Math.round,
                        table: new WebAssembly.Table({ initial: 0, element: 'anyfunc' })
                    }
                });

                dspInstance = wasmInstance.exports;
                
                // Debug: Log available functions
                console.log('Available DSP functions:', Object.keys(dspInstance));
                
                // Log specific function checks
                const requiredFunctions = ['compute', 'init', 'instanceInit', 'instanceConstants', 'instanceClear', 'setParamValue', 'getParamValue'];
                requiredFunctions.forEach(func => {
                    console.log(\`DSP.\${func}:\`, typeof dspInstance[func]);
                });
                
                statusDiv.textContent = 'Initializing DSP...';
                
                // Initialize the DSP with sample rate
                if (dspInstance.init) {
                    dspInstance.init(audioContext.sampleRate);
                    console.log('DSP initialized with sample rate:', audioContext.sampleRate);
                }
                
                // Initialize DSP instance and constants
                if (dspInstance.instanceInit) {
                    dspInstance.instanceInit(audioContext.sampleRate);
                    console.log('DSP instance initialized');
                }
                
                if (dspInstance.instanceConstants) {
                    dspInstance.instanceConstants(audioContext.sampleRate);
                    console.log('DSP constants initialized');
                }
                
                // Clear the DSP instance
                if (dspInstance.instanceClear) {
                    dspInstance.instanceClear();
                    console.log('DSP instance cleared');
                }
                
                // Reset UI to initial values
                if (dspInstance.instanceResetUserInterface) {
                    dspInstance.instanceResetUserInterface();
                    console.log('DSP UI reset');
                }
                
                // Set initial parameter values from metadata
                const initialParams = ${JSON.stringify(metadata.ui[0]?.items.map((item: any) => ({ address: item.address, init: item.init })) || [])};
                console.log('Setting initial parameter values:', initialParams);
                initialParams.forEach(param => {
                    if (dspInstance.setParamValue) {
                        dspInstance.setParamValue(param.address, param.init);
                        console.log('Set parameter', param.address, 'to', param.init);
                        // Verify the parameter was set
                        const actualValue = dspInstance.getParamValue(param.address);
                        console.log('Verified parameter', param.address, 'is now', actualValue);
                    }
                });
                
                // Also update the UI to reflect the parameter values
                if (faustUI) {
                    initialParams.forEach(param => {
                        faustUI.paramChangeByDSP(param.address, param.init);
                    });
                }
                
                // Verify initialization
                console.log('Post-init DSP info:');
                console.log('- Sample Rate:', dspInstance.getSampleRate ? dspInstance.getSampleRate() : 'N/A');
                console.log('- Num Inputs:', dspInstance.getNumInputs ? dspInstance.getNumInputs() : 'N/A');
                console.log('- Num Outputs:', dspInstance.getNumOutputs ? dspInstance.getNumOutputs() : 'N/A');
                
                // Test parameter access
                const testParams = ${JSON.stringify(metadata.ui[0]?.items.map((item: any) => ({ address: item.address, init: item.init })) || [])};
                testParams.forEach(param => {
                    if (dspInstance.getParamValue) {
                        const currentValue = dspInstance.getParamValue(param.address);
                        console.log('Parameter', param.address, 'current value:', currentValue, 'expected:', param.init);
                    }
                });
                
                const bufferSize = 1024;
                const numInputs = ${metadata.inputs};
                const numOutputs = ${metadata.outputs};
                
                console.log('DSP configuration:', { numInputs, numOutputs, bufferSize });
                
                // Allocate buffer space in shared memory at fixed locations
                // Use smaller, safer offsets to avoid memory issues
                const heapOffset = 4096; // Smaller offset, well within memory bounds
                const inputBufferOffset = heapOffset;
                const outputBufferOffset = inputBufferOffset + (Math.max(1, numInputs) * bufferSize * 4);
                const inputPtrOffset = outputBufferOffset + (numOutputs * bufferSize * 4);
                const outputPtrOffset = inputPtrOffset + (Math.max(1, numInputs) * 4);
                
                console.log('Memory layout:', { 
                    inputBufferOffset, 
                    outputBufferOffset, 
                    inputPtrOffset, 
                    outputPtrOffset 
                });
                
                // Check memory bounds
                const maxOffset = outputPtrOffset + (numOutputs * 4);
                console.log('Max memory offset needed:', maxOffset, 'of', memory.buffer.byteLength);
                if (maxOffset > memory.buffer.byteLength) {
                    throw new Error('Memory layout exceeds available buffer size');
                }
                
                // Set up pointer arrays in memory
                const memoryView = new Float32Array(memory.buffer);
                const ptrView = new Uint32Array(memory.buffer);
                
                // Setup input pointers (always allocate at least 1 for 0-input DSPs)
                const effectiveInputs = Math.max(1, numInputs);
                for (let i = 0; i < effectiveInputs; i++) {
                    ptrView[(inputPtrOffset / 4) + i] = inputBufferOffset + (i * bufferSize * 4);
                }
                
                // Setup output pointers  
                for (let i = 0; i < numOutputs; i++) {
                    ptrView[(outputPtrOffset / 4) + i] = outputBufferOffset + (i * bufferSize * 4);
                }
                
                statusDiv.textContent = 'Setting up audio processing...';
                console.log('Setting up audio processing for DSP with', numInputs, 'inputs and', numOutputs, 'outputs');
                
                // Create audio processor using ScriptProcessorNode
                // For 0-input DSPs, we still need at least 1 input for the ScriptProcessorNode
                const processorInputs = Math.max(1, numInputs);
                faustProcessor = audioContext.createScriptProcessor(bufferSize, processorInputs, numOutputs);
                
                let processCount = 0;
                
                // Set up audio processing
                faustProcessor.onaudioprocess = function(event) {
                    const inputBuffer = event.inputBuffer;
                    const outputBuffer = event.outputBuffer;
                    
                    try {
                        // Copy input data to WASM memory (only if DSP has inputs)
                        if (numInputs > 0) {
                            for (let channel = 0; channel < numInputs; channel++) {
                                const inputData = inputBuffer.getChannelData(channel);
                                const offset = (inputBufferOffset / 4) + (channel * bufferSize);
                                memoryView.set(inputData, offset);
                            }
                        } else {
                            // For 0-input DSPs, clear the input buffer to ensure clean state
                            const offset = (inputBufferOffset / 4);
                            memoryView.fill(0, offset, offset + bufferSize);
                        }
                        
                        // Call the DSP compute function with pointer arrays
                        if (dspInstance.compute) {
                            dspInstance.compute(bufferSize, inputPtrOffset, outputPtrOffset);
                        }
                        
                        // Copy output data from WASM memory
                        for (let channel = 0; channel < numOutputs; channel++) {
                            const outputData = outputBuffer.getChannelData(channel);
                            const offset = (outputBufferOffset / 4) + (channel * bufferSize);
                            const wasmOutput = memoryView.subarray(offset, offset + bufferSize);
                            outputData.set(wasmOutput);
                        }
                        
                        // Debug output every 100 process cycles
                        if (processCount % 100 === 0) {
                            console.log('DSP processing cycle', processCount, '- using compiled WebAssembly DSP, not test tone');
                            if (numInputs === 0) {
                                // For 0-input DSPs, show output level to verify it's working
                                const outputData = outputBuffer.getChannelData(0);
                                const rms = Math.sqrt(outputData.reduce((sum, val) => sum + val * val, 0) / outputData.length);
                                console.log('Output RMS level:', rms.toFixed(6));
                            }
                        }
                        processCount++;
                        
                    } catch (e) {
                        console.error('Audio processing error:', e);
                        // Fallback: silence the output
                        for (let channel = 0; channel < numOutputs; channel++) {
                            const outputData = outputBuffer.getChannelData(channel);
                            outputData.fill(0);
                        }
                    }
                };
                
                statusDiv.textContent = 'Audio system ready - DSP WebAssembly loaded';
                statusDiv.className = 'status success';                } catch (error) {
                    statusDiv.textContent = 'Error: ' + error.message;
                    statusDiv.className = 'status error';
                    console.error('Audio initialization error:', error);
                    console.log('Available DSP functions:', Object.keys(dspInstance || {}));
                    console.log('Memory buffer size:', memory.buffer.byteLength);
                }
        }

        // Start audio processing
        async function startAudio() {
            if (!audioContext) {
                await initAudio();
            }
            
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }
            
            if (faustProcessor) {
                faustProcessor.connect(audioContext.destination);
                console.log('Audio processor connected to destination');
                console.log('AudioContext state:', audioContext.state);
                console.log('AudioContext sample rate:', audioContext.sampleRate);
                console.log('Processor buffer size:', faustProcessor.bufferSize);
            }
            
            isRunning = true;
            startBtn.disabled = true;
            stopBtn.disabled = false;
            statusDiv.textContent = 'Audio running - using compiled DSP WebAssembly';
            statusDiv.className = 'status success';
            
            // Log current parameter values for debugging
            console.log('Current DSP parameters at start:');
            const params = ${JSON.stringify(metadata.ui[0]?.items.map((item: any) => ({ address: item.address, init: item.init })) || [])};
            params.forEach(param => {
                if (dspInstance && dspInstance.getParamValue) {
                    const currentValue = dspInstance.getParamValue(param.address);
                    console.log(\`- \${param.address}: \${currentValue}\`);
                }
            });
        }

        // Stop audio processing
        function stopAudio() {
            if (faustProcessor) {
                faustProcessor.disconnect();
            }
            isRunning = false;
            startBtn.disabled = false;
            stopBtn.disabled = true;
            statusDiv.textContent = 'Audio stopped';
            statusDiv.className = 'status';
        }

        // Event listeners
        startBtn.addEventListener('click', startAudio);
        stopBtn.addEventListener('click', stopAudio);

        // Initialize on load
        window.addEventListener('load', () => {
            // Wait for faust-ui to be available
            function tryInitUI(attempts = 0) {
                if (typeof FaustUI !== 'undefined' && FaustUI.FaustUI) {
                    initFaustUI();
                    statusDiv.textContent = 'Click "Start Audio" to begin';
                } else if (attempts < 10) {
                    statusDiv.textContent = \`Loading UI components... (\${attempts + 1}/10)\`;
                    statusDiv.className = 'status';
                    setTimeout(() => tryInitUI(attempts + 1), 500);
                } else {
                    statusDiv.textContent = 'Error: Failed to load faust-ui library. Check internet connection.';
                    statusDiv.className = 'status error';
                    console.error('Failed to load faust-ui after 10 attempts');
                }
            }
            
            tryInitUI();
        });
    </script>
</body>
</html>`;
}

// This method is called when your extension is deactivated
export async function deactivate() {
  if (client) {
    outputChannel.appendLine('Stopping Faust LSP...');
    await client.stop();
    outputChannel.appendLine('Faust LSP stopped');
  }
}

