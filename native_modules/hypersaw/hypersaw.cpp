// soemdsp-native-module: hypersaw
// soemdsp-native-label: Hypersaw
// soemdsp-native-target: hypersaw
// soemdsp-native-kind: oscillator

// Hypersaw -- a bank of up to kMaxVoices bandlimited (PolyBLEP) sawtooth
// oscillators, each voice spread across the 0..1 phase cycle. A faithful
// port of soundemote's own HypersawUnit::run() dispersion formula (see
// docs/reference/Hypersaw.hpp), cross-checked against the real
// soemdsp library headers it depends on (found at
// C:\Users\argit\Documents\_PROGRAMMING\soemdsp\include\soemdsp\...):
// Wire.hpp, SampleRate.hpp, random/FlexibleRandomWalk.hpp,
// filter/OnePoleFilter.hpp, random/NoiseGenerator.hpp,
// utility/curve_functions.hpp, oscillator/PolyBLEP.hpp.
//
//   HypersawUnit::run(), which has THREE variants stacked as comments --
//   the file preserves an evolution of the formula, not just one line:
//
//     // vibratoOut_      = vibInput_ * vibAmp_ + vibOffset_;
//     // double phase     = (div_ * distributePhaseAmp_) + (div_ * vibratoOut_) + (randomPhaseOffset_ *
//     // randomPhaseAmp_); osc_.phaseOffset__ = phase + walkOut_;
//
//     double phase      = (div_ * distributePhaseAmp_) + (div_ * vibratoOut_) + (randomPhaseOffset_ * randomPhaseAmp_);
//     osc_.phaseOffset_ = phase * ((vibInput_ * vibAmp_) + vibOffset_) + walkOut_;
//
//   The ACTIVE (uncommented) last line multiplies the whole static
//   dispersion by (vibInput*vibAmp + vibOffset) -- which, with vibOffset
//   at its Wire default of 0, silences distributePhaseAmp_/
//   randomPhaseAmp_ entirely regardless of their own values. The two
//   commented lines above show the walk getting there: originally
//   `phase + walkOut_` (fully additive, every term independent), then an
//   in-between step assigning `vibratoOut_` before folding it into
//   `phase` too (`div_ * vibratoOut_`, still additive) -- only the LAST
//   edit swapped `+` for `*`. This port uses the additive form (matching
//   the first two variants): each dispersion source is independently
//   controllable on its own, which is also the only way
//   distributePhaseAmp/randomPhaseAmp work as plain, unconditional
//   "phase position" controls rather than being gated by an unrelated
//   vibrato setting.
//
// Transcribed here as (per voice i of numOscillators):
//   div                = i / numOscillators
//   randomPhaseOffset  = a fixed per-voice random value in [-1, 1] (matches
//                        randomizePhase(): `bipolarNoiseGen_.runBipolar()`,
//                        confirmed uniform on [-1,1] in NoiseGenerator.hpp)
//   vibratoOut         = vibInputForVoice * vibAmp + vibOffset
//   walkOut            = driftAmp > 0 ? drift * driftAmp : 0
//   dispersion         = div * distributePhaseAmp + div * vibratoOut
//                       + randomPhaseOffset * randomPhaseAmp + walkOut
//
// Notes on fidelity:
// - `vibInput_` points at a single shared HypersawMaster::vibOsc_ for
//   every voice from index 1 upward -- voice 0 never receives it.
// - `vibOsc_` (a shared PolyBLEP oscillator) has no exposed rate control
//   in Hypersaw.hpp itself -- `vibRate` here is this port's own addition
//   to make the vibrato musically usable; every other name below matches
//   the original exactly.
//
// drift_ (FlexibleRandomWalk, Method::fixed_steps) -- transcribed exactly
// from FlexibleRandomWalk.hpp's run()/updateIncrement()/
// whiteNoiseMixChanged(), one HypersawUnit per voice but with driftAmp/
// driftFrequency/driftJitter-derived coefficients SHARED across all
// voices (HypersawMaster::slave()s every voice's drift_ to voice 0's,
// pointing stepSize_/randomMix_/whiteNoiseMix_/the filter's coefficients
// all at voice 0 -- only each voice's own random draws and per-voice
// walk/filter *state* stay independent, which is what decorrelates them):
//   jitterInc  = driftJitter / sampleRate
//   stepSize   = rational(0.99, jitterInc)          -- see rational() below;
//                algebraically, updateIncrement()'s "stepSize_ = increment_;
//                stepSize_.w += map0to1(rational(0.99, jitterInc), -stepSize_,
//                1-stepSize_)" simplifies to exactly this (the increment_
//                term cancels out completely)
//   increment  = driftFrequency / sampleRate
//   avg        = (jitterInc + increment) * 0.5
//   whiteNoiseMix = avg >= 0.9 ? rational(-0.7, (avg-0.9)/0.1) : 0
//   randomMix  = 1 - whiteNoiseMix
//   lpf a1     = exp(-2*pi*driftFrequency/sampleRate), b0 = 1 - a1
// Per voice, per sample (only while driftAmp > 0 -- drift_.run() is only
// ever called under that same guard in the original):
//   n   = uniform(-1, 1)
//   r   = n > 0 ? stepSize : -stepSize
//   out = clamp(out + r, -1, 1)                      -- NOT reflected, hard clamped
//   filterState = b0*(out*randomMix + n*whiteNoiseMix) + a1*filterState
//   drift = filterState
//
// Earlier revisions of this file guessed a "lowpass a fresh random value
// every sample" or "sample-and-hold with jitter timing" model for drift_
// without having these headers -- neither matches the above, which is
// why drift didn't behave like the real Hypersaw. This revision is a
// direct transcription, not a guess.
//
// PolyBLEP::saw() (the real waveform osc_ renders, Shape::Saw) is
// `1 - 2*t + blep(t, dt)` -- a *descending* ramp. This port's sawtooth
// generation was previously the polarity-inverted `2*t - 1 - blep(t, dt)`;
// fixed to match exactly (audibly identical alone, but now phase-correct
// when summed/compared against other modules).
//
// Output is stereo: voice 0 (and voice 1, if numOscillators is even) are
// "center" voices summed into both channels, matching HypersawMaster::
// run()'s center/side split; the rest alternate Left/Right. Each channel
// is averaged (not summed) by its own contributor count -- same
// loudness-normalizing convention as this sandbox's RobinSupersaw module
// -- so voice count doesn't change overall loudness. (HypersawMaster's
// own centerSideCrossfade_/velocity_/portamento system is out of scope
// here -- this port covers the phase-dispersion circuit only.)
//
// numOscillators is a genuinely fluid (fractional) value here, not
// rounded to an integer: voice i's gain is clamp(numOscillators - i, 0,
// 1), so with numOscillators = 4.7, voices 0-3 sit at full gain and
// voice 4 (the "next" one) sits at 0.7 -- a direct function of the
// slider's current position, not a time-based ramp. `div` (i /
// numOscillators) likewise uses the raw fractional value, so it varies
// continuously as numOscillators moves rather than snapping between
// integers. This eliminates the click at its source instead of masking
// it with a smoother: a small change in numOscillators only ever
// produces a small change in one voice's gain and everyone's div,
// because the function producing them is itself continuous.

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

