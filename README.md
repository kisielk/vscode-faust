# Faust Language Support for VS Code

A VS Code extension for [Faust](https://faust.grame.fr/) (Functional AUdio STream) - a functional programming language specifically designed for real-time signal processing and sound synthesis.

## Features

- **Syntax Highlighting**: Full syntax highlighting for Faust code
- **Language Server Protocol (LSP)**: Integration with [faustlsp](https://github.com/carn181/faustlsp) for advanced language features
- **Code Snippets**: Common Faust patterns and library functions
- **Auto-completion**: Intelligent code completion (via LSP)
- **Error Diagnostics**: Real-time error reporting and syntax checking
- **Configuration Management**: Automatic handling of Faust configuration files
- **Multiple File Support**: Support for `.dsp` and `.lib` files
- **WebAssembly Compilation**: Compile Faust code to WebAssembly using faustwasm
- **Interactive UI Testing**: Launch compiled WebAssembly with professional faust-ui components
- **Real-time Audio Processing**: Test your DSP with interactive controls in VS Code webview
- **Interactive WebAssembly Testing**: Launch compiled WebAssembly in a VS Code webview for real-time audio testing with parameter controls

## Installation

1. Install the extension from the VS Code marketplace
2. Install the Faust LSP server: [faustlsp](https://github.com/carn181/faustlsp)
3. Create a `.faustcfg.json` file in your workspace root (or use the command palette)

## Requirements

- **faustlsp**: The Faust Language Server Protocol implementation (optional, for LSP features)
- **Faust compiler**: For full functionality, install the Faust compiler (optional, for traditional compilation)
- **faustwasm**: WebAssembly version of the Faust compiler (included with the extension)
- **Internet connection**: Required for loading faust-ui components in the webview (loaded from CDN)

## Configuration

The extension can be configured through VS Code settings:

```json
{
  "faust.lsp.enabled": true,
  "faust.lsp.executable": "faustlsp",
  "faust.configFile": ".faustcfg.json"
}
```

### Configuration File

Create a `.faustcfg.json` file in your workspace root:

```json
{
  "command": "faust",              // Faust Compiler Executable to use
  "process_name": "process",       // Process Name passed as -pn to compiler
  "process_files": ["a.dsp"],      // Files that have top-level processes defined
  "compiler_diagnostics": true     // Show Compiler Errors 
}
```

## Commands

- **Faust: Restart LSP** - Restart the Faust Language Server
- **Faust: Create Config File** - Create a default `.faustcfg.json` file
- **Faust: Compile Current File (WebAssembly)** - Compile the current DSP file to WebAssembly
- **Faust: Launch WebAssembly in Browser** - Launch the compiled WebAssembly in a VS Code webview for interactive testing

## Keyboard Shortcuts

- **Ctrl+Shift+B** (Cmd+Shift+B on Mac) - Compile current DSP file to WebAssembly
- **Ctrl+Shift+L** (Cmd+Shift+L on Mac) - Launch WebAssembly in webview

## Usage

1. Open a folder containing Faust files (`.dsp` or `.lib` extensions)
2. The extension will automatically detect Faust files and provide syntax highlighting
3. If `faustlsp` is installed and configured, you'll get advanced features like:
   - Auto-completion
   - Error diagnostics
   - Go to definition
   - Hover information
4. Use the compilation commands to compile your Faust DSP files:
   - Right-click in a `.dsp` file and select compilation options
   - Use the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and search for "Faust: Compile"
   - Compiled files will be saved in a `build` folder next to your source file

### WebAssembly Compilation

The extension uses the **faustwasm** library to compile Faust DSP code directly within VS Code:

- **Faust: Compile Current File (WebAssembly)** - Compiles to WebAssembly (.wasm) and generates metadata JSON

### Interactive WebAssembly Testing

The extension provides an innovative feature to test your compiled DSP directly within VS Code using the professional **faust-ui** library:

1. **Compile** your DSP file to WebAssembly using the compile command
2. **Launch** the WebAssembly in a VS Code webview using the "Launch WebAssembly in Browser" command
3. **Test** your DSP with:
   - Real-time audio processing
   - Professional UI controls (automatically generated from your DSP UI elements using faust-ui)
   - Native Faust UI components (sliders, knobs, buttons, bargraphs, etc.)
   - Visual feedback with compilation information
   - Start/stop audio controls

The webview provides a complete audio testing environment with:
- **faust-ui Integration**: Professional, native-looking Faust UI components
- **Automatic Layout**: Intelligent grid-based layout system
- **Real-time Parameters**: Interactive parameter control with proper scaling and units
- **VS Code Theme Integration**: Components automatically match your VS Code theme
- **Audio Context Management**: Proper Web Audio API integration
- **Error Handling**: Comprehensive error reporting and status feedback

**Supported UI Elements:**
- `hslider` / `vslider` - Horizontal and vertical sliders
- `knob` - Rotary controls
- `button` - Momentary and toggle buttons
- `checkbox` - Boolean controls
- `nentry` - Numeric entry fields
- `hbargraph` / `vbargraph` - Level meters and displays
- `menu` / `radio` - Selection controls
- `vgroup` / `hgroup` / `tgroup` - Layout containers

**Access the launch feature:**
- Right-click in a `.dsp` file → "Launch WebAssembly in Browser"
- Use keyboard shortcut `Ctrl+Shift+L` (Cmd+Shift+L on Mac)
- Command Palette → "Faust: Launch WebAssembly in Browser"
- Click the browser icon in the editor title bar

Example output structure:
```
my-project/
├── oscillator.dsp
└── build/
    ├── oscillator.wasm
    └── oscillator-meta.json
```

### Example DSP File

Create a simple oscillator (`oscillator.dsp`):
```faust
import("stdfaust.lib");

freq = hslider("frequency", 440, 50, 2000, 0.1);
gain = hslider("gain", 0.5, 0, 1, 0.01);

process = os.osc(freq) * gain;
```

Then use **Faust: Compile Current File (WebAssembly)** to generate WebAssembly version ready for use in web applications.

## Code Snippets

The extension includes snippets for common Faust patterns:

- `process` - Basic process block
- `import` - Import statement
- `component` - Component definition
- `declare` - Declare metadata
- `osc` - Oscillator
- `filter` - Filter functions
- `envelope` - Envelope generators
- And many more...

## Supported File Types

- `.dsp` - Faust DSP files
- `.lib` - Faust library files

## Development

To contribute to this extension:

1. Clone the repository
2. Run `npm install` to install dependencies
3. Open in VS Code and press `F5` to start debugging
4. Make your changes and submit a pull request

## Known Issues

- LSP features require `faustlsp` to be installed and properly configured
- Currently supports only one workspace folder at a time

## Release Notes

### 0.1.0

- Initial release with full Faust language support
- LSP integration with faustlsp
- Syntax highlighting and code snippets
- Configuration management
- Command palette integration

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

This extension is licensed under the MIT License.

## Links

- [Faust Website](https://faust.grame.fr/)
- [Faust Documentation](https://faustdoc.grame.fr/)
- [faustlsp](https://github.com/carn181/faustlsp)
- [Faust Libraries](https://github.com/grame-cncm/faustlibraries)

## Audio Processing Details

**Important:** The extension uses the **compiled DSP WebAssembly** for audio processing, not a test tone. When you click "Start Audio":

1. The compiled WebAssembly module is loaded and instantiated
2. The DSP is initialized with the audio context sample rate
3. Parameters are set to their initial values from the metadata
4. A ScriptProcessorNode is created to process audio in real-time
5. The audio processing loop calls the DSP's `compute()` function with actual audio buffers
6. The faust-ui controls directly modify the DSP parameters using `setParamValue()`

**What you hear is the output of your compiled Faust DSP code, not a test tone!**

If your DSP is a simple oscillator (like `process = os.osc(freq) * gain;`), it will sound like a sine wave because that's what the DSP generates.

### Debugging Audio Processing

To verify the DSP is working:
1. Open the browser developer tools in the webview (right-click → Inspect)
2. Check the console for messages like "DSP processing cycle X - using compiled WebAssembly DSP, not test tone"
3. Try changing parameters in the UI - you should see the sound change in real-time
4. The status bar shows "Audio running - using compiled DSP WebAssembly"
