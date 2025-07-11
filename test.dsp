import("stdfaust.lib");

// Simple oscillator
freq = hslider("frequency", 440, 50, 2000, 0.1);
gain = hslider("gain", 0.5, 0, 1, 0.01);

process = os.osc(freq) * gain;