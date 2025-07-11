// Test different initialization sequence
const fs = require('fs');

async function testInitSequence() {
    try {
        console.log('Testing different initialization sequence...');
        
        const wasmData = fs.readFileSync('build/test.wasm');
        const metadata = JSON.parse(fs.readFileSync('build/test-meta.json', 'utf8'));
        
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
        
        console.log('\\n=== Testing different initialization order ===');
        
        // Method 1: Try init first, then others
        console.log('\\nMethod 1: init -> instanceInit -> instanceConstants -> instanceResetUserInterface');
        dsp.init(44100);
        dsp.instanceInit(44100);
        dsp.instanceConstants(44100);
        dsp.instanceResetUserInterface();
        
        console.log('Testing parameters after Method 1:');
        console.log('- frequency:', dsp.getParamValue('/test/frequency'));
        console.log('- gain:', dsp.getParamValue('/test/gain'));
        
        // Method 2: Try without instanceClear
        console.log('\\nMethod 2: Re-init without instanceClear');
        dsp.init(44100);
        dsp.instanceInit(44100);
        dsp.instanceConstants(44100);
        dsp.instanceResetUserInterface();
        
        console.log('Testing parameters after Method 2:');
        console.log('- frequency:', dsp.getParamValue('/test/frequency'));
        console.log('- gain:', dsp.getParamValue('/test/gain'));
        
        // Method 3: Try setting parameters right after instanceResetUserInterface
        console.log('\\nMethod 3: Set params immediately after instanceResetUserInterface');
        dsp.instanceResetUserInterface();
        
        // Set the default values immediately
        dsp.setParamValue('/test/frequency', 440);
        dsp.setParamValue('/test/gain', 0.5);
        
        console.log('Testing parameters after Method 3:');
        console.log('- frequency:', dsp.getParamValue('/test/frequency'));
        console.log('- gain:', dsp.getParamValue('/test/gain'));
        
        // Method 4: Test with minimal setup and try to call compute
        console.log('\\nMethod 4: Minimal setup and test compute');
        
        // Use a simple memory layout for testing
        const bufferSize = 128;
        const inputPtr = 1024;
        const outputPtr = 2048;
        
        // Set up minimal buffers
        const memoryView = new Float32Array(memory.buffer);
        const ptrView = new Uint32Array(memory.buffer);
        
        // Set up pointers
        ptrView[inputPtr / 4] = 8192; // Input buffer at offset 8192
        ptrView[outputPtr / 4] = 12288; // Output buffer at offset 12288
        
        // Clear input buffer
        memoryView.fill(0, 8192 / 4, (8192 / 4) + bufferSize);
        
        try {
            console.log('Calling compute...');
            dsp.compute(bufferSize, inputPtr, outputPtr);
            
            // Check output
            const outputData = memoryView.subarray(12288 / 4, (12288 / 4) + bufferSize);
            const rms = Math.sqrt(outputData.reduce((sum, val) => sum + val * val, 0) / outputData.length);
            console.log('RMS after compute:', rms.toFixed(6));
            
            if (rms > 0.001) {
                console.log('✓ SUCCESS: DSP is generating audio!');
            } else {
                console.log('✗ DSP output is silent');
            }
            
        } catch (e) {
            console.log('Error calling compute:', e.message);
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testInitSequence();
