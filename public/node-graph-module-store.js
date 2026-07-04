const nodeGraphModuleStoreTypes = Object.freeze([
  "polyBlep",
  "sineWavetable",
  "drumMachine",
  "kickDrum",
  "snareDrum",
  "clock",
  "transport",
  "clockDivider",
  "delayedTrigger",
  "buttonEvents",
  "wireBreak",
  "wireConnect",
  "wireDisconnect",
  "windowReopen",
  "shootingStarTail",
  "shootingStarExplosion",
  "nextPatch",
  "previousPatch",
  "randomClock",
  "triggerCounter",
  "triggerDivider",
  "stepSequencer",
  "melodySequencer",
  "chordSequencer",
  "chordMemory",
  "turingMachine",
  "pitchQuantizer",
  "surgeOscillator",
  "dsfOscillator",
  "robinSupersaw",
  "hypersaw",
  "arpeggiator",
  "spiral",
  "blubb",
  "boing",
  "keplerBoukamp",
  "mushroom",
  "nyquistShannon",
  "radar",
  "torus",
  "wirdoSpiral",
  "lorenzAttractor",
  "logisticMap",
  "henonMap",
  "rosslerAttractor",
  "chuaAttractor",
  "aizawaAttractor",
  "thomasAttractor",
  "halvorsenAttractor",
  "noiseGenerator",
  "randomWalk",
  "fractalBrownianNoise",
  "clapPlugin",
  "codeblock",
  "graph",
  "graph2",
  "gain",
  "bias",
  "softClipper",
  "rotate3dTo2d",
  "output",
  "audioInput",
  "macroKnob",
  "bipolarKnob",
  "valueSlider",
  "rangeSlider",
  "midiOut",
  "midiNotePitch",
  "midiController",
  "keyboardController",
  "macroControls",
  "pitchModWheel",
  "xyPad",
  "portalInLeft",
  "portalInRight",
  "portalInMono",
  "portalOutLeft",
  "portalOutRight",
  "portalOutMono",
  "portalGenericInput",
  "portalGenericOutput",
  "groupInput",
  "groupOutput",
  "audioPlayer",
  "samplePlayer",
  "sampleLooper",
  "passiveFilter",
  "cookbookFilter",
  "ladderFilter",
  "tb303Filter",
  "slewLimiter",
  "delayEffect",
  "reverbEffect",
  "pll",
  "helmholtzPitch",
  "distortionEffect",
  "sampleHold",
  "digitalCurveEnvelope",
  "expAdsr",
  "flowerChildEnvelopeFollower",
  "linearEnvelope",
  "pluckEnvelope",
  "vactrolEnvelope",
  "vactrolEnvelopeC4",
  "sandboxVisuals",
  "screenSpaceShader",
  "bloomGlow",
  "rgbaHsla",
  "chromaColor",
  "image",
  "canvas",
  "led",
  "visualOscilloscope",
  "traceDisplay",
  "dotOscilloscope",
  "valueOscilloscope",
  "numberReadout",
  "lineBurnOscilloscope",
  "scope2d",
  "scope2dTrace",
  "parabol",
  "vibratoGenerator",
  "wowAndFlutter",
  "speakerProtection",
  "badvalMonitor",
  "textBox",
]);

let nodeGraphNativeModuleEntries = Object.freeze([]);
let nodeGraphNativeModuleEntriesByTarget = Object.freeze({});
let nodeGraphNativeModuleCatalogLoadStarted = false;

const nodeGraphModuleStoreUnderConstructionTypes = Object.freeze(new Set([
  "canvas",
  "graph",
  "graph2",
  "groupInput",
  "groupOutput",
  "shootingStarTail",
]));

const nodeGraphModuleGroupStorageKey = "soemdsp-sandbox.moduleGroups.v1";
const nodeGraphModuleCatalogVisibilityStorageKey = "soemdsp-sandbox.moduleCatalogVisibility.v2";

const nodeGraphModuleStoreDepartments = Object.freeze([
  "Oscillator",
  "Chaos",
  "Jerobeam",
  "Noise",
  "Filter",
  "Envelope",
  "Modulators",
  "Delay",
  "Drum",
  "Dynamics",
  "Sequence",
  "Audio",
  "Visual",
  "Oscilloscope",
  "Controllers",
  "Game Triggers",
  "Portals",
  "Loops",
  "Samples",
  "Debug",
]);

const nodeGraphModuleStoreVisualGroups = Object.freeze([
  {
    label: "Generate",
    departments: Object.freeze(["Oscillator", "Chaos", "Jerobeam", "Noise", "Drum", "Envelope"]),
  },
  {
    label: "Process",
    departments: Object.freeze(["Filter", "Modulators", "Dynamics"]),
  },
  {
    label: "Memory",
    departments: Object.freeze(["Audio", "Delay", "Loops", "Samples", "Sequence"]),
  },
  {
    label: "Interact",
    departments: Object.freeze(["Controllers", "Game Triggers", "Portals", "Oscilloscope", "Visual", "Debug"]),
  },
]);

const nodeGraphModuleStoreVisualGroupByDepartment = Object.freeze(
  nodeGraphModuleStoreVisualGroups.reduce((groups, group) => {
    for (const department of group.departments) {
      groups[department] = group.label;
    }
    return groups;
  }, {}),
);

const nodeGraphModuleStoreDepartmentAds = Object.freeze({
  Oscillator: {
    symbol: "∿",
    title: "Oscillator",
    pitch: "Start with a voice. Tone generators, phase motion, and the raw signal that everything else learns to orbit.",
  },
  "Drum": {
    symbol: "▥",
    title: "Drum",
    pitch: "Rhythm machines, drum voices, pattern engines, and percussion control surfaces.",
  },
  Filter: {
    symbol: "◫",
    title: "Filter",
    pitch: "Shape the airframe. Carve mass, reveal brightness, and teach a signal where it is allowed to fly.",
  },
  Delay: {
    symbol: "FX",
    title: "Delay",
    pitch: "Delay, reverb, distortion, and performance processors for shaping finished sound.",
  },
  Sequence: {
    symbol: "♪",
    title: "Sequence",
    pitch: "Pitch lanes and melodic pattern tools for generating lines, hooks, and motion.",
  },
  "Chord Sequencer": {
    symbol: "♬",
    title: "Chord Sequencer",
    pitch: "Progression tools for harmonic movement, voicings, and chord-triggered systems.",
  },
  Arpeggiator: {
    symbol: "↟",
    title: "Arpeggiator",
    pitch: "Pattern engines for broken chords, rhythmic note motion, and performance arps.",
  },
  Audio: {
    symbol: "OUT",
    title: "Audio Player",
    pitch: "Music playback, audio sinks, and listening endpoints for turning patch signal into rendered or live sound.",
  },
  Dynamics: {
    symbol: "⚡",
    title: "Dynamics",
    pitch: "Power routing, level control, offsets, and response shaping for keeping a circuit alive under pressure.",
  },
  Debug: {
    symbol: "DBG",
    title: "Debug",
    pitch: "Inspection tools, sentinels, and safety monitors for catching bad values while a patch is under test.",
  },
  Envelope: {
    symbol: "⌒",
    title: "Envelope",
    pitch: "Attack, decay, sustain, release, and gate-shaped motion. Make sound and visuals breathe on command.",
  },
  Modulators: {
    symbol: "⇄",
    title: "Modulator",
    pitch: "Motion sources for pitch, amplitude, time, and texture. Small control engines that make patches move.",
  },
  Controllers: {
    symbol: "⌘",
    title: "Controllers",
    pitch: "Input devices and control bridges for keyboards, MIDI, gamepads, and external gestures.",
  },
  Portals: {
    symbol: "IO",
    title: "Portals",
    pitch: "Patch boundary portals for moving left, right, and mono signal lanes between rooms, templates, and larger circuits.",
  },
  Samples: {
    symbol: "▣",
    title: "Samples",
    pitch: "Audio-file shelf. Empty by default until sandbox has a real file-library flow.",
  },
  Loops: {
    symbol: "∞",
    title: "Loops",
    pitch: "Loop-file shelf. Empty by default until sandbox has a real audio-loop library flow.",
  },
  Noise: {
    symbol: "✦",
    title: "Noise",
    pitch: "Noise, dust, instability, sparks, and all the useful mess a clean machine secretly needs.",
  },
  Chaos: {
    symbol: "∞",
    title: "Chaos",
    pitch: "All the various attractors and strange motion systems. The wild shelf where math starts looking back.",
  },
  Jerobeam: {
    symbol: "JRB",
    title: "Jerobeam",
    pitch: "Jerobeam spiral and orbit motion systems. Spiral Generator lives here.",
  },
  Visual: {
    symbol: "V",
    title: "Visual",
    pitch: "Visual sinks, RGBA sources, canvas layers, and formula tiles for turning patch motion into screen output.",
  },
  Oscilloscope: {
    symbol: "OSC",
    title: "Oscilloscope",
    pitch: "Dedicated display testbeds for trace, dot, line burn, 2D scope, and canvas-style visual inspection.",
  },
});

