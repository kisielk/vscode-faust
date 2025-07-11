// Test script to verify 0-input DSP audio processing
const fs = require('fs');

console.log('Testing 0-input DSP audio processing...');

// Read the compiled files
const wasmData = fs.readFileSync('build/test.wasm');
const metadata = JSON.parse(fs.readFileSync('build/test-meta.json', 'utf8'));

console.log('DSP Configuration:');
console.log('- Inputs:', metadata.inputs);
console.log('- Outputs:', metadata.outputs);
console.log('- Parameters:', metadata.ui[0].items.map(p => `${p.label}=${p.init}`).join(', '));

// Test WebAssembly instantiation and processing
async function testDSP() {
    try {
        // Compile and instantiate the WASM module
        const wasmModule = await WebAssembly.compile(wasmData);
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
        
        const dsp = wasmInstance.exports;
        console.log('✓ WebAssembly instantiated successfully');
        
        // Initialize DSP
        dsp.init(44100);
        dsp.instanceInit(44100);
        dsp.instanceConstants(44100);
        dsp.instanceClear();
        
        console.log('✓ DSP initialized');
        
        // Set parameters to audible values
        dsp.setParamValue('/test/frequency', 440);
        dsp.setParamValue('/test/gain', 0.5);
        
        // Verify parameters
        const freq = dsp.getParamValue('/test/frequency');
        const gain = dsp.getParamValue('/test/gain');
        console.log('Parameters set - frequency:', freq, 'gain:', gain);
        
        // Test audio processing
        const bufferSize = 256;
        const numInputs = 0;
        const numOutputs = 1;
        
        // Set up memory layout - use smaller offsets to avoid out-of-bounds
        const heapOffset = 4096; // Smaller offset
        const inputBufferOffset = heapOffset;
        const outputBufferOffset = inputBufferOffset + (Math.max(1, numInputs) * bufferSize * 4);
        const inputPtrOffset = outputBufferOffset + (numOutputs * bufferSize * 4);
        const outputPtrOffset = inputPtrOffset + (Math.max(1, numInputs) * 4);
        
        console.log('Memory layout:', { inputBufferOffset, outputBufferOffset, inputPtrOffset, outputPtrOffset });
        console.log('Memory buffer size:', memory.buffer.byteLength);
        
        // Check if we're within memory bounds
        const maxOffset = outputPtrOffset + (numOutputs * 4);
        console.log('Max memory offset needed:', maxOffset);
        if (maxOffset > memory.buffer.byteLength) {
            console.log('✗ Memory layout exceeds buffer size!');
            return;
        }
        
        // Set up pointer arrays
        const memoryView = new Float32Array(memory.buffer);
        const ptrView = new Uint32Array(memory.buffer);
        
        // Setup input pointers (at least 1 for 0-input DSPs)
        const effectiveInputs = Math.max(1, numInputs);
        for (let i = 0; i < effectiveInputs; i++) {
            ptrView[(inputPtrOffset / 4) + i] = inputBufferOffset + (i * bufferSize * 4);
        }
        
        // Setup output pointers  
        for (let i = 0; i < numOutputs; i++) {
            ptrView[(outputPtrOffset / 4) + i] = outputBufferOffset + (i * bufferSize * 4);
        }
        
        // Clear input buffer for 0-input DSPs
        const inputOffset = inputBufferOffset / 4;
        memoryView.fill(0, inputOffset, inputOffset + bufferSize);
        
        // Process audio
        console.log('Processing audio...');
        dsp.compute(bufferSize, inputPtrOffset, outputPtrOffset);
        
        // Check output
        const outputOffset = outputBufferOffset / 4;
        const outputData = memoryView.subarray(outputOffset, outputOffset + bufferSize);
        
        // Calculate RMS and peak
        const rms = Math.sqrt(outputData.reduce((sum, val) => sum + val * val, 0) / outputData.length);
        const peak = Math.max(...outputData.map(Math.abs));
        
        console.log('Output analysis:');
        console.log('- RMS level:', rms.toFixed(6));
        console.log('- Peak level:', peak.toFixed(6));
        console.log('- First 10 samples:', Array.from(outputData.slice(0, 10)).map(x => x.toFixed(6)));
        
        if (rms > 0.001) {
            console.log('✓ DSP is generating audio output!');
        } else {
            console.log('✗ DSP output is silent or too quiet');
        }
        
    } catch (error) {
        console.error('✗ Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

testDSP();
