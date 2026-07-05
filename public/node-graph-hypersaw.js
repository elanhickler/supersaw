// Shared offline JS mirror of native_modules/hypersaw -- see that file's
// header comment for the full derivation, cross-checked against the real
// soemdsp library headers (Wire.hpp, SampleRate.hpp,
// random/FlexibleRandomWalk.hpp, filter/OnePoleFilter.hpp,
// random/NoiseGenerator.hpp, utility/curve_functions.hpp,
// oscillator/PolyBLEP.hpp). Every parameter name matches soundemote's
// own HypersawUnit::run() (docs/reference/Hypersaw.hpp):
//
//   div        = i / numOscillators
//   vibratoOut = vibInputForVoice * vibAmp + vibOffset   (vibInput only for voice i >= 1)
//   walkOut    = driftAmp > 0 ? drift * driftAmp : 0
//   dispersion = div*distributePhaseAmp + div*vibratoOut + randomOffset*randomPhaseAmp + walkOut
//
// The real HypersawUnit::run() has three formula variants stacked as
// comments (an evolution, not just one line) -- the first two are fully
// additive (every dispersion source independent), and only the last,
// active one multiplies the whole static dispersion by
// (vibInput*vibAmp + vibOffset), which silences distributePhaseAmp/
// randomPhaseAmp whenever vibOffset is 0. This port uses the additive
// form: it's the only way distributePhaseAmp/randomPhaseAmp work as
// plain, unconditional "phase position" controls rather than being
// gated by an unrelated vibrato setting. See hypersaw.cpp's header
// comment for the full three-variant transcription.
//
// drift_ (FlexibleRandomWalk, Method::fixed_steps) is transcribed exactly
// from the real FlexibleRandomWalk.hpp (a fixed-magnitude, random-sign
// step accumulator, hard-clamped to [-1,1], then lowpass-filtered mixed
// with raw white noise) -- see hypersaw.cpp's header comment for the
// full derivation of driftStepSize/driftRandomMix/driftWhiteNoiseMix.
//
// numOscillators is a genuinely fluid (fractional) value, not rounded to
// an integer: voice i's gain is clamp(numOscillators - i, 0, 1), so with
// numOscillators = 4.7, voices 0-3 sit at full gain and voice 4 (the
// "next" one) sits at 0.7 -- a direct function of the slider's current
// position, not a time-based ramp. `div` (i/numOscillators) likewise
// uses the raw fractional value, so it varies continuously as
// numOscillators moves rather than snapping between integers.

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
  const voiceCountFloat = clampNodeSliderValue(Number(options.numOscillators) || 1, 1, nodeGraphHypersawMaxVoices);
  // Voice i's gain is clamp(voiceCountFloat - i, 0, 1) -- floor(voiceCountFloat)
  // voices at full gain, one voice fading in/out at the fractional edge.
  const voiceLoopCount = Math.ceil(voiceCountFloat);
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

  // Center/side routing parity uses the rounded voice count -- this only
  // ever affects which channel the partially-faded edge voice routes to,
  // a cosmetic detail next to the gain fade itself.
  const voiceCountIsEven = Math.round(voiceCountFloat) % 2 === 0;

  let leftSum = 0, rightSum = 0;
  let leftGainSum = 0, rightGainSum = 0;
  const voicePhases = new Array(voiceLoopCount);

  for (let i = 0; i < voiceLoopCount; i++) {
    const voice = state.voices[i];

    const gain = clampNodeSliderValue(voiceCountFloat - i, 0, 1);
    const div = i / voiceCountFloat;

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
    const vibratoOut = vibInputForVoice * vibAmt + vibOffsetAmt;

    const dispersion = div * distributeAmt + div * vibratoOut + voice.randomOffset * randomAmt + walkOut;

    const renderPhase = nodeGraphHypersawWrap01(voice.phase + phaseOffset + dispersion);
    // PolyBLEP::saw(): 1 - 2*t + blep(t, dt) -- a descending ramp.
    const sawSample = (1 - 2 * renderPhase + nodeGraphHypersawPolyBlep(renderPhase, phaseIncrement > 0 ? phaseIncrement : 1)) * gain;

    voicePhases[i] = nodeGraphHypersawWrap01(dispersion);
    voice.phase = nodeGraphHypersawWrap01(voice.phase + phaseIncrement);

    const isCenter = i === 0 || (i === 1 && voiceCountIsEven);
    if (isCenter) {
      leftSum += sawSample;
      rightSum += sawSample;
      leftGainSum += gain;
      rightGainSum += gain;
    } else if (i % 2 === 0) {
      leftSum += sawSample;
      leftGainSum += gain;
    } else {
      rightSum += sawSample;
      rightGainSum += gain;
    }
  }

  let left = leftGainSum > 0.0001 ? leftSum / leftGainSum : 0;
  let right = rightGainSum > 0.0001 ? rightSum / rightGainSum : 0;
  if (!Number.isFinite(left)) left = 0;
  if (!Number.isFinite(right)) right = 0;

  const outLeft = clampNodeSliderValue(left, -1.5, 1.5) * level;
  const outRight = clampNodeSliderValue(right, -1.5, 1.5) * level;
  return { Left: outLeft, Right: outRight, voicePhases };
}
