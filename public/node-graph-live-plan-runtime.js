function nodeGraphBuildLivePlan() {
  const compiled = compileNodeGraphExecutionPlan();
  if (!compiled.valid) {
    const error = new Error(compiled.issues.join(", "));
    error.issues = [...compiled.issues];
    throw error;
  }

  const activeNodeIds = nodeGraphActiveNodeIds(compiled);
  const activeSignalConnections = nodeGraphActiveSignalConnections(compiled)
    .map((connection) => ({ ...connection }));
  const activeGraphConnections = nodeGraphActiveGraphConnections(compiled)
    .map((connection) => ({ ...connection }));
  const activeModulations = nodeGraphActiveModulations(compiled)
    .map((modulation) => ({ ...modulation }));

  const plan = {
    connections: activeSignalConnections,
    feedbackConnections: compiled.feedbackConnections.map((connection) => ({ ...connection })),
    feedbackGraphConnections: (compiled.feedbackGraphConnections || []).map((connection) => ({ ...connection })),
    feedbackModulations: compiled.feedbackModulations.map((modulation) => ({ ...modulation })),
    graphConnections: activeGraphConnections,
    modulations: activeModulations,
    nodes: nodeGraphBuildLiveParameterNodes(activeNodeIds),
    order: [...compiled.order],
    outputNode: compiled.outputNode,
    patchFingerprint: nodeGraphPatchFingerprint(),
    scopeCaptureNodeIds: [...(compiled.scopeCaptureNodeIds || [])],
    speakerOutputActive: Boolean(compiled.speakerOutputActive),
    sourceNodes: [...compiled.sourceNodes],
    visualSinks: (compiled.visualSinks || []).map((sink) => ({
      ...sink,
      bufferedInputs: [...(sink.bufferedInputs || [])],
      inputs: (sink.inputs || []).map((input) => ({ ...input })),
    })),
  };
  plan.samples = typeof nodeGraphLiveSamplesForPlan === "function"
    ? nodeGraphLiveSamplesForPlan(plan, nodeGraphMvp.patch)
    : [];
  return plan;
}

function nodeGraphBuildLivePlanForPatch(patch) {
  const normalizedPatch = validateNodeGraphPatch(patch);
  const compiled = compileNodeGraphExecutionPlan(normalizedPatch);
  if (!compiled.valid) {
    const error = new Error(compiled.issues.join(", "));
    error.issues = [...compiled.issues];
    throw error;
  }
  const activeNodeIds = nodeGraphActiveNodeIds(compiled);
  const plan = {
    connections: nodeGraphActiveSignalConnections(compiled).map((connection) => ({ ...connection })),
    feedbackConnections: compiled.feedbackConnections.map((connection) => ({ ...connection })),
    feedbackGraphConnections: (compiled.feedbackGraphConnections || []).map((connection) => ({ ...connection })),
    feedbackModulations: compiled.feedbackModulations.map((modulation) => ({ ...modulation })),
    graphConnections: nodeGraphActiveGraphConnections(compiled).map((connection) => ({ ...connection })),
    modulations: nodeGraphActiveModulations(compiled).map((modulation) => ({ ...modulation })),
    nodes: nodeGraphBuildLiveParameterNodesForPatch(normalizedPatch, activeNodeIds),
    order: [...compiled.order],
    outputNode: compiled.outputNode,
    patchFingerprint: nodeGraphPatchFingerprint(normalizedPatch),
    scopeCaptureNodeIds: [...(compiled.scopeCaptureNodeIds || [])],
    speakerOutputActive: Boolean(compiled.speakerOutputActive),
    sourceNodes: [...compiled.sourceNodes],
    timing: normalizeNodeGraphPatchTiming(compiled.timing),
    visualSinks: [],
  };
  plan.samples = typeof nodeGraphLiveSamplesForPlan === "function"
    ? nodeGraphLiveSamplesForPlan(plan, normalizedPatch)
    : [];
  return plan;
}

function nodeGraphBuildLiveParameterNodes(activeNodeIds = null) {
  const activeIds = activeNodeIds instanceof Set ? activeNodeIds : null;
  return nodeGraphMvp.patch.nodes
    .filter((node) => !activeIds || activeIds.has(node.id))
    .map((node) => {
      const definition = nodeGraphModuleDefinitions[node.type];
      const params = {};
      const paramMeta = {};
      for (const parameter of definition.parameters || []) {
        const value = nodeGraphReadPatchParameterValue(node, parameter.key);
        params[parameter.key] = Number.isFinite(value)
          ? value
          : nodeGraphParameterFallback(node.type, parameter.key);
        paramMeta[parameter.key] = nodeGraphReadPatchParameterMetadata(node, parameter.key);
      }
      if (node.type === "clapPlugin") {
        for (const [key, metadata] of Object.entries(node.paramMeta || {})) {
          if (Object.hasOwn(paramMeta, key)) {
            continue;
          }
          const normalizedMetadata = normalizeNodeGraphPatchParameterMetadata(node.type, key, metadata);
          if (!normalizedMetadata) {
            continue;
          }
          paramMeta[key] = normalizedMetadata;
          params[key] = normalizeNodeGraphPatchParameter(
            node.type,
            key,
            Object.hasOwn(node.params || {}, key) ? node.params[key] : normalizedMetadata.def,
            normalizedMetadata,
          );
        }
      }
      const runtimeNode = {
        id: node.id,
        paramMeta,
        params,
        type: node.type,
      };
      if (node.type === "codeblock") {
        runtimeNode.codeblock = normalizeNodeGraphCodeblock(node.codeblock);
      }
      if (node.type === "moduleGroup") {
        runtimeNode.moduleGroup = normalizeNodeGraphModuleGroup(node.moduleGroup);
        if (runtimeNode.moduleGroup.sourcePatch) {
          runtimeNode.moduleGroupPlan = nodeGraphBuildLivePlanForPatch(runtimeNode.moduleGroup.sourcePatch);
        }
      }
      if (node.type === "clapPlugin") {
        runtimeNode.clap = normalizeNodeGraphClapPluginBinding(node.clap);
      }
      if (node.type === "samplePlayer" || node.type === "sampleLooper" || node.type === "audioPlayer") {
        runtimeNode.sample = { id: normalizeNodeGraphSampleId(node.sample?.id) };
      }
      return runtimeNode;
    });
}