const nodeGraphModuleStoreCatalog = Object.freeze({
  polyBlep: {
    category: "Oscillator",
    description: "Anti-aliased PolyBLEP oscillator for clean saw, ramp, square, triangle, sine, and noise waveform outputs.",
    label: "PolyBLEP",
    notes: ["anti-aliasing", "polyblep", "realtime oscillator"],
  },
  sineWavetable: {
    category: "Oscillator",
    description: "Table-driven sine/cosine oscillator with pitch, frequency, amplitude, and Nyquist-edge fade.",
    label: "SinCos",
    notes: ["implemented", "wavetable", "sin/cos"],
  },
  drumMachine: {
    category: "Drum",
    description: "Placeholder for a compact pattern-driven drum machine module.",
    label: "DrumMachine",
    notes: ["placeholder", "patterns", "percussion"],
  },
  kickDrum: {
    category: "Drum",
    description: "Placeholder for a synthesized kick voice with pitch drop, body, and click controls.",
    label: "KickDrum",
    notes: ["placeholder", "drum voice", "low punch"],
  },
  snareDrum: {
    category: "Drum",
    description: "Placeholder for a synthesized snare voice with noise, tone, and snap controls.",
    label: "SnareDrum",
    notes: ["placeholder", "drum voice", "noise snap"],
  },
  clock: {
    category: "Sequence",
    description: "Timer pulse source. Emits a steady gate for triggering samplers, sequencers, and motion events.",
    notes: ["rate and phase control", "duty cycle", "reset input"],
  },
  transport: {
    category: "Sequence",
    description: "Project-synced beat clock source. Emits in-phase square waves derived from patch BPM.",
    label: "Transport",
    notes: ["project BPM", "beat divisions", "engine-start phase"],
  },
  clockDivider: {
    category: "Sequence",
    description: "Clock-aware divider. Count incoming clock edges and emit a slower gate for rhythmic subdivision.",
    notes: ["clock input", "division control", "reset input"],
  },
  delayedTrigger: {
    category: "Sequence",
    description: "One-shot timer. Catch a trigger, wait a precise delay, then emit a pulse for downstream events.",
    notes: ["delayed pulse", "reset input", "one-shot timing"],
  },
  randomClock: {
    category: "Sequence",
    description: "Seeded random interval clock. Emits a short trigger and a duty-controlled gate between minimum and maximum seconds.",
    notes: ["random timing", "trigger and gate outputs", "reset input"],
  },
  triggerCounter: {
    category: "Sequence",
    description: "Pulse counter. Count incoming triggers, emit a wrap pulse, and expose the count as modulation.",
    notes: ["count pulses", "wrap output", "reset input"],
  },
  triggerDivider: {
    category: "Sequence",
    description: "Divides incoming trigger pulses into slower clocks for envelopes, sequencers, and rhythmic patches.",
    notes: ["trigger division", "reset input", "pulse width"],
  },
  stepSequencer: {
    category: "Sequence",
    description: "Eight-step trigger sequencer. Advance it with Clock and route stepped control values anywhere.",
    notes: ["trigger input", "reset input", "stepped modulation"],
  },
  melodySequencer: {
    category: "Sequence",
    description: "Placeholder for a pitch-aware sequencer for hooks, lines, and scale-constrained motion.",
    label: "MelodySequencer",
    notes: ["placeholder", "pitch lane", "scale control"],
  },
  chordSequencer: {
    category: "Sequence",
    description: "Placeholder for arranging chord progressions and voicing changes inside the graph.",
    label: "ChordSequencer",
    notes: ["placeholder", "progressions", "voicing"],
  },
  chordMemory: {
    category: "Sequence",
    description: "Latches up to 4 notes from a mono Pitch input one at a time (Latch trigger), then outputs them as stacked simultaneous pitches or arpeggiated in sequence.",
    label: "Chord Memory",
    notes: ["latch", "mono to chord", "step record", "arpeggio output"],
  },
  turingMachine: {
    category: "Sequence",
    description: "Classic mutating shift-register sequencer: each Clock, the pattern shifts and the new bit is randomly flipped with a set Probability, giving evolving, semi-repeating loops. Also outputs a 12-bit Scale mask.",
    label: "Turing Machine",
    notes: ["generative", "shift register", "mutating pattern", "scale mask output"],
  },
  pitchQuantizer: {
    category: "Sequence",
    description: "Snaps a 0.1V/Oct pitch signal to the nearest note in a scale. Pick a preset (Major, Minor, Pentatonic...) or feed a 12-bit pitch-class mask into the Scale input.",
    label: "Pitch Quantizer",
    notes: ["quantizer", "scale", "0.1v/oct", "melody from chaos"],
  },
  surgeOscillator: {
    category: "Oscillator",
    description: "Anti-aliased Saw/Square/Tri/Sine oscillator with hard sync: a rising zero-crossing on the Sync input forces the phase back near 0, sub-sample-interpolated and PolyBLEP-corrected so the sync reset doesn't alias like a naive hard sync would. Native C++/WASM.",
    label: "Surge Oscillator",
    notes: ["oscillator", "hard sync", "polyblep", "anti-aliasing", "native"],
  },
  dsfOscillator: {
    category: "Oscillator",
    description: "The DSF starter kit: Sine, a bandlimited Saw built from pureSawEng (Walter H. Hackett, Extended DSF Oscillators.cxx), a PWM Square derived from two phase-offset Saws, Trimorph (a second leaky integration on the Square), and SquSaw (a Saw crossfaded with a fixed 50%-duty square, landing on a saw-to-triangle-like character). Alias-free by construction: the maximum harmonic count is always Nyquist/frequency. The Harmonics knob (0-1) crossfades from a single harmonic (an exact sine) at 0 up to that Nyquist-safe maximum at 1 -- currently displayed as a raw 0.000-1.000 fraction rather than an actual harmonic count. Native C++/WASM.",
    label: "DSF Oscillator",
    notes: ["oscillator", "dsf", "discrete summation formula", "anti-aliasing", "native"],
  },
  robinSupersaw: {
    category: "Oscillator",
    description: "A proof-of-concept supersaw built on Robin Schmidt's pitch dithering technique (RobinSchmidt/RS-MET, rsPitchDitherOsc) -- see this repo's README for the full explanation. Instead of correcting or avoiding the aliasing edge, each voice dithers its own cycle length between 3 neighboring integer sample-counts so every individual cycle rendered is exactly periodic (alias-free), trading aliasing for a small amount of pitch-jitter noise. Stacks up to 9 independently-dithered, detuned voices (Detune spreads them symmetrically in cents around a centered anchor voice) and sums them into a classic wall-of-saws supersaw. Native C++/WASM.",
    label: "RobinSupersaw",
    notes: ["oscillator", "supersaw", "pitch dithering", "anti-aliasing", "native"],
  },
  hypersaw: {
    category: "Oscillator",
    description: "A proof-of-concept port of soundemote's own HypersawUnit/HypersawMaster (see docs/reference/Hypersaw.hpp) -- a bank of up to 32 bandlimited (PolyBLEP) sawtooths spread across the phase cycle. Each voice's phase is dispersed three ways: Spread (scales the voice's fixed even position i/N across the cycle), Random (a fixed per-voice random offset), and Drift (a slow, continuously wandering per-voice offset). Center voices sum to both channels; the rest alternate Left/Right. The display burns one vertical phosphor line per voice at its current phase position (0..1 across the width). Native C++/WASM.",
    label: "Hypersaw",
    notes: ["oscillator", "supersaw", "polyblep", "anti-aliasing", "native", "phosphor display"],
  },
  arpeggiator: {
    category: "Sequence",
    description: "Placeholder for rhythmic note-pattern generation from held chords or chord sources.",
    label: "Arpeggiator",
    notes: ["placeholder", "note pattern", "arp engine"],
  },
  spiral: {
    category: "Jerobeam",
    description: "Jerobeam spiral engine. Emits X/Y/Z motion-signal for alien curves and audiovisual flight paths.",
    label: "Jerobeam Spiral",
    notes: ["attractor motion", "rotation", "density and morph controls"],
  },
  blubb: {
    category: "Jerobeam",
    description: "Placeholder for the Jerobeam Blubb motion engine.",
    label: "Jerobeam Blubb",
    notes: ["placeholder", "jerobeam"],
  },
  boing: {
    category: "Jerobeam",
    description: "Placeholder for the Jerobeam Boing motion engine.",
    label: "Jerobeam Boing",
    notes: ["placeholder", "jerobeam"],
  },
  keplerBoukamp: {
    category: "Jerobeam",
    description: "Placeholder for the Jerobeam Kepler-Boukamp motion engine.",
    label: "Jerobeam KeplerBoukamp",
    notes: ["placeholder", "jerobeam"],
  },
  mushroom: {
    category: "Jerobeam",
    description: "Placeholder for the Jerobeam Mushroom motion engine.",
    label: "Jerobeam Mushroom",
    notes: ["placeholder", "jerobeam"],
  },
  nyquistShannon: {
    category: "Jerobeam",
    description: "Placeholder for the Jerobeam Nyquist-Shannon motion engine.",
    label: "Jerobeam NyquistShannon",
    notes: ["placeholder", "jerobeam"],
  },
  radar: {
    category: "Jerobeam",
    description: "Placeholder for the Jerobeam Radar motion engine.",
    label: "Jerobeam Radar",
    notes: ["placeholder", "jerobeam"],
  },
  torus: {
    category: "Jerobeam",
    description: "Placeholder for the Jerobeam Torus motion engine.",
    label: "Jerobeam Torus",
    notes: ["placeholder", "jerobeam"],
  },
  wirdoSpiral: {
    category: "Jerobeam",
    description: "Placeholder for the Jerobeam WirdoSpiral motion engine.",
    label: "Jerobeam WirdoSpiral",
    notes: ["placeholder", "jerobeam"],
  },
  lorenzAttractor: {
    category: "Chaos",
    description: "Classic butterfly attractor motion for turbulent curls and folding trajectories.",
    label: "Lorenz Attractor",
    notes: ["butterfly attractor", "3D chaos", "X/Y/Z motion"],
  },
  logisticMap: {
    category: "Chaos",
    description: "Simplest possible chaotic system: x = R * x * (1 - x), repeated at a clocked Rate. Sweep R from steady to periodic to fully chaotic.",
    label: "Logistic Map",
    notes: ["chaos", "bifurcation", "one parameter chaos", "discrete map"],
  },
  henonMap: {
    category: "Chaos",
    description: "Discrete 2D chaotic map: (x, y) = (1 - a*x^2 + y, b*x), stepped at a clocked Rate. More angular/digital-feeling than the continuous attractors.",
    label: "Henon Map",
    notes: ["chaos", "discrete map", "2D attractor"],
  },
  rosslerAttractor: {
    category: "Chaos",
    description: "Ribbon-like chaotic orbit with spiral rolls and folding motion.",
    label: "RosslerAttractor",
    notes: ["spiral fold", "continuous chaos", "planned attractor"],
  },
  chuaAttractor: {
    category: "Chaos",
    description: "Chua's Circuit double-scroll attractor: a classic chaotic circuit with a different lobe/scroll character than Lorenz.",
    label: "Chua Attractor",
    notes: ["double scroll", "circuit chaos", "3D attractor"],
  },
  aizawaAttractor: {
    category: "Chaos",
    description: "Layered orbital attractor with hovering shells and complex central motion.",
    label: "AizawaAttractor",
    notes: ["orbital shells", "3D motion", "planned attractor"],
  },
  thomasAttractor: {
    category: "Chaos",
    description: "Sine-driven strange attractor for smooth looping chaos and balanced spatial motion.",
    label: "ThomasAttractor",
    notes: ["sine feedback", "smooth chaos", "planned attractor"],
  },
  halvorsenAttractor: {
    category: "Chaos",
    description: "Dense braided attractor motion for tangled audiovisual trajectories.",
    label: "HalvorsenAttractor",
    notes: ["braided chaos", "dense orbit", "planned attractor"],
  },
  noiseGenerator: {
    category: "Noise",
    description: "Stereo noise source with independent left/right channels and selectable uniform, gaussian, brown, pink, and crackle flavors.",
    notes: ["stereo output", "distribution choices", "seed control"],
  },
  randomWalk: {
    category: "Modulators",
    description: "Flexible soemdsp-style random walk with white, filtered, random-step, and fixed-step motion modes.",
    notes: ["bounded walk", "jitter curve", "one-pole smoothing"],
  },
  fractalBrownianNoise: {
    category: "Noise",
    description: "Three-axis layered fBm motion source with octave, persistence, scale, and seed controls for rough organic drift.",
    notes: ["out x/y/z", "seeded value noise", "slow terrain motion"],
  },
  clapPlugin: {
    category: "Audio",
    developerOnly: true,
    description: "Browser-side shell for a local CLAP host plugin. Stores plugin identity and can use a host instance during bounded Render Sample.",
    label: "CLAP Plugin",
    notes: ["local host", "native plugin", "offline render"],
  },
  codeblock: {
    category: "Controllers",
    description: "Patch-local JavaScript signal processor with editable input and output ports.",
    notes: ["dynamic ports", "JavaScript body", "local patch code"],
  },
  graph: {
    category: "Visual",
    description: "Patch-local soemdsp-style graph object with curve nodes and a vertical cursor position.",
    notes: ["curve display", "cursor line", "graph nodes"],
  },
  graph2: {
    category: "Visual",
    description: "Single-algorithm graph testbed for comparing linear, smooth, and meandering point interpolation.",
    label: "Graph 2",
    notes: ["global smoothing", "curve laboratory", "graph nodes"],
  },
  gain: {
    category: "Dynamics",
    description: "Signal booster and throttle. Use it to push, tame, or route engine power.",
    notes: ["multiplication", "level control", "headroom"],
  },
  bias: {
    category: "Dynamics",
    description: "Offsets a signal away from center. Useful for steering modulation and shifting control lanes.",
    notes: ["addition", "offset", "control lane shift"],
  },
  softClipper: {
    category: "Dynamics",
    description: "Native soft clipper with center bias and clipping width controls.",
    label: "Soft Clipper",
    notes: ["soft clipping", "tanh", "dynamics"],
  },
  rotate3dTo2d: {
    category: "Dynamics",
    description: "Rotates an X/Y/Z signal point in 3D and projects the result back to X/Y.",
    label: "Rotation 3D to 2D",
    notes: ["3D rotation", "2D projection", "signal transform"],
  },
  output: {
    category: "Portals",
    description: "Stereo audio sink. Route Left and Right signals here to hear the patch.",
    label: "Output",
    notes: ["audio sink", "left right inputs", "render target"],
  },
  audioInput: {
    category: "Portals",
    description: "Stereo audio source. Emits Left and Right signals from the live microphone/audio input device.",
    label: "Input",
    notes: ["audio source", "left right outputs", "live input"],
  },
  macroKnob: {
    category: "Controllers",
    description: "Compact 4x4 external knob module. Drag it by hand and patch its value output into another module's parameter modulation input.",
    label: "Macro Knob",
    notes: ["4x4 knob", "manual control", "parameter link"],
  },
  bipolarKnob: {
    category: "Controllers",
    description: "Compact 4x4 center-zero knob module for offsets, modulation depth, and expressive push/pull control links.",
    label: "Bipolar Knob",
    notes: ["4x4 knob", "center zero", "performance control"],
  },
  valueSlider: {
    category: "Controllers",
    description: "Resizable bias-output slider for manual control in the modular view and UI view.",
    label: "Value Slider",
    notes: ["bias output", "resizable widget", "manual control"],
  },
  rangeSlider: {
    category: "Controllers",
    description: "Placeholder for paired minimum/maximum slider control for constraining modulation ranges.",
    label: "RangeSlider",
    notes: ["placeholder", "min max", "range control"],
  },
  midiOut: {
    category: "Controllers",
    description: "Manual MIDI-number source. Outputs the selected note as a normalized 0..1 signal and as the full 0..127 value.",
    notes: ["midi number", "normalized output", "full value output"],
  },
  midiNotePitch: {
    category: "Controllers",
    description: "MIDI note converter. Applies octave and pitch offsets, then emits normalized pitch, full MIDI pitch, and frequency in Hz.",
    notes: ["midi note input", "frequency output", "pitch conversion"],
  },
  midiController: {
    category: "Controllers",
    description: "Placeholder for mapping MIDI controls into the modular graph.",
    label: "MIDIController",
    notes: ["placeholder", "MIDI input", "external control"],
  },
  buttonEvents: {
    category: "Controllers",
    description: "External page button event source. Emits short pulses for explicit click, hover, down, up, enter, and leave events sent into sandbox.",
    label: "Button Events",
    notes: ["external UI", "button triggers", "music page bridge"],
  },
  wireBreak: {
    category: "Game Triggers",
    description: "Universe-physics wire break event source. Emits a one-sample pulse and an animation-length gate when a wire breaks.",
    label: "Wire Break",
    notes: ["game trigger", "wire break", "physics violation"],
  },
  wireConnect: {
    category: "Game Triggers",
    description: "Wire connect event source. Emits a one-sample pulse when a new wire connection happens.",
    label: "Wire Connect",
    notes: ["game trigger", "wire connect", "patch editing"],
  },
  wireDisconnect: {
    category: "Game Triggers",
    description: "Wire disconnect event source. Emits a one-sample pulse when a normal wire disconnect happens.",
    label: "Wire Disconnect",
    notes: ["game trigger", "wire disconnect", "patch editing"],
  },
  windowReopen: {
    category: "Game Triggers",
    description: "Window attention event source. Emits a pulse, animation gate, and glow-shaped sine when an already-open window is requested again.",
    label: "Window Reopen",
    notes: ["game trigger", "window attention", "green glow"],
  },
  shootingStarTail: {
    category: "Game Triggers",
    description: "Placeholder trigger for a shooting star tail event.",
    label: "Shooting Star Tail",
    notes: ["placeholder", "game trigger", "shooting star"],
  },
  shootingStarExplosion: {
    category: "Game Triggers",
    description: "Website shooting-star collision event source. Emits a one-sample pulse when a star hits the sandbox frame, scaled 0 to 1 by the incoming star's random speed mapped between Low Range and High Range.",
    label: "Shooting Star Explosion",
    notes: ["game trigger", "shooting star", "website bridge", "power scaled pulse", "low/high range"],
  },
  nextPatch: {
    category: "Controllers",
    description: "Patch command receiver. A trigger edge loads the next saved patch through the main UI patch explorer path.",
    label: "Next Patch",
    notes: ["patch navigation", "trigger input", "music player"],
  },
  previousPatch: {
    category: "Controllers",
    description: "Patch command receiver. A trigger edge loads the previous saved patch through the main UI patch explorer path.",
    label: "Previous Patch",
    notes: ["patch navigation", "trigger input", "music player"],
  },
  keyboardController: {
    category: "Controllers",
    description: "Mouse-playable keyboard source. Emits sustained gate, one-sample gate, key index, quantized key, MIDI pitch, normalized double, phase increment, frequency, numeric pitch, and X/Y gesture values.",
    label: "MIDI Keyboard",
    notes: ["keyboard input", "midi pitch", "gesture signals"],
  },
  macroControls: {
    category: "Controllers",
    description: "Reads the ten macro knobs under the modular view and emits M1 through M10 as live 0..1 control signals.",
    label: "Macro Controls",
    notes: ["macro row", "manual control", "ten outputs"],
  },
  pitchModWheel: {
    category: "Controllers",
    description: "Reads the separate pitch and mod wheel controls beside the keyboard. Pitch emits -1..1, while mod emits 0..1.",
    label: "Pitch / Mod Wheel",
    notes: ["pitch wheel", "mod wheel", "performance control"],
  },
  xyPad: {
    category: "Controllers",
    description: "Placeholder for a two-axis performance pad that outputs X/Y control values.",
    label: "XYPad",
    notes: ["placeholder", "two-axis control", "performance gesture"],
  },
  portalInLeft: {
    category: "Portals",
    description: "Placeholder portal for bringing a left-channel signal into a patch region.",
    label: "In Left",
    notes: ["placeholder", "left input", "patch boundary"],
  },
  portalInRight: {
    category: "Portals",
    description: "Placeholder portal for bringing a right-channel signal into a patch region.",
    label: "In Right",
    notes: ["placeholder", "right input", "patch boundary"],
  },
  portalInMono: {
    category: "Portals",
    description: "Placeholder portal for bringing a mono signal into a patch region.",
    label: "In Mono",
    notes: ["placeholder", "mono input", "patch boundary"],
  },
  portalOutLeft: {
    category: "Portals",
    description: "Placeholder portal for sending a left-channel signal out of a patch region.",
    label: "Out Left",
    notes: ["placeholder", "left output", "patch boundary"],
  },
  portalOutRight: {
    category: "Portals",
    description: "Placeholder portal for sending a right-channel signal out of a patch region.",
    label: "Out Right",
    notes: ["placeholder", "right output", "patch boundary"],
  },
  portalOutMono: {
    category: "Portals",
    description: "Placeholder portal for sending a mono signal out of a patch region.",
    label: "Out Mono",
    notes: ["placeholder", "mono output", "patch boundary"],
  },
  portalGenericInput: {
    category: "Portals",
    description: "Placeholder portal for bringing a generic signal into a patch region.",
    label: "Generic Input",
    notes: ["placeholder", "generic input", "patch boundary"],
  },
  portalGenericOutput: {
    category: "Portals",
    description: "Placeholder portal for sending a generic signal out of a patch region.",
    label: "Generic Output",
    notes: ["placeholder", "generic output", "patch boundary"],
  },
  groupInput: {
    category: "Portals",
    description: "Defines an exposed input on a saved module group.",
    label: "Group Input",
    notes: ["group interface", "public input", "patch boundary"],
  },
  groupOutput: {
    category: "Portals",
    description: "Defines an exposed output on a saved module group.",
    label: "Group Output",
    notes: ["group interface", "public output", "patch boundary"],
  },
  samplePlayer: {
    category: "Audio",
    description: "Patch-local one-shot sample playback. Trigger starts from Start and plays to End with simple click ramps.",
    label: "Sample Player",
    notes: ["sample playback", "one shot", "audio source"],
  },
  audioPlayer: {
    category: "Audio",
    description: "Patch-local music file player with stereo outputs and a phasor-driven scrub input for sample-accurate playback head control.",
    label: "Music Player",
    notes: ["music playback", "scrubbable", "phasor", "audio source"],
  },
  sampleLooper: {
    category: "Audio",
    description: "Patch-local gated sample loop playback with loop bounds, pitch control, and seam crossfade.",
    label: "Sample Looper",
    notes: ["sample playback", "loop", "audio source"],
  },
  passiveFilter: {
    category: "Filter",
    description: "1-pole RC filter with LP, HP, and BP modes. Low Cut is the HP edge; High Cut is the LP edge. BP chains HP then LP.",
    notes: ["lowpass", "highpass", "bandpass", "1-pole"],
  },
  cookbookFilter: {
    category: "Filter",
    description: "RSMET cookbook biquad cascade with mode, frequency, stages, Q, and gain controls plus an in-module response curve.",
    label: "Multi Stage Filter",
    notes: ["mode selection", "biquad stages", "curve display"],
  },
  ladderFilter: {
    category: "Filter",
    description: "RSMET ladder filter using the gain-compensated getSample path with frequency, resonance, stage depth, and mode controls.",
    label: "Ladder Filter",
    notes: ["RSMET ladder", "gain compensated", "resonant stages"],
  },
  tb303Filter: {
    category: "Filter",
    description: "TB-303 style ladder filter with feedback highpass, resonance skewing, and 15 output modes (LP/HP/BP at 6/12/18/24 dB per octave). Based on Robin Schmidt's TeeBeeFilter.",
    label: "TB-303 Filter",
    notes: ["feedback highpass", "resonance skewed", "15 modes"],
  },
  slewLimiter: {
    category: "Filter",
    description: "Limits rising and falling motion independently, turning abrupt changes into shaped ramps.",
    notes: ["up time", "down time", "asymmetric glide"],
  },
  delayEffect: {
    category: "Delay",
    description: "SOEMDSP-style modulated fractional delay with feedback, wet/dry mix, and diffuse mode.",
    label: "Delay",
    notes: ["modulated delay", "fractional echo", "diffuse mode"],
  },
  reverbEffect: {
    category: "Delay",
    description: "Raw Sabrina reverb port: serial diffusion stages with cross-feedback delay, modulation, recycle, and wet/dry mix. Seed randomizes the delay line pattern.",
    label: "Sabrina Reverb",
    notes: ["Sabrina", "serial diffusion", "cross feedback", "seed"],
  },
  pll: {
    category: "Sequence",
    description: "Phase-locked loop based on the Doepfer A-196. VCO tracks an incoming signal via a phase comparator (XOR, RS flip-flop, or PFD) and one-pole loop filter. Outputs VCO, PC, LPF CV, and lock gate.",
    label: "PLL",
    notes: ["phase locked loop", "A-196", "vco", "frequency tracking"],
  },
  helmholtzPitch: {
    category: "Sequence",
    description: "Monophonic pitch detector using the McLeod Pitch Method (normalized square difference function with parabolic interpolation). Outputs detected frequency and a fidelity score; rejects noisy/non-periodic frames.",
    label: "Pitch Detector",
    notes: ["pitch tracking", "pitch detector", "mcleod", "autocorrelation", "frequency follower"],
  },
  distortionEffect: {
    category: "Delay",
    description: "Placeholder for drive, clipping, saturation, and tone-shaping distortion effects.",
    label: "DistortionEffect",
    notes: ["placeholder", "drive", "saturation"],
  },
  sampleHold: {
    category: "Modulators",
    description: "Captures an input value when a trigger rises and holds it until the next trigger.",
    notes: ["triggered capture", "held output", "stepped motion"],
  },
  digitalCurveEnvelope: {
    category: "Envelope",
    description: "Programmable curve envelope for drawing sharper motion and custom response shapes.",
    label: "DigitalCurveEnvelope",
    notes: ["curve table", "custom shape", "planned envelope"],
  },
  expAdsr: {
    category: "Envelope",
    description: "Soundemote-style exponential ADSR. Gate it with a clock or pulse and shape the rise and fall curves.",
    label: "ExponentialEnvelope",
    notes: ["gate input", "target-ratio curves", "loopable envelope"],
  },
  flowerChildEnvelopeFollower: {
    category: "Envelope",
    description: "FlowerChild-style rectified envelope follower with attack, hold, and decay slew behavior.",
    label: "FlowerChild Envelope Follower",
    notes: ["audio input", "attack hold decay", "signed follower port"],
  },
  linearEnvelope: {
    category: "Envelope",
    description: "Straight-line envelope for predictable ramps, fades, gates, and simple motion.",
    label: "LinearEnvelope",
    notes: ["gate input", "linear DADSR", "loopable ramp"],
  },
  pluckEnvelope: {
    category: "Envelope",
    description: "Fast feedback pluck contour for struck, picked, pinged, and percussive behaviors.",
    label: "PluckEnvelope",
    notes: ["trigger input", "decay energy", "auto release"],
  },
  vactrolEnvelope: {
    category: "Envelope",
    description: "Optical-style control shaper modeled on the PerkinElmer VTL5C3, the classic fast Buchla/Serge-style LPG vactrol. Feed it light and get its 2.5ms attack, 35ms release response.",
    notes: ["light input", "attack/release lag", "dark current"],
  },
  vactrolEnvelopeC4: {
    category: "Envelope",
    description: "Optical-style control shaper modeled on the PerkinElmer VTL5C4, the well-known slow vactrol with a ~1.5s release -- roughly 40x longer than the VTL5C3.",
    notes: ["light input", "slow release", "dark current"],
  },
  sandboxVisuals: {
    category: "Visual",
    description: "Sink module for routing patch signals into the screen view. Drive shake, dim, color, scope pause/shutoff, or patch X/Y for direct visual motion.",
    notes: ["visual sink", "shake input", "scope pause"],
  },
  screenSpaceShader: {
    category: "Visual",
    description: "Scripted screen-space visual sink. Declare custom inputs and map them into screen shake, dim, color, scope pause, and offset controls.",
    notes: ["scripted visual sink", "custom inputs", "screen shader controls"],
  },
  bloomGlow: {
    category: "Visual",
    description: "Visual sink for routing patch signals into screen dimming, brightness, bloom, and glow response.",
    notes: ["visual sink", "dim input", "bloom and glow"],
  },
  rgbaHsla: {
    category: "Visual",
    description: "Precise color sink with RGB channels, HSL channels, an HSL mix control, and alpha for the screen wash.",
    notes: ["visual sink", "rgb channels", "hsla control"],
  },
  chromaColor: {
    category: "Visual",
    description: "Stylized color sink for chroma-driven screen washes with hue drift, spread, alpha, trace brightness, bloom, and glow.",
    notes: ["visual sink", "chroma wash", "moving color"],
  },
  image: {
    category: "Visual",
    description: "Patch-local image asset node. Route it into Screen Visuals Trace Image to texture phosphor trace dots.",
    notes: ["load image", "save image", "trace texture"],
  },
  canvas: {
    category: "Oscilloscope",
    description: "Layered RGBA compositor for images, scopes, shader passes, transforms, and future game-engine surfaces.",
    notes: ["layer compositor", "RGBA output", "shader script"],
  },
  led: {
    category: "Visual",
    description: "One-grid-unit signal light. Patch any gate or control signal into In and use it as a compact in-world indicator.",
    label: "LED",
    notes: ["1 GU tile", "input light", "visual indicator"],
  },
  visualOscilloscope: {
    category: "Visual",
    description: "Square in-world display tile. Patch any signal into In and use it as a dedicated visual display.",
    notes: ["square display", "signal display", "visual sink"],
  },
  traceDisplay: {
    category: "Oscilloscope",
    description: "Focused 1D waveform display testbed. Patch any signal into In and inspect the current trace without the full prettyscope renderer.",
    notes: ["1D waveform", "display testbed", "input trace"],
  },
  dotOscilloscope: {
    category: "Oscilloscope",
    description: "Placeholder for a clock-like oscilloscope that draws one efficient brightness dot from the current buffered value.",
    label: "0D Burn",
    notes: ["clock display", "single dot", "latest value"],
  },
  valueOscilloscope: {
    category: "Oscilloscope",
    description: "Single-value oscilloscope that draws the latest input as one horizontal line across the display.",
    label: "0D Value",
    notes: ["value display", "horizontal line", "latest value"],
  },
  numberReadout: {
    category: "Oscilloscope",
    description: "Digital readout that draws the latest input value as formatted text. Redraws only when the displayed value changes.",
    label: "Number Readout",
    notes: ["numeric display", "digital readout", "text display", "latest value"],
  },
  lineBurnOscilloscope: {
    category: "Oscilloscope",
    description: "First-pass line-burn oscilloscope style with a heavier trace pass, ready for dedicated burn tuning.",
    label: "1D Burn",
    notes: ["burn display", "line trace", "testbed"],
  },
  scope2d: {
    category: "Oscilloscope",
    description: "First-pass 2D scope display for inspecting the latest X/Y signal point.",
    label: "2D Burn",
    notes: ["xy display", "2D scope", "latest point"],
  },
  scope2dTrace: {
    category: "Oscilloscope",
    description: "Sample-history X/Y oscilloscope for inspecting deterministic 2D traces without pixel burn decay.",
    label: "2D Trace",
    notes: ["xy trace", "sample history", "2D oscilloscope"],
  },
  parabol: {
    category: "Modulators",
    description: "Curved control motion for sweeps, bends, and non-linear transitions.",
    label: "Parabol",
    notes: ["parabolic curve", "control motion", "planned modulator"],
  },
  vibratoGenerator: {
    category: "Modulators",
    description: "Pitch-motion generator for musical vibrato and animated oscillator control.",
    label: "VibratoGenerator",
    notes: ["pitch modulation", "rate and depth", "planned modulator"],
  },
  wowAndFlutter: {
    category: "Modulators",
    description: "Tape-style slow wow and fast flutter motion for unstable pitch and timing character.",
    label: "WowAndFlutter",
    notes: ["wow motion", "flutter motion", "planned modulator"],
  },
  badvalMonitor: {
    category: "Debug",
    description: "Circuit sentinel. Watches for invalid values before they spread through the machine.",
    notes: ["NaN guard", "infinity guard", "debug safety"],
  },
  speakerProtection: {
    category: "Debug",
    description: "Hard safety fuse. Trips ear and speaker protection immediately if a wired sample exceeds absolute 1.0.",
    notes: ["speaker safety", "ear protection", "hard limit"],
  },
  textBox: {
    category: "Visual",
    description: "In-world label plate for prompts, lore, instructions, and electric annotations.",
    notes: ["annotation", "layout", "field notes"],
  },
});

