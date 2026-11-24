// Patient/device state and scenario timers. No HTTP server or platform startup.
const energySteps = [5, 10, 20, 50, 70, 100, 120, 150, 170, 200, 250, 300, 360];
const energyControlSteps = [0, ...energySteps];
const rhythms = [
  "sinus", "vf", "psvt", "pulseless_vt", "pea", "asystole", "rosc",
  "monomorphic_vt", "polymorphic_vt", "tdp", "avnrt", "avrt",
  "atrial_tachycardia", "atrial_flutter", "atrial_fibrillation", "sinus_tachycardia",
  "sinus_bradycardia", "sinus_arrest", "av_block_1", "wenckebach", "mobitz_2",
  "av_block_2_1", "advanced_av_block", "complete_av_block", "junctional_escape",
  "ventricular_escape"
];
const leadOptions = ["I", "II", "III", "aVR", "aVL", "aVF"];
const sensitivityOptions = ["5 mm/mV", "10 mm/mV", "20 mm/mV"];
const defaultLead = "II";
const defaultSensitivity = "10 mm/mV";
const monitorStyles = {
  classic: {
    name: "Classic Green",
    description: "黒背景に緑波形の標準モニター"
  },
  highContrast: {
    name: "High Contrast",
    description: "波形と数値を強調した高コントラスト表示"
  },
  clinicalBlue: {
    name: "Clinical Blue",
    description: "青系の配色で区切りを強調する表示"
  },
  lightConsole: {
    name: "Light Console",
    description: "明るい背景を使った表示"
  }
};

const scenarioPresets = {
  vf_success_1: {
    name: "VF 除細動1回で成功",
    initial: {
      rhythm: "vf",
      energy: 150,
      vitals: { hr: 0, spo2: 86, nibpSys: 92, nibpDia: 58 }
    },
    shock: {
      successAfter: 1,
      successRhythm: "sinus",
      successVitals: { hr: 72, spo2: 97, nibpSys: 118, nibpDia: 72 },
      failureRhythm: "vf",
      failureVitals: { hr: 0, spo2: 84, nibpSys: 88, nibpDia: 54 }
    }
  },
  vf_success_2: {
    name: "VF 除細動2回で成功",
    initial: {
      rhythm: "vf",
      energy: 150,
      vitals: { hr: 0, spo2: 84, nibpSys: 88, nibpDia: 54 }
    },
    shock: {
      successAfter: 2,
      successRhythm: "sinus",
      successVitals: { hr: 76, spo2: 96, nibpSys: 112, nibpDia: 68 },
      failureRhythm: "vf",
      failureVitals: { hr: 0, spo2: 82, nibpSys: 82, nibpDia: 50 }
    }
  },
  vf_refractory: {
    name: "VF 継続",
    initial: {
      rhythm: "vf",
      energy: 200,
      vitals: { hr: 0, spo2: 82, nibpSys: 80, nibpDia: 48 }
    },
    shock: {
      successAfter: 99,
      successRhythm: "sinus",
      successVitals: { hr: 72, spo2: 95, nibpSys: 108, nibpDia: 66 },
      failureRhythm: "vf",
      failureVitals: { hr: 0, spo2: 78, nibpSys: 76, nibpDia: 44 }
    }
  },
  asystole: {
    name: "心静止",
    initial: {
      rhythm: "asystole",
      energy: 150,
      vitals: { hr: 0, spo2: 0, nibpSys: 0, nibpDia: 0 }
    },
    shock: {
      successAfter: 99,
      successRhythm: "asystole",
      successVitals: { hr: 0, spo2: 0, nibpSys: 0, nibpDia: 0 },
      failureRhythm: "asystole",
      failureVitals: { hr: 0, spo2: 0, nibpSys: 0, nibpDia: 0 }
    }
  },
  sinus: {
    name: "正常洞調律",
    initial: {
      rhythm: "sinus",
      energy: 150,
      vitals: { hr: 72, spo2: 98, nibpSys: 122, nibpDia: 74 }
    },
    shock: {
      successAfter: 99,
      successRhythm: "sinus",
      successVitals: { hr: 72, spo2: 98, nibpSys: 122, nibpDia: 74 },
      failureRhythm: "sinus",
      failureVitals: { hr: 72, spo2: 98, nibpSys: 122, nibpDia: 74 }
    }
  }
};