function nodeGraphBuildLiveParameterNodesForPatch(patch, activeNodeIds = null) {
  const activeIds = activeNodeIds instanceof Set ? activeNodeIds : null;
  return (patch.nodes || [])
    .filter((node) => !activeIds || activeIds.has(node.id))
    .map((node) => {
      const definition = nodeGraphModuleDefinitions[node.type];
      const params = {};
      const paramMeta = {};
      for (const parameter of definition.parameters || []) {
        const value = Number(node.params?.[parameter.key]);
        params[parameter.key] = Number.isFinite(value)
          ? value
          : nodeGraphParameterFallback(node.type, parameter.key);
        paramMeta[parameter.key] = normalizeNodeGraphPatchParameterMetadata(
          node.type,
          parameter.key,
          node.paramMeta?.[parameter.key],
        ) || nodeGraphParameterDefinitionMetadata(parameter);
      }
      if (node.type === "clapPlugin") {
        for (const [key, metadata] of Object.entries(node.paramMeta || {})) {
          if (Object.hasOwn(paramMeta, key)) {
            continue;
          }
          const normalizedMetadata = normalizeNodeGraphPatchParameterMetadata(node.type, key, metadata);
          if (!normalizedMetadata) {
            continue;
          }
          paramMeta[key] = normalizedMetadata;
          params[key] = normalizeNodeGraphPatchParameter(
            node.type,
            key,
            Object.hasOwn(node.params || {}, key) ? node.params[key] : normalizedMetadata.def,
            normalizedMetadata,
          );
        }
      }
      const runtimeNode = {
        id: node.id,
        paramMeta,
        params,
        type: node.type,
      };
      if (node.type === "codeblock") {
        runtimeNode.codeblock = normalizeNodeGraphCodeblock(node.codeblock);
      }
      if (node.type === "moduleGroup") {
        runtimeNode.moduleGroup = normalizeNodeGraphModuleGroup(node.moduleGroup);
        if (runtimeNode.moduleGroup.sourcePatch) {
          runtimeNode.moduleGroupPlan = nodeGraphBuildLivePlanForPatch(runtimeNode.moduleGroup.sourcePatch);
        }
      }
      if (node.type === "clapPlugin") {
        runtimeNode.clap = normalizeNodeGraphClapPluginBinding(node.clap);
      }
      if (node.type === "samplePlayer" || node.type === "sampleLooper" || node.type === "audioPlayer") {
        runtimeNode.sample = { id: normalizeNodeGraphSampleId(node.sample?.id) };
      }
      return runtimeNode;
    });
}