function defaultNodeGraphModuleCatalogVisibility() {
  return Object.fromEntries(
    nodeGraphModuleStoreTypes.map((type) => [
      type,
      {
        developer: true,
        home: false,
      },
    ]),
  );
}

function normalizeNodeGraphModuleCatalogVisibility(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(
    nodeGraphModuleStoreTypes.map((type) => {
      const entry = source[type];
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        return [
          type,
          {
            developer: entry.developer !== false && entry.shop !== false,
            home: entry.home === true,
          },
        ];
      }
      return [
        type,
        {
          developer: entry !== false,
          home: false,
        },
      ];
    }),
  );
}

function nodeGraphModuleCatalogVisibility() {
  return normalizeNodeGraphModuleCatalogVisibility(nodeGraphMvp.moduleCatalogVisibility);
}

function nodeGraphModuleIsStoreVisible(type, shelf = "shop") {
  const visibility = nodeGraphModuleCatalogVisibility()[type];
  if (shelf === "developer") {
    return visibility?.developer !== false;
  }
  if (shelf === "home") {
    return visibility?.home === true;
  }
  return true;
}

function applyNodeGraphModuleCatalogVisibility(value = {}) {
  nodeGraphMvp.moduleCatalogVisibility = normalizeNodeGraphModuleCatalogVisibility(value);
  renderNodeGraphModuleStoreCatalog();
}

