// Shared offline JS mirror of native_modules/hypersaw -- see that file's
// header comment for the full derivation and sourcing (Hypersaw.hpp,
// the real soemdsp library headers, and the actual shipped SoEmHypersaw
// VST's parameter list/wiring). Dispersion formula (per voice i of
// numOscillators):
//
//   div        = i / numOscillators
//   vibratoOut = vibInputForVoice * vibAmp + vibOffset   (vibInput only for voice i >= 1)
//   walkOut    = driftAmp > 0 ? drift * driftAmp : 0
//   dispersion = div*distributePhaseAmp + div*vibratoOut + randomOffset*randomPhaseAmp + walkOut
//
// numOscillators is fluid/fractional: voice i's gain is
// clamp(numOscillators - i, 0, 1), not an on/off switch.
//
// waveform/morph/driftStyle are wired GLOBALLY to every voice in the
// original (not per-voice), matching that here. centerSideCrossfade
// weights center vs. side voices (HypersawMaster::getCenterSideAmplitudeValue);
// monoStereo applies semath.cpp's real stereoWidth() last.

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

// PolyBLAMP correction term (used by Tri).
function nodeGraphHypersawPolyBlamp(t, dt) {
  if (dt <= 0) return 0;
  if (t < dt) {
    const x = t / dt - 1;
    return -(1 / 3) * x * x * x;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt + 1;
    return (1 / 3) * x * x * x;
  }
  return 0;
}

function nodeGraphHypersawWrap01(x) {
  const w = x - Math.floor(x);
  return w < 0 ? 0 : (w >= 1 ? 0 : w);
}

// Cheap, smooth, periodic parabolic approximation of sin(2*pi*phase01) --
// used both for the Sin waveform and the vibrato LFO.
function nodeGraphHypersawFastSine01(phase01) {
  const x = nodeGraphHypersawWrap01(phase01) - 0.5;
  return 8 * x * (0.5 - Math.abs(x));
}

// curve::Rational{skew}.get(t), t already normalized 0..1.
function nodeGraphHypersawRationalCurve(skew, t) {
  return ((1 + skew) * t) / (1 - skew + 2 * skew * t);
}

// PolyBLEP.hpp::get()'s cases for the shapes SoEmHypersaw exposes via its
// global Waveform parameter: 0=Sin, 1=Square, 2=Tri, 3=Saw (this port's
// prior/default behavior), 4=Ramp, 5=SawSquare (the only one using morph).
function nodeGraphHypersawWaveformSample(waveform, t, dt, morph) {
  switch (waveform) {
    case 0:  // Sin
      return nodeGraphHypersawFastSine01(t);
    case 1: {  // Square
      const t1 = nodeGraphHypersawWrap01(t + 0.5);
      let y = t < 0.5 ? 1 : -1;
      y += nodeGraphHypersawPolyBlep(t, dt) - nodeGraphHypersawPolyBlep(t1, dt);
      return y;
    }
    case 2: {  // Tri
      const t1 = nodeGraphHypersawWrap01(t + 0.25);
      const t2 = nodeGraphHypersawWrap01(t + 0.75);
      let y = t * 4;
      if (y >= 3) y -= 4;
      else if (y > 1) y = 2 - y;
      y += 4 * dt * (nodeGraphHypersawPolyBlamp(t1, dt) - nodeGraphHypersawPolyBlamp(t2, dt));
      return y;
    }
    case 4: {  // Ramp
      const t1 = nodeGraphHypersawWrap01(t + 0.5);
      let y = t1 * 2 - 1;
      y -= nodeGraphHypersawPolyBlep(t1, dt);
      return y;
    }
    case 5: {  // SawSquare
      let y = 1 - 2 * t;
      y += t < 0.5 ? morph : -morph;
      y += nodeGraphHypersawPolyBlep(t, dt);
      const tMid = nodeGraphHypersawWrap01(t - 0.5);
      y += -morph * nodeGraphHypersawPolyBlep(tMid, dt);
      return y;
    }
    case 3:  // Saw
    default:
      return 1 - 2 * t + nodeGraphHypersawPolyBlep(t, dt);
  }
}

// HypersawMaster::getCenterSideAmplitudeValue(), transcribed exactly.
function nodeGraphHypersawCenterSideAmplitude(value) {
  return {
    center: Math.min(2 - value * 2, 1),
    side: Math.min(value * 2, 1),
  };
}

