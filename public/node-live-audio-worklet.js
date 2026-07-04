const nodeLiveAdditiveHardMaxHarmonics = 1024;

const nodeLiveRaptEllipticQuarterbandSos = Object.freeze([
  Object.freeze([1.3515101236634053e-04, 1.8481719657676747e-04, 1.3515101236634053e-04, 1, -1.5863119326809123, 0.6428204816292211]),
  Object.freeze([1, -0.3714014551732318, 0.9999999999999998, 1, -1.5620959364626055, 0.7161571320953768]),
  Object.freeze([1, -1.0298229723362611, 1, 1, -1.5310702081483014, 0.8130950789236201]),
  Object.freeze([1, -1.2676395426322578, 1.0000000000000002, 1, -1.50809401930334, 0.8931580864862605]),
  Object.freeze([1, -1.3628788519102755, 1.0000000000000002, 1, -1.4983265140498274, 0.9475287279522546]),
  Object.freeze([1, -1.3980241837651683, 1, 1, -1.5032624176850438, 0.9843747059042128]),
]);

function nodeLiveIsPolyBlepOscillatorType(type) {
  return type === "osc" || type === "polyBlep" || type === "fbPolyBlepOsc" || type === "sineWavetable";
}

const nodeLiveSineWavetableSize = 2048;
const nodeLiveSineWavetable = new Float32Array(nodeLiveSineWavetableSize + 1);
for (let index = 0; index <= nodeLiveSineWavetableSize; index += 1) {
  nodeLiveSineWavetable[index] = Math.sin((index / nodeLiveSineWavetableSize) * Math.PI * 2);
}

function nodeLiveClamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function nodeLiveSmoothStep01(value) {
  const t = nodeLiveClamp01(value);
  return t * t * (3 - 2 * t);
}

function nodeLiveNyquistFadeAmplitude(frequency, sampleRate) {
  const safeRate = Math.max(1, Number(sampleRate) || 44100);
  const nyquist = safeRate * 0.5;
  const safeFrequency = Math.max(0, Number(frequency) || 0);
  const fadeStart = Math.min(20000, nyquist * 0.9);
  if (safeFrequency <= fadeStart) {
    return 1;
  }
  if (safeFrequency >= nyquist) {
    return 0;
  }
  const fadeProgress = (safeFrequency - fadeStart) / Math.max(1, nyquist - fadeStart);
  return 1 - nodeLiveSmoothStep01(fadeProgress);
}

function nodeLiveWrap01(value) {
  return ((Number(value) || 0) % 1 + 1) % 1;
}

function nodeLiveSineWavetableLookup(phaseRadians) {
  const cycle = nodeLiveWrap01((Number(phaseRadians) || 0) / (Math.PI * 2));
  const position = cycle * nodeLiveSineWavetableSize;
  const index = Math.floor(position);
  const fraction = position - index;
  const a = nodeLiveSineWavetable[index] || 0;
  const b = nodeLiveSineWavetable[index + 1] || nodeLiveSineWavetable[0] || 0;
  return a + (b - a) * fraction;
}

function nodeLiveSineCosWavetableSample(phaseRadians, frequency, amplitude, sampleRate) {
  const level = Math.max(0, Number(amplitude) || 0) * nodeLiveNyquistFadeAmplitude(frequency, sampleRate);
  return {
    cos: nodeLiveSineWavetableLookup((Number(phaseRadians) || 0) + Math.PI * 0.5) * level,
    sin: nodeLiveSineWavetableLookup(phaseRadians) * level,
  };
}

class NodeLiveAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.inputConnections = new Map();
    this.badNumberCount = 0;
    this.lastBadValueReason = "";
    this.lastBadValueNodeId = "";
    this.lastBadValueSource = "";
    this.audioPlayerMeterNodeId = "";
    this.audioPlayerMeterPeak = 0;
    this.audioPlayerMeterPhase = 0;
    this.audioPlayerMeterReason = "";
    this.audioPlayerMeterSamples = 0;
    this.audioPlayerNodeIds = [];
    this.inputMeterPeak = 0;
    this.inputMeterSamples = 0;
    this.inputMeterSquareSum = 0;
    this.maxBlockProcessMs = 0;
    this.maxBlockBudgetRatio = 0;
    this.meterClipCount = 0;
    this.meterCounter = 0;
    this.meterOverrunCount = 0;
    this.meterPeak = 0;
    this.meterProtectionMuteCount = 0;
    this.meterSamples = 0;
    this.meterSquareSum = 0;
    this.macroControls = new Array(10).fill(0);
    this.externalButtonEvents = new Map();
    this.wireBreakEvent = { pulseSamples: 0, gateSamples: 0 };
    this.wireConnectEvent = { pulseSamples: 0 };
    this.wireDisconnectEvent = { pulseSamples: 0 };
    this.windowReopenEvent = { pulseSamples: 0, gateSamples: 0, totalSamples: 0 };
    this.shootingStarExplosionEvent = { pulseSamples: 0 };
    this.pitchModWheelSignal = { mod: 0, pitch: 0 };
    this.midiKeyboardGatePulseSamples = 0;
    this.midiKeyboardSignal = null;
    this.moduleGroupRuntimes = new Map();
    this.modulationConnections = new Map();
    this.nodeOutputs = new Map();
    this.nodes = new Map();
    this.noiseSeedKeys = new Map();
    this.noiseSeeds = new Map();
    this.order = [];
    this.engineSampleRate = sampleRate;
    this.hostSampleRate = sampleRate;
    this.oversamplingRatio = 1;
    this.raptEllipticDecimatorLeft = this.createRaptEllipticDecimatorState();
    this.raptEllipticDecimatorRight = this.createRaptEllipticDecimatorState();
    this.raptEllipticDecimatorRatio = 1;
    this.passiveFilterStates = new Map();
    this.clockDividerStates = new Map();
    this.clockStates = new Map();
    this.codeblockFunctions = new Map();
    this.cookbookFilterStates = new Map();
    this.delayedTriggerStates = new Map();
    this.delayEffectStates = new Map();
    this.expAdsrStates = new Map();
    this.ellipsoidOutputFrames = new Map();
    this.nativeEllipsoid = null;
    this.nativeEllipsoidReady = false;
    this.nativeSabrinaReverb = null;
    this.nativeSabrinaReverbReady = false;
    this.nativePll = null;
    this.nativePllReady = false;
    this.nativeHelmholtz = null;
    this.nativeHelmholtzReady = false;
    this.nativeHelmholtzStatusKey = "";
    this.nativeNoiseGenerator = null;
    this.nativeNoiseGeneratorReady = false;
    this.nativeFbm = null;
    this.nativeFbmReady = false;
    this.nativeLadderFilter = null;
    this.nativeLadderFilterReady = false;
    this.nativeTb303Filter = null;
    this.nativeTb303FilterReady = false;
    this.nativePassiveFilter = null;
    this.nativePassiveFilterReady = false;
    this.nativeVactrolEnvelope = null;
    this.nativeVactrolEnvelopeReady = false;
    this.nativeSoftClipper = null;
    this.nativeSoftClipperReady = false;
    this.nativePolyBlep = null;
    this.nativePolyBlepReady = false;
    this.polyBlepStates = new Map();
    this.pllStates = new Map();
    this.fractalBrownianNoiseStates = new Map();
    this.graphInputConnections = new Map();
    this.gpuAdditiveQueues = new Map();
    this.gpuAdditiveStatusCounter = 0;
    this.gpuAdditiveUnderruns = 0;
    this.flowerChildEnvelopeFollowerStates = new Map();
    this.ladderFilterStates = new Map();
    this.tb303FilterStates = new Map();
    this.linearEnvelopeStates = new Map();
    this.lorenzAttractorStates = new Map();
    this.logisticMapStates = new Map();
    this.henonMapStates = new Map();
    this.chuaAttractorStates = new Map();
    this.chordMemoryStates = new Map();
    this.turingMachineStates = new Map();
    this.pitchQuantizerStates = new Map();
    this.surgeOscillatorStates = new Map();
    this.dsfOscillatorStates = new Map();
    this.robinSupersawStates = new Map();
    this.hypersawStates = new Map();
    this.noiseGeneratorStates = new Map();
    this.oscResetStates = new Map();
    this.graphLfoStates = new Map();
    this.oscillatorLastPhaseIncrements = new Map();
    this.oscillatorStoppedSamples = new Map();
    this.outputNode = "output";
    this.patchFingerprint = "";
    this.patchCommandStates = new Map();
    this.phases = new Map();
    this.pluckEnvelopeStates = new Map();
    this.planSerial = 0;
    this.randomClockStates = new Map();
    this.reverbEffectStates = new Map();
    this.sampleHoldStates = new Map();
    this.samplePlaybackStates = new Map();
    this.samples = new Map();
    this.randomWalkStates = new Map();
    this.sessionId = 0;
    this.scopeBuffers = new Map();
    this.scopeCaptureNodeIds = [];
    this.scopeCounter = 0;
    this.scopeSampleStride = 1;
    this.slewLimiterStates = new Map();
    this.smoothers = new Map();
    this.spiralStates = new Map();
    this.stepSequencerStates = new Map();
    this.timing = this.normalizePatchTiming();
    this.triggerCounterStates = new Map();
    this.triggerDividerStates = new Map();
    this.triangleStates = new Map();
    this.vactrolEnvelopeStates = new Map();
    this.visualInputBuffers = new Map();
    this.visualSinks = [];
    this.resetVisualControls();
    this.earProtector = this.createEarProtector(sampleRate);
    this.port.onmessage = (event) => this.handleMessage(event.data || {});
  }

  createEarProtector(rate = sampleRate) {
    const threshold = Math.pow(10, 6 / 20);
    const clipLimit = 0.8;
    const increment = 1 / Math.max(1, 0.0005 * rate);
    const decrement = 1 / Math.max(1, 0.15 * rate);
    const w = Math.min((Math.PI * 2) / Math.max(1, rate), 0.000142475857) * 1000;
    const a1 = Math.exp(-w);
    const b0 = 0.5 * (1 + a1);
    const b1 = -b0;
    let counter = 0;
    let inputBuffer = 0;
    let outputBuffer = 0;
    return {
      protect: (left = 0, right = left) => {
        const mono = ((Number(left) || 0) + (Number(right) || 0)) * 0.5;
        outputBuffer = b0 * mono + b1 * inputBuffer + a1 * outputBuffer;
        inputBuffer = mono;
        if (Math.abs(outputBuffer) >= threshold) {
          counter += increment;
        }
        const gain = counter >= 1 ? 0 : 1;
        counter = Math.max(0, Math.min(2, counter)) - decrement;
        return {
          left: this.clampValue((Number(left) || 0) * gain, -clipLimit, clipLimit),
          muted: gain <= 0,
          right: this.clampValue((Number(right) || 0) * gain, -clipLimit, clipLimit),
        };
      },
    };
  }

  createRaptEllipticDecimatorState() {
    return nodeLiveRaptEllipticQuarterbandSos.map(() => [0, 0]);
  }

  resetRaptEllipticDecimator() {
    this.raptEllipticDecimatorLeft = this.createRaptEllipticDecimatorState();
    this.raptEllipticDecimatorRight = this.createRaptEllipticDecimatorState();
    this.raptEllipticDecimatorRatio = this.oversamplingRatio;
  }

  processRaptEllipticDecimatorSample(input, states) {
    let y = Number(input) || 0;
    for (let section = 0; section < nodeLiveRaptEllipticQuarterbandSos.length; section += 1) {
      const [b0, b1, b2, , a1, a2] = nodeLiveRaptEllipticQuarterbandSos[section];
      const z1 = states[section][0];
      const z2 = states[section][1];
      const sectionOut = b0 * y + z1;
      states[section][0] = b1 * y - a1 * sectionOut + z2;
      states[section][1] = b2 * y - a2 * sectionOut;
      y = sectionOut;
    }
    return y;
  }

  createVisualControlState() {
    return {
      controls: {
        blue: 0,
        chromaAlpha: 0,
        chromaDrift: 0,
        chromaHue: 0,
        chromaLightness: 0,
        chromaSaturation: 0,
        chromaSpread: 0,
        green: 0,
        red: 0,
        scopePaused: 0,
        scopeTracesOff: 0,
        screenDim: 0,
        screenShake: 0,
        visualBloom: 0,
        visualBrightness: 0,
        visualGlow: 0,
        x: 0,
        y: 0,
      },
      counter: 0,
      states: new Map([
        ["blue", 0],
        ["chromaAlpha", 0],
        ["chromaDrift", 0],
        ["chromaHue", 0],
        ["chromaLightness", 0],
        ["chromaSaturation", 0],
        ["chromaSpread", 0],
        ["green", 0],
        ["red", 0],
        ["scopePaused", 0],
        ["scopeTracesOff", 0],
        ["screenDim", 0],
        ["screenShake", 0],
        ["visualBloom", 0],
        ["visualBrightness", 0],
        ["visualGlow", 0],
        ["x", 0],
        ["y", 0],
      ]),
    };
  }

  resetVisualControls() {
    const visualState = this.createVisualControlState();
    this.visualControls = visualState.controls;
    this.visualControlCounter = visualState.counter;
    this.visualControlStates = visualState.states;
  }

  destroySabrinaReverbState(state) {
    if (!state?.nativeHandle || !this.nativeSabrinaReverb?.soemdsp_sabrina_reverb_destroy) {
      return;
    }
    this.nativeSabrinaReverb.soemdsp_sabrina_reverb_destroy(state.nativeHandle);
    state.nativeHandle = 0;
  }

  handleMessage(message) {
    if (message.type === "stop") {
      if (message.sessionId !== this.sessionId || message.planSerial !== this.planSerial) {
        return;
      }
      this.clearPlan();
      return;
    }
    if (message.type === "setPlan") {
      this.setPlan(message.plan, message);
      return;
    }
    if (message.type === "setConnections") {
      this.setConnections(message.plan || message, message);
      return;
    }
    if (message.type === "setNativeModuleWasm") {
      this.setNativeModuleWasm(message);
      return;
    }
    if (message.type === "setParams") {
      this.setParams(message.nodes, message);
      return;
    }
    if (message.type === "gpuAdditiveChunk") {
      this.pushGpuAdditiveChunk(message);
      return;
    }
    if (message.type === "setMidiKeyboardSignal") {
      this.setMidiKeyboardSignal(message.signal);
      return;
    }
    if (message.type === "setMacroControls") {
      this.setMacroControls(message.values);
      return;
    }
    if (message.type === "setPitchModWheelSignal") {
      this.setPitchModWheelSignal(message.signal);
      return;
    }
    if (message.type === "externalButtonEvent") {
      this.setExternalButtonEvent(message.name);
      return;
    }
    if (message.type === "wireBreakEvent") {
      this.setWireBreakEvent();
      return;
    }
    if (message.type === "wireConnectEvent") {
      this.setWireConnectEvent();
      return;
    }
    if (message.type === "wireDisconnectEvent") {
      this.setWireDisconnectEvent();
      return;
    }
    if (message.type === "windowReopenEvent") {
      this.setWindowReopenEvent();
      return;
    }
    if (message.type === "shootingStarExplosionEvent") {
      this.setShootingStarExplosionEvent(message.speed);
      return;
    }
  }

  async setNativeModuleWasm(message) {
    if (!(message.bytes instanceof ArrayBuffer)) {
      return;
    }
    const name = String(message.name || "");
    const targetType = String(message.targetType || "");
    try {
      const result = await WebAssembly.instantiate(message.bytes, {});
      const exports = result?.instance?.exports || null;
      if (name === "ellipsoid" || targetType === "ellipsoid") {
        this.nativeEllipsoid = exports;
        this.nativeEllipsoidReady = Boolean(this.nativeEllipsoid?.soemdsp_ellipsoid_vector_sample);
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "ellipsoid",
          status: this.nativeEllipsoidReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "pll" || targetType === "pll") {
        for (const state of this.pllStates.values()) {
          this.destroyPllState(state);
        }
        this.nativePll = exports;
        this.nativePllReady = Boolean(
          this.nativePll?.soemdsp_pll_create &&
          this.nativePll?.soemdsp_pll_process &&
          this.nativePll?.soemdsp_pll_vco_out,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "pll",
          status: this.nativePllReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "helmholtz" || targetType === "helmholtzPitch") {
        for (const state of this.helmholtzStates.values()) {
          this.destroyHelmholtzState(state);
        }
        this.nativeHelmholtz = exports;
        this.nativeHelmholtzStatusKey = "";
        this.nativeHelmholtzReady = Boolean(
          this.nativeHelmholtz?.soemdsp_helmholtz_create &&
          this.nativeHelmholtz?.soemdsp_helmholtz_process &&
          this.nativeHelmholtz?.soemdsp_helmholtz_frequency,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "helmholtz",
          status: this.nativeHelmholtzReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "sabrina_reverb" || targetType === "reverbEffect") {
        for (const state of this.reverbEffectStates.values()) {
          this.destroySabrinaReverbState(state);
        }
        this.nativeSabrinaReverb = exports;
        this.nativeSabrinaReverbReady = Boolean(
          this.nativeSabrinaReverb?.soemdsp_sabrina_reverb_create &&
          this.nativeSabrinaReverb?.soemdsp_sabrina_reverb_process &&
          this.nativeSabrinaReverb?.soemdsp_sabrina_reverb_left &&
          this.nativeSabrinaReverb?.soemdsp_sabrina_reverb_right,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "sabrina_reverb",
          status: this.nativeSabrinaReverbReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "noise_generator" || targetType === "noiseGenerator") {
        for (const state of this.noiseGeneratorStates.values()) {
          this.destroyNoiseGeneratorNativeState(state);
        }
        this.nativeNoiseGenerator = exports;
        this.nativeNoiseGeneratorReady = Boolean(
          this.nativeNoiseGenerator?.soemdsp_noise_generator_create &&
          this.nativeNoiseGenerator?.soemdsp_noise_generator_sample &&
          this.nativeNoiseGenerator?.soemdsp_noise_generator_left &&
          this.nativeNoiseGenerator?.soemdsp_noise_generator_right,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "noise_generator",
          status: this.nativeNoiseGeneratorReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "soft_clipper" || targetType === "softClipper") {
        this.nativeSoftClipper = exports;
        this.nativeSoftClipperReady = Boolean(
          this.nativeSoftClipper?.soemdsp_soft_clipper_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "soft_clipper",
          status: this.nativeSoftClipperReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "fractal_brownian_noise" || targetType === "fractalBrownianNoise") {
        for (const state of this.fractalBrownianNoiseStates.values()) {
          this.destroyFbmNativeState(state);
        }
        this.nativeFbm = exports;
        this.nativeFbmReady = Boolean(
          this.nativeFbm?.soemdsp_fbm_create &&
          this.nativeFbm?.soemdsp_fbm_sample &&
          this.nativeFbm?.soemdsp_fbm_x &&
          this.nativeFbm?.soemdsp_fbm_y &&
          this.nativeFbm?.soemdsp_fbm_z,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "fractal_brownian_noise",
          status: this.nativeFbmReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "ladder_filter" || targetType === "ladderFilter") {
        for (const state of this.ladderFilterStates.values()) {
          this.destroyLadderFilterNativeState(state);
        }
        this.nativeLadderFilter = exports;
        this.nativeLadderFilterReady = Boolean(
          this.nativeLadderFilter?.soemdsp_ladder_filter_create &&
          this.nativeLadderFilter?.soemdsp_ladder_filter_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "ladder_filter",
          status: this.nativeLadderFilterReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "tb303_filter" || targetType === "tb303Filter") {
        for (const state of this.tb303FilterStates.values()) {
          this.destroyTb303FilterNativeState(state);
        }
        this.nativeTb303Filter = exports;
        this.nativeTb303FilterReady = Boolean(
          this.nativeTb303Filter?.soemdsp_tb303_filter_create &&
          this.nativeTb303Filter?.soemdsp_tb303_filter_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "tb303_filter",
          status: this.nativeTb303FilterReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "passive_filter" || targetType === "passiveFilter") {
        for (const state of this.passiveFilterStates.values()) {
          this.destroyPassiveFilterNativeState(state);
        }
        this.nativePassiveFilter = exports;
        this.nativePassiveFilterReady = Boolean(
          this.nativePassiveFilter?.soemdsp_passive_filter_create &&
          this.nativePassiveFilter?.soemdsp_passive_filter_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "passive_filter",
          status: this.nativePassiveFilterReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "vactrol_envelope" || targetType === "vactrolEnvelope" || targetType === "vactrolEnvelopeC4") {
        for (const state of this.vactrolEnvelopeStates.values()) {
          this.destroyVactrolEnvelopeNativeState(state);
        }
        this.nativeVactrolEnvelope = exports;
        this.nativeVactrolEnvelopeReady = Boolean(
          this.nativeVactrolEnvelope?.soemdsp_vactrol_envelope_create &&
          this.nativeVactrolEnvelope?.soemdsp_vactrol_envelope_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "vactrol_envelope",
          status: this.nativeVactrolEnvelopeReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "logistic_map" || targetType === "logisticMap") {
        for (const state of this.logisticMapStates.values()) {
          this.destroyLogisticMapNativeState(state);
        }
        this.nativeLogisticMap = exports;
        this.nativeLogisticMapReady = Boolean(
          this.nativeLogisticMap?.soemdsp_logistic_map_create &&
          this.nativeLogisticMap?.soemdsp_logistic_map_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "logistic_map",
          status: this.nativeLogisticMapReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "henon_map" || targetType === "henonMap") {
        for (const state of this.henonMapStates.values()) {
          this.destroyHenonMapNativeState(state);
        }
        this.nativeHenonMap = exports;
        this.nativeHenonMapReady = Boolean(
          this.nativeHenonMap?.soemdsp_henon_map_create &&
          this.nativeHenonMap?.soemdsp_henon_map_sample &&
          this.nativeHenonMap?.soemdsp_henon_map_x &&
          this.nativeHenonMap?.soemdsp_henon_map_y,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "henon_map",
          status: this.nativeHenonMapReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "chua_attractor" || targetType === "chuaAttractor") {
        for (const state of this.chuaAttractorStates.values()) {
          this.destroyChuaAttractorNativeState(state);
        }
        this.nativeChuaAttractor = exports;
        this.nativeChuaAttractorReady = Boolean(
          this.nativeChuaAttractor?.soemdsp_chua_attractor_create &&
          this.nativeChuaAttractor?.soemdsp_chua_attractor_sample &&
          this.nativeChuaAttractor?.soemdsp_chua_attractor_x &&
          this.nativeChuaAttractor?.soemdsp_chua_attractor_y &&
          this.nativeChuaAttractor?.soemdsp_chua_attractor_z,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "chua_attractor",
          status: this.nativeChuaAttractorReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "pitch_quantizer" || targetType === "pitchQuantizer") {
        for (const state of this.pitchQuantizerStates.values()) {
          this.destroyPitchQuantizerNativeState(state);
        }
        this.nativePitchQuantizer = exports;
        this.nativePitchQuantizerReady = Boolean(
          this.nativePitchQuantizer?.soemdsp_pitch_quantizer_create &&
          this.nativePitchQuantizer?.soemdsp_pitch_quantizer_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "pitch_quantizer",
          status: this.nativePitchQuantizerReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "surge_oscillator" || targetType === "surgeOscillator") {
        for (const state of this.surgeOscillatorStates.values()) {
          this.destroySurgeOscillatorNativeState(state);
        }
        this.nativeSurgeOscillator = exports;
        this.nativeSurgeOscillatorReady = Boolean(
          this.nativeSurgeOscillator?.soemdsp_surge_oscillator_create &&
          this.nativeSurgeOscillator?.soemdsp_surge_oscillator_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "surge_oscillator",
          status: this.nativeSurgeOscillatorReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "dsf_oscillator" || targetType === "dsfOscillator") {
        for (const state of this.dsfOscillatorStates.values()) {
          this.destroyDsfOscillatorNativeState(state);
        }
        this.nativeDsfOscillator = exports;
        this.nativeDsfOscillatorReady = Boolean(
          this.nativeDsfOscillator?.soemdsp_dsf_oscillator_create &&
          this.nativeDsfOscillator?.soemdsp_dsf_oscillator_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "dsf_oscillator",
          status: this.nativeDsfOscillatorReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "robin_supersaw" || targetType === "robinSupersaw") {
        for (const state of this.robinSupersawStates.values()) {
          this.destroyRobinSupersawNativeState(state);
        }
        this.nativeRobinSupersaw = exports;
        this.nativeRobinSupersawReady = Boolean(
          this.nativeRobinSupersaw?.soemdsp_robin_supersaw_create &&
          this.nativeRobinSupersaw?.soemdsp_robin_supersaw_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "robin_supersaw",
          status: this.nativeRobinSupersawReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "hypersaw" || targetType === "hypersaw") {
        for (const state of this.hypersawStates.values()) {
          this.destroyHypersawNativeState(state);
        }
        this.nativeHypersaw = exports;
        this.nativeHypersawReady = Boolean(
          this.nativeHypersaw?.soemdsp_hypersaw_create &&
          this.nativeHypersaw?.soemdsp_hypersaw_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "hypersaw",
          status: this.nativeHypersawReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "shooting_star_explosion" || targetType === "shootingStarExplosion") {
        this.nativeShootingStarExplosion = exports;
        this.nativeShootingStarExplosionReady = Boolean(
          this.nativeShootingStarExplosion?.soemdsp_shooting_star_explosion_power,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "shooting_star_explosion",
          status: this.nativeShootingStarExplosionReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "polyblep" || targetType === "polyBlep") {
        for (const state of this.polyBlepStates.values()) {
          this.destroyPolyBlepNativeState(state);
        }
        this.nativePolyBlep = exports;
        this.nativePolyBlepReady = Boolean(
          this.nativePolyBlep?.soemdsp_polyblep_create &&
          this.nativePolyBlep?.soemdsp_polyblep_sample &&
          this.nativePolyBlep?.soemdsp_polyblep_out,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "polyblep",
          status: this.nativePolyBlepReady ? "ready" : "missing exports",
        });
        return;
      }
      this.port.postMessage({
        type: "nativeModuleStatus",
        name,
        status: "unsupported native module",
      });
    } catch (error) {
      this.port.postMessage({
        type: "nativeModuleStatus",
        name,
        status: "error",
        message: String(error?.message || error || "native module load failed"),
      });
    }
  }

  clearPlan() {
    this.inputConnections = new Map();
    this.graphInputConnections = new Map();
    this.badNumberCount = 0;
    this.lastBadValueReason = "";
    this.lastBadValueNodeId = "";
    this.lastBadValueSource = "";
    this.inputMeterPeak = 0;
    this.inputMeterSamples = 0;
    this.inputMeterSquareSum = 0;
    this.meterClipCount = 0;
    this.meterCounter = 0;
    this.meterPeak = 0;
    this.meterProtectionMuteCount = 0;
    this.meterSamples = 0;
    this.meterSquareSum = 0;
    this.macroControls = new Array(10).fill(0);
    this.externalButtonEvents = new Map();
    this.wireBreakEvent = { pulseSamples: 0, gateSamples: 0 };
    this.wireConnectEvent = { pulseSamples: 0 };
    this.wireDisconnectEvent = { pulseSamples: 0 };
    this.windowReopenEvent = { pulseSamples: 0, gateSamples: 0, totalSamples: 0 };
    this.pitchModWheelSignal = { mod: 0, pitch: 0 };
    this.midiKeyboardGatePulseSamples = 0;
    this.midiKeyboardSignal = null;
    this.moduleGroupRuntimes = new Map();
    this.modulationConnections = new Map();
    this.nodeOutputs = new Map();
    this.nodes = new Map();
    this.order = [];
    this.patchFingerprint = "";
    this.patchCommandStates = new Map();
    this.engineSampleRate = sampleRate;
    this.hostSampleRate = sampleRate;
    this.oversamplingRatio = 1;
    for (const state of this.passiveFilterStates.values()) {
      this.destroyPassiveFilterNativeState(state);
    }
    this.passiveFilterStates = new Map();
    this.clockDividerStates = new Map();
    this.clockStates = new Map();
    this.codeblockFunctions = new Map();
    this.cookbookFilterStates = new Map();
    this.delayedTriggerStates = new Map();
    this.delayEffectStates = new Map();
    this.expAdsrStates = new Map();
    for (const state of this.fractalBrownianNoiseStates.values()) {
      this.destroyFbmNativeState(state);
    }
    this.fractalBrownianNoiseStates = new Map();
    this.gpuAdditiveQueues = new Map();
    this.gpuAdditiveStatusCounter = 0;
    this.gpuAdditiveUnderruns = 0;
    this.flowerChildEnvelopeFollowerStates = new Map();
    for (const state of this.ladderFilterStates.values()) {
      this.destroyLadderFilterNativeState(state);
    }
    this.ladderFilterStates = new Map();
    for (const state of this.tb303FilterStates.values()) {
      this.destroyTb303FilterNativeState(state);
    }
    this.tb303FilterStates = new Map();
    this.linearEnvelopeStates = new Map();
    this.lorenzAttractorStates = new Map();
    this.logisticMapStates = new Map();
    this.henonMapStates = new Map();
    this.chuaAttractorStates = new Map();
    this.chordMemoryStates = new Map();
    this.turingMachineStates = new Map();
    this.pitchQuantizerStates = new Map();
    this.surgeOscillatorStates = new Map();
    this.dsfOscillatorStates = new Map();
    this.robinSupersawStates = new Map();
    this.hypersawStates = new Map();
    this.noiseGeneratorStates = new Map();
    this.oscResetStates = new Map();
    this.graphLfoStates = new Map();
    this.pluckEnvelopeStates = new Map();
    this.randomClockStates = new Map();
    for (const state of this.reverbEffectStates.values()) {
      this.destroySabrinaReverbState(state);
    }
    this.reverbEffectStates = new Map();
    for (const state of this.pllStates.values()) {
      this.destroyPllState(state);
    }
    this.pllStates = new Map();
    for (const state of this.helmholtzStates.values()) {
      this.destroyHelmholtzState(state);
    }
    this.helmholtzStates = new Map();
    this.randomWalkStates = new Map();
    this.sampleHoldStates = new Map();
    this.samplePlaybackStates = new Map();
    this.samples = new Map();
    this.slewLimiterStates = new Map();
    this.scopeBuffers = new Map();
    this.scopeCounter = 0;
    this.smoothers = new Map();
    this.spiralStates = new Map();
    this.stepSequencerStates = new Map();
    this.triggerCounterStates = new Map();
    this.triggerDividerStates = new Map();
    this.triangleStates = new Map();
    this.vactrolEnvelopeStates = new Map();
    this.polyBlepStates = new Map();
    this.visualSinks = [];
    this.resetVisualControls();
  }

  pushGpuAdditiveChunk(message = {}) {
    if (message.sessionId !== this.sessionId || message.planSerial !== this.planSerial) {
      return;
    }
    const nodeId = String(message.nodeId || "");
    const samples = message.samples instanceof Float32Array
      ? message.samples
      : new Float32Array(message.samples || []);
    if (!nodeId || samples.length <= 0) {
      return;
    }
    const queue = this.gpuAdditiveQueues.get(nodeId) || {
      backend: "",
      chunks: [],
      droppedChunks: 0,
      expectedSequence: 0,
      heldGain: 1,
      heldSamples: 0,
      lastSample: 0,
      readIndex: 0,
      resetCount: 0,
      version: "",
    };
    queue.backend = String(message.backend || queue.backend || "");
    const version = String(message.version || "");
    if (queue.version !== version) {
      queue.chunks = [];
      queue.droppedChunks = 0;
      queue.expectedSequence = 0;
      queue.readIndex = 0;
      queue.resetCount += 1;
      queue.version = version;
    }
    const sequence = Number(message.sequence);
    if (Number.isFinite(sequence)) {
      if (sequence < queue.expectedSequence) {
        return;
      }
      if (sequence > queue.expectedSequence) {
        queue.droppedChunks += sequence - queue.expectedSequence;
        queue.chunks = [];
        queue.readIndex = 0;
      }
      queue.expectedSequence = sequence + 1;
    }
    queue.chunks.push(samples);
    while (queue.chunks.length > 12) {
      queue.chunks.shift();
      queue.droppedChunks += 1;
      queue.readIndex = 0;
    }
    this.gpuAdditiveQueues.set(nodeId, queue);
  }

  readGpuAdditiveQueuedSample(nodeId) {
    const queue = this.gpuAdditiveQueues.get(nodeId);
    if (!queue?.chunks?.length) {
      this.gpuAdditiveUnderruns += 1;
      if (queue && Number.isFinite(queue.lastSample) && queue.heldSamples < 2048) {
        queue.heldSamples += 1;
        if (queue.heldSamples > 128) {
          queue.heldGain = Math.max(0, (Number(queue.heldGain) || 1) * 0.9975);
        } else {
          queue.heldGain = 1;
        }
        return queue.lastSample * queue.heldGain;
      }
      return null;
    }
    const chunk = queue.chunks[0];
    const sample = Number(chunk[queue.readIndex]) || 0;
    queue.heldGain = 1;
    queue.lastSample = sample;
    queue.heldSamples = 0;
    queue.readIndex += 1;
    if (queue.readIndex >= chunk.length) {
      queue.chunks.shift();
      queue.readIndex = 0;
    }
    return sample;
  }

  postGpuAdditiveStatus() {
    const queues = [];
    for (const [nodeId, queue] of this.gpuAdditiveQueues) {
      queues.push({
        nodeId,
        backend: queue.backend,
        chunks: queue.chunks.length,
        droppedChunks: queue.droppedChunks,
        expectedSequence: queue.expectedSequence,
        heldGain: queue.heldGain,
        heldSamples: queue.heldSamples,
        resetCount: queue.resetCount,
        samples: queue.chunks.reduce((sum, chunk) => sum + chunk.length, 0) - queue.readIndex,
        version: queue.version,
      });
    }
    this.port.postMessage({
      queues,
      sessionId: this.sessionId,
      type: "gpuAdditiveStatus",
      underruns: this.gpuAdditiveUnderruns,
    });
    this.gpuAdditiveUnderruns = 0;
  }

  setPlan(plan, message = {}) {
    const patchFingerprint = message.patchFingerprint || plan?.patchFingerprint || "";
    this.patchFingerprint = patchFingerprint;
    this.planSerial = message.planSerial || 0;
    this.sessionId = message.sessionId || 0;
    this.gpuAdditiveQueues = new Map();
    this.gpuAdditiveUnderruns = 0;
    this.autoSmoothingSeconds = 0.5;
    this.hostSampleRate = Math.max(1, Number(message.sampleRate) || sampleRate || 44100);
    const requestedRatio = Number(message.oversamplingRatio) ||
      ((Number(message.engineSampleRate) || this.hostSampleRate) / this.hostSampleRate);
    this.oversamplingRatio = Math.max(1, Math.min(4, Math.round(requestedRatio) || 1));
    this.engineSampleRate = this.hostSampleRate * this.oversamplingRatio;
    // Global 0.1V/Oct pitch reference -- see node-graph-patch-normalizers.js
    // for the full explanation. Defaults match normalizeNodeGraphPatchAudio's
    // own defaults (C3 @ 100Hz) if the main thread hasn't sent them yet.
    this.pitchReferenceMidiNote = Number.isFinite(Number(message.pitchReferenceMidiNote))
      ? Number(message.pitchReferenceMidiNote)
      : 48;
    this.pitchReferenceHz = Number.isFinite(Number(message.pitchReferenceHz)) && Number(message.pitchReferenceHz) > 0
      ? Number(message.pitchReferenceHz)
      : 100;
    this.timing = this.normalizePatchTiming(plan?.timing);
    if (this.raptEllipticDecimatorRatio !== this.oversamplingRatio) {
      this.resetRaptEllipticDecimator();
    }
    const nodes = Array.isArray(plan?.nodes) ? plan.nodes : [];
    this.audioPlayerNodeIds = nodes
      .filter((node) => node?.type === "audioPlayer")
      .map((node) => String(node.id || ""))
      .filter(Boolean);
    const ids = new Set(nodes.map((node) => node.id));
    this.nodes = new Map(nodes.map((node) => [node.id, {
      id: node.id,
      codeblock: this.normalizeCodeblock(node.codeblock),
      moduleGroup: node.moduleGroup || null,
      moduleGroupPlan: node.moduleGroupPlan || null,
      paramMeta: node.paramMeta || {},
      params: node.params || {},
      sample: node.sample || null,
      type: node.type,
    }]));
    this.samples = new Map((Array.isArray(plan?.samples) ? plan.samples : []).map((sample) => [
      String(sample?.id || ""),
      {
        ...sample,
        channelData: (Array.isArray(sample?.channelData) ? sample.channelData : []).map((channel) =>
          channel instanceof Float32Array ? channel : new Float32Array(channel || [])),
        samples: sample?.samples instanceof Float32Array ? sample.samples : new Float32Array(sample?.samples || []),
      },
    ]).filter(([id]) => id));
    this.order = Array.isArray(plan?.order) ? [...plan.order] : [...ids];
    this.outputNode = plan?.outputNode || "output";
    this.scopeCaptureNodeIds = Array.isArray(plan?.scopeCaptureNodeIds)
      ? plan.scopeCaptureNodeIds.map((nodeId) => String(nodeId || "")).filter(Boolean)
      : [];
    this.visualSinks = (Array.isArray(plan?.visualSinks) ? plan.visualSinks : []).map((sink) => ({
      ...sink,
      bufferedInputs: Array.isArray(sink?.bufferedInputs) ? [...sink.bufferedInputs] : [],
      inputs: (Array.isArray(sink?.inputs) ? sink.inputs : []).map((input) => ({ ...input })),
    }));
    this.syncVisualInputBuffers();
    const newInputConnections = this.buildInputConnectionMap(plan?.connections, ids);
    this.inputConnections = newInputConnections;
    this.graphInputConnections = this.buildGraphInputConnectionMap(plan?.graphConnections, ids);
    this.modulationConnections = this.buildModulationConnectionMap(plan?.modulations, ids);
    this.resetVisualControls();

    for (const id of ids) {
      if (!this.nodeOutputs.has(id)) {
        this.nodeOutputs.set(id, 0);
      }
      const node = this.nodes.get(id);
      if (nodeLiveIsPolyBlepOscillatorType(node?.type) && !this.phases.has(id)) {
        this.phases.set(id, 0);
      }
      if (nodeLiveIsPolyBlepOscillatorType(node?.type) && !this.oscResetStates.has(id)) {
        this.oscResetStates.set(id, this.createOscResetState());
      }
      if (nodeLiveIsPolyBlepOscillatorType(node?.type) && !this.triangleStates.has(id)) {
        this.triangleStates.set(id, 0);
      }
      if (nodeLiveIsPolyBlepOscillatorType(node?.type) && !this.noiseSeeds.has(id)) {
        this.noiseSeeds.set(id, this.stableSeed(id));
      }
      if (node?.type === "spiral" && !this.spiralStates.has(id)) {
        this.spiralStates.set(id, this.createSpiralState());
      }
      if (node?.type === "lorenzAttractor" && !this.lorenzAttractorStates.has(id)) {
        this.lorenzAttractorStates.set(id, this.createLorenzAttractorState());
      }
      if (node?.type === "logisticMap" && !this.logisticMapStates.has(id)) {
        this.logisticMapStates.set(id, this.createLogisticMapState());
      }
      if (node?.type === "henonMap" && !this.henonMapStates.has(id)) {
        this.henonMapStates.set(id, this.createHenonMapState());
      }
      if (node?.type === "chuaAttractor" && !this.chuaAttractorStates.has(id)) {
        this.chuaAttractorStates.set(id, this.createChuaAttractorState());
      }
      if (node?.type === "chordMemory" && !this.chordMemoryStates.has(id)) {
        this.chordMemoryStates.set(id, this.createChordMemoryState());
      }
      if (node?.type === "turingMachine" && !this.turingMachineStates.has(id)) {
        this.turingMachineStates.set(id, this.createTuringMachineState());
      }
      if (node?.type === "pitchQuantizer" && !this.pitchQuantizerStates.has(id)) {
        this.pitchQuantizerStates.set(id, this.createPitchQuantizerState());
      }
      if (node?.type === "surgeOscillator" && !this.surgeOscillatorStates.has(id)) {
        this.surgeOscillatorStates.set(id, this.createSurgeOscillatorState());
      }
      if (node?.type === "dsfOscillator" && !this.dsfOscillatorStates.has(id)) {
        this.dsfOscillatorStates.set(id, this.createDsfOscillatorState());
      }
      if (node?.type === "robinSupersaw" && !this.robinSupersawStates.has(id)) {
        this.robinSupersawStates.set(id, this.createRobinSupersawState());
      }
      if (node?.type === "hypersaw" && !this.hypersawStates.has(id)) {
        this.hypersawStates.set(id, this.createHypersawState());
      }
      if (node?.type === "passiveFilter" && !this.passiveFilterStates.has(id)) {
        this.passiveFilterStates.set(id, this.createPassiveFilterState());
      }
      if (node?.type === "cookbookFilter" && !this.cookbookFilterStates.has(id)) {
        this.cookbookFilterStates.set(id, this.createCookbookFilterState());
      }
      if (node?.type === "ladderFilter" && !this.ladderFilterStates.has(id)) {
        this.ladderFilterStates.set(id, this.createLadderFilterState());
      }
      if (node?.type === "tb303Filter" && !this.tb303FilterStates.has(id)) {
        this.tb303FilterStates.set(id, this.createTb303FilterState());
      }
      if (node?.type === "clock" && !this.clockStates.has(id)) {
        this.clockStates.set(id, this.createClockState());
      }
      if ((node?.type === "graph" || node?.type === "graph2") && !this.graphLfoStates.has(id)) {
        this.graphLfoStates.set(id, this.createGraphLfoState());
      }
      if (node?.type === "clockDivider" && !this.clockDividerStates.has(id)) {
        this.clockDividerStates.set(id, this.createTriggerDividerState());
      }
      if (node?.type === "delayedTrigger" && !this.delayedTriggerStates.has(id)) {
        this.delayedTriggerStates.set(id, this.createDelayedTriggerState());
      }
      if (node?.type === "delayEffect" && !this.delayEffectStates.has(id)) {
        this.delayEffectStates.set(id, this.createDelayEffectState());
      }
      if (node?.type === "reverbEffect" && !this.reverbEffectStates.has(id)) {
        this.reverbEffectStates.set(id, this.createSabrinaReverbState());
      }
      if (node?.type === "pll" && !this.pllStates.has(id)) {
        this.pllStates.set(id, this.createPllState());
      }
      if (node?.type === "helmholtzPitch" && !this.helmholtzStates.has(id)) {
        this.helmholtzStates.set(id, this.createHelmholtzState());
      }
      if (node?.type === "randomClock" && !this.randomClockStates.has(id)) {
        this.randomClockStates.set(id, this.createRandomClockState());
      }
      if (node?.type === "sampleHold" && !this.sampleHoldStates.has(id)) {
        this.sampleHoldStates.set(id, this.createSampleHoldState());
      }
      if ((node?.type === "samplePlayer" || node?.type === "sampleLooper" || node?.type === "audioPlayer") && !this.samplePlaybackStates.has(id)) {
        this.samplePlaybackStates.set(id, this.createSamplePlaybackState());
      }
      if ((node?.type === "nextPatch" || node?.type === "previousPatch") && !this.patchCommandStates.has(id)) {
        this.patchCommandStates.set(id, this.createPatchCommandState());
      }
      if (node?.type === "slewLimiter" && !this.slewLimiterStates.has(id)) {
        this.slewLimiterStates.set(id, this.createSlewLimiterState());
      }
      if (node?.type === "expAdsr" && !this.expAdsrStates.has(id)) {
        this.expAdsrStates.set(id, this.createExpAdsrState());
      }
      if (node?.type === "linearEnvelope" && !this.linearEnvelopeStates.has(id)) {
        this.linearEnvelopeStates.set(id, this.createLinearEnvelopeState());
      }
      if (node?.type === "noiseGenerator" && !this.noiseGeneratorStates.has(id)) {
        this.noiseGeneratorStates.set(id, this.createNoiseGeneratorState());
      }
      if (node?.type === "randomWalk" && !this.randomWalkStates.has(id)) {
        this.randomWalkStates.set(id, this.createRandomWalkState());
      }
      if (node?.type === "fractalBrownianNoise" && !this.fractalBrownianNoiseStates.has(id)) {
        this.fractalBrownianNoiseStates.set(id, this.createFractalBrownianNoiseState());
      }
      if (
        node?.type === "flowerChildEnvelopeFollower" &&
        !this.flowerChildEnvelopeFollowerStates.has(id)
      ) {
        this.flowerChildEnvelopeFollowerStates.set(id, this.createFlowerChildEnvelopeFollowerState());
      }
      if (node?.type === "pluckEnvelope" && !this.pluckEnvelopeStates.has(id)) {
        this.pluckEnvelopeStates.set(id, this.createPluckEnvelopeState());
      }
      if (node?.type === "stepSequencer" && !this.stepSequencerStates.has(id)) {
        this.stepSequencerStates.set(id, this.createStepSequencerState());
      }
      if (node?.type === "triggerCounter" && !this.triggerCounterStates.has(id)) {
        this.triggerCounterStates.set(id, this.createTriggerCounterState());
      }
      if (node?.type === "triggerDivider" && !this.triggerDividerStates.has(id)) {
        this.triggerDividerStates.set(id, this.createTriggerDividerState());
      }
      if ((node?.type === "vactrolEnvelope" || node?.type === "vactrolEnvelopeC4") && !this.vactrolEnvelopeStates.has(id)) {
        this.vactrolEnvelopeStates.set(id, this.createVactrolEnvelopeState());
      }
      if (node?.type === "polyBlep" && !this.polyBlepStates.has(id)) {
        this.polyBlepStates.set(id, this.createPolyBlepState());
      }
      if (node?.type === "moduleGroup" && node.moduleGroupPlan && !this.moduleGroupRuntimes.has(id)) {
        this.moduleGroupRuntimes.set(id, this.createNestedRuntime(node.moduleGroupPlan));
      }
      for (const [key, value] of Object.entries(node?.params || {})) {
        const smootherKey = this.parameterKey(id, key);
        const metadata = node.paramMeta?.[key];
        if (!this.smoothers.has(smootherKey)) {
          this.smoothers.set(smootherKey, this.createSmoother(value, metadata));
        } else {
          this.updateSmoother(this.smoothers.get(smootherKey), value, metadata);
        }
      }
    }

    for (const id of [...this.phases.keys()]) {
      if (!ids.has(id)) {
        this.phases.delete(id);
      }
    }
    for (const id of [...this.oscResetStates.keys()]) {
      if (!ids.has(id)) {
        this.oscResetStates.delete(id);
      }
    }
    for (const id of [...this.graphLfoStates.keys()]) {
      if (!ids.has(id)) {
        this.graphLfoStates.delete(id);
      }
    }
    for (const id of [...this.triangleStates.keys()]) {
      if (!ids.has(id)) {
        this.triangleStates.delete(id);
      }
    }
    for (const id of [...this.oscillatorLastPhaseIncrements.keys()]) {
      const nodeId = String(id).split(":")[0];
      if (!ids.has(nodeId)) {
        this.oscillatorLastPhaseIncrements.delete(id);
      }
    }
    for (const id of [...this.oscillatorStoppedSamples.keys()]) {
      const nodeId = String(id).split(":")[0];
      if (!ids.has(nodeId)) {
        this.oscillatorStoppedSamples.delete(id);
      }
    }
    for (const id of [...this.noiseSeeds.keys()]) {
      const nodeId = String(id).split(":")[0];
      if (!ids.has(nodeId)) {
        this.noiseSeeds.delete(id);
      }
    }
    for (const id of [...this.noiseSeedKeys.keys()]) {
      const nodeId = String(id).split(":")[0];
      if (!ids.has(nodeId)) {
        this.noiseSeedKeys.delete(id);
      }
    }
    for (const id of [...this.nodeOutputs.keys()]) {
      if (!ids.has(id)) {
        this.nodeOutputs.delete(id);
      }
    }
    for (const id of [...this.spiralStates.keys()]) {
      if (!ids.has(id)) {
        this.spiralStates.delete(id);
      }
    }
    for (const id of [...this.lorenzAttractorStates.keys()]) {
      if (!ids.has(id)) {
        this.lorenzAttractorStates.delete(id);
      }
    }
    for (const id of [...this.logisticMapStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyLogisticMapNativeState(this.logisticMapStates.get(id));
        this.logisticMapStates.delete(id);
      }
    }
    for (const id of [...this.henonMapStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyHenonMapNativeState(this.henonMapStates.get(id));
        this.henonMapStates.delete(id);
      }
    }
    for (const id of [...this.chuaAttractorStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyChuaAttractorNativeState(this.chuaAttractorStates.get(id));
        this.chuaAttractorStates.delete(id);
      }
    }
    for (const id of [...this.chordMemoryStates.keys()]) {
      if (!ids.has(id)) {
        this.chordMemoryStates.delete(id);
      }
    }
    for (const id of [...this.turingMachineStates.keys()]) {
      if (!ids.has(id)) {
        this.turingMachineStates.delete(id);
      }
    }
    for (const id of [...this.pitchQuantizerStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyPitchQuantizerNativeState(this.pitchQuantizerStates.get(id));
        this.pitchQuantizerStates.delete(id);
      }
    }
    for (const id of [...this.surgeOscillatorStates.keys()]) {
      if (!ids.has(id)) {
        this.destroySurgeOscillatorNativeState(this.surgeOscillatorStates.get(id));
        this.surgeOscillatorStates.delete(id);
      }
    }
    for (const id of [...this.dsfOscillatorStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyDsfOscillatorNativeState(this.dsfOscillatorStates.get(id));
        this.dsfOscillatorStates.delete(id);
      }
    }
    for (const id of [...this.robinSupersawStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyRobinSupersawNativeState(this.robinSupersawStates.get(id));
        this.robinSupersawStates.delete(id);
      }
    }
    for (const id of [...this.hypersawStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyHypersawNativeState(this.hypersawStates.get(id));
        this.hypersawStates.delete(id);
      }
    }
    for (const id of [...this.passiveFilterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyPassiveFilterNativeState(this.passiveFilterStates.get(id));
        this.passiveFilterStates.delete(id);
      }
    }
    for (const id of [...this.linearEnvelopeStates.keys()]) {
      if (!ids.has(id)) {
        this.linearEnvelopeStates.delete(id);
      }
    }
    for (const id of [...this.clockStates.keys()]) {
      if (!ids.has(id)) {
        this.clockStates.delete(id);
      }
    }
    for (const id of [...this.codeblockFunctions.keys()]) {
      if (!ids.has(id)) {
        this.codeblockFunctions.delete(id);
      }
    }
    for (const id of [...this.cookbookFilterStates.keys()]) {
      if (!ids.has(id)) {
        this.cookbookFilterStates.delete(id);
      }
    }
    for (const id of [...this.ladderFilterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyLadderFilterNativeState(this.ladderFilterStates.get(id));
        this.ladderFilterStates.delete(id);
      }
    }
    for (const id of [...this.tb303FilterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyTb303FilterNativeState(this.tb303FilterStates.get(id));
        this.tb303FilterStates.delete(id);
      }
    }
    for (const id of [...this.clockDividerStates.keys()]) {
      if (!ids.has(id)) {
        this.clockDividerStates.delete(id);
      }
    }
    for (const id of [...this.delayedTriggerStates.keys()]) {
      if (!ids.has(id)) {
        this.delayedTriggerStates.delete(id);
      }
    }
    for (const id of [...this.delayEffectStates.keys()]) {
      if (!ids.has(id)) {
        this.delayEffectStates.delete(id);
      }
    }
    for (const id of [...this.reverbEffectStates.keys()]) {
      if (!ids.has(id)) {
        this.destroySabrinaReverbState(this.reverbEffectStates.get(id));
        this.reverbEffectStates.delete(id);
      }
    }
    for (const id of [...this.pllStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyPllState(this.pllStates.get(id));
        this.pllStates.delete(id);
      }
    }
    for (const id of [...this.helmholtzStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyHelmholtzState(this.helmholtzStates.get(id));
        this.helmholtzStates.delete(id);
      }
    }
    for (const id of [...this.sampleHoldStates.keys()]) {
      if (!ids.has(id)) {
        this.sampleHoldStates.delete(id);
      }
    }
    for (const id of [...this.samplePlaybackStates.keys()]) {
      if (!ids.has(id)) {
        this.samplePlaybackStates.delete(id);
      }
    }
    for (const id of [...this.patchCommandStates.keys()]) {
      if (!ids.has(id)) {
        this.patchCommandStates.delete(id);
      }
    }
    for (const id of [...this.slewLimiterStates.keys()]) {
      if (!ids.has(id)) {
        this.slewLimiterStates.delete(id);
      }
    }
    for (const id of [...this.expAdsrStates.keys()]) {
      if (!ids.has(id)) {
        this.expAdsrStates.delete(id);
      }
    }
    for (const id of [...this.noiseGeneratorStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyNoiseGeneratorNativeState(this.noiseGeneratorStates.get(id));
        this.noiseGeneratorStates.delete(id);
      }
    }
    for (const id of [...this.randomWalkStates.keys()]) {
      if (!ids.has(id)) {
        this.randomWalkStates.delete(id);
      }
    }
    for (const id of [...this.randomClockStates.keys()]) {
      if (!ids.has(id)) {
        this.randomClockStates.delete(id);
      }
    }
    for (const id of [...this.fractalBrownianNoiseStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyFbmNativeState(this.fractalBrownianNoiseStates.get(id));
        this.fractalBrownianNoiseStates.delete(id);
      }
    }
    for (const id of [...this.flowerChildEnvelopeFollowerStates.keys()]) {
      if (!ids.has(id)) {
        this.flowerChildEnvelopeFollowerStates.delete(id);
      }
    }
    for (const id of [...this.pluckEnvelopeStates.keys()]) {
      if (!ids.has(id)) {
        this.pluckEnvelopeStates.delete(id);
      }
    }
    for (const id of [...this.stepSequencerStates.keys()]) {
      if (!ids.has(id)) {
        this.stepSequencerStates.delete(id);
      }
    }
    for (const id of [...this.triggerCounterStates.keys()]) {
      if (!ids.has(id)) {
        this.triggerCounterStates.delete(id);
      }
    }
    for (const id of [...this.triggerDividerStates.keys()]) {
      if (!ids.has(id)) {
        this.triggerDividerStates.delete(id);
      }
    }
    for (const id of [...this.vactrolEnvelopeStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyVactrolEnvelopeNativeState(this.vactrolEnvelopeStates.get(id));
        this.vactrolEnvelopeStates.delete(id);
      }
    }
    for (const id of [...this.polyBlepStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyPolyBlepNativeState(this.polyBlepStates.get(id));
        this.polyBlepStates.delete(id);
      }
    }
    for (const id of [...this.moduleGroupRuntimes.keys()]) {
      if (!ids.has(id)) {
        this.moduleGroupRuntimes.delete(id);
      }
    }
    for (const key of [...this.smoothers.keys()]) {
      const [nodeId, parameter] = key.split(".");
      if (!ids.has(nodeId) || !(parameter in (this.nodes.get(nodeId)?.params || {}))) {
        this.smoothers.delete(key);
      }
    }
    this.port.postMessage({
      connectionCount: Array.isArray(plan?.connections) ? plan.connections.length : 0,
      feedbackConnectionCount: Array.isArray(plan?.feedbackConnections) ? plan.feedbackConnections.length : 0,
      feedbackModulationCount: Array.isArray(plan?.feedbackModulations) ? plan.feedbackModulations.length : 0,
      feedbackModulations: (Array.isArray(plan?.feedbackModulations) ? plan.feedbackModulations : []).map(
        (modulation) =>
          `${modulation.sourceNode}.${modulation.sourcePort} -> ${modulation.destinationNode}.${modulation.destinationParam}`,
      ),
      feedbackSignals: (Array.isArray(plan?.feedbackConnections) ? plan.feedbackConnections : []).map(
        (connection) =>
          `${connection.sourceNode}.${connection.sourcePort} -> ${connection.destinationNode}.${connection.destinationPort}`,
      ),
      modulationCount: Array.isArray(plan?.modulations) ? plan.modulations.length : 0,
      engineSampleRate: this.engineSampleRate,
      nodeCount: this.nodes.size,
      order: [...this.order],
      oversamplingRatio: this.oversamplingRatio,
      patchFingerprint,
      planSerial: this.planSerial,
      sampleRate: this.hostSampleRate,
      sessionId: this.sessionId,
      speakerOutputActive: Boolean(plan?.speakerOutputActive),
      stateReadCount: (
        (Array.isArray(plan?.feedbackConnections) ? plan.feedbackConnections.length : 0) +
        (Array.isArray(plan?.feedbackModulations) ? plan.feedbackModulations.length : 0)
      ),
      type: "planApplied",
      visualSinkCount: Array.isArray(plan?.visualSinks) ? plan.visualSinks.length : 0,
      visualSinks: Array.isArray(plan?.visualSinks) ? plan.visualSinks : [],
    });
  }

  setConnections(plan, message = {}) {
    if (Number.isFinite(Number(message.pitchReferenceMidiNote))) {
      this.pitchReferenceMidiNote = Number(message.pitchReferenceMidiNote);
    }
    if (Number.isFinite(Number(message.pitchReferenceHz)) && Number(message.pitchReferenceHz) > 0) {
      this.pitchReferenceHz = Number(message.pitchReferenceHz);
    }
    this.patchFingerprint = message.patchFingerprint || plan?.patchFingerprint || this.patchFingerprint || "";
    this.planSerial = message.planSerial || this.planSerial || 0;
    this.sessionId = message.sessionId || this.sessionId || 0;
    this.outputNode = plan?.outputNode || this.outputNode || "output";
    this.scopeCaptureNodeIds = Array.isArray(plan?.scopeCaptureNodeIds)
      ? plan.scopeCaptureNodeIds.map((nodeId) => String(nodeId || "")).filter(Boolean)
      : this.scopeCaptureNodeIds;
    this.visualSinks = (Array.isArray(plan?.visualSinks) ? plan.visualSinks : this.visualSinks).map((sink) => ({
      ...sink,
      bufferedInputs: Array.isArray(sink?.bufferedInputs) ? [...sink.bufferedInputs] : [],
      inputs: (Array.isArray(sink?.inputs) ? sink.inputs : []).map((input) => ({ ...input })),
    }));
    this.syncVisualInputBuffers();
    const ids = new Set([...this.nodes.keys()]);
    this.inputConnections = this.buildInputConnectionMap(plan?.connections, ids);
    this.graphInputConnections = this.buildGraphInputConnectionMap(plan?.graphConnections, ids);
    this.modulationConnections = this.buildModulationConnectionMap(plan?.modulations, ids);
  }

  setParams(nodes, message = {}) {
    const patchFingerprint = message.patchFingerprint || "";
    this.patchFingerprint = patchFingerprint || this.patchFingerprint;
    this.planSerial = message.planSerial || 0;
    this.sessionId = message.sessionId || 0;
    this.autoSmoothingSeconds = this.clampAutoSmoothingSeconds(message.autoSmoothingSeconds);
    this.syncNestedAutoSmoothingSeconds(this.autoSmoothingSeconds);
    this.gpuAdditiveQueues = new Map();
    this.gpuAdditiveUnderruns = 0;
    let parameterCount = 0;
    for (const node of Array.isArray(nodes) ? nodes : []) {
      const current = this.nodes.get(node.id);
      if (!current) {
        continue;
      }
      current.params = { ...(node.params || {}) };
      current.paramMeta = { ...(node.paramMeta || {}) };
      parameterCount += Object.keys(current.params || {}).length;
      for (const [key, value] of Object.entries(current.params || {})) {
        const smootherKey = this.parameterKey(node.id, key);
        const metadata = current.paramMeta?.[key];
        if (!this.smoothers.has(smootherKey)) {
          this.smoothers.set(smootherKey, this.createSmoother(value, metadata));
        } else {
          this.updateSmoother(this.smoothers.get(smootherKey), value, metadata);
        }
      }
    }
    this.port.postMessage({
      nodeCount: this.nodes.size,
      order: [...this.order],
      parameterCount,
      patchFingerprint,
      planSerial: this.planSerial,
      sessionId: this.sessionId,
      type: "paramsApplied",
    });
  }

  setMidiKeyboardSignal(signal) {
    const source = signal && typeof signal === "object" ? signal : {};
    const midi = this.clampValue(Math.round(Number(source.midi) || 60), 0, 127);
    const keyIndex = this.clampValue(Number(source.keyIndex) || 0, 0, 24);
    const keyQuantized = this.clampValue(Number(source.keyQuantized) || keyIndex / 24, 0, 1);
    const frequency = Math.max(0, Number(source.frequency) || 440 * (2 ** ((midi - 69) / 12)));
    if (Number(source.gatePulse) > 0) {
      this.midiKeyboardGatePulseSamples = 1;
    }
    this.midiKeyboardSignal = {
      gate: Number(source.gate) > 0 ? 1 : 0,
      gatePulse: Number(source.gatePulse) > 0 ? 1 : 0,
      x: this.clampValue(Number(source.x) || keyQuantized, 0, 1),
      y: this.clampValue(Number(source.y) || 0, 0, 1),
      keyIndex,
      keyQuantized,
      midi,
      pitchValue: this.clampValue(Number(source.pitchValue) || midi, 0, 127),
      midiNormalized: this.clampValue(Number(source.midiNormalized) || midi / 127, 0, 1),
      tenthVoltPerOctave: this.clampValue(Number(source.tenthVoltPerOctave) || midi / 120, 0, 1),
      increment: Math.max(0, Number(source.increment) || frequency / Math.max(1, this.engineSampleRate || sampleRate)),
      frequency,
    };
  }

  setMacroControls(values) {
    this.macroControls = Array.from({ length: 10 }, (_, index) => (
      this.clampValue(Number(values?.[index]) || 0, 0, 1)
    ));
  }

  setPitchModWheelSignal(signal) {
    const source = signal && typeof signal === "object" ? signal : {};
    const pitch = Number(source.pitch);
    this.pitchModWheelSignal = {
      mod: this.clampValue(Number(source.mod) || 0, 0, 1),
      pitch: this.clampValue(Number.isFinite(pitch) ? pitch : 0, -1, 1),
    };
  }

  normalizeExternalButtonEventName(name) {
    const key = String(name || "").trim().toLowerCase();
    if (key === "mousedown" || key === "pointerdown") return "down";
    if (key === "mouseup" || key === "pointerup") return "up";
    if (key === "mouseenter" || key === "pointerenter") return "enter";
    if (key === "mouseleave" || key === "pointerleave") return "leave";
    return ["click", "hover", "down", "up", "enter", "leave"].includes(key) ? key : "";
  }

  setExternalButtonEvent(name) {
    const key = this.normalizeExternalButtonEventName(name);
    if (!key) return;
    const samples = Math.max(1, Math.round(Math.max(1, this.engineSampleRate || sampleRate) * 0.02));
    this.externalButtonEvents.set(key, Math.max(Number(this.externalButtonEvents.get(key)) || 0, samples));
  }

  externalButtonEventPulse(name) {
    const remaining = Number(this.externalButtonEvents.get(name)) || 0;
    if (remaining <= 0) {
      this.externalButtonEvents.delete(name);
      return 0;
    }
    this.externalButtonEvents.set(name, remaining - 1);
    return 1;
  }

  wireBreakGateSamples() {
    return Math.max(1, Math.round(Math.max(1, this.engineSampleRate || sampleRate) * 0.52));
  }

  gameTriggerPulseSamples() {
    return Math.max(1, Math.round(Math.max(1, this.engineSampleRate || sampleRate) * 0.02));
  }

  setWireBreakEvent() {
    const event = this.wireBreakEvent && typeof this.wireBreakEvent === "object"
      ? this.wireBreakEvent
      : { pulseSamples: 0, gateSamples: 0 };
    event.pulseSamples = Math.max(Number(event.pulseSamples) || 0, this.gameTriggerPulseSamples());
    event.gateSamples = Math.max(Number(event.gateSamples) || 0, this.wireBreakGateSamples());
    this.wireBreakEvent = event;
  }

  wireBreakEventSample() {
    const event = this.wireBreakEvent && typeof this.wireBreakEvent === "object"
      ? this.wireBreakEvent
      : { pulseSamples: 0, gateSamples: 0 };
    const pulseSamples = Math.max(0, Number(event.pulseSamples) || 0);
    const gateSamples = Math.max(0, Number(event.gateSamples) || 0);
    event.pulseSamples = Math.max(0, pulseSamples - 1);
    event.gateSamples = Math.max(0, gateSamples - 1);
    this.wireBreakEvent = event;
    return {
      Pulse: pulseSamples > 0 ? 1 : 0,
      Gate: gateSamples > 0 ? 1 : 0,
    };
  }

  setWireConnectEvent() {
    const event = this.wireConnectEvent && typeof this.wireConnectEvent === "object"
      ? this.wireConnectEvent
      : { pulseSamples: 0 };
    event.pulseSamples = Math.max(Number(event.pulseSamples) || 0, this.gameTriggerPulseSamples());
    this.wireConnectEvent = event;
  }

  wireConnectEventSample() {
    const event = this.wireConnectEvent && typeof this.wireConnectEvent === "object"
      ? this.wireConnectEvent
      : { pulseSamples: 0 };
    const pulseSamples = Math.max(0, Number(event.pulseSamples) || 0);
    event.pulseSamples = Math.max(0, pulseSamples - 1);
    this.wireConnectEvent = event;
    return { Pulse: pulseSamples > 0 ? 1 : 0 };
  }

  setWireDisconnectEvent() {
    const event = this.wireDisconnectEvent && typeof this.wireDisconnectEvent === "object"
      ? this.wireDisconnectEvent
      : { pulseSamples: 0 };
    event.pulseSamples = Math.max(Number(event.pulseSamples) || 0, this.gameTriggerPulseSamples());
    this.wireDisconnectEvent = event;
  }

  wireDisconnectEventSample() {
    const event = this.wireDisconnectEvent && typeof this.wireDisconnectEvent === "object"
      ? this.wireDisconnectEvent
      : { pulseSamples: 0 };
    const pulseSamples = Math.max(0, Number(event.pulseSamples) || 0);
    event.pulseSamples = Math.max(0, pulseSamples - 1);
    this.wireDisconnectEvent = event;
    return { Pulse: pulseSamples > 0 ? 1 : 0 };
  }

  setShootingStarExplosionEvent(speed = null) {
    const event = this.shootingStarExplosionEvent && typeof this.shootingStarExplosionEvent === "object"
      ? this.shootingStarExplosionEvent
      : { pulseSamples: 0, speed: null };
    event.pulseSamples = Math.max(0, Number(event.pulseSamples) || 0) + 1;
    const normalizedSpeed = Number(speed);
    event.speed = Number.isFinite(normalizedSpeed) ? normalizedSpeed : null;
    this.shootingStarExplosionEvent = event;
  }

  nativeShootingStarExplosionPower(speed, lowRange = 6, highRange = 10) {
    const low = Number(lowRange) || 0;
    const high = Number(highRange) || 0;
    const fallback = () => {
      if (!Number.isFinite(speed)) return 1;
      return high > low ? Math.max(0, Math.min(1, (speed - low) / (high - low))) : 0;
    };
    if (!this.nativeShootingStarExplosionReady || !this.nativeShootingStarExplosion?.soemdsp_shooting_star_explosion_power) {
      return fallback();
    }
    try {
      return this.safeFilterNumber(
        this.nativeShootingStarExplosion.soemdsp_shooting_star_explosion_power(
          Number.isFinite(speed) ? speed : -1,
          low,
          high,
        ),
        null,
      );
    } catch (error) {
      this.nativeShootingStarExplosionReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "shooting_star_explosion",
        status: "disabled",
        message: String(error?.message || error || "native Shooting Star Explosion failed"),
      });
      return fallback();
    }
  }

  shootingStarExplosionEventSample(lowRange = 6, highRange = 10) {
    const event = this.shootingStarExplosionEvent && typeof this.shootingStarExplosionEvent === "object"
      ? this.shootingStarExplosionEvent
      : { pulseSamples: 0 };
    const pulseSamples = Math.max(0, Number(event.pulseSamples) || 0);
    const speed = Number(event.speed);
    const power = this.nativeShootingStarExplosionPower(speed, lowRange, highRange);
    event.pulseSamples = Math.max(0, pulseSamples - 1);
    this.shootingStarExplosionEvent = event;
    return { Pulse: pulseSamples > 0 ? power : 0 };
  }

  windowReopenGateSamples() {
    return Math.max(1, Math.round(Math.max(1, this.engineSampleRate || sampleRate) * 1));
  }

  setWindowReopenEvent() {
    const samples = this.windowReopenGateSamples();
    this.windowReopenEvent = {
      gateSamples: samples,
      pulseSamples: this.gameTriggerPulseSamples(),
      totalSamples: samples,
    };
  }

  windowReopenEventSample() {
    const event = this.windowReopenEvent && typeof this.windowReopenEvent === "object"
      ? this.windowReopenEvent
      : { pulseSamples: 0, gateSamples: 0, totalSamples: 0 };
    const pulseSamples = Math.max(0, Number(event.pulseSamples) || 0);
    const gateSamples = Math.max(0, Number(event.gateSamples) || 0);
    const totalSamples = Math.max(1, Number(event.totalSamples) || gateSamples || 1);
    const progress = gateSamples > 0 ? 1 - gateSamples / totalSamples : 1;
    const sine = gateSamples > 0 ? Math.sin(Math.PI * Math.max(0, Math.min(1, progress))) : 0;
    event.pulseSamples = Math.max(0, pulseSamples - 1);
    event.gateSamples = Math.max(0, gateSamples - 1);
    this.windowReopenEvent = event;
    return {
      Pulse: pulseSamples > 0 ? 1 : 0,
      Gate: gateSamples > 0 ? 1 : 0,
      Sine: sine,
    };
  }

  buildConnectionMap(items, ids, keyForItem) {
    const map = new Map();
    for (const item of Array.isArray(items) ? items : []) {
      if (!ids.has(item.sourceNode) || !ids.has(item.destinationNode)) {
        continue;
      }
      const key = keyForItem(item);
      const list = map.get(key) || [];
      list.push({ ...item });
      map.set(key, list);
    }
    return map;
  }

  buildInputConnectionMap(connections, ids) {
    return this.buildConnectionMap(
      connections,
      ids,
      (connection) => this.inputKey(connection.destinationNode, connection.destinationPort),
    );
  }

  buildModulationConnectionMap(modulations, ids) {
    return this.buildConnectionMap(
      modulations,
      ids,
      (modulation) => this.parameterKey(modulation.destinationNode, modulation.destinationParam),
    );
  }

  buildGraphInputConnectionMap(graphConnections, ids) {
    return this.buildConnectionMap(
      graphConnections,
      ids,
      (connection) => this.graphInputKey(connection.destinationNode, connection.destinationGraphInput),
    );
  }

  inputKey(node, port) {
    return `${node}.${port}`;
  }

  graphInputKey(node, graphInput) {
    return `${node}.${graphInput}`;
  }

  parameterKey(node, parameter) {
    return `${node}.${parameter}`;
  }

  stableSeed(text) {
    let seed = 0x12345678;
    for (const character of String(text)) {
      seed = (Math.imul(seed ^ character.charCodeAt(0), 16777619)) >>> 0;
    }
    return seed || 0x12345678;
  }

  wrapValue(value, min, max) {
    const range = max - min;
    if (!Number.isFinite(range) || range <= 0) {
      return min;
    }
    return min + ((((value - min) % range) + range) % range);
  }

  clampValue(value, min, max) {
    const number = Number(value);
    const reason = this.badValueReason(number);
    if (reason) {
      this.badNumberCount += 1;
      if (!this.lastBadValueNodeId) {
        this.lastBadValueReason = reason;
        this.lastBadValueSource = "";
      }
      return 0;
    }
    return Math.max(min, Math.min(max, number));
  }

  normalizeGraphNumber(value, fallback = 0, min = 0, max = 1) {
    const number = Number(value);
    return Number.isFinite(number)
      ? Math.max(min, Math.min(max, number))
      : fallback;
  }

  normalizeGraphShape(value) {
    const shape = String(value || "").trim();
    return shape === "linear" || shape === "smooth" || shape === "exponential" || shape === "rational" || shape === "hold"
      ? shape
      : "rational";
  }

  normalizeGraphNode(value = {}, index = 0) {
    const source = value && typeof value === "object" ? value : {};
    const fallback = index <= 0
      ? { c: 0, shape: "linear", x: 0, y: 0 }
      : { c: 0, shape: "rational", x: 1, y: 1 };
    return {
      c: this.normalizeGraphNumber(source.c, fallback.c, -0.999, 0.999),
      shape: this.normalizeGraphShape(source.shape ?? fallback.shape),
      x: this.normalizeGraphNumber(source.x, fallback.x),
      y: this.normalizeGraphNumber(source.y, fallback.y),
    };
  }

  normalizeGraph(value = {}) {
    const source = value && typeof value === "object" ? value : {};
    const inputNodes = Array.isArray(source.nodes) && source.nodes.length >= 2
      ? source.nodes
      : [{ c: 0, shape: "linear", x: 0, y: 0 }, { c: 0, shape: "rational", x: 1, y: 1 }];
    const nodes = inputNodes
      .slice(0, 32)
      .map((node, index) => this.normalizeGraphNode(node, index))
      .sort((left, right) => left.x - right.x);
    if (nodes.length < 2) {
      nodes.push(
        this.normalizeGraphNode({ c: 0, shape: "linear", x: 0, y: 0 }, 0),
        this.normalizeGraphNode({ c: 0, shape: "rational", x: 1, y: 1 }, 1),
      );
    }
    return { nodes };
  }

  graphEndpointYLockEnabledForNode(node) {
    return (node?.type === "graph" || node?.type === "graph2") && Number(node?.params?.lockEndpointY) >= 0.5;
  }

  graphWithLockedEndpointY(graphValue) {
    const graph = this.normalizeGraph(graphValue);
    if (graph.nodes.length < 2) {
      return graph;
    }
    const lastIndex = graph.nodes.length - 1;
    const anchorY = this.normalizeGraphNumber(graph.nodes[0]?.y, 0);
    const nodes = graph.nodes.map((node, index) => (
      index === 0 || index === lastIndex
        ? this.normalizeGraphNode({ ...node, y: anchorY }, index)
        : node
    ));
    return this.normalizeGraph({ ...graph, nodes });
  }

  graphForNode(node) {
    return this.graphEndpointYLockEnabledForNode(node)
      ? this.graphWithLockedEndpointY(node?.graph)
      : this.normalizeGraph(node?.graph);
  }

  graphRationalCurve(position, contour = 0) {
    const p = this.normalizeGraphNumber(position, 0, 0, 1);
    const c = this.normalizeGraphNumber(contour, 0, -0.999, 0.999);
    if (Math.abs(c) < 0.000001) {
      return p;
    }
    return c < 0
      ? (p * (1 + c)) / (1 + c * p)
      : p / (1 - c + c * p);
  }

  graphExponentialCurve(position, contour = 0) {
    const p = this.normalizeGraphNumber(position, 0, 0, 1);
    const c = this.normalizeGraphNumber(0.5 * (contour + 1), 0.5, 0.001, 0.999);
    const a = 2 * Math.log((1 - c) / c);
    if (!Number.isFinite(a) || Math.abs(a) < 0.000001) {
      return p;
    }
    const denominator = 1 - Math.exp(a);
    return Math.abs(denominator) < 0.000001 ? p : (1 - Math.exp(p * a)) / denominator;
  }

  graphSmoothCurve(position) {
    const p = this.normalizeGraphNumber(position, 0, 0, 1);
    return p * p * (3 - 2 * p);
  }

  normalizeGraph2SmoothingMode(value) {
    if (Number.isFinite(Number(value))) {
      return ["linear", "smooth", "meander", "quadratic", "cubic"][Math.max(0, Math.min(4, Math.round(Number(value))))];
    }
    const mode = String(value || "").trim().toLowerCase();
    return ["linear", "smooth", "meander", "quadratic", "cubic"].includes(mode) ? mode : "smooth";
  }

  graphMeanderCurve(position, index = 0) {
    const p = this.graphSmoothCurve(position);
    const wobblePhase = (index * 0.371) % 1;
    const wobble = Math.sin(Math.PI * p) * Math.sin((p * 1.5 + wobblePhase) * Math.PI * 2) * 0.075;
    return this.normalizeGraphNumber(p + wobble, p, 0, 1);
  }

  graphModeCurve(position, mode, index = 0) {
    const normalizedMode = this.normalizeGraph2SmoothingMode(mode);
    if (normalizedMode === "linear") {
      return this.normalizeGraphNumber(position, 0, 0, 1);
    }
    if (normalizedMode === "meander") {
      return this.graphMeanderCurve(position, index);
    }
    return this.graphSmoothCurve(position);
  }

  graphBezierPointAt(nodes, position = 0) {
    const t = this.normalizeGraphNumber(position, 0, 0, 1);
    let points = nodes.map((node) => ({
      x: this.normalizeGraphNumber(node.x, 0),
      y: this.normalizeGraphNumber(node.y, 0),
    }));
    if (!points.length) {
      return { x: 0, y: 0 };
    }
    while (points.length > 1) {
      points = points.slice(0, -1).map((point, index) => {
        const next = points[index + 1];
        return {
          x: point.x + (next.x - point.x) * t,
          y: point.y + (next.y - point.y) * t,
        };
      });
    }
    return points[0];
  }

  graphBezierValueAt(graph, xValue) {
    const x = this.normalizeGraphNumber(xValue, 0, -Infinity, Infinity);
    if (graph.nodes.length < 2) {
      return graph.nodes[0]?.y ?? 0;
    }
    if (x <= graph.nodes[0].x) {
      return graph.nodes[0].y;
    }
    const last = graph.nodes[graph.nodes.length - 1];
    if (x >= last.x) {
      return last.y;
    }
    let low = 0;
    let high = 1;
    let point = this.graphBezierPointAt(graph.nodes, x);
    for (let iteration = 0; iteration < 28; iteration += 1) {
      const t = (low + high) * 0.5;
      point = this.graphBezierPointAt(graph.nodes, t);
      if (point.x < x) {
        low = t;
      } else {
        high = t;
      }
    }
    return point.y;
  }

  graphInterpolationWindowStart(nodes, x, degree) {
    const targetCount = Math.max(2, Math.min(nodes.length, degree + 1));
    let segmentIndex = 0;
    for (let index = 0; index < nodes.length - 1; index += 1) {
      if (x <= nodes[index + 1].x) {
        segmentIndex = index;
        break;
      }
      segmentIndex = index;
    }
    const start = segmentIndex - Math.max(0, Math.floor((targetCount - 2) * 0.5));
    return Math.max(0, Math.min(nodes.length - targetCount, start));
  }

  graphLagrangeValueAt(graph, xValue, degree = 3) {
    const x = this.normalizeGraphNumber(xValue, 0, -Infinity, Infinity);
    const nodes = graph.nodes;
    if (nodes.length < 2) {
      return nodes[0]?.y ?? 0;
    }
    for (const node of nodes) {
      if (Math.abs(x - node.x) < 0.000001) {
        return node.y;
      }
    }
    const targetCount = Math.max(2, Math.min(nodes.length, degree + 1));
    const start = this.graphInterpolationWindowStart(nodes, x, degree);
    const windowNodes = nodes.slice(start, start + targetCount);
    let value = 0;
    for (let index = 0; index < windowNodes.length; index += 1) {
      const point = windowNodes[index];
      let basis = 1;
      for (let otherIndex = 0; otherIndex < windowNodes.length; otherIndex += 1) {
        if (otherIndex === index) {
          continue;
        }
        const other = windowNodes[otherIndex];
        const denominator = point.x - other.x;
        if (Math.abs(denominator) < 0.000001) {
          continue;
        }
        basis *= (x - other.x) / denominator;
      }
      value += point.y * basis;
    }
    return value;
  }

  graphSmoothingModeForNode(node) {
    return node?.type === "graph2" ? this.normalizeGraph2SmoothingMode(node?.params?.smoothingMode) : "legacy";
  }

  graphSegmentValue(graph, x, index, smoothingMode = "legacy") {
    const left = graph.nodes[index];
    const right = graph.nodes[index + 1];
    const dx = right.x - left.x;
    if (Math.abs(dx) < 0.000001) {
      return 0.5 * (left.y + right.y);
    }
    const p = this.normalizeGraphNumber((x - left.x) / dx, 0, 0, 1);
    if (smoothingMode !== "legacy") {
      const shaped = this.graphModeCurve(p, smoothingMode, index);
      return left.y + (right.y - left.y) * shaped;
    }
    const contour = this.normalizeGraphNumber(right.c, 0, -0.999, 0.999);
    const shaped = right.shape === "exponential"
      ? this.graphExponentialCurve(p, contour)
      : right.shape === "hold"
        ? (p >= 1 ? 1 : 0)
      : right.shape === "smooth"
        ? this.graphSmoothCurve(p)
      : right.shape === "linear"
        ? p
        : this.graphRationalCurve(p, contour);
    return left.y + (right.y - left.y) * shaped;
  }

  graphValueAt(graphValue, xValue, smoothingMode = "legacy") {
    const graph = this.normalizeGraph(graphValue);
    const x = this.normalizeGraphNumber(xValue, 0, -Infinity, Infinity);
    if (!graph.nodes.length) {
      return 0;
    }
    const normalizedMode = this.normalizeGraph2SmoothingMode(smoothingMode);
    if (normalizedMode === "meander") {
      return this.safeFilterNumber(this.graphBezierValueAt(graph, x), null);
    }
    if (x < graph.nodes[0].x) {
      return graph.nodes[0].y;
    }
    if (x > graph.nodes[graph.nodes.length - 1].x) {
      return graph.nodes[graph.nodes.length - 1].y;
    }
    if (normalizedMode === "quadratic") {
      return this.safeFilterNumber(this.graphLagrangeValueAt(graph, x, 2), null);
    }
    if (normalizedMode === "cubic") {
      return this.safeFilterNumber(this.graphLagrangeValueAt(graph, x, 3), null);
    }
    for (let index = 0; index < graph.nodes.length - 1; index += 1) {
      if (x <= graph.nodes[index + 1].x) {
        return this.safeFilterNumber(this.graphSegmentValue(graph, x, index, smoothingMode), null);
      }
    }
    return graph.nodes[graph.nodes.length - 1].y;
  }

  outputSampleClipped(value) {
    return this.badValueReason(value) || value < -0.95 || value > 0.95;
  }

  outputSampleTripsEarProtection(value) {
    const number = Number(value);
    return !Number.isFinite(number) || Math.abs(number) > 1;
  }

  speakerProtectionSample(value, nodeId) {
    const number = Number(value);
    const unsafe = !Number.isFinite(number) || Math.abs(number) > 1;
    if (unsafe) {
      this.meterProtectionMuteCount += 1;
      this.speakerProtectionPeak = Math.max(
        Number(this.speakerProtectionPeak) || 0,
        Number.isFinite(number) ? Math.abs(number) : Infinity,
      );
      this.speakerProtectionNodeId = String(nodeId || "");
    }
    return unsafe ? 0 : number;
  }

  badValueReason(value) {
    const number = Number(value);
    if (Number.isNaN(number)) {
      return "NaN";
    }
    if (!Number.isFinite(number)) {
      return "inf";
    }
    if (Math.abs(number) > 999999999) {
      return "exploded";
    }
    if (number !== 0 && Math.abs(number) < 1.1754943508222875e-38) {
      return "denormal";
    }
    return "";
  }

  scopeScalarValue(value) {
    const readNumber = (candidate) => {
      const number = Number(candidate);
      if (this.badValueReason(number)) {
        return null;
      }
      return this.clampValue(number, -1, 1);
    };
    if (typeof value === "number") {
      return readNumber(value) ?? 0;
    }
    if (!value || typeof value !== "object") {
      return 0;
    }
    for (const key of ["Out", "Out X", "Out Y", "Out Z", "Left", "Right", "X", "Y", "Z", "Pulse", "Gate", "Count"]) {
      const number = readNumber(value[key]);
      if (number !== null) {
        return number;
      }
    }
    for (const candidate of Object.values(value)) {
      const number = readNumber(candidate);
      if (number !== null) {
        return number;
      }
    }
    return 0;
  }

  captureModuleScopeFrame(frameValues = null, frame = 0, frames = 1) {
    this.scopeSampleStride = Math.max(1, Math.floor((Number(this.engineSampleRate) || sampleRate || 44100) / 12000));
    const captureDebugScope = (this.scopeCounter % this.scopeSampleStride) === 0;
    if (captureDebugScope) {
      const captureNodeIds = Array.isArray(this.scopeCaptureNodeIds)
        ? this.scopeCaptureNodeIds
        : this.order;
      for (const nodeId of captureNodeIds) {
        if (!this.nodeOutputs.has(nodeId)) {
          continue;
        }
        this.captureModuleScopeOutput(nodeId, this.nodeOutputs.get(nodeId));
      }
    }
    for (const sink of this.visualSinks || []) {
      const nodeId = String(sink?.nodeId || "");
      if (!nodeId) {
        continue;
      }
      if (
        Array.isArray(this.scopeCaptureNodeIds) &&
        !this.scopeCaptureNodeIds.includes(nodeId)
      ) {
        continue;
      }
      let value = 0;
      for (const input of sink.inputs || []) {
        if (!input?.connected) {
          continue;
        }
        const inputValue = (input.connections || []).reduce(
          (connectionSum, connection) => connectionSum + this.readRuntimePortOutput(
            frameValues,
            connection.sourceNode,
            connection.sourcePort,
            frame,
            frames,
          ),
          0,
        );
        value += inputValue;
        const inputPort = String(input.port || "").trim();
        if (input?.buffered && inputPort) {
          this.writeVisualInputBufferSample(nodeId, inputPort, inputValue, sink.bufferSampleLimit);
        }
        if (captureDebugScope && inputPort && !input?.buffered) {
          const portId = `${nodeId}:${inputPort}`;
          this.appendScopeBufferSample(portId, inputValue);
        }
      }
      if (captureDebugScope) {
        this.appendScopeBufferSample(nodeId, value);
      }
    }
  }

  appendScopeBufferSample(id, value) {
    const key = String(id || "");
    if (!key) {
      return;
    }
    const limit = 4096;
    let samples = this.scopeBuffers.get(key);
    if (!(samples instanceof Float32Array)) {
      samples = new Float32Array(limit);
      samples.nodeGraphScopeWriteIndex = 0;
      samples.nodeGraphScopeLength = 0;
      this.scopeBuffers.set(key, samples);
    }
    const writeIndex = Math.max(0, Math.min(limit - 1, Number(samples.nodeGraphScopeWriteIndex) || 0));
    samples[writeIndex] = this.scopeScalarValue(value);
    samples.nodeGraphScopeWriteIndex = (writeIndex + 1) % limit;
    samples.nodeGraphScopeLength = Math.min(limit, (Number(samples.nodeGraphScopeLength) || 0) + 1);
  }

  createVisualInputBuffer(capacity = 262144) {
    const safeCapacity = this.normalizeVisualInputBufferCapacity(capacity);
    return {
      absoluteFrame: 0,
      buffer: new Float32Array(safeCapacity),
      capacity: safeCapacity,
      length: 0,
      postedFrame: 0,
      writeIndex: 0,
    };
  }

  normalizeVisualInputBufferCapacity(capacity = 262144) {
    return Math.max(1, Math.round(Number(capacity) || 262144));
  }

  resizeVisualInputBufferState(state, capacity = 262144) {
    const safeCapacity = this.normalizeVisualInputBufferCapacity(capacity);
    if (!state || state.capacity !== safeCapacity || !(state.buffer instanceof Float32Array)) {
      const next = this.createVisualInputBuffer(safeCapacity);
      if (!state?.buffer?.length || !state?.length) {
        return next;
      }
      const oldCapacity = state.capacity || state.buffer.length;
      const oldLength = Math.min(Number(state.length) || 0, oldCapacity);
      const copyCount = Math.min(oldLength, safeCapacity);
      const first = ((Number(state.writeIndex) || 0) - oldLength + oldCapacity) % oldCapacity;
      for (let index = 0; index < copyCount; index += 1) {
        const oldIndex = (first + oldLength - copyCount + index) % oldCapacity;
        next.buffer[index] = state.buffer[oldIndex] || 0;
      }
      next.length = copyCount;
      next.writeIndex = copyCount % safeCapacity;
      next.absoluteFrame = Math.max(Number(state.absoluteFrame) || 0, copyCount);
      next.postedFrame = Math.min(Math.max(Number(state.postedFrame) || 0, 0), next.absoluteFrame);
      return next;
    }
    return state;
  }

  syncVisualInputBuffers() {
    const expected = new Map();
    for (const sink of this.visualSinks || []) {
      const nodeId = String(sink?.nodeId || "");
      if (!nodeId) {
        continue;
      }
      for (const input of sink.inputs || []) {
        if (!input?.buffered) {
          continue;
        }
        const port = String(input.port || "").trim();
        if (!port) {
          continue;
        }
        const key = `${nodeId}:${port}`;
        expected.set(key, this.normalizeVisualInputBufferCapacity(sink.bufferSampleLimit));
      }
    }
    for (const [key, capacity] of expected) {
      const current = this.visualInputBuffers.get(key);
      if (!current || current.capacity !== capacity) {
        this.visualInputBuffers.set(key, this.resizeVisualInputBufferState(current, capacity));
      }
    }
    for (const key of [...this.visualInputBuffers.keys()]) {
      if (!expected.has(key)) {
        this.visualInputBuffers.delete(key);
      }
    }
  }

  writeVisualInputBufferSample(nodeId, port, value, capacity = 262144) {
    const key = `${nodeId}:${port}`;
    let buffer = this.visualInputBuffers.get(key);
    const safeCapacity = this.normalizeVisualInputBufferCapacity(capacity);
    if (!buffer || buffer.capacity !== safeCapacity) {
      buffer = this.resizeVisualInputBufferState(buffer, safeCapacity);
      this.visualInputBuffers.set(key, buffer);
    }
    buffer.buffer[buffer.writeIndex] = this.scopeScalarValue(value);
    buffer.writeIndex = (buffer.writeIndex + 1) % buffer.capacity;
    buffer.length = Math.min(buffer.capacity, buffer.length + 1);
    buffer.absoluteFrame += 1;
  }

  captureModuleScopeOutput(nodeId, output) {
    const id = String(nodeId || "");
    if (!id) {
      return;
    }
    this.appendScopeBufferSample(id, output);
    if (!output || typeof output !== "object") {
      return;
    }
    for (const [port, value] of Object.entries(output)) {
      if (!port || !Number.isFinite(Number(value))) {
        continue;
      }
      const portId = `${id}:${port}`;
      this.appendScopeBufferSample(portId, value);
    }
  }

  postModuleScopeSnapshot() {
    const values = [];
    const engineSampleRate = Math.max(1, Number(this.engineSampleRate) || sampleRate || 44100);
    const scopeSampleStride = Math.max(1, Number(this.scopeSampleStride) || 1);
    const decimatedScopeSampleRate = engineSampleRate / scopeSampleStride;
    for (const [nodeId, samples] of this.scopeBuffers) {
      const length = samples instanceof Float32Array
        ? Math.min(samples.length, Number(samples.nodeGraphScopeLength) || 0)
        : samples?.length || 0;
      if (!length) {
        continue;
      }
      if (samples instanceof Float32Array) {
        const writeIndex = Number(samples.nodeGraphScopeWriteIndex) || 0;
        const ordered = new Float32Array(length);
        const start = (writeIndex - length + samples.length) % samples.length;
        for (let index = 0; index < length; index += 1) {
          ordered[index] = samples[(start + index) % samples.length] || 0;
        }
        values.push([nodeId, ordered, {
          sampleRate: decimatedScopeSampleRate,
          sampleStride: scopeSampleStride,
          sourceSampleRate: engineSampleRate,
        }]);
      } else {
        values.push([nodeId, samples, {
          sampleRate: decimatedScopeSampleRate,
          sampleStride: scopeSampleStride,
          sourceSampleRate: engineSampleRate,
        }]);
      }
    }
    for (const [key, state] of this.visualInputBuffers || []) {
      const length = Math.min(Number(state?.length) || 0, state?.capacity || state?.buffer?.length || 0);
      if (!state?.buffer?.length || length <= 0) {
        continue;
      }
      const absoluteFrame = Math.max(0, Math.floor(Number(state.absoluteFrame) || 0));
      const postedFrame = Math.max(0, Math.floor(Number(state.postedFrame) || 0));
      const freshCount = postedFrame > 0
        ? Math.max(0, absoluteFrame - postedFrame)
        : Math.min(length, Math.ceil((Number(this.engineSampleRate) || sampleRate || 44100) / 30));
      const count = Math.min(length, freshCount);
      if (count <= 0) {
        continue;
      }
      const ordered = new Float32Array(count);
      const start = ((Number(state.writeIndex) || 0) - count + state.capacity) % state.capacity;
      for (let index = 0; index < count; index += 1) {
        ordered[index] = state.buffer[(start + index) % state.capacity] || 0;
      }
      values.push([key, ordered, {
        absoluteFrame,
        sampleRate: engineSampleRate,
        sampleStride: 1,
        sourceSampleRate: engineSampleRate,
        startFrame: absoluteFrame - count,
      }]);
      state.postedFrame = absoluteFrame;
    }
    const hypersawVoicePhases = [];
    for (const [nodeId, state] of this.hypersawStates) {
      if (Array.isArray(state?.lastVoicePhases) && state.lastVoicePhases.length) {
        hypersawVoicePhases.push([nodeId, state.lastVoicePhases]);
      }
    }
    if (!values.length && !hypersawVoicePhases.length) {
      return;
    }
    this.port.postMessage({
      ...(hypersawVoicePhases.length ? { hypersawVoicePhases } : {}),
      patchFingerprint: this.patchFingerprint,
      sampleRate: engineSampleRate,
      sessionId: this.sessionId,
      type: "scope",
      values,
    });
    this.scopeBuffers = new Map();
  }

  shortestWrapDelta(from, to, min, max) {
    const range = max - min;
    if (!Number.isFinite(range) || range <= 0) {
      return to - from;
    }
    let delta = to - from;
    if (delta > range / 2) {
      delta -= range;
    } else if (delta < -range / 2) {
      delta += range;
    }
    return delta;
  }

  smoothingSecondsFromMetadata(metadata = {}) {
    // metadata.smoothingSeconds is already normalized to null (unset -> defer
    // to the global auto-smoothing time) or a finite number. Number(null) is
    // 0 in JS, so coercing a literal null here would silently turn "unset"
    // into "0 seconds" (instant, no smoothing) instead of preserving the
    // fallback to this.autoSmoothingSeconds.
    if (metadata?.smoothingSeconds === null || metadata?.smoothingSeconds === undefined) {
      return null;
    }
    const value = Number(metadata.smoothingSeconds);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  createSmoother(initialValue, metadata = {}) {
    const value = Number(initialValue);
    const safeValue = Number.isFinite(value) ? value : 0;
    const signal = this.parameterValueToNormalizedSignal(safeValue, metadata);
    return {
      current: safeValue,
      linearSmoothing: metadata?.linearSmoothing !== false,
      max: Number.isFinite(Number(metadata?.max)) ? Number(metadata.max) : 1,
      metadata,
      min: Number.isFinite(Number(metadata?.min)) ? Number(metadata.min) : 0,
      smoothingSeconds: this.smoothingSecondsFromMetadata(metadata),
      outputBuffer: signal,
      targetSignal: signal,
      target: safeValue,
      lastFrame: -1,
      lastValue: safeValue,
      wraparound: Boolean(metadata?.wraparound),
    };
  }

  clampAutoSmoothingSeconds(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value)) {
      return 0.5;
    }
    return Math.max(0, value);
  }

  smoothingFrequencyFromSeconds(seconds) {
    const normalized = this.clampAutoSmoothingSeconds(seconds);
    return normalized <= 0 ? 0 : 1 / normalized;
  }

  syncNestedAutoSmoothingSeconds(seconds = this.autoSmoothingSeconds) {
    const normalized = this.clampAutoSmoothingSeconds(seconds);
    for (const runtime of this.moduleGroupRuntimes?.values?.() || []) {
      runtime.autoSmoothingSeconds = normalized;
      runtime.syncNestedAutoSmoothingSeconds?.(normalized);
    }
  }

  updateSmoother(smoother, targetValue, metadata = {}) {
    const value = Number(targetValue);
    smoother.target = Number.isFinite(value) ? value : smoother.target;
    smoother.linearSmoothing = metadata?.linearSmoothing !== false;
    smoother.max = Number.isFinite(Number(metadata?.max)) ? Number(metadata.max) : smoother.max;
    smoother.metadata = metadata;
    smoother.min = Number.isFinite(Number(metadata?.min)) ? Number(metadata.min) : smoother.min;
    smoother.smoothingSeconds = this.smoothingSecondsFromMetadata(metadata);
    smoother.targetSignal = this.parameterValueToNormalizedSignal(smoother.target, metadata);
    smoother.wraparound = Boolean(metadata?.wraparound);
    if (!smoother.linearSmoothing) {
      smoother.current = smoother.target;
      smoother.outputBuffer = smoother.targetSignal;
      smoother.lastValue = smoother.target;
    }
  }

  readSmoothedParameter(node, key, fallback, frame, frames) {
    const smoother = this.smoothers.get(this.parameterKey(node?.id, key));
    if (!smoother) {
      const value = Number(node?.params?.[key]);
      return Number.isFinite(value) ? value : fallback;
    }
    if (!smoother.linearSmoothing) {
      return smoother.target;
    }
    if (smoother.lastFrame === frame) {
      return smoother.lastValue;
    }
    const smoothingSeconds = this.clampAutoSmoothingSeconds(
      smoother.smoothingSeconds ?? this.autoSmoothingSeconds,
    );
    if (smoothingSeconds <= 0) {
      smoother.current = smoother.target;
      smoother.outputBuffer = smoother.targetSignal;
      smoother.lastFrame = frame;
      smoother.lastValue = smoother.target;
      return smoother.target;
    }
    const signal = this.onePoleLowpassSample(
      smoother,
      smoother.targetSignal,
      this.smoothingFrequencyFromSeconds(smoothingSeconds),
      sampleRate,
    );
    const value = this.normalizedSignalToParameterValue(signal, smoother.metadata);
    smoother.current = value;
    smoother.lastFrame = frame;
    smoother.lastValue = value;
    return value;
  }

  finishSmoothing() {
    for (const smoother of this.smoothers.values()) {
      if (!smoother.linearSmoothing) {
        smoother.current = smoother.wraparound
          ? this.wrapValue(smoother.target, smoother.min, smoother.max)
          : smoother.target;
        continue;
      }
      smoother.current = smoother.lastValue ?? smoother.current;
      smoother.lastFrame = -1;
    }
    for (const runtime of this.moduleGroupRuntimes?.values?.() || []) {
      runtime.finishSmoothing();
    }
  }

  applyParameterBounds(value, metadata = {}) {
    const min = Number(metadata.min);
    const max = Number(metadata.max);
    if (metadata.unboundedMin && metadata.unboundedMax) {
      return value;
    }
    if (metadata.unboundedMin && Number.isFinite(max)) {
      return Math.min(value, max);
    }
    if (metadata.unboundedMax && Number.isFinite(min)) {
      return Math.max(value, min);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      return value;
    }
    return metadata.wraparound
      ? this.wrapValue(value, min, max)
      : this.clampValue(value, min, max);
  }

  readRuntimeOutput(frameValues, nodeId, port = "Out") {
    const output = frameValues?.has(nodeId)
      ? frameValues.get(nodeId)
      : this.nodeOutputs.get(nodeId);
    if (output && typeof output === "object") {
      return Number(output[port] ?? output.Out ?? 0);
    }
    return output === undefined || output === null ? 0 : Number(output);
  }

  parameterOutputExists(node, port) {
    return Boolean(node?.params && Object.hasOwn(node.params, port));
  }

  normalizeParameterOutputValue(value, metadata = {}) {
    return this.parameterValueToNormalizedSignal(value, metadata);
  }

  normalizeParameterModulationInput(value, metadata = {}) {
    const number = Number(value) || 0;
    return metadata?.kind === "frequency" && metadata.nonlinearSlider
      ? this.clampValue(number, -1, 1)
      : this.clampValue(number, 0, 1);
  }

  parameterSkewExponent(metadata = {}) {
    if (!metadata.nonlinearSlider) {
      return 1;
    }
    const min = Number(metadata.min);
    const max = Number(metadata.max);
    const mid = Number(metadata.mid);
    const range = max - min;
    if (!Number.isFinite(range) || range <= 0 || !Number.isFinite(mid)) {
      return 1;
    }
    const normalizedMid = this.clampValue((mid - min) / range, 0.000001, 0.999999);
    return Math.log(normalizedMid) / Math.log(0.5);
  }

  parameterValueToNormalizedSignal(value, metadata = {}) {
    const min = Number(metadata.min);
    const max = Number(metadata.max);
    const range = max - min;
    if (!Number.isFinite(range) || range <= 0) {
      return 0;
    }
    const bounded = metadata.wraparound
      ? this.wrapValue(Number(value) || 0, min, max)
      : this.clampValue(Number(value) || 0, min, max);
    const normalizedValue = this.clampValue((bounded - min) / range, 0, 1);
    return this.clampValue(normalizedValue ** (1 / this.parameterSkewExponent(metadata)), 0, 1);
  }

  normalizedSignalToParameterValue(signal, metadata = {}) {
    const min = Number(metadata.min);
    const max = Number(metadata.max);
    const range = max - min;
    if (!Number.isFinite(range) || range <= 0) {
      return Number.isFinite(min) ? min : 0;
    }
    const normalizedSignal = metadata.wraparound
      ? this.wrapValue(Number(signal) || 0, 0, 1)
      : this.clampValue(Number(signal) || 0, 0, 1);
    const normalizedValue = normalizedSignal ** this.parameterSkewExponent(metadata);
    return this.applyParameterBounds(min + range * normalizedValue, metadata);
  }

  applyParameterModulation(base, modulationSignal, metadata = {}) {
    if (metadata?.kind === "frequency" && metadata.nonlinearSlider) {
      const baseFrequency = Math.max(0.000001, Number(base) || 0.000001);
      const octaves = (Number(modulationSignal) || 0) / 0.1;
      return this.applyParameterBounds(baseFrequency * (2 ** octaves), metadata);
    }
    const baseSignal = this.parameterValueToNormalizedSignal(base, metadata);
    return this.normalizedSignalToParameterValue(baseSignal + modulationSignal, metadata);
  }

  readRuntimePortOutput(frameValues, nodeId, port = "Out", frame = 0, frames = 1) {
    const node = this.nodes.get(nodeId);
    if (!this.parameterOutputExists(node, port)) {
      return this.readRuntimeOutput(frameValues, nodeId, port);
    }
    const value = this.readSmoothedParameter(node, port, 0, frame, frames);
    return this.normalizeParameterOutputValue(value, node?.paramMeta?.[port] || {});
  }

  readEffectiveParameter(node, key, fallback, frame, frames, frameValues) {
    const base = this.readSmoothedParameter(node, key, fallback, frame, frames);
    const metadata = node?.paramMeta?.[key] || {};
    const modulations = this.modulationConnections.get(this.parameterKey(node?.id, key)) || [];
    const min = Number(metadata.min);
    const max = Number(metadata.max);
    const hasMetadataRange = Number.isFinite(min) && Number.isFinite(max) && max > min;
    if (!hasMetadataRange && !modulations.length) {
      return base;
    }
    const modulationSignal = modulations.reduce(
      (sum, modulation) => sum + this.normalizeParameterModulationInput(this.readRuntimePortOutput(
        frameValues,
        modulation.sourceNode,
        modulation.sourcePort,
        frame,
        frames,
      ), metadata),
      0,
    );
    if (!hasMetadataRange) {
      return base + modulationSignal;
    }
    return this.applyParameterModulation(base, modulationSignal, metadata);
  }

  phaseRadians(value) {
    return this.wrapValue(Number(value) || 0, 0, 1) * Math.PI * 2;
  }

  nextNoiseSample(nodeId) {
    const seed = (Math.imul(1664525, this.noiseSeeds.get(nodeId) || 0x12345678) + 1013904223) >>> 0;
    this.noiseSeeds.set(nodeId, seed);
    return (seed / 0xffffffff) * 2 - 1;
  }

  currentNoiseSample(nodeId) {
    if (!this.noiseSeeds.has(nodeId)) {
      return this.nextNoiseSample(nodeId);
    }
    return ((this.noiseSeeds.get(nodeId) || 0) / 0xffffffff) * 2 - 1;
  }

  noiseSeedKey(nodeId, seedValue, channel = "") {
    const seed = Math.max(0, Math.min(99999, Math.floor(Number(seedValue) || 0)));
    return `${nodeId}${channel ? `:${channel}` : ""}:seed:${seed}`;
  }

  polyBlep(phaseCycle, phaseIncrement) {
    const dt = this.clampValue(Math.abs(Number(phaseIncrement) || 0), 1e-6, 0.5);
    if (phaseCycle < dt) {
      const t = phaseCycle / dt;
      return t + t - t * t - 1;
    }
    if (phaseCycle > 1 - dt) {
      const t = (phaseCycle - 1) / dt;
      return t * t + t + t + 1;
    }
    return 0;
  }

  polyBlepSquare(phaseCycle, phaseIncrement) {
    let value = phaseCycle < 0.5 ? 1 : -1;
    value += this.polyBlep(phaseCycle, phaseIncrement);
    value -= this.polyBlep(this.wrapValue(phaseCycle + 0.5, 0, 1), phaseIncrement);
    return value;
  }

  oscillatorSample(nodeId, phase, phaseIncrement, waveform) {
    const phaseDelta = Number(phaseIncrement) || 0;
    const phaseStopped = Math.abs(phaseDelta) <= 1e-12;
    if (phaseStopped && this.oscillatorStoppedSamples.has(nodeId)) {
      return this.oscillatorStoppedSamples.get(nodeId) || 0;
    }
    const renderPhaseIncrement = phaseStopped
      ? Number(this.oscillatorLastPhaseIncrements.get(nodeId)) || 0
      : phaseDelta;
    const phaseCycle = this.wrapValue(phase / (Math.PI * 2), 0, 1);
    let sample = 0;
    switch (Math.round(Number(waveform) || 0)) {
      case 1:
        sample = -1 + phaseCycle * 2 - this.polyBlep(phaseCycle, renderPhaseIncrement);
        break;
      case 2:
        sample = this.polyBlepSquare(phaseCycle, renderPhaseIncrement);
        break;
      case 3:
        {
          const triangle = this.triangleStates.get(nodeId) || 0;
          if (phaseStopped) {
            sample = triangle;
            break;
          }
          const nextTriangle = (triangle + this.polyBlepSquare(phaseCycle, renderPhaseIncrement) * phaseDelta * 4) * 0.995;
          this.triangleStates.set(nodeId, this.clampValue(nextTriangle, -1, 1));
          sample = this.clampValue(nextTriangle, -1, 1);
          break;
        }
      case 4:
        sample = Math.sin(phase);
        break;
      case 5:
        sample = phaseStopped ? this.currentNoiseSample(nodeId) : this.nextNoiseSample(nodeId);
        break;
      case 0:
      default:
        sample = 1 - phaseCycle * 2 + this.polyBlep(phaseCycle, renderPhaseIncrement);
        break;
    }
    if (phaseStopped) {
      this.oscillatorStoppedSamples.set(nodeId, sample);
    } else {
      this.oscillatorStoppedSamples.delete(nodeId);
      this.oscillatorLastPhaseIncrements.set(nodeId, phaseDelta);
    }
    return sample;
  }

  forwardBackwardPolyBlepOscillatorSample(nodeId, phase, phaseIncrement, waveform) {
    return this.oscillatorSample(nodeId, phase, phaseIncrement, waveform);
  }

  polyBlepNativeVectorSample(state, phase, phaseIncrement, waveform, level, resetEdge) {
    if (!this.nativePolyBlepReady) {
      return null;
    }
    try {
      if (!state.nativeHandle) {
        state.nativeHandle = this.nativePolyBlep.soemdsp_polyblep_create();
      }
      if (!state.nativeHandle) {
        return null;
      }
      if (resetEdge) {
        this.nativePolyBlep.soemdsp_polyblep_reset(state.nativeHandle);
      }
      this.nativePolyBlep.soemdsp_polyblep_sample(
        state.nativeHandle,
        Number(phase) || 0,
        Number(phaseIncrement) || 0,
        Math.round(Number(waveform) || 0),
        Number(level) || 0,
      );
      return {
        out: this.safeFilterNumber(this.nativePolyBlep.soemdsp_polyblep_out(state.nativeHandle), null),
        saw: this.safeFilterNumber(this.nativePolyBlep.soemdsp_polyblep_saw(state.nativeHandle), null),
        ramp: this.safeFilterNumber(this.nativePolyBlep.soemdsp_polyblep_ramp(state.nativeHandle), null),
        square: this.safeFilterNumber(this.nativePolyBlep.soemdsp_polyblep_square(state.nativeHandle), null),
        tri: this.safeFilterNumber(this.nativePolyBlep.soemdsp_polyblep_tri(state.nativeHandle), null),
        sine: this.safeFilterNumber(this.nativePolyBlep.soemdsp_polyblep_sine(state.nativeHandle), null),
      };
    } catch (error) {
      this.nativePolyBlepReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "polyblep",
        status: "disabled",
        message: String(error?.message || error || "native PolyBLEP failed"),
      });
      return null;
    }
  }

  ellipsoidSample(phase, offset = 0, shape = 0, scale = 1) {
    const phaseRadians = Number(phase) || 0;
    const sinPhase = Math.sin(phaseRadians);
    const cosPhase = Math.cos(phaseRadians);
    const shapeRadians = (Number(shape) || 0) * Math.PI;
    const shapeSin = Math.sin(shapeRadians);
    const shapeCos = Math.cos(shapeRadians);
    const safeOffset = this.clampValue(Number(offset) || 0, -1, 1);
    const safeScale = Math.max(0, Number(scale) || 0);
    const x = safeOffset + cosPhase;
    const y = safeScale * sinPhase;
    const denominator = Math.sqrt((x * x) + (y * y));
    if (denominator <= 1e-12) {
      return 0;
    }
    return this.clampValue(((x * shapeCos) + (y * shapeSin)) / denominator, -1, 1);
  }

  ellipsoidVectorSample(
    target,
    phase,
    levelValue = 1,
    offsetX = 0,
    offsetY = 0,
    scaleX = 1,
    scaleY = 1,
    shapeX = 0,
    shapeY = 0,
  ) {
    const level = Number(levelValue) || 0;
    const x = this.ellipsoidSample(phase, offsetX, shapeX, scaleX) * level;
    const y = this.ellipsoidSample(phase - Math.PI * 0.5, offsetY, shapeY, scaleY) * level;
    const output = target || {};
    output.Out = x;
    output.Mono = x;
    output.X = x;
    output.Y = y;
    output.Wave = x;
    output["Wave Out"] = x;
    return output;
  }

  nativeEllipsoidVectorSample(
    target,
    phase,
    levelValue = 1,
    offsetX = 0,
    offsetY = 0,
    scaleX = 1,
    scaleY = 1,
    shapeX = 0,
    shapeY = 0,
  ) {
    const native = this.nativeEllipsoidReady ? this.nativeEllipsoid : null;
    if (!native?.soemdsp_ellipsoid_vector_sample) {
      return this.ellipsoidVectorSample(
        target,
        phase,
        levelValue,
        offsetX,
        offsetY,
        scaleX,
        scaleY,
        shapeX,
        shapeY,
      );
    }
    native.soemdsp_ellipsoid_vector_sample(
      Number(phase) || 0,
      Number(levelValue) || 0,
      Number(offsetX) || 0,
      Number(offsetY) || 0,
      Number(scaleX) || 0,
      Number(scaleY) || 0,
      Number(shapeX) || 0,
      Number(shapeY) || 0,
    );
    const x = this.clampValue(Number(native.soemdsp_ellipsoid_x?.()) || 0, -1, 1);
    const y = this.clampValue(Number(native.soemdsp_ellipsoid_y?.()) || 0, -1, 1);
    const output = target || {};
    output.Out = x;
    output.Mono = x;
    output.X = x;
    output.Y = y;
    output.Wave = x;
    output["Wave Out"] = x;
    return output;
  }

  additiveWaveformHarmonic(waveform, harmonic, modA = 0.5) {
    const n = Math.max(1, Math.floor(Number(harmonic) || 1));
    const h = n;
    const mod = this.clampValue(Number(modA) || 0, 0, 1);
    switch (Math.round(Number(waveform) || 0)) {
      case 0:
        return { amplitude: n === Math.max(1, Math.floor(99 * mod + 1)) ? 1 : 0, phase: 0 };
      case 2:
        return { amplitude: n % 2 === 1 ? 1 / h : 0, phase: mod * 0.5 };
      case 3:
        return { amplitude: n % 2 === 1 ? 1 / (h * h) : 0, phase: n % 4 === 1 ? 0 : 0.5 };
      case 4:
        return { amplitude: n % 2 === 1 ? 1 / h : (1 / h) * (1 - mod), phase: 0 };
      case 5:
        return { amplitude: Math.cos(h * mod * 0.5) / h, phase: 0 };
      case 6:
        {
          const peak = this.clampValue(mod, 0.001, 0.999);
          return { amplitude: (Math.sin(0.5 * h * peak) / (peak * (1 - peak) * h * h)) * 0.2, phase: 0 };
        }
      case 7:
        {
          const octaves = Math.max(2, Math.floor(2 + mod * 11));
          let target = 1;
          while (target < n) {
            target *= octaves;
          }
          return { amplitude: target === n ? 1 / h : 0, phase: 0 };
        }
      case 1:
      default:
        return { amplitude: 1 / h, phase: n % 2 === 1 ? 0.5 : 0 };
    }
  }

  additiveDampingCurveValue(value = 0) {
    return this.clampValue(Number(value) || 0, 0, 1);
  }

  additiveDampingAlgorithmValue(value = 0) {
    return Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
  }

  additiveFilterFrequencyValue(value = 20000, rate = this.engineSampleRate || sampleRate || 44100) {
    const nyquist = Math.max(1, (Number(rate) || this.engineSampleRate || sampleRate || 44100) * 0.5);
    return this.clampValue(Number(value) || 20000, 1, nyquist);
  }

  rationalCurveValue(value = 0, skew = 0) {
    const t = this.clampValue(Number(value) || 0, 0, 1);
    if (t <= 0) {
      return 0;
    }
    if (t >= 1) {
      return 1;
    }
    const safeSkew = this.clampValue(Number(skew) || 0, -0.999999, 0.999999);
    return this.clampValue(
      ((1 + safeSkew) * t) / (1 - safeSkew + 2 * safeSkew * t),
      0,
      1,
    );
  }

  additiveHarmonicDamping(harmonic, frequency, rate, curveValue = 0, algorithm = 0, filterFrequency = 20000) {
    const safeRate = Math.max(1, Number(rate) || this.engineSampleRate || sampleRate || 44100);
    const safeFrequency = Math.max(0, Number(frequency) || 0);
    const safeFilterFrequency = this.additiveFilterFrequencyValue(filterFrequency, safeRate);
    if (safeFilterFrequency <= 0 || safeFrequency <= 0) {
      return 1;
    }
    const ratio = this.clampValue((Math.max(1, Number(harmonic) || 1) * safeFrequency) / safeFilterFrequency, 0, 1);
    return this.additiveDampingAmplitude({
      algorithm,
      curveValue,
      harmonic,
      maxHarmonics: Math.max(1, Math.floor(safeFilterFrequency / Math.max(1, safeFrequency))),
      ratio,
    });
  }

  additiveDampingAmplitude({
    algorithm = 0,
    curveValue = 0,
    harmonic = 1,
    maxHarmonics = 1,
    ratio = 0,
  } = {}) {
    const curve = this.additiveDampingCurveValue(curveValue);
    const mode = this.additiveDampingAlgorithmValue(algorithm);
    const t = this.clampValue(Number(ratio) || 0, 0, 1);
    if (t <= 0) {
      return 1;
    }
    if (t >= 1) {
      return 0;
    }
    if (mode === 1) {
      return this.clampValue((1 - t) ** (1 + curve * 7), 0, 1);
    }
    if (mode === 2) {
      const amount = 0.5 + curve * 12;
      const end = Math.exp(-amount);
      return this.clampValue((Math.exp(-t * amount) - end) / Math.max(0.0001, 1 - end), 0, 1);
    }
    if (mode === 3) {
      const cutoff = this.clampValue(0.95 - curve * 0.82, 0.08, 0.95);
      const order = 1 + Math.round(curve * 5);
      const raw = 1 / Math.sqrt(1 + (t / cutoff) ** (2 * order));
      const end = 1 / Math.sqrt(1 + (1 / cutoff) ** (2 * order));
      return this.clampValue((raw - end) / Math.max(0.0001, 1 - end), 0, 1);
    }
    if (mode === 4) {
      const knee = this.clampValue(0.78 - curve * 0.68, 0.04, 0.78);
      if (t <= knee) {
        return 1;
      }
      const local = (t - knee) / Math.max(0.0001, 1 - knee);
      return this.clampValue((1 - local) ** (1 + curve * 7), 0, 1);
    }
    if (mode === 5) {
      const tilt = curve * 4;
      if (tilt <= 0) {
        return 1 - t;
      }
      const h = Math.max(1, Number(harmonic) || 1);
      const maxH = Math.max(h, Number(maxHarmonics) || h);
      const raw = 1 / (h ** tilt);
      const end = 1 / (maxH ** tilt);
      return this.clampValue((raw - end) / Math.max(0.0001, 1 - end), 0, 1);
    }
    return this.clampValue(1 - this.rationalCurveValue(t, curve), 0, 1);
  }

  additiveHarmonicCurveAmount({
    algorithm = 0,
    curveValue = 0,
    harmonic = 1,
    maxHarmonics = 1,
    ratio = 0,
  } = {}) {
    return this.clampValue(1 - this.additiveDampingAmplitude({
      algorithm,
      curveValue,
      harmonic,
      maxHarmonics,
      ratio,
    }), 0, 1);
  }

  additiveOscillatorSample(phase, params = {}, rate = this.engineSampleRate || sampleRate) {
    const safeRate = Math.max(1, Number(rate) || this.engineSampleRate || sampleRate || 44100);
    const frequency = Math.max(0, Number(params.frequency) || 0);
    const maxHarmonics = Math.max(
      1,
      Math.min(nodeLiveAdditiveHardMaxHarmonics, Math.round(Number(params.harmonics) || 32)),
    );
    const waveform = Math.round(Number(params.waveform) || 0);
    const modA = this.clampValue(Number(params.modA) || 0, 0, 1);
    const harmonicPhaseAdd = this.clampValue(Number(params.harmonicPhaseAdd) || 0, 0, 1);
    const harmonicPhaseMultiply = this.clampValue(Number(params.harmonicPhaseMultiply) || 0, 0, 4);
    const level = this.clampValue(Number(params.level) || 0, 0, 1);
    const dampingFilterFrequency = this.additiveFilterFrequencyValue(params.dampingFilterFrequency, safeRate);
    const dampingGraphValueAt = typeof params.dampingGraphValueAt === "function"
      ? params.dampingGraphValueAt
      : () => 1;
    const phaseGraphValueAt = typeof params.phaseGraphValueAt === "function"
      ? params.phaseGraphValueAt
      : () => 0;
    const harmonicLimit = Math.max(1, Math.min(maxHarmonics, Math.floor(Math.min(20000, safeRate * 0.45) / Math.max(1, frequency))));
    let total = 0;
    let norm = 0;
    for (let harmonic = 1; harmonic <= harmonicLimit; harmonic += 1) {
      const partial = this.additiveWaveformHarmonic(waveform, harmonic, modA);
      const dampingX = this.clampValue((frequency * harmonic) / dampingFilterFrequency, 0, 1);
      const amplitude = (Number(partial.amplitude) || 0) *
        this.clampValue(Number(dampingGraphValueAt(dampingX)) || 0, 0, 1);
      if (amplitude === 0) {
        continue;
      }
      const harmonicRatio = harmonicLimit > 1
        ? (harmonic - 1) / (harmonicLimit - 1)
        : 0;
      const phaseCurve = this.clampValue(Number(phaseGraphValueAt(harmonicRatio)) || 0, 0, 1);
      const phaseMultiplier = 1 + phaseCurve * harmonicPhaseMultiply;
      const phaseOffset = (Number(partial.phase) || 0) + phaseCurve * harmonicPhaseAdd;
      total += Math.sin((phase * harmonic * phaseMultiplier) + phaseOffset * Math.PI * 2) * amplitude;
      norm += Math.abs(amplitude);
    }
    if (norm <= 0) {
      return 0;
    }
    return this.clampValue((total / Math.max(1, norm * 0.72)) * level, -1, 1);
  }

  createHighpassState() {
    return {
      inputBuffer: 0,
      outputBuffer: 0,
    };
  }

  createLowpassState() {
    return {
      outputBuffer: 0,
    };
  }

  createCookbookFilterState() {
    return {
      lastStages: 2,
      x1: [0, 0, 0, 0, 0],
      x2: [0, 0, 0, 0, 0],
      y1: [0, 0, 0, 0, 0],
      y2: [0, 0, 0, 0, 0],
    };
  }

  createLadderFilterState() {
    return { y: [0, 0, 0, 0, 0], nativeHandle: 0 };
  }

  resetCookbookFilterState(state) {
    for (const key of ["x1", "x2", "y1", "y2"]) {
      if (Array.isArray(state?.[key])) {
        state[key].fill(0);
      }
    }
  }

  createOscResetState() {
    return {
      lastReset: 0,
    };
  }

  createGraphLfoState() {
    return {
      lastReset: 0,
      resetFrame: 0,
    };
  }

  createSlewLimiterState() {
    return {
      initialized: false,
      out: 0,
    };
  }

  createClockState() {
    return {
      hasStarted: false,
      phase: 0,
    };
  }

  createRandomClockState() {
    return {
      intervalSamples: 0,
      lastReset: 0,
      phaseSamples: 0,
      randomState: 0,
      remainingTriggerSamples: 0,
      seedKey: "",
    };
  }

  createDelayedTriggerState() {
    return {
      hasTriggered: true,
      lastReset: 0,
      lastTrigger: 0,
      remainingSamples: 0,
      running: false,
      waitSamples: 0,
    };
  }

  createPatchCommandState() {
    return {
      lastTrigger: 0,
    };
  }

  createDelayEffectState() {
    return {
      buffer: new Float32Array(1),
      bufferSize: 1,
      lfoPhase: 0,
      lfoVariationState: 0,
      position: 0,
      wet: 0,
    };
  }

  createSampleHoldState() {
    return {
      clockPhase: 0,
      held: 0,
      lastTrigger: 0,
      noise: this.createNoiseGeneratorChannelState(),
    };
  }

  createSamplePlaybackState() {
    return {
      lastReset: 0,
      phase: 0,
      playing: false,
      rangeKey: "",
      sampleId: "",
    };
  }

  createStepSequencerState() {
    return {
      gate: 0,
      index: 0,
      lastReset: 0,
      lastTrigger: 0,
      out: 0,
    };
  }

  createTriggerCounterState() {
    return {
      count: 0,
      lastReset: 0,
      lastTrigger: 0,
      remainingSamples: 0,
    };
  }

  createTriggerDividerState() {
    return {
      count: 0,
      lastReset: 0,
      lastTrigger: 0,
      remainingSamples: 0,
    };
  }

  createExpAdsrState() {
    return {
      lastGate: 0,
      out: 0,
      secondsPassed: 0,
      state: "off",
    };
  }

  createLinearEnvelopeState() {
    return {
      lastGate: 0,
      out: 0,
      releaseDecrement: 0,
      secondsPassed: 0,
      state: "off",
    };
  }

  createPluckEnvelopeState() {
    return {
      autoReleasePhasor: 0,
      currentValue: 0,
      decayIncrement: 0,
      lastRelease: 0,
      lastTrigger: 0,
      phasor: 0,
      releaseIncrement: 0,
      secondsPassed: 0,
      state: "off",
    };
  }

  createVactrolEnvelopeState() {
    return {
      nativeHandle: 0,
      out: 0,
      raw: 0,
    };
  }

  createPolyBlepState() {
    return {
      nativeHandle: 0,
    };
  }

  createFlowerChildEnvelopeFollowerState() {
    return {
      currentSlewedValue: 0,
      holdCounter: 0,
      out: 0,
    };
  }

  createNoiseGeneratorChannelState() {
    return { brown: 0, gaussianSpare: null, pink: [0, 0, 0, 0, 0, 0, 0], seed: 0, seedKey: "" };
  }

  createNoiseGeneratorState() {
    return { left: this.createNoiseGeneratorChannelState(), nativeHandle: 0, right: this.createNoiseGeneratorChannelState() };
  }

  destroyNoiseGeneratorNativeState(state) {
    if (state.nativeHandle && this.nativeNoiseGenerator?.soemdsp_noise_generator_destroy) {
      this.nativeNoiseGenerator.soemdsp_noise_generator_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyFbmNativeState(state) {
    if (state.nativeHandle && this.nativeFbm?.soemdsp_fbm_destroy) {
      this.nativeFbm.soemdsp_fbm_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyLadderFilterNativeState(state) {
    if (state.nativeHandle && this.nativeLadderFilter?.soemdsp_ladder_filter_destroy) {
      this.nativeLadderFilter.soemdsp_ladder_filter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyTb303FilterNativeState(state) {
    if (state.nativeHandle && this.nativeTb303Filter?.soemdsp_tb303_filter_destroy) {
      this.nativeTb303Filter.soemdsp_tb303_filter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  createTb303FilterState() {
    return { nativeHandle: 0 };
  }

  destroyPassiveFilterNativeState(state) {
    if (state?.nativeHandle && this.nativePassiveFilter?.soemdsp_passive_filter_destroy) {
      this.nativePassiveFilter.soemdsp_passive_filter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  createPassiveFilterState() {
    return { nativeHandle: 0 };
  }

  passiveFilterSample(state, input, mode, lowFrequency, highFrequency, rate) {
    if (!this.nativePassiveFilterReady) {
      throw new Error("native Passive Filter not ready");
    }
    if (!state.nativeHandle) {
      state.nativeHandle = this.nativePassiveFilter.soemdsp_passive_filter_create();
    }
    if (!state.nativeHandle) {
      throw new Error("native Passive Filter failed to create instance");
    }
    return this.safeFilterNumber(
      this.nativePassiveFilter.soemdsp_passive_filter_sample(
        state.nativeHandle,
        this.safeFilterNumber(input, state),
        Math.round(Number(mode)) || 0,
        Number(lowFrequency) || 0,
        Number(highFrequency) || 0,
        Math.max(1, Number(rate) || sampleRate || 44100),
      ),
      state,
    );
  }

  createRandomWalkState() {
    return {
      lowpass: this.createLowpassState(),
      out: 0,
      seed: 0,
      seedKey: "",
    };
  }

  createFractalBrownianNoiseState() {
    return { axes: {}, nativeHandle: 0, resetWasHigh: false };
  }

  resetFractalBrownianNoiseState(state) {
    for (const axisState of Object.values(state.axes || {})) {
      axisState.time = 0;
    }
    if (state.nativeHandle && this.nativeFbm?.soemdsp_fbm_reset) {
      this.nativeFbm.soemdsp_fbm_reset(state.nativeHandle);
    }
  }

  safeFilterNumber(value, state) {
    const number = Number(value);
    const reason = this.badValueReason(number);
    if (!reason) {
      return number;
    }
    if (state) {
      state.inputBuffer = 0;
      state.outputBuffer = 0;
    }
    this.badNumberCount += 1;
    if (!this.lastBadValueNodeId) {
      this.lastBadValueReason = reason;
      this.lastBadValueSource = "";
    }
    return 0;
  }

  validCodeblockIdentifier(name) {
    const value = String(name || "").trim();
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) &&
      !new Set([
        "__context",
        "__ctx",
        "__inputs",
        "__outputs",
        "__state",
        "arguments",
        "await",
        "break",
        "case",
        "catch",
        "class",
        "const",
        "continue",
        "debugger",
        "default",
        "delete",
        "do",
        "document",
        "else",
        "eval",
        "export",
        "extends",
        "false",
        "fetch",
        "finally",
        "frame",
        "frames",
        "for",
        "Function",
        "globalThis",
        "if",
        "import",
        "in",
        "instanceof",
        "let",
        "new",
        "null",
        "return",
        "sampleRate",
        "self",
        "super",
        "switch",
        "state",
        "this",
        "throw",
        "time",
        "true",
        "try",
        "typeof",
        "var",
        "void",
        "while",
        "window",
        "with",
        "yield",
        "dt",
      ]).has(value);
  }

  normalizeCodeblockPortList(value, fallbackPrefix = "In") {
    const raw = Array.isArray(value)
      ? value
      : String(value ?? "").split(/[\s,]+/);
    const ports = [];
    const seen = new Set();
    for (const item of raw) {
      const name = String(item || "").trim();
      if (!this.validCodeblockIdentifier(name) || seen.has(name)) {
        continue;
      }
      seen.add(name);
      ports.push(name.slice(0, 32));
    }
    if (!ports.length) {
      ports.push(`${fallbackPrefix}1`);
    }
    return ports;
  }

  normalizeCodeblock(value = {}) {
    const source = value && typeof value === "object" ? value : {};
    const inputs = this.normalizeCodeblockPortList(source.inputs, "In");
    const reserved = new Set(inputs);
    const outputs = this.normalizeCodeblockPortList(source.outputs, "Out")
      .filter((port) => !reserved.has(port));
    if (!outputs.length) {
      let index = 1;
      let name = "Out1";
      while (reserved.has(name)) {
        index += 1;
        name = `Out${index}`;
      }
      outputs.push(name);
    }
    return {
      code: String(source.code ?? "Out1 = In1;"),
      inputs,
      outputs,
    };
  }

  codeblockFunctionBody(codeblock) {
    const shadows = ["window", "document", "fetch", "Function", "globalThis", "self"]
      .map((name) => `const ${name} = undefined;`)
      .join("\n");
    const context = [
      "const state = __state;",
      "const __ctx = __context || {};",
      "const sampleRate = Number(__ctx.sampleRate) || 44100;",
      "const frame = Number(__ctx.frame) || 0;",
      "const frames = Number(__ctx.frames) || 1;",
      "const time = Number(__ctx.time) || 0;",
      "const dt = 1 / sampleRate;",
    ].join("\n");
    const inputs = codeblock.inputs
      .map((port, index) => `const ${port} = __inputs[${index}] || 0;`)
      .join("\n");
    const outputs = codeblock.outputs.map((port) => `let ${port} = 0;`).join("\n");
    const writes = codeblock.outputs
      .map((port) => `__outputs[${JSON.stringify(port)}] = ${port};`)
      .join("\n");
    return `"use strict";\n${shadows}\n${context}\n${inputs}\n${outputs}\n${codeblock.code}\n${writes}\nreturn __outputs;`;
  }

  codeblockCacheKey(codeblock) {
    return `${codeblock.inputs.join(",")}=>${codeblock.outputs.join(",")}::${codeblock.code}`;
  }

  markCodeblockError(nodeId, reason, source) {
    this.badNumberCount += 1;
    this.lastBadValueReason = reason;
    this.lastBadValueNodeId = nodeId || "";
    this.lastBadValueSource = source || "codeblock";
  }

  safeCodeblockNumber(value, nodeId, port) {
    const number = Number(value);
    const reason = this.badValueReason(number);
    if (!reason) {
      return number;
    }
    this.markCodeblockError(nodeId, reason, `codeblock ${port} output`);
    return 0;
  }

  createCodeblockOutputObject(codeblock) {
    const output = {};
    for (const port of codeblock.outputs) {
      output[port] = 0;
    }
    return output;
  }

  compileCodeblockFunction(node) {
    const codeblock = this.normalizeCodeblock(node.codeblock);
    const key = this.codeblockCacheKey(codeblock);
    const cached = this.codeblockFunctions.get(node.id);
    if (cached?.key === key) {
      return cached;
    }
    const fn = Function(
      "__inputs",
      "__outputs",
      "__state",
      "__context",
      this.codeblockFunctionBody(codeblock),
    );
    const compiled = {
      codeblock,
      fn,
      inputs: new Array(codeblock.inputs.length).fill(0),
      key,
      output: this.createCodeblockOutputObject(codeblock),
      state: Object.create(null),
    };
    this.codeblockFunctions.set(node.id, compiled);
    return compiled;
  }

  evaluateCodeblock(node, mixInput, frame = 0, frames = 1, sampleRate = this.engineSampleRate || 44100, inputFrame = frame) {
    let compiled = null;
    try {
      compiled = this.compileCodeblockFunction(node);
    } catch (error) {
      this.markCodeblockError(node.id, "compile error", `codeblock ${error?.message || ""}`);
      return {};
    }
    const { codeblock, fn, inputs, output, state } = compiled;
    try {
      for (let index = 0; index < codeblock.inputs.length; index += 1) {
        inputs[index] = this.safeFilterNumber(mixInput(node.id, codeblock.inputs[index]), null);
      }
      for (const port of codeblock.outputs) {
        output[port] = 0;
      }
      fn(inputs, output, state, {
        frame,
        frames,
        sampleRate,
        time: (Number(inputFrame) || 0) / (Number(sampleRate) || 44100),
      });
      for (const port of codeblock.outputs) {
        output[port] = this.safeCodeblockNumber(output[port], node.id, port);
      }
      return output;
    } catch (error) {
      this.markCodeblockError(node.id, "runtime error", `codeblock ${error?.message || ""}`);
      for (const port of codeblock.outputs) {
        output[port] = 0;
      }
      return output;
    }
  }

  createNestedRuntime(plan) {
    const runtime = Object.create(NodeLiveAudioProcessor.prototype);
    runtime.inputConnections = new Map();
    runtime.autoSmoothingSeconds = this.autoSmoothingSeconds;
    runtime.badNumberCount = 0;
    runtime.lastBadValueReason = "";
    runtime.lastBadValueNodeId = "";
    runtime.lastBadValueSource = "";
    runtime.inputMeterPeak = 0;
    runtime.inputMeterSamples = 0;
    runtime.inputMeterSquareSum = 0;
    runtime.meterClipCount = 0;
    runtime.meterCounter = 0;
    runtime.meterPeak = 0;
    runtime.meterProtectionMuteCount = 0;
    runtime.meterSamples = 0;
    runtime.meterSquareSum = 0;
    runtime.macroControls = this.macroControls;
    runtime.pitchModWheelSignal = this.pitchModWheelSignal;
    runtime.externalButtonEvents = this.externalButtonEvents;
    runtime.wireBreakEvent = this.wireBreakEvent;
    runtime.wireConnectEvent = this.wireConnectEvent;
    runtime.wireDisconnectEvent = this.wireDisconnectEvent;
    runtime.windowReopenEvent = this.windowReopenEvent;
    runtime.shootingStarExplosionEvent = this.shootingStarExplosionEvent;
    runtime.midiKeyboardGatePulseSamples = 0;
    runtime.midiKeyboardSignal = null;
    runtime.moduleGroupRuntimes = new Map();
    runtime.modulationConnections = new Map();
    runtime.nodeOutputs = new Map();
    runtime.nodes = new Map();
    runtime.nativeEllipsoid = this.nativeEllipsoid;
    runtime.nativeEllipsoidReady = this.nativeEllipsoidReady;
    runtime.nativeSabrinaReverb = this.nativeSabrinaReverb;
    runtime.nativeSabrinaReverbReady = this.nativeSabrinaReverbReady;
    runtime.nativePll = this.nativePll;
    runtime.nativePllReady = this.nativePllReady;
    runtime.nativeHelmholtz = this.nativeHelmholtz;
    runtime.nativeHelmholtzReady = this.nativeHelmholtzReady;
    runtime.noiseSeedKeys = new Map();
    runtime.noiseSeeds = new Map();
    runtime.order = [];
    runtime.engineSampleRate = this.engineSampleRate;
    runtime.hostSampleRate = this.hostSampleRate;
    runtime.oversamplingRatio = this.oversamplingRatio;
    runtime.passiveFilterStates = new Map();
    runtime.clockDividerStates = new Map();
    runtime.clockStates = new Map();
    runtime.codeblockFunctions = new Map();
    runtime.cookbookFilterStates = new Map();
    runtime.delayedTriggerStates = new Map();
    runtime.delayEffectStates = new Map();
    runtime.expAdsrStates = new Map();
    runtime.fractalBrownianNoiseStates = new Map();
    runtime.flowerChildEnvelopeFollowerStates = new Map();
    runtime.graphInputConnections = new Map();
    runtime.ladderFilterStates = new Map();
    runtime.linearEnvelopeStates = new Map();
    runtime.noiseGeneratorStates = new Map();
    runtime.oscResetStates = new Map();
    runtime.graphLfoStates = new Map();
    runtime.outputNode = plan?.outputNode || "output";
    runtime.patchFingerprint = plan?.patchFingerprint || "";
    runtime.patchCommandStates = new Map();
    runtime.phases = new Map();
    runtime.pluckEnvelopeStates = new Map();
    runtime.planSerial = 0;
    runtime.randomClockStates = new Map();
    runtime.reverbEffectStates = new Map();
    runtime.sampleHoldStates = new Map();
    runtime.samplePlaybackStates = new Map();
    runtime.samples = this.samples;
    runtime.randomWalkStates = new Map();
    runtime.sessionId = this.sessionId;
    runtime.scopeBuffers = new Map();
    runtime.scopeCounter = 0;
    runtime.slewLimiterStates = new Map();
    runtime.smoothers = new Map();
    runtime.spiralStates = new Map();
    runtime.lorenzAttractorStates = new Map();
    runtime.logisticMapStates = new Map();
    runtime.henonMapStates = new Map();
    runtime.chuaAttractorStates = new Map();
    runtime.chordMemoryStates = new Map();
    runtime.turingMachineStates = new Map();
    runtime.pitchQuantizerStates = new Map();
    runtime.surgeOscillatorStates = new Map();
    runtime.dsfOscillatorStates = new Map();
    runtime.robinSupersawStates = new Map();
    runtime.stepSequencerStates = new Map();
    runtime.triggerCounterStates = new Map();
    runtime.triggerDividerStates = new Map();
    runtime.triangleStates = new Map();
    runtime.vactrolEnvelopeStates = new Map();
    runtime.polyBlepStates = new Map();
    runtime.resetVisualControls();
    runtime.setNestedPlan(plan);
    return runtime;
  }

  setNestedPlan(plan) {
    const nodes = Array.isArray(plan?.nodes) ? plan.nodes : [];
    const ids = new Set(nodes.map((node) => node.id));
    this.nodes = new Map(nodes.map((node) => [node.id, {
      id: node.id,
      codeblock: this.normalizeCodeblock(node.codeblock),
      moduleGroup: node.moduleGroup || null,
      moduleGroupPlan: node.moduleGroupPlan || null,
      paramMeta: node.paramMeta || {},
      params: node.params || {},
      sample: node.sample || null,
      type: node.type,
    }]));
    this.order = Array.isArray(plan?.order) ? [...plan.order] : [...ids];
    this.outputNode = plan?.outputNode || "output";
    this.inputConnections = this.buildInputConnectionMap(plan?.connections, ids);
    this.graphInputConnections = this.buildGraphInputConnectionMap(plan?.graphConnections, ids);
    this.modulationConnections = this.buildModulationConnectionMap(plan?.modulations, ids);
    for (const id of ids) {
      const node = this.nodes.get(id);
      this.nodeOutputs.set(id, 0);
      if (nodeLiveIsPolyBlepOscillatorType(node?.type)) {
        this.phases.set(id, 0);
        this.oscResetStates.set(id, this.createOscResetState());
        this.triangleStates.set(id, 0);
      }
      if (nodeLiveIsPolyBlepOscillatorType(node?.type)) {
        this.noiseSeeds.set(id, this.stableSeed(id));
      }
      if (node?.type === "spiral") this.spiralStates.set(id, this.createSpiralState());
      if (node?.type === "lorenzAttractor") this.lorenzAttractorStates.set(id, this.createLorenzAttractorState());
      if (node?.type === "logisticMap") this.logisticMapStates.set(id, this.createLogisticMapState());
      if (node?.type === "henonMap") this.henonMapStates.set(id, this.createHenonMapState());
      if (node?.type === "chuaAttractor") this.chuaAttractorStates.set(id, this.createChuaAttractorState());
      if (node?.type === "chordMemory") this.chordMemoryStates.set(id, this.createChordMemoryState());
      if (node?.type === "turingMachine") this.turingMachineStates.set(id, this.createTuringMachineState());
      if (node?.type === "pitchQuantizer") this.pitchQuantizerStates.set(id, this.createPitchQuantizerState());
      if (node?.type === "surgeOscillator") this.surgeOscillatorStates.set(id, this.createSurgeOscillatorState());
      if (node?.type === "dsfOscillator") this.dsfOscillatorStates.set(id, this.createDsfOscillatorState());
      if (node?.type === "robinSupersaw") this.robinSupersawStates.set(id, this.createRobinSupersawState());
      if (node?.type === "hypersaw") this.hypersawStates.set(id, this.createHypersawState());
      if (node?.type === "passiveFilter") this.passiveFilterStates.set(id, this.createPassiveFilterState());
      if (node?.type === "cookbookFilter") this.cookbookFilterStates.set(id, this.createCookbookFilterState());
      if (node?.type === "ladderFilter") this.ladderFilterStates.set(id, this.createLadderFilterState());
      if (node?.type === "tb303Filter") this.tb303FilterStates.set(id, this.createTb303FilterState());
      if (node?.type === "clock") this.clockStates.set(id, this.createClockState());
      if (node?.type === "graph" || node?.type === "graph2") this.graphLfoStates.set(id, this.createGraphLfoState());
      if (node?.type === "clockDivider") this.clockDividerStates.set(id, this.createTriggerDividerState());
      if (node?.type === "delayedTrigger") this.delayedTriggerStates.set(id, this.createDelayedTriggerState());
      if (node?.type === "delayEffect") this.delayEffectStates.set(id, this.createDelayEffectState());
      if (node?.type === "reverbEffect") this.reverbEffectStates.set(id, this.createSabrinaReverbState());
      if (node?.type === "pll") this.pllStates.set(id, this.createPllState());
      if (node?.type === "helmholtzPitch") this.helmholtzStates.set(id, this.createHelmholtzState());
      if (node?.type === "randomClock") this.randomClockStates.set(id, this.createRandomClockState());
      if (node?.type === "sampleHold") this.sampleHoldStates.set(id, this.createSampleHoldState());
      if (node?.type === "samplePlayer" || node?.type === "sampleLooper" || node?.type === "audioPlayer") {
        this.samplePlaybackStates.set(id, this.createSamplePlaybackState());
      }
      if (node?.type === "nextPatch" || node?.type === "previousPatch") this.patchCommandStates.set(id, this.createPatchCommandState());
      if (node?.type === "slewLimiter") this.slewLimiterStates.set(id, this.createSlewLimiterState());
      if (node?.type === "expAdsr") this.expAdsrStates.set(id, this.createExpAdsrState());
      if (node?.type === "linearEnvelope") this.linearEnvelopeStates.set(id, this.createLinearEnvelopeState());
      if (node?.type === "noiseGenerator") this.noiseGeneratorStates.set(id, this.createNoiseGeneratorState());
      if (node?.type === "randomWalk") this.randomWalkStates.set(id, this.createRandomWalkState());
      if (node?.type === "fractalBrownianNoise") this.fractalBrownianNoiseStates.set(id, this.createFractalBrownianNoiseState());
      if (node?.type === "flowerChildEnvelopeFollower") this.flowerChildEnvelopeFollowerStates.set(id, this.createFlowerChildEnvelopeFollowerState());
      if (node?.type === "pluckEnvelope") this.pluckEnvelopeStates.set(id, this.createPluckEnvelopeState());
      if (node?.type === "stepSequencer") this.stepSequencerStates.set(id, this.createStepSequencerState());
      if (node?.type === "triggerCounter") this.triggerCounterStates.set(id, this.createTriggerCounterState());
      if (node?.type === "triggerDivider") this.triggerDividerStates.set(id, this.createTriggerDividerState());
      if (node?.type === "vactrolEnvelope" || node?.type === "vactrolEnvelopeC4") this.vactrolEnvelopeStates.set(id, this.createVactrolEnvelopeState());
      if (node?.type === "polyBlep") this.polyBlepStates.set(id, this.createPolyBlepState());
      if (node?.type === "moduleGroup" && node.moduleGroupPlan) {
        this.moduleGroupRuntimes.set(id, this.createNestedRuntime(node.moduleGroupPlan));
      }
      for (const [key, value] of Object.entries(node?.params || {})) {
        this.smoothers.set(this.parameterKey(id, key), this.createSmoother(value, node.paramMeta?.[key]));
      }
    }
  }

  evaluateModuleGroup(node, mixInput, frame, frames, rate, inputFrame) {
    if (!node.moduleGroupPlan) {
      return {};
    }
    let runtime = this.moduleGroupRuntimes.get(node.id);
    if (!runtime) {
      runtime = this.createNestedRuntime(node.moduleGroupPlan);
      this.moduleGroupRuntimes.set(node.id, runtime);
    }
    runtime.engineSampleRate = rate;
    runtime.hostSampleRate = this.hostSampleRate;
    runtime.oversamplingRatio = this.oversamplingRatio;
    runtime.macroControls = this.macroControls;
    runtime.pitchModWheelSignal = this.pitchModWheelSignal;
    runtime.externalButtonEvents = this.externalButtonEvents;
    runtime.wireBreakEvent = this.wireBreakEvent;
    runtime.wireConnectEvent = this.wireConnectEvent;
    runtime.wireDisconnectEvent = this.wireDisconnectEvent;
    runtime.windowReopenEvent = this.windowReopenEvent;
    runtime.shootingStarExplosionEvent = this.shootingStarExplosionEvent;
    runtime.externalGroupInputs = new Map(
      (node.moduleGroup?.inputs || []).map((input) => [input.nodeId, mixInput(node.id, input.name)]),
    );
    const frameOutput = runtime.evaluateFrame(frame, frames, [], rate, inputFrame);
    const output = {};
    for (const endpoint of node.moduleGroup?.outputs || []) {
      output[endpoint.name] = runtime.readRuntimePortOutput(
        frameOutput.frameValues,
        endpoint.nodeId,
        endpoint.port || "Out",
      );
    }
    return output;
  }

  visualControlIntensity(value, nodeId, source = "visual control") {
    const number = Number(value);
    const reason = this.badValueReason(number);
    if (reason) {
      this.badNumberCount += 1;
      if (!this.lastBadValueNodeId) {
        this.lastBadValueReason = reason;
        this.lastBadValueNodeId = nodeId || "";
        this.lastBadValueSource = source;
      }
      return 0;
    }
    return this.clampValue(Math.abs(number), 0, 1);
  }

  visualControlSigned(value, nodeId, source = "visual control") {
    const number = Number(value);
    const reason = this.badValueReason(number);
    if (reason) {
      this.badNumberCount += 1;
      if (!this.lastBadValueNodeId) {
        this.lastBadValueReason = reason;
        this.lastBadValueNodeId = nodeId || "";
        this.lastBadValueSource = source;
      }
      return 0;
    }
    return this.clampValue(number, -1, 1);
  }

  visualHslToRgb(hue, saturation, lightness) {
    const h = ((Number(hue) || 0) % 1 + 1) % 1;
    const s = this.clampValue(Number(saturation) || 0, 0, 1);
    const l = this.clampValue(Number(lightness) || 0, 0, 1);
    if (s <= 0) {
      return [l, l, l];
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (offset) => {
      let t = h + offset;
      if (t < 0) {
        t += 1;
      }
      if (t > 1) {
        t -= 1;
      }
      if (t < 1 / 6) {
        return p + (q - p) * 6 * t;
      }
      if (t < 1 / 2) {
        return q;
      }
      if (t < 2 / 3) {
        return p + (q - p) * (2 / 3 - t) * 6;
      }
      return p;
    };
    return [channel(1 / 3), channel(0), channel(-1 / 3)];
  }

  smoothVisualControl(key, target, rate = sampleRate, seconds = 0.045, min = 0, max = 1) {
    const safeTarget = this.clampValue(Number(target) || 0, min, max);
    const previous = Number(this.visualControlStates.get(key));
    const current = Number.isFinite(previous) ? previous : 0;
    const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
    const time = Math.max(0, Number(seconds) || 0);
    const coefficient = time <= 0 ? 1 : 1 - Math.exp(-1 / Math.max(1, time * safeRate));
    const next = current + (safeTarget - current) * coefficient;
    const cleaned = Math.abs(next) < 0.000001 ? 0 : this.clampValue(next, min, max);
    this.visualControlStates.set(key, cleaned);
    this.visualControls[key] = cleaned;
    return cleaned;
  }

  screenSpaceShaderSample(node, readInput, rate = sampleRate, nodeId = "") {
    const script = node?.screenSpaceShader || {};
    const value = {};
    for (const input of script.visualInputs || []) {
      if (input.mode === "raw") {
        continue;
      }
      const signed = input.mode === "signed";
      const raw = readInput(input.port);
      const target = signed
        ? this.visualControlSigned(raw, nodeId, `screen space shader ${input.port}`)
        : this.visualControlIntensity(raw, nodeId, `screen space shader ${input.port}`);
      value[input.key] = this.smoothVisualControl(
        input.key,
        target,
        rate,
        signed ? 0.045 : 0.025,
        signed ? -1 : 0,
        1,
      );
    }
    return value;
  }

  postVisualControls() {
    this.port.postMessage({
      patchFingerprint: this.patchFingerprint,
      blue: this.clampValue(this.visualControls.blue, 0, 1),
      chromaAlpha: this.clampValue(this.visualControls.chromaAlpha, 0, 1),
      chromaDrift: this.clampValue(this.visualControls.chromaDrift, 0, 1),
      chromaHue: this.clampValue(this.visualControls.chromaHue, 0, 1),
      chromaLightness: this.clampValue(this.visualControls.chromaLightness, 0, 1),
      chromaSaturation: this.clampValue(this.visualControls.chromaSaturation, 0, 1),
      chromaSpread: this.clampValue(this.visualControls.chromaSpread, 0, 1),
      green: this.clampValue(this.visualControls.green, 0, 1),
      red: this.clampValue(this.visualControls.red, 0, 1),
      scopePaused: this.clampValue(this.visualControls.scopePaused, 0, 1),
      scopeTracesOff: this.clampValue(this.visualControls.scopeTracesOff, 0, 1),
      screenDim: this.clampValue(this.visualControls.screenDim, 0, 1),
      screenShake: this.clampValue(this.visualControls.screenShake, 0, 1),
      sessionId: this.sessionId,
      type: "visualControls",
      visualBloom: this.clampValue(this.visualControls.visualBloom, 0, 1),
      visualBrightness: this.clampValue(this.visualControls.visualBrightness, 0, 1),
      visualGlow: this.clampValue(this.visualControls.visualGlow, 0, 1),
      x: this.clampValue(this.visualControls.x, -1, 1),
      y: this.clampValue(this.visualControls.y, -1, 1),
    });
  }

  sampleChannelAt(sample, channelIndex, frameIndex) {
    const channel = sample?.channelData?.[channelIndex] || sample?.samples;
    if (!channel?.length) {
      return 0;
    }
    const maxIndex = channel.length - 1;
    const index = this.clampValue(Number(frameIndex) || 0, 0, maxIndex);
    const low = Math.floor(index);
    const high = Math.min(maxIndex, low + 1);
    const frac = index - low;
    return (Number(channel[low]) || 0) + ((Number(channel[high]) || 0) - (Number(channel[low]) || 0)) * frac;
  }

  sampleStereoAt(sample, frameIndex) {
    const left = this.sampleChannelAt(sample, 0, frameIndex);
    const right = sample?.channelData?.length > 1
      ? this.sampleChannelAt(sample, 1, frameIndex)
      : left;
    return {
      Left: left,
      Mono: (left + right) * 0.5,
      Out: (left + right) * 0.5,
      Right: right,
    };
  }

  audioPlayerSample(node, nodeId, readInput, readParam, rate = sampleRate) {
    const state = this.samplePlaybackStates.get(nodeId) || this.createSamplePlaybackState();
    this.samplePlaybackStates.set(nodeId, state);
    const sampleId = String(node?.sample?.id || "");
    const sample = this.samples.get(sampleId);
    const frames = Math.max(0, Number(sample?.frames) || sample?.samples?.length || sample?.channelData?.[0]?.length || 0);
    this.audioPlayerMeterNodeId = nodeId;
    if (!sample || frames <= 1) {
      this.audioPlayerMeterReason = sampleId ? "engine waiting for sample" : "engine no sample id";
      return { Left: 0, Mono: 0, Out: 0, Phase: 0, Right: 0, Trigger: 0 };
    }
    const start = this.clampValue(readParam("start", 0), 0, 1);
    const end = this.clampValue(readParam("end", 1), 0, 1);
    const collapsedRange = Math.abs(end - start) <= 0.000001;
    const startPhase = collapsedRange ? 0 : Math.min(start, end);
    const endPhase = collapsedRange ? 1 : Math.max(start, end);
    const span = Math.max(0.000001, endPhase - startPhase);
    const rangeKey = `${startPhase}:${endPhase}`;
    if (state.sampleId !== sampleId) {
      state.phase = startPhase;
      state.completed = false;
      state.sampleId = sampleId;
    } else if (state.rangeKey !== rangeKey) {
      const currentPhase = Number(state.phase);
      if (!Number.isFinite(currentPhase) || currentPhase < startPhase || currentPhase > endPhase) {
        state.phase = startPhase;
      }
      state.completed = false;
    }
    if (state.rangeKey !== rangeKey) {
      state.rangeKey = rangeKey;
    }
    const transportFallback = Object.hasOwn(node?.params || {}, "transport")
      ? 4
      : ((Number(node?.params?.loop) || 0) >= 0.5 ? 4 : 0);
    const transportMode = Math.max(0, Math.min(4, Math.round(readParam("transport", transportFallback))));
    const transportReset = transportMode <= 0;
    const transportStopped = transportMode === 1;
    const transportPaused = transportMode === 2;
    const transportLooping = transportMode === 3;
    const transportPlayOnce = transportMode >= 4;
    if (state.transportMode !== transportMode) {
      state.completed = false;
      state.transportMode = transportMode;
    }
    const reset = readInput("Reset");
    const resetEdge = state.lastReset <= 0 && reset > 0;
    if (resetEdge || transportReset || transportStopped) {
      state.phase = startPhase;
      state.completed = false;
    }
    state.playing = (transportPlayOnce || transportLooping) && !state.completed;
    state.lastReset = reset;

    const phaseConnected = this.inputConnections?.has?.(this.inputKey(nodeId, "Phase"));
    const speed = readParam("speed", 1) + readInput("Speed");
    const sampleRateRatio = (Number(sample.sampleRate) || rate || 44100) / Math.max(1, rate || 44100);
    const increment = (speed * sampleRateRatio) / frames;
    const phase = phaseConnected
      ? this.clampValue(readInput("Phase"), 0, 1)
      : this.clampValue(state.phase, 0, 1);
    const boundedPhase = phase < startPhase || phase > endPhase
      ? startPhase
      : phase;
    const stereo = this.sampleStereoAt(sample, boundedPhase * (frames - 1));
    const level = readParam("level", 1);
    const outputActive = state.playing;
    const left = outputActive ? stereo.Left * level : 0;
    const mono = outputActive ? stereo.Mono * level : 0;
    const right = outputActive ? stereo.Right * level : 0;
    this.audioPlayerMeterPhase = boundedPhase;
    this.audioPlayerMeterPeak = Math.max(
      this.audioPlayerMeterPeak,
      Math.abs(left),
      Math.abs(mono),
      Math.abs(right),
    );
    this.audioPlayerMeterReason = state.playing
      ? (transportLooping ? "engine looping" : "engine playing")
      : transportPaused
        ? "engine paused"
        : transportStopped
          ? "engine stopped"
          : state.completed
            ? "engine complete"
            : "engine off reset";
    this.audioPlayerMeterSamples += 1;
    let done = 0;
    if (!phaseConnected && state.playing) {
      const nextPhase = boundedPhase + increment;
      if (transportLooping) {
        const normalizedNext = (nextPhase - startPhase) / span;
        done = normalizedNext < 0 || normalizedNext >= 1 ? 1 : 0;
        state.phase = startPhase + this.wrapValue((nextPhase - startPhase) / span, 0, 1) * span;
      } else if (speed >= 0 && nextPhase >= endPhase) {
        state.phase = endPhase;
        state.completed = true;
        state.playing = false;
        done = 1;
      } else if (speed < 0 && nextPhase <= startPhase) {
        state.phase = startPhase;
        state.completed = true;
        state.playing = false;
        done = 1;
      } else {
        state.phase = this.clampValue(nextPhase, startPhase, endPhase);
      }
    } else if (!phaseConnected && (transportReset || transportStopped)) {
      state.phase = startPhase;
    } else {
      state.phase = boundedPhase;
    }
    return {
      Left: left,
      Mono: mono,
      Out: mono,
      Phase: boundedPhase,
      Right: right,
      Trigger: done,
    };
  }

  monitorBadValueSample(value, nodeId) {
    const number = Number(value);
    const reason = this.badValueReason(number);
    if (reason) {
      this.badNumberCount += 1;
      this.lastBadValueReason = reason;
      this.lastBadValueNodeId = nodeId;
      this.lastBadValueSource = "BADVAL Monitor input";
    }
    return number;
  }

  nativeSoftClipperSample(input, center = 0, width = 2) {
    const dry = Number(input) || 0;
    if (!this.nativeSoftClipperReady || !this.nativeSoftClipper?.soemdsp_soft_clipper_sample) {
      return dry;
    }
    try {
      return this.safeFilterNumber(
        this.nativeSoftClipper.soemdsp_soft_clipper_sample(
          dry,
          Number(center) || 0,
          Number(width) || 2,
        ),
        null,
      );
    } catch (error) {
      this.nativeSoftClipperReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "soft_clipper",
        status: "disabled",
        message: String(error?.message || error || "native Soft Clipper failed"),
      });
      return dry;
    }
  }

  onePoleHighpassSample(state, input, frequency, rate = sampleRate) {
    const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
    const safeInput = this.safeFilterNumber(input, state);
    const frequencyValue = Math.max(0, this.safeFilterNumber(frequency, state));
    const w = Math.min((Math.PI * 2) / safeRate, 0.000142475857) * frequencyValue;
    const a1 = Math.exp(-w);
    const b0 = 0.5 * (1 + a1);
    const b1 = -b0;
    state.outputBuffer = this.safeFilterNumber(
      b0 * safeInput + b1 * state.inputBuffer + a1 * state.outputBuffer,
      state,
    );
    state.inputBuffer = safeInput;
    return state.outputBuffer;
  }

  onePoleLowpassSample(state, input, frequency, rate = sampleRate) {
    const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
    const safeInput = this.safeFilterNumber(input, state);
    const frequencyValue = Math.max(0, this.safeFilterNumber(frequency, state));
    const w = Math.min((Math.PI * 2) / safeRate, 0.000142475857) * frequencyValue;
    const a1 = Math.exp(-w);
    const b0 = 1 - a1;
    state.outputBuffer = this.safeFilterNumber(b0 * safeInput + a1 * state.outputBuffer, state);
    return state.outputBuffer;
  }

  cookbookFilterStageCount(stages) {
    const value = Math.round(Number(stages));
    return Number.isFinite(value) ? this.clampValue(value, 0, 5) : 2;
  }

  cookbookFilterCoefficients(mode, frequency, q, gainDb, rate = sampleRate) {
    const safeMode = Math.round(this.clampValue(Number(mode) || 0, 0, 9));
    if (safeMode === 0) {
      return { a1: 0, a2: 0, b0: 1, b1: 0, b2: 0 };
    }
    const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
    const freq = this.clampValue(Number(frequency) || 1000, 20, Math.min(20000, safeRate * 0.49));
    const safeQ = Math.max(0.0001, Number(q) || 1);
    const omega = 2 * Math.PI * freq / safeRate;
    const sine = Math.sin(omega);
    const cosine = Math.cos(omega);
    const alpha = sine / (2 * safeQ);
    const amplitude = 10 ** (0.025 * (Number(gainDb) || 0));
    const beta = Math.sqrt(amplitude) / safeQ;
    let a0 = 1 + alpha;
    let a1 = -2 * cosine;
    let a2 = 1 - alpha;
    let b0 = 1;
    let b1 = 0;
    let b2 = 0;
    if (safeMode === 1) {
      b1 = 1 - cosine;
      b0 = b1 * 0.5;
      b2 = b0;
    } else if (safeMode === 2) {
      b1 = -(1 + cosine);
      b0 = -b1 * 0.5;
      b2 = b0;
    } else if (safeMode === 3) {
      b0 = safeQ * alpha;
      b2 = -b0;
    } else if (safeMode === 4) {
      b0 = alpha;
      b2 = -alpha;
    } else if (safeMode === 5) {
      b0 = 1;
      b1 = -2 * cosine;
      b2 = 1;
    } else if (safeMode === 6) {
      b0 = 1 - alpha;
      b1 = -2 * cosine;
      b2 = 1 + alpha;
    } else if (safeMode === 7) {
      a0 = 1 + alpha / amplitude;
      a2 = 1 - alpha / amplitude;
      b0 = 1 + alpha * amplitude;
      b1 = -2 * cosine;
      b2 = 1 - alpha * amplitude;
    } else if (safeMode === 8) {
      a0 = (amplitude + 1) + (amplitude - 1) * cosine + beta * sine;
      a1 = -2 * ((amplitude - 1) + (amplitude + 1) * cosine);
      a2 = (amplitude + 1) + (amplitude - 1) * cosine - beta * sine;
      b0 = amplitude * ((amplitude + 1) - (amplitude - 1) * cosine + beta * sine);
      b1 = 2 * amplitude * ((amplitude - 1) - (amplitude + 1) * cosine);
      b2 = amplitude * ((amplitude + 1) - (amplitude - 1) * cosine - beta * sine);
    } else if (safeMode === 9) {
      a0 = (amplitude + 1) - (amplitude - 1) * cosine + beta * sine;
      a1 = 2 * ((amplitude - 1) - (amplitude + 1) * cosine);
      a2 = (amplitude + 1) - (amplitude - 1) * cosine - beta * sine;
      b0 = amplitude * ((amplitude + 1) + (amplitude - 1) * cosine + beta * sine);
      b1 = -2 * amplitude * ((amplitude - 1) + (amplitude + 1) * cosine);
      b2 = amplitude * ((amplitude + 1) + (amplitude - 1) * cosine - beta * sine);
    }
    const scale = a0 !== 0 ? 1 / a0 : 1;
    return {
      a1: a1 * scale,
      a2: a2 * scale,
      b0: b0 * scale,
      b1: b1 * scale,
      b2: b2 * scale,
    };
  }

  cookbookFilterSample(state, input, mode, frequency, q, gainDb, stages, rate = sampleRate) {
    const stageCount = this.cookbookFilterStageCount(stages);
    if (!state || stageCount <= 0 || Math.round(Number(mode) || 0) === 0) {
      return Number(input) || 0;
    }
    if (state.lastStages !== stageCount) {
      this.resetCookbookFilterState(state);
      state.lastStages = stageCount;
    }
    const coeff = this.cookbookFilterCoefficients(mode, frequency, q, gainDb, rate);
    let value = this.safeFilterNumber(input, state);
    for (let index = 0; index < stageCount; index += 1) {
      const previousInput = value;
      value = coeff.b0 * value + coeff.b1 * state.x1[index] + coeff.b2 * state.x2[index]
        - coeff.a1 * state.y1[index] - coeff.a2 * state.y2[index];
      state.x2[index] = state.x1[index];
      state.x1[index] = previousInput;
      state.y2[index] = state.y1[index];
      state.y1[index] = value;
    }
    return this.safeFilterNumber(value, state);
  }

  ladderFilterStageCount(stages) {
    const value = Math.round(Number(stages));
    return Number.isFinite(value) ? this.clampValue(value, 1, 4) : 4;
  }

  ladderFilterMix(mode, stages) {
    const safeMode = Math.round(this.clampValue(Number(mode) || 0, 0, 3));
    const stageCount = this.ladderFilterStageCount(stages);
    const c = [0, 0, 0, 0, 0];
    let s = 1;
    if (safeMode === 0) {
      c[0] = 1;
      s = 0.125;
    } else if (safeMode === 1) {
      c[stageCount] = 1;
      s = stageCount * 0.25;
    } else if (safeMode === 2) {
      const coefficients = [
        [1, -1],
        [1, -2, 1],
        [1, -3, 3, -1],
        [1, -4, 6, -4, 1],
      ][stageCount - 1];
      for (let index = 0; index < coefficients.length; index += 1) {
        c[index] = coefficients[index];
      }
      s = stageCount * 0.25;
    } else {
      const coefficients = stageCount <= 2
        ? [0, 2, -2, 0, 0]
        : stageCount === 3
          ? [0, 0, 3, -3, 0]
          : [0, 0, 4, -8, 4];
      for (let index = 0; index < coefficients.length; index += 1) {
        c[index] = coefficients[index];
      }
      s = 0.125;
    }
    return { c, mode: safeMode, s, stageCount };
  }

  ladderFilterFeedbackFactor(feedback, cosWc, a) {
    const b = 1 + a;
    const denominator = Math.max(1e-12, 1 + a * a + 2 * a * cosWc);
    const g2 = (b * b) / denominator;
    return feedback / Math.max(1e-12, g2 * g2);
  }

  ladderFilterCoefficients(frequency, resonance, mode, stages, rate = sampleRate, state = null) {
    const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
    const frequencyValue = Math.max(0, this.safeFilterNumber(frequency, state));
    const safeFrequency = this.clampValue(frequencyValue, 0.000001, Math.min(20000, safeRate * 0.49));
    const feedback = this.clampValue(this.safeFilterNumber(resonance, state), 0, 0.999);
    const wc = this.clampValue((2 * Math.PI * safeFrequency) / safeRate, 1e-9, Math.PI * 0.98);
    const sine = Math.sin(wc);
    const cosine = Math.cos(wc);
    const tangent = Math.tan(0.25 * (wc - Math.PI));
    let a = tangent / Math.max(1e-12, sine - cosine * tangent);
    if (!Number.isFinite(a)) {
      a = -1;
    }
    const mix = this.ladderFilterMix(mode, stages);
    const k = this.ladderFilterFeedbackFactor(feedback, cosine, a);
    const g = 1 + mix.s * k;
    return { ...mix, a, g, k };
  }

  ladderFilterSample(state, input, params, rate = sampleRate) {
    if (this.nativeLadderFilterReady) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeLadderFilter.soemdsp_ladder_filter_create();
        }
        if (state.nativeHandle) {
          return this.safeFilterNumber(
            this.nativeLadderFilter.soemdsp_ladder_filter_sample(
              state.nativeHandle,
              this.safeFilterNumber(input, state),
              Math.max(0, this.safeFilterNumber(params.frequency, state)),
              this.clampValue(this.safeFilterNumber(params.resonance, state), 0, 0.999),
              Math.max(0, Math.min(3, Math.round(Number(params.mode) || 0))),
              Math.max(1, Math.min(4, Math.round(Number(params.stages) || 4))),
              Math.max(1, Number(rate) || sampleRate || 44100),
            ),
            state,
          );
        }
      } catch (error) {
        this.nativeLadderFilterReady = false;
        state.nativeHandle = 0;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "ladder_filter",
          status: "disabled",
          message: String(error?.message || error || "native Ladder Filter failed"),
        });
      }
    }
    const safeInput = this.safeFilterNumber(input, state);
    const coeff = this.ladderFilterCoefficients(
      params.frequency,
      params.resonance,
      params.mode,
      params.stages,
      rate,
      state,
    );
    const y = Array.isArray(state.y) && state.y.length >= 5 ? state.y : [0, 0, 0, 0, 0];
    state.y = y;
    y[0] = coeff.g * safeInput - coeff.k * y[4];
    y[0] = y[0] / (1 + y[0] * y[0]);
    y[1] = y[0] + coeff.a * (y[0] - y[1]);
    y[2] = y[1] + coeff.a * (y[1] - y[2]);
    y[3] = y[2] + coeff.a * (y[2] - y[3]);
    y[4] = y[3] + coeff.a * (y[3] - y[4]);
    for (let index = 0; index < y.length; index += 1) {
      y[index] = this.safeFilterNumber(y[index], state);
    }
    const output = coeff.c[0] * y[0] + coeff.c[1] * y[1] + coeff.c[2] * y[2] + coeff.c[3] * y[3] + coeff.c[4] * y[4];
    return this.safeFilterNumber(output, state);
  }

  tb303FilterSample(state, input, params, rate = sampleRate) {
    if (!this.nativeTb303FilterReady) {
      throw new Error("native TB-303 Filter not ready");
    }
    if (!state.nativeHandle) {
      state.nativeHandle = this.nativeTb303Filter.soemdsp_tb303_filter_create();
    }
    if (!state.nativeHandle) {
      throw new Error("native TB-303 Filter failed to create instance");
    }
    return this.safeFilterNumber(
      this.nativeTb303Filter.soemdsp_tb303_filter_sample(
        state.nativeHandle,
        this.safeFilterNumber(input, state),
        Math.max(200, this.safeFilterNumber(params.cutoff, state)),
        Math.max(0, Math.min(100, this.safeFilterNumber(params.resonance, state))),
        Math.max(0, Math.min(14, Math.round(Number(params.mode) || 4))),
        Number(params.drive) || 0,
        Math.max(1, Number(rate) || sampleRate || 44100),
      ),
      state,
    );
  }

  slewLimiterSample(state, input, upTime, downTime, rate = sampleRate) {
    const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
    const target = this.safeFilterNumber(input, state);
    if (!state.initialized) {
      state.initialized = true;
      state.out = target;
      return target;
    }
    const upSeconds = Math.max(0, this.safeFilterNumber(upTime, state));
    const downSeconds = Math.max(0, this.safeFilterNumber(downTime, state));
    const delta = target - state.out;
    const maxRise = upSeconds <= 0 ? Infinity : 1 / Math.max(1, upSeconds * safeRate);
    const maxFall = downSeconds <= 0 ? Infinity : 1 / Math.max(1, downSeconds * safeRate);
    state.out = this.safeFilterNumber(
      state.out + Math.max(-maxFall, Math.min(maxRise, delta)),
      state,
    );
    return state.out;
  }

  clockAnalogWhipSample(phase, level) {
    const p = this.clampValue(Number(phase) || 0, 0, 1);
    const attack = 1 - Math.pow(1 - Math.min(1, p / 0.035), 4);
    const release = Math.pow(Math.max(0, 1 - p), 1.85);
    const snapEnvelope = attack * release;
    const sweepTurns = (3.15 * (1 - Math.exp(-4.2 * p)) / (1 - Math.exp(-4.2))) + (0.18 * Math.sin(Math.PI * p));
    const liquidBend = 0.075 * Math.sin(Math.PI * 2 * p) * Math.pow(Math.max(0, 1 - p), 1.2);
    const body = Math.sin((sweepTurns + liquidBend) * Math.PI * 2);
    const sheen = Math.sin((sweepTurns * 2.02 + 0.17) * Math.PI * 2) * 0.16 * Math.pow(Math.max(0, 1 - p), 2.8);
    return (body + sheen) * snapEnvelope * level;
  }

  clockSample(state, reset, phaseOffset, rate, duty, level, rateHz = sampleRate) {
    const safeReset = this.safeFilterNumber(reset, null);
    const safePhaseOffset = this.wrapValue(this.safeFilterNumber(phaseOffset, null), 0, 1);
    const safeRate = Math.max(0, this.safeFilterNumber(rate, null));
    const safeDuty = this.clampValue(this.safeFilterNumber(duty, null), 0, 1);
    const safeLevel = this.safeFilterNumber(level, null);
    const resetActive = safeReset > 0;
    const rawPhase = resetActive ? 0 : this.wrapValue(Number(state.phase) || 0, 0, 1);
    const phase = this.wrapValue(rawPhase + safePhaseOffset, 0, 1);
    const digital = phase < safeDuty ? safeLevel : 0;
    const analog = this.clockAnalogWhipSample(phase, safeLevel);
    const nextRawPhase = this.wrapValue(rawPhase + safeRate / Math.max(1, rateHz), 0, 1);
    const pulse = safeRate > 0 && !resetActive && (!state.hasStarted || nextRawPhase < rawPhase) ? safeLevel : 0;
    state.hasStarted = !resetActive;
    state.phase = resetActive ? 0 : nextRawPhase;
    return {
      "Analog Out": analog,
      "Digital Out": digital,
      Out: digital,
      Pulse: pulse,
    };
  }

  normalizePatchTiming(timing = {}) {
    const source = timing && typeof timing === "object" ? timing : {};
    return {
      tempoBpm: Math.max(1, Math.round(Number(source.tempoBpm) || 120)),
      timeSignatureDenominator: Math.max(1, Math.round(Number(source.timeSignatureDenominator) || 4)),
      timeSignatureNumerator: Math.max(1, Math.round(Number(source.timeSignatureNumerator) || 4)),
    };
  }

  transportDivisionFactor(divisions) {
    const division = Math.round(Number(divisions) || 0);
    if (division > 0) {
      return division + 1;
    }
    if (division < 0) {
      return 1 / (Math.abs(division) + 1);
    }
    return 1;
  }

  transportSample(params, frame, rateHz = sampleRate) {
    const rate = Math.max(1, Number(rateHz) || sampleRate || 44100);
    const tempoBpm = Math.max(1, Number(this.timing?.tempoBpm) || 120);
    const frequency = (tempoBpm / 60) * this.transportDivisionFactor(params.divisions);
    const amplitude = this.clampValue(this.safeFilterNumber(params.amplitude, null), 0, 1);
    const phase = frequency > 0 ? this.wrapValue((Math.max(0, Number(frame) || 0) / rate) * frequency, 0, 1) : 0;
    const high = phase < 0.5;
    return {
      "-1..1": high ? amplitude : -amplitude,
      "0..1": high ? amplitude : 0,
    };
  }

  randomClockNextUnit(state, nodeId, seed) {
    const seedKey = `${nodeId}:${Math.round(Number(seed) || 0)}`;
    if (state.seedKey !== seedKey) {
      state.seedKey = seedKey;
      state.randomState = this.stableSeed(seedKey);
      state.intervalSamples = 0;
      state.phaseSamples = 0;
      state.remainingTriggerSamples = 0;
    }
    state.randomState = (Math.imul(state.randomState || 1, 1664525) + 1013904223) >>> 0;
    return state.randomState / 4294967296;
  }

  randomClockChooseIntervalSamples(state, params, rateHz, nodeId) {
    const rate = Math.max(1, rateHz || sampleRate || 44100);
    const minSeconds = Math.max(0, this.safeFilterNumber(params.minSeconds, null));
    const maxSeconds = Math.max(0, this.safeFilterNumber(params.maxSeconds, null));
    const low = Math.min(minSeconds, maxSeconds);
    const high = Math.max(minSeconds, maxSeconds);
    const random = this.randomClockNextUnit(state, nodeId, params.seed);
    return Math.max(1, Math.round((low + (high - low) * random) * rate));
  }

  randomClockSample(state, reset, params, rateHz = sampleRate, nodeId = "") {
    const safeReset = this.safeFilterNumber(reset, null);
    const threshold = this.safeFilterNumber(params.threshold, null);
    const rate = Math.max(1, rateHz || sampleRate || 44100);
    const duty = this.clampValue(this.safeFilterNumber(params.duty, null), 0, 1);
    const triggerTime = Math.max(0, this.safeFilterNumber(params.triggerTime, null));
    const level = this.safeFilterNumber(params.level, null);
    const resetEdge = state.lastReset <= threshold && safeReset > threshold;

    if (resetEdge || state.intervalSamples <= 0) {
      state.intervalSamples = this.randomClockChooseIntervalSamples(state, params, rate, nodeId);
      state.phaseSamples = 0;
      state.remainingTriggerSamples = Math.max(1, Math.round(triggerTime * rate));
    } else if (state.phaseSamples >= state.intervalSamples) {
      state.intervalSamples = this.randomClockChooseIntervalSamples(state, params, rate, nodeId);
      state.phaseSamples = 0;
      state.remainingTriggerSamples = Math.max(1, Math.round(triggerTime * rate));
    }

    const gateSamples = Math.round(state.intervalSamples * duty);
    const trigger = state.remainingTriggerSamples > 0 ? level : 0;
    const gate = state.phaseSamples < gateSamples ? level : 0;
    state.remainingTriggerSamples = Math.max(0, state.remainingTriggerSamples - 1);
    state.phaseSamples += 1;
    state.lastReset = safeReset;
    return {
      Gate: this.safeFilterNumber(gate, null),
      Trigger: this.safeFilterNumber(trigger, null),
    };
  }

  delayedTriggerSample(state, trigger, reset, params, rateHz = sampleRate) {
    const safeTrigger = this.safeFilterNumber(trigger, null);
    const safeReset = this.safeFilterNumber(reset, null);
    const threshold = this.safeFilterNumber(params.threshold, null);
    const delay = Math.max(0, this.safeFilterNumber(params.delay, null));
    const pulseTime = Math.max(0, this.safeFilterNumber(params.pulseTime, null));
    const level = this.safeFilterNumber(params.level, null);
    const rate = Math.max(1, rateHz || sampleRate || 44100);

    if (state.lastReset <= threshold && safeReset > threshold) {
      state.hasTriggered = true;
      state.remainingSamples = 0;
      state.running = false;
      state.waitSamples = 0;
    }
    if (state.lastTrigger <= threshold && safeTrigger > threshold) {
      state.hasTriggered = false;
      state.remainingSamples = 0;
      state.running = true;
      state.waitSamples = Math.max(0, Math.round(delay * rate));
    }

    if (state.running && !state.hasTriggered) {
      if (state.waitSamples <= 0) {
        state.hasTriggered = true;
        state.running = false;
        state.remainingSamples = Math.max(1, Math.round(pulseTime * rate));
      } else {
        state.waitSamples -= 1;
      }
    }

    state.lastTrigger = safeTrigger;
    state.lastReset = safeReset;
    const output = state.remainingSamples > 0 ? level : 0;
    state.remainingSamples = Math.max(0, state.remainingSamples - 1);
    return this.safeFilterNumber(output, null);
  }

  patchCommandTriggerSample(state, trigger, threshold, command, nodeId) {
    const safeTrigger = this.safeFilterNumber(trigger, null);
    const safeThreshold = this.safeFilterNumber(threshold, null);
    if (state.lastTrigger <= safeThreshold && safeTrigger > safeThreshold) {
      this.port.postMessage({
        command,
        nodeId,
        sessionId: this.sessionId,
        type: "patchCommand",
      });
    }
    state.lastTrigger = safeTrigger;
    return 0;
  }

  delayParabolSample(phase) {
    const wrapped = phase - Math.floor(phase);
    return wrapped < 0.5 ? wrapped * 4 - 1 : 3 - wrapped * 4;
  }

  delayInterpolateLinear(buffer, where) {
    const length = buffer.length;
    if (!length) {
      return 0;
    }
    const before = Math.floor(where) % length;
    const after = (before + 1) % length;
    const mix = where - Math.floor(where);
    return buffer[before] * (1 - mix) + buffer[after] * mix;
  }

  delayEffectSample(state, input, params, rateHz = sampleRate, nodeId = "") {
    const safeRate = Math.max(1, Number(rateHz) || 44100);
    const maxDelaySeconds = 4.25;
    const requiredSize = Math.max(2, Math.ceil(safeRate * maxDelaySeconds) + 2);
    if (!state.buffer || state.bufferSize !== requiredSize) {
      state.buffer = new Float32Array(requiredSize);
      state.bufferSize = requiredSize;
      state.position = 0;
      state.lfoPhase = 0;
      state.lfoVariationState = 0;
      state.wet = 0;
    }
    const dry = this.safeFilterNumber(input, null);
    const time = this.clampValue(this.safeFilterNumber(params.time, null), 0.001, maxDelaySeconds);
    const feedback = this.clampValue(this.safeFilterNumber(params.feedback, null), 0, 0.95);
    const mix = this.clampValue(this.safeFilterNumber(params.mix, null), 0, 1);
    const level = this.clampValue(this.safeFilterNumber(params.level, null), 0, 2);
    const modAmount = this.clampValue(this.safeFilterNumber(params.modAmount, null), 0, 0.5);
    const modRate = this.clampValue(this.safeFilterNumber(params.modRate, null), 0, 90);
    const modVariation = this.clampValue(this.safeFilterNumber(params.modVariation, null), 0, 1);
    const mode = Math.round(this.safeFilterNumber(params.mode, null)) >= 1 ? 1 : 0;

    const variationTarget = this.hashBipolar(
      Math.floor(state.lfoPhase * 997) + state.position,
      this.stableSeed(`${nodeId}:delayVariation`),
    );
    state.lfoVariationState += (variationTarget - state.lfoVariationState) * Math.min(1, modRate / safeRate);
    const variedRate = Math.max(0, modRate * (1 + state.lfoVariationState * modVariation));
    state.lfoPhase = (state.lfoPhase + variedRate / safeRate) % 1;
    const lfo = (this.delayParabolSample(state.lfoPhase) + 1) * 0.5;

    const delaySamples = this.clampValue(time * safeRate, 1, state.bufferSize - 2);
    const bufferOffset = delaySamples - delaySamples * lfo * modAmount + 1;
    state.position = (state.position + 1) % state.bufferSize;
    const readPosition = (state.position + state.bufferSize - bufferOffset) % state.bufferSize;
    const wet = this.delayInterpolateLinear(state.buffer, readPosition);
    const write = mode ? ((0 - dry) - wet * feedback) : (dry + wet * feedback);
    state.buffer[state.position] = this.clampValue(write, -8, 8);
    state.wet = mode ? (dry * feedback - wet * (1 - feedback * feedback)) : wet;
    return {
      Out: (dry * (1 - mix) + state.wet * mix) * level,
      Wet: state.wet * level,
    };
  }

  createSabrinaReverbState() {
    return {
      nativeHandle: 0,
      nativeParamKey: "",
      nativeSampleRate: 0,
      idleCounter: 0,
      isIdle: false,
    };
  }

  createPllState() {
    return { nativeHandle: 0, nativeParamKey: "", nativeSampleRate: 0 };
  }

  destroyPllState(state) {
    if (!state?.nativeHandle || !this.nativePll?.soemdsp_pll_destroy) return;
    this.nativePll.soemdsp_pll_destroy(state.nativeHandle);
    state.nativeHandle = 0;
  }

  pllSample(state, signalIn, cvIn, cvConnected, params, rateHz = sampleRate) {
    const native = this.nativePll;
    if (!this.nativePllReady || !native?.soemdsp_pll_create || !native?.soemdsp_pll_process) {
      return { "VCO Out": 0, "PC Out": 0, "LPF Out": 0, Locked: 0 };
    }
    try {
      const safeRate = Math.max(1, Number(rateHz) || sampleRate || 44100);
      if (!state.nativeHandle || state.nativeSampleRate !== safeRate) {
        if (state.nativeHandle && native.soemdsp_pll_destroy) {
          native.soemdsp_pll_destroy(state.nativeHandle);
        }
        state.nativeHandle = native.soemdsp_pll_create(safeRate) || 0;
        state.nativeSampleRate = safeRate;
        state.nativeParamKey = "";
      }
      if (!state.nativeHandle) {
        return { "VCO Out": 0, "PC Out": 0, "LPF Out": 0, Locked: 0 };
      }
      const range  = Math.max(0, Math.min(2, Math.round(this.safeFilterNumber(params.range,  null) ?? 1)));
      const offset = this.clampValue(this.safeFilterNumber(params.offset, null) ?? 5, 0, 10);
      const type   = Math.max(0, Math.min(2, Math.round(this.safeFilterNumber(params.type,   null) ?? 1)));
      const frequ  = Math.max(0.1, this.safeFilterNumber(params.frequ, null) ?? 10);
      const paramKey = `${range}:${Math.round(offset * 1000)}:${type}:${Math.round(frequ * 1000)}`;
      if (paramKey !== state.nativeParamKey && native.soemdsp_pll_set_params) {
        state.nativeParamKey = paramKey;
        native.soemdsp_pll_set_params(state.nativeHandle, safeRate, range, offset, type, frequ);
      }
      const safeSig = this.safeFilterNumber(signalIn, null) ?? 0;
      const safeCv  = this.clampValue(this.safeFilterNumber(cvIn, null) ?? 0, 0, 1);
      native.soemdsp_pll_process(state.nativeHandle, safeSig, safeCv, cvConnected);
      return {
        "VCO Out": this.safeFilterNumber(native.soemdsp_pll_vco_out?.(state.nativeHandle), null) ?? 0,
        "PC Out":  this.safeFilterNumber(native.soemdsp_pll_pc_out?.(state.nativeHandle),  null) ?? 0,
        "LPF Out": this.safeFilterNumber(native.soemdsp_pll_lpf_out?.(state.nativeHandle), null) ?? 0,
        Locked:    this.safeFilterNumber(native.soemdsp_pll_locked?.(state.nativeHandle),   null) ?? 0,
      };
    } catch {
      this.nativePllReady = false;
      this.destroyPllState(state);
      return { "VCO Out": 0, "PC Out": 0, "LPF Out": 0, Locked: 0 };
    }
  }

  createHelmholtzState() {
    return { nativeHandle: 0, nativeParamKey: "", nativeSampleRate: 0 };
  }

  helmholtzPitchView(frequencyHz) {
    if (!(frequencyHz > 0)) return -1;
    const minHz = 80;
    const octaves = 4;
    const clampedHz = Math.max(minHz, Math.min(minHz * Math.pow(2, octaves), frequencyHz));
    const norm = Math.log2(clampedHz / minHz) / octaves;
    return norm * 2 - 1;
  }

  destroyHelmholtzState(state) {
    if (!state?.nativeHandle || !this.nativeHelmholtz?.soemdsp_helmholtz_destroy) return;
    this.nativeHelmholtz.soemdsp_helmholtz_destroy(state.nativeHandle);
    state.nativeHandle = 0;
  }

  reportHelmholtzStatus(status, message = "") {
    const key = `${status}:${message}`;
    if (this.nativeHelmholtzStatusKey === key) return;
    this.nativeHelmholtzStatusKey = key;
    this.port.postMessage({
      type: "nativeModuleStatus",
      name: "helmholtz",
      status,
      message,
    });
  }

  helmholtzSample(state, input, params, inputConnected = true, rateHz = sampleRate) {
    if (!inputConnected) {
      this.destroyHelmholtzState(state);
      state.nativeSampleRate = 0;
      state.nativeParamKey = "";
      return { Frequency: 0, Fidelity: 0, "Pitch View": -1 };
    }
    const native = this.nativeHelmholtz;
    if (!this.nativeHelmholtzReady || !native?.soemdsp_helmholtz_create || !native?.soemdsp_helmholtz_process) {
      if (native) {
        this.reportHelmholtzStatus("disabled", "native Helmholtz exports missing; analyzer outputs zero");
      }
      return { Frequency: 0, Fidelity: 0, "Pitch View": -1 };
    }
    try {
      const safeRate = Math.max(1, Number(rateHz) || sampleRate || 44100);
      if (!state.nativeHandle || state.nativeSampleRate !== safeRate) {
        if (state.nativeHandle && native.soemdsp_helmholtz_destroy) {
          native.soemdsp_helmholtz_destroy(state.nativeHandle);
        }
        state.nativeHandle = native.soemdsp_helmholtz_create(safeRate) || 0;
        state.nativeSampleRate = safeRate;
        state.nativeParamKey = "";
      }
      if (!state.nativeHandle) {
        this.reportHelmholtzStatus("disabled", "native Helmholtz handle creation failed; analyzer outputs zero");
        return { Frequency: 0, Fidelity: 0, "Pitch View": -1 };
      }
      const windowSize = Math.max(128, Math.min(1024, Math.round(this.safeFilterNumber(params.windowSize, null) ?? 512)));
      const threshold = this.clampValue(this.safeFilterNumber(params.threshold, null) ?? 0.93, 0.5, 0.999);
      const paramKey = `${windowSize}:${Math.round(threshold * 1000)}`;
      if (paramKey !== state.nativeParamKey && native.soemdsp_helmholtz_set_params) {
        state.nativeParamKey = paramKey;
        native.soemdsp_helmholtz_set_params(state.nativeHandle, safeRate, windowSize, threshold);
      }
      const safeIn = this.safeFilterNumber(input, null) ?? 0;
      native.soemdsp_helmholtz_process(state.nativeHandle, safeIn);
      const frequency = this.safeFilterNumber(native.soemdsp_helmholtz_frequency?.(state.nativeHandle), null) ?? 0;
      return {
        Frequency: frequency,
        Fidelity: this.safeFilterNumber(native.soemdsp_helmholtz_fidelity?.(state.nativeHandle), null) ?? 0,
        "Pitch View": this.helmholtzPitchView(frequency),
      };
    } catch (error) {
      this.nativeHelmholtzReady = false;
      this.destroyHelmholtzState(state);
      this.reportHelmholtzStatus(
        "disabled",
        `native Helmholtz failed; analyzer outputs zero: ${String(error?.message || error || "unknown error")}`,
      );
      return { Frequency: 0, Fidelity: 0, "Pitch View": -1 };
    }
  }

  nativeSabrinaReverbSample(state, leftInput, rightInput, params, rateHz = sampleRate, frame = 0) {
    const native = this.nativeSabrinaReverb;
    if (
      !this.nativeSabrinaReverbReady ||
      !native?.soemdsp_sabrina_reverb_create ||
      !native?.soemdsp_sabrina_reverb_process
    ) {
      return null;
    }
    try {
      const safeRate = Math.max(1, Number(rateHz) || sampleRate || 44100);
      if (!state.nativeHandle || state.nativeSampleRate !== safeRate) {
        if (state.nativeHandle && native.soemdsp_sabrina_reverb_destroy) {
          native.soemdsp_sabrina_reverb_destroy(state.nativeHandle);
        }
        state.nativeHandle = native.soemdsp_sabrina_reverb_create(safeRate) || 0;
        state.nativeSampleRate = safeRate;
        state.nativeParamKey = "";
        state.idleCounter = 0;
        state.isIdle = false;
      }
      if (!state.nativeHandle) {
        return null;
      }
      const safeParams = {
        delaySize: this.clampValue(this.safeFilterNumber(params.delaySize, null), 0, 1),
        diffusionAmount: this.clampValue(this.safeFilterNumber(params.diffusionAmount, null), 0, 0.98),
        diffusionSize: this.clampValue(this.safeFilterNumber(params.diffusionSize, null), 0, 1),
        lfoAmplitude: this.clampValue(this.safeFilterNumber(params.lfoAmplitude, null), 0, 1),
        lfoBaseSpeed: this.clampValue(this.safeFilterNumber(params.lfoBaseSpeed, null), 0, 1),
        lfoVariation: this.clampValue(this.safeFilterNumber(params.lfoVariation, null), 0, 1),
        mix: this.clampValue(this.safeFilterNumber(params.mix, null), 0, 1),
        recycle: this.clampValue(this.safeFilterNumber(params.recycle, null), 0, 0.98),
        seed: Math.max(0, Math.min(99999, Math.round(this.safeFilterNumber(params.seed, null) ?? 0))),
      };
      const paramKey = [
        safeParams.mix,
        safeParams.diffusionSize,
        safeParams.diffusionAmount,
        safeParams.delaySize,
        safeParams.recycle,
        safeParams.lfoAmplitude,
        safeParams.lfoBaseSpeed,
        safeParams.lfoVariation,
      ].map((value) => Math.round(value * 1000000)).join(":") + `:${safeParams.seed}`;
      if (paramKey !== state.nativeParamKey && native.soemdsp_sabrina_reverb_set_params) {
        state.nativeParamKey = paramKey;
        native.soemdsp_sabrina_reverb_set_params(
          state.nativeHandle,
          safeParams.mix,
          safeParams.diffusionSize,
          safeParams.diffusionAmount,
          safeParams.delaySize,
          safeParams.recycle,
          safeParams.lfoAmplitude,
          safeParams.lfoBaseSpeed,
          safeParams.lfoVariation,
          safeParams.seed,
        );
      }
      const dryLeft = this.safeFilterNumber(leftInput, null);
      const dryRight = this.safeFilterNumber(rightInput, null);
      const dryMono = (dryLeft + dryRight) * 0.5;
      const inputActive = Math.abs(dryLeft) >= 0.000001 || Math.abs(dryRight) >= 0.000001;
      if (inputActive) {
        state.isIdle = false;
        state.idleCounter = 0;
      }
      // Bypass mode: reverb is idle, pass dry signal straight through all outputs
      if (state.isIdle) {
        return { "Left Dry": dryLeft, "Mono Dry": dryMono, "Right Dry": dryRight, "Left Mix": dryLeft, "Mono Mix": dryMono, "Right Mix": dryRight };
      }
      native.soemdsp_sabrina_reverb_process(state.nativeHandle, dryLeft, dryRight);
      const mixLeft = this.safeFilterNumber(native.soemdsp_sabrina_reverb_left?.(state.nativeHandle), null);
      const mixRight = this.safeFilterNumber(native.soemdsp_sabrina_reverb_right?.(state.nativeHandle), null);
      const outputPeak = Math.max(Math.abs(mixLeft), Math.abs(mixRight));
      if (outputPeak < 0.000001) {
        state.idleCounter += 1;
        if (state.idleCounter >= safeRate) {
          state.isIdle = true;
        }
      } else {
        state.idleCounter = 0;
      }
      return { "Left Dry": dryLeft, "Mono Dry": dryMono, "Right Dry": dryRight, "Left Mix": mixLeft, "Mono Mix": (mixLeft + mixRight) * 0.5, "Right Mix": mixRight };
    } catch (error) {
      this.nativeSabrinaReverbReady = false;
      if (state.nativeHandle && native.soemdsp_sabrina_reverb_destroy) {
        native.soemdsp_sabrina_reverb_destroy(state.nativeHandle);
      }
      state.nativeHandle = 0;
      state.nativeParamKey = "";
      state.idleCounter = 0;
      state.isIdle = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "sabrina_reverb",
        status: "disabled",
        message: String(error?.message || error || "native Sabrina failed"),
      });
      return null;
    }
  }

  sabrinaReverbSample(state, leftInput, rightInput, params, rateHz = sampleRate, frame = 0) {
    const dryLeft = this.safeFilterNumber(leftInput, null);
    const dryRight = this.safeFilterNumber(rightInput, null);
    const dryMono = (dryLeft + dryRight) * 0.5;
    const nativeOutput = this.nativeSabrinaReverbSample(state, leftInput, rightInput, params, rateHz, frame);
    if (nativeOutput) {
      return nativeOutput;
    }
    return { "Left Dry": dryLeft, "Mono Dry": dryMono, "Right Dry": dryRight, "Left Mix": dryLeft, "Mono Mix": dryMono, "Right Mix": dryRight };
  }

  sampleHoldSample(state, input, trigger, threshold, sampleFrequency, sampleRate, hasInConnected, nodeId) {
    this.resetSeededState(state.noise, nodeId, 0, "sampleHoldNoise");
    const safeInput = hasInConnected
      ? this.safeFilterNumber(input, null)
      : this.nextSeededBipolar(state.noise);
    const safeTrigger = this.safeFilterNumber(trigger, null);
    const safeThreshold = this.safeFilterNumber(threshold, null);
    const safeFreq = Math.max(0, Number(sampleFrequency) || 0);
    const safeRate = Math.max(1, Number(sampleRate) || 44100);
    let internalFire = false;
    if (safeFreq > 0) {
      state.clockPhase += safeFreq / safeRate;
      if (state.clockPhase >= 1) {
        state.clockPhase -= Math.floor(state.clockPhase);
        internalFire = true;
      }
    }
    if ((state.lastTrigger <= safeThreshold && safeTrigger > safeThreshold) || internalFire) {
      state.held = safeInput;
    }
    state.lastTrigger = safeTrigger;
    return this.safeFilterNumber(state.held, null);
  }

  stepSequencerSample(state, trigger, reset, params) {
    const safeTrigger = this.safeFilterNumber(trigger, null);
    const safeReset = this.safeFilterNumber(reset, null);
    const threshold = this.safeFilterNumber(params.threshold, null);
    const stepCount = Math.max(1, Math.min(8, Math.round(this.safeFilterNumber(params.steps, null))));
    const level = this.safeFilterNumber(params.level, null);
    const values = params.values.map((value) => this.safeFilterNumber(value, null));
    if (state.index >= stepCount) {
      state.index %= stepCount;
    }
    if (state.lastReset <= threshold && safeReset > threshold) {
      state.index = 0;
      state.out = values[0] || 0;
    }
    if (state.lastTrigger <= threshold && safeTrigger > threshold) {
      state.out = values[state.index] || 0;
      state.index = (state.index + 1) % stepCount;
    }
    state.gate = safeTrigger > threshold ? 1 : 0;
    state.lastTrigger = safeTrigger;
    state.lastReset = safeReset;
    return {
      Gate: state.gate,
      Out: this.safeFilterNumber(state.out * level, null),
    };
  }

  triggerCounterSample(state, trigger, reset, params, rate = sampleRate) {
    const safeTrigger = this.safeFilterNumber(trigger, null);
    const safeReset = this.safeFilterNumber(reset, null);
    const threshold = this.safeFilterNumber(params.threshold, null);
    const countMax = Math.max(1, this.safeFilterNumber(params.countMax, null));
    const increment = Math.max(0, this.safeFilterNumber(params.increment, null));
    const pulseTime = Math.max(0, this.safeFilterNumber(params.pulseTime, null));
    const level = this.safeFilterNumber(params.level, null);
    if (state.lastReset <= threshold && safeReset > threshold) {
      state.count = 0;
      state.remainingSamples = 0;
    }
    if (state.lastTrigger <= threshold && safeTrigger > threshold) {
      state.count += increment;
      if (state.count >= countMax) {
        state.count = countMax > 0 ? state.count % countMax : 0;
        state.remainingSamples = Math.max(1, Math.round(pulseTime * Math.max(1, rate)));
      }
    }
    state.lastTrigger = safeTrigger;
    state.lastReset = safeReset;
    const pulse = state.remainingSamples > 0 ? level : 0;
    state.remainingSamples = Math.max(0, state.remainingSamples - 1);
    return {
      Count: this.safeFilterNumber(this.clampValue(state.count / countMax, 0, 1) * level, null),
      Pulse: this.safeFilterNumber(pulse, null),
    };
  }

  triggerDividerSample(state, trigger, reset, params, rate = sampleRate) {
    const safeTrigger = this.safeFilterNumber(trigger, null);
    const safeReset = this.safeFilterNumber(reset, null);
    const threshold = this.safeFilterNumber(params.threshold, null);
    const division = Math.max(1, Math.min(64, Math.round(this.safeFilterNumber(params.division, null))));
    const pulseTime = Math.max(0, this.safeFilterNumber(params.pulseTime, null));
    const level = this.safeFilterNumber(params.level, null);
    if (state.lastReset <= threshold && safeReset > threshold) {
      state.count = 0;
      state.remainingSamples = 0;
    }
    if (state.lastTrigger <= threshold && safeTrigger > threshold) {
      state.count = (state.count + 1) % division;
      if (state.count === 0) {
        state.remainingSamples = Math.max(1, Math.round(pulseTime * Math.max(1, rate)));
      }
    }
    state.lastTrigger = safeTrigger;
    state.lastReset = safeReset;
    const output = state.remainingSamples > 0 ? level : 0;
    state.remainingSamples = Math.max(0, state.remainingSamples - 1);
    return this.safeFilterNumber(output, null);
  }

  exponentialCurve(value, skew) {
    const safeValue = this.clampValue(Number(value) || 0, 0, 1);
    const safeSkew = this.clampValue(Number(skew) || 0, -0.99, 0.99);
    if (safeSkew === 0) {
      return safeValue;
    }
    const c = 0.5 * (safeSkew + 1);
    const a = 2 * Math.log10((1 - c) / c);
    const denom = 1 - Math.exp(a);
    return denom === 0 ? safeValue : (1 - Math.exp(safeValue * a)) / denom;
  }

  pluckPrepareForDecay(state, rate, peak) {
    state.phasor = 0;
    state.autoReleasePhasor = 0;
    state.currentValue = peak;
    state.decayIncrement = (state.currentValue - 1) / Math.max(1, rate) / 50;
  }

  pluckTriggerAttack(state, params, rate) {
    const period = 1 / Math.max(1, rate);
    const velocity = this.clampValue(params.velocity, 0, 1);
    const sensitivity = this.clampValue(params.velocitySensitivity, 0, 1);
    const peak = (1 - sensitivity) + velocity * sensitivity;
    state.secondsPassed = 0;
    state.state = "delay";
    if (params.delayTime < period) {
      if (params.attackFeedback <= 1e-8) {
        state.state = "decay";
        this.pluckPrepareForDecay(state, rate, peak);
      } else {
        state.state = "attack";
      }
    }
    state.peak = peak;
  }

  pluckTriggerRelease(state, rate) {
    if (state.state !== "release") {
      state.state = "release";
      state.releaseIncrement = state.currentValue / Math.max(1, rate) / 50;
    }
  }

  pluckDecayFeedback(state, params) {
    let finalDecayMod = params.endingDecay;
    if (state.phasor < 1) {
      const shaped = this.exponentialCurve(state.phasor, params.decayModCurve || -1e-8);
      finalDecayMod = params.decay + params.decayModStart + shaped * (params.decayModEnd - params.decayModStart);
    }
    return Math.min(1 - 1e-6, Math.exp(-finalDecayMod * 10));
  }

  pluckEnvelopeSample(state, trigger, release, params, rate = sampleRate) {
    const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
    const period = 1 / safeRate;
    const safeTrigger = this.safeFilterNumber(trigger, null);
    const safeRelease = this.safeFilterNumber(release, null);
    const read = (key, fallback, min = -Infinity, max = Infinity) => this.clampValue(
      this.safeFilterNumber(params[key] ?? fallback, null),
      min,
      max,
    );
    const values = {
      attackFeedback: read("attackFeedback", 0.002, 0),
      autoReleaseTime: read("autoReleaseTime", 0.08, 0),
      decay: read("decay", 0.35, 0.1, 1),
      decayModCurve: read("decayModCurve", 0, -1, 1),
      decayModEnd: read("decayModEnd", 0.55, 0.01, 3),
      decayModFrequency: read("decayModFrequency", 1.5, 0, 100),
      decayModStart: read("decayModStart", 0.08, 0.001, 1.8),
      delayTime: read("delayTime", 0, 0),
      endingDecay: read("endingDecay", 0.8, 0, 1.4),
      level: read("level", 1, 0, 1),
      releaseFeedback: read("releaseFeedback", 0.35, 0, 1),
      velocity: read("velocity", 1, 0, 1),
      velocitySensitivity: read("velocitySensitivity", 0, 0, 1),
    };

    if (state.lastTrigger <= 0 && safeTrigger > 0) {
      this.pluckTriggerAttack(state, values, safeRate);
    }
    if (state.lastRelease <= 0 && safeRelease > 0) {
      this.pluckTriggerRelease(state, safeRate);
    }
    state.lastTrigger = safeTrigger;
    state.lastRelease = safeRelease;

    const attackFeedbackAmp = 1 / (Math.max(values.attackFeedback, 1e-8) * safeRate);
    const releaseFeedbackAmp = Math.min(1 - 1e-6, Math.exp(-values.releaseFeedback * 10));
    const autoReleaseIncrement = values.autoReleaseTime <= 1e-8
      ? 0
      : 1 / (Math.max(values.autoReleaseTime, 1e-8) * safeRate);
    const phasorIncrement = values.decayModFrequency / safeRate;

    switch (state.state) {
      case "delay":
        state.secondsPassed += period;
        if (state.secondsPassed >= values.delayTime) {
          state.state = "attack";
        }
        break;
      case "attack":
        state.currentValue += period + state.currentValue * attackFeedbackAmp;
        if (state.currentValue >= state.peak) {
          state.state = "decay";
          this.pluckPrepareForDecay(state, safeRate, state.peak);
        }
        break;
      case "decay":
        state.currentValue -= state.decayIncrement + state.currentValue * state.currentValue * this.pluckDecayFeedback(state, values);
        state.phasor += phasorIncrement;
        state.autoReleasePhasor += autoReleaseIncrement;
        if (autoReleaseIncrement > 0 && state.autoReleasePhasor >= 1) {
          this.pluckTriggerRelease(state, safeRate);
        }
        if (state.currentValue < 0) {
          state.currentValue = 0;
          state.secondsPassed = 0;
          state.phasor = 0;
          state.autoReleasePhasor = 0;
          state.state = "off";
        }
        break;
      case "release":
        state.currentValue -= state.releaseIncrement + state.currentValue * state.currentValue * releaseFeedbackAmp;
        if (state.currentValue <= 0) {
          state.currentValue = 0;
          state.secondsPassed = 0;
          state.phasor = 0;
          state.autoReleasePhasor = 0;
          state.state = "off";
        }
        break;
      case "off":
      default:
        break;
    }
    return this.safeFilterNumber(state.currentValue * values.level, null);
  }

  seededKey(nodeId, seed, salt) {
    return `${nodeId}.${salt}.${Math.max(0, Math.round(Number(seed) || 0))}`;
  }

  resetSeededState(state, nodeId, seed, salt) {
    const key = this.seededKey(nodeId, seed, salt);
    if (state.seedKey !== key) {
      state.seedKey = key;
      state.seed = this.stableSeed(key);
      state.gaussianSpare = null;
      state.brown = 0;
      state.pink = [0, 0, 0, 0, 0, 0, 0];
      if ("out" in state) {
        state.out = 0;
      }
      if (state.lowpass) {
        state.lowpass.outputBuffer = 0;
      }
    }
  }

  nextSeededUnipolar(state) {
    state.seed = (Math.imul(1664525, state.seed || 0x12345678) + 1013904223) >>> 0;
    return state.seed / 0xffffffff;
  }

  nextSeededBipolar(state) {
    return this.nextSeededUnipolar(state) * 2 - 1;
  }

  nextSeededGaussian(state) {
    if (state.gaussianSpare !== null && state.gaussianSpare !== undefined) {
      const spare = state.gaussianSpare;
      state.gaussianSpare = null;
      return spare;
    }
    const u1 = Math.max(1e-12, this.nextSeededUnipolar(state));
    const u2 = this.nextSeededUnipolar(state);
    const magnitude = Math.sqrt(-2 * Math.log(u1));
    const angle = Math.PI * 2 * u2;
    state.gaussianSpare = magnitude * Math.sin(angle);
    return magnitude * Math.cos(angle);
  }

  noiseGeneratorChannelSample(chanState, mode, mean, deviation) {
    const white = this.nextSeededBipolar(chanState);
    if (mode === 1) {
      return mean + this.nextSeededGaussian(chanState) * deviation;
    }
    if (mode === 2) {
      chanState.brown = this.clampValue(chanState.brown + white * Math.max(0.001, deviation) * 0.05, -1, 1);
      return mean + chanState.brown;
    }
    if (mode === 3) {
      chanState.pink[0] = 0.99886 * chanState.pink[0] + white * 0.0555179;
      chanState.pink[1] = 0.99332 * chanState.pink[1] + white * 0.0750759;
      chanState.pink[2] = 0.969   * chanState.pink[2] + white * 0.153852;
      chanState.pink[3] = 0.8665  * chanState.pink[3] + white * 0.3104856;
      chanState.pink[4] = 0.55    * chanState.pink[4] + white * 0.5329522;
      chanState.pink[5] = -0.7616 * chanState.pink[5] - white * 0.016898;
      const out = mean + (chanState.pink[0] + chanState.pink[1] + chanState.pink[2] + chanState.pink[3] + chanState.pink[4] + chanState.pink[5] + chanState.pink[6] + white * 0.5362) * 0.11;
      chanState.pink[6] = white * 0.115926;
      return out;
    }
    if (mode === 4) {
      return Math.abs(white) > 0.94 ? mean + Math.sign(white) * deviation : mean;
    }
    return mean + white * deviation;
  }

  noiseGeneratorSample(state, params, nodeId) {
    const mode = Math.max(0, Math.min(4, Math.round(this.safeFilterNumber(params.mode, null))));
    const mean = this.safeFilterNumber(params.mean, null);
    const deviation = Math.max(0, this.safeFilterNumber(params.deviation, null));
    const level = this.safeFilterNumber(params.level, null);
    const seed = this.safeFilterNumber(params.seed, null);
    if (this.nativeNoiseGeneratorReady) {
      if (!state.nativeHandle) {
        state.nativeHandle = this.nativeNoiseGenerator.soemdsp_noise_generator_create();
      }
      if (state.nativeHandle) {
        this.nativeNoiseGenerator.soemdsp_noise_generator_sample(state.nativeHandle, seed, mode, mean, deviation, level);
        return {
          "Left Out": this.safeFilterNumber(this.nativeNoiseGenerator.soemdsp_noise_generator_left(state.nativeHandle), null),
          "Right Out": this.safeFilterNumber(this.nativeNoiseGenerator.soemdsp_noise_generator_right(state.nativeHandle), null),
        };
      }
    }
    this.resetSeededState(state.left, `${nodeId}:left`, seed, "noiseGenerator");
    this.resetSeededState(state.right, `${nodeId}:right`, seed, "noiseGenerator");
    const left = this.safeFilterNumber(this.clampValue(this.noiseGeneratorChannelSample(state.left, mode, mean, deviation), -1, 1) * level, null);
    const right = this.safeFilterNumber(this.clampValue(this.noiseGeneratorChannelSample(state.right, mode, mean, deviation), -1, 1) * level, null);
    return { "Left Out": left, "Right Out": right };
  }

  rationalCurve(value, skew) {
    const t = this.clampValue(Number(value) || 0, 0, 1);
    const safeSkew = this.clampValue(Number(skew) || 0, -0.999, 0.999);
    return ((1 + safeSkew) * t) / (1 - safeSkew + 2 * safeSkew * t);
  }

  randomWalkSample(state, params, rate = sampleRate, nodeId = "") {
    this.resetSeededState(state, nodeId, params.seed, "randomWalk");
    const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
    const method = Math.max(0, Math.min(3, Math.round(this.safeFilterNumber(params.method, null))));
    const frequency = Math.max(0, this.safeFilterNumber(params.frequency, null));
    const jitter = Math.max(0, this.safeFilterNumber(params.jitter, null));
    const level = this.safeFilterNumber(params.level, null);
    const noise = this.nextSeededBipolar(state);
    const increment = this.clampValue(frequency / safeRate, 0, 1);
    const jitterInc = this.clampValue(jitter / safeRate, 0, 1);
    const stepSize = this.clampValue(increment + this.rationalCurve(jitterInc, 0.99), 0, 1);
    const averageIncrement = (jitterInc + increment) * 0.5;
    const whiteNoiseMix = averageIncrement >= 0.9
      ? this.rationalCurve((averageIncrement - 0.9) / 0.1, -0.7)
      : 0;
    const randomMix = 1 - whiteNoiseMix;

    if (method === 0) {
      return this.safeFilterNumber(noise * level, null);
    }
    if (method === 1) {
      return this.onePoleLowpassSample(state.lowpass, noise, frequency, safeRate) * level;
    }
    const step = method === 3 ? (noise > 0 ? stepSize : -stepSize) : noise * stepSize;
    state.out = this.clampValue(state.out + step, -1, 1);
    const mixed = state.out * randomMix + noise * whiteNoiseMix;
    return this.safeFilterNumber(this.onePoleLowpassSample(state.lowpass, mixed, frequency, safeRate) * level, null);
  }

  hashBipolar(index, seed) {
    let value = (Math.trunc(index) ^ Math.trunc(seed)) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 2246822507) >>> 0;
    value = Math.imul(value ^ (value >>> 13), 3266489909) >>> 0;
    value = (value ^ (value >>> 16)) >>> 0;
    return (value / 0xffffffff) * 2 - 1;
  }

  smoothNoise1d(x, seed) {
    const left = Math.floor(x);
    const frac = x - left;
    const smooth = frac * frac * (3 - 2 * frac);
    const a = this.hashBipolar(left, seed);
    const b = this.hashBipolar(left + 1, seed);
    return a + (b - a) * smooth;
  }

  fractalBrownianNoiseAxisState(state, axis) {
    const key = String(axis || "x");
    if (!state.axes || typeof state.axes !== "object") {
      state.axes = {};
    }
    if (!state.axes[key]) {
      state.axes[key] = { seedKey: "", time: 0 };
    }
    return state.axes[key];
  }

  fractalBrownianNoiseSample(state, params, rate = sampleRate, nodeId = "", axis = "x", options = {}) {
    const axisState = this.fractalBrownianNoiseAxisState(state, axis);
    const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
    const seed = Math.max(0, Math.round(this.safeFilterNumber(params.seed, null)));
    const seedKey = this.seededKey(nodeId, seed, `fractalBrownianNoise:${axis}`);
    if (axisState.seedKey !== seedKey) {
      axisState.seedKey = seedKey;
      axisState.time = 0;
    }
    const frequency = Math.max(0, this.safeFilterNumber(params.frequency, null));
    const octaves = Math.max(1, Math.min(8, Math.round(this.safeFilterNumber(params.octaves, null))));
    const persistence = this.clampValue(this.safeFilterNumber(params.persistence, null), 0, 0.99);
    const scale = Math.max(0.000001, this.safeFilterNumber(params.scale, null));
    const level = this.safeFilterNumber(params.level, null);
    let total = 0;
    let amplitude = 1;
    let noiseFrequency = 1;
    let maxValue = 0;
    const baseSeed = this.stableSeed(seedKey);
    for (let i = 0; i < octaves; i += 1) {
      total += this.smoothNoise1d(axisState.time * scale * noiseFrequency, baseSeed + i * 1013) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      noiseFrequency *= 2;
    }
    axisState.time += frequency / safeRate;
    const normalized = maxValue > 0 ? total / maxValue : 0;
    return this.safeFilterNumber(options.raw ? normalized : normalized * level, null);
  }

  fractalBrownianNoiseVector(state, params, rate = sampleRate, nodeId = "", reset = 0) {
    const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
    const resetHigh = Number(reset) > 0.5;
    if (resetHigh && !state.resetWasHigh) {
      this.resetFractalBrownianNoiseState(state);
    }
    state.resetWasHigh = resetHigh;
    if (this.nativeFbmReady) {
      if (!state.nativeHandle) {
        state.nativeHandle = this.nativeFbm.soemdsp_fbm_create();
      }
      if (state.nativeHandle) {
        const seed = Math.max(0, Math.round(this.safeFilterNumber(params.seed, null)));
        const octaves = Math.max(1, Math.min(8, Math.round(this.safeFilterNumber(params.octaves, null))));
        const persistence = this.clampValue(this.safeFilterNumber(params.persistence, null), 0, 0.99);
        const scale = Math.max(0.000001, this.safeFilterNumber(params.scale, null));
        const frequency = Math.max(0, this.safeFilterNumber(params.frequency, null));
        const level = this.safeFilterNumber(params.level, null);
        this.nativeFbm.soemdsp_fbm_sample(state.nativeHandle, seed, octaves, persistence, scale, frequency, level, safeRate);
        const rawX = this.nativeFbm.soemdsp_fbm_x_raw?.(state.nativeHandle);
        const rawY = this.nativeFbm.soemdsp_fbm_y_raw?.(state.nativeHandle);
        const rawZ = this.nativeFbm.soemdsp_fbm_z_raw?.(state.nativeHandle);
        return {
          "Out X": this.safeFilterNumber(this.nativeFbm.soemdsp_fbm_x(state.nativeHandle), null),
          "Out Y": this.safeFilterNumber(this.nativeFbm.soemdsp_fbm_y(state.nativeHandle), null),
          "Out Z": this.safeFilterNumber(this.nativeFbm.soemdsp_fbm_z(state.nativeHandle), null),
          "Out X Raw": this.safeFilterNumber(rawX ?? this.nativeFbm.soemdsp_fbm_x(state.nativeHandle), null),
          "Out Y Raw": this.safeFilterNumber(rawY ?? this.nativeFbm.soemdsp_fbm_y(state.nativeHandle), null),
          "Out Z Raw": this.safeFilterNumber(rawZ ?? this.nativeFbm.soemdsp_fbm_z(state.nativeHandle), null),
        };
      }
    }
    const rawX = this.fractalBrownianNoiseSample(state, params, safeRate, nodeId, "x", { raw: true });
    const rawY = this.fractalBrownianNoiseSample(state, params, safeRate, nodeId, "y", { raw: true });
    const rawZ = this.fractalBrownianNoiseSample(state, params, safeRate, nodeId, "z", { raw: true });
    const level = this.safeFilterNumber(params.level, null);
    return {
      "Out X": this.safeFilterNumber(rawX * level, null),
      "Out Y": this.safeFilterNumber(rawY * level, null),
      "Out Z": this.safeFilterNumber(rawZ * level, null),
      "Out X Raw": rawX,
      "Out Y Raw": rawY,
      "Out Z Raw": rawZ,
    };
  }

  expAdsrCalcCoef(rate, targetRatio) {
    const safeRate = Math.max(0, Number(rate) || 0);
    const safeRatio = Math.max(0.000000001, Number(targetRatio) || 0.000000001);
    return safeRate <= 0 ? 0 : Math.exp(-Math.log((1 + safeRatio) / safeRatio) / safeRate);
  }

  expAdsrTriggerAttack(state, delay, attack, rate = sampleRate) {
    const period = 1 / Math.max(1, rate);
    if (delay < period) {
      if (attack <= period) {
        state.state = "decay";
        state.out = 1;
      } else {
        state.state = "attack";
      }
      return;
    }
    if (state.out <= 0.000001) {
      state.out = 0;
      state.secondsPassed = 0;
    }
    state.state = "delay";
  }

  expAdsrSample(state, gate, params, rate = sampleRate) {
    const safeGate = this.safeFilterNumber(gate, null);
    const delay = Math.max(0, this.safeFilterNumber(params.delay, null));
    const attack = Math.max(0, this.safeFilterNumber(params.attack, null));
    const decay = Math.max(0, this.safeFilterNumber(params.decay, null));
    const sustain = this.clampValue(this.safeFilterNumber(params.sustain, null), 0, 1);
    const release = Math.max(0, this.safeFilterNumber(params.release, null));
    const attackShape = Math.max(0.000000001, this.safeFilterNumber(params.attackShape, null));
    const releaseShape = Math.max(0.000000001, this.safeFilterNumber(params.releaseShape, null));
    const level = this.safeFilterNumber(params.level, null);
    const looping = this.safeFilterNumber(params.loop, null) >= 0.5;
    const safeRate = Math.max(1, rate || sampleRate || 44100);
    const period = 1 / safeRate;

    if (state.lastGate <= 0 && safeGate > 0) {
      this.expAdsrTriggerAttack(state, delay, attack, safeRate);
    } else if (state.lastGate > 0 && safeGate <= 0) {
      state.state = "release";
    }
    state.lastGate = safeGate;

    const attackCoef = this.expAdsrCalcCoef(attack * safeRate, attackShape);
    const decayCoef = this.expAdsrCalcCoef(decay * safeRate, releaseShape);
    const releaseCoef = this.expAdsrCalcCoef(release * safeRate, releaseShape);
    const attackBase = (1 + attackShape) * (1 - attackCoef);
    const decayBase = (sustain - releaseShape) * (1 - decayCoef);
    const releaseBase = -releaseShape * (1 - releaseCoef);

    switch (state.state) {
      case "delay":
        state.secondsPassed += period;
        if (state.secondsPassed >= delay) {
          state.state = attack <= period ? "decay" : "attack";
          state.secondsPassed = 0;
          if (attack <= period) {
            state.out = 1;
          }
        }
        break;
      case "attack":
        state.out = attackBase + state.out * attackCoef;
        if (state.out >= 1) {
          state.out = 1;
          state.state = "decay";
        }
        break;
      case "decay":
        state.out = decayBase + state.out * decayCoef;
        if (state.out <= sustain) {
          state.out = sustain;
          state.state = "sustain";
        }
        break;
      case "sustain":
        state.out = sustain;
        if (looping) {
          this.expAdsrTriggerAttack(state, delay, attack, safeRate);
        }
        break;
      case "release":
        state.out = releaseBase + state.out * releaseCoef;
        if (state.out <= 0) {
          state.out = 0;
          state.state = "off";
        }
        break;
      case "off":
      default:
        state.out = 0;
        break;
    }

    return this.safeFilterNumber(state.out * level, null);
  }

  linearEnvelopeTriggerAttack(state, delay, attack, rate = sampleRate) {
    const period = 1 / Math.max(1, rate);
    if (delay < period) {
      if (attack <= period) {
        state.state = "decay";
        state.out = 1;
      } else {
        state.state = "attack";
      }
      return;
    }
    if (state.out <= 0.000001) {
      state.out = 0;
      state.secondsPassed = 0;
    }
    state.state = "delay";
  }

  linearEnvelopeSample(state, gate, params, rate = sampleRate) {
    const safeGate = this.safeFilterNumber(gate, null);
    const delay = Math.max(0, this.safeFilterNumber(params.delay, null));
    const attack = Math.max(0, this.safeFilterNumber(params.attack, null));
    const decay = Math.max(0, this.safeFilterNumber(params.decay, null));
    const sustain = this.clampValue(this.safeFilterNumber(params.sustain, null), 0, 1);
    const release = Math.max(0, this.safeFilterNumber(params.release, null));
    const level = this.safeFilterNumber(params.level, null);
    const looping = this.safeFilterNumber(params.loop, null) >= 0.5;
    const safeRate = Math.max(1, rate || sampleRate || 44100);
    const period = 1 / safeRate;

    if (state.lastGate <= 0 && safeGate > 0) {
      this.linearEnvelopeTriggerAttack(state, delay, attack, safeRate);
    } else if (state.lastGate > 0 && safeGate <= 0) {
      state.state = "release";
      state.releaseDecrement = state.out * period / Math.max(release, period);
    }
    state.lastGate = safeGate;

    const attackIncrement = Math.min(period / Math.max(attack, period), 1);
    const decayDecrement = (1 - sustain) * period / Math.max(decay, period);

    switch (state.state) {
      case "delay":
        state.secondsPassed += period;
        if (state.secondsPassed >= delay) {
          state.state = attack <= period ? "decay" : "attack";
          state.secondsPassed = 0;
          if (attack <= period) {
            state.out = 1;
          }
        }
        break;
      case "attack":
        state.out += attackIncrement;
        if (state.out >= 1) {
          state.out = 1;
          state.state = "decay";
        }
        break;
      case "decay":
        state.out -= decayDecrement;
        if (state.out <= sustain) {
          state.out = sustain;
          state.state = "sustain";
        }
        break;
      case "sustain":
        if (looping) {
          state.state = "attack";
        }
        state.out = sustain;
        break;
      case "release":
        state.out -= state.releaseDecrement;
        if (state.out <= 0) {
          state.out = 0;
          state.state = "off";
          state.secondsPassed = 0;
        }
        break;
      case "off":
      default:
        break;
    }

    return this.safeFilterNumber(this.clampValue(state.out, 0, 1) * level, null);
  }

  vactrolEnvelopeCoefficient(seconds, rate = sampleRate) {
    const time = Number(seconds);
    if (!Number.isFinite(time) || time <= 0) {
      return 1;
    }
    const samples = Math.max(1, time * Math.max(1, rate || sampleRate || 44100));
    return 1 - Math.exp(-1 / samples);
  }

  destroyVactrolEnvelopeNativeState(state) {
    if (state?.nativeHandle && this.nativeVactrolEnvelope?.soemdsp_vactrol_envelope_destroy) {
      this.nativeVactrolEnvelope.soemdsp_vactrol_envelope_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyLogisticMapNativeState(state) {
    if (state?.nativeHandle && this.nativeLogisticMap?.soemdsp_logistic_map_destroy) {
      this.nativeLogisticMap.soemdsp_logistic_map_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyPolyBlepNativeState(state) {
    if (state?.nativeHandle && this.nativePolyBlep?.soemdsp_polyblep_destroy) {
      this.nativePolyBlep.soemdsp_polyblep_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  vactrolEnvelopeSample(state, light, params, rate = sampleRate) {
    const safeRate = Math.max(1, rate || sampleRate || 44100);
    if (this.nativeVactrolEnvelopeReady) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeVactrolEnvelope.soemdsp_vactrol_envelope_create();
        }
        if (state.nativeHandle) {
          const out = this.nativeVactrolEnvelope.soemdsp_vactrol_envelope_sample(
            state.nativeHandle,
            this.safeFilterNumber(light, null),
            Math.max(0, this.safeFilterNumber(params.attack, null)),
            Math.max(0, this.safeFilterNumber(params.release, null)),
            Math.max(0.001, this.safeFilterNumber(params.curve, null)),
            Math.max(0, this.safeFilterNumber(params.sensitivity, null)),
            this.clampValue(this.safeFilterNumber(params.lightOffset, null), 0, 1),
            this.clampValue(this.safeFilterNumber(params.darkCurrent, null), 0, 1),
            safeRate,
          );
          state.out = this.safeFilterNumber(out, null);
          return state.out;
        }
      } catch (error) {
        this.nativeVactrolEnvelopeReady = false;
        state.nativeHandle = 0;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "vactrol_envelope",
          status: "disabled",
          message: String(error?.message || error || "native Vactrol Envelope failed"),
        });
      }
    }
    return this.vactrolEnvelopeSampleJs(state, light, params, safeRate);
  }

  vactrolEnvelopeSampleJs(state, light, params, rate = sampleRate) {
    const safeLight = this.safeFilterNumber(light, null);
    const attack = Math.max(0, this.safeFilterNumber(params.attack, null));
    const release = Math.max(0, this.safeFilterNumber(params.release, null));
    const curve = Math.max(0.001, this.safeFilterNumber(params.curve, null));
    const sensitivity = Math.max(0, this.safeFilterNumber(params.sensitivity, null));
    const lightOffset = this.clampValue(this.safeFilterNumber(params.lightOffset, null), 0, 1);
    const darkCurrent = this.clampValue(this.safeFilterNumber(params.darkCurrent, null), 0, 1);
    const safeRate = Math.max(1, rate || sampleRate || 44100);
    const target = this.clampValue(safeLight * sensitivity + lightOffset, 0, 1);
    const coefficient = target > state.raw
      ? this.vactrolEnvelopeCoefficient(attack, safeRate)
      : this.vactrolEnvelopeCoefficient(release, safeRate);
    state.raw += (target - state.raw) * coefficient;
    const shaped = Math.pow(this.clampValue(state.raw, 0, 1), curve);
    state.out = this.clampValue(darkCurrent + shaped * (1 - darkCurrent), 0, 1);
    return this.safeFilterNumber(state.out, null);
  }

  flowerChildSecondsToSamples(seconds, rate = sampleRate) {
    const time = Number(seconds);
    if (!Number.isFinite(time) || time <= 0) {
      return 1;
    }
    return Math.max(1, time * Math.max(1, rate || sampleRate || 44100));
  }

  flowerChildEnvelopeFollowerSample(state, input, params, rate = sampleRate) {
    const target = this.clampValue(Math.abs(this.safeFilterNumber(input, null)), 0, 1);
    const attackSamples = this.flowerChildSecondsToSamples(this.safeFilterNumber(params.attack, null), rate);
    const holdSamples = this.flowerChildSecondsToSamples(this.safeFilterNumber(params.hold, null), rate);
    const decaySamples = this.flowerChildSecondsToSamples(this.safeFilterNumber(params.decay, null), rate);
    const attackStep = 1 / attackSamples;
    const decayStep = 1 / decaySamples;
    const current = this.clampValue(Number(state.currentSlewedValue) || 0, 0, 1);
    if (target >= current) {
      state.currentSlewedValue = Math.min(target, current + attackStep);
      state.holdCounter = holdSamples;
    } else if ((Number(state.holdCounter) || 0) > 0) {
      state.holdCounter = Math.max(0, (Number(state.holdCounter) || 0) - 1);
      state.currentSlewedValue = current;
    } else {
      state.currentSlewedValue = Math.max(target, current - decayStep);
    }
    state.out = this.safeFilterNumber(this.clampValue(state.currentSlewedValue, 0, 1), null);
    return state.out;
  }

  createSpiralState() {
    return {
      morph: 0,
      phase: 0,
      position: 0,
      rotX: 0,
      rotY: 0,
      zHistory: 0,
    };
  }

  createLorenzAttractorState() {
    return {
      resetWasHigh: false,
      x: 0.1,
      y: 0,
      z: 0,
    };
  }

  resetLorenzAttractorState(state) {
    state.x = 0.1;
    state.y = 0;
    state.z = 0;
  }

  lorenzAttractorSample(options = {}) {
    const state = options.state || this.createLorenzAttractorState();
    const resetHigh = Number(options.reset) > 0.5;
    if (resetHigh && !state.resetWasHigh) {
      this.resetLorenzAttractorState(state);
    }
    state.resetWasHigh = resetHigh;
    const sampleRateValue = Math.max(1, Number(options.sampleRate) || sampleRate || 44100);
    const speed = Math.max(0, Number(options.speed) || 0);
    const sigma = Math.max(0, Number(options.sigma) || 10);
    const rho = Number.isFinite(Number(options.rho)) ? Number(options.rho) : 28;
    const beta = Math.max(0, Number(options.beta) || 8 / 3);
    const dt = (0.75 * speed) / sampleRateValue;
    const steps = Math.max(1, Math.ceil(dt / 0.0007));
    const stepDt = steps > 0 ? dt / steps : 0;
    for (let index = 0; index < steps; index += 1) {
      const dx = sigma * (state.y - state.x);
      const dy = state.x * (rho - state.z) - state.y;
      const dz = state.x * state.y - beta * state.z;
      state.x += dx * stepDt;
      state.y += dy * stepDt;
      state.z += dz * stepDt;
      if (!Number.isFinite(state.x) || !Number.isFinite(state.y) || !Number.isFinite(state.z)) {
        this.resetLorenzAttractorState(state);
        break;
      }
    }
    const rotate = (Number(options.rotate) || 0) * Math.PI * 2;
    const cosRotate = Math.cos(rotate);
    const sinRotate = Math.sin(rotate);
    const normalizedX = state.x / 24;
    const normalizedY = state.y / 32;
    const normalizedZ = (state.z - 25) / 30;
    const depth = this.clampValue(Number(options.zDepth) || 0, 0, 1);
    const depthScale = 1 + normalizedZ * depth * 0.35;
    const scale = Math.max(0, Number(options.scale) || 1) * depthScale;
    const x = (normalizedX * cosRotate - normalizedY * sinRotate) * scale;
    const y = (normalizedX * sinRotate + normalizedY * cosRotate) * scale;
    const z = normalizedZ * scale;
    return {
      x: this.clampValue(x, -1, 1),
      y: this.clampValue(y, -1, 1),
      z: this.clampValue(z, -1, 1),
    };
  }

  createLogisticMapState() {
    return {
      hasStarted: false,
      phase: 0,
      x: 0.5,
      nativeHandle: 0,
    };
  }

  resetLogisticMapState(state, seed) {
    state.x = this.clampValue(Number(seed) || 0.5, 0.0001, 0.9999);
    state.phase = 0;
    state.hasStarted = true;
  }

  logisticMapSampleJs(state, options = {}) {
    const resetActive = Number(options.reset) > 0;
    const sampleRateValue = Math.max(1, Number(options.sampleRate) || sampleRate || 44100);
    const rate = Math.max(0, Number(options.rate) || 0);
    const r = this.clampValue(Number(options.r) || 0, 0, 4);
    const seed = this.clampValue(Number(options.seed) || 0.5, 0.0001, 0.9999);
    if (resetActive || !state.hasStarted) {
      this.resetLogisticMapState(state, seed);
    }
    if (!resetActive && rate > 0) {
      state.phase += rate / sampleRateValue;
      let iterations = 0;
      while (state.phase >= 1 && iterations < 4096) {
        state.phase -= 1;
        state.x = this.clampValue(r * state.x * (1 - state.x), 0, 1);
        iterations++;
      }
      if (state.phase >= 1) {
        state.phase = 0;
      }
    }
    return state.x * 2 - 1;
  }

  logisticMapSample(state, options = {}) {
    const level = Number(options.level) || 0;
    if (
      this.nativeLogisticMapReady &&
      this.nativeLogisticMap?.soemdsp_logistic_map_create &&
      this.nativeLogisticMap?.soemdsp_logistic_map_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeLogisticMap.soemdsp_logistic_map_create();
        }
        if (state.nativeHandle) {
          const resetActive = Number(options.reset) > 0 ? 1 : 0;
          const rate = Math.max(0, Number(options.rate) || 0);
          const r = this.clampValue(Number(options.r) || 0, 0, 4);
          const seed = this.clampValue(Number(options.seed) || 0.5, 0.0001, 0.9999);
          const sampleRateValue = Math.max(1, Number(options.sampleRate) || sampleRate || 44100);
          const scaled = this.nativeLogisticMap.soemdsp_logistic_map_sample(
            state.nativeHandle,
            resetActive,
            rate,
            r,
            seed,
            level,
            sampleRateValue,
          );
          return this.safeFilterNumber(scaled, null);
        }
      } catch (error) {
        this.nativeLogisticMapReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "logistic_map",
          status: "disabled",
          message: String(error?.message || error || "native Logistic Map failed"),
        });
      }
    }
    return this.logisticMapSampleJs(state, options) * level;
  }

  createHenonMapState() {
    return { hasStarted: false, phase: 0, x: 0, y: 0, nativeHandle: 0 };
  }

  resetHenonMapState(state, seedX, seedY) {
    state.x = this.clampValue(Number(seedX) || 0, -1, 1);
    state.y = this.clampValue(Number(seedY) || 0, -1, 1);
    state.phase = 0;
    state.hasStarted = true;
  }

  destroyHenonMapNativeState(state) {
    if (state?.nativeHandle && this.nativeHenonMap?.soemdsp_henon_map_destroy) {
      this.nativeHenonMap.soemdsp_henon_map_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  henonMapSampleJs(state, options = {}) {
    const resetActive = Number(options.reset) > 0;
    const sampleRateValue = Math.max(1, Number(options.sampleRate) || sampleRate || 44100);
    const rate = Math.max(0, Number(options.rate) || 0);
    const a = this.clampValue(Number(options.a) || 0, 0, 2);
    const b = this.clampValue(Number(options.b) || 0, -1, 1);
    if (resetActive || !state.hasStarted) {
      this.resetHenonMapState(state, options.seedX, options.seedY);
    }
    if (!resetActive && rate > 0) {
      state.phase += rate / sampleRateValue;
      let iterations = 0;
      while (state.phase >= 1 && iterations < 4096) {
        state.phase -= 1;
        const nextX = 1 - a * state.x * state.x + state.y;
        const nextY = b * state.x;
        state.x = this.clampValue(nextX, -4, 4);
        state.y = this.clampValue(nextY, -4, 4);
        iterations++;
      }
      if (state.phase >= 1) {
        state.phase = 0;
      }
    }
    return {
      x: this.clampValue(state.x / 1.5, -1, 1),
      y: this.clampValue(state.y / 0.45, -1, 1),
    };
  }

  henonMapSample(state, options = {}) {
    if (
      this.nativeHenonMapReady &&
      this.nativeHenonMap?.soemdsp_henon_map_create &&
      this.nativeHenonMap?.soemdsp_henon_map_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeHenonMap.soemdsp_henon_map_create();
        }
        if (state.nativeHandle) {
          const resetActive = Number(options.reset) > 0 ? 1 : 0;
          const rate = Math.max(0, Number(options.rate) || 0);
          const a = this.clampValue(Number(options.a) || 0, 0, 2);
          const b = this.clampValue(Number(options.b) || 0, -1, 1);
          const seedX = Number(options.seedX) || 0;
          const seedY = Number(options.seedY) || 0;
          const sampleRateValue = Math.max(1, Number(options.sampleRate) || sampleRate || 44100);
          this.nativeHenonMap.soemdsp_henon_map_sample(
            state.nativeHandle,
            resetActive,
            rate,
            a,
            b,
            seedX,
            seedY,
            sampleRateValue,
          );
          return {
            x: this.safeFilterNumber(this.nativeHenonMap.soemdsp_henon_map_x(state.nativeHandle), null),
            y: this.safeFilterNumber(this.nativeHenonMap.soemdsp_henon_map_y(state.nativeHandle), null),
          };
        }
      } catch (error) {
        this.nativeHenonMapReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "henon_map",
          status: "disabled",
          message: String(error?.message || error || "native Henon Map failed"),
        });
      }
    }
    return this.henonMapSampleJs(state, options);
  }

  createChuaAttractorState() {
    return { resetWasHigh: false, x: 0.1, y: 0, z: 0, nativeHandle: 0 };
  }

  resetChuaAttractorState(state) {
    state.x = 0.1;
    state.y = 0;
    state.z = 0;
  }

  destroyChuaAttractorNativeState(state) {
    if (state?.nativeHandle && this.nativeChuaAttractor?.soemdsp_chua_attractor_destroy) {
      this.nativeChuaAttractor.soemdsp_chua_attractor_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  chuaDiode(x, m0, m1) {
    return m1 * x + 0.5 * (m0 - m1) * (Math.abs(x + 1) - Math.abs(x - 1));
  }

  chuaAttractorSampleJs(state, options = {}) {
    const resetHigh = Number(options.reset) > 0.5;
    if (resetHigh && !state.resetWasHigh) {
      this.resetChuaAttractorState(state);
    }
    state.resetWasHigh = resetHigh;
    const sampleRateValue = Math.max(1, Number(options.sampleRate) || sampleRate || 44100);
    const speed = Math.max(0, Number(options.speed) || 0);
    const alpha = Number(options.alpha) || 0;
    const beta = Number(options.beta) || 0;
    const m0 = Number(options.m0) || 0;
    const m1 = Number(options.m1) || 0;
    const dt = (0.6 * speed) / sampleRateValue;
    const steps = Math.max(1, Math.ceil(dt / 0.0004));
    const stepDt = steps > 0 ? dt / steps : 0;
    for (let i = 0; i < steps; i += 1) {
      const fx = this.chuaDiode(state.x, m0, m1);
      const dx = alpha * (state.y - state.x - fx);
      const dy = state.x - state.y + state.z;
      const dz = -beta * state.y;
      state.x += dx * stepDt;
      state.y += dy * stepDt;
      state.z += dz * stepDt;
      if (!Number.isFinite(state.x) || !Number.isFinite(state.y) || !Number.isFinite(state.z)) {
        this.resetChuaAttractorState(state);
        break;
      }
    }
    state.x = this.clampValue(state.x, -20, 20);
    state.y = this.clampValue(state.y, -20, 20);
    state.z = this.clampValue(state.z, -20, 20);
    return {
      x: this.clampValue(state.x / 2.0, -1, 1),
      y: this.clampValue(state.y / 0.5, -1, 1),
      z: this.clampValue(state.z / 3.5, -1, 1),
    };
  }

  chuaAttractorSample(state, options = {}) {
    if (
      this.nativeChuaAttractorReady &&
      this.nativeChuaAttractor?.soemdsp_chua_attractor_create &&
      this.nativeChuaAttractor?.soemdsp_chua_attractor_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeChuaAttractor.soemdsp_chua_attractor_create();
        }
        if (state.nativeHandle) {
          const resetActive = Number(options.reset) > 0.5 ? 1 : 0;
          const speed = Math.max(0, Number(options.speed) || 0);
          const alpha = Number(options.alpha) || 0;
          const beta = Number(options.beta) || 0;
          const m0 = Number(options.m0) || 0;
          const m1 = Number(options.m1) || 0;
          const sampleRateValue = Math.max(1, Number(options.sampleRate) || sampleRate || 44100);
          this.nativeChuaAttractor.soemdsp_chua_attractor_sample(
            state.nativeHandle,
            resetActive,
            speed,
            alpha,
            beta,
            m0,
            m1,
            sampleRateValue,
          );
          return {
            x: this.safeFilterNumber(this.nativeChuaAttractor.soemdsp_chua_attractor_x(state.nativeHandle), null),
            y: this.safeFilterNumber(this.nativeChuaAttractor.soemdsp_chua_attractor_y(state.nativeHandle), null),
            z: this.safeFilterNumber(this.nativeChuaAttractor.soemdsp_chua_attractor_z(state.nativeHandle), null),
          };
        }
      } catch (error) {
        this.nativeChuaAttractorReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "chua_attractor",
          status: "disabled",
          message: String(error?.message || error || "native Chua Attractor failed"),
        });
      }
    }
    return this.chuaAttractorSampleJs(state, options);
  }

  createChordMemoryState() {
    return {
      latchWasHigh: false,
      clearWasHigh: false,
      advanceWasHigh: false,
      writeIndex: 0,
      arpIndex: 0,
      slots: [0, 0, 0, 0],
      slotsActive: [false, false, false, false],
    };
  }

  chordMemorySample(state, options = {}) {
    const latchHigh = Number(options.latch) > 0;
    const clearHigh = Number(options.clear) > 0;
    const advanceHigh = Number(options.advance) > 0;
    const pitch = Number(options.pitch) || 0;
    if (clearHigh && !state.clearWasHigh) {
      state.slots = [0, 0, 0, 0];
      state.slotsActive = [false, false, false, false];
      state.writeIndex = 0;
      state.arpIndex = 0;
    }
    state.clearWasHigh = clearHigh;
    if (latchHigh && !state.latchWasHigh) {
      state.slots[state.writeIndex] = pitch;
      state.slotsActive[state.writeIndex] = true;
      state.writeIndex = (state.writeIndex + 1) % 4;
    }
    state.latchWasHigh = latchHigh;
    const activeIndices = [];
    for (let i = 0; i < 4; i += 1) {
      if (state.slotsActive[i]) activeIndices.push(i);
    }
    if (advanceHigh && !state.advanceWasHigh && activeIndices.length > 0) {
      const currentPos = activeIndices.indexOf(state.arpIndex);
      const nextPos = currentPos === -1 ? 0 : (currentPos + 1) % activeIndices.length;
      state.arpIndex = activeIndices[nextPos];
    }
    state.advanceWasHigh = advanceHigh;
    const arp = activeIndices.length > 0 ? state.slots[state.arpIndex] : 0;
    const gate = activeIndices.length > 0 ? 1 : 0;
    return {
      "Note 1": state.slots[0],
      "Note 2": state.slots[1],
      "Note 3": state.slots[2],
      "Note 4": state.slots[3],
      Arp: arp,
      Gate: gate,
    };
  }

  createTuringMachineState() {
    return { clockWasHigh: false, resetWasHigh: false, register: 0 };
  }

  turingMachineSample(state, options = {}) {
    const clockHigh = Number(options.clock) > 0;
    const resetHigh = Number(options.reset) > 0;
    const length = Math.max(1, Math.min(16, Math.round(Number(options.length) || 8)));
    const probability = this.clampValue(Number(options.probability) || 0, 0, 1);
    const level = Number(options.level) || 0;
    if (resetHigh && !state.resetWasHigh) {
      state.register = 0;
    }
    state.resetWasHigh = resetHigh;
    if (clockHigh && !state.clockWasHigh) {
      const mask = (1 << length) - 1;
      const topBit = (state.register >> (length - 1)) & 1;
      const newBit = Math.random() < probability ? 1 - topBit : topBit;
      state.register = ((state.register << 1) | newBit) & mask;
    }
    state.clockWasHigh = clockHigh;
    const mask = (1 << length) - 1;
    const maxValue = mask > 0 ? mask : 1;
    const cv = (state.register / maxValue) * 2 - 1;
    const scaleMask = state.register & 0xFFF;
    const gate = state.register & 1;
    return {
      CV: cv * level,
      Scale: scaleMask,
      Gate: gate * level,
    };
  }

  createPitchQuantizerState() {
    return { hasOutput: false, lastOutput: 0, nativeHandle: 0 };
  }

  destroyPitchQuantizerNativeState(state) {
    if (state?.nativeHandle && this.nativePitchQuantizer?.soemdsp_pitch_quantizer_destroy) {
      this.nativePitchQuantizer.soemdsp_pitch_quantizer_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  pitchQuantizerMaskFromChoice(choiceIndex) {
    const masks = [4095, 2741, 1453, 661, 1193, 1365];
    const index = Math.max(0, Math.min(masks.length - 1, Math.round(Number(choiceIndex) || 0)));
    return masks[index];
  }

  pitchQuantizerSampleJs(state, options = {}) {
    const pitch = Number(options.pitch) || 0;
    const mask = options.hasScaleInput
      ? Math.round(Number(options.scaleInput) || 0) & 0xFFF
      : this.pitchQuantizerMaskFromChoice(options.scaleChoice);
    if (mask === 0) {
      return state.hasOutput ? state.lastOutput : pitch;
    }
    const semitoneFloat = pitch * 120;
    const rounded = Math.round(semitoneFloat);
    let bestSemitone = rounded;
    let bestDistance = Infinity;
    let found = false;
    for (let radius = 0; radius <= 12 && !found; radius += 1) {
      const signs = radius === 0 ? [0] : [-1, 1];
      for (const sign of signs) {
        const candidate = rounded + sign * radius;
        const pitchClass = ((candidate % 12) + 12) % 12;
        if (!((mask >> pitchClass) & 1)) continue;
        const distance = Math.abs(candidate - semitoneFloat);
        if (!found || distance < bestDistance) {
          found = true;
          bestDistance = distance;
          bestSemitone = candidate;
        }
      }
    }
    const output = found ? bestSemitone / 120 : pitch;
    state.hasOutput = true;
    state.lastOutput = output;
    return output;
  }

  pitchQuantizerSample(state, options = {}) {
    const pitch = Number(options.pitch) || 0;
    const mask = options.hasScaleInput
      ? Math.round(Number(options.scaleInput) || 0) & 0xFFF
      : this.pitchQuantizerMaskFromChoice(options.scaleChoice);
    if (
      this.nativePitchQuantizerReady &&
      this.nativePitchQuantizer?.soemdsp_pitch_quantizer_create &&
      this.nativePitchQuantizer?.soemdsp_pitch_quantizer_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativePitchQuantizer.soemdsp_pitch_quantizer_create();
        }
        if (state.nativeHandle) {
          const output = this.nativePitchQuantizer.soemdsp_pitch_quantizer_sample(
            state.nativeHandle,
            pitch,
            mask,
          );
          const safeOutput = this.safeFilterNumber(output, null);
          state.hasOutput = true;
          state.lastOutput = safeOutput;
          return safeOutput;
        }
      } catch (error) {
        this.nativePitchQuantizerReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "pitch_quantizer",
          status: "disabled",
          message: String(error?.message || error || "native Pitch Quantizer failed"),
        });
      }
    }
    return this.pitchQuantizerSampleJs(state, options);
  }

  createSurgeOscillatorState() {
    return {
      phase: 0,
      prevSyncIn: 0,
      hasPrevSyncIn: false,
      syncedThisSample: false,
      triangleIntegrator: 0,
      masterPhase: 0,
      internalSyncOut: 0,
      nativeHandle: 0,
    };
  }

  destroySurgeOscillatorNativeState(state) {
    if (state?.nativeHandle && this.nativeSurgeOscillator?.soemdsp_surge_oscillator_destroy) {
      this.nativeSurgeOscillator.soemdsp_surge_oscillator_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  surgeOscillatorWaveformSampleJs(state, phaseCycle, phaseIncrement, waveform) {
    switch (waveform) {
      case 1:
        return this.polyBlepSquare(phaseCycle, phaseIncrement);
      case 2: {
        const next = this.clampValue(
          (state.triangleIntegrator + this.polyBlepSquare(phaseCycle, phaseIncrement) * phaseIncrement * 4) * 0.995,
          -1,
          1,
        );
        state.triangleIntegrator = next;
        return next;
      }
      case 3:
        return Math.sin(phaseCycle * Math.PI * 2);
      default:
        return -1 + phaseCycle * 2 - this.polyBlep(phaseCycle, phaseIncrement);
    }
  }

  surgeOscillatorSampleJs(state, options = {}) {
    const sampleRate = Number(options.sampleRate) > 1 ? Number(options.sampleRate) : 48000;
    const increment = this.clampValue((Number(options.frequencyHz) || 0) / sampleRate, -0.5, 0.5);
    const level = Number(options.level) || 0;

    state.phase = this.wrapValue(state.phase + increment, 0, 1);
    state.syncedThisSample = false;

    const masterIncrement = this.clampValue((Number(options.syncFrequencyHz) || 0) / sampleRate, -0.5, 0.5);
    state.masterPhase = this.wrapValue(state.masterPhase + masterIncrement, 0, 1);
    state.internalSyncOut = Math.sin(state.masterPhase * Math.PI * 2);

    const effectiveSyncIn = options.hasExternalSync ? (Number(options.syncIn) || 0) : state.internalSyncOut;

    if (state.hasPrevSyncIn && state.prevSyncIn <= 0 && effectiveSyncIn > 0) {
      const denom = effectiveSyncIn - state.prevSyncIn;
      const frac = denom > 1e-9 ? this.clampValue(-state.prevSyncIn / denom, 0, 1) : 0;
      state.phase = this.wrapValue((1 - frac) * increment, 0, 1);
      state.syncedThisSample = true;
    }
    state.prevSyncIn = effectiveSyncIn;
    state.hasPrevSyncIn = true;

    const phaseCycle = state.phase;
    const saw = this.surgeOscillatorWaveformSampleJs(state, phaseCycle, increment, 0) * level;
    const square = this.surgeOscillatorWaveformSampleJs(state, phaseCycle, increment, 1) * level;
    const tri = this.surgeOscillatorWaveformSampleJs(state, phaseCycle, increment, 2) * level;
    const sine = this.surgeOscillatorWaveformSampleJs(state, phaseCycle, increment, 3) * level;

    const waveform = Math.max(0, Math.min(3, Math.round(Number(options.waveform) || 0)));
    const out = [saw, square, tri, sine][waveform];

    return {
      Out: out,
      Saw: saw,
      Square: square,
      Tri: tri,
      Sine: sine,
      Synced: state.syncedThisSample ? 1 : 0,
      "Internal Sync": state.internalSyncOut,
    };
  }

  surgeOscillatorSample(state, options = {}) {
    if (
      this.nativeSurgeOscillatorReady &&
      this.nativeSurgeOscillator?.soemdsp_surge_oscillator_create &&
      this.nativeSurgeOscillator?.soemdsp_surge_oscillator_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeSurgeOscillator.soemdsp_surge_oscillator_create();
        }
        if (state.nativeHandle) {
          const sampleRate = Number(options.sampleRate) > 1 ? Number(options.sampleRate) : 48000;
          const frequencyHz = Number(options.frequencyHz) || 0;
          const syncIn = Number(options.syncIn) || 0;
          const hasExternalSync = options.hasExternalSync ? 1 : 0;
          const syncFrequencyHz = Number(options.syncFrequencyHz) || 0;
          const waveform = Math.max(0, Math.min(3, Math.round(Number(options.waveform) || 0)));
          const level = Number(options.level) || 0;
          this.nativeSurgeOscillator.soemdsp_surge_oscillator_sample(
            state.nativeHandle,
            frequencyHz,
            sampleRate,
            syncIn,
            hasExternalSync,
            syncFrequencyHz,
            waveform,
            level,
          );
          return {
            Out: Number(this.nativeSurgeOscillator.soemdsp_surge_oscillator_out(state.nativeHandle)) || 0,
            Saw: Number(this.nativeSurgeOscillator.soemdsp_surge_oscillator_saw(state.nativeHandle)) || 0,
            Square: Number(this.nativeSurgeOscillator.soemdsp_surge_oscillator_square(state.nativeHandle)) || 0,
            Tri: Number(this.nativeSurgeOscillator.soemdsp_surge_oscillator_tri(state.nativeHandle)) || 0,
            Sine: Number(this.nativeSurgeOscillator.soemdsp_surge_oscillator_sine(state.nativeHandle)) || 0,
            Synced: Number(this.nativeSurgeOscillator.soemdsp_surge_oscillator_synced(state.nativeHandle)) || 0,
            "Internal Sync": Number(this.nativeSurgeOscillator.soemdsp_surge_oscillator_internal_sync(state.nativeHandle)) || 0,
          };
        }
      } catch (error) {
        this.nativeSurgeOscillatorReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "surge_oscillator",
          status: "disabled",
          message: String(error?.message || error || "native Surge Oscillator failed"),
        });
      }
    }
    return this.surgeOscillatorSampleJs(state, options);
  }

  createDsfOscillatorState() {
    return { t: 0, sawAcc: 0, sqAcc: 0, blendSqAcc: 0, triAcc: 0, triPeak: 1, nativeHandle: 0 };
  }

  destroyDsfOscillatorNativeState(state) {
    if (state?.nativeHandle && this.nativeDsfOscillator?.soemdsp_dsf_oscillator_destroy) {
      this.nativeDsfOscillator.soemdsp_dsf_oscillator_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  // pureSawEng(t, n), transcribed and simplified directly from "Extended
  // DSF Oscillators.cxx": sin(PI*t*(2N+1)) / sin(PI*t) - 1. Guarded at the
  // removable singularity t=0 via its L'Hopital limit (2N+1).
  dsfPureSawEng(t, n) {
    const denom = Math.sin(Math.PI * t);
    if (denom > -1e-9 && denom < 1e-9) return (2 * n + 1) - 1;
    return Math.sin(Math.PI * t * (2 * n + 1)) / denom - 1;
  }

  // Harmonics (0-1): crossfades the harmonic count from 1 (a single
  // harmonic, an exact sine) up to nMax (Nyquist/frequency).
  dsfPureSawEngMorphed(t, nMax, morph) {
    const m = this.clampValue(Number(morph) || 0, 0, 1);
    const target = 1 + m * (nMax - 1);
    const lowN = Math.max(1, Math.floor(target));
    const highN = Math.min(lowN + 1, nMax);
    const frac = target - lowN;
    return this.dsfPureSawEng(t, lowN) * (1 - frac) + this.dsfPureSawEng(t, highN) * frac;
  }

  // ~20 periods of memory, decayed to ~1%. Every accumulator's retention
  // scales with the oscillation period instead of a fixed per-sample
  // constant -- a fixed retention was far shorter than the period at low
  // frequencies, so accumulators forgot mid-ramp and produced distorted,
  // asymmetric shapes (Trimorph sounding like a square wave; DC
  // asymmetry in Saw/Square/SquSaw). See dsf_oscillator.cpp for the full
  // story.
  dsfAdaptiveRetention(dt) {
    return Math.exp(-0.23026 * dt);
  }

  // waveform: 0=Sine, 1=Saw, 2=Square (PWM), 3=Trimorph, 4=SquSaw.
  // Square: saw(t) - saw(t - pulseWidth) -- alias-free since it's a
  // subtraction of phase-shifted copies of an already-verified Saw.
  // Trimorph: a second leaky integration on the (bounded) Square output,
  // with an adaptive peak-follower since that second stage doesn't stay
  // bounded on its own across the full frequency range.
  dsfOscillatorSampleJs(state, options = {}) {
    const sampleRate = Number(options.sampleRate) > 1 ? Number(options.sampleRate) : 48000;
    const safeFrequency = Number(options.frequencyHz) > 1 ? Number(options.frequencyHz) : 1;
    const dt = this.clampValue((Number(options.frequencyHz) || 0) / sampleRate, -0.5, 0.5);
    const waveform = Math.round(Number(options.waveform) || 0);
    const level = Number(options.level) || 0;

    let sample;
    if (waveform === 0) {
      state.t = this.wrapValue(state.t + dt, 0, 1);
      sample = Math.sin(state.t * Math.PI * 2);
    } else {
      const nyquist = sampleRate * 0.5;
      const nMax = Math.max(1, Math.floor(nyquist / safeFrequency));
      state.t = this.wrapValue(state.t + dt * 0.9999, 0, 1);

      const retention = this.dsfAdaptiveRetention(dt);
      const rawSaw = this.dsfPureSawEngMorphed(state.t, nMax, options.morph);
      state.sawAcc = state.sawAcc * retention + rawSaw * dt;

      if (waveform === 1) {
        sample = state.sawAcc;
      } else if (waveform === 4) {
        // SquSaw: crossfades Saw with a plain, fixed 50%-duty Square,
        // decoupled from the PWM slider on purpose -- reported live as
        // sounding "triangle-like" when it inherited PWM's variable duty
        // cycle; simplified back to always crossfading two cleanly-
        // shaped waveforms instead.
        const rawBlendSquare = rawSaw - this.dsfPureSawEngMorphed(this.wrapValue(state.t - 0.5, 0, 1), nMax, options.morph);
        state.blendSqAcc = state.blendSqAcc * retention + rawBlendSquare * dt;
        const blend = this.clampValue(Number(options.blend) ?? 0.5, 0, 1);
        sample = state.sawAcc * (1 - blend) + state.blendSqAcc * blend;
      } else {
        const pw = this.clampValue(Number(options.pulseWidth) ?? 0.5, 0.01, 0.99);
        const rawShiftedSaw = this.dsfPureSawEngMorphed(this.wrapValue(state.t - pw, 0, 1), nMax, options.morph);
        const rawSquare = rawSaw - rawShiftedSaw;
        state.sqAcc = state.sqAcc * retention + rawSquare * dt;

        if (waveform === 2) {
          sample = state.sqAcc;
        } else {
          state.triAcc = state.triAcc * retention + state.sqAcc * dt * 4;
          // Compensate for the fundamental's own amplitude shrinking
          // toward 0 as pulseWidth approaches 0 or 1 -- reported live as
          // Trimorph going quiet toward silence at extreme PWM.
          const compensation = 1 / this.clampValue(Math.abs(Math.sin(Math.PI * pw)), 0.05, 1);
          const compensatedTri = state.triAcc * compensation;
          state.triPeak = Math.max(1, state.triPeak * 0.999 + Math.abs(compensatedTri) * 0.001);
          sample = compensatedTri / state.triPeak;
        }
      }
    }

    if (!Number.isFinite(sample)) sample = 0;
    const out = this.clampValue(sample, -1.5, 1.5) * level;
    return { Out: out };
  }

  dsfOscillatorSample(state, options = {}) {
    if (
      this.nativeDsfOscillatorReady &&
      this.nativeDsfOscillator?.soemdsp_dsf_oscillator_create &&
      this.nativeDsfOscillator?.soemdsp_dsf_oscillator_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeDsfOscillator.soemdsp_dsf_oscillator_create();
        }
        if (state.nativeHandle) {
          const sampleRate = Number(options.sampleRate) > 1 ? Number(options.sampleRate) : 48000;
          const frequencyHz = Number(options.frequencyHz) || 0;
          const waveform = Math.round(Number(options.waveform) || 0);
          const morph = Number(options.morph) || 0;
          const pulseWidth = Number(options.pulseWidth) ?? 0.5;
          const blend = Number(options.blend) ?? 0.5;
          const level = Number(options.level) || 0;
          this.nativeDsfOscillator.soemdsp_dsf_oscillator_sample(
            state.nativeHandle,
            frequencyHz,
            sampleRate,
            waveform,
            morph,
            pulseWidth,
            blend,
            level,
          );
          return {
            Out: Number(this.nativeDsfOscillator.soemdsp_dsf_oscillator_out(state.nativeHandle)) || 0,
          };
        }
      } catch (error) {
        this.nativeDsfOscillatorReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "dsf_oscillator",
          status: "disabled",
          message: String(error?.message || error || "native DSF Oscillator failed"),
        });
      }
    }
    return this.dsfOscillatorSampleJs(state, options);
  }

  // RobinSupersaw -- see native_modules/robin_supersaw/robin_supersaw.cpp
  // for the full derivation (Robin Schmidt's pitch dithering,
  // RobinSchmidt/RS-MET). This worklet's JS fallback is fully self-
  // contained (not calling the shared public/node-graph-robin-supersaw.js
  // globals) -- the AudioWorkletProcessor runs in its own isolated global
  // scope that never loads that file. Calling those globals here silently
  // threw a ReferenceError inside the audio thread whenever the native
  // path wasn't active, producing total silence with no visible console
  // error -- the same pitfall DSF Oscillator's fallback already avoids by
  // inlining its own copy instead of sharing one.
  createRobinSupersawDitherVoice() {
    return { sampleCount: 0, lenNow: 100, lenMid: 100, probShort: 0, probMid: 1, phaseSlope: 1 / 99 };
  }

  createRobinSupersawState() {
    const left = [];
    const right = [];
    for (let i = 0; i < 9; i++) {
      left.push(this.createRobinSupersawDitherVoice());
      right.push(this.createRobinSupersawDitherVoice());
    }
    return { left, right, nativeHandle: 0 };
  }

  destroyRobinSupersawNativeState(state) {
    if (state?.nativeHandle && this.nativeRobinSupersaw?.soemdsp_robin_supersaw_destroy) {
      this.nativeRobinSupersaw.soemdsp_robin_supersaw_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  // rsPitchDitherOsc<T>::calcCycleDistribution(), transcribed.
  robinSupersawCalcCycleDistribution(c) {
    const ci = Math.floor(c);
    const cf = c - ci;
    let c2 = ci;
    if (cf >= 0.5) c2 += 1;
    const c1 = c2 - 1;
    const c3 = c2 + 1;
    const e1 = c1 - c;
    const e2 = c2 - c;
    const e3 = c3 - c;
    const v1 = e1 * e1;
    const v2 = e2 * e2;
    const v3 = e3 * e3;
    const v = 0.25;
    const d1 = v - v1;
    const d2 = v - v2;
    const d3 = v - v3;
    const s = 1 / (e3 * (v1 - v2) - e2 * (v1 - v3) + e1 * (v2 - v3));
    return { lenMid: c2, probShort: (d2 * e3 - d3 * e2) * s, probMid: (d3 * e1 - d1 * e3) * s };
  }

  // rsPitchDitherOsc<T>::updateCycleLength(), transcribed.
  robinSupersawUpdateCycleLength(voice) {
    const r = Math.random();
    if (r < voice.probShort) {
      voice.lenNow = voice.lenMid - 1;
    } else if (r < voice.probShort + voice.probMid) {
      voice.lenNow = voice.lenMid;
    } else {
      voice.lenNow = voice.lenMid + 1;
    }
    voice.phaseSlope = 1 / Math.max(1, voice.lenNow - 1);  // phasorRangeClosed = true
  }

  // rsPitchDitherOsc<T>::getSamplePhasor() + updateSampleCount(), transcribed.
  robinSupersawGetSamplePhasor(voice) {
    const p = voice.phaseSlope * voice.sampleCount;
    voice.sampleCount += 1;
    if (voice.sampleCount >= voice.lenNow) {
      voice.sampleCount = 0;
      this.robinSupersawUpdateCycleLength(voice);
    }
    return p;
  }

  robinSupersawSumVoiceBank(bank, numVoices, safeFrequency, sampleRate, spreadCents) {
    let sum = 0;
    for (let i = 0; i < numVoices; i++) {
      let centsOffset = 0;
      if (numVoices > 1) {
        const t = i / (numVoices - 1);
        centsOffset = (t - 0.5) * spreadCents;
      }
      const ratio = Math.pow(2, centsOffset / 1200);
      const voiceFreq = safeFrequency * ratio;
      const meanCycleLength = sampleRate / Math.max(1, voiceFreq);
      const voice = bank[i];
      const dist = this.robinSupersawCalcCycleDistribution(meanCycleLength);
      voice.lenMid = dist.lenMid;
      voice.probShort = dist.probShort;
      voice.probMid = dist.probMid;
      sum += 2 * this.robinSupersawGetSamplePhasor(voice) - 1;  // WF::saw(phasor)
    }
    return sum / numVoices;
  }

  robinSupersawSampleJs(state, options = {}) {
    const sampleRate = Number(options.sampleRate) > 1 ? Number(options.sampleRate) : 48000;
    const safeFrequency = Number(options.frequencyHz) > 1 ? Number(options.frequencyHz) : 1;
    const numVoices = this.clampValue(Math.round(Number(options.voices) || 1), 1, 9);
    const spreadCents = this.clampValue(Number(options.detuneCents) || 0, 0, 100);
    const level = Number(options.level) || 0;

    let left = this.robinSupersawSumVoiceBank(state.left, numVoices, safeFrequency, sampleRate, spreadCents);
    let right = this.robinSupersawSumVoiceBank(state.right, numVoices, safeFrequency, sampleRate, spreadCents);
    if (!Number.isFinite(left)) left = 0;
    if (!Number.isFinite(right)) right = 0;

    const outLeft = this.clampValue(left, -1.5, 1.5) * level;
    const outRight = this.clampValue(right, -1.5, 1.5) * level;
    // Arithmetic average, not a raw sum -- matches this sandbox's own
    // Output module convention, so mono doesn't come out twice as loud.
    const outMono = (outLeft + outRight) * 0.5;
    return { Mono: outMono, Left: outLeft, Right: outRight };
  }

  robinSupersawSample(state, options = {}) {
    if (
      this.nativeRobinSupersawReady &&
      this.nativeRobinSupersaw?.soemdsp_robin_supersaw_create &&
      this.nativeRobinSupersaw?.soemdsp_robin_supersaw_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeRobinSupersaw.soemdsp_robin_supersaw_create();
        }
        if (state.nativeHandle) {
          const sampleRate = Number(options.sampleRate) > 1 ? Number(options.sampleRate) : 48000;
          const frequencyHz = Number(options.frequencyHz) || 0;
          const detuneCents = Number(options.detuneCents) || 0;
          const voices = Math.round(Number(options.voices) || 1);
          const level = Number(options.level) || 0;
          this.nativeRobinSupersaw.soemdsp_robin_supersaw_sample(
            state.nativeHandle,
            frequencyHz,
            sampleRate,
            detuneCents,
            voices,
            level,
          );
          return {
            Mono: Number(this.nativeRobinSupersaw.soemdsp_robin_supersaw_mono(state.nativeHandle)) || 0,
            Left: Number(this.nativeRobinSupersaw.soemdsp_robin_supersaw_left(state.nativeHandle)) || 0,
            Right: Number(this.nativeRobinSupersaw.soemdsp_robin_supersaw_right(state.nativeHandle)) || 0,
          };
        }
      } catch (error) {
        this.nativeRobinSupersawReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "robin_supersaw",
          status: "disabled",
          message: String(error?.message || error || "native RobinSupersaw failed"),
        });
      }
    }
    return this.robinSupersawSampleJs(state, options);
  }

  // Hypersaw -- see native_modules/hypersaw/hypersaw.cpp for the full
  // derivation and the exact mapping back to soundemote's own
  // HypersawUnit::run() (docs/reference/Hypersaw.hpp). Fully self-
  // contained JS fallback for the same isolated-worklet-scope reason as
  // RobinSupersaw above -- never calls the shared
  // public/node-graph-hypersaw.js globals, which this worklet's isolated
  // scope never loads.

  hypersawPolyBlep(t, dt) {
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

  hypersawWrap01(x) {
    const w = x - Math.floor(x);
    return w < 0 ? 0 : (w >= 1 ? 0 : w);
  }

  // Cheap, smooth, periodic parabolic approximation of sin(2*pi*phase01).
  hypersawFastSine01(phase01) {
    const x = this.hypersawWrap01(phase01) - 0.5;
    return 8 * x * (0.5 - Math.abs(x));
  }

  // curve::Rational{skew}.get(t), t already normalized 0..1.
  hypersawRationalCurve(skew, t) {
    return ((1 + skew) * t) / (1 - skew + 2 * skew * t);
  }

  createHypersawVoice() {
    return { phase: 0, randomOffset: Math.random() * 2 - 1, driftOut: 0, driftFilterState: 0 };
  }

  createHypersawState() {
    const voices = [];
    for (let i = 0; i < 64; i++) {
      voices.push(this.createHypersawVoice());
    }
    return { voices, vibPhase: 0, nativeHandle: 0 };
  }

  destroyHypersawNativeState(state) {
    if (state?.nativeHandle && this.nativeHypersaw?.soemdsp_hypersaw_destroy) {
      this.nativeHypersaw.soemdsp_hypersaw_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  // Advances the shared vibOsc_ + each voice's phase accumulator and
  // drift/dispersion exactly once per sample() call, returning the
  // per-voice sawtooth samples plus the dispersion array (used to drive
  // the voice-position display). Factored out of hypersawSampleJs so the
  // native-audio path below can call it too (advancing this JS shadow
  // state purely for the display, in parallel with native's own opaque
  // internal state) without duplicating -- and thereby double-stepping --
  // the phase math.
  hypersawAdvanceVoices(state, options = {}) {
    const sampleRate = Number(options.sampleRate) > 1 ? Number(options.sampleRate) : 48000;
    const safeFrequency = Number(options.frequencyHz) > 0 ? Number(options.frequencyHz) : 0;
    const phaseOffset = this.hypersawWrap01(Number(options.phaseOffset) || 0);
    const voiceCountFloat = this.clampValue(Number(options.numOscillators) || 1, 1, 64);
    // Voice i's gain is clamp(voiceCountFloat - i, 0, 1) -- floor(voiceCountFloat)
    // voices at full gain, one voice fading in/out at the fractional edge.
    const voiceLoopCount = Math.ceil(voiceCountFloat);
    const distributeAmt = this.clampValue(Number(options.distributePhaseAmp) || 0, 0, 1);
    const randomAmt = this.clampValue(Number(options.randomPhaseAmp) || 0, 0, 1);
    const driftAmt = this.clampValue(Number(options.driftAmp) || 0, 0, 1);
    const safeDriftFrequency = Math.max(0, Number(options.driftFrequency) || 0);
    const safeDriftJitter = Math.max(0, Number(options.driftJitter) || 0);
    const vibAmt = this.clampValue(Number(options.vibAmp) || 0, 0, 2);
    const vibOffsetAmt = Number(options.vibOffset) || 0;
    const vibRate = Number(options.vibRate) || 0;

    const phaseIncrement = safeFrequency / sampleRate;

    // drift_ coefficients -- shared across every voice (only computed
    // when driftAmt > 0, matching drift_.run() only ever being called
    // under that same guard in the original). See hypersaw.cpp's header
    // comment for the full derivation from FlexibleRandomWalk.hpp.
    let driftStepSize = 0, driftRandomMix = 0, driftWhiteNoiseMix = 0;
    let driftA1 = 0, driftB0 = 0;
    if (driftAmt > 0) {
      const jitterInc = safeDriftJitter / sampleRate;
      driftStepSize = this.hypersawRationalCurve(0.99, jitterInc);
      const increment = safeDriftFrequency / sampleRate;
      const freqAndJitterAvg = (jitterInc + increment) * 0.5;
      if (freqAndJitterAvg >= 0.9) {
        const normalized = (freqAndJitterAvg - 0.9) / 0.1;
        driftWhiteNoiseMix = this.hypersawRationalCurve(-0.7, normalized);
      }
      driftRandomMix = 1 - driftWhiteNoiseMix;
      driftA1 = Math.exp((-2 * Math.PI * safeDriftFrequency) / sampleRate);
      driftB0 = 1 - driftA1;
    }

    state.vibPhase = this.hypersawWrap01(state.vibPhase + vibRate / sampleRate);
    const vibSample = this.hypersawFastSine01(state.vibPhase + 0.5);

    // Center/side routing parity uses the rounded voice count -- this
    // only ever affects which channel the partially-faded edge voice
    // routes to, a cosmetic detail next to the gain fade itself.
    const voiceCountIsEven = Math.round(voiceCountFloat) % 2 === 0;

    const voicePhases = new Array(voiceLoopCount);
    let leftSum = 0, rightSum = 0;
    let leftGainSum = 0, rightGainSum = 0;

    for (let i = 0; i < voiceLoopCount; i++) {
      const voice = state.voices[i];

      const gain = this.clampValue(voiceCountFloat - i, 0, 1);
      const div = i / voiceCountFloat;

      let walkOut = 0;
      if (driftAmt > 0) {
        const n = Math.random() * 2 - 1;
        const r = n > 0 ? driftStepSize : -driftStepSize;
        voice.driftOut = this.clampValue(voice.driftOut + r, -1, 1);
        const raw = voice.driftOut * driftRandomMix + n * driftWhiteNoiseMix;
        voice.driftFilterState = driftB0 * raw + driftA1 * voice.driftFilterState;
        walkOut = voice.driftFilterState * driftAmt;
      }

      const vibInputForVoice = i === 0 ? 0 : vibSample;
      const staticDispersion = div * distributeAmt + voice.randomOffset * randomAmt;
      const vibratoMultiplier = vibInputForVoice * vibAmt + vibOffsetAmt;
      const dispersion = staticDispersion * vibratoMultiplier + walkOut;

      const renderPhase = this.hypersawWrap01(voice.phase + phaseOffset + dispersion);
      // PolyBLEP::saw(): 1 - 2*t + blep(t, dt) -- a descending ramp.
      const sawSample = (1 - 2 * renderPhase + this.hypersawPolyBlep(renderPhase, phaseIncrement > 0 ? phaseIncrement : 1)) * gain;

      voicePhases[i] = this.hypersawWrap01(dispersion);
      voice.phase = this.hypersawWrap01(voice.phase + phaseIncrement);

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

    state.lastVoicePhases = voicePhases;

    let left = leftGainSum > 0.0001 ? leftSum / leftGainSum : 0;
    let right = rightGainSum > 0.0001 ? rightSum / rightGainSum : 0;
    if (!Number.isFinite(left)) left = 0;
    if (!Number.isFinite(right)) right = 0;
    return { left, right };
  }

  hypersawSampleJs(state, options = {}) {
    const level = Number(options.level) || 0;
    const { left, right } = this.hypersawAdvanceVoices(state, options);
    return { Left: this.clampValue(left, -1.5, 1.5) * level, Right: this.clampValue(right, -1.5, 1.5) * level };
  }

  hypersawSample(state, options = {}) {
    if (
      this.nativeHypersawReady &&
      this.nativeHypersaw?.soemdsp_hypersaw_create &&
      this.nativeHypersaw?.soemdsp_hypersaw_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeHypersaw.soemdsp_hypersaw_create();
        }
        if (state.nativeHandle) {
          const sampleRate = Number(options.sampleRate) > 1 ? Number(options.sampleRate) : 48000;
          const frequencyHz = Number(options.frequencyHz) || 0;
          const phaseOffset = Number(options.phaseOffset) || 0;
          const numOscillators = Number(options.numOscillators) || 1;
          const distributePhaseAmp = Number(options.distributePhaseAmp) || 0;
          const randomPhaseAmp = Number(options.randomPhaseAmp) || 0;
          const driftAmp = Number(options.driftAmp) || 0;
          const driftFrequency = Number(options.driftFrequency) || 0;
          const driftJitter = Number(options.driftJitter) || 0;
          const vibAmp = Number(options.vibAmp) || 0;
          const vibOffset = Number(options.vibOffset) || 0;
          const vibRate = Number(options.vibRate) || 0;
          const level = Number(options.level) || 0;
          this.nativeHypersaw.soemdsp_hypersaw_sample(
            state.nativeHandle,
            frequencyHz,
            sampleRate,
            phaseOffset,
            numOscillators,
            distributePhaseAmp,
            randomPhaseAmp,
            driftAmp,
            driftFrequency,
            driftJitter,
            vibAmp,
            vibOffset,
            vibRate,
            level,
          );
          // Native owns the real audio-critical voice state opaquely (no
          // access from JS). Advance this JS-side shadow bank purely so
          // the voice-position display has data to draw -- visually
          // representative of the dispersion in effect, though not
          // sample-exact with native's own internal RNG stream.
          this.hypersawAdvanceVoices(state, options);
          return {
            Left: Number(this.nativeHypersaw.soemdsp_hypersaw_left(state.nativeHandle)) || 0,
            Right: Number(this.nativeHypersaw.soemdsp_hypersaw_right(state.nativeHandle)) || 0,
          };
        }
      } catch (error) {
        this.nativeHypersawReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "hypersaw",
          status: "disabled",
          message: String(error?.message || error || "native Hypersaw failed"),
        });
      }
    }
    return this.hypersawSampleJs(state, options);
  }

  spiralWrap01(value) {
    return value - Math.floor(value);
  }

  spiralFmod(value, divisor) {
    return value - Math.trunc(value / divisor) * divisor;
  }

  spiralTrisaw(phase, sharp) {
    const wrapped = this.spiralWrap01(phase);
    const warp = Math.max(0.001, Math.min(0.999, sharp));
    return wrapped < warp ? wrapped / warp : (1 - wrapped) / (1 - warp);
  }

  spiralNextPhasor(state, key, frequency, offset, sampleRate, bipolar = false) {
    const base = Number(state[key]) || 0;
    const current = this.spiralWrap01(base + offset);
    state[key] = this.spiralWrap01(base + frequency / sampleRate);
    return bipolar ? current * 2 - 1 : current;
  }

  spiralRotate(inX, inY, inZ, rotX, rotY) {
    const cosRotX = Math.cos(rotX);
    const sinRotX = Math.sin(rotX);
    const cosRotY = Math.cos(rotY);
    const sinRotY = Math.sin(rotY);
    const help11 = inX * cosRotX - inY * sinRotX;
    const help12 = inX * sinRotX + inY * cosRotX;
    const help21 = help11 * cosRotY - inZ * sinRotY;
    const help22 = help11 * sinRotY + inZ * cosRotY;
    return { x: help12, y: help21, z: help22 };
  }

  spiralShape(lophas, phasor, dense, div, morph) {
    const tau = Math.PI * 2;
    const piOver2 = Math.PI / 2;
    const piOver4 = Math.PI / 4;
    const clampMorph01 = this.clampValue(morph, 0, 1);
    const clampMorph02 = this.clampValue(morph, 0, 2);
    const formula001 = piOver2 * (lophas - 0.5) * clampMorph02 + piOver4;
    let loSin = Math.sin(formula001);
    let loCos = Math.cos(formula001);
    const formula002 = Math.pow(clampMorph01, 2);
    const oneZDiv = 1 / div;
    const loY = formula002 * (1 - oneZDiv * loSin);
    const loZ = formula002 * (1 - oneZDiv * loCos);
    const formula003 = Math.PI / (2 + 6 * (1 - clampMorph01)) * (lophas - 0.5) * clampMorph02 + piOver4;
    loSin = Math.sin(formula003);
    loCos = Math.cos(formula003);
    const tauPhasor = tau * phasor;
    const sp0Sin = Math.sin(tauPhasor);
    const sp0Cos = Math.cos(tauPhasor);
    const spiral0X = sp0Sin;
    const spiral0Y = sp0Cos * loSin;
    const spiral0Z = sp0Cos * loCos;
    let sp1Sin = Math.sin(dense * tauPhasor - piOver2);
    const sp1Cos = Math.cos(dense * tauPhasor - piOver2);
    sp1Sin *= -1;
    const sp1SinTimesSp0Sin = sp1Sin * sp0Sin;
    const spiral1X = div * sp1SinTimesSp0Sin;
    const spiral1Y = div * ((sp1Sin * sp0Cos) * loSin + sp1Cos * loCos);
    const spiral1Z = div * (sp1Cos * -loSin + (sp1Sin * sp0Cos) * loCos);
    let sp2Cos = Math.sin(dense * dense * tau * phasor);
    const sp2Sin = Math.cos(dense * dense * tau * phasor);
    sp2Cos *= -1;
    const divSquared = div * div;
    const spiral2X = divSquared * (sp2Cos * sp0Cos + sp2Sin * sp1SinTimesSp0Sin);
    const spiral2Y = divSquared * ((sp2Cos * -sp0Sin + sp2Sin * sp1Sin * sp0Cos) * loSin + (sp2Sin * sp1Cos) * loCos);
    const spiral2Z = divSquared * ((sp2Sin * sp1Cos) * -loSin + (sp2Cos * -sp0Sin + sp2Sin * sp1Sin * sp0Cos) * loCos);
    let waveX = spiral0X + spiral1X + spiral2X;
    let waveY = loY + spiral0Y + spiral1Y + spiral2Y;
    let waveZ = loZ + spiral0Z + spiral1Z + spiral2Z;
    let x = Math.exp(morph * Math.log(div));
    waveX *= x;
    waveY *= x;
    waveZ *= x;
    let y = 0;
    const formula004 = Math.exp(morph * Math.log(dense)) / 4;
    if (formula004 < 1) {
      y = Math.pow(1 - formula004, 2);
    }
    x = x * Math.sin(piOver4) * y;
    waveX -= x;
    waveY += x;
    return this.spiralRotate(waveX, waveY, waveZ, 0, 0);
  }

  spiralRender(inX, inY, inZ, zDepth) {
    const formula = zDepth * 1.25 * (inZ / 2 + 0.5);
    const multiplier = 1 + zDepth;
    return {
      left: (inX - formula * inX) * multiplier,
      right: (inY - formula * inY) * multiplier,
    };
  }

  jerobeamSpiralSample(options) {
    const tau = Math.PI * 2;
    const piOver2 = Math.PI / 2;
    const state = options.state;
    const dense = Math.max(Math.abs(options.density), 1e-6);
    const div = Math.max(options.size, 0.1);
    const logDense = Math.log(dense);
    const zDarkness = Math.pow(Math.pow(options.zAmount, 2) * 5 + 1, state.zHistory || 0);
    const mainPhasor = this.spiralNextPhasor(state, "phase", options.frequency * zDarkness, 0, options.sampleRate);
    const fphasEnds = this.spiralTrisaw(mainPhasor, options.sharp);
    const fphasMids = options.sharpCurveMult * (Math.asin((Math.asin(fphasEnds * 2 - 1) / Math.PI + 0.5) * 2 - 1) / Math.PI + 0.5);
    const lophas = options.sharpCurve * fphasMids + (1 - options.sharpCurve) * fphasEnds;
    const morph = this.spiralNextPhasor(state, "morph", options.morphSpeed, options.morph, options.sampleRate, true) + 0.5;
    let morph2 = morph + 1;
    if (morph2 > 1.5) {
      morph2 -= 2;
    }
    const fmodLophas = this.spiralFmod(lophas - 0.5, 1);
    let phas = this.spiralFmod(fmodLophas * Math.exp(morph * logDense) / 4 + 0.375, 1);
    const phas2 = this.spiralFmod(fmodLophas * Math.exp(morph2 * logDense) / 4 + 0.375, 1);
    phas += this.spiralNextPhasor(state, "position", options.positionSpeed, options.position, options.sampleRate);
    const wave1 = this.spiralShape(lophas, phas, dense, div, morph);
    const wave2 = this.spiralShape(lophas, phas2, dense, div, morph2);
    const switchAmount = Math.sin(Math.PI * morph) / 2 + 0.5;
    let waveX = wave1.x * switchAmount + wave2.x * (1 - switchAmount);
    let waveY = wave1.y * switchAmount + wave2.y * (1 - switchAmount);
    let waveZ = wave1.z * switchAmount + wave2.z * (1 - switchAmount);
    let volumeCorrection = 1 / (1 + div + div * div);
    const halfZDepth = options.zDepth / 2;
    volumeCorrection = volumeCorrection + halfZDepth - volumeCorrection * halfZDepth;
    waveX *= volumeCorrection;
    waveY *= volumeCorrection;
    waveZ *= volumeCorrection;
    waveY += 0.25;
    waveZ += 0.36;
    const rotated = this.spiralRotate(
      waveX,
      waveY,
      waveZ,
      -tau * this.spiralNextPhasor(state, "rotX", options.rotXSpeed, options.rotX, options.sampleRate),
      tau * this.spiralNextPhasor(state, "rotY", options.rotYSpeed, options.rotY, options.sampleRate) - piOver2,
    );
    const stereo = this.spiralRender(rotated.x, rotated.y, rotated.z, options.zDepth);
    state.zHistory = rotated.z;
    return { ...stereo, x: rotated.x, y: rotated.y, z: rotated.z };
  }

  evaluateFrame(frame, frames, inputs = [], rate = this.engineSampleRate || sampleRate, inputFrame = frame) {
    const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
    const frameValues = new Map();
    const mixInput = (nodeId, port = "In") => (
      this.inputConnections.get(this.inputKey(nodeId, port)) || []
    ).reduce((sum, connection) => sum + this.readRuntimePortOutput(
      frameValues,
      connection.sourceNode,
      connection.sourcePort,
      frame,
      frames,
    ), 0);
    const hasInput = (nodeId, port) => this.inputConnections.has(this.inputKey(nodeId, port));
    const incomingClockRate = (nodeId) => {
      const connection = (this.inputConnections.get(this.inputKey(nodeId, "Clock")) || [])[0];
      const sourceNode = this.nodes.get(connection?.sourceNode);
      return sourceNode?.type === "clock"
        ? Math.max(0, Number(sourceNode.params?.rate) || 0)
        : 0;
    };
    const graphSampleX = (node, nodeId) => {
      const mode = Math.round(this.readEffectiveParameter(node, "mode", 0, frame, frames, frameValues));
      if (mode <= 0) {
        return mixInput(nodeId);
      }
      const rateValue = Math.max(0, this.readEffectiveParameter(node, "rate", 1, frame, frames, frameValues));
      const phaseValue = this.readEffectiveParameter(node, "phase", 0, frame, frames, frameValues);
      const state = this.graphLfoStates.get(nodeId) || this.createGraphLfoState();
      this.graphLfoStates.set(nodeId, state);
      const resetValue = 0;
      const currentFrame = Number(inputFrame) || 0;
      if (state.lastReset <= 0 && resetValue > 0) {
        state.resetFrame = currentFrame;
      }
      state.lastReset = resetValue;
      const resetFrame = Number.isFinite(state.resetFrame) ? state.resetFrame : 0;
      return this.wrapValue(((currentFrame - resetFrame) / safeRate) * rateValue + phaseValue, 0, 1);
    };
    const graphOutputValue = (node, nodeId) => {
      const normalizedValue = this.graphValueAt(this.graphForNode(node), graphSampleX(node, nodeId), this.graphSmoothingModeForNode(node));
      const outputMin = this.readEffectiveParameter(node, "outputMin", 0, frame, frames, frameValues);
      const outputMax = this.readEffectiveParameter(node, "outputMax", 1, frame, frames, frameValues);
      return outputMin + normalizedValue * (outputMax - outputMin);
    };
    const graphInputValue = (nodeId, graphInput, x, fallback) => {
      const connection = (this.graphInputConnections.get(this.graphInputKey(nodeId, graphInput)) || [])[0];
      const source = connection ? this.nodes.get(connection.sourceNode) : null;
      if (!source || (source.type !== "graph" && source.type !== "graph2")) {
        return fallback;
      }
      return this.graphValueAt(this.graphForNode(source), this.clampValue(Number(x) || 0, 0, 1), this.graphSmoothingModeForNode(source));
    };

    for (const nodeId of this.order) {
      const node = this.nodes.get(nodeId);
      let value = 0;
      if (node?.type === "groupInput") {
        value = {
          Out: Number(this.externalGroupInputs?.get(nodeId)) || 0,
        };
      } else if (node?.type === "audioInput") {
        const input = inputs[0] || [];
        const leftChannel = input[0] || input[1] || null;
        const rightChannel = input[1] || input[0] || null;
        const left = Number(leftChannel?.[inputFrame]) || 0;
        const right = Number(rightChannel?.[inputFrame]) || left;
        const level = this.readEffectiveParameter(node, "level", 1, frame, frames, frameValues);
        value = {
          Left: left * level,
          Out: ((left + right) * 0.5) * level,
          Right: right * level,
        };
      } else if (node?.type === "audioPlayer") {
        const readParam = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        value = this.audioPlayerSample(
          node,
          nodeId,
          (port) => mixInput(nodeId, port),
          readParam,
          safeRate,
        );
      } else if (node?.type === "sineWavetable") {
        const phase = this.phases.get(nodeId) || 0;
        const phaseOffset = this.phaseRadians(
          this.readEffectiveParameter(node, "phase", 0, frame, frames, frameValues),
        );
        const baseFrequency = this.readEffectiveParameter(
          node,
          "freq",
          100,
          frame,
          frames,
          frameValues,
        );
        const freqInput = this.safeFilterNumber(mixInput(nodeId, "Freq"), null);
        const ampInput = this.safeFilterNumber(mixInput(nodeId, "Amplitude"), null);
        const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
        const referenceVoltage = referenceMidiNote / 120;
        const pitchInput = hasInput(nodeId, "0.1V/Oct")
          ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
          : referenceVoltage;
        const pitchedFrequency = Math.max(0, (baseFrequency + freqInput) * (2 ** ((pitchInput - referenceVoltage) / 0.1)));
        const amplitude = Math.max(0, this.readEffectiveParameter(
          node,
          "amp",
          1,
          frame,
          frames,
          frameValues,
        ) + ampInput);
        const phaseIncrement = pitchedFrequency / safeRate;
        value = nodeLiveSineCosWavetableSample(phase + phaseOffset, pitchedFrequency, amplitude, safeRate);
        this.phases.set(
          nodeId,
          this.wrapValue(phase + Math.PI * 2 * phaseIncrement, 0, Math.PI * 2),
        );
      } else if (nodeLiveIsPolyBlepOscillatorType(node?.type)) {
        const resetState = this.oscResetStates.get(nodeId) || this.createOscResetState();
        this.oscResetStates.set(nodeId, resetState);
        const resetValue = this.safeFilterNumber(mixInput(nodeId, "Reset"), resetState);
        const resetEdge = resetState.lastReset <= 0 && resetValue > 0;
        resetState.lastReset = resetValue;
        const phase = resetEdge ? 0 : this.phases.get(nodeId) || 0;
        if (resetEdge) {
          this.triangleStates.set(nodeId, 0);
        }
        const phaseOffset = this.phaseRadians(
          this.readEffectiveParameter(node, "phase", 0, frame, frames, frameValues),
        );
        const frequency = this.readEffectiveParameter(
          node,
          "frequency",
          100,
          frame,
          frames,
          frameValues,
        );
        const waveform = this.readEffectiveParameter(
          node,
          "waveform",
          0,
          frame,
          frames,
          frameValues,
        );
        const incrementInput = this.safeFilterNumber(mixInput(nodeId, "Increment"), null);
        const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
        const referenceVoltage = referenceMidiNote / 120;
        // With nothing patched into 0.1V/Oct, an oscillator should just
        // sound at its own "frequency" parameter -- i.e. as if it's always
        // playing the global pitch reference note -- not transposed by
        // whatever octave the reference note happens to sit at.
        const pitchInput = hasInput(nodeId, "0.1V/Oct")
          ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
          : referenceVoltage;
        const pitchedFrequency = Math.max(0, frequency * (2 ** ((pitchInput - referenceVoltage) / 0.1)));
        const phaseIncrement = (pitchedFrequency / safeRate) + incrementInput;
        const level = this.readEffectiveParameter(node, "level", 1, frame, frames, frameValues);
        let nativeVector = null;
        if (node?.type === "polyBlep") {
          const polyBlepState = this.polyBlepStates.get(nodeId) || this.createPolyBlepState();
          this.polyBlepStates.set(nodeId, polyBlepState);
          nativeVector = this.polyBlepNativeVectorSample(
            polyBlepState,
            phase + phaseOffset,
            phaseIncrement,
            waveform,
            level,
            resetEdge,
          );
        }
        if (nativeVector) {
          value = {
            Out: nativeVector.out,
            Saw: nativeVector.saw,
            Ramp: nativeVector.ramp,
            Square: nativeVector.square,
            Tri: nativeVector.tri,
            Sine: nativeVector.sine,
            "Wave Out": nativeVector.out,
            Noise: nativeVector.out,
          };
        } else {
          const sampleOscillator = (sampleNodeId, sampleWaveform) => (
            node?.type === "fbPolyBlepOsc"
              ? this.forwardBackwardPolyBlepOscillatorSample(sampleNodeId, phase + phaseOffset, phaseIncrement, sampleWaveform)
              : this.oscillatorSample(sampleNodeId, phase + phaseOffset, phaseIncrement, sampleWaveform)
          );
          const selected = sampleOscillator(nodeId, waveform) * level;
          value = {
            Out: selected,
            Saw: sampleOscillator(`${nodeId}:saw`, 0) * level,
            Ramp: sampleOscillator(`${nodeId}:ramp`, 1) * level,
            Square: sampleOscillator(`${nodeId}:square`, 2) * level,
            Tri: sampleOscillator(`${nodeId}:tri`, 3) * level,
            Sine: sampleOscillator(`${nodeId}:sine`, 4) * level,
            "Wave Out": selected,
            Noise: selected,
          };
        }
        this.phases.set(
          nodeId,
          this.wrapValue(phase + Math.PI * 2 * phaseIncrement, 0, Math.PI * 2),
        );
      } else if (node?.type === "additiveOsc" || node?.type === "gpuAdditiveOsc") {
        const resetState = this.oscResetStates.get(nodeId) || this.createOscResetState();
        this.oscResetStates.set(nodeId, resetState);
        const resetValue = this.safeFilterNumber(mixInput(nodeId, "Reset"), resetState);
        const resetEdge = resetState.lastReset <= 0 && resetValue > 0;
        resetState.lastReset = resetValue;
        const phase = resetEdge ? 0 : this.phases.get(nodeId) || 0;
        const phaseOffset = this.phaseRadians(
          this.readEffectiveParameter(node, "phase", 0, frame, frames, frameValues),
        );
        const frequency = this.readEffectiveParameter(
          node,
          "frequency",
          100,
          frame,
          frames,
          frameValues,
        );
        const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
        const referenceVoltage = referenceMidiNote / 120;
        // With nothing patched into 0.1V/Oct, an oscillator should just
        // sound at its own "frequency" parameter -- i.e. as if it's always
        // playing the global pitch reference note -- not transposed by
        // whatever octave the reference note happens to sit at.
        const pitchInput = hasInput(nodeId, "0.1V/Oct")
          ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
          : referenceVoltage;
        const pitchedFrequency = Math.max(0, frequency * (2 ** ((pitchInput - referenceVoltage) / 0.1)));
        const incrementInput = this.safeFilterNumber(mixInput(nodeId, "Increment"), null);
        const phaseIncrement = (pitchedFrequency / safeRate) + incrementInput;
        const hasGraphInput = (
          (this.graphInputConnections.get(this.graphInputKey(nodeId, "Damping Graph")) || []).length > 0 ||
          (this.graphInputConnections.get(this.graphInputKey(nodeId, "Phase Graph")) || []).length > 0
        );
        const queuedAdditiveSample = node?.type === "gpuAdditiveOsc" && !hasGraphInput
          ? this.readGpuAdditiveQueuedSample(nodeId)
          : null;
        const additiveSample = queuedAdditiveSample !== null
          ? queuedAdditiveSample
          : this.additiveOscillatorSample(
            phase + phaseOffset,
            {
              frequency: pitchedFrequency,
              dampingFilterFrequency: this.readEffectiveParameter(node, "dampingFilterFrequency", 20000, frame, frames, frameValues),
              dampingGraphValueAt: (x) => graphInputValue(nodeId, "Damping Graph", x, 1),
              harmonics: this.readEffectiveParameter(node, "harmonics", 32, frame, frames, frameValues),
              harmonicPhaseAdd: this.readEffectiveParameter(node, "harmonicPhaseAdd", 0, frame, frames, frameValues),
              harmonicPhaseMultiply: this.readEffectiveParameter(node, "harmonicPhaseMultiply", 0, frame, frames, frameValues),
              level: this.readEffectiveParameter(node, "level", 0.35, frame, frames, frameValues),
              modA: this.readEffectiveParameter(node, "modA", 0.5, frame, frames, frameValues),
              phaseGraphValueAt: (x) => graphInputValue(nodeId, "Phase Graph", x, 0),
              waveform: this.readEffectiveParameter(node, "waveform", 1, frame, frames, frameValues),
            },
            safeRate,
          );
        value = { Out: additiveSample };
        this.phases.set(
          nodeId,
          this.wrapValue(phase + Math.PI * 2 * phaseIncrement, 0, Math.PI * 2),
        );
      } else if (node?.type === "ellipsoid") {
        const resetState = this.oscResetStates.get(nodeId) || this.createOscResetState();
        this.oscResetStates.set(nodeId, resetState);
        const resetValue = this.safeFilterNumber(mixInput(nodeId, "Reset"), resetState);
        const resetEdge = resetState.lastReset <= 0 && resetValue > 0;
        resetState.lastReset = resetValue;
        const phase = resetEdge ? 0 : this.phases.get(nodeId) || 0;
        const phaseOffset = this.phaseRadians(
          this.readEffectiveParameter(node, "phase", 0, frame, frames, frameValues),
        );
        const frequency = this.readEffectiveParameter(node, "frequency", 100, frame, frames, frameValues);
        const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
        const referenceVoltage = referenceMidiNote / 120;
        // With nothing patched into 0.1V/Oct, an oscillator should just
        // sound at its own "frequency" parameter -- i.e. as if it's always
        // playing the global pitch reference note -- not transposed by
        // whatever octave the reference note happens to sit at.
        const pitchInput = hasInput(nodeId, "0.1V/Oct")
          ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
          : referenceVoltage;
        const pitchedFrequency = Math.max(0, frequency * (2 ** ((pitchInput - referenceVoltage) / 0.1)));
        const incrementInput = this.safeFilterNumber(mixInput(nodeId, "Increment"), null);
        const phaseIncrement = (pitchedFrequency / safeRate) + incrementInput;
        let ellipsoidFrame = this.ellipsoidOutputFrames.get(nodeId);
        if (!ellipsoidFrame) {
          ellipsoidFrame = { Mono: 0, Out: 0, Wave: 0, "Wave Out": 0, X: 0, Y: 0 };
          this.ellipsoidOutputFrames.set(nodeId, ellipsoidFrame);
        }
        value = this.nativeEllipsoidVectorSample(
          ellipsoidFrame,
          phase + phaseOffset,
          this.readEffectiveParameter(node, "level", 1, frame, frames, frameValues),
          this.readEffectiveParameter(node, "offsetX", 0, frame, frames, frameValues),
          this.readEffectiveParameter(node, "offsetY", 0, frame, frames, frameValues),
          this.readEffectiveParameter(node, "scaleX", 1, frame, frames, frameValues),
          this.readEffectiveParameter(node, "scaleY", 1, frame, frames, frameValues),
          this.readEffectiveParameter(node, "shapeX", 0, frame, frames, frameValues),
          this.readEffectiveParameter(node, "shapeY", 0, frame, frames, frameValues),
        );
        this.phases.set(
          nodeId,
          this.wrapValue(phase + Math.PI * 2 * phaseIncrement, 0, Math.PI * 2),
        );
      } else if (node?.type === "noiseGenerator") {
        const state = this.noiseGeneratorStates.get(nodeId) || this.createNoiseGeneratorState();
        this.noiseGeneratorStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        value = this.noiseGeneratorSample(
          state,
          {
            deviation: read("deviation", 0.5),
            level: read("level", 1),
            mean: read("mean", 0),
            mode: read("mode", 0),
            seed: read("seed", 1),
          },
          nodeId,
        );
      } else if (node?.type === "randomWalk") {
        const state = this.randomWalkStates.get(nodeId) || this.createRandomWalkState();
        this.randomWalkStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        value = this.randomWalkSample(
          state,
          {
            frequency: read("frequency", 2),
            jitter: read("jitter", 0.25),
            level: read("level", 1),
            method: read("method", 3),
            seed: read("seed", 1),
          },
          safeRate,
          nodeId,
        );
      } else if (node?.type === "fractalBrownianNoise") {
        const state = this.fractalBrownianNoiseStates.get(nodeId) || this.createFractalBrownianNoiseState();
        this.fractalBrownianNoiseStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        value = this.fractalBrownianNoiseVector(
          state,
          {
            frequency: read("frequency", 0.5),
            level: read("level", 1),
            octaves: read("octaves", 4),
            persistence: read("persistence", 0.5),
            scale: read("scale", 1),
            seed: read("seed", 1),
          },
          safeRate,
          nodeId,
          mixInput(nodeId, "Reset"),
        );
      } else if (node?.type === "clock") {
        const state = this.clockStates.get(nodeId) || this.createClockState();
        this.clockStates.set(nodeId, state);
        value = this.clockSample(
          state,
          mixInput(nodeId, "Reset"),
          this.readEffectiveParameter(node, "phase", 0, frame, frames, frameValues),
          this.readEffectiveParameter(node, "rate", 2, frame, frames, frameValues),
          this.readEffectiveParameter(node, "duty", 0.5, frame, frames, frameValues),
          this.readEffectiveParameter(node, "level", 1, frame, frames, frameValues),
          safeRate,
        );
      } else if (node?.type === "transport") {
        value = this.transportSample(
          {
            amplitude: read("amplitude", 1),
            divisions: read("divisions", 0),
          },
          frame,
          safeRate,
        );
      } else if (node?.type === "randomClock") {
        const state = this.randomClockStates.get(nodeId) || this.createRandomClockState();
        this.randomClockStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        value = this.randomClockSample(
          state,
          mixInput(nodeId, "Reset"),
          {
            duty: read("duty", 0.5),
            level: read("level", 1),
            maxSeconds: read("maxSeconds", 1),
            minSeconds: read("minSeconds", 0.25),
            seed: read("seed", 1),
            threshold: read("threshold", 0),
            triggerTime: read("triggerTime", 0.01),
          },
          safeRate,
          nodeId,
        );
      } else if (node?.type === "clockDivider") {
        const state = this.clockDividerStates.get(nodeId) || this.createTriggerDividerState();
        this.clockDividerStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const division = Math.max(1, Math.min(64, Math.round(read("division", 2))));
        const sourceRate = incomingClockRate(nodeId);
        const pulseTime = sourceRate > 0
          ? this.clampValue(read("duty", 0.5), 0.01, 1) * division / sourceRate
          : 0.01;
        value = this.triggerDividerSample(
          state,
          mixInput(nodeId, "Clock"),
          mixInput(nodeId, "Reset"),
          {
            division,
            level: read("level", 1),
            pulseTime,
            threshold: read("threshold", 0),
          },
          safeRate,
        );
      } else if (node?.type === "delayedTrigger") {
        const state = this.delayedTriggerStates.get(nodeId) || this.createDelayedTriggerState();
        this.delayedTriggerStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        value = this.delayedTriggerSample(
          state,
          mixInput(nodeId, "Trigger"),
          mixInput(nodeId, "Reset"),
          {
            delay: read("delay", 0.1),
            level: read("level", 1),
            pulseTime: read("pulseTime", 0.01),
            threshold: read("threshold", 0),
          },
          safeRate,
        );
      } else if (node?.type === "triggerCounter") {
        const state = this.triggerCounterStates.get(nodeId) || this.createTriggerCounterState();
        this.triggerCounterStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        value = this.triggerCounterSample(
          state,
          mixInput(nodeId, "Trigger"),
          mixInput(nodeId, "Reset"),
          {
            countMax: read("countMax", 8),
            increment: read("increment", 1),
            level: read("level", 1),
            pulseTime: read("pulseTime", 0.01),
            threshold: read("threshold", 0),
          },
          safeRate,
        );
      } else if (node?.type === "triggerDivider") {
        const state = this.triggerDividerStates.get(nodeId) || this.createTriggerDividerState();
        this.triggerDividerStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        value = this.triggerDividerSample(
          state,
          mixInput(nodeId, "Trigger"),
          mixInput(nodeId, "Reset"),
          {
            division: read("division", 2),
            level: read("level", 1),
            pulseTime: read("pulseTime", 0.01),
            threshold: read("threshold", 0),
          },
          safeRate,
        );
      } else if (node?.type === "stepSequencer") {
        const state = this.stepSequencerStates.get(nodeId) || this.createStepSequencerState();
        this.stepSequencerStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        value = this.stepSequencerSample(
          state,
          mixInput(nodeId, "Trigger"),
          mixInput(nodeId, "Reset"),
          {
            level: read("level", 1),
            steps: read("steps", 8),
            threshold: read("threshold", 0),
            values: [
              read("step1", 0),
              read("step2", 0.25),
              read("step3", 0.5),
              read("step4", 0.75),
              read("step5", 1),
              read("step6", 0.75),
              read("step7", 0.5),
              read("step8", 0.25),
            ],
          },
        );
      } else if (node?.type === "spiral") {
        const state = this.spiralStates.get(nodeId) || this.createSpiralState();
        this.spiralStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(
          node,
          key,
          fallback,
          frame,
          frames,
          frameValues,
        );
        const spiral = this.jerobeamSpiralSample({
          density: read("density", 1),
          frequency: read("frequency", 440),
          morph: read("morph", 0),
          morphSpeed: read("morphSpeed", 0),
          position: read("position", 0),
          positionSpeed: read("positionSpeed", 0),
          rotX: read("rotX", 0),
          rotXSpeed: read("rotXSpeed", 0),
          rotY: read("rotY", 0),
          rotYSpeed: read("rotYSpeed", 0),
          sampleRate: safeRate,
          sharp: read("sharp", 0.5),
          sharpCurve: read("sharpCurve", 0),
          sharpCurveMult: read("sharpCurveMult", 1),
          size: read("size", 0.5),
          state,
          zAmount: read("zAmount", 0),
          zDepth: read("zDepth", 0),
        });
        const level = read("level", 1);
        value = {
          X: spiral.x * level,
          Y: spiral.y * level,
          Z: spiral.z * level,
        };
      } else if (node?.type === "lorenzAttractor") {
        const state = this.lorenzAttractorStates.get(nodeId) || this.createLorenzAttractorState();
        this.lorenzAttractorStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(
          node,
          key,
          fallback,
          frame,
          frames,
          frameValues,
        );
        const lorenz = this.lorenzAttractorSample({
          beta: read("beta", 8 / 3),
          reset: mixInput(nodeId, "Reset"),
          rho: read("rho", 28),
          rotate: read("rotate", 0),
          sampleRate: safeRate,
          scale: read("scale", 1),
          sigma: read("sigma", 10),
          speed: read("speed", 1),
          state,
          zDepth: read("zDepth", 0.4),
        });
        const level = read("level", 1);
        value = {
          X: lorenz.x * level,
          Y: lorenz.y * level,
          Z: lorenz.z * level,
        };
      } else if (node?.type === "logisticMap") {
        const state = this.logisticMapStates.get(nodeId) || this.createLogisticMapState();
        this.logisticMapStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        value = {
          Out: this.logisticMapSample(state, {
            level: read("level", 1),
            r: read("r", 3.9),
            rate: read("rate", 8),
            reset: mixInput(nodeId, "Reset"),
            sampleRate: safeRate,
            seed: read("seed", 0.5),
          }),
        };
      } else if (node?.type === "henonMap") {
        const state = this.henonMapStates.get(nodeId) || this.createHenonMapState();
        this.henonMapStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const henon = this.henonMapSample(state, {
          a: read("a", 1.4),
          b: read("b", 0.3),
          rate: read("rate", 8),
          reset: mixInput(nodeId, "Reset"),
          sampleRate: safeRate,
          seedX: read("seedX", 0.1),
          seedY: read("seedY", 0.1),
        });
        const henonLevel = read("level", 1);
        value = {
          X: henon.x * henonLevel,
          Y: henon.y * henonLevel,
        };
      } else if (node?.type === "chuaAttractor") {
        const state = this.chuaAttractorStates.get(nodeId) || this.createChuaAttractorState();
        this.chuaAttractorStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const chua = this.chuaAttractorSample(state, {
          alpha: read("alpha", 15.6),
          beta: read("beta", 28),
          m0: read("m0", -1.143),
          m1: read("m1", -0.714),
          reset: mixInput(nodeId, "Reset"),
          sampleRate: safeRate,
          speed: read("speed", 1),
        });
        const chuaLevel = read("level", 1);
        value = {
          X: chua.x * chuaLevel,
          Y: chua.y * chuaLevel,
          Z: chua.z * chuaLevel,
        };
      } else if (node?.type === "chordMemory") {
        const state = this.chordMemoryStates.get(nodeId) || this.createChordMemoryState();
        this.chordMemoryStates.set(nodeId, state);
        value = this.chordMemorySample(state, {
          advance: mixInput(nodeId, "Advance"),
          clear: mixInput(nodeId, "Clear"),
          latch: mixInput(nodeId, "Latch"),
          pitch: mixInput(nodeId, "Pitch"),
        });
      } else if (node?.type === "turingMachine") {
        const state = this.turingMachineStates.get(nodeId) || this.createTuringMachineState();
        this.turingMachineStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        value = this.turingMachineSample(state, {
          clock: mixInput(nodeId, "Clock"),
          length: read("length", 8),
          level: read("level", 1),
          probability: read("probability", 0.25),
          reset: mixInput(nodeId, "Reset"),
        });
      } else if (node?.type === "pitchQuantizer") {
        const state = this.pitchQuantizerStates.get(nodeId) || this.createPitchQuantizerState();
        this.pitchQuantizerStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        value = {
          "0.1V/Oct": this.pitchQuantizerSample(state, {
            hasScaleInput: hasInput(nodeId, "Scale"),
            pitch: mixInput(nodeId, "0.1V/Oct"),
            scaleChoice: read("scale", 1),
            scaleInput: mixInput(nodeId, "Scale"),
          }),
        };
      } else if (node?.type === "surgeOscillator") {
        const state = this.surgeOscillatorStates.get(nodeId) || this.createSurgeOscillatorState();
        this.surgeOscillatorStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const baseFrequency = Math.max(0, read("frequency", 100));
        const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
        const referenceVoltage = referenceMidiNote / 120;
        const pitchInput = hasInput(nodeId, "0.1V/Oct")
          ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -10, 10)
          : referenceVoltage;
        const frequencyHz = Math.max(0, baseFrequency * (2 ** ((pitchInput - referenceVoltage) / 0.1)));
        value = this.surgeOscillatorSample(state, {
          frequencyHz,
          sampleRate: this.engineSampleRate || sampleRate,
          syncIn: mixInput(nodeId, "Sync"),
          hasExternalSync: hasInput(nodeId, "Sync"),
          syncFrequencyHz: read("syncFrequency", 50),
          waveform: read("waveform", 0),
          level: read("level", 1),
        });
      } else if (node?.type === "dsfOscillator") {
        const state = this.dsfOscillatorStates.get(nodeId) || this.createDsfOscillatorState();
        this.dsfOscillatorStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        value = this.dsfOscillatorSample(state, {
          frequencyHz: Math.max(0, read("frequency", 100)),
          sampleRate: this.engineSampleRate || sampleRate,
          waveform: read("waveform", 1),
          morph: read("morph", 1),
          pulseWidth: read("pulseWidth", 0.5),
          blend: read("blend", 0.5),
          level: read("level", 1),
        });
      } else if (node?.type === "robinSupersaw") {
        const state = this.robinSupersawStates.get(nodeId) || this.createRobinSupersawState();
        this.robinSupersawStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        // baseFrequency is the pitch heard at the global pitch reference
        // note (see node-graph-patch-normalizers.js) -- set it equal to
        // the master "Pitch Reference Frequency" setting and a MIDI
        // keyboard is automatically in tune; double it to transpose the
        // whole instrument up an octave.
        const baseFrequency = Math.max(0, read("frequency", 100));
        const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
        const referenceVoltage = referenceMidiNote / 120;
        // With nothing patched into 0.1V/Oct, the module should just sound at
        // "frequency" -- i.e. as if it's always playing the reference note --
        // not silently transposed down by however many octaves the reference
        // note happens to sit at. Only pull from the CV input when something
        // is actually connected; otherwise treat pitchInput as if it WERE the
        // reference voltage, so (pitchInput - referenceVoltage) cancels to 0.
        const hasPitchInput = this.inputConnections.has(this.inputKey(nodeId, "0.1V/Oct"));
        const pitchInput = hasPitchInput
          ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
          : referenceVoltage;
        const pitchedFrequency = Math.max(0, baseFrequency * (2 ** ((pitchInput - referenceVoltage) / 0.1)));
        value = this.robinSupersawSample(state, {
          frequencyHz: pitchedFrequency,
          sampleRate: this.engineSampleRate || sampleRate,
          detuneCents: read("detuneCents", 30),
          voices: read("voices", 7),
          level: read("level", 1),
        });
      } else if (node?.type === "hypersaw") {
        const state = this.hypersawStates.get(nodeId) || this.createHypersawState();
        this.hypersawStates.set(nodeId, state);
        // Reset input -- matches HypersawMaster::oscReset() (a note
        // trigger in the original): redraws each voice's randomOffset
        // (randomizePhase()), zeroes phase and drift, and resets the
        // shared vibOsc_ phase.
        const resetState = this.oscResetStates.get(nodeId) || this.createOscResetState();
        this.oscResetStates.set(nodeId, resetState);
        const resetValue = this.safeFilterNumber(mixInput(nodeId, "Reset"), resetState);
        const resetEdge = resetState.lastReset <= 0 && resetValue > 0;
        resetState.lastReset = resetValue;
        if (resetEdge) {
          for (const voice of state.voices) {
            voice.phase = 0;
            voice.randomOffset = Math.random() * 2 - 1;
            voice.driftOut = 0;
            voice.driftFilterState = 0;
          }
          state.vibPhase = 0;
          if (state.nativeHandle && this.nativeHypersaw?.soemdsp_hypersaw_reset) {
            this.nativeHypersaw.soemdsp_hypersaw_reset(state.nativeHandle);
          }
        }
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        // baseFrequency is the pitch heard at the global pitch reference
        // note -- same convention as RobinSupersaw above.
        const baseFrequency = Math.max(0, read("frequency", 100));
        const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
        const referenceVoltage = referenceMidiNote / 120;
        const hasPitchInput = this.inputConnections.has(this.inputKey(nodeId, "0.1V/Oct"));
        const pitchInput = hasPitchInput
          ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
          : referenceVoltage;
        const pitchedFrequency = Math.max(0, baseFrequency * (2 ** ((pitchInput - referenceVoltage) / 0.1)));
        value = this.hypersawSample(state, {
          frequencyHz: pitchedFrequency,
          sampleRate: this.engineSampleRate || sampleRate,
          phaseOffset: read("phase", 0),
          numOscillators: read("numOscillators", 8),
          distributePhaseAmp: read("distributePhaseAmp", 1),
          randomPhaseAmp: read("randomPhaseAmp", 0.15),
          driftAmp: read("driftAmp", 0.1),
          driftFrequency: read("driftFrequency", 2),
          driftJitter: read("driftJitter", 0.3),
          vibAmp: read("vibAmp", 0),
          vibOffset: read("vibOffset", 1),
          vibRate: read("vibRate", 5),
          level: read("level", 0.35),
        });
      } else if (node?.type === "midiOut") {
        const hasMidiInput = this.inputConnections.has(this.inputKey(nodeId, "MIDI Number"));
        const midiNumber = this.clampValue(Math.round(this.readEffectiveParameter(
          node,
          "midiNumber",
          60,
          frame,
          frames,
          frameValues,
        )), 0, 127);
        const outputMidiNumber = hasMidiInput
          ? this.clampValue(Math.round(Number(mixInput(nodeId, "MIDI Number")) || 0), 0, 127)
          : midiNumber;
        value = {
          "Full Value": outputMidiNumber,
          Normalized: outputMidiNumber / 127,
        };
      } else if (node?.type === "midiNotePitch") {
        const pitch = this.clampValue((
          Number(mixInput(nodeId, "MIDI Note")) +
          Number(mixInput(nodeId, "Octave Offset")) * 12 +
          Number(mixInput(nodeId, "Pitch Offset"))
        ) || 0, 0, 127);
        value = {
          Frequency: 440 * (2 ** ((pitch - 69) / 12)),
          "Pitch 0-1": pitch / 127,
          "Pitch 0-127": pitch,
        };
      } else if (node?.type === "keyboardController") {
        const signal = this.midiKeyboardSignal || {};
        const resetActive = hasInput(nodeId, "Reset") && Number(mixInput(nodeId, "Reset")) > 0;
        const manualRawMidi = Number.isFinite(Number(signal.rawMidi))
          ? Number(signal.rawMidi)
          : Number(signal.midi) || 60;
        const manualOctave = Number(signal.octave) || 0;
        const octave = hasInput(nodeId, "Octave")
          ? this.clampValue(Math.round(Number(mixInput(nodeId, "Octave")) || 0), -6, 6)
          : manualOctave;
        const rawMidi = resetActive
          ? 60
          : (hasInput(nodeId, "MIDI Note") ? Number(mixInput(nodeId, "MIDI Note")) || 0 : manualRawMidi);
        const midi = this.clampValue(Math.round(rawMidi + octave * 12), 0, 127);
        const automatedPitch = resetActive || hasInput(nodeId, "MIDI Note") || hasInput(nodeId, "Octave");
        const key = automatedPitch
          ? this.clampValue(Math.round(rawMidi) - 48, 0, 24)
          : this.clampValue(Number(signal.keyIndex) || 12, 0, 24);
        const frequency = 440 * (2 ** ((midi - 69) / 12));
        const outputFrequency = Math.max(0, frequency);
        const increment = Math.max(0, outputFrequency / safeRate);
        const q = automatedPitch
          ? key / 24
          : this.clampValue(Number(signal.keyQuantized) || key / 24, 0, 1);
        const x = resetActive ? 0.5 : (hasInput(nodeId, "X")
          ? this.clampValue(Number(mixInput(nodeId, "X")) || 0, 0, 1)
          : this.clampValue(Number(signal.x) || q, 0, 1));
        const y = resetActive ? 0 : (hasInput(nodeId, "Y")
          ? this.clampValue(Number(mixInput(nodeId, "Y")) || 0, 0, 1)
          : this.clampValue(Number(signal.y) || 0, 0, 1));
        const gate = resetActive ? 0 : (hasInput(nodeId, "Gate")
          ? (Number(mixInput(nodeId, "Gate")) > 0 ? 1 : 0)
          : (Number(signal.gate) > 0 ? 1 : 0));
        const hold = hasInput(nodeId, "Hold") && Number(mixInput(nodeId, "Hold")) > 0 ? 1 : 0;
        const velocity = hasInput(nodeId, "Velocity")
          ? this.clampValue(Number(mixInput(nodeId, "Velocity")) || 0, 0, 1)
          : y;
        const gatePulse = this.midiKeyboardGatePulseSamples > 0 ? 1 : 0;
        this.midiKeyboardGatePulseSamples = Math.max(0, this.midiKeyboardGatePulseSamples - 1);
        value = {
          "1 Sample Gate": hasInput(nodeId, "Gate") ? gate : gatePulse,
          "0.1V/Oct": this.clampValue(midi / 120, 0, 1),
          Double: this.clampValue(midi / 127, 0, 1),
          Frequency: outputFrequency,
          Gate: Math.max(gate, hold),
          Increment: increment,
          Key: key,
          MIDI: midi,
          Pitch: midi,
          Q: q,
          X: x,
          Y: velocity,
        };
      } else if (node?.type === "buttonEvents") {
        value = {
          Click: this.externalButtonEventPulse("click"),
          Hover: this.externalButtonEventPulse("hover"),
          Down: this.externalButtonEventPulse("down"),
          Up: this.externalButtonEventPulse("up"),
          Enter: this.externalButtonEventPulse("enter"),
          Leave: this.externalButtonEventPulse("leave"),
        };
      } else if (node?.type === "wireBreak") {
        value = this.wireBreakEventSample();
      } else if (node?.type === "wireConnect") {
        value = this.wireConnectEventSample();
      } else if (node?.type === "wireDisconnect") {
        value = this.wireDisconnectEventSample();
      } else if (node?.type === "windowReopen") {
        value = this.windowReopenEventSample();
      } else if (node?.type === "shootingStarExplosion") {
        value = this.shootingStarExplosionEventSample(
          this.readEffectiveParameter(node, "lowRange", 6, frame, frames, frameValues),
          this.readEffectiveParameter(node, "highRange", 10, frame, frames, frameValues),
        );
      } else if (node?.type === "nextPatch" || node?.type === "previousPatch") {
        const state = this.patchCommandStates.get(nodeId) || this.createPatchCommandState();
        this.patchCommandStates.set(nodeId, state);
        value = this.patchCommandTriggerSample(
          state,
          mixInput(nodeId, "Trigger"),
          this.readEffectiveParameter(node, "threshold", 0, frame, frames, frameValues),
          node?.type === "previousPatch" ? "previousPatch" : "nextPatch",
          nodeId,
        );
      } else if (node?.type === "macroControls") {
        const resetActive = hasInput(nodeId, "Reset") && Number(mixInput(nodeId, "Reset")) > 0;
        value = {};
        for (let index = 0; index < 10; index += 1) {
          const port = `M${index + 1} In`;
          value[`M${index + 1}`] = resetActive
            ? 0
            : this.clampValue(hasInput(nodeId, port)
              ? Number(mixInput(nodeId, port)) || 0
              : Number(this.macroControls?.[index]) || 0, 0, 1);
        }
      } else if (node?.type === "pitchModWheel") {
        const resetActive = hasInput(nodeId, "Reset") && Number(mixInput(nodeId, "Reset")) > 0;
        const pitchWheel = resetActive ? 0 : (hasInput(nodeId, "Pitch")
          ? Number(mixInput(nodeId, "Pitch")) || 0
          : Number(this.pitchModWheelSignal?.pitch));
        const modWheel = resetActive ? 0 : (hasInput(nodeId, "Mod")
          ? Number(mixInput(nodeId, "Mod")) || 0
          : Number(this.pitchModWheelSignal?.mod) || 0);
        value = {
          "Mod Wheel": this.clampValue(modWheel, 0, 1),
          "Pitch Wheel": this.clampValue(Number.isFinite(pitchWheel) ? pitchWheel : 0, -1, 1),
        };
      } else if (node?.type === "gain") {
        value = mixInput(nodeId) *
          this.readEffectiveParameter(node, "amount", 1, frame, frames, frameValues);
      } else if (node?.type === "led") {
        value = {
          Out: this.safeFilterNumber(mixInput(nodeId, "In"), null),
        };
      } else if (node?.type === "moduleGroup") {
        value = this.evaluateModuleGroup(node, mixInput, frame, frames, safeRate, inputFrame);
      } else if (node?.type === "codeblock") {
        value = this.evaluateCodeblock(node, mixInput, frame, frames, safeRate, inputFrame);
      } else if (node?.type === "graph" || node?.type === "graph2") {
        value = graphOutputValue(node, nodeId);
      } else if (node?.type === "bias") {
        value = mixInput(nodeId) +
          this.readEffectiveParameter(node, "offset", 0, frame, frames, frameValues);
      } else if (node?.type === "softClipper") {
        value = this.nativeSoftClipperSample(
          mixInput(nodeId),
          this.readEffectiveParameter(node, "center", 0, frame, frames, frameValues),
          this.readEffectiveParameter(node, "width", 2, frame, frames, frameValues),
        );
      } else if (node?.type === "rotate3dTo2d") {
        const angleX = this.readEffectiveParameter(node, "rotateX", 0, frame, frames, frameValues) * Math.PI * 2;
        const angleY = this.readEffectiveParameter(node, "rotateY", 0, frame, frames, frameValues) * Math.PI * 2;
        const angleZ = this.readEffectiveParameter(node, "rotateZ", 0, frame, frames, frameValues) * Math.PI * 2;
        let x = this.safeFilterNumber(mixInput(nodeId, "X"), null);
        let y = this.safeFilterNumber(mixInput(nodeId, "Y"), null);
        let z = this.safeFilterNumber(mixInput(nodeId, "Z"), null);
        const sinX = Math.sin(angleX);
        const cosX = Math.cos(angleX);
        const nextY = y * cosX - z * sinX;
        const nextZ = y * sinX + z * cosX;
        y = nextY;
        z = nextZ;
        const sinY = Math.sin(angleY);
        const cosY = Math.cos(angleY);
        const nextX = x * cosY + z * sinY;
        z = -x * sinY + z * cosY;
        x = nextX;
        const sinZ = Math.sin(angleZ);
        const cosZ = Math.cos(angleZ);
        value = {
          X: this.safeFilterNumber(x * cosZ - y * sinZ, null),
          Y: this.safeFilterNumber(x * sinZ + y * cosZ, null),
        };
      } else if (node?.type === "valueSlider") {
        const offset = this.readEffectiveParameter(node, "offset", 0, frame, frames, frameValues);
        value = { Bias: offset, Out: offset, offset };
      } else if (node?.type === "macroKnob" || node?.type === "bipolarKnob") {
        const knobValue = this.readEffectiveParameter(node, "value", 0, frame, frames, frameValues);
        value = { Out: knobValue, value: knobValue };
      } else if (node?.type === "passiveFilter") {
        const state = this.passiveFilterStates.get(nodeId) || this.createPassiveFilterState();
        this.passiveFilterStates.set(nodeId, state);
        value = this.passiveFilterSample(
          state,
          mixInput(nodeId),
          this.readEffectiveParameter(node, "mode", 0, frame, frames, frameValues),
          this.readEffectiveParameter(node, "lowFrequency", 200, frame, frames, frameValues),
          this.readEffectiveParameter(node, "highFrequency", 1000, frame, frames, frameValues),
          safeRate,
        );
      } else if (node?.type === "cookbookFilter") {
        const state = this.cookbookFilterStates.get(nodeId) || this.createCookbookFilterState();
        this.cookbookFilterStates.set(nodeId, state);
        value = this.cookbookFilterSample(
          state,
          mixInput(nodeId),
          this.readEffectiveParameter(node, "mode", 1, frame, frames, frameValues),
          this.readEffectiveParameter(node, "frequency", 1000, frame, frames, frameValues),
          this.readEffectiveParameter(node, "q", 1, frame, frames, frameValues),
          this.readEffectiveParameter(node, "gain", 0, frame, frames, frameValues),
          this.readEffectiveParameter(node, "stages", 2, frame, frames, frameValues),
          safeRate,
        );
      } else if (node?.type === "ladderFilter") {
        const state = this.ladderFilterStates.get(nodeId) || this.createLadderFilterState();
        this.ladderFilterStates.set(nodeId, state);
        value = this.ladderFilterSample(
          state,
          mixInput(nodeId),
          {
            frequency: this.readEffectiveParameter(node, "frequency", 1000, frame, frames, frameValues),
            mode: this.readEffectiveParameter(node, "mode", 1, frame, frames, frameValues),
            resonance: this.readEffectiveParameter(node, "resonance", 0.2, frame, frames, frameValues),
            stages: this.readEffectiveParameter(node, "stages", 4, frame, frames, frameValues),
          },
          safeRate,
        );
      } else if (node?.type === "tb303Filter") {
        const state = this.tb303FilterStates.get(nodeId) || this.createTb303FilterState();
        this.tb303FilterStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        value = this.tb303FilterSample(
          state,
          mixInput(nodeId),
          {
            cutoff: read("cutoff", 1000),
            drive: read("drive", 0),
            mode: read("mode", 4),
            resonance: read("resonance", 0),
          },
          safeRate,
        );
      } else if (node?.type === "delayEffect") {
        const state = this.delayEffectStates.get(nodeId) || this.createDelayEffectState();
        this.delayEffectStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        value = this.delayEffectSample(
          state,
          mixInput(nodeId),
          {
            feedback: read("feedback", 0.25),
            level: read("level", 1),
            mix: read("mix", 0.35),
            mode: read("mode", 0),
            modAmount: read("modAmount", 0.02),
            modRate: read("modRate", 0.1),
            modVariation: read("modVariation", 0),
            time: read("time", 0.18),
          },
          safeRate,
          nodeId,
        );
      } else if (node?.type === "reverbEffect") {
        const state = this.reverbEffectStates.get(nodeId) || this.createSabrinaReverbState();
        this.reverbEffectStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const monoInput = mixInput(nodeId, "In");
        const leftInput = mixInput(nodeId, "Left") + monoInput;
        const rightInput = mixInput(nodeId, "Right") + monoInput;
        value = this.sabrinaReverbSample(
          state,
          leftInput,
          rightInput,
          {
            delaySize: read("delaySize", 0.02),
            diffusionAmount: read("diffusionAmount", 0.70),
            diffusionSize: read("diffusionSize", 0.35),
            lfoAmplitude: read("lfoAmplitude", 0.07),
            lfoBaseSpeed: read("lfoBaseSpeed", 0.83),
            lfoVariation: read("lfoVariation", 0.001),
            mix: read("mix", 0.43),
            recycle: read("recycle", 0.70),
            seed: read("seed", 0),
          },
          safeRate,
          frame,
        );
      } else if (node?.type === "pll") {
        const state = this.pllStates.get(nodeId) || this.createPllState();
        this.pllStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const cvConnected = this.inputConnections?.has?.(this.inputKey(nodeId, "VCO CV In")) ? 1 : 0;
        value = this.pllSample(
          state,
          mixInput(nodeId, "Signal In"),
          mixInput(nodeId, "VCO CV In"),
          cvConnected,
          {
            range: read("range", 1),
            offset: read("offset", 5),
            type: read("type", 1),
            frequ: read("frequ", 10),
          },
          safeRate,
        );
      } else if (node?.type === "helmholtzPitch") {
        const state = this.helmholtzStates.get(nodeId) || this.createHelmholtzState();
        this.helmholtzStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        value = this.helmholtzSample(
          state,
          mixInput(nodeId, "In"),
          {
            windowSize: read("windowSize", 512),
            threshold: read("threshold", 0.93),
          },
          hasInput(nodeId, "In"),
          safeRate,
        );
      } else if (node?.type === "slewLimiter") {
        const state = this.slewLimiterStates.get(nodeId) || this.createSlewLimiterState();
        this.slewLimiterStates.set(nodeId, state);
        value = this.slewLimiterSample(
          state,
          mixInput(nodeId),
          this.readEffectiveParameter(node, "upTime", 0.05, frame, frames, frameValues),
          this.readEffectiveParameter(node, "downTime", 0.20, frame, frames, frameValues),
          safeRate,
        );
      } else if (node?.type === "sampleHold") {
        const state = this.sampleHoldStates.get(nodeId) || this.createSampleHoldState();
        this.sampleHoldStates.set(nodeId, state);
        value = this.sampleHoldSample(
          state,
          mixInput(nodeId, "In"),
          mixInput(nodeId, "Trigger"),
          this.readEffectiveParameter(node, "threshold", 0, frame, frames, frameValues),
          this.readEffectiveParameter(node, "sampleFrequency", 0, frame, frames, frameValues),
          safeRate,
          hasInput(nodeId, "In"),
          nodeId,
        );
      } else if (node?.type === "expAdsr") {
        const state = this.expAdsrStates.get(nodeId) || this.createExpAdsrState();
        this.expAdsrStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        value = this.expAdsrSample(
          state,
          mixInput(nodeId, "Gate"),
          {
            attack: read("attack", 0.08),
            attackShape: read("attackShape", 0.3),
            decay: read("decay", 0.22),
            delay: read("delay", 0),
            level: read("level", 1),
            loop: read("loop", 0),
            release: read("release", 0.45),
            releaseShape: read("releaseShape", 0.0001),
            sustain: read("sustain", 0.55),
          },
          safeRate,
        );
      } else if (node?.type === "linearEnvelope") {
        const state = this.linearEnvelopeStates.get(nodeId) || this.createLinearEnvelopeState();
        this.linearEnvelopeStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        value = this.linearEnvelopeSample(
          state,
          mixInput(nodeId, "Gate"),
          {
            attack: read("attack", 0.08),
            decay: read("decay", 0.22),
            delay: read("delay", 0),
            level: read("level", 1),
            loop: read("loop", 0),
            release: read("release", 0.45),
            sustain: read("sustain", 0.55),
          },
          safeRate,
        );
      } else if (node?.type === "pluckEnvelope") {
        const state = this.pluckEnvelopeStates.get(nodeId) || this.createPluckEnvelopeState();
        this.pluckEnvelopeStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        value = this.pluckEnvelopeSample(
          state,
          mixInput(nodeId, "Trigger"),
          mixInput(nodeId, "Release"),
          {
            attackFeedback: read("attackFeedback", 0.002),
            autoReleaseTime: read("autoReleaseTime", 0.08),
            decay: read("decay", 0.35),
            decayModCurve: read("decayModCurve", 0),
            decayModEnd: read("decayModEnd", 0.55),
            decayModFrequency: read("decayModFrequency", 1.5),
            decayModStart: read("decayModStart", 0.08),
            delayTime: read("delayTime", 0),
            endingDecay: read("endingDecay", 0.8),
            level: read("level", 1),
            releaseFeedback: read("releaseFeedback", 0.35),
            velocity: read("velocity", 1),
            velocitySensitivity: read("velocitySensitivity", 0),
          },
          safeRate,
        );
      } else if (node?.type === "vactrolEnvelope" || node?.type === "vactrolEnvelopeC4") {
        const state = this.vactrolEnvelopeStates.get(nodeId) || this.createVactrolEnvelopeState();
        this.vactrolEnvelopeStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const isC4 = node?.type === "vactrolEnvelopeC4";
        value = this.vactrolEnvelopeSample(
          state,
          mixInput(nodeId, "Light"),
          {
            attack: read("attack", isC4 ? 0.006 : 0.0025),
            curve: read("curve", 1),
            darkCurrent: read("darkCurrent", 0),
            lightOffset: read("lightOffset", 0),
            release: read("release", isC4 ? 1.5 : 0.035),
            sensitivity: read("sensitivity", 1),
          },
          safeRate,
        );
      } else if (node?.type === "flowerChildEnvelopeFollower") {
        const state = this.flowerChildEnvelopeFollowerStates.get(nodeId) ||
          this.createFlowerChildEnvelopeFollowerState();
        this.flowerChildEnvelopeFollowerStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        value = this.flowerChildEnvelopeFollowerSample(
          state,
          mixInput(nodeId, "In"),
          {
            attack: read("attack", 0.001),
            decay: read("decay", 0.001),
            hold: read("hold", 0.001),
          },
          safeRate,
        );
      } else if (node?.type === "sandboxVisuals") {
        const screenShake = this.smoothVisualControl(
          "screenShake",
          this.visualControlIntensity(mixInput(nodeId, "Shake"), nodeId, "screen visuals shake"),
          safeRate,
        );
        const x = this.smoothVisualControl(
          "x",
          this.visualControlSigned(mixInput(nodeId, "X"), nodeId, "sandbox visuals x"),
          safeRate,
          0.045,
          -1,
          1,
        );
        const y = this.smoothVisualControl(
          "y",
          this.visualControlSigned(mixInput(nodeId, "Y"), nodeId, "sandbox visuals y"),
          safeRate,
          0.045,
          -1,
          1,
        );
        const screenDim = this.smoothVisualControl(
          "screenDim",
          this.visualControlIntensity(mixInput(nodeId, "Dim"), nodeId, "screen visuals dim"),
          safeRate,
        );
        const red = this.smoothVisualControl(
          "red",
          this.visualControlIntensity(mixInput(nodeId, "Red"), nodeId, "sandbox visuals red"),
          safeRate,
        );
        const green = this.smoothVisualControl(
          "green",
          this.visualControlIntensity(mixInput(nodeId, "Green"), nodeId, "sandbox visuals green"),
          safeRate,
        );
        const blue = this.smoothVisualControl(
          "blue",
          this.visualControlIntensity(mixInput(nodeId, "Blue"), nodeId, "sandbox visuals blue"),
          safeRate,
        );
        const scopeTracesOff = this.smoothVisualControl(
          "scopeTracesOff",
          this.visualControlIntensity(mixInput(nodeId, "Scope Off"), nodeId, "screen visuals scope off"),
          safeRate,
          0,
        );
        const scopePaused = this.smoothVisualControl(
          "scopePaused",
          this.visualControlIntensity(mixInput(nodeId, "Pause"), nodeId, "screen visuals pause"),
          safeRate,
          0,
        );
        value = {
          Blue: blue,
          Green: green,
          Pause: scopePaused,
          Red: red,
          ScopeOff: scopeTracesOff,
          ScreenDim: screenDim,
          ScreenShake: screenShake,
          X: x,
          Y: y,
        };
      } else if (node?.type === "screenSpaceShader") {
        value = this.screenSpaceShaderSample(
          node,
          (port) => mixInput(nodeId, port),
          safeRate,
          nodeId,
        );
      } else if (node?.type === "bloomGlow") {
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const screenDim = this.smoothVisualControl(
          "screenDim",
          read("screenDim", 0),
          safeRate,
        );
        const visualBrightness = this.smoothVisualControl(
          "visualBrightness",
          read("visualBrightness", 0.55),
          safeRate,
        );
        const visualBloom = this.smoothVisualControl(
          "visualBloom",
          read("visualBloom", 0.45),
          safeRate,
        );
        const visualGlow = this.smoothVisualControl(
          "visualGlow",
          read("visualGlow", 0.6),
          safeRate,
        );
        value = {
          Bloom: visualBloom,
          Brightness: visualBrightness,
          Dim: screenDim,
          Glow: visualGlow,
        };
      } else if (node?.type === "rgbaHsla") {
        const rgbRed = this.visualControlIntensity(mixInput(nodeId, "Red"), nodeId, "rgba hsla red");
        const rgbGreen = this.visualControlIntensity(mixInput(nodeId, "Green"), nodeId, "rgba hsla green");
        const rgbBlue = this.visualControlIntensity(mixInput(nodeId, "Blue"), nodeId, "rgba hsla blue");
        const hue = this.visualControlIntensity(mixInput(nodeId, "Hue"), nodeId, "rgba hsla hue");
        const saturation = this.visualControlIntensity(mixInput(nodeId, "Saturation"), nodeId, "rgba hsla saturation");
        const lightness = this.visualControlIntensity(mixInput(nodeId, "Lightness"), nodeId, "rgba hsla lightness");
        const hslMix = this.visualControlIntensity(mixInput(nodeId, "HSL Mix"), nodeId, "rgba hsla hsl mix");
        const hslRgb = this.visualHslToRgb(hue, saturation, lightness);
        const red = this.smoothVisualControl("red", rgbRed * (1 - hslMix) + hslRgb[0] * hslMix, safeRate);
        const green = this.smoothVisualControl("green", rgbGreen * (1 - hslMix) + hslRgb[1] * hslMix, safeRate);
        const blue = this.smoothVisualControl("blue", rgbBlue * (1 - hslMix) + hslRgb[2] * hslMix, safeRate);
        const alpha = this.smoothVisualControl(
          "screenDim",
          this.visualControlIntensity(mixInput(nodeId, "Alpha"), nodeId, "rgba hsla alpha"),
          safeRate,
        );
        value = { Alpha: alpha, Blue: blue, Green: green, Red: red };
      } else if (node?.type === "chromaColor") {
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const chromaHue = this.smoothVisualControl(
          "chromaHue",
          read("chromaHue", 0.58),
          safeRate,
        );
        const chromaSaturation = this.smoothVisualControl(
          "chromaSaturation",
          read("chromaSaturation", 0.82),
          safeRate,
        );
        const chromaLightness = this.smoothVisualControl(
          "chromaLightness",
          read("chromaLightness", 0.52),
          safeRate,
        );
        const chromaAlpha = this.smoothVisualControl(
          "chromaAlpha",
          read("chromaAlpha", 0.35),
          safeRate,
        );
        const chromaDrift = this.smoothVisualControl(
          "chromaDrift",
          read("chromaDrift", 0.25),
          safeRate,
        );
        const chromaSpread = this.smoothVisualControl(
          "chromaSpread",
          read("chromaSpread", 0.4),
          safeRate,
        );
        const visualBrightness = this.smoothVisualControl(
          "visualBrightness",
          read("visualBrightness", 0.55),
          safeRate,
        );
        const visualBloom = this.smoothVisualControl(
          "visualBloom",
          read("visualBloom", 0.45),
          safeRate,
        );
        const visualGlow = this.smoothVisualControl(
          "visualGlow",
          read("visualGlow", 0.6),
          safeRate,
        );
        value = {
          Alpha: chromaAlpha,
          Bloom: visualBloom,
          Chroma: chromaSaturation,
          Drift: chromaDrift,
          Glow: visualGlow,
          Hue: chromaHue,
          Light: chromaLightness,
          Spread: chromaSpread,
          TraceBrightness: visualBrightness,
        };
      } else if (node?.type === "badvalMonitor") {
        value = this.monitorBadValueSample(mixInput(nodeId), nodeId);
      } else if (node?.type === "speakerProtection") {
        value = this.speakerProtectionSample(mixInput(nodeId), nodeId);
      } else if (node?.type === "groupOutput") {
        value = {
          Out: mixInput(nodeId, "In"),
        };
      } else if (node?.type === "clapPlugin") {
        value = {
          Left: 0,
          Right: 0,
        };
      } else if (node?.type === "output") {
        const outputMonoIn = mixInput(nodeId, "Mono");
        const outputLeftIn = mixInput(nodeId, "Left");
        const outputRightIn = mixInput(nodeId, "Right");
        value = {
          Left: outputMonoIn + outputLeftIn,
          Out: outputMonoIn + (outputLeftIn + outputRightIn) * 0.5,
          Right: outputMonoIn + outputRightIn,
        };
      }
      frameValues.set(nodeId, value);
      this.nodeOutputs.set(nodeId, value);
    }

    const outputNode = this.nodes.get(this.outputNode || "output");
    const outputVolume = outputNode
      ? this.readEffectiveParameter(outputNode, "volume", 0.1, frame, frames, frameValues)
      : 1;

    const outputMono = mixInput(this.outputNode || "output", "Mono");
    this.currentFrameValues = frameValues;
    return {
      left: (outputMono + mixInput(this.outputNode || "output", "Left")) * outputVolume,
      right: (outputMono + mixInput(this.outputNode || "output", "Right")) * outputVolume,
    };
  }

  process(inputs, outputs) {
    const blockStartedAt = globalThis.performance?.now?.() || 0;
    const output = outputs[0] || [];
    const frames = output[0]?.length || 128;
    const input = inputs[0] || [];
    const oversamplingRatio = Math.max(1, Math.min(4, Math.round(this.oversamplingRatio) || 1));
    const engineSampleRate = Math.max(1, this.engineSampleRate || sampleRate || 44100);
    const engineFrames = frames * oversamplingRatio;
    if (!this.nodes.size || !this.order.length) {
      for (const channel of output) {
        channel.fill(0);
      }
      return true;
    }

    for (let frame = 0; frame < frames; frame += 1) {
      const inputLeft = Number(input[0]?.[frame]) || 0;
      const inputRight = Number(input[1]?.[frame]) || inputLeft;
      this.inputMeterPeak = Math.max(this.inputMeterPeak, Math.abs(inputLeft), Math.abs(inputRight));
      this.inputMeterSquareSum += (inputLeft * inputLeft + inputRight * inputRight) * 0.5;
      this.inputMeterSamples += 1;
      let leftSum = 0;
      let rightSum = 0;
      let decimatedLeft = 0;
      let decimatedRight = 0;
      const useRaptEllipticDecimator = oversamplingRatio === 4;
      for (let subframe = 0; subframe < oversamplingRatio; subframe += 1) {
        const engineFrame = frame * oversamplingRatio + subframe;
        const subframeOutput = this.evaluateFrame(engineFrame, engineFrames, inputs, engineSampleRate, frame);
        if (useRaptEllipticDecimator) {
          decimatedLeft = this.processRaptEllipticDecimatorSample(
            subframeOutput.left,
            this.raptEllipticDecimatorLeft,
          );
          decimatedRight = this.processRaptEllipticDecimatorSample(
            subframeOutput.right,
            this.raptEllipticDecimatorRight,
          );
        } else {
          leftSum += subframeOutput.left;
          rightSum += subframeOutput.right;
        }
        this.captureModuleScopeFrame(this.currentFrameValues, engineFrame, engineFrames);
        this.scopeCounter += 1;
        if (this.scopeCounter >= Math.max(1, Math.floor(engineSampleRate / 30))) {
          this.scopeCounter = 0;
          this.postModuleScopeSnapshot();
        }
        this.visualControlCounter += 1;
        if (this.visualControlCounter >= Math.max(1, Math.floor(engineSampleRate / 30))) {
          this.visualControlCounter = 0;
          this.postVisualControls();
        }
      }
      const frameOutput = {
        left: useRaptEllipticDecimator ? decimatedLeft : leftSum / oversamplingRatio,
        right: useRaptEllipticDecimator ? decimatedRight : rightSum / oversamplingRatio,
      };
      if (this.outputSampleClipped(frameOutput.left)) {
        this.meterClipCount += 1;
      }
      if (this.outputSampleClipped(frameOutput.right)) {
        this.meterClipCount += 1;
      }
      if (
        this.outputSampleTripsEarProtection(frameOutput.left) ||
        this.outputSampleTripsEarProtection(frameOutput.right)
      ) {
        this.meterProtectionMuteCount += 1;
        this.speakerProtectionPeak = Math.max(
          Number(this.speakerProtectionPeak) || 0,
          Number.isFinite(Number(frameOutput.left)) ? Math.abs(Number(frameOutput.left)) : Infinity,
          Number.isFinite(Number(frameOutput.right)) ? Math.abs(Number(frameOutput.right)) : Infinity,
        );
        this.speakerProtectionNodeId = "output";
        for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
          output[channelIndex][frame] = 0;
        }
        continue;
      }
      const protectedFrame = this.earProtector.protect(frameOutput.left, frameOutput.right);
      if (protectedFrame.muted) {
        this.meterProtectionMuteCount += 1;
      }
      const left = this.clampValue(protectedFrame.left, -0.95, 0.95);
      const right = this.clampValue(protectedFrame.right, -0.95, 0.95);
      this.meterPeak = Math.max(this.meterPeak, Math.abs(left), Math.abs(right));
      this.meterSquareSum += (left * left + right * right) * 0.5;
      this.meterSamples += 1;
      this.gpuAdditiveStatusCounter += 1;
      for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
        output[channelIndex][frame] = channelIndex === 0 ? left : right;
      }
    }
    this.finishSmoothing();
    if (blockStartedAt > 0) {
      const elapsedMs = Math.max(0, (globalThis.performance?.now?.() || blockStartedAt) - blockStartedAt);
      const blockBudgetMs = (frames / Math.max(1, sampleRate || this.hostSampleRate || 44100)) * 1000;
      const budgetRatio = blockBudgetMs > 0 ? elapsedMs / blockBudgetMs : 0;
      this.maxBlockProcessMs = Math.max(Number(this.maxBlockProcessMs) || 0, elapsedMs);
      this.maxBlockBudgetRatio = Math.max(Number(this.maxBlockBudgetRatio) || 0, budgetRatio);
      if (budgetRatio >= 0.85) {
        this.meterOverrunCount += 1;
      }
    }
    this.meterCounter += frames;
    if (this.meterCounter >= sampleRate / 10) {
      this.port.postMessage({
        audioPlayerNodeId: this.audioPlayerMeterNodeId || this.audioPlayerNodeIds[0] || "",
        audioPlayerNodeIds: [...this.audioPlayerNodeIds],
        audioPlayerPeak: this.audioPlayerMeterPeak,
        audioPlayerPhase: this.audioPlayerMeterPhase,
        audioPlayerReason: this.audioPlayerMeterReason,
        audioPlayerSamples: this.audioPlayerMeterSamples,
        clipCount: this.meterClipCount,
        badNumberCount: this.badNumberCount,
        lastBadValueReason: this.lastBadValueReason,
        lastBadValueNodeId: this.lastBadValueNodeId,
        lastBadValueSource: this.lastBadValueSource,
        inputPeak: this.inputMeterPeak,
        inputRms: Math.sqrt(this.inputMeterSquareSum / Math.max(1, this.inputMeterSamples)),
        maxBlockBudgetRatio: this.maxBlockBudgetRatio,
        maxBlockProcessMs: this.maxBlockProcessMs,
        overrunCount: this.meterOverrunCount,
        peak: this.meterPeak,
        protectionNodeId: this.speakerProtectionNodeId || "",
        protectionPeak: Number(this.speakerProtectionPeak) || 0,
        protectionMuteCount: this.meterProtectionMuteCount,
        sessionId: this.sessionId,
        rms: Math.sqrt(this.meterSquareSum / Math.max(1, this.meterSamples)),
        type: "meter",
      });
      this.meterCounter = 0;
      this.inputMeterPeak = 0;
      this.audioPlayerMeterNodeId = "";
      this.audioPlayerMeterPeak = 0;
      this.audioPlayerMeterPhase = 0;
      this.audioPlayerMeterReason = "";
      this.audioPlayerMeterSamples = 0;
      this.inputMeterSamples = 0;
      this.inputMeterSquareSum = 0;
      this.meterClipCount = 0;
      this.badNumberCount = 0;
      this.maxBlockProcessMs = 0;
      this.maxBlockBudgetRatio = 0;
      this.meterOverrunCount = 0;
      this.lastBadValueReason = "";
      this.lastBadValueNodeId = "";
      this.lastBadValueSource = "";
      this.meterPeak = 0;
      this.meterProtectionMuteCount = 0;
      this.speakerProtectionNodeId = "";
      this.speakerProtectionPeak = 0;
      this.meterSamples = 0;
      this.meterSquareSum = 0;
    }
    if (this.gpuAdditiveStatusCounter >= sampleRate / 20) {
      this.gpuAdditiveStatusCounter = 0;
      this.postGpuAdditiveStatus();
    }
    return true;
  }
}

registerProcessor("node-live-audio-processor", NodeLiveAudioProcessor);
