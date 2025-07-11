import("stdfaust.lib");

// Simple sine wave oscillator with frequency and volume controls
freq = hslider("Frequency", 440, 50, 2000, 0.1);
gain = hslider("Volume", 0.5, 0, 1, 0.01);
button_gate = button("Gate");

process = os.osc(freq) * gain * button_gate;
