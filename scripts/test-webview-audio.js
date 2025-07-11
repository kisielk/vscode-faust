// Simple test for webview audio processing
const fs = require('fs');

console.log('Testing webview-style audio processing...');

// Read files
const wasmData = fs.readFileSync('build/test.wasm');
const metadata = JSON.parse(fs.readFileSync('build/test-meta.json', 'utf8'));

console.log('DSP info:', { 
    inputs: metadata.inputs, 
    outputs: metadata.outputs, 
    parameters: metadata.ui[0].items.map(p => p.label) 
});

async function testWebviewAudio() {
    try {
        // Create the same setup as the webview
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

        const dspInstance = wasmInstance.exports;
        console.log('Available DSP functions:', Object.keys(dspInstance));

        // Initialize DSP (same as webview)
        dspInstance.init(44100);
        dspInstance.instanceInit(44100);
        dspInstance.instanceConstants(44100);
        dspInstance.instanceClear();
        dspInstance.instanceResetUserInterface();

        // Set initial parameter values
        const initialParams = metadata.ui[0].items.map(item => ({ address: item.address, init: item.init }));
        console.log('Setting initial parameters:', initialParams);
        initialParams.forEach(param => {
            dspInstance.setParamValue(param.address, param.init);
            const actualValue = dspInstance.getParamValue(param.address);
            console.log(`Parameter ${param.address}: set to ${param.init}, actual value ${actualValue}`);
        });

        // Set up memory layout (same as webview)
        const bufferSize = 1024;
        const numInputs = metadata.inputs;
        const numOutputs = metadata.outputs;

        const heapOffset = 4096;
        const inputBufferOffset = heapOffset;
        const outputBufferOffset = inputBufferOffset + (Math.max(1, numInputs) * bufferSize * 4);
        const inputPtrOffset = outputBufferOffset + (numOutputs * bufferSize * 4);
        const outputPtrOffset = inputPtrOffset + (Math.max(1, numInputs) * 4);

        console.log('Memory layout:', { inputBufferOffset, outputBufferOffset, inputPtrOffset, outputPtrOffset });

        // Set up memory views
        const memoryView = new Float32Array(memory.buffer);
        const ptrView = new Uint32Array(memory.buffer);

        // Setup input pointers
        const effectiveInputs = Math.max(1, numInputs);
        for (let i = 0; i < effectiveInputs; i++) {
            ptrView[(inputPtrOffset / 4) + i] = inputBufferOffset + (i * bufferSize * 4);
        }

        // Setup output pointers  
        for (let i = 0; i < numOutputs; i++) {
            ptrView[(outputPtrOffset / 4) + i] = outputBufferOffset + (i * bufferSize * 4);
        }

        // Clear input buffer for 0-input DSPs
        if (numInputs === 0) {
            const offset = inputBufferOffset / 4;
            memoryView.fill(0, offset, offset + bufferSize);
        }

        // Process audio
        console.log('Processing audio...');
        dspInstance.compute(bufferSize, inputPtrOffset, outputPtrOffset);

        // Check output
        const outputOffset = outputBufferOffset / 4;
        const outputData = memoryView.subarray(outputOffset, outputOffset + bufferSize);

        const rms = Math.sqrt(outputData.reduce((sum, val) => sum + val * val, 0) / outputData.length);
        const peak = Math.max(...outputData.map(Math.abs));

        console.log('Audio output:');
        console.log('- RMS level:', rms.toFixed(6));
        console.log('- Peak level:', peak.toFixed(6));
        console.log('- First 5 samples:', Array.from(outputData.slice(0, 5)).map(x => x.toFixed(6)));

        if (rms > 0.001) {
            console.log('✓ SUCCESS: DSP is generating audio output!');
            console.log('The webview should work with these settings.');
        } else {
            console.log('✗ ISSUE: DSP output is silent or too quiet');
            console.log('Check parameter values and DSP initialization.');
        }

    } catch (error) {
        console.error('✗ Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

testWebviewAudio();
