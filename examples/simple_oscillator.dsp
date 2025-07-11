// Example Faust DSP file
// Simple sine wave oscillator with volume control

import("stdfaust.lib");

// Declare some metadata
declare name "Simple Oscillator";
declare description "A basic sine wave oscillator with volume control";
declare author "Faust Example";
declare version "1.0";

// Create a simple oscillator with frequency and volume controls
freq = hslider("Frequency", 440, 50, 2000, 0.01);
vol = hslider("Volume", 0.5, 0, 1, 0.01);

// Process function - the main DSP processing
process = os.osc(freq) * vol;