function loadNodeGraphModuleCatalogVisibilityLocal() {
  if (!nodeGraphLocalDefaultPresetAllowed()) {
    return null;
  }
  try {
    const text = window.localStorage.getItem(nodeGraphModuleCatalogVisibilityStorageKey);
    if (!text) {
      return null;
    }
    return normalizeNodeGraphModuleCatalogVisibility(JSON.parse(text));
  } catch {
    return null;
  }
}

function saveNodeGraphModuleCatalogVisibilityLocal(value = nodeGraphModuleCatalogVisibility()) {
  if (!nodeGraphLocalDefaultPresetAllowed()) {
    return false;
  }
  try {
    window.localStorage.setItem(
      nodeGraphModuleCatalogVisibilityStorageKey,
      JSON.stringify(normalizeNodeGraphModuleCatalogVisibility(value)),
    );
    return true;
  } catch {
    return false;
  }
}

function normalizeNodeGraphNativeModuleEntry(entry = {}) {
  const name = String(entry.name || "").trim();
  const targetType = String(entry.targetType || entry.target || name || "").trim();
  if (!name || !targetType) {
    return null;
  }
  return Object.freeze({
    kind: String(entry.kind || ""),
    label: String(entry.label || name),
    name,
    source: String(entry.source || ""),
    sourceUrl: String(entry.sourceUrl || ""),
    targetType,
    wasm: String(entry.wasm || ""),
    wasmAvailable: Boolean(entry.wasmAvailable),
    wasmUrl: String(entry.wasmUrl || ""),
  });
}

