// soemdsp-native-module: hypersaw
// soemdsp-native-label: Hypersaw
// soemdsp-native-target: hypersaw
// soemdsp-native-kind: oscillator

// Hypersaw -- a bank of up to kMaxVoices bandlimited (PolyBLEP) sawtooth
// oscillators, each voice spread across the 0..1 phase cycle. A faithful
// port of soundemote's own HypersawUnit::run() dispersion formula (see
// docs/reference/Hypersaw.hpp) -- every parameter here is named after,
// and behaves like, the corresponding member in that header:
//
//   HypersawUnit::run():
//     double phase = (div_ * distributePhaseAmp_)
//                  + (div_ * vibratoOut_)                 // always 0 -- see below
//                  + (randomPhaseOffset_ * randomPhaseAmp_);
//     osc_.phaseOffset_ = phase * ((vibInput_ * vibAmp_) + vibOffset_) + walkOut_;
//     walkOut_ = driftAmp_ > 0 ? drift_.run() * driftAmp_ : 0;
//
// Transcribed here as (per voice i of numOscillators):
//   div                = i / numOscillators                    (fixed per-voice position)
//   randomPhaseOffset  = a fixed per-voice random value in [-0.5, 0.5],
//                        drawn at creation and re-drawn on reset (matches
//                        HypersawUnit::randomizePhase(), called from
//                        HypersawMaster::oscResetRanged() on note trigger)
//   staticDispersion   = div * distributePhaseAmp + randomPhaseOffset * randomPhaseAmp
//   vibratoMultiplier  = vibInput * vibAmp + vibOffset
//   walkOut            = driftAmp > 0 ? drift * driftAmp : 0
//   dispersion         = staticDispersion * vibratoMultiplier + walkOut
//
// Notes on fidelity:
// - `vibratoOut_` in the original is computed by a line that is commented
//   out in HypersawUnit::run() (`// vibratoOut_ = vibInput_ * vibAmp_ +
//   vibOffset_;`), so it is always 0 in the real, running behavior of the
//   original -- omitted here to match that actual (not intended) behavior.
// - `vibInput_` points at a single shared HypersawMaster::vibOsc_ for
//   every voice from index 1 upward (`for (int i = 1; i < oscArray_.size();
//   ++i) oscArray_[i].vibInput_.pointTo(&vibOsc_.out_);`) -- voice 0 never
//   receives it, matching `vibInputForVoice` below.
// - `vibOsc_` itself (a shared PolyBLEP oscillator, `phaseOffset_ = 0.5`
//   at construction) has no exposed rate control in Hypersaw.hpp -- its
//   frequency is presumably wired up elsewhere in soundemote's larger
//   codebase. `vibRate` here is this port's own addition to make the
//   vibrato musically usable; every other parameter name below matches
//   the original exactly.
// - `drift_` is a `modulator::FlexibleRandomWalk` set to
//   `Method::fixed_steps` at construction, with `driftFrequency_`/
//   `driftJitterChanged()` controlling its rate and timing jitter.
//   FlexibleRandomWalk.hpp isn't available in this repo, so its exact
//   internals are approximated here as: fixed-magnitude, random-sign
//   steps (matching "fixed_steps"), taken at an average rate of
//   driftFrequency Hz, with driftJitter randomizing the interval between
//   steps (0 = perfectly regular, 1 = highly irregular timing).
// - `numOscillators` matches `HypersawMaster::numOscillators_`
//   (`numOscillatorsMax_` = 64, matched by kMaxVoices below).
//
// Output is stereo: voice 0 (and voice 1, if numOscillators is even) are
// "center" voices summed into both channels, matching HypersawMaster::
// run()'s center/side split; the rest alternate Left/Right. Each channel
// is averaged (not summed) by its own contributor count -- same
// loudness-normalizing convention as this sandbox's RobinSupersaw module
// -- so voice count doesn't change overall loudness. (HypersawMaster's
// own centerSideCrossfade_/velocity_/envelope/portamento system is out
// of scope here -- this port covers the phase-dispersion circuit only.)

