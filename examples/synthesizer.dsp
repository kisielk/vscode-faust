// Advanced Faust example - Simple synthesizer
// Demonstrates oscillators, filters, envelopes, and effects

import("stdfaust.lib");

declare name "Simple Synthesizer";
declare description "A basic synthesizer with oscillator, filter, and envelope";
declare author "Faust Example";
declare version "1.0";

// Control interface
gate = button("Gate");
freq = hslider("Frequency", 440, 50, 2000, 0.01);
gain = hslider("Gain", 0.5, 0, 1, 0.01);

// Filter controls
cutoff = hslider("Filter Cutoff", 1000, 50, 5000, 1);
resonance = hslider("Filter Resonance", 1, 0.1, 10, 0.1);

// Envelope controls
attack = hslider("Attack", 0.1, 0.001, 2, 0.001);
decay = hslider("Decay", 0.3, 0.001, 2, 0.001);
sustain = hslider("Sustain", 0.5, 0, 1, 0.01);
release = hslider("Release", 0.5, 0.001, 2, 0.001);

// Oscillator - mix of sawtooth and square
osc = os.sawtooth(freq) * 0.7 + os.square(freq) * 0.3;

// Envelope generator
envelope = en.adsr(attack, decay, sustain, release, gate);

// Low-pass filter
filtered = fi.resonlp(cutoff, resonance, 1);

// Process: oscillator -> filter -> envelope -> gain
process = osc : filtered : *(envelope) : *(gain);