// Standard PolyBLEP correction term for a naive sawtooth's discontinuity
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

// Cheap, smooth, periodic parabolic approximation of sin(2*pi*phase01) --
// good enough for a sub-audio vibrato LFO (vibOsc_'s own waveform isn't
// specified in Hypersaw.hpp, so exact spectral fidelity isn't the point).
double fastSine01(double phase01) {
  double x = wrap01(phase01) - 0.5;  // -0.5..0.5
  return 8.0 * x * (0.5 - (x < 0.0 ? -x : x));
}

struct HypersawVoiceState {
  double phase;          // main running accumulator, 0..1 (osc_'s own phase)
  double randomOffset;   // randomPhaseOffset_: fixed per-voice random value, set at seed/reset
  double driftOut;       // drift_'s out_: the raw, hard-clamped random-walk accumulator
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
//   gain is clamp(numOscillators - i, 0, 1), so the "next" voice fades in
//   smoothly as this value crosses its index instead of switching on/off.
// distributePhaseAmp: 0..1, scales each voice's fixed even phase position
//   (div_ = i/numOscillators) (distributePhaseAmp_).
// randomPhaseAmp: 0..1, scales each voice's fixed random phase offset
//   (randomPhaseAmp_).
// driftAmp: 0..1, scales each voice's random-walk phase offset (driftAmp_).
// driftFrequency: Hz -- drift_'s output lowpass cutoff (frequency_), also
//   factors into the high-rate white-noise crossfade (see file header).
// driftJitter: Hz -- drives drift_'s fixed-step magnitude (jitter_), also
//   factors into the same white-noise crossfade.
// vibAmp: 0..2, how much the shared vibrato oscillator contributes to
//   dispersion, scaled by div like distributePhaseAmp (vibAmp_).
// vibOffset: a constant phase offset added alongside vibAmp*vibInput,
//   also scaled by div (vibOffset_) -- an independent, always-additive
//   term, not a gate on the other dispersion sources.
// vibRate: Hz, the shared vibrato oscillator's rate (this port's own
//   addition -- see file header comment).
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
  double level
) {
  if (handle < 1 || handle > kMaxInstances) return;
  HypersawState& s = gPool[handle - 1];

  const double safeSampleRate = sampleRate > 1.0 ? sampleRate : 48000.0;
  const double safeFrequency = frequencyHz > 0.0 ? frequencyHz : 0.0;
  const double voiceCountFloat = clampD(numOscillators, 1.0, static_cast<double>(kMaxVoices));
  // Voice i's gain is clamp(voiceCountFloat - i, 0, 1) -- floor(voiceCountFloat)
  // voices at full gain, one voice fading in/out at the fractional edge.
  // Loop up to ceil(voiceCountFloat) to include that fading voice.
  const int voiceLoopCount = static_cast<int>(__builtin_ceil(voiceCountFloat));
  const double distributeAmt = clampD(distributePhaseAmp, 0.0, 1.0);
  const double randomAmt = clampD(randomPhaseAmp, 0.0, 1.0);
  const double driftAmt = clampD(driftAmp, 0.0, 1.0);
  const double safeDriftFrequency = driftFrequency > 0.0 ? driftFrequency : 0.0;
  const double safeDriftJitter = driftJitter > 0.0 ? driftJitter : 0.0;
  const double vibAmt = clampD(vibAmp, 0.0, 2.0);
  const double vibOffsetAmt = vibOffset;
  const double phaseIncrement = safeFrequency / safeSampleRate;

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

  // Center/side routing parity uses the rounded voice count -- this only
  // ever affects which channel the partially-faded edge voice routes to,
  // a cosmetic detail next to the gain fade itself.
  const bool voiceCountIsEven = (static_cast<int>(voiceCountFloat + 0.5) % 2) == 0;

  double leftSum = 0.0, rightSum = 0.0;
  double leftGainSum = 0.0, rightGainSum = 0.0;

  for (int i = 0; i < voiceLoopCount; i++) {
    HypersawVoiceState& voice = s.voices[i];

    const double gain = clampD(voiceCountFloat - static_cast<double>(i), 0.0, 1.0);
    const double div = static_cast<double>(i) / voiceCountFloat;

    double walkOut = 0.0;
    if (driftAmt > 0.0) {
      const double n = randomBipolarUnit(voice.rngState);
      const double r = n > 0.0 ? driftStepSize : -driftStepSize;
      voice.driftOut = clampD(voice.driftOut + r, -1.0, 1.0);
      const double raw = voice.driftOut * driftRandomMix + n * driftWhiteNoiseMix;
      voice.driftFilterState = driftB0 * raw + driftA1 * voice.driftFilterState;
      walkOut = voice.driftFilterState * driftAmt;
    }

    // vibInput_ only ever points at vibOsc_ for i >= 1 (see file header).
    const double vibInputForVoice = (i == 0) ? 0.0 : vibSample;
    const double vibratoOut = vibInputForVoice * vibAmt + vibOffsetAmt;

    const double dispersion = div * distributeAmt + div * vibratoOut + voice.randomOffset * randomAmt + walkOut;

    const double renderPhase = wrap01(voice.phase + phaseOffset + dispersion);
    // PolyBLEP::saw(): 1 - 2*t + blep(t, dt) -- a descending ramp.
    const double sawSample = (1.0 - 2.0 * renderPhase + polyBlep(renderPhase, phaseIncrement > 0.0 ? phaseIncrement : 1.0)) * gain;

    voice.phase = wrap01(voice.phase + phaseIncrement);

    const bool isCenter = (i == 0) || (i == 1 && voiceCountIsEven);
    if (isCenter) {
      leftSum += sawSample;
      rightSum += sawSample;
      leftGainSum += gain;
      rightGainSum += gain;
    } else if ((i % 2) == 0) {
      leftSum += sawSample;
      leftGainSum += gain;
    } else {
      rightSum += sawSample;
      rightGainSum += gain;
    }
  }

  double left = leftGainSum > 0.0001 ? leftSum / leftGainSum : 0.0;
  double right = rightGainSum > 0.0001 ? rightSum / rightGainSum : 0.0;

  if (!(left * 0.0 == 0.0)) left = 0.0;
  if (!(right * 0.0 == 0.0)) right = 0.0;

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
  return 6;
}