namespace {

constexpr int kMaxInstances = 8;
constexpr int kMaxVoices = 64;  // matches HypersawMaster::numOscillatorsMax_

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

// Returns a pseudo-random value in [-0.5, 0.5).
double randomBipolarUnit(unsigned int& state) {
  return static_cast<double>(xorshift32(state) >> 8) * (1.0 / 16777216.0) - 0.5;
}

// Standard PolyBLEP correction term for a naive sawtooth's discontinuity.
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
  double phase;           // main running accumulator, 0..1 (osc_'s own phase)
  double randomOffset;    // randomPhaseOffset_: fixed per-voice random value, set at seed/reset
  double driftLp;         // drift_'s current value (the walk's running position)
  double driftStepTimer;  // samples remaining until drift_'s next fixed-size step
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

// The original's FlexibleRandomWalk "fixed_steps" method takes constant-
// magnitude steps; this is that fixed magnitude (an implementation
// constant, since the original's own default isn't available).
constexpr double kDriftFixedStepSize = 0.12;

void resetVoice(HypersawVoiceState& voice) {
  voice.phase = 0.0;
  voice.randomOffset = randomBipolarUnit(voice.rngState);
  voice.driftLp = 0.0;
  voice.driftStepTimer = 0.0;
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

// Note-trigger reset -- matches HypersawMaster::oscResetRanged() (called
// from oscReset()): resets each voice's phase, redraws randomPhaseOffset_
// (randomizePhase()), and zeroes drift_'s state, plus resets the shared
// vibOsc_ phase.
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
// numOscillators: 1..kMaxVoices sawtooths in the bank (numOscillators_).
// distributePhaseAmp: 0..1, scales each voice's fixed even phase position
//   (div_ = i/numOscillators) (distributePhaseAmp_).
// randomPhaseAmp: 0..1, scales each voice's fixed random phase offset
//   (randomPhaseAmp_).
// driftAmp: 0..1, scales each voice's random-walk phase offset (driftAmp_).
// driftFrequency: Hz, the average rate at which drift_ takes a new fixed-
//   size step (driftFrequency_).
// driftJitter: 0..1, randomizes the interval between drift steps
//   (driftJitterChanged()'s underlying value).
// vibAmp: 0..1, how much the shared vibrato oscillator scales the static
//   (distribute+random) dispersion (vibAmp_).
// vibOffset: the constant term added alongside vibAmp*vibInput in that
//   same scaling factor (vibOffset_) -- with vibAmp=0, this alone
//   determines how much of the static dispersion passes through (1.0 =
//   fully passes through, 0.0 = fully silences it, exactly per the
//   original formula).
// vibRate: Hz, the shared vibrato oscillator's rate (this port's own
//   addition -- see file header comment).
// level: output gain.
extern "C" void soemdsp_hypersaw_sample(
  int handle,
  double frequencyHz,
  double sampleRate,
  double phaseOffset,
  int numOscillators,
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
  const int voiceCount = numOscillators < 1 ? 1 : (numOscillators > kMaxVoices ? kMaxVoices : numOscillators);
  const double distributeAmt = clampD(distributePhaseAmp, 0.0, 1.0);
  const double randomAmt = clampD(randomPhaseAmp, 0.0, 1.0);
  const double driftAmt = clampD(driftAmp, 0.0, 1.0);
  const double driftJitterAmt = clampD(driftJitter, 0.0, 1.0);
  const double safeDriftFrequency = driftFrequency > 0.01 ? driftFrequency : 0.01;
  const double vibAmt = clampD(vibAmp, 0.0, 2.0);
  const double vibOffsetAmt = vibOffset;
  const double phaseIncrement = safeFrequency / safeSampleRate;

  // vibOsc_ -- one shared oscillator per Hypersaw instance (not per
  // voice), matching `vibOsc_.phaseOffset_ = 0.5` at construction (a
  // fixed half-cycle offset baked into the render below).
  s.vibPhase = wrap01(s.vibPhase + vibRate / safeSampleRate);
  const double vibSample = fastSine01(s.vibPhase + 0.5);

  double leftSum = 0.0, rightSum = 0.0;
  int leftCount = 0, rightCount = 0;

  for (int i = 0; i < voiceCount; i++) {
    HypersawVoiceState& voice = s.voices[i];

    const double div = static_cast<double>(i) / static_cast<double>(voiceCount);

    // drift_ (FlexibleRandomWalk, Method::fixed_steps): fixed-magnitude,
    // random-sign steps at ~driftFrequency Hz, jittered timing.
    voice.driftStepTimer -= 1.0;
    if (voice.driftStepTimer <= 0.0) {
      const double jitterFactor = 1.0 + randomBipolarUnit(voice.rngState) * 2.0 * driftJitterAmt;
      double nominalInterval = (safeSampleRate / safeDriftFrequency) * jitterFactor;
      if (nominalInterval < 1.0) nominalInterval = 1.0;
      voice.driftStepTimer = nominalInterval;
      voice.driftLp += randomBipolarUnit(voice.rngState) * 2.0 * kDriftFixedStepSize;
      if (voice.driftLp > 0.5) voice.driftLp = 1.0 - voice.driftLp;
      if (voice.driftLp < -0.5) voice.driftLp = -1.0 - voice.driftLp;
    }

    // vibInput_ only ever points at vibOsc_ for i >= 1 (see file header).
    const double vibInputForVoice = (i == 0) ? 0.0 : vibSample;

    const double staticDispersion = div * distributeAmt + voice.randomOffset * randomAmt;
    const double vibratoMultiplier = vibInputForVoice * vibAmt + vibOffsetAmt;
    const double walkOut = driftAmt > 0.0 ? voice.driftLp * driftAmt : 0.0;
    const double dispersion = staticDispersion * vibratoMultiplier + walkOut;

    const double renderPhase = wrap01(voice.phase + phaseOffset + dispersion);
    const double sawSample = 2.0 * renderPhase - 1.0 - polyBlep(renderPhase, phaseIncrement > 0.0 ? phaseIncrement : 1.0);

    voice.phase = wrap01(voice.phase + phaseIncrement);

    const bool isCenter = (i == 0) || (i == 1 && (voiceCount % 2 == 0));
    if (isCenter) {
      leftSum += sawSample;
      rightSum += sawSample;
      leftCount++;
      rightCount++;
    } else if ((i % 2) == 0) {
      leftSum += sawSample;
      leftCount++;
    } else {
      rightSum += sawSample;
      rightCount++;
    }
  }

  double left = leftCount > 0 ? leftSum / static_cast<double>(leftCount) : 0.0;
  double right = rightCount > 0 ? rightSum / static_cast<double>(rightCount) : 0.0;

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
  return 2;
}
