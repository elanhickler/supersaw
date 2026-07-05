// soemdsp-native-module: hypersaw
// soemdsp-native-label: Hypersaw
// soemdsp-native-target: hypersaw
// soemdsp-native-kind: oscillator

// Hypersaw -- a bank of up to kMaxVoices bandlimited (PolyBLEP) oscillator
// voices, each spread across the 0..1 phase cycle. A faithful port of
// soundemote's own HypersawUnit/HypersawMaster dispersion + mix circuit,
// cross-checked against three real sources:
//   docs/reference/Hypersaw.hpp (the sandbox's original reference)
//   C:\Users\argit\Documents\_PROGRAMMING\soemdsp\include\soemdsp\... :
//     Wire.hpp, SampleRate.hpp, random/FlexibleRandomWalk.hpp,
//     filter/OnePoleFilter.hpp, random/NoiseGenerator.hpp,
//     utility/curve_functions.hpp, oscillator/PolyBLEP.hpp, semath.cpp
//   ...\oldcode\old stuff Prototypes\SoEmHypersaw\SoEmHypersaw.cpp (the
//     actual shipped VST wrapping HypersawMaster -- its ParameterIdx enum
//     and per-voice wiring block is the definitive list of what's a real,
//     final "Hypersaw" parameter vs. a polyphony/envelope/portamento
//     detail specific to that plugin's voice manager).
//
// Dispersion (per voice i of numOscillators), unchanged from the previous
// revision -- see git history for the full derivation:
//   div        = i / numOscillators
//   vibratoOut = vibInputForVoice * vibAmp + vibOffset   (vibInput only for voice i >= 1)
//   walkOut    = driftAmp > 0 ? drift * driftAmp : 0
//   dispersion = div*distributePhaseAmp + div*vibratoOut + randomOffset*randomPhaseAmp + walkOut
//   numOscillators is fluid/fractional: voice i's gain is
//     clamp(numOscillators - i, 0, 1), not an on/off switch.
//
// This revision adds the remaining core parameters the shipped VST
// exposes for the dispersion/mix circuit itself (explicitly skipping
// polyphony, envelope, portamento, velocity, tape emulation, and pitch-
// wheel handling -- those are that plugin's voice-manager concerns, not
// Hypersaw's own circuit):
//
// - waveform / morph: osc_.waveform_ / osc_.morph_ are wired GLOBALLY
//   (every voice slaves to voice 0's) in SoEmHypersaw.cpp, so one
//   waveform/morph pair applies to the whole bank. Transcribed from
//   PolyBLEP.hpp's get() cases -- Sin, Square, Tri, Saw (default,
//   matches prior behavior), Ramp, SawSquare (the one shape here that
//   uses morph; Tri/Saw/Ramp/Square/Sin don't take a morph argument in
//   the original either).
// - driftStyle: drift_.method_ is wired globally too
//   (`o.drift_.method_.pointTo(&synth->pars_[ParameterIdx::DriftStyle].integer_)`).
//   FlexibleRandomWalk::run() has 4 branches; the VST's own UI only
//   exposes 3 (its toString_ never returns "White Noise"), so only
//   those 3 are ported: Filtered Noise (lpf of raw white noise, no
//   accumulator), Random Steps (accumulator step size = n*stepSize,
//   proportional to the noise sample), Fixed Steps (accumulator step
//   size = sign(n)*stepSize -- the only mode this port had until now,
//   kept as the default so existing patches don't change).
// - centerSideCrossfade: HypersawMaster::centerSideCrossfade_,
//   getCenterSideAmplitudeValue() transcribed exactly (center = min(2 -
//   2*value, 1), side = min(2*value, 1)). Center voices (i==0, and i==1
//   if numOscillators is even) get ampForCenter; the rest get
//   ampForSides. Averaged group-by-group (center vs. left-side vs.
//   right-side) rather than summed, to preserve this port's existing
//   loudness-normalizing convention (matching RobinSupersaw) instead of
//   the original's raw sum, whose loudness scales with voice count.
// - monoStereo: applied last, via soemdsp/semath.cpp's real stereoWidth()
//   (widthInv*mid + width*channel per side) -- SoEmHypersaw's own
//   process32() calls this exact function on the final mixed pair.

