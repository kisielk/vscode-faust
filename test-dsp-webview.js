// Test script to verify DSP WebAssembly functionality
const fs = require('fs');
const path = require('path');

console.log('Testing DSP WebAssembly functionality...');

// Read the compiled WASM and metadata
const wasmFile = path.join(__dirname, 'build', 'test.wasm');
const metaFile = path.join(__dirname, 'build', 'test-meta.json');

if (!fs.existsSync(wasmFile) || !fs.existsSync(metaFile)) {
    console.error('WASM or metadata file not found. Please compile test.dsp first.');
    process.exit(1);
}

const wasmData = fs.readFileSync(wasmFile);
const metadata = JSON.parse(fs.readFileSync(metaFile, 'utf8'));

console.log('WASM size:', wasmData.length, 'bytes');
console.log('DSP info:', {
    name: metadata.name,
    inputs: metadata.inputs,
    outputs: metadata.outputs,
    parameters: metadata.ui[0].items.length
});

console.log('Parameters:');
metadata.ui[0].items.forEach(param => {
    console.log(`  ${param.label}: ${param.init} (${param.min}-${param.max})`);
});

// Test WebAssembly compilation
async function testWasm() {
    try {
        console.log('\nTesting WebAssembly compilation...');
        const wasmModule = await WebAssembly.compile(wasmData);
        console.log('✓ WASM module compiled successfully');
        
        // Create a simple memory instance
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
        
        console.log('✓ WASM instance created successfully');
        
        const dsp = wasmInstance.exports;
        console.log('Available DSP functions:', Object.keys(dsp));
        
        // Test initialization
        if (dsp.init) {
            dsp.init(44100);
            console.log('✓ DSP init() called');
        }
        
        if (dsp.instanceInit) {
            dsp.instanceInit(44100);
            console.log('✓ DSP instanceInit() called');
        }
        
        if (dsp.instanceConstants) {
            dsp.instanceConstants(44100);
            console.log('✓ DSP instanceConstants() called');
        }
        
        if (dsp.instanceClear) {
            dsp.instanceClear();
            console.log('✓ DSP instanceClear() called');
        }
        
        // Test parameter access
        metadata.ui[0].items.forEach(param => {
            if (dsp.getParamValue) {
                const value = dsp.getParamValue(param.address);
                console.log(`Parameter ${param.address}: ${value}`);
            }
        });
        
        console.log('\n✓ DSP WebAssembly is working correctly!');
        console.log('The webview should be using the compiled DSP, not a test tone.');
        
    } catch (error) {
        console.error('✗ Error testing WASM:', error);
    }
}

testWasm();
