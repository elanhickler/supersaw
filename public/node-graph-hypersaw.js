// Shared offline JS mirror of native_modules/hypersaw -- see that file's
// header comment for the full derivation. Every parameter name here
// matches native_modules/hypersaw/hypersaw.cpp exactly, which in turn
// matches soundemote's own HypersawUnit::run() (docs/reference/
// Hypersaw.hpp):
//
//   div               = i / numOscillators
//   staticDispersion  = div * distributePhaseAmp + randomOffset * randomPhaseAmp
//   vibratoMultiplier = vibInputForVoice * vibAmp + vibOffset   (vibInput only for voice i >= 1)
//   walkOut           = driftAmp > 0 ? driftLp * driftAmp : 0
//   dispersion        = staticDispersion * vibratoMultiplier + walkOut
//
// vibOffset=0 fully silences distributePhaseAmp/randomPhaseAmp regardless
// of their own values -- that's the original's actual (multiplicative,
// not additive) formula, not a bug.

const nodeGraphHypersawMaxVoices = 64;  // matches HypersawMaster::numOscillatorsMax_
const nodeGraphHypersawDriftFixedStepSize = 0.12;

function nodeGraphHypersawPolyBlep(t, dt) {
  if (dt <= 0) return 0;
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

function nodeGraphHypersawWrap01(x) {
  const w = x - Math.floor(x);
  return w < 0 ? 0 : (w >= 1 ? 0 : w);
}

// Cheap, smooth, periodic parabolic approximation of sin(2*pi*phase01) --
// good enough for a sub-audio vibrato LFO.
function nodeGraphHypersawFastSine01(phase01) {
  const x = nodeGraphHypersawWrap01(phase01) - 0.5;
  return 8 * x * (0.5 - Math.abs(x));
}

function nodeGraphHypersawCreateVoice() {
  return {
    phase: 0,
    randomOffset: Math.random() - 0.5,
    driftLp: 0,
    driftStepTimer: 0,
  };
}

function createNodeGraphHypersawState() {
  const voices = [];
  for (let i = 0; i < nodeGraphHypersawMaxVoices; i++) {
    voices.push(nodeGraphHypersawCreateVoice());
  }
  return { voices, vibPhase: 0 };
}

// options: { frequencyHz, sampleRate, phaseOffset (0..1), numOscillators (1..64),
//   distributePhaseAmp (0..1), randomPhaseAmp (0..1), driftAmp (0..1),
//   driftFrequency (Hz), driftJitter (0..1), vibAmp (0..2), vibOffset,
//   vibRate (Hz), level }
// returns: { Left, Right, voicePhases: number[] } -- voicePhases is each
// active voice's dispersion offset (0..1, wrapped), for the voice-position
// display. Excludes the audio-rate phase accumulator (that's the pitch
// itself), so all dispersion controls at their silencing values means
// every voice sits still.
function nodeGraphHypersawSample(state, options = {}) {
  const sampleRate = Number(options.sampleRate) > 1 ? Number(options.sampleRate) : 48000;
  const safeFrequency = Number(options.frequencyHz) > 0 ? Number(options.frequencyHz) : 0;
  const phaseOffset = nodeGraphHypersawWrap01(Number(options.phaseOffset) || 0);
  const numOscillators = clampNodeSliderValue(Math.round(Number(options.numOscillators) || 1), 1, nodeGraphHypersawMaxVoices);
  const distributeAmt = clampNodeSliderValue(Number(options.distributePhaseAmp) || 0, 0, 1);
  const randomAmt = clampNodeSliderValue(Number(options.randomPhaseAmp) || 0, 0, 1);
  const driftAmt = clampNodeSliderValue(Number(options.driftAmp) || 0, 0, 1);
  const driftJitterAmt = clampNodeSliderValue(Number(options.driftJitter) || 0, 0, 1);
  const safeDriftFrequency = Number(options.driftFrequency) > 0.01 ? Number(options.driftFrequency) : 0.01;
  const vibAmt = clampNodeSliderValue(Number(options.vibAmp) || 0, 0, 2);
  const vibOffsetAmt = Number(options.vibOffset) || 0;
  const vibRate = Number(options.vibRate) || 0;
  const level = Number(options.level) || 0;

  const phaseIncrement = safeFrequency / sampleRate;

  // vibOsc_ -- one shared oscillator per Hypersaw instance, matching
  // `vibOsc_.phaseOffset_ = 0.5` at construction.
  state.vibPhase = nodeGraphHypersawWrap01(state.vibPhase + vibRate / sampleRate);
  const vibSample = nodeGraphHypersawFastSine01(state.vibPhase + 0.5);

  let leftSum = 0, rightSum = 0;
  let leftCount = 0, rightCount = 0;
  const voicePhases = new Array(numOscillators);

  for (let i = 0; i < numOscillators; i++) {
    const voice = state.voices[i];
    const div = i / numOscillators;

    // drift_ (FlexibleRandomWalk, Method::fixed_steps): fixed-magnitude,
    // random-sign steps at ~driftFrequency Hz, jittered timing.
    voice.driftStepTimer -= 1;
    if (voice.driftStepTimer <= 0) {
      const jitterFactor = 1 + (Math.random() * 2 - 1) * 2 * driftJitterAmt;
      let nominalInterval = (sampleRate / safeDriftFrequency) * jitterFactor;
      if (nominalInterval < 1) nominalInterval = 1;
      voice.driftStepTimer = nominalInterval;
      voice.driftLp += (Math.random() * 2 - 1) * 2 * nodeGraphHypersawDriftFixedStepSize;
      if (voice.driftLp > 0.5) voice.driftLp = 1 - voice.driftLp;
      if (voice.driftLp < -0.5) voice.driftLp = -1 - voice.driftLp;
    }

    // vibInput_ only ever points at vibOsc_ for i >= 1.
    const vibInputForVoice = i === 0 ? 0 : vibSample;

    const staticDispersion = div * distributeAmt + voice.randomOffset * randomAmt;
    const vibratoMultiplier = vibInputForVoice * vibAmt + vibOffsetAmt;
    const walkOut = driftAmt > 0 ? voice.driftLp * driftAmt : 0;
    const dispersion = staticDispersion * vibratoMultiplier + walkOut;

    const renderPhase = nodeGraphHypersawWrap01(voice.phase + phaseOffset + dispersion);
    const sawSample = 2 * renderPhase - 1 - nodeGraphHypersawPolyBlep(renderPhase, phaseIncrement > 0 ? phaseIncrement : 1);

    voicePhases[i] = nodeGraphHypersawWrap01(dispersion);
    voice.phase = nodeGraphHypersawWrap01(voice.phase + phaseIncrement);

    const isCenter = i === 0 || (i === 1 && numOscillators % 2 === 0);
    if (isCenter) {
      leftSum += sawSample;
      rightSum += sawSample;
      leftCount++;
      rightCount++;
    } else if (i % 2 === 0) {
      leftSum += sawSample;
      leftCount++;
    } else {
      rightSum += sawSample;
      rightCount++;
    }
  }

  let left = leftCount > 0 ? leftSum / leftCount : 0;
  let right = rightCount > 0 ? rightSum / rightCount : 0;
  if (!Number.isFinite(left)) left = 0;
  if (!Number.isFinite(right)) right = 0;

  const outLeft = clampNodeSliderValue(left, -1.5, 1.5) * level;
  const outRight = clampNodeSliderValue(right, -1.5, 1.5) * level;
  return { Left: outLeft, Right: outRight, voicePhases };
}