const defaultScenario = structuredClone(scenarioPresets.vf_success_1);
const timelineWaveforms = {
  sinus: { label: "洞調律", rhythm: "sinus", hr: 72 },
  vf: { label: "VF", rhythm: "vf", hr: 0 },
  psvt: { label: "PSVT", rhythm: "psvt", hr: 180 },
  pulseless_vt: { label: "Pulseless VT", rhythm: "pulseless_vt", hr: 180 },
  pea: { label: "PEA", rhythm: "pea", hr: 60 },
  asystole: { label: "心静止", rhythm: "asystole", hr: 0 },
  rosc: { label: "ROSC", rhythm: "rosc", hr: 80 },
  monomorphic_vt: { label: "Monomorphic VT", rhythm: "monomorphic_vt", hr: 170 },
  polymorphic_vt: { label: "Polymorphic VT", rhythm: "polymorphic_vt", hr: 190 },
  tdp: { label: "TdP", rhythm: "tdp", hr: 210 },
  avnrt: { label: "AVNRT", rhythm: "avnrt", hr: 180 },
  avrt: { label: "AVRT", rhythm: "avrt", hr: 190 },
  atrial_tachycardia: { label: "AT", rhythm: "atrial_tachycardia", hr: 150 },
  atrial_flutter: { label: "AFL", rhythm: "atrial_flutter", hr: 150 },
  atrial_fibrillation: { label: "AF", rhythm: "atrial_fibrillation", hr: 130 },
  sinus_tachycardia: { label: "洞性頻脈", rhythm: "sinus_tachycardia", hr: 120 },
  sinus_bradycardia: { label: "洞性徐脈", rhythm: "sinus_bradycardia", hr: 45 },
  sinus_arrest: { label: "洞停止", rhythm: "sinus_arrest", hr: 40 },
  av_block_1: { label: "I度房室ブロック", rhythm: "av_block_1", hr: 65 },
  wenckebach: { label: "Mobitz I", rhythm: "wenckebach", hr: 55 },
  mobitz_2: { label: "Mobitz II", rhythm: "mobitz_2", hr: 45 },
  av_block_2_1: { label: "2:1房室ブロック", rhythm: "av_block_2_1", hr: 40 },
  advanced_av_block: { label: "高度房室ブロック", rhythm: "advanced_av_block", hr: 35 },
  complete_av_block: { label: "完全房室ブロック", rhythm: "complete_av_block", hr: 35 },
  junctional_escape: { label: "接合部補充調律", rhythm: "junctional_escape", hr: 45 },
  ventricular_escape: { label: "心室補充調律", rhythm: "ventricular_escape", hr: 30 }
};