function nodeGraphConnectionMapFromList(items = [], keyForItem) {
  const map = new Map();
  for (const item of items || []) {
    const key = keyForItem(item);
    const list = map.get(key) || [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

function nodeGraphLiveInputConnectionMap(plan) {
  return nodeGraphConnectionMapFromList(
    plan?.connections || [],
    (connection) => nodeGraphInputKey(connection.destinationNode, connection.destinationPort),
  );
}

function nodeGraphLiveGraphInputConnectionMap(plan) {
  return nodeGraphConnectionMapFromList(
    plan?.graphConnections || [],
    (connection) => nodeGraphGraphInputKey(connection.destinationNode, connection.destinationGraphInput),
  );
}

function nodeGraphLiveModulationConnectionMap(plan) {
  return nodeGraphConnectionMapFromList(
    plan?.modulations || [],
    (modulation) => nodeGraphParameterKey(modulation.destinationNode, modulation.destinationParam),
  );
}

function createNodeGraphLiveRuntime(plan) {
  const nodes = new Map((plan.nodes || []).map((node) => [node.id, node]));
  const inputConnections = nodeGraphLiveInputConnectionMap(plan);
  const graphInputConnections = nodeGraphLiveGraphInputConnectionMap(plan);
  const modulationConnections = nodeGraphLiveModulationConnectionMap(plan);
  const phases = new Map();
  const noiseSeedKeys = new Map();
  const noiseSeeds = new Map();
  const oscResetStates = new Map();
  const graphLfoStates = new Map();
  const passiveFilterStates = new Map();
  const clockStates = new Map();
  const codeblockFunctions = new Map();
  const cookbookFilterStates = new Map();
  const clockDividerStates = new Map();
  const delayedTriggerStates = new Map();
  const delayEffectStates = new Map();
  const expAdsrStates = new Map();
  const fractalBrownianNoiseStates = new Map();
  const flowerChildEnvelopeFollowerStates = new Map();
  const ladderFilterStates = new Map();
  const tb303FilterStates = new Map();
  const linearEnvelopeStates = new Map();
  const logisticMapStates = new Map();
  const henonMapStates = new Map();
  const chuaAttractorStates = new Map();
  const chordMemoryStates = new Map();
  const turingMachineStates = new Map();
  const pitchQuantizerStates = new Map();
  const surgeOscillatorStates = new Map();
  const dsfOscillatorStates = new Map();
  const robinSupersawStates = new Map();
  const hypersawStates = new Map();
  const lorenzAttractorStates = new Map();
  const moduleGroupRuntimes = new Map();
  const noiseGeneratorStates = new Map();
  const oscillatorLastPhaseIncrements = new Map();
  const oscillatorStoppedSamples = new Map();
  const patchCommandStates = new Map();
  const pluckEnvelopeStates = new Map();
  const randomClockStates = new Map();
  const randomWalkStates = new Map();
  const reverbEffectStates = new Map();
  const pllStates = new Map();
  const helmholtzStates = new Map();
  const sampleHoldStates = new Map();
  const samplePlaybackStates = new Map();
  const samples = new Map((plan.samples || []).map((sample) => [sample.id, sample]));
  const slewLimiterStates = new Map();
  const stepSequencerStates = new Map();
  const spiralStates = new Map();
  const smoothers = new Map();
  const triggerCounterStates = new Map();
  const triggerDividerStates = new Map();
  const triangleStates = new Map();
  const vactrolEnvelopeStates = new Map();
  const visualControlState = createNodeGraphVisualControlState();
  for (const node of plan.nodes || []) {
    if (nodeGraphModuleIsRealtimeOscillatorType(node.type)) {
      phases.set(node.id, 0);
      oscResetStates.set(node.id, createNodeGraphOscResetState());
      triangleStates.set(node.id, 0);
    }
    if (nodeGraphModuleIsRealtimeOscillatorType(node.type)) {
      noiseSeeds.set(node.id, nodeGraphStableSeed(node.id));
    }
    if (node.type === "spiral") {
      spiralStates.set(node.id, createJerobeamSpiralState());
    }
    if (node.type === "lorenzAttractor") {
      lorenzAttractorStates.set(node.id, createNodeGraphLorenzAttractorState());
    }
    if (node.type === "logisticMap") {
      logisticMapStates.set(node.id, createNodeGraphLogisticMapState());
    }
    if (node.type === "henonMap") {
      henonMapStates.set(node.id, createNodeGraphHenonMapState());
    }
    if (node.type === "chuaAttractor") {
      chuaAttractorStates.set(node.id, createNodeGraphChuaAttractorState());
    }
    if (node.type === "chordMemory") {
      chordMemoryStates.set(node.id, createNodeGraphChordMemoryState());
    }
    if (node.type === "turingMachine") {
      turingMachineStates.set(node.id, createNodeGraphTuringMachineState());
    }
    if (node.type === "pitchQuantizer") {
      pitchQuantizerStates.set(node.id, createNodeGraphPitchQuantizerState());
    }
    if (node.type === "surgeOscillator") {
      surgeOscillatorStates.set(node.id, createNodeGraphSurgeOscillatorState());
    }
    if (node.type === "dsfOscillator") {
      dsfOscillatorStates.set(node.id, createNodeGraphDsfOscillatorState());
    }
    if (node.type === "robinSupersaw") {
      robinSupersawStates.set(node.id, createNodeGraphRobinSupersawState());
    }
    if (node.type === "hypersaw") {
      hypersawStates.set(node.id, createNodeGraphHypersawState());
    }
    if (node.type === "passiveFilter") {
      passiveFilterStates.set(node.id, createNodeGraphPassiveFilterState());
    }
    if (node.type === "cookbookFilter") {
      cookbookFilterStates.set(node.id, createNodeGraphCookbookFilterState());
    }
    if (node.type === "ladderFilter") {
      ladderFilterStates.set(node.id, createNodeGraphLadderFilterState());
    }
    if (node.type === "tb303Filter") {
      tb303FilterStates.set(node.id, createNodeGraphTb303FilterState());
    }
    if (node.type === "clock") {
      clockStates.set(node.id, createNodeGraphClockState());
    }
    if (nodeGraphModuleIsGraphType(node.type)) {
      graphLfoStates.set(node.id, createNodeGraphGraphLfoState());
    }
    if (node.type === "clockDivider") {
      clockDividerStates.set(node.id, createNodeGraphTriggerDividerState());
    }
    if (node.type === "delayedTrigger") {
      delayedTriggerStates.set(node.id, createNodeGraphDelayedTriggerState());
    }
    if (node.type === "delayEffect") {
      delayEffectStates.set(node.id, createNodeGraphDelayEffectState());
    }
    if (node.type === "reverbEffect") {
      reverbEffectStates.set(node.id, createNodeGraphSabrinaReverbState());
    }
    if (node.type === "pll") {
      pllStates.set(node.id, createNodeGraphPllState());
    }
    if (node.type === "helmholtzPitch") {
      helmholtzStates.set(node.id, createNodeGraphHelmholtzState());
    }
    if (node.type === "randomClock") {
      randomClockStates.set(node.id, createNodeGraphRandomClockState());
    }
    if (node.type === "sampleHold") {
      sampleHoldStates.set(node.id, createNodeGraphSampleHoldState());
    }
    if (node.type === "samplePlayer" || node.type === "sampleLooper" || node.type === "audioPlayer") {
      samplePlaybackStates.set(node.id, createNodeGraphSamplePlaybackState());
    }
    if (node.type === "nextPatch" || node.type === "previousPatch") {
      patchCommandStates.set(node.id, createNodeGraphPatchCommandState());
    }
    if (node.type === "slewLimiter") {
      slewLimiterStates.set(node.id, createNodeGraphSlewLimiterState());
    }
    if (node.type === "expAdsr") {
      expAdsrStates.set(node.id, createNodeGraphExpAdsrState());
    }
    if (node.type === "linearEnvelope") {
      linearEnvelopeStates.set(node.id, createNodeGraphLinearEnvelopeState());
    }
    if (node.type === "noiseGenerator") {
      noiseGeneratorStates.set(node.id, createNodeGraphNoiseGeneratorState());
    }
    if (node.type === "randomWalk") {
      randomWalkStates.set(node.id, createNodeGraphRandomWalkState());
    }
    if (node.type === "fractalBrownianNoise") {
      fractalBrownianNoiseStates.set(node.id, createNodeGraphFractalBrownianNoiseState());
    }
    if (node.type === "flowerChildEnvelopeFollower") {
      flowerChildEnvelopeFollowerStates.set(node.id, createNodeGraphFlowerChildEnvelopeFollowerState());
    }
    if (node.type === "pluckEnvelope") {
      pluckEnvelopeStates.set(node.id, createNodeGraphPluckEnvelopeState());
    }
    if (node.type === "stepSequencer") {
      stepSequencerStates.set(node.id, createNodeGraphStepSequencerState());
    }
    if (node.type === "triggerCounter") {
      triggerCounterStates.set(node.id, createNodeGraphTriggerCounterState());
    }
    if (node.type === "triggerDivider") {
      triggerDividerStates.set(node.id, createNodeGraphTriggerDividerState());
    }
    if (node.type === "vactrolEnvelope" || node.type === "vactrolEnvelopeC4") {
      vactrolEnvelopeStates.set(node.id, createNodeGraphVactrolEnvelopeState());
    }
    if (node.type === "moduleGroup" && node.moduleGroup?.sourcePatch) {
      try {
        moduleGroupRuntimes.set(node.id, createNodeGraphLiveRuntime(nodeGraphBuildLivePlanForPatch(node.moduleGroup.sourcePatch)));
      } catch (_error) {
        moduleGroupRuntimes.delete(node.id);
      }
    }
    for (const [key, value] of Object.entries(node.params || {})) {
      smoothers.set(
        nodeGraphParameterKey(node.id, key),
        createNodeGraphParameterSmoother(value, node.paramMeta?.[key]),
      );
    }
  }
  const runtime = {
    autoSmoothingSeconds: clampNodeGraphAutoSmoothingSeconds(
      nodeGraphMvp?.live?.autoSmoothingSeconds ?? nodeGraphAutoSmoothingDefaultSeconds,
    ),
    inputConnections,
    badNumberCount: 0,
    passiveFilterStates,
    clockDividerStates,
    clockStates,
    codeblockFunctions,
    cookbookFilterStates,
    delayedTriggerStates,
    delayEffectStates,
    expAdsrStates,
    fractalBrownianNoiseStates,
    flowerChildEnvelopeFollowerStates,
    graphInputConnections,
    graphLfoStates,
    ladderFilterStates,
    tb303FilterStates,
    linearEnvelopeStates,
    logisticMapStates,
    henonMapStates,
    chuaAttractorStates,
    chordMemoryStates,
    turingMachineStates,
    pitchQuantizerStates,
    surgeOscillatorStates,
    dsfOscillatorStates,
    robinSupersawStates,
    hypersawStates,
    lorenzAttractorStates,
    meterCounter: 0,
    meterClipCount: 0,
    meterPeak: 0,
    meterSamples: 0,
    meterSquareSum: 0,
    modulationConnections,
    macroControls: Array.isArray(nodeGraphMvp?.macroControls) ? [...nodeGraphMvp.macroControls] : new Array(10).fill(0),
    externalButtonEvents: new Map(),
    wireBreakEvent: { pulseSamples: 0, gateSamples: 0 },
    wireConnectEvent: { pulseSamples: 0 },
    wireDisconnectEvent: { pulseSamples: 0 },
    windowReopenEvent: { pulseSamples: 0, gateSamples: 0, totalSamples: 0 },
    shootingStarExplosionEvent: { pulseSamples: 0 },
    moduleGroupRuntimes,
    pitchModWheelSignal: {
      mod: Math.max(0, Math.min(1, Number(nodeGraphMvp?.modWheelSignal) || 0)),
      pitch: Math.max(-1, Math.min(1, Number(nodeGraphMvp?.pitchWheelSignal) || 0)),
    },
    midiKeyboardSignal: null,
    nodeOutputs: new Map((plan.nodes || []).map((node) => [node.id, 0])),
    nodes,
    oscResetStates,
    oscillatorLastPhaseIncrements,
    oscillatorStoppedSamples,
    noiseSeedKeys,
    noiseSeeds,
    noiseGeneratorStates,
    pluckEnvelopeStates,
    randomClockStates,
    reverbEffectStates,
    pllStates,
    helmholtzStates,
    order: [...(plan.order || [])],
    outputNode: plan.outputNode || "output",
    patchCommandStates,
    phases,
    randomWalkStates,
    sampleHoldStates,
    samplePlaybackStates,
    samples,
    scopeCaptureNodeIds: [...(plan.scopeCaptureNodeIds || [])],
    slewLimiterStates,
    smoothers,
    spiralStates,
    stepSequencerStates,
    timing: normalizeNodeGraphPatchTiming(plan.timing),
    triggerCounterStates,
    triggerDividerStates,
    triangleStates,
    vactrolEnvelopeStates,
    visualSinks: (plan.visualSinks || []).map((sink) => ({
      ...sink,
      bufferedInputs: [...(sink.bufferedInputs || [])],
      inputs: (sink.inputs || []).map((input) => ({ ...input })),
    })),
    visualControls: visualControlState.controls,
    visualControlStates: visualControlState.states,
  };
  if (typeof syncNodeGraphVisualInputBuffers === "function") {
    syncNodeGraphVisualInputBuffers(runtime);
  }
  return runtime;
}

function updateNodeGraphLiveRuntimePlan(runtime, plan) {
  runtime.nodes = new Map((plan.nodes || []).map((node) => [node.id, node]));
  runtime.samples = new Map((plan.samples || []).map((sample) => [sample.id, sample]));
  runtime.inputConnections = nodeGraphLiveInputConnectionMap(plan);
  runtime.graphInputConnections = nodeGraphLiveGraphInputConnectionMap(plan);
  runtime.modulationConnections = nodeGraphLiveModulationConnectionMap(plan);
  runtime.order = [...(plan.order || [])];
  runtime.outputNode = plan.outputNode || "output";
  runtime.scopeCaptureNodeIds = [...(plan.scopeCaptureNodeIds || [])];
  runtime.timing = normalizeNodeGraphPatchTiming(plan.timing);
  runtime.visualSinks = (plan.visualSinks || []).map((sink) => ({
    ...sink,
    bufferedInputs: [...(sink.bufferedInputs || [])],
    inputs: (sink.inputs || []).map((input) => ({ ...input })),
  }));
  if (typeof syncNodeGraphVisualInputBuffers === "function") {
    syncNodeGraphVisualInputBuffers(runtime);
  }
  const nodeIds = new Set(runtime.nodes.keys());
  if (!runtime.nodeOutputs) {
    runtime.nodeOutputs = new Map();
  }
  if (!runtime.noiseSeedKeys) {
    runtime.noiseSeedKeys = new Map();
  }
  if (!runtime.noiseSeeds) {
    runtime.noiseSeeds = new Map();
  }
  if (!runtime.oscResetStates) {
    runtime.oscResetStates = new Map();
  }
  if (!runtime.graphLfoStates) {
    runtime.graphLfoStates = new Map();
  }
  if (!runtime.oscillatorLastPhaseIncrements) {
    runtime.oscillatorLastPhaseIncrements = new Map();
  }
  if (!runtime.oscillatorStoppedSamples) {
    runtime.oscillatorStoppedSamples = new Map();
  }
  if (!runtime.spiralStates) {
    runtime.spiralStates = new Map();
  }
  if (!runtime.passiveFilterStates) {
    runtime.passiveFilterStates = new Map();
  }
  if (!runtime.moduleGroupRuntimes) {
    runtime.moduleGroupRuntimes = new Map();
  }
  if (!runtime.ladderFilterStates) {
    runtime.ladderFilterStates = new Map();
  }
  if (!runtime.tb303FilterStates) {
    runtime.tb303FilterStates = new Map();
  }
  if (!runtime.linearEnvelopeStates) {
    runtime.linearEnvelopeStates = new Map();
  }
  if (!runtime.lorenzAttractorStates) {
    runtime.lorenzAttractorStates = new Map();
  }
  if (!runtime.logisticMapStates) {
    runtime.logisticMapStates = new Map();
  }
  if (!runtime.henonMapStates) {
    runtime.henonMapStates = new Map();
  }
  if (!runtime.chuaAttractorStates) {
    runtime.chuaAttractorStates = new Map();
  }
  if (!runtime.chordMemoryStates) {
    runtime.chordMemoryStates = new Map();
  }
  if (!runtime.turingMachineStates) {
    runtime.turingMachineStates = new Map();
  }
  if (!runtime.pitchQuantizerStates) {
    runtime.pitchQuantizerStates = new Map();
  }
  if (!runtime.surgeOscillatorStates) {
    runtime.surgeOscillatorStates = new Map();
  }
  if (!runtime.dsfOscillatorStates) {
    runtime.dsfOscillatorStates = new Map();
  }
  if (!runtime.robinSupersawStates) {
    runtime.robinSupersawStates = new Map();
  }
  if (!runtime.hypersawStates) {
    runtime.hypersawStates = new Map();
  }
  if (!runtime.clockStates) {
    runtime.clockStates = new Map();
  }
  if (!runtime.codeblockFunctions) {
    runtime.codeblockFunctions = new Map();
  }
  if (!runtime.cookbookFilterStates) {
    runtime.cookbookFilterStates = new Map();
  }
  if (!runtime.clockDividerStates) {
    runtime.clockDividerStates = new Map();
  }
  if (!runtime.delayedTriggerStates) {
    runtime.delayedTriggerStates = new Map();
  }
  if (!runtime.delayEffectStates) {
    runtime.delayEffectStates = new Map();
  }
  if (!runtime.reverbEffectStates) {
    runtime.reverbEffectStates = new Map();
  }
  if (!runtime.pllStates) {
    runtime.pllStates = new Map();
  }
  if (!runtime.helmholtzStates) {
    runtime.helmholtzStates = new Map();
  }
  if (!runtime.sampleHoldStates) {
    runtime.sampleHoldStates = new Map();
  }
  if (!runtime.samplePlaybackStates) {
    runtime.samplePlaybackStates = new Map();
  }
  if (!runtime.slewLimiterStates) {
    runtime.slewLimiterStates = new Map();
  }
  if (!runtime.expAdsrStates) {
    runtime.expAdsrStates = new Map();
  }
  if (!runtime.noiseGeneratorStates) {
    runtime.noiseGeneratorStates = new Map();
  }
  if (!runtime.randomWalkStates) {
    runtime.randomWalkStates = new Map();
  }
  if (!runtime.randomClockStates) {
    runtime.randomClockStates = new Map();
  }
  if (!runtime.fractalBrownianNoiseStates) {
    runtime.fractalBrownianNoiseStates = new Map();
  }
  if (!runtime.flowerChildEnvelopeFollowerStates) {
    runtime.flowerChildEnvelopeFollowerStates = new Map();
  }
  if (!runtime.pluckEnvelopeStates) {
    runtime.pluckEnvelopeStates = new Map();
  }
  if (!runtime.patchCommandStates) {
    runtime.patchCommandStates = new Map();
  }
  if (!runtime.stepSequencerStates) {
    runtime.stepSequencerStates = new Map();
  }
  if (!runtime.triggerDividerStates) {
    runtime.triggerDividerStates = new Map();
  }
  if (!runtime.triggerCounterStates) {
    runtime.triggerCounterStates = new Map();
  }
  if (!runtime.triangleStates) {
    runtime.triangleStates = new Map();
  }
  if (!runtime.vactrolEnvelopeStates) {
    runtime.vactrolEnvelopeStates = new Map();
  }
  resetNodeGraphRuntimeVisualControls(runtime);
  for (const node of plan.nodes || []) {
    if (!runtime.nodeOutputs.has(node.id)) {
      runtime.nodeOutputs.set(node.id, 0);
    }
    if (nodeGraphModuleIsRealtimeOscillatorType(node.type) && !runtime.phases.has(node.id)) {
      runtime.phases.set(node.id, 0);
    }
    if (nodeGraphModuleIsRealtimeOscillatorType(node.type) && !runtime.oscResetStates.has(node.id)) {
      runtime.oscResetStates.set(node.id, createNodeGraphOscResetState());
    }
    if (nodeGraphModuleIsRealtimeOscillatorType(node.type) && !runtime.triangleStates.has(node.id)) {
      runtime.triangleStates.set(node.id, 0);
    }
    if (nodeGraphModuleIsRealtimeOscillatorType(node.type) && !runtime.noiseSeeds.has(node.id)) {
      runtime.noiseSeeds.set(node.id, nodeGraphStableSeed(node.id));
    }
    if (node.type === "spiral" && !runtime.spiralStates.has(node.id)) {
      runtime.spiralStates.set(node.id, createJerobeamSpiralState());
    }
    if (node.type === "lorenzAttractor" && !runtime.lorenzAttractorStates.has(node.id)) {
      runtime.lorenzAttractorStates.set(node.id, createNodeGraphLorenzAttractorState());
    }
    if (node.type === "logisticMap" && !runtime.logisticMapStates.has(node.id)) {
      runtime.logisticMapStates.set(node.id, createNodeGraphLogisticMapState());
    }
    if (node.type === "henonMap" && !runtime.henonMapStates.has(node.id)) {
      runtime.henonMapStates.set(node.id, createNodeGraphHenonMapState());
    }
    if (node.type === "chuaAttractor" && !runtime.chuaAttractorStates.has(node.id)) {
      runtime.chuaAttractorStates.set(node.id, createNodeGraphChuaAttractorState());
    }
    if (node.type === "chordMemory" && !runtime.chordMemoryStates.has(node.id)) {
      runtime.chordMemoryStates.set(node.id, createNodeGraphChordMemoryState());
    }
    if (node.type === "turingMachine" && !runtime.turingMachineStates.has(node.id)) {
      runtime.turingMachineStates.set(node.id, createNodeGraphTuringMachineState());
    }
    if (node.type === "pitchQuantizer" && !runtime.pitchQuantizerStates.has(node.id)) {
      runtime.pitchQuantizerStates.set(node.id, createNodeGraphPitchQuantizerState());
    }
    if (node.type === "surgeOscillator" && !runtime.surgeOscillatorStates.has(node.id)) {
      runtime.surgeOscillatorStates.set(node.id, createNodeGraphSurgeOscillatorState());
    }
    if (node.type === "dsfOscillator" && !runtime.dsfOscillatorStates.has(node.id)) {
      runtime.dsfOscillatorStates.set(node.id, createNodeGraphDsfOscillatorState());
    }
    if (node.type === "robinSupersaw" && !runtime.robinSupersawStates.has(node.id)) {
      runtime.robinSupersawStates.set(node.id, createNodeGraphRobinSupersawState());
    }
    if (node.type === "hypersaw" && !runtime.hypersawStates.has(node.id)) {
      runtime.hypersawStates.set(node.id, createNodeGraphHypersawState());
    }
    if (node.type === "passiveFilter" && !runtime.passiveFilterStates.has(node.id)) {
      runtime.passiveFilterStates.set(node.id, createNodeGraphPassiveFilterState());
    }
    if (node.type === "cookbookFilter" && !runtime.cookbookFilterStates.has(node.id)) {
      runtime.cookbookFilterStates.set(node.id, createNodeGraphCookbookFilterState());
    }
    if (node.type === "ladderFilter" && !runtime.ladderFilterStates.has(node.id)) {
      runtime.ladderFilterStates.set(node.id, createNodeGraphLadderFilterState());
    }
    if (node.type === "clock" && !runtime.clockStates.has(node.id)) {
      runtime.clockStates.set(node.id, createNodeGraphClockState());
    }
    if (nodeGraphModuleIsGraphType(node.type) && !runtime.graphLfoStates.has(node.id)) {
      runtime.graphLfoStates.set(node.id, createNodeGraphGraphLfoState());
    }
    if (node.type === "clockDivider" && !runtime.clockDividerStates.has(node.id)) {
      runtime.clockDividerStates.set(node.id, createNodeGraphTriggerDividerState());
    }
    if (node.type === "delayedTrigger" && !runtime.delayedTriggerStates.has(node.id)) {
      runtime.delayedTriggerStates.set(node.id, createNodeGraphDelayedTriggerState());
    }
    if (node.type === "delayEffect" && !runtime.delayEffectStates.has(node.id)) {
      runtime.delayEffectStates.set(node.id, createNodeGraphDelayEffectState());
    }
    if (node.type === "reverbEffect" && !runtime.reverbEffectStates.has(node.id)) {
      runtime.reverbEffectStates.set(node.id, createNodeGraphSabrinaReverbState());
    }
    if (node.type === "pll" && !runtime.pllStates.has(node.id)) {
      runtime.pllStates.set(node.id, createNodeGraphPllState());
    }
    if (node.type === "helmholtzPitch" && !runtime.helmholtzStates.has(node.id)) {
      runtime.helmholtzStates.set(node.id, createNodeGraphHelmholtzState());
    }
    if (node.type === "randomClock" && !runtime.randomClockStates.has(node.id)) {
      runtime.randomClockStates.set(node.id, createNodeGraphRandomClockState());
    }
    if (node.type === "sampleHold" && !runtime.sampleHoldStates.has(node.id)) {
      runtime.sampleHoldStates.set(node.id, createNodeGraphSampleHoldState());
    }
    if ((node.type === "samplePlayer" || node.type === "sampleLooper" || node.type === "audioPlayer") && !runtime.samplePlaybackStates.has(node.id)) {
      runtime.samplePlaybackStates.set(node.id, createNodeGraphSamplePlaybackState());
    }
    if ((node.type === "nextPatch" || node.type === "previousPatch") && !runtime.patchCommandStates.has(node.id)) {
      runtime.patchCommandStates.set(node.id, createNodeGraphPatchCommandState());
    }
    if (node.type === "slewLimiter" && !runtime.slewLimiterStates.has(node.id)) {
      runtime.slewLimiterStates.set(node.id, createNodeGraphSlewLimiterState());
    }
    if (node.type === "expAdsr" && !runtime.expAdsrStates.has(node.id)) {
      runtime.expAdsrStates.set(node.id, createNodeGraphExpAdsrState());
    }
    if (node.type === "linearEnvelope" && !runtime.linearEnvelopeStates.has(node.id)) {
      runtime.linearEnvelopeStates.set(node.id, createNodeGraphLinearEnvelopeState());
    }
    if (node.type === "noiseGenerator" && !runtime.noiseGeneratorStates.has(node.id)) {
      runtime.noiseGeneratorStates.set(node.id, createNodeGraphNoiseGeneratorState());
    }
    if (node.type === "randomWalk" && !runtime.randomWalkStates.has(node.id)) {
      runtime.randomWalkStates.set(node.id, createNodeGraphRandomWalkState());
    }
    if (node.type === "fractalBrownianNoise" && !runtime.fractalBrownianNoiseStates.has(node.id)) {
      runtime.fractalBrownianNoiseStates.set(node.id, createNodeGraphFractalBrownianNoiseState());
    }
    if (
      node.type === "flowerChildEnvelopeFollower" &&
      !runtime.flowerChildEnvelopeFollowerStates.has(node.id)
    ) {
      runtime.flowerChildEnvelopeFollowerStates.set(node.id, createNodeGraphFlowerChildEnvelopeFollowerState());
    }
    if (node.type === "pluckEnvelope" && !runtime.pluckEnvelopeStates.has(node.id)) {
      runtime.pluckEnvelopeStates.set(node.id, createNodeGraphPluckEnvelopeState());
    }
    if (node.type === "triggerDivider" && !runtime.triggerDividerStates.has(node.id)) {
      runtime.triggerDividerStates.set(node.id, createNodeGraphTriggerDividerState());
    }
    if (node.type === "stepSequencer" && !runtime.stepSequencerStates.has(node.id)) {
      runtime.stepSequencerStates.set(node.id, createNodeGraphStepSequencerState());
    }
    if (node.type === "triggerCounter" && !runtime.triggerCounterStates.has(node.id)) {
      runtime.triggerCounterStates.set(node.id, createNodeGraphTriggerCounterState());
    }
    if ((node.type === "vactrolEnvelope" || node.type === "vactrolEnvelopeC4") && !runtime.vactrolEnvelopeStates.has(node.id)) {
      runtime.vactrolEnvelopeStates.set(node.id, createNodeGraphVactrolEnvelopeState());
    }
    if (node.type === "moduleGroup" && node.moduleGroup?.sourcePatch && !runtime.moduleGroupRuntimes.has(node.id)) {
      try {
        runtime.moduleGroupRuntimes.set(node.id, createNodeGraphLiveRuntime(nodeGraphBuildLivePlanForPatch(node.moduleGroup.sourcePatch)));
      } catch (_error) {
        runtime.moduleGroupRuntimes.delete(node.id);
      }
    }
    for (const [key, value] of Object.entries(node.params || {})) {
      const smootherKey = nodeGraphParameterKey(node.id, key);
      const metadata = node.paramMeta?.[key];
      if (!runtime.smoothers.has(smootherKey)) {
        runtime.smoothers.set(
          smootherKey,
          createNodeGraphParameterSmoother(value, metadata),
        );
      } else {
        updateNodeGraphParameterSmoother(runtime.smoothers.get(smootherKey), value, metadata);
      }
    }
  }
  for (const id of [...runtime.phases.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.phases.delete(id);
    }
  }
  for (const id of [...runtime.oscResetStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.oscResetStates.delete(id);
    }
  }
  for (const id of [...runtime.graphLfoStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.graphLfoStates.delete(id);
    }
  }
  for (const id of [...runtime.triangleStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.triangleStates.delete(id);
    }
  }
  for (const id of [...runtime.oscillatorLastPhaseIncrements.keys()]) {
    const nodeId = String(id).split(":")[0];
    if (!nodeIds.has(nodeId)) {
      runtime.oscillatorLastPhaseIncrements.delete(id);
    }
  }
  for (const id of [...runtime.oscillatorStoppedSamples.keys()]) {
    const nodeId = String(id).split(":")[0];
    if (!nodeIds.has(nodeId)) {
      runtime.oscillatorStoppedSamples.delete(id);
    }
  }
  for (const id of [...runtime.noiseSeeds.keys()]) {
    const nodeId = String(id).split(":")[0];
    if (!nodeIds.has(nodeId)) {
      runtime.noiseSeeds.delete(id);
    }
  }
  for (const id of [...runtime.noiseSeedKeys.keys()]) {
    const nodeId = String(id).split(":")[0];
    if (!nodeIds.has(nodeId)) {
      runtime.noiseSeedKeys.delete(id);
    }
  }
  for (const id of [...runtime.nodeOutputs.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.nodeOutputs.delete(id);
    }
  }
  for (const id of [...runtime.spiralStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.spiralStates.delete(id);
    }
  }
  for (const id of [...runtime.lorenzAttractorStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.lorenzAttractorStates.delete(id);
    }
  }
  for (const id of [...runtime.logisticMapStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.logisticMapStates.delete(id);
    }
  }
  for (const id of [...runtime.henonMapStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.henonMapStates.delete(id);
    }
  }
  for (const id of [...runtime.chuaAttractorStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.chuaAttractorStates.delete(id);
    }
  }
  for (const id of [...runtime.chordMemoryStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.chordMemoryStates.delete(id);
    }
  }
  for (const id of [...runtime.turingMachineStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.turingMachineStates.delete(id);
    }
  }
  for (const id of [...runtime.pitchQuantizerStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.pitchQuantizerStates.delete(id);
    }
  }
  for (const id of [...runtime.surgeOscillatorStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.surgeOscillatorStates.delete(id);
    }
  }
  for (const id of [...runtime.dsfOscillatorStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.dsfOscillatorStates.delete(id);
    }
  }
  for (const id of [...runtime.passiveFilterStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.passiveFilterStates.delete(id);
    }
  }
  for (const id of [...runtime.moduleGroupRuntimes.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.moduleGroupRuntimes.delete(id);
    }
  }
  for (const id of [...runtime.linearEnvelopeStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.linearEnvelopeStates.delete(id);
    }
  }
  for (const id of [...runtime.clockStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.clockStates.delete(id);
    }
  }
  for (const id of [...runtime.codeblockFunctions.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.codeblockFunctions.delete(id);
    }
  }
  for (const id of [...runtime.cookbookFilterStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.cookbookFilterStates.delete(id);
    }
  }
  for (const id of [...runtime.ladderFilterStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.ladderFilterStates.delete(id);
    }
  }
  for (const id of [...runtime.tb303FilterStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.tb303FilterStates.delete(id);
    }
  }
  for (const id of [...runtime.clockDividerStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.clockDividerStates.delete(id);
    }
  }
  for (const id of [...runtime.delayedTriggerStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.delayedTriggerStates.delete(id);
    }
  }
  for (const id of [...runtime.delayEffectStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.delayEffectStates.delete(id);
    }
  }
  for (const id of [...runtime.reverbEffectStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.reverbEffectStates.delete(id);
    }
  }
  for (const id of [...(runtime.pllStates?.keys() || [])]) {
    if (!nodeIds.has(id)) {
      runtime.pllStates.delete(id);
    }
  }
  for (const id of [...(runtime.helmholtzStates?.keys() || [])]) {
    if (!nodeIds.has(id)) {
      runtime.helmholtzStates.delete(id);
    }
  }
  for (const id of [...runtime.sampleHoldStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.sampleHoldStates.delete(id);
    }
  }
  for (const id of [...runtime.samplePlaybackStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.samplePlaybackStates.delete(id);
    }
  }
  for (const id of [...runtime.patchCommandStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.patchCommandStates.delete(id);
    }
  }
  for (const id of [...runtime.slewLimiterStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.slewLimiterStates.delete(id);
    }
  }
  for (const id of [...runtime.expAdsrStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.expAdsrStates.delete(id);
    }
  }
  for (const id of [...runtime.noiseGeneratorStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.noiseGeneratorStates.delete(id);
    }
  }
  for (const id of [...runtime.randomWalkStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.randomWalkStates.delete(id);
    }
  }
  for (const id of [...runtime.randomClockStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.randomClockStates.delete(id);
    }
  }
  for (const id of [...runtime.fractalBrownianNoiseStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.fractalBrownianNoiseStates.delete(id);
    }
  }
  for (const id of [...runtime.flowerChildEnvelopeFollowerStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.flowerChildEnvelopeFollowerStates.delete(id);
    }
  }
  for (const id of [...runtime.pluckEnvelopeStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.pluckEnvelopeStates.delete(id);
    }
  }
  for (const id of [...runtime.stepSequencerStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.stepSequencerStates.delete(id);
    }
  }
  for (const id of [...runtime.triggerCounterStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.triggerCounterStates.delete(id);
    }
  }
  for (const id of [...runtime.triggerDividerStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.triggerDividerStates.delete(id);
    }
  }
  for (const id of [...runtime.vactrolEnvelopeStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.vactrolEnvelopeStates.delete(id);
    }
  }
  for (const key of [...runtime.smoothers.keys()]) {
    const [nodeId, parameter] = key.split(".");
    if (!nodeIds.has(nodeId) || !runtime.nodes.get(nodeId)?.params || !(parameter in runtime.nodes.get(nodeId).params)) {
      runtime.smoothers.delete(key);
    }
  }
}

function updateNodeGraphLiveRuntimeConnections(runtime, plan) {
  runtime.inputConnections = nodeGraphLiveInputConnectionMap(plan);
  runtime.graphInputConnections = nodeGraphLiveGraphInputConnectionMap(plan);
  runtime.modulationConnections = nodeGraphLiveModulationConnectionMap(plan);
  runtime.outputNode = plan.outputNode || runtime.outputNode || "output";
  runtime.scopeCaptureNodeIds = [...(plan.scopeCaptureNodeIds || [])];
  runtime.visualSinks = (plan.visualSinks || []).map((sink) => ({
    ...sink,
    bufferedInputs: [...(sink.bufferedInputs || [])],
    inputs: (sink.inputs || []).map((input) => ({ ...input })),
  }));
  if (typeof syncNodeGraphVisualInputBuffers === "function") {
    syncNodeGraphVisualInputBuffers(runtime);
  }
}

function updateNodeGraphLiveRuntimeParameters(runtime, nodes) {
  if (!runtime) {
    return;
  }
  for (const node of nodes || []) {
    const current = runtime.nodes.get(node.id);
    if (!current) {
      continue;
    }
    current.params = { ...(node.params || {}) };
    current.paramMeta = cloneNodeGraphParamMeta(node.paramMeta);
    for (const [key, value] of Object.entries(current.params || {})) {
      const smootherKey = nodeGraphParameterKey(node.id, key);
      const metadata = current.paramMeta?.[key];
      if (!runtime.smoothers.has(smootherKey)) {
        runtime.smoothers.set(
          smootherKey,
          createNodeGraphParameterSmoother(value, metadata),
        );
      } else {
        updateNodeGraphParameterSmoother(runtime.smoothers.get(smootherKey), value, metadata);
      }
    }
  }
}