namespace {

constexpr int kMaxInstances = 8;
constexpr int kMaxVoices = 64;  // matches HypersawMaster::numOscillatorsMax_
constexpr double kPi = 3.14159265358979323846;

double clampD(double value, double lo, double hi) {
  return value < lo ? lo : (value > hi ? hi : value);
}

double wrap01(double x) {
  double w = x - __builtin_floor(x);
  return w < 0.0 ? 0.0 : (w >= 1.0 ? 0.0 : w);
}

// xorshift32 -- freestanding WASM has no <random>.
unsigned int xorshift32(unsigned int& state) {
  unsigned int x = state;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  state = x;
  return x;
}

// Returns a pseudo-random value in [-1, 1) -- matches NoiseGenerator's
// runBipolar()/run(-1,1) range exactly.
double randomBipolarUnit(unsigned int& state) {
  return static_cast<double>(xorshift32(state) >> 8) * (2.0 / 16777216.0) - 1.0;
}

// exp(x) via Taylor series -- freestanding WASM has no libm exp(). Only
// ever called here with x = -2*pi*driftFrequency/sampleRate, always in a
// modest negative range for musically sane drift rates.
double expApprox(double x) {
  // Range-reduce: exp(x) = exp(x/8)^8, keeps the Taylor series accurate
  // over a wider domain than a direct series would allow.
  double y = x * 0.125;
  double e = 1.0 + y * (1.0 + y * (0.5 + y * (1.0 / 6.0 + y * (1.0 / 24.0 + y * (1.0 / 120.0)))));
  e = e * e; e = e * e; e = e * e;
  return e;
}

// curve::Rational{skew}.get(t), t already normalized 0..1 (min=0, max=1
// in every call site here) -- transcribed exactly from
// utility/curve_functions.hpp's Rational::get().
double rationalCurve(double skew, double t) {
  return ((1.0 + skew) * t) / (1.0 - skew + 2.0 * skew * t);
}

// Standard PolyBLEP correction term for a naive waveform's discontinuity
// -- algebraically identical to PolyBLEP.hpp's private blep() (just
// rearranged): blep(t,dt) = -(t/dt-1)^2 for t<dt, ((t-1)/dt+1)^2 for t>1-dt.
double polyBlep(double t, double dt) {
  if (dt <= 0.0) return 0.0;
  if (t < dt) {
    double x = t / dt;
    return x + x - x * x - 1.0;
  }
  if (t > 1.0 - dt) {
    double x = (t - 1.0) / dt;
    return x * x + x + x + 1.0;
  }
  return 0.0;
}

// PolyBLAMP correction term for a naive waveform's slope discontinuity
// (used by Tri) -- transcribed from PolyBLEP.hpp's private blamp().
double polyBlamp(double t, double dt) {
  if (dt <= 0.0) return 0.0;
  if (t < dt) {
    double x = t / dt - 1.0;
    return -(1.0 / 3.0) * x * x * x;
  }
  if (t > 1.0 - dt) {
    double x = (t - 1.0) / dt + 1.0;
    return (1.0 / 3.0) * x * x * x;
  }
  return 0.0;
}

// Cheap, smooth, periodic parabolic approximation of sin(2*pi*phase01) --
// used both for the Sin waveform and the vibrato LFO (freestanding WASM
// has no libm sin()).
double fastSine01(double phase01) {
  double x = wrap01(phase01) - 0.5;  // -0.5..0.5
  return 8.0 * x * (0.5 - (x < 0.0 ? -x : x));
}

// PolyBLEP.hpp::get()'s cases, transcribed exactly for the shapes
// SoEmHypersaw exposes via its global Waveform parameter: 0=Sin,
// 1=Square, 2=Tri, 3=Saw (this port's prior/default behavior), 4=Ramp,
// 5=SawSquare (the only one of these that uses morph, matching the
// original -- Sin/Square/Tri/Saw/Ramp don't take a morph argument
// either).
double waveformSample(int waveform, double t, double dt, double morph) {
  switch (waveform) {
    case 0:  // Sin
      return fastSine01(t);
    case 1: {  // Square
      double t1 = wrap01(t + 0.5);
      double y = t < 0.5 ? 1.0 : -1.0;
      y += polyBlep(t, dt) - polyBlep(t1, dt);
      return y;
    }
    case 2: {  // Tri
      double t1 = wrap01(t + 0.25);
      double t2 = wrap01(t + 0.75);
      double y = t * 4.0;
      if (y >= 3.0) y -= 4.0;
      else if (y > 1.0) y = 2.0 - y;
      y += 4.0 * dt * (polyBlamp(t1, dt) - polyBlamp(t2, dt));
      return y;
    }
    case 4: {  // Ramp
      double t1 = wrap01(t + 0.5);
      double y = t1 * 2.0 - 1.0;
      y -= polyBlep(t1, dt);
      return y;
    }
    case 5: {  // SawSquare (morph blends saw <-> pulse-like double-step)
      double y = 1.0 - 2.0 * t;
      y += (t < 0.5) ? morph : -morph;
      y += polyBlep(t, dt);
      double tMid = wrap01(t - 0.5);
      y += (-morph) * polyBlep(tMid, dt);
      return y;
    }
    case 3:  // Saw
    default:
      return 1.0 - 2.0 * t + polyBlep(t, dt);
  }
}

struct HypersawVoiceState {
  double phase;          // main running accumulator, 0..1 (osc_'s own phase)
  double randomOffset;   // randomPhaseOffset_: fixed per-voice random value, set at seed/reset
  double driftOut;       // drift_'s out_: the raw, hard-clamped random-walk accumulator (unused by driftStyle=0)
  double driftFilterState;  // drift_'s lpf_ output state (buf_[1])
  unsigned int rngState;
};

struct HypersawState {
  bool active;
  HypersawVoiceState voices[kMaxVoices];
  double vibPhase;  // vibOsc_'s shared running phase accumulator, 0..1
  double outLeft;
  double outRight;
};

static HypersawState gPool[kMaxInstances];

void resetVoice(HypersawVoiceState& voice) {
  voice.phase = 0.0;
  voice.randomOffset = randomBipolarUnit(voice.rngState);
  voice.driftOut = 0.0;
  voice.driftFilterState = 0.0;
}

void seedVoice(HypersawVoiceState& voice, int instanceIndex, int voiceIndex) {
  voice.rngState = static_cast<unsigned int>(
    2166136261u + (instanceIndex + 1) * 16777619u + (voiceIndex + 1) * 2654435761u
  );
  resetVoice(voice);
}

// HypersawMaster::getCenterSideAmplitudeValue(), transcribed exactly.
void centerSideAmplitude(double value, double* center, double* side) {
  double c = 2.0 - value * 2.0;
  double s = value * 2.0;
  *center = c < 1.0 ? c : 1.0;
  *side = s < 1.0 ? s : 1.0;
}

// semath.cpp's real stereoWidth(), transcribed exactly.
void stereoWidth(double width, double* l, double* r) {
  double widthInv = 1.0 - width;
  double m = (*l + *r) * 0.5;
  *l = widthInv * m + width * (*l);
  *r = widthInv * m + width * (*r);
}

}  // namespace