export function createMonitorSession() {
  const state = {
    powered: false,
    deviceMode: "off",
    syncEnabled: false,
    rhythm: "vf",
    energy: 0,
    charging: false,
    charged: false,
    chargeProgress: 0,
    alarmMuted: false,
    monitorStyle: "classic",
    lead: defaultLead,
    sensitivity: defaultSensitivity,
    leadCheckEnabled: false,
    leadStatus: {
      red: false,
      yellow: false,
      green: false
    },
    shockFlashUntil: 0,
    lastShockAt: null,
    vitals: {
      hr: 0,
      spo2: 86,
      nibpSys: 92,
      nibpDia: 58
    },
    scenario: {
      active: false,
      selectedPreset: "vf_success_1",
      shockCount: 0,
      config: defaultScenario
    },
    timelineScenario: {
      name: "タイムラインシナリオ",
      active: false,
      activeIndex: null,
      awaitingShockIndex: null,
      startedAt: null,
      events: /** @type {import("./types.js").TimelineEvent[]} */ ([
        { id: "event-vf", kind: "vf", duration: 30, hr: 0 },
        { id: "event-rosc", kind: "rosc", duration: 30, hr: 80 }
      ])
    },
    eventLog: []
  };

  const clients = new Set();
  let chargeTimer = null;
  let timelineTimer = null;

  function snapshot() {
    return {
      ...state,
      vitals: { ...state.vitals },
      scenario: { ...state.scenario },
      timelineScenario: { ...state.timelineScenario },
      scenarioPresets,
      monitorStyles,
      eventLog: state.eventLog.slice(-40),
      shockActive: Date.now() < state.shockFlashUntil
    };
  }

  function broadcast() {
    const current = snapshot();
    for (const client of clients) client.update(current);
  }

  function logEvent(label) {
    const time = new Date().toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    state.eventLog.push({ time, label });
    if (state.eventLog.length > 80) state.eventLog.shift();
  }

  function clearChargeTimer() {
    if (chargeTimer) {
      clearInterval(chargeTimer);
      chargeTimer = null;
    }
  }

  function clearTimelineTimer() {
    if (timelineTimer) {
      clearTimeout(timelineTimer);
      timelineTimer = null;
    }
  }

  function disarm(reason = "DISARM") {
    clearChargeTimer();
    state.charging = false;
    state.charged = false;
    state.chargeProgress = 0;
    logEvent(reason);
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, Math.round(number)));
  }

  function normalizeVitals(vitals, fallback = state.vitals) {
    return {
      hr: clampNumber(vitals?.hr, 0, 260, fallback.hr),
      spo2: clampNumber(vitals?.spo2, 0, 100, fallback.spo2),
      nibpSys: clampNumber(vitals?.nibpSys, 0, 260, fallback.nibpSys),
      nibpDia: clampNumber(vitals?.nibpDia, 0, 180, fallback.nibpDia)
    };
  }

  function normalizeScenario(input, fallback = state.scenario.config) {
    const initialFallback = fallback.initial;
    const shockFallback = fallback.shock;
    const initialRhythm = rhythms.includes(input?.initial?.rhythm) ? input.initial.rhythm : initialFallback.rhythm;
    const successRhythm = rhythms.includes(input?.shock?.successRhythm)
      ? input.shock.successRhythm
      : shockFallback.successRhythm;
    const failureRhythm = rhythms.includes(input?.shock?.failureRhythm)
      ? input.shock.failureRhythm
      : shockFallback.failureRhythm;
    const energy = energyControlSteps.includes(Number(input?.initial?.energy))
      ? Number(input.initial.energy)
      : initialFallback.energy;

    return {
      name: String(input?.name || fallback.name || "手動シナリオ").slice(0, 60),
      initial: {
        rhythm: initialRhythm,
        energy,
        vitals: normalizeVitals(input?.initial?.vitals, initialFallback.vitals)
      },
      shock: {
        successAfter: clampNumber(input?.shock?.successAfter, 1, 99, shockFallback.successAfter),
        successRhythm,
        successVitals: normalizeVitals(input?.shock?.successVitals, shockFallback.successVitals),
        failureRhythm,
        failureVitals: normalizeVitals(input?.shock?.failureVitals, shockFallback.failureVitals)
      }
    };
  }

  function setMonitorState({ rhythm, energy, vitals }) {
    clearChargeTimer();
    state.rhythm = rhythm;
    state.energy = energy;
    state.vitals = { ...vitals };
    state.charging = false;
    state.charged = false;
    state.chargeProgress = 0;
  }

  function setRhythm(rhythm, updateVitals = true) {
    state.rhythm = rhythm;
    if (!updateVitals) {
      logEvent(`RHYTHM ${rhythm.toUpperCase()}`);
      return;
    }
    if (rhythm === "vf") {
      state.vitals.hr = 0;
      state.vitals.spo2 = Math.min(state.vitals.spo2, 88);
    }
    if (rhythm === "sinus") {
      state.vitals.hr = 72;
      state.vitals.spo2 = Math.max(state.vitals.spo2, 97);
      state.vitals.nibpSys = Math.max(state.vitals.nibpSys, 118);
      state.vitals.nibpDia = Math.max(state.vitals.nibpDia, 72);
    }
    if (rhythm === "psvt") {
      state.vitals.hr = 180;
      state.vitals.spo2 = Math.max(state.vitals.spo2, 94);
    }
    if (rhythm === "asystole") {
      state.vitals.hr = 0;
      state.vitals.spo2 = 0;
    }
    logEvent(`RHYTHM ${rhythm.toUpperCase()}`);
  }

  function normalizeTimelineScenario(input) {
    const events = Array.isArray(input?.events) ? input.events.slice(0, 30) : [];
    return {
      name: String(input?.name || "タイムラインシナリオ").slice(0, 60),
      active: false,
      activeIndex: null,
      awaitingShockIndex: null,
      startedAt: null,
      events: events.map((event, index) => {
        if (event?.kind === "shock") {
          return {
            id: String(event?.id || `event-${Date.now()}-${index}`).slice(0, 80),
            kind: "shock",
            joules: clampNumber(event?.joules, 5, 360, 150)
          };
        }
        const kind = Object.hasOwn(timelineWaveforms, event?.kind) ? event.kind : "sinus";
        const waveform = timelineWaveforms[kind];
        return {
          id: String(event?.id || `event-${Date.now()}-${index}`).slice(0, 80),
          kind,
          duration: clampNumber(event?.duration, 5, 600, 30),
          hr: clampNumber(event?.hr, 0, 260, waveform.hr)
        };
      })
    };
  }

  function hasValidTimelineOrder(input) {
    const events = Array.isArray(input?.events) ? input.events : [];
    return events.every((event, index) => (
      event?.kind !== "shock" || (index > 0 && events[index - 1]?.kind !== "shock")
    ));
  }

  function applyTimelineEvent(index) {
    const timeline = state.timelineScenario;
    const event = timeline.events[index];
    if (!event) {
      timeline.active = false;
      timeline.activeIndex = null;
      timeline.awaitingShockIndex = null;
      timelineTimer = null;
      logEvent("TIMELINE COMPLETE");
      broadcast();
      return;
    }

    setPower(true);
    if ("joules" in event) {
      timeline.activeIndex = index > 0 ? index - 1 : null;
      timeline.awaitingShockIndex = index;
      timelineTimer = null;
      logEvent(`TIMELINE WAIT SHOCK ${event.joules}J+`);
      broadcast();
      return;
    }

    timeline.activeIndex = index;
    timeline.awaitingShockIndex = null;
    const waveform = timelineWaveforms[event.kind];
    state.rhythm = waveform.rhythm;
    state.vitals.hr = event.hr;

    if (waveform.rhythm === "vf") {
      state.vitals.hr = 0;
      state.vitals.spo2 = Math.min(state.vitals.spo2, 88);
    } else if (waveform.rhythm === "asystole") {
      state.vitals.hr = 0;
      state.vitals.spo2 = 0;
    } else {
      state.vitals.spo2 = Math.max(state.vitals.spo2, event.kind === "rosc" ? 97 : 94);
      if (event.kind === "rosc") {
        state.vitals.nibpSys = Math.max(state.vitals.nibpSys, 110);
        state.vitals.nibpDia = Math.max(state.vitals.nibpDia, 68);
      }
    }

    logEvent(`TIMELINE ${index + 1}/${timeline.events.length} ${waveform.label}`);
    broadcast();
    const nextEvent = timeline.events[index + 1];
    if (!nextEvent) {
      timelineTimer = null;
    } else if (nextEvent.kind === "shock") {
      applyTimelineEvent(index + 1);
    } else {
      timelineTimer = setTimeout(() => applyTimelineEvent(index + 1), event.duration * 1000);
    }
  }

  function saveTimelineScenario(input) {
    if (!hasValidTimelineOrder(input)) return false;
    clearTimelineTimer();
    state.timelineScenario = normalizeTimelineScenario(input);
    logEvent(`TIMELINE SAVED ${state.timelineScenario.name}`);
    return true;
  }

  function startTimelineScenario() {
    if (!state.timelineScenario.events.length || state.timelineScenario.events[0].kind === "shock") return false;
    clearTimelineTimer();
    state.scenario.active = false;
    state.timelineScenario.active = true;
    state.timelineScenario.activeIndex = 0;
    state.timelineScenario.awaitingShockIndex = null;
    state.timelineScenario.startedAt = new Date().toISOString();
    logEvent(`TIMELINE START ${state.timelineScenario.name}`);
    applyTimelineEvent(0);
    return true;
  }

  function changeEnergy(direction) {
    const current = energyControlSteps.includes(state.energy) ? energyControlSteps.indexOf(state.energy) : 0;
    const next = Math.max(0, Math.min(energyControlSteps.length - 1, current + direction));
    state.energy = energyControlSteps[next];
    if (state.charging || state.charged) {
      disarm("ENERGY CHANGE - DISARM");
    }
    logEvent(`ENERGY ${state.energy}J`);
  }

  function charge() {
    if (!state.powered || state.energy <= 0 || state.charging || state.charged) return;
    state.charging = true;
    state.chargeProgress = 0;
    logEvent(`CHARGE ${state.energy}J`);
    clearChargeTimer();
    chargeTimer = setInterval(() => {
      state.chargeProgress = Math.min(100, state.chargeProgress + 8);
      if (state.chargeProgress >= 100) {
        clearChargeTimer();
        state.charging = false;
        state.charged = true;
        logEvent(`READY ${state.energy}J`);
      }
      broadcast();
    }, 120);
  }

  function shock() {
    if (!state.powered || !state.charged) {
      logEvent("SHOCK IGNORED");
      return;
    }
    state.charged = false;
    state.chargeProgress = 0;
    state.shockFlashUntil = Date.now() + 700;
    state.lastShockAt = new Date().toISOString();
    logEvent(`SHOCK ${state.energy}J`);
    if (state.timelineScenario.active) {
      const waitingIndex = state.timelineScenario.awaitingShockIndex;
      if (Number.isInteger(waitingIndex)) {
        const event = state.timelineScenario.events[waitingIndex];
        if (event && "joules" in event && state.energy >= event.joules) {
          state.timelineScenario.activeIndex = waitingIndex;
          state.timelineScenario.awaitingShockIndex = null;
          logEvent(`TIMELINE SHOCK PASS ${state.energy}J / ${event.joules}J`);
          clearTimelineTimer();
          timelineTimer = setTimeout(() => applyTimelineEvent(waitingIndex + 1), 700);
        } else if (event && "joules" in event) {
          state.timelineScenario.activeIndex = waitingIndex > 0 ? waitingIndex - 1 : null;
          logEvent(`TIMELINE SHOCK LOW ${state.energy}J / ${event.joules}J`);
        }
      } else {
        logEvent("TIMELINE SHOCK OUTSIDE GATE");
      }
      return;
    }
    if (state.scenario.active) {
      state.scenario.shockCount += 1;
      const config = state.scenario.config;
      const success = state.scenario.shockCount >= config.shock.successAfter;
      if (success) {
        state.rhythm = config.shock.successRhythm;
        state.vitals = { ...config.shock.successVitals };
        logEvent(`SCENARIO SUCCESS ${state.scenario.shockCount}/${config.shock.successAfter}`);
      } else {
        state.rhythm = config.shock.failureRhythm;
        state.vitals = { ...config.shock.failureVitals };
        logEvent(`SCENARIO CONTINUE ${state.scenario.shockCount}/${config.shock.successAfter}`);
      }
      return;
    }
    if (state.rhythm === "vf") setRhythm("sinus");
  }

  function resetDisplayDefaults() {
    state.energy = 0;
    state.lead = defaultLead;
    state.sensitivity = defaultSensitivity;
  }

  function setPower(powered) {
    const next = Boolean(powered);
    if (state.powered === next) return;
    state.powered = next;
    if (!state.powered) {
      clearTimelineTimer();
      state.timelineScenario.active = false;
      state.timelineScenario.activeIndex = null;
      clearChargeTimer();
      state.charging = false;
      state.charged = false;
      state.chargeProgress = 0;
      state.deviceMode = "off";
      state.syncEnabled = false;
      resetDisplayDefaults();
    } else {
      if (state.deviceMode === "off") state.deviceMode = "monitor";
      resetDisplayDefaults();
    }
    logEvent(state.powered ? "POWER ON" : "POWER OFF");
  }

  function powerToggle() {
    setPower(!state.powered);
  }

  function setEnergy(energy) {
    const next = Number(energy);
    if (!energyControlSteps.includes(next)) return false;
    if (state.energy === next) return true;
    if (state.charging || state.charged) {
      disarm("ENERGY CHANGE - DISARM");
    }
    state.energy = next;
    logEvent(`ENERGY ${state.energy}J`);
    return true;
  }

  function setRotaryPosition(value) {
    const position = String(value?.position || "").toLowerCase();

    if (position === "off") {
      setPower(false);
      return true;
    }

    if (position === "disarm") {
      setPower(true);
      state.deviceMode = "disarm";
      disarm();
      setEnergy(0);
      return true;
    }

    if (position === "energy") {
      const joules = Number(value?.joules);
      if (!energySteps.includes(joules)) return false;
      setPower(true);
      state.deviceMode = "manual";
      return setEnergy(joules);
    }

    if (!["monitor", "aed", "pacing"].includes(position)) return false;
    setPower(true);
    state.deviceMode = position;
    setEnergy(0);
    logEvent(`MODE ${position.toUpperCase()}`);
    return true;
  }

  function toggleSync() {
    if (!state.powered) return;
    state.syncEnabled = !state.syncEnabled;
    logEvent(state.syncEnabled ? "SYNC ON" : "SYNC OFF");
  }

  function cycleLead() {
    const current = leadOptions.includes(state.lead) ? leadOptions.indexOf(state.lead) : leadOptions.indexOf(defaultLead);
    state.lead = leadOptions[(current + 1) % leadOptions.length];
    logEvent(`LEAD ${state.lead}`);
  }

  function cycleSensitivity() {
    const current = sensitivityOptions.includes(state.sensitivity)
      ? sensitivityOptions.indexOf(state.sensitivity)
      : sensitivityOptions.indexOf(defaultSensitivity);
    state.sensitivity = sensitivityOptions[(current + 1) % sensitivityOptions.length];
    logEvent(`GAIN ${state.sensitivity}`);
  }

  function setMonitorStyle(style) {
    if (!Object.hasOwn(monitorStyles, style)) return false;
    state.monitorStyle = style;
    logEvent(`MONITOR STYLE ${monitorStyles[style].name}`);
    return true;
  }

  function setLeadCheckEnabled(enabled) {
    state.leadCheckEnabled = Boolean(enabled);
    logEvent(state.leadCheckEnabled ? "LEAD CHECK ON" : "LEAD CHECK OFF");
  }

  function setLeadStatus(value) {
    const next = value || {};
    state.leadStatus = {
      red: Boolean(next.red),
      yellow: Boolean(next.yellow),
      green: Boolean(next.green)
    };
    const status = Object.entries(state.leadStatus)
      .map(([leadName, connected]) => `${leadName.toUpperCase()}:${connected ? "ON" : "OFF"}`)
      .join(" ");
    logEvent(`LEADS ${status}`);
  }

  function applyScenarioPreset(presetKey) {
    if (!Object.hasOwn(scenarioPresets, presetKey)) return false;
    state.scenario.selectedPreset = presetKey;
    state.scenario.config = structuredClone(scenarioPresets[presetKey]);
    logEvent(`PRESET ${state.scenario.config.name}`);
    return true;
  }

  function saveScenario(config) {
    state.scenario.selectedPreset = "manual";
    state.scenario.config = normalizeScenario(config);
    logEvent(`SCENARIO SAVED ${state.scenario.config.name}`);
  }

  function startScenario() {
    clearTimelineTimer();
    state.timelineScenario.active = false;
    state.timelineScenario.awaitingShockIndex = null;
    state.timelineScenario.activeIndex = null;
    state.deviceMode = "manual";
    const config = state.scenario.config;
    state.powered = true;
    state.scenario.active = true;
    state.scenario.shockCount = 0;
    setMonitorState({
      rhythm: config.initial.rhythm,
      energy: config.initial.energy,
      vitals: config.initial.vitals
    });
    logEvent(`SCENARIO START ${config.name}`);
  }

  function resetScenario() {
    clearTimelineTimer();
    state.scenario.active = false;
    state.scenario.shockCount = 0;
    disarm("SCENARIO RESET");
    state.timelineScenario.active = false;
    state.timelineScenario.activeIndex = null;
    state.timelineScenario.awaitingShockIndex = null;
    state.timelineScenario.startedAt = null;
  }

  function clearTimelineScenario() {
    resetScenario();
    state.timelineScenario.events = [];
    logEvent("TIMELINE CLEARED");
  }

  function applyAction(action, value) {
    switch (action) {
      case "POWER_TOGGLE":
        powerToggle();
        break;
      case "SET_POWER":
        setPower(value);
        break;
      case "SET_ROTARY_POSITION":
        if (!setRotaryPosition(value)) return false;
        break;
      case "DISARM":
        disarm();
        break;
      case "ENERGY_UP":
        changeEnergy(1);
        break;
      case "ENERGY_DOWN":
        changeEnergy(-1);
        break;
      case "LEAD_NEXT":
        cycleLead();
        break;
      case "SENSITIVITY_NEXT":
        cycleSensitivity();
        break;
      case "SYNC_TOGGLE":
        toggleSync();
        break;
      case "CHARGE":
        charge();
        break;
      case "SHOCK":
        shock();
        break;
      case "ALARM_TOGGLE":
        state.alarmMuted = !state.alarmMuted;
        logEvent(state.alarmMuted ? "ALARM SILENCE" : "ALARM ON");
        break;
      case "SET_MONITOR_STYLE":
        if (!setMonitorStyle(value)) return false;
        break;
      case "SET_LEAD_CHECK_ENABLED":
        setLeadCheckEnabled(value);
        break;
      case "SET_LEAD_STATUS":
        setLeadStatus(value);
        break;
      case "SET_RHYTHM":
        if (!rhythms.includes(value)) return false;
        setRhythm(value);
        break;
      case "APPLY_SCENARIO_PRESET":
        if (!applyScenarioPreset(value)) return false;
        break;
      case "SAVE_SCENARIO":
        saveScenario(value);
        break;
      case "SAVE_TIMELINE_SCENARIO":
        if (!saveTimelineScenario(value)) return false;
        break;
      case "START_TIMELINE_SCENARIO":
        if (!startTimelineScenario()) return false;
        break;
      case "START_SCENARIO":
        startScenario();
        break;
      case "RESET_SCENARIO":
        resetScenario();
        break;
      case "CLEAR_TIMELINE_SCENARIO":
        clearTimelineScenario();
        break;
      default:
        return false;
    }
    broadcast();
    return true;
  }

  return {
    snapshot, applyAction,
    /** @param {import("./types.js").MonitorClient} client */
    subscribe(client) {
      clients.add(client);
      client.update(snapshot());
      return () => clients.delete(client);
    },
    close() {
      clearChargeTimer();
      clearTimelineTimer();
      for (const client of clients) client.close();
      clients.clear();
    }
  };
}
