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

## Installation

1. Install the extension from the VS Code marketplace
2. Install the Faust LSP server: [faustlsp](https://github.com/carn181/faustlsp)
3. Create a `.faustcfg.json` file in your workspace root (or use the command palette)

## Requirements

- **faustlsp**: The Faust Language Server Protocol implementation
- **Faust compiler**: For full functionality, install the Faust compiler

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

## Usage

1. Open a folder containing Faust files (`.dsp` or `.lib` extensions)
2. The extension will automatically detect Faust files and provide syntax highlighting
3. If `faustlsp` is installed and configured, you'll get advanced features like:
   - Auto-completion
   - Error diagnostics
   - Go to definition
   - Hover information

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
