// Minimal DSP test to debug the parameter issue
const fs = require('fs');

async function minimalTest() {
    try {
        console.log('Minimal DSP test...');
        
        const wasmData = fs.readFileSync('build/test.wasm');
        const metadata = JSON.parse(fs.readFileSync('build/test-meta.json', 'utf8'));
        
        console.log('Parameters from metadata:');
        metadata.ui[0].items.forEach(item => {
            console.log(`- ${item.label}: ${item.address} (init: ${item.init}, type: ${item.type})`);
        });
        
        // Try the minimal WASM setup
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
        console.log('✓ WASM instantiated');
        
        // Try just the basic init
        console.log('Initializing DSP...');
        dsp.init(44100);
        console.log('Sample rate:', dsp.getSampleRate());
        console.log('Inputs:', dsp.getNumInputs());
        console.log('Outputs:', dsp.getNumOutputs());
        
        // Try instanceInit
        dsp.instanceInit(44100);
        console.log('✓ instanceInit called');
        
        // Try instanceConstants
        dsp.instanceConstants(44100);
        console.log('✓ instanceConstants called');
        
        // Try instanceClear
        dsp.instanceClear();
        console.log('✓ instanceClear called');
        
        // Try setting parameters before instanceResetUserInterface
        console.log('\\nTesting parameter access BEFORE instanceResetUserInterface...');
        try {
            dsp.setParamValue('/test/frequency', 880);
            console.log('Set frequency to 880');
            const freq = dsp.getParamValue('/test/frequency');
            console.log('Frequency value:', freq);
        } catch (e) {
            console.log('Error setting frequency:', e.message);
        }
        
        // Try instanceResetUserInterface
        dsp.instanceResetUserInterface();
        console.log('✓ instanceResetUserInterface called');
        
        // Try setting parameters AFTER instanceResetUserInterface
        console.log('\\nTesting parameter access AFTER instanceResetUserInterface...');
        try {
            dsp.setParamValue('/test/frequency', 880);
            console.log('Set frequency to 880');
            const freq = dsp.getParamValue('/test/frequency');
            console.log('Frequency value:', freq);
            
            dsp.setParamValue('/test/gain', 0.7);
            console.log('Set gain to 0.7');
            const gain = dsp.getParamValue('/test/gain');
            console.log('Gain value:', gain);
        } catch (e) {
            console.log('Error setting parameters:', e.message);
        }
        
        console.log('\\nTesting all parameters from metadata:');
        metadata.ui[0].items.forEach(item => {
            try {
                const currentValue = dsp.getParamValue(item.address);
                console.log(`${item.address}: ${currentValue}`);
            } catch (e) {
                console.log(`${item.address}: ERROR - ${e.message}`);
            }
        });
        
    } catch (error) {
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

minimalTest();