extern "C" int soemdsp_hypersaw_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i] = HypersawState{};
      gPool[i].active = true;
      for (int v = 0; v < kMaxVoices; v++) {
        seedVoice(gPool[i].voices[v], i, v);
      }
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_hypersaw_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

// Note-trigger reset -- matches HypersawMaster::oscReset(): redraws each
// voice's randomPhaseOffset_ (randomizePhase()), zeroes phase and drift_
// (out_=0, lpf_ reset), and resets the shared vibOsc_ phase.
extern "C" void soemdsp_hypersaw_reset(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  HypersawState& s = gPool[handle - 1];
  for (int v = 0; v < kMaxVoices; v++) {
    resetVoice(s.voices[v]);
  }
  s.vibPhase = 0.0;
}

// frequencyHz: the shared fundamental for every voice.
// phaseOffset: global phase control (0..1), added to every voice alike
//   (this port's own addition, matching every other oscillator module in
//   this sandbox -- not part of Hypersaw.hpp).
// numOscillators: 1..kMaxVoices, fractional (numOscillators_) -- voice i's
//   gain is clamp(numOscillators - i, 0, 1).
// distributePhaseAmp / randomPhaseAmp / driftAmp / driftFrequency /
//   driftJitter / vibAmp / vibOffset / vibRate: see file header and prior
//   revisions -- unchanged dispersion circuit.
// waveform: 0=Sin, 1=Square, 2=Tri, 3=Saw, 4=Ramp, 5=SawSquare
//   (osc_.waveform_, wired globally to all voices in the original).
// morph: 0..1, only affects SawSquare (osc_.morph_, also global).
// driftStyle: 0=Filtered Noise, 1=Random Steps, 2=Fixed Steps
//   (drift_.method_, also global).
// centerSideCrossfade: 0..1, default 0.5 (centerSideCrossfade_).
// monoStereo: 0..1, default 1 = full stereo, 0 = mono (MonoStereo).
// level: output gain.
extern "C" void soemdsp_hypersaw_sample(
  int handle,
  double frequencyHz,
  double sampleRate,
  double phaseOffset,
  double numOscillators,
  double distributePhaseAmp,
  double randomPhaseAmp,
  double driftAmp,
  double driftFrequency,
  double driftJitter,
  double vibAmp,
  double vibOffset,
  double vibRate,
  int waveform,
  double morph,
  int driftStyle,
  double centerSideCrossfade,
  double monoStereo,
  double level
) {
  if (handle < 1 || handle > kMaxInstances) return;
  HypersawState& s = gPool[handle - 1];

  const double safeSampleRate = sampleRate > 1.0 ? sampleRate : 48000.0;
  const double safeFrequency = frequencyHz > 0.0 ? frequencyHz : 0.0;
  const double voiceCountFloat = clampD(numOscillators, 1.0, static_cast<double>(kMaxVoices));
  const int voiceLoopCount = static_cast<int>(__builtin_ceil(voiceCountFloat));
  const double distributeAmt = clampD(distributePhaseAmp, 0.0, 1.0);
  const double randomAmt = clampD(randomPhaseAmp, 0.0, 1.0);
  const double driftAmt = clampD(driftAmp, 0.0, 1.0);
  const double safeDriftFrequency = driftFrequency > 0.0 ? driftFrequency : 0.0;
  const double safeDriftJitter = driftJitter > 0.0 ? driftJitter : 0.0;
  const double vibAmt = clampD(vibAmp, 0.0, 2.0);
  const double vibOffsetAmt = vibOffset;
  const double phaseIncrement = safeFrequency / safeSampleRate;
  const double morphAmt = clampD(morph, 0.0, 1.0);
  const int safeDriftStyle = driftStyle < 0 ? 0 : (driftStyle > 2 ? 2 : driftStyle);

  double ampForCenter = 1.0, ampForSides = 1.0;
  centerSideAmplitude(clampD(centerSideCrossfade, 0.0, 1.0), &ampForCenter, &ampForSides);

  // drift_ coefficients -- shared across every voice (HypersawMaster
  // slaves every voice's drift_ to voice 0's), transcribed exactly from
  // FlexibleRandomWalk.hpp. Only computed when driftAmt > 0, matching
  // drift_.run() only ever being called under that same guard.
  double driftStepSize = 0.0, driftRandomMix = 0.0, driftWhiteNoiseMix = 0.0;
  double driftA1 = 0.0, driftB0 = 0.0;
  if (driftAmt > 0.0) {
    const double jitterInc = safeDriftJitter / safeSampleRate;
    driftStepSize = rationalCurve(0.99, jitterInc);
    const double increment = safeDriftFrequency / safeSampleRate;
    const double freqAndJitterAvg = (jitterInc + increment) * 0.5;
    if (freqAndJitterAvg >= 0.9) {
      const double normalized = (freqAndJitterAvg - 0.9) / 0.1;
      driftWhiteNoiseMix = rationalCurve(-0.7, normalized);
    }
    driftRandomMix = 1.0 - driftWhiteNoiseMix;
    driftA1 = expApprox(-2.0 * kPi * safeDriftFrequency / safeSampleRate);
    driftB0 = 1.0 - driftA1;
  }

  // vibOsc_ -- one shared oscillator per Hypersaw instance (not per
  // voice), matching `vibOsc_.phaseOffset_ = 0.5` at construction (a
  // fixed half-cycle offset baked into the render below).
  s.vibPhase = wrap01(s.vibPhase + vibRate / safeSampleRate);
  const double vibSample = fastSine01(s.vibPhase + 0.5);

  const bool voiceCountIsEven = (static_cast<int>(voiceCountFloat + 0.5) % 2) == 0;

  double centerSum = 0.0, centerGainSum = 0.0;
  double sideLeftSum = 0.0, sideLeftGainSum = 0.0;
  double sideRightSum = 0.0, sideRightGainSum = 0.0;

  for (int i = 0; i < voiceLoopCount; i++) {
    HypersawVoiceState& voice = s.voices[i];

    const double gain = clampD(voiceCountFloat - static_cast<double>(i), 0.0, 1.0);
    const double div = static_cast<double>(i) / voiceCountFloat;

    double walkOut = 0.0;
    if (driftAmt > 0.0) {
      const double n = randomBipolarUnit(voice.rngState);
      if (safeDriftStyle == 0) {
        // Filtered Noise: lpf of raw white noise, no accumulator at all.
        voice.driftFilterState = driftB0 * n + driftA1 * voice.driftFilterState;
      } else {
        // Random Steps: step size proportional to n. Fixed Steps: step
        // size is a constant magnitude, direction = sign(n).
        const double r = (safeDriftStyle == 1) ? (n * driftStepSize) : (n > 0.0 ? driftStepSize : -driftStepSize);
        voice.driftOut = clampD(voice.driftOut + r, -1.0, 1.0);
        const double raw = voice.driftOut * driftRandomMix + n * driftWhiteNoiseMix;
        voice.driftFilterState = driftB0 * raw + driftA1 * voice.driftFilterState;
      }
      walkOut = voice.driftFilterState * driftAmt;
    }

    // vibInput_ only ever points at vibOsc_ for i >= 1 (see file header).
    const double vibInputForVoice = (i == 0) ? 0.0 : vibSample;
    const double vibratoOut = vibInputForVoice * vibAmt + vibOffsetAmt;

    const double dispersion = div * distributeAmt + div * vibratoOut + voice.randomOffset * randomAmt + walkOut;

    const double renderPhase = wrap01(voice.phase + phaseOffset + dispersion);
    const double sample = waveformSample(waveform, renderPhase, phaseIncrement > 0.0 ? phaseIncrement : 1.0, morphAmt) * gain;

    voice.phase = wrap01(voice.phase + phaseIncrement);

    const bool isCenter = (i == 0) || (i == 1 && voiceCountIsEven);
    if (isCenter) {
      centerSum += sample;
      centerGainSum += gain;
    } else if ((i % 2) == 0) {
      sideLeftSum += sample;
      sideLeftGainSum += gain;
    } else {
      sideRightSum += sample;
      sideRightGainSum += gain;
    }
  }

  const double centerAvg = centerGainSum > 0.0001 ? centerSum / centerGainSum : 0.0;
  const double sideLeftAvg = sideLeftGainSum > 0.0001 ? sideLeftSum / sideLeftGainSum : 0.0;
  const double sideRightAvg = sideRightGainSum > 0.0001 ? sideRightSum / sideRightGainSum : 0.0;

  double left = centerAvg * ampForCenter + sideLeftAvg * ampForSides;
  double right = centerAvg * ampForCenter + sideRightAvg * ampForSides;

  if (!(left * 0.0 == 0.0)) left = 0.0;
  if (!(right * 0.0 == 0.0)) right = 0.0;

  stereoWidth(clampD(monoStereo, 0.0, 1.0), &left, &right);

  s.outLeft = clampD(left, -1.5, 1.5) * level;
  s.outRight = clampD(right, -1.5, 1.5) * level;
}

extern "C" double soemdsp_hypersaw_left(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outLeft;
}

extern "C" double soemdsp_hypersaw_right(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outRight;
}

extern "C" int soemdsp_hypersaw_max_voices() {
  return kMaxVoices;
}

extern "C" int soemdsp_hypersaw_version() {
  return 7;
}