function applyNodeGraphNativeModuleCatalog(entries = []) {
  const normalized = (Array.isArray(entries) ? entries : [])
    .map((entry) => normalizeNodeGraphNativeModuleEntry(entry))
    .filter(Boolean);
  const byTarget = {};
  for (const entry of normalized) {
    if (!byTarget[entry.targetType]) {
      byTarget[entry.targetType] = [];
    }
    byTarget[entry.targetType].push(entry);
  }
  nodeGraphNativeModuleEntries = Object.freeze(normalized);
  nodeGraphNativeModuleEntriesByTarget = Object.freeze(byTarget);
  renderNodeGraphModuleStoreCatalog();
}

async function fetchNodeGraphNativeModuleCatalogFallback() {
  try {
    const response = await fetch("native-modules-catalog.json", { cache: "no-store" });
    return response.ok ? response.json() : null;
  } catch (_error) {
    return null;
  }
}

async function loadNodeGraphNativeModuleCatalog() {
  if (nodeGraphNativeModuleCatalogLoadStarted || typeof fetch !== "function") {
    return nodeGraphNativeModuleEntries;
  }
  nodeGraphNativeModuleCatalogLoadStarted = true;
  try {
    let payload = null;
    const response = await fetch("/api/native-modules", { cache: "no-store" });
    if (response.ok) {
      payload = await response.json();
    } else {
      payload = await fetchNodeGraphNativeModuleCatalogFallback();
    }
    applyNodeGraphNativeModuleCatalog(payload?.modules || []);
  } catch (_error) {
    // No server behind the page (e.g. static export) -- fall back to the
    // pre-generated catalog shipped alongside index.html.
    const fallback = await fetchNodeGraphNativeModuleCatalogFallback();
    if (fallback?.modules) {
      applyNodeGraphNativeModuleCatalog(fallback.modules);
    }
  }
  return nodeGraphNativeModuleEntries;
}

