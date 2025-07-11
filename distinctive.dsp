import("stdfaust.lib");

// A more distinctive DSP to prove it's not a test tone
// This creates a frequency-modulated oscillator with a low-frequency modulation
freq = hslider("Frequency", 440, 50, 2000, 0.1);
gain = hslider("Volume", 0.5, 0, 1, 0.01);
mod_freq = hslider("Modulation Frequency", 2, 0.1, 20, 0.1);
mod_depth = hslider("Modulation Depth", 50, 0, 200, 1);

// Create a frequency-modulated oscillator
// The frequency modulation makes it clearly distinguishable from a simple sine wave
lfo = os.osc(mod_freq) * mod_depth;
carrier_freq = freq + lfo;

process = os.osc(carrier_freq) * gain;