// semath.cpp's real stereoWidth(), transcribed exactly.
function nodeGraphHypersawStereoWidth(width, l, r) {
  const widthInv = 1 - width;
  const m = (l + r) * 0.5;
  return { l: widthInv * m + width * l, r: widthInv * m + width * r };
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
//   vibRate (Hz), waveform (0..5), morph (0..1), driftStyle (0..2),
//   centerSideCrossfade (0..1), monoStereo (0..1), level }
// returns: { Left, Right, voicePhases: number[] }
function nodeGraphHypersawSample(state, options = {}) {
  const sampleRate = Number(options.sampleRate) > 1 ? Number(options.sampleRate) : 48000;
  const safeFrequency = Number(options.frequencyHz) > 0 ? Number(options.frequencyHz) : 0;
  const phaseOffset = nodeGraphHypersawWrap01(Number(options.phaseOffset) || 0);
  const voiceCountFloat = clampNodeSliderValue(Number(options.numOscillators) || 1, 1, nodeGraphHypersawMaxVoices);
  const voiceLoopCount = Math.ceil(voiceCountFloat);
  const distributeAmt = clampNodeSliderValue(Number(options.distributePhaseAmp) || 0, 0, 1);
  const randomAmt = clampNodeSliderValue(Number(options.randomPhaseAmp) || 0, 0, 1);
  const driftAmt = clampNodeSliderValue(Number(options.driftAmp) || 0, 0, 1);
  const safeDriftFrequency = Math.max(0, Number(options.driftFrequency) || 0);
  const safeDriftJitter = Math.max(0, Number(options.driftJitter) || 0);
  const vibAmt = clampNodeSliderValue(Number(options.vibAmp) || 0, 0, 2);
  const vibOffsetAmt = Number(options.vibOffset) || 0;
  const vibRate = Number(options.vibRate) || 0;
  const waveform = Math.round(Number(options.waveform) || 0);
  const morphAmt = clampNodeSliderValue(Number(options.morph) || 0, 0, 1);
  const driftStyle = clampNodeSliderValue(Math.round(Number(options.driftStyle) ?? 2), 0, 2);
  const centerSide = nodeGraphHypersawCenterSideAmplitude(clampNodeSliderValue(Number(options.centerSideCrossfade) ?? 0.5, 0, 1));
  const monoStereo = clampNodeSliderValue(Number(options.monoStereo) ?? 1, 0, 1);
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

  const voiceCountIsEven = Math.round(voiceCountFloat) % 2 === 0;

  let centerSum = 0, centerGainSum = 0;
  let sideLeftSum = 0, sideLeftGainSum = 0;
  let sideRightSum = 0, sideRightGainSum = 0;
  const voicePhases = new Array(voiceLoopCount);

  for (let i = 0; i < voiceLoopCount; i++) {
    const voice = state.voices[i];

    const gain = clampNodeSliderValue(voiceCountFloat - i, 0, 1);
    const div = i / voiceCountFloat;

    let walkOut = 0;
    if (driftAmt > 0) {
      const n = Math.random() * 2 - 1;
      if (driftStyle === 0) {
        // Filtered Noise: lpf of raw white noise, no accumulator at all.
        voice.driftFilterState = driftB0 * n + driftA1 * voice.driftFilterState;
      } else {
        // Random Steps: step size proportional to n. Fixed Steps: step
        // size is a constant magnitude, direction = sign(n).
        const r = driftStyle === 1 ? n * driftStepSize : (n > 0 ? driftStepSize : -driftStepSize);
        voice.driftOut = clampNodeSliderValue(voice.driftOut + r, -1, 1);
        const raw = voice.driftOut * driftRandomMix + n * driftWhiteNoiseMix;
        voice.driftFilterState = driftB0 * raw + driftA1 * voice.driftFilterState;
      }
      walkOut = voice.driftFilterState * driftAmt;
    }

    // vibInput_ only ever points at vibOsc_ for i >= 1.
    const vibInputForVoice = i === 0 ? 0 : vibSample;
    const vibratoOut = vibInputForVoice * vibAmt + vibOffsetAmt;

    const dispersion = div * distributeAmt + div * vibratoOut + voice.randomOffset * randomAmt + walkOut;

    const renderPhase = nodeGraphHypersawWrap01(voice.phase + phaseOffset + dispersion);
    const sample = nodeGraphHypersawWaveformSample(waveform, renderPhase, phaseIncrement > 0 ? phaseIncrement : 1, morphAmt) * gain;

    voicePhases[i] = nodeGraphHypersawWrap01(dispersion);
    voice.phase = nodeGraphHypersawWrap01(voice.phase + phaseIncrement);

    const isCenter = i === 0 || (i === 1 && voiceCountIsEven);
    if (isCenter) {
      centerSum += sample;
      centerGainSum += gain;
    } else if (i % 2 === 0) {
      sideLeftSum += sample;
      sideLeftGainSum += gain;
    } else {
      sideRightSum += sample;
      sideRightGainSum += gain;
    }
  }

  const centerAvg = centerGainSum > 0.0001 ? centerSum / centerGainSum : 0;
  const sideLeftAvg = sideLeftGainSum > 0.0001 ? sideLeftSum / sideLeftGainSum : 0;
  const sideRightAvg = sideRightGainSum > 0.0001 ? sideRightSum / sideRightGainSum : 0;

  let left = centerAvg * centerSide.center + sideLeftAvg * centerSide.side;
  let right = centerAvg * centerSide.center + sideRightAvg * centerSide.side;
  if (!Number.isFinite(left)) left = 0;
  if (!Number.isFinite(right)) right = 0;

  const widened = nodeGraphHypersawStereoWidth(monoStereo, left, right);

  const outLeft = clampNodeSliderValue(widened.l, -1.5, 1.5) * level;
  const outRight = clampNodeSliderValue(widened.r, -1.5, 1.5) * level;
  return { Left: outLeft, Right: outRight, voicePhases };
}
