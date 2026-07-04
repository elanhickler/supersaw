// Shared offline JS mirror of native_modules/hypersaw -- see that file's
// header comment for the full derivation, cross-checked against the real
// soemdsp library headers (Wire.hpp, SampleRate.hpp,
// random/FlexibleRandomWalk.hpp, filter/OnePoleFilter.hpp,
// random/NoiseGenerator.hpp, utility/curve_functions.hpp,
// oscillator/PolyBLEP.hpp). Every parameter name matches soundemote's
// own HypersawUnit::run() (docs/reference/Hypersaw.hpp):
//
//   div               = i / numOscillators
//   staticDispersion  = div * distributePhaseAmp + randomOffset * randomPhaseAmp
//   vibratoMultiplier = vibInputForVoice * vibAmp + vibOffset   (vibInput only for voice i >= 1)
//   walkOut           = driftAmp > 0 ? drift * driftAmp : 0
//   dispersion        = staticDispersion * vibratoMultiplier + walkOut
//
// vibOffset=0 fully silences distributePhaseAmp/randomPhaseAmp regardless
// of their own values -- that's the original's actual (multiplicative,
// not additive) formula, not a bug.
//
// drift_ (FlexibleRandomWalk, Method::fixed_steps) is transcribed exactly
// from the real FlexibleRandomWalk.hpp (a fixed-magnitude, random-sign
// step accumulator, hard-clamped to [-1,1], then lowpass-filtered mixed
// with raw white noise) -- see hypersaw.cpp's header comment for the
// full derivation of driftStepSize/driftRandomMix/driftWhiteNoiseMix.
//
// numOscillators click prevention -- see hypersaw.cpp's header comment:
// each voice has a smooth activeGain ramp (inspired by the original's
// env_.transferState()/exponential envelope, adapted since this port has
// no note-envelope system) instead of switching in/out instantly, and
// div's denominator is a smoothed (not instantaneous) oscillator count
// so already-active voices don't jump position when the total changes.

const nodeGraphHypersawMaxVoices = 64;  // matches HypersawMaster::numOscillatorsMax_

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

// curve::Rational{skew}.get(t), t already normalized 0..1.
function nodeGraphHypersawRationalCurve(skew, t) {
  return ((1 + skew) * t) / (1 - skew + 2 * skew * t);
}

function nodeGraphHypersawCreateVoice() {
  return {
    phase: 0,
    randomOffset: Math.random() * 2 - 1,  // matches NoiseGenerator's run(-1,1)
    driftOut: 0,
    driftFilterState: 0,
    activeGain: 0,
  };
}

function createNodeGraphHypersawState() {
  const voices = [];
  for (let i = 0; i < nodeGraphHypersawMaxVoices; i++) {
    voices.push(nodeGraphHypersawCreateVoice());
  }
  return { voices, vibPhase: 0, countsInitialized: false, smoothedNumOscillators: 0, activeUpperBound: 0 };
}