function nodeGraphNativeModulesForType(type) {
  return nodeGraphNativeModuleEntriesByTarget[String(type || "")] || [];
}

// "Code" button entries for modules that stay JavaScript on purpose (not
// backed by a native_modules/*.cpp entry). Points at the file where the
// module's DSP is actually implemented, not just where it's dispatched.
const nodeGraphJsSourceEntriesByType = Object.freeze({
  sineWavetable: {
    source: "public/node-graph-oscillator-runtime.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/node-graph-oscillator-runtime.js",
  },
});

function nodeGraphJsSourceEntryForType(type) {
  return nodeGraphJsSourceEntriesByType[String(type || "")] || null;
}

function nodeGraphCodeEntryForType(type) {
  return nodeGraphNativeModulesForType(type).find((entry) => entry?.sourceUrl) ||
    nodeGraphJsSourceEntryForType(type);
}

function nodeGraphModuleStoreEntries() {
  return nodeGraphModuleStoreTypes
    .map((type) => {
      const nativeModules = nodeGraphNativeModulesForType(type);
      const implemented =
        Object.hasOwn(nodeGraphModuleDefinitions, type) &&
        !nodeGraphModuleStoreUnderConstructionTypes.has(type);
      const developerVisible = nodeGraphModuleIsStoreVisible(type, "developer");
      const developerOnly = nodeGraphModuleStoreCatalog[type]?.developerOnly === true;
      const publicVisible = !developerOnly;
      return {
        ...(nodeGraphModuleStoreCatalog[type] || {}),
        type,
        demoPatch: nodeGraphModuleStoreDemoPatchAvailable(type),
        demoListen: nodeGraphModuleStoreDemoListenAvailable(type),
        developerOnly,
        developerVisible,
        homeVisible: nodeGraphModuleIsStoreVisible(type, "home") && implemented,
        implemented,
        label: nodeGraphModuleStoreCatalog[type]?.label || nodeGraphNodeLabels[type] || type,
        nativeAvailable: nativeModules.some((entry) => entry.wasmAvailable),
        nativeModules,
        shopVisible: publicVisible,
        visible: publicVisible,
      };
    });
}

function setNodeGraphModuleCatalogVisibility(type, visible, shelf = "shop") {
  if (!nodeGraphModuleStoreTypes.includes(type)) {
    return;
  }
  const key = shelf === "home" ? "home" : "developer";
  const current = nodeGraphModuleCatalogVisibility();
  nodeGraphMvp.moduleCatalogVisibility = {
    ...current,
    [type]: {
      ...(current[type] || { developer: true, home: false }),
      [key]: Boolean(visible),
    },
  };
  saveNodeGraphModuleCatalogVisibilityLocal();
  renderNodeGraphModuleStoreCatalog();
}

function normalizeNodeGraphModuleStoreDepartment(department = "") {
  const value = String(department || "");
  if (value === "Sequencer") {
    return "Sequence";
  }
  return value;
}

function setNodeGraphModuleStoreDepartment(department = "") {
  nodeGraphMvp.moduleStoreDepartment = normalizeNodeGraphModuleStoreDepartment(department);
  renderNodeGraphModuleStoreCatalog();
  if (typeof saveNodeGraphModuleStoreStateToUserSettings === "function") {
    saveNodeGraphModuleStoreStateToUserSettings();
  }
}

function saveNodeGraphModuleStoreStateToUserSettings() {
  if (
    typeof serializeNodeUiDevSettings === "function" &&
    typeof saveNodeUiDevLocalDefaultSettings === "function"
  ) {
    saveNodeUiDevLocalDefaultSettings(serializeNodeUiDevSettings());
  }
}

function nodeGraphNormalizeModuleDepartmentSearch(value = "") {
  return String(value || "").trim().toLowerCase();
}

