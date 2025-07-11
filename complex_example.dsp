import("stdfaust.lib");

// Complex DSP with multiple UI elements
process = hgroup("Oscillator", 
    os.osc(hslider("Frequency", 440, 50, 2000, 0.1)) * 
    hslider("Volume", 0.5, 0, 1, 0.01)
) : 
vgroup("Effects", 
    ef.echo(hslider("Delay", 0.2, 0, 1, 0.01), hslider("Feedback", 0.3, 0, 0.9, 0.01)) :
    vgroup("EQ", 
        fi.peak_eq(hslider("Gain", 0, -20, 20, 0.1), hslider("Freq", 1000, 100, 10000, 1), hslider("Q", 1, 0.1, 10, 0.1))
    )
) : 
hgroup("Output", 
    _ * hslider("Master", 0.3, 0, 1, 0.01)
);

// Add some meters for visual feedback
freq_meter = hbargraph("Frequency Monitor", 0, 2000);
level_meter = vbargraph("Level", 0, 1);