// options: { frequencyHz, sampleRate, phaseOffset (0..1), numOscillators (1..64),
//   distributePhaseAmp (0..1), randomPhaseAmp (0..1), driftAmp (0..1),
//   driftFrequency (Hz), driftJitter (Hz), vibAmp (0..2), vibOffset,
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
  const safeDriftFrequency = Math.max(0, Number(options.driftFrequency) || 0);
  const safeDriftJitter = Math.max(0, Number(options.driftJitter) || 0);
  const vibAmt = clampNodeSliderValue(Number(options.vibAmp) || 0, 0, 2);
  const vibOffsetAmt = Number(options.vibOffset) || 0;
  const vibRate = Number(options.vibRate) || 0;
  const level = Number(options.level) || 0;

  const phaseIncrement = safeFrequency / sampleRate;

  // drift_ coefficients -- shared across every voice (only computed when
  // driftAmt > 0, matching drift_.run() only ever being called under
  // that same guard in the original).
  let driftStepSize = 0, driftRandomMix = 0, driftWhiteNoiseMix = 0;
  let driftA1 = 0, driftB0 = 0;
  if (driftAmt > 0) {
    const jitterInc = safeDriftJitter / sampleRate;
    driftStepSize = nodeGraphHypersawRationalCurve(0.99, jitterInc);
    const increment = safeDriftFrequency / sampleRate;
    const freqAndJitterAvg = (jitterInc + increment) * 0.5;
    if (freqAndJitterAvg >= 0.9) {
      const normalized = (freqAndJitterAvg - 0.9) / 0.1;
      driftWhiteNoiseMix = nodeGraphHypersawRationalCurve(-0.7, normalized);
    }
    driftRandomMix = 1 - driftWhiteNoiseMix;
    driftA1 = Math.exp((-2 * Math.PI * safeDriftFrequency) / sampleRate);
    driftB0 = 1 - driftA1;
  }

  // vibOsc_ -- one shared oscillator per Hypersaw instance, matching
  // `vibOsc_.phaseOffset_ = 0.5` at construction.
  state.vibPhase = nodeGraphHypersawWrap01(state.vibPhase + vibRate / sampleRate);
  const vibSample = nodeGraphHypersawFastSine01(state.vibPhase + 0.5);

  // First-ever call: snap straight to the requested count (no unwanted
  // fade-in delay when a sound starts) -- later CHANGES to numOscillators
  // are smoothed instead (see file header comment).
  if (!state.countsInitialized) {
    state.smoothedNumOscillators = numOscillators;
    state.activeUpperBound = numOscillators;
    for (let v = 0; v < numOscillators; v++) state.voices[v].activeGain = 1;
    state.countsInitialized = true;
  }
  if (numOscillators > state.activeUpperBound) state.activeUpperBound = numOscillators;

  const countSmoothCoeff = 1 - Math.exp(-1 / (0.02 * sampleRate));  // ~20ms
  state.smoothedNumOscillators += (numOscillators - state.smoothedNumOscillators) * countSmoothCoeff;
  const smoothedCount = state.smoothedNumOscillators > 1 ? state.smoothedNumOscillators : 1;
  const gainSmoothCoeff = 1 - Math.exp(-1 / (0.01 * sampleRate));  // ~10ms

  let leftSum = 0, rightSum = 0;
  let leftGainSum = 0, rightGainSum = 0;
  const voicePhases = new Array(numOscillators);

  for (let i = 0; i < state.activeUpperBound; i++) {
    const voice = state.voices[i];

    const gainTarget = i < numOscillators ? 1 : 0;
    voice.activeGain += (gainTarget - voice.activeGain) * gainSmoothCoeff;

    const div = i / smoothedCount;

    let walkOut = 0;
    if (driftAmt > 0) {
      const n = Math.random() * 2 - 1;
      const r = n > 0 ? driftStepSize : -driftStepSize;
      voice.driftOut = clampNodeSliderValue(voice.driftOut + r, -1, 1);
      const raw = voice.driftOut * driftRandomMix + n * driftWhiteNoiseMix;
      voice.driftFilterState = driftB0 * raw + driftA1 * voice.driftFilterState;
      walkOut = voice.driftFilterState * driftAmt;
    }

    // vibInput_ only ever points at vibOsc_ for i >= 1.
    const vibInputForVoice = i === 0 ? 0 : vibSample;

    const staticDispersion = div * distributeAmt + voice.randomOffset * randomAmt;
    const vibratoMultiplier = vibInputForVoice * vibAmt + vibOffsetAmt;
    const dispersion = staticDispersion * vibratoMultiplier + walkOut;

    const renderPhase = nodeGraphHypersawWrap01(voice.phase + phaseOffset + dispersion);
    // PolyBLEP::saw(): 1 - 2*t + blep(t, dt) -- a descending ramp.
    const sawSample = (1 - 2 * renderPhase + nodeGraphHypersawPolyBlep(renderPhase, phaseIncrement > 0 ? phaseIncrement : 1)) * voice.activeGain;

    if (i < numOscillators) {
      voicePhases[i] = nodeGraphHypersawWrap01(dispersion);
    }
    voice.phase = nodeGraphHypersawWrap01(voice.phase + phaseIncrement);

    const isCenter = i === 0 || (i === 1 && numOscillators % 2 === 0);
    if (isCenter) {
      leftSum += sawSample;
      rightSum += sawSample;
      leftGainSum += voice.activeGain;
      rightGainSum += voice.activeGain;
    } else if (i % 2 === 0) {
      leftSum += sawSample;
      leftGainSum += voice.activeGain;
    } else {
      rightSum += sawSample;
      rightGainSum += voice.activeGain;
    }
  }

  while (state.activeUpperBound > numOscillators && state.voices[state.activeUpperBound - 1].activeGain < 0.0005) {
    state.activeUpperBound--;
  }

  let left = leftGainSum > 0.0001 ? leftSum / leftGainSum : 0;
  let right = rightGainSum > 0.0001 ? rightSum / rightGainSum : 0;
  if (!Number.isFinite(left)) left = 0;
  if (!Number.isFinite(right)) right = 0;

  const outLeft = clampNodeSliderValue(left, -1.5, 1.5) * level;
  const outRight = clampNodeSliderValue(right, -1.5, 1.5) * level;
  return { Left: outLeft, Right: outRight, voicePhases };
}