function nodeGraphModuleStoreEntryMatchesSearch(entry, query) {
  const needle = nodeGraphNormalizeModuleDepartmentSearch(query);
  if (!needle) {
    return true;
  }
  const haystack = [
    entry.label,
    entry.type,
    entry.category,
    entry.description,
    ...(entry.notes || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function nodeGraphModuleStoreDepartmentMatchesSearch(department, entries, query) {
  const needle = nodeGraphNormalizeModuleDepartmentSearch(query);
  if (!needle) {
    return true;
  }
  const haystack = [
    department,
    ...(entries || []).flatMap((entry) => [
      entry.label,
      entry.type,
      entry.description,
      ...(entry.notes || []),
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function nodeGraphModuleStoreSearchResultOrder(a, b) {
  const implementedDelta = Number(Boolean(b?.implemented)) - Number(Boolean(a?.implemented));
  if (implementedDelta) {
    return implementedDelta;
  }
  return String(a?.label || "").localeCompare(String(b?.label || ""));
}

function nodeGraphModuleStorePublicEntriesByDepartment(entries = []) {
  const groups = new Map();
  for (const department of nodeGraphModuleStoreDepartments) {
    groups.set(department, []);
  }
  entries
    .filter((entry) => entry.visible)
    .forEach((entry) => {
      const department = entry.category || "Other";
      if (!groups.has(department)) {
        groups.set(department, []);
      }
      groups.get(department).push(entry);
    });
  return [...groups.entries()]
    .map(([department, departmentEntries]) => [
      department,
      departmentEntries.sort((a, b) => a.label.localeCompare(b.label)),
    ])
    .sort(([a], [b]) => {
      const aIndex = nodeGraphModuleStoreDepartments.indexOf(a);
      const bIndex = nodeGraphModuleStoreDepartments.indexOf(b);
      const normalizedA = aIndex === -1 ? Number.POSITIVE_INFINITY : aIndex;
      const normalizedB = bIndex === -1 ? Number.POSITIVE_INFINITY : bIndex;
      return normalizedA - normalizedB || a.localeCompare(b);
    });
}

const nodeGraphModuleShopWindowDefaultSize = Object.freeze({
  width: 180,
  height: 620,
  minWidth: 96,
  maxWidth: 980,
  minHeight: 120,
  maxHeight: 760,
});

function normalizeNodeGraphModuleShopWindowSize(size = {}) {
  if (typeof normalizeNodeGraphFloatingWindowSize === "function") {
    return normalizeNodeGraphFloatingWindowSize(size, nodeGraphModuleShopWindowDefaultSize);
  }
  const source = size && typeof size === "object" ? size : {};
  return {
    width: Math.max(
      nodeGraphModuleShopWindowDefaultSize.minWidth,
      Math.min(
        nodeGraphModuleShopWindowDefaultSize.maxWidth,
        Math.round(Number(source.width) || nodeGraphModuleShopWindowDefaultSize.width),
      ),
    ),
    height: Math.max(
      nodeGraphModuleShopWindowDefaultSize.minHeight,
      Math.min(
        nodeGraphModuleShopWindowDefaultSize.maxHeight,
        Math.round(Number(source.height) || nodeGraphModuleShopWindowDefaultSize.height),
      ),
    ),
  };
}

function applyNodeGraphModuleShopWindowSize(size = {}) {
  const panel = document.getElementById("nodeModuleShopView");
  const normalized = normalizeNodeGraphModuleShopWindowSize(size);
  if (panel) {
    if (typeof applyNodeGraphFloatingWindowSizeVars === "function") {
      applyNodeGraphFloatingWindowSizeVars(panel, "node-module-shop", nodeGraphModuleShopWindowDefaultSize, normalized);
    } else {
      panel.style.setProperty("--node-module-shop-width", `${normalized.width}px`);
      panel.style.setProperty("--node-module-shop-height", `${normalized.height}px`);
    }
  }
  return normalized;
}

function nodeGraphModuleShopWindowSizeFromElement(panel = document.getElementById("nodeModuleShopView")) {
  const rect = panel?.getBoundingClientRect?.();
  return normalizeNodeGraphModuleShopWindowSize({
    width: rect?.width,
    height: rect?.height,
  });
}

function saveNodeGraphModuleShopWindowSizeToUserSettings() {
  const panel = document.getElementById("nodeModuleShopView");
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState(
      "moduleBrowser",
      panel,
      { open: !panel?.hidden, size: nodeGraphModuleShopWindowSizeFromElement(panel) },
      { status: false },
    );
  }
}

function handleNodeGraphModuleDepartmentSearchInput(event) {
  nodeGraphMvp.moduleStoreDepartmentSearch = String(event?.currentTarget?.value || "");
  renderNodeGraphModuleStoreCatalog();
}

function handleNodeGraphModuleDepartmentSearchKeydown(event) {
  if (event?.key !== "Escape") {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  nodeGraphMvp.moduleStoreDepartmentSearch = "";
  event.currentTarget.value = "";
  renderNodeGraphModuleStoreCatalog();
}

function nodeGraphModuleStoreDemoPatchAvailable(type) {
  return Boolean(
    Object.hasOwn(nodeGraphModuleDefinitions, type) &&
    !["audioInput", "groupInput", "groupOutput", "moduleGroup", "output"].includes(type)
  );
}

function nodeGraphModuleStoreDemoListenAvailable(type) {
  if (!nodeGraphModuleStoreDemoPatchAvailable(type)) {
    return false;
  }
  return nodeGraphPatchNodeOutputPorts(createNodeGraphPatchNode(type, { id: "demo" })).length > 0;
}

function nodeGraphModuleStoreDemoPatch(type) {
  if (!nodeGraphModuleStoreDemoPatchAvailable(type)) {
    return null;
  }
  const definition = nodeGraphModuleDefinitions[type];
  const outputPorts = nodeGraphPatchNodeOutputPorts(createNodeGraphPatchNode(type, { id: "demo" }));
  const sourcePort = outputPorts.find((port) => port !== "Gate") || outputPorts[0] || "";
  const nodes = [
    createNodeGraphPatchNode(type, { gx: 3, gy: 5, id: "demo" }),
    createNodeGraphPatchNode("output", { gx: 16, gy: 5, id: "output" }),
  ];
  const connections = [];
  if (sourcePort) {
    connections.push({
      destinationNode: "output",
      destinationPort: "Left",
      sourceNode: "demo",
      sourcePort,
    });
    connections.push({
      destinationNode: "output",
      destinationPort: "Right",
      sourceNode: "demo",
      sourcePort,
    });
  }
  return validateNodeGraphPatch({
    audio: { targetSampleRate: 44100 },
    bypassedNodes: [],
    connections,
    format: { ...nodeGraphPatchFormat },
    grid: { ...nodeGraphGrid },
    info: {
      author: "Soundemote",
      description: `Demo patch for ${nodeGraphNodeLabels[type] || type}.`,
      name: `${nodeGraphNodeLabels[type] || type} demo`,
      tags: `${definition?.category || "module"}, demo`,
    },
    modulations: [],
    monitors: [],
    nodes,
    timing: {
      tempoBpm: 120,
      timeSignatureDenominator: 4,
      timeSignatureNumerator: 4,
    },
    uiItems: [],
    view: { widthGu: 22, heightGu: 13 },
    visual: normalizeNodeGraphPatchVisual(nodeGraphMvp.patch?.visual),
    windows: normalizeNodeGraphPatchWindows({}),
  });
}

function playNodeGraphRenderedAudioElement() {
  const audio = document.getElementById("audioPlayer");
  if (!audio?.src) {
    return;
  }
  audio.currentTime = 0;
  audio.play?.().catch?.((_error) => {});
}

function withNodeGraphModuleStoreDemoPatch(entry, callback) {
  const userPatch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const demoPatch = nodeGraphModuleStoreDemoPatch(entry.type);
  if (!demoPatch) {
    setNodeGraphScriptStatus(`${entry.label} demo unavailable`, false);
    return;
  }
  commitNodeGraphPatch(demoPatch, {
    record: false,
    status: `${entry.label} demo loaded`,
  });
  callback({ demoPatch, userPatch });
}

function listenToNodeGraphModuleStoreDemo(entry) {
  withNodeGraphModuleStoreDemoPatch(entry, ({ userPatch }) => {
    renderNodeGraphAudio();
    const rendered = nodeGraphMvp.rendered ? { ...nodeGraphMvp.rendered } : null;
    const statusText = rendered ? `${entry.label} demo rendered` : `${entry.label} demo render blocked`;
    commitNodeGraphPatch(userPatch, {
      record: false,
      status: "returned to your patch",
    });
    if (rendered) {
      nodeGraphMvp.rendered = rendered;
      syncNodeGraphRenderedAudioElement();
      playNodeGraphRenderedAudioElement();
      setNodeGraphScriptStatus(statusText, true);
    } else {
      markNodeGraphRenderPending(statusText);
      setNodeGraphScriptStatus(statusText, false);
    }
  });
}

function watchNodeGraphModuleStoreDemo(entry) {
  withNodeGraphModuleStoreDemoPatch(entry, () => {
    setNodeGraphViewMode("ui");
  });
}

function editNodeGraphModuleStoreDemo(entry) {
  withNodeGraphModuleStoreDemoPatch(entry, () => {
    setNodeGraphViewMode("modular-only");
  });
}

function createNodeGraphModuleStoreButton(entry) {
  const card = document.createElement(entry.visible && entry.implemented ? "button" : "div");
  const spawnLabel = `Drag into scene to spawn ${entry.label} module`;
  card.className = "scene-context-store-card";
  card.dataset.moduleEnabled = String(entry.visible);
  card.dataset.homeEnabled = String(entry.homeVisible);
  card.dataset.developerEnabled = String(entry.developerVisible);
  card.dataset.moduleImplemented = String(entry.implemented);
  card.title = entry.visible && entry.implemented
    ? `${spawnLabel}. ${entry.description || "Module reference entry."}`
    : `${entry.label}: ${entry.description || "Module reference entry."}`;
  card.setAttribute("aria-label", entry.visible && entry.implemented
    ? spawnLabel
    : `${entry.label} module unavailable`);
  if (entry.visible && entry.implemented) {
    card.dataset.contextModule = entry.type;
    card.type = "button";
    card.role = "button";
    card.tabIndex = 0;
  } else {
    card.classList.add("under-construction");
    card.setAttribute("aria-disabled", "true");
  }

  const label = document.createElement("strong");
  label.textContent = entry.label;
  const nativeStatus = entry.nativeAvailable ? document.createElement("small") : null;
  if (nativeStatus) {
    nativeStatus.textContent = "Native C++";
    nativeStatus.className = "node-module-store-native-status";
  }

  if (entry.implemented) {
    card.append(label);
    if (nativeStatus) {
      card.append(nativeStatus);
    }
  } else {
    const status = document.createElement("small");
    status.textContent = "Under construction";
    card.append(label);
    if (nativeStatus) {
      card.append(nativeStatus);
    }
    card.append(status);
  }
  return card;
}

function createNodeGraphModuleDepartmentButton(department, entries) {
  const ad = nodeGraphModuleStoreDepartmentAds[department] || {};
  const titleText = ad.title || department;
  const button = document.createElement("button");
  button.className = "scene-context-store-department-card node-module-category-row";
  button.type = "button";
  button.dataset.storeDepartment = department;
  button.title = `${titleText}: module department`;
  button.setAttribute("aria-label", `Open ${titleText} module department.`);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    setNodeGraphModuleStoreDepartment(department);
  });

  const title = document.createElement("strong");
  title.className = "scene-context-store-department-title";
  title.textContent = titleText;

  const count = document.createElement("span");
  count.className = "scene-context-store-department-count";
  const workingCount = entries.filter((entry) => entry.visible && entry.implemented).length;
  count.textContent = String(workingCount);

  button.append(title, count);
  return button;
}

function createNodeGraphModuleStoreVisualGroupHeader(groupLabel) {
  const header = document.createElement("div");
  header.className = "scene-context-store-visual-group";
  header.textContent = groupLabel;
  return header;
}

function renderNodeGraphModuleStoreDepartmentGroup(target, groupLabel, departmentEntries, departmentSearch) {
  const matchingDepartments = departmentEntries.filter(([department, entries]) =>
    nodeGraphModuleStoreDepartmentMatchesSearch(department, entries, departmentSearch)
  );
  if (!matchingDepartments.length) {
    return;
  }
  target.append(createNodeGraphModuleStoreVisualGroupHeader(groupLabel));
  for (const [department, entries] of matchingDepartments) {
    target.append(createNodeGraphModuleDepartmentButton(department, entries));
  }
}

function loadNodeGraphModuleGroupsLocal() {
  if (!nodeGraphLocalDefaultPresetAllowed()) {
    return {};
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(nodeGraphModuleGroupStorageKey) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function saveNodeGraphModuleGroupsLocal(groups) {
  if (!nodeGraphLocalDefaultPresetAllowed()) {
    return false;
  }
  try {
    window.localStorage.setItem(nodeGraphModuleGroupStorageKey, JSON.stringify(groups));
    return true;
  } catch {
    return false;
  }
}

function createNodeGraphModuleGroupButton(name, group) {
  const card = document.createElement("div");
  card.className = "scene-context-store-card";
  card.dataset.moduleGroup = name;
  card.dataset.contextGroup = name;
  const label = document.createElement("strong");
  label.textContent = name;
  card.append(label);
  return card;
}

function renderNodeGraphModuleGroupCatalog() {
  const shell = document.getElementById("nodeModuleGroups");
  const target = document.getElementById("nodeModuleGroupList");
  if (!shell || !target) {
    return;
  }
  const groups = loadNodeGraphModuleGroupsLocal();
  const names = Object.keys(groups).sort((a, b) => a.localeCompare(b));
  target.innerHTML = "";
  for (const name of names) {
    target.append(createNodeGraphModuleGroupButton(name, groups[name]));
  }
  shell.hidden = names.length === 0;
}

function renderNodeGraphModuleStoreCatalog() {
  const available = document.getElementById("nodeModuleDepartmentList");
  const homeShell = document.getElementById("nodeModuleHomeShelfShell");
  const homeShelf = document.getElementById("nodeModuleHomeShelf");
  const shopView = document.getElementById("nodeModuleShopView");
  const backButton = document.getElementById("nodeModuleDepartmentBack");
  const departmentTitle = document.getElementById("nodeModuleDepartmentTitle");
  if (!available || !homeShell || !homeShelf || !shopView) {
    return;
  }

  available.innerHTML = "";
  homeShelf.innerHTML = "";
  const entries = nodeGraphModuleStoreEntries();
  const selectedDepartment = normalizeNodeGraphModuleStoreDepartment(nodeGraphMvp.moduleStoreDepartment || "");
  if (nodeGraphMvp.moduleStoreDepartment !== selectedDepartment) {
    nodeGraphMvp.moduleStoreDepartment = selectedDepartment;
  }
  const departmentSearch = nodeGraphMvp.moduleStoreDepartmentSearch || "";
  const searchingAllModules = !selectedDepartment &&
    Boolean(nodeGraphNormalizeModuleDepartmentSearch(departmentSearch));
  const departmentSearchField = document.getElementById("nodeModuleDepartmentSearch");
  if (departmentSearchField && departmentSearchField.value !== departmentSearch) {
    departmentSearchField.value = departmentSearch;
  }

  const publicDepartmentEntries = nodeGraphModuleStorePublicEntriesByDepartment(entries);
  const publicDepartmentNames = new Set(publicDepartmentEntries.map(([department]) => department));
  if (selectedDepartment && !publicDepartmentNames.has(selectedDepartment)) {
    nodeGraphMvp.moduleStoreDepartment = "";
    renderNodeGraphModuleStoreCatalog();
    if (typeof saveNodeGraphModuleStoreStateToUserSettings === "function") {
      saveNodeGraphModuleStoreStateToUserSettings();
    }
    return;
  }
  const matchingEntries = entries.filter((item) => nodeGraphModuleStoreEntryMatchesSearch(item, departmentSearch));
  const publicEntries = matchingEntries.filter((entry) =>
    entry.visible &&
    (!selectedDepartment || entry.category === selectedDepartment)
  );
  const visibleModuleEntries = selectedDepartment || departmentSearch
    ? [...publicEntries].sort(nodeGraphModuleStoreSearchResultOrder)
    : publicEntries;
  const homeEntries = entries.filter((entry) => entry.implemented && entry.homeVisible);

  shopView.classList.toggle("department-selected", Boolean(selectedDepartment));
  if (backButton) {
    backButton.hidden = !selectedDepartment;
  }
  if (departmentTitle) {
    departmentTitle.hidden = !selectedDepartment;
    departmentTitle.textContent = selectedDepartment || "";
  }
  available.classList.add("scene-context-store-department-list");
  available.classList.toggle("node-module-store-list", Boolean(selectedDepartment || searchingAllModules));

  for (const entry of homeEntries) {
    homeShelf.append(createNodeGraphModuleStoreButton(entry));
  }
  homeShell.hidden = homeEntries.length === 0;

  if (selectedDepartment || searchingAllModules) {
    for (const entry of visibleModuleEntries) {
      available.append(createNodeGraphModuleStoreButton(entry));
    }
  } else {
    const entriesByDepartment = new Map(publicDepartmentEntries);
    const handledDepartments = new Set();
    for (const group of nodeGraphModuleStoreVisualGroups) {
      const groupDepartmentEntries = group.departments
        .filter((department) => entriesByDepartment.has(department))
        .map((department) => {
          handledDepartments.add(department);
          return [department, entriesByDepartment.get(department)];
        });
      renderNodeGraphModuleStoreDepartmentGroup(
        available,
        group.label,
        groupDepartmentEntries,
        departmentSearch,
      );
    }
    const otherDepartmentEntries = publicDepartmentEntries.filter(([department]) => !handledDepartments.has(department));
    if (otherDepartmentEntries.length) {
      renderNodeGraphModuleStoreDepartmentGroup(available, "Other", otherDepartmentEntries, departmentSearch);
    }
  }
  if (!available.children.length) {
    const empty = document.createElement("div");
    empty.className = "scene-context-store-empty";
    empty.textContent = departmentSearch
      ? "No modules match this search."
      : selectedDepartment
        ? "No modules are available in this category."
        : "No categories are available.";
    available.append(empty);
  }
  renderNodeGraphModuleGroupCatalog();
}

function positionNodeGraphModuleShopView(x, y) {
  const panel = document.getElementById("nodeModuleShopView");
  if (!panel) {
    return;
  }
  panel.style.position = "fixed";
  panel.style.margin = "0";
  const { left, top } = nodeGraphFloatingWindowPosition(panel, x, y);
  if (typeof setNodeGraphFloatingWindowViewportPosition === "function") {
    setNodeGraphFloatingWindowViewportPosition(panel, left, top);
  } else {
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = "auto";
  }
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState(
      "moduleBrowser",
      panel,
      { open: !panel.hidden, position: { left, top } },
      { persist: false },
    );
  }
}

function positionNodeGraphModuleShopViewNearPoint(point = null) {
  const panel = document.getElementById("nodeModuleShopView");
  if (!panel) {
    return;
  }
  const x = Number(point?.x);
  const y = Number(point?.y);
  panel.hidden = false;
  const rect = panel.getBoundingClientRect();
  positionNodeGraphModuleShopView(
    Number.isFinite(x) ? x : Math.max(12, (window.innerWidth - rect.width) * 0.5),
    Number.isFinite(y) ? y : 72,
  );
}

function beginNodeGraphModuleShopViewDrag(event) {
  const panel = document.getElementById("nodeModuleShopView");
  if (!panel || panel.hidden) {
    return;
  }
  beginNodeGraphFloatingWindowDrag(event, panel, "moduleShopDragging");
}

function dragNodeGraphModuleShopView(event) {
  dragNodeGraphFloatingWindow(
    event,
    "moduleShopDragging",
    document.getElementById("nodeModuleShopView"),
    (next) => {
      if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
        rememberNodeGraphWorkspaceWindowState(
          "moduleBrowser",
          document.getElementById("nodeModuleShopView"),
          { open: true, position: next },
          { persist: false },
        );
      }
    },
  );
}

function endNodeGraphModuleShopViewDrag(event) {
  endNodeGraphFloatingWindowDrag(event, "moduleShopDragging", () => {
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState(
        "moduleBrowser",
        document.getElementById("nodeModuleShopView"),
        { open: true },
        { status: false },
      );
    }
  });
}

function beginNodeGraphModuleShopViewResize(event) {
  const panel = document.getElementById("nodeModuleShopView");
  beginNodeGraphFloatingWindowResize(event, panel, "moduleShopResizing");
}

function dragNodeGraphModuleShopViewResize(event) {
  dragNodeGraphFloatingWindowResize(event, "moduleShopResizing", applyNodeGraphModuleShopWindowSize);
}

function endNodeGraphModuleShopViewResize(event) {
  endNodeGraphFloatingWindowResize(event, "moduleShopResizing", saveNodeGraphModuleShopWindowSizeToUserSettings);
}

function openNodeGraphModuleShop(point = null, windowPoint = null) {
  const panel = document.getElementById("nodeModuleShopView");
  if (panel && !panel.hidden) {
    pulseNodeGraphFloatingWindowAttention(panel);
    return;
  }
  nodeGraphMvp.sceneContextPoint = point;
  nodeGraphMvp.sceneContextTargetNode = null;
  nodeGraphMvp.sceneContextTargetWire = null;
  // The module browser is a floating window, independent of the main view
  // mode (modular / modular-only / settings / etc.) — opening or closing it
  // must never change which main view is active.
  if (panel) {
    panel.hidden = false;
  }
  document.getElementById("nodeModuleShopButton")?.classList.toggle("active", true);
  document.getElementById("nodeModuleShopButton")?.setAttribute("aria-pressed", "true");
  renderNodeGraphModuleStoreCatalog();
  if (typeof applyNodeGraphModuleShopWindowSize === "function") {
    applyNodeGraphModuleShopWindowSize(nodeGraphMvp.workspaceWindowStates?.moduleBrowser?.size);
  }
  if (
    typeof positionNodeGraphWorkspaceWindowFromState !== "function" ||
    !positionNodeGraphWorkspaceWindowFromState("moduleBrowser", panel)
  ) {
    positionNodeGraphModuleShopViewNearPoint(windowPoint || point);
  }
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState("moduleBrowser", panel, { open: true }, { status: false });
  }
}

function closeNodeGraphModuleShop() {
  nodeGraphMvp.sceneContextPoint = null;
  const panel = document.getElementById("nodeModuleShopView");
  if (panel) {
    panel.hidden = true;
  }
  document.getElementById("nodeModuleShopButton")?.classList.toggle("active", false);
  document.getElementById("nodeModuleShopButton")?.setAttribute("aria-pressed", "false");
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState("moduleBrowser", panel, { open: false }, { status: false });
  }
}

function loadNodeGraphModuleStoreStateLocal() {
  renderNodeGraphModuleStoreCatalog();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadNodeGraphNativeModuleCatalog, { once: true });
} else {
  loadNodeGraphNativeModuleCatalog();
}
