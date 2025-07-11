import { instantiateFaustModuleFromFile, LibFaust, FaustCompiler } from '@grame/faustwasm/dist/esm/index.js';
import { promises as fs } from 'fs';
import path from 'path';

// Test the extension's WebAssembly compilation
(async () => {
  try {
    // Initialize faustwasm
    const libfaustPath = path.resolve('./node_modules/@grame/faustwasm/libfaust-wasm/libfaust-wasm.js');
    const faustModuleInstance = await instantiateFaustModuleFromFile(libfaustPath);
    const libFaust = new LibFaust(faustModuleInstance);
    const compiler = new FaustCompiler(libFaust);
    
    console.log('Testing extension WebAssembly compilation...');
    console.log('LibFaust version:', libFaust.version());
    
    // Read the test DSP file
    const dspFile = 'test.dsp';
    const faustCode = await fs.readFile(dspFile, 'utf8');
    const fileName = path.basename(dspFile, '.dsp');
    const outputDir = 'build';
    
    console.log('\nCompiling:', fileName);
    console.log('DSP code:', faustCode.trim());
    
    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });
    
    // Compile to WebAssembly
    const compilationOptions = '-I libraries/';
    const wasmFactory = await compiler.createMonoDSPFactory(fileName, faustCode, compilationOptions);
    
    if (wasmFactory) {
      console.log('\n✓ Successfully compiled to WebAssembly');
      
      // Save the WebAssembly module
      const wasmFile = path.join(outputDir, `${fileName}.wasm`);
      await fs.writeFile(wasmFile, wasmFactory.code);
      console.log(`  WASM saved to: ${wasmFile} (${wasmFactory.code.length} bytes)`);
      
      // Save the metadata JSON
      const metaFile = path.join(outputDir, `${fileName}-meta.json`);
      await fs.writeFile(metaFile, wasmFactory.json);
      console.log(`  Metadata saved to: ${metaFile} (${wasmFactory.json.length} chars)`);
      
      // Parse and display some metadata
      const metadata = JSON.parse(wasmFactory.json);
      console.log('\nDSP Information:');
      console.log('  Name:', metadata.name);
      console.log('  Inputs:', metadata.inputs);
      console.log('  Outputs:', metadata.outputs);
      console.log('  UI controls:', metadata.ui[0].items.length);
      
      // Clean up
      compiler.deleteDSPFactory(wasmFactory);
      
      console.log('\n✓ Compilation test successful!');
    } else {
      console.log('\n✗ Failed to compile to WebAssembly');
      const errorMsg = compiler.getErrorMessage();
      if (errorMsg) {
        console.log('  Error:', errorMsg);
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
})();
