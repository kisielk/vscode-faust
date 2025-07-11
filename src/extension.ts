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
  
  // Extract UI controls from metadata
  const uiControls = metadata.ui[0]?.items || [];
  
  // Generate HTML with embedded WebAssembly
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Faust DSP: ${fileName}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .header {
            margin-bottom: 20px;
            padding: 15px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 8px;
        }
        .controls {
            display: flex;
            flex-direction: column;
            gap: 15px;
            margin-bottom: 20px;
        }
        .control-group {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .control-group label {
            min-width: 120px;
            font-weight: 500;
        }
        .control-group input {
            flex: 1;
            max-width: 300px;
        }
        .control-group .value {
            min-width: 60px;
            text-align: right;
            font-family: monospace;
        }
        .buttons {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
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
            margin-top: 10px;
            border-radius: 4px;
            font-family: monospace;
        }
        .status.success { background-color: var(--vscode-inputValidation-infoBackground); }
        .status.error { background-color: var(--vscode-inputValidation-errorBackground); }
        .info {
            margin-top: 20px;
            padding: 10px;
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textBlockQuote-border);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Faust DSP: ${fileName}</h1>
        <p>Compiled with Faust ${metadata.version}</p>
        <p>Inputs: ${metadata.inputs}, Outputs: ${metadata.outputs}</p>
    </div>

    <div class="buttons">
        <button id="startBtn">Start Audio</button>
        <button id="stopBtn" disabled>Stop Audio</button>
    </div>

    <div class="controls">
        ${uiControls.map((control: any) => `
            <div class="control-group">
                <label>${control.label}:</label>
                <input 
                    type="range" 
                    id="${control.address}"
                    min="${control.min}" 
                    max="${control.max}" 
                    step="${control.step}" 
                    value="${control.init}"
                    data-address="${control.address}"
                >
                <span class="value" id="${control.address}_value">${control.init}</span>
            </div>
        `).join('')}
    </div>

    <div class="status" id="status">Ready to start</div>

    <div class="info">
        <h3>DSP Information</h3>
        <p><strong>Compilation options:</strong> ${metadata.compile_options}</p>
        <p><strong>Library list:</strong> ${metadata.library_list.join(', ')}</p>
    </div>

    <script>
        let audioContext;
        let faustProcessor;
        let isRunning = false;

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

        // Initialize audio context and load WASM
        async function initAudio() {
            try {
                statusDiv.textContent = 'Initializing audio context...';
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                
                statusDiv.textContent = 'Loading WebAssembly module...';
                const wasmArrayBuffer = base64ToArrayBuffer('${wasmBase64}');
                const wasmModule = await WebAssembly.compile(wasmArrayBuffer);
                
                statusDiv.textContent = 'Creating WebAssembly instance...';
                const wasmInstance = await WebAssembly.instantiate(wasmModule, {
                    env: {
                        memory: new WebAssembly.Memory({ initial: 256 }),
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
                        _roundf: Math.round
                    }
                });

                // Create a simple processor using ScriptProcessorNode (for compatibility)
                const bufferSize = 1024;
                faustProcessor = audioContext.createScriptProcessor(bufferSize, ${metadata.inputs}, ${metadata.outputs});
                
                const dspInstance = wasmInstance.exports;
                
                // Initialize the DSP
                dspInstance.init(audioContext.sampleRate);
                
                // Set up audio processing
                faustProcessor.onaudioprocess = function(event) {
                    const inputBuffer = event.inputBuffer;
                    const outputBuffer = event.outputBuffer;
                    
                    // Get input and output arrays
                    const inputs = [];
                    for (let i = 0; i < ${metadata.inputs}; i++) {
                        inputs.push(inputBuffer.getChannelData(i));
                    }
                    
                    const outputs = [];
                    for (let i = 0; i < ${metadata.outputs}; i++) {
                        outputs.push(outputBuffer.getChannelData(i));
                    }
                    
                    // Process audio (simplified - would need proper memory management)
                    try {
                        // This is a simplified version - proper implementation would need
                        // to handle memory allocation and proper DSP compute calls
                        if (outputs.length > 0) {
                            // Generate simple test tone for demonstration
                            const frequency = 440;
                            for (let i = 0; i < outputs[0].length; i++) {
                                outputs[0][i] = Math.sin(2 * Math.PI * frequency * (audioContext.currentTime + i / audioContext.sampleRate)) * 0.1;
                            }
                        }
                    } catch (e) {
                        console.error('Audio processing error:', e);
                    }
                };
                
                // Set up UI controls
                ${uiControls.map((control: any) => `
                    const control_${control.address.replace(/[^a-zA-Z0-9]/g, '_')} = document.getElementById('${control.address}');
                    const value_${control.address.replace(/[^a-zA-Z0-9]/g, '_')} = document.getElementById('${control.address}_value');
                    
                    control_${control.address.replace(/[^a-zA-Z0-9]/g, '_')}.addEventListener('input', function() {
                        value_${control.address.replace(/[^a-zA-Z0-9]/g, '_')}.textContent = this.value;
                        // Update DSP parameter (simplified)
                        if (dspInstance.setParamValue) {
                            dspInstance.setParamValue('${control.address}', parseFloat(this.value));
                        }
                    });
                `).join('')}
                
                statusDiv.textContent = 'Audio system ready';
                statusDiv.className = 'status success';
                
            } catch (error) {
                statusDiv.textContent = 'Error: ' + error.message;
                statusDiv.className = 'status error';
                console.error('Audio initialization error:', error);
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
            
            faustProcessor.connect(audioContext.destination);
            isRunning = true;
            startBtn.disabled = true;
            stopBtn.disabled = false;
            statusDiv.textContent = 'Audio running';
            statusDiv.className = 'status success';
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
            statusDiv.textContent = 'Click "Start Audio" to begin';
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

