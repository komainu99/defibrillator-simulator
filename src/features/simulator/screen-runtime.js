import { mountEcg } from "./ecg-canvas.js";
import { MonitorAudio } from "./monitor-audio.js";
const htmlEntities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => htmlEntities[character]);
}

// Owns the Canvas, Web Audio and simulation controls inside the React host.
export function mountSimulator({ app, role: route, sendAction, onError, audioAvailable = true, embedded = false }) {
  let state = null;
  let lastKeyAt = new Map();
  let activeInstructorTab = "live";
  let activeWaveformCategory = "icls";
  let disposed = false;
  const silentRhythms = new Set(["vf", "asystole", "polymorphic_vt", "tdp"]);
  const highAlarmRhythms = new Set(["vf", "pulseless_vt", "polymorphic_vt", "tdp", "pea", "asystole"]);
  const mediumAlarmRhythms = new Set([
    "psvt", "monomorphic_vt", "avnrt", "avrt", "atrial_tachycardia", "atrial_flutter",
    "atrial_fibrillation", "sinus_tachycardia", "sinus_bradycardia", "sinus_arrest",
    "av_block_1", "wenckebach", "mobitz_2", "av_block_2_1", "advanced_av_block",
    "complete_av_block", "junctional_escape", "ventricular_escape"
  ]);

  const monitorAudio = new MonitorAudio();

  const rhythmLabels = {
    vf: "VF",
    psvt: "PSVT",
    sinus: "正常洞調律",
    asystole: "心静止"
  };

  const previewPatterns = {
    sinus: "0,25 12,25 17,21 22,25 31,25 35,31 39,5 43,36 48,25 63,25 72,18 81,25 96,25 100,31 104,5 108,36 113,25 120,25",
    vf: "0,24 8,9 15,36 23,12 31,30 39,7 47,35 55,14 63,28 72,8 80,34 89,13 98,27 108,11 120,25",
    vt: "0,25 7,35 15,8 24,37 34,25 41,35 49,8 58,37 68,25 75,35 83,8 92,37 102,25 109,35 117,8 120,17",
    polymorphic: "0,25 7,20 14,10 21,31 28,39 35,24 42,13 49,7 56,26 63,36 70,30 77,19 84,13 91,24 98,32 105,28 112,22 120,25",
    svt: "0,25 8,25 11,31 14,7 17,35 21,25 34,25 37,31 40,7 43,35 47,25 60,25 63,31 66,7 69,35 73,25 86,25 89,31 92,7 95,35 99,25 120,25",
    irregular: "0,25 8,22 14,28 20,19 27,31 34,25 40,34 44,7 48,36 53,24 61,19 68,29 74,23 82,31 88,8 93,36 100,24 109,20 120,27",
    block: "0,25 10,20 18,25 27,25 31,31 35,6 39,36 44,25 63,20 71,25 90,20 98,25 107,25 111,31 115,6 119,36 120,31",
    asystole: "0,25 20,25 40,24 60,25 80,25 100,24 120,25"
  };

  const waveformCategories = {
    icls: {
      label: "ICLS・基本蘇生",
      waveforms: {
        sinus: { label: "NSR", detail: "正常洞調律", hr: 72, family: "sinus", points: previewPatterns.sinus },
        vf: { label: "VF", detail: "心室細動", hr: 0, family: "vf", points: previewPatterns.vf },
        pulseless_vt: { label: "Pulseless VT", detail: "無脈性心室頻拍", hr: 180, family: "vt", points: previewPatterns.vt },
        pea: { label: "PEA", detail: "無脈性電気活動", hr: 60, family: "sinus", points: previewPatterns.sinus },
        asystole: { label: "Asystole", detail: "心静止", hr: 0, family: "asystole", points: previewPatterns.asystole },
        rosc: { label: "ROSC", detail: "自己心拍再開", hr: 80, family: "sinus", points: previewPatterns.sinus }
      }
    },
    tachy: {
      label: "頻拍性不整脈",
      waveforms: {
        monomorphic_vt: { label: "Monomorphic VT", detail: "単形性心室頻拍", hr: 170, family: "vt", points: previewPatterns.vt },
        polymorphic_vt: { label: "Polymorphic VT", detail: "多形性心室頻拍", hr: 190, family: "polymorphic", points: previewPatterns.polymorphic },
        tdp: { label: "TdP", detail: "Torsades de Pointes", hr: 210, family: "polymorphic", points: previewPatterns.polymorphic },
        psvt: { label: "PSVT", detail: "発作性上室性頻拍", hr: 180, family: "svt", points: previewPatterns.svt },
        avnrt: { label: "AVNRT", detail: "房室結節リエントリー性頻拍", hr: 180, family: "svt", points: previewPatterns.svt },
        avrt: { label: "AVRT", detail: "房室リエントリー性頻拍", hr: 190, family: "svt", points: previewPatterns.svt },
        atrial_tachycardia: { label: "AT", detail: "心房頻拍", hr: 150, family: "svt", points: previewPatterns.svt },
        atrial_flutter: { label: "AFL", detail: "心房粗動", hr: 150, family: "flutter", points: previewPatterns.svt },
        atrial_fibrillation: { label: "AF", detail: "心房細動", hr: 130, family: "af", points: previewPatterns.irregular },
        sinus_tachycardia: { label: "Sinus Tachycardia", detail: "洞性頻脈", hr: 120, family: "sinus", points: previewPatterns.sinus }
      }
    },
    brady: {
      label: "徐脈・伝導障害",
      waveforms: {
        sinus_bradycardia: { label: "Sinus Bradycardia", detail: "洞性徐脈", hr: 45, family: "sinus", points: previewPatterns.sinus },
        sinus_arrest: { label: "Sinus Arrest", detail: "洞停止", hr: 40, family: "pause", points: previewPatterns.block },
        av_block_1: { label: "1st-degree AV Block", detail: "I度房室ブロック", hr: 65, family: "avblock", points: previewPatterns.block },
        wenckebach: { label: "Mobitz I", detail: "Wenckebach型II度房室ブロック", hr: 55, family: "avblock", points: previewPatterns.block },
        mobitz_2: { label: "Mobitz II", detail: "Mobitz II型II度房室ブロック", hr: 45, family: "avblock", points: previewPatterns.block },
        av_block_2_1: { label: "2:1 AV Block", detail: "2:1房室ブロック", hr: 40, family: "avblock", points: previewPatterns.block },
        advanced_av_block: { label: "Advanced AV Block", detail: "高度房室ブロック", hr: 35, family: "avblock", points: previewPatterns.block },
        complete_av_block: { label: "Complete AV Block", detail: "完全房室ブロック", hr: 35, family: "completeblock", points: previewPatterns.block },
        junctional_escape: { label: "Junctional Escape", detail: "接合部補充調律", hr: 45, family: "junctional", points: previewPatterns.sinus },
        ventricular_escape: { label: "Ventricular Escape", detail: "心室補充調律", hr: 30, family: "vt", points: previewPatterns.vt }
      }
    }
  };

  const timelineWaveforms = Object.fromEntries(
    Object.values(waveformCategories).flatMap(category => Object.entries(category.waveforms))
  );

  function currentRhythmLabel() {
    return timelineWaveforms[state?.rhythm]?.label || rhythmLabels[state?.rhythm] || state?.rhythm || "--";
  }

  const monitorStyleLabels = {
    classic: "Classic Green",
    highContrast: "High Contrast",
    clinicalBlue: "Clinical Blue",
    lightConsole: "Light Console"
  };

  async function action(type, value) {
    if (!state || !sendAction || disposed) return false;
    try {
      await sendAction(type, value);
      return !disposed;
    } catch (error) {
      if (!disposed) onError(error.message);
      return false;
    }
  }

  function chargeText() {
    if (!state.powered) return "POWER OFF";
    if (state.charged) return `${state.energy}J READY`;
    if (state.charging) return `CHARGING ${state.chargeProgress}%`;
    return "NOT CHARGED";
  }

  function leadsConnected() {
    if (!state.leadCheckEnabled) return true;
    return Boolean(state.leadStatus?.red && state.leadStatus?.yellow && state.leadStatus?.green);
  }

  function monitorSignalActive() {
    return Boolean(state.powered && leadsConnected());
  }

  function alarmSeverity() {
    if (!state?.powered) return "normal";
    if (state.leadCheckEnabled && !leadsConnected()) return "medium";
    const hr = Number(state.vitals?.hr);
    if (highAlarmRhythms.has(state.rhythm) || !Number.isFinite(hr) || hr < 30 || hr > 180) return "high";
    if (mediumAlarmRhythms.has(state.rhythm) || hr < 50 || hr > 120) return "medium";
    return "normal";
  }

  function alarmLabel(level = alarmSeverity()) {
    if (level === "high") return "CRITICAL ALARM";
    if (level === "medium") return "WARNING";
    return "NORMAL";
  }

  function organizedHeartbeatActive() {
    return Boolean(monitorSignalActive() && Number(state.vitals?.hr) > 0 && !silentRhythms.has(state.rhythm));
  }

  function traceActive() {
    return Boolean(state.powered);
  }

  function leadStatusText() {
    if (!state.leadCheckEnabled) return "LEAD CHECK OFF";
    if (leadsConnected()) return "LEADS OK";
    const missing = Object.entries(state.leadStatus || {})
      .filter(([, connected]) => !connected)
      .map(([name]) => name.toUpperCase())
      .join(" ");
    return `LEADS OFF ${missing}`;
  }

  function renderMonitorReadouts() {
    const hr = monitorSignalActive() ? state.vitals.hr : "--";
    return `
      <aside class="vitals-panel monitor-readouts">
        <div class="vital">
          <div class="label">HR</div>
          <div class="value green" id="monitor-hr">${hr}</div>
          <div class="unit">bpm</div>
        </div>
        <div class="vital">
          <div class="label">ENERGY</div>
          <div class="energy-readout">
            <div class="value amber" id="monitor-energy">${state.energy}</div>
            <div class="unit">J</div>
          </div>
        </div>
        <div class="vital compact">
          <div class="label" id="monitor-lead-label">LEAD</div>
          <div class="setting-value" id="monitor-lead">${state.lead || "II"}</div>
        </div>
        <div class="vital compact">
          <div class="label">GAIN</div>
          <div class="setting-value" id="monitor-sensitivity">${state.sensitivity || "10 mm/mV"}</div>
        </div>
        <div class="charge-state">
          <strong id="monitor-charge-state">${chargeText()}</strong>
          <div class="progress"><span id="monitor-charge-progress" style="width:${state.chargeProgress}%"></span></div>
        </div>
      </aside>
    `;
  }

  function renderInstructorStatus() {
    const hr = state.powered ? state.vitals.hr : "--";
    return `
      <div class="instructor-status">
        <div class="status-tile">
          <span>HR</span>
          <strong class="green">${hr}</strong>
          <small>bpm</small>
        </div>
        <div class="status-tile">
          <span>ENERGY</span>
          <strong class="amber">${state.energy}</strong>
          <small>J</small>
        </div>
        <div class="status-tile wide">
          <span>CHARGE</span>
          <strong>${chargeText()}</strong>
          <div class="progress"><i style="width:${state.chargeProgress}%"></i></div>
        </div>
      </div>
    `;
  }

  function deviceModeLabel() {
    const labels = {
      off: "OFF",
      monitor: "MONITOR",
      aed: "AED",
      pacing: "PACING",
      disarm: "DISARM",
      manual: "MANUAL DEFIB"
    };
    return labels[state.deviceMode] || String(state.deviceMode || "--").toUpperCase();
  }

  function rotaryPositionActive(position, joules) {
    if (position === "off") return !state.powered;
    if (position === "energy") return state.powered && state.deviceMode === "manual" && state.energy === joules;
    return state.powered && state.deviceMode === position;
  }

  function renderRotaryControl() {
    const positions = [
      ["pacing", "PACING"], ["off", "OFF"], ["monitor", "MONITOR"], ["aed", "AED"], ["disarm", "DISARM"],
      ...[5, 10, 20, 50, 100, 150, 360].map(joules => ["energy", `${joules} J`, joules])
    ];
    return `
      <div class="rotary-control" role="group" aria-label="ロータリースイッチの現在位置">
        ${positions.map(([position, label, joules]) => `
          <span class="rotary-position ${rotaryPositionActive(position, joules) ? "active" : ""}"
            ${rotaryPositionActive(position, joules) ? 'aria-current="true"' : ""}>${label}</span>
        `).join("")}
      </div>
    `;
  }

  function renderEventRows() {
    return state.eventLog.slice().reverse().map(item => `
      <div class="event"><span class="muted">${escapeHtml(item.time)}</span><strong>${escapeHtml(item.label)}</strong></div>
    `).join("") || '<div class="muted">No events</div>';
  }

  function renderEvents() {
    return `
      <div class="log-panel">
        <h2 class="section-title">イベント</h2>
        <div class="events">
          ${renderEventRows()}
        </div>
      </div>
    `;
  }

  function renderLiveTab() {
    return `
      <section class="instructor instructor-live">
        <div class="control-panel">
          <h1 class="section-title">ロータリースイッチ</h1>
          ${renderRotaryControl()}
          <p class="muted">モード・ジュール数は実機のロータリースイッチで変更してください。</p>
          <div class="power-status ${state.powered ? "on" : "off"}" role="status">
            <i aria-hidden="true"></i>
            <strong>${state.powered ? "POWER ON" : "POWER OFF"}</strong>
            <span>ロータリースイッチ / ${deviceModeLabel()}</span>
          </div>

          <h2 class="section-title">現在状態</h2>
          ${renderInstructorStatus()}

          <h2 class="section-title">誘導・感度</h2>
          <div class="controls-grid pair">
            <button class="button" data-action="LEAD_NEXT">LEAD ${state.lead || "II"}</button>
            <button class="button" data-action="SENSITIVITY_NEXT">GAIN ${state.sensitivity || "10 mm/mV"}</button>
          </div>

          <h2 class="section-title">除細動操作</h2>
          <div class="controls-grid therapy">
            <button class="button ${state.charged ? "yellow blink" : ""}" data-action="CHARGE">
              ${state.charged ? "CHARGED" : state.charging ? "CHARGING" : "CHARGE"}
            </button>
            <button class="button ${state.charged ? "red" : ""}" data-action="SHOCK">SHOCK</button>
          </div>

          <h2 class="section-title">リズム</h2>
          <div class="rhythm-row">
            ${Object.entries(rhythmLabels).map(([key, label]) => `
              <button class="pill ${state.rhythm === key ? "active" : ""}" data-rhythm="${key}">${label}</button>
            `).join("")}
          </div>

          <h2 class="section-title">リード判定</h2>
          <div class="lead-panel">
            <button class="button compact ${state.leadCheckEnabled ? "green" : ""}" data-lead-check="${state.leadCheckEnabled ? "off" : "on"}">
              ${state.leadCheckEnabled ? "LEAD CHECK ON" : "LEAD CHECK OFF"}
            </button>
            <div class="lead-status-row">
              ${["red", "yellow", "green"].map(name => `
                <div class="lead-status ${name} ${state.leadStatus?.[name] ? "connected" : ""}">
                  <i></i>
                  <span>${name.toUpperCase()}</span>
                  <strong>${state.leadStatus?.[name] ? "OK" : "OFF"}</strong>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
        ${renderEvents()}
      </section>
    `;
  }

  function renderWavePreview(kind) {
    const waveform = timelineWaveforms[kind] || timelineWaveforms.sinus;
    return `
      <svg class="waveform-preview" viewBox="0 0 120 42" aria-hidden="true">
        <line x1="0" y1="25" x2="120" y2="25"></line>
        <polyline points="${waveform.points}"></polyline>
      </svg>
    `;
  }

  function renderShockPreview() {
    return `
      <div class="shock-preview" aria-hidden="true">
        <span>SHOCK</span>
        <i></i>
      </div>
    `;
  }

  function renderScenarioTab() {
    const timeline = state.timelineScenario || { name: "タイムラインシナリオ", events: [] };
    const presets = state.scenarioPresets || {};
    const invalidShockStart = timeline.events[0]?.kind === "shock";
    return `
      <section class="instructor scenario-workspace">
        <div class="control-panel timeline-builder">
          <h1 class="section-title">シナリオ設定</h1>
          ${invalidShockStart ? `
            <div class="timeline-warning" role="alert">
              ショックより先に波形イベントを設置してください。
            </div>
          ` : ""}
          <label class="field timeline-name">
            <span>シナリオ名</span>
            <input data-timeline-name maxlength="60" value="${escapeHtml(timeline.name)}" />
          </label>

          <div class="scenario-editor">
            <aside class="waveform-library">
              <h2 class="section-title">波形ライブラリ</h2>
              <div class="waveform-category-tabs" role="tablist" aria-label="波形カテゴリ">
                ${Object.entries(waveformCategories).map(([key, category]) => `
                  <button type="button" class="waveform-category-tab ${activeWaveformCategory === key ? "active" : ""}" data-wave-category="${key}">${category.label}</button>
                `).join("")}
              </div>
              <div class="waveform-library-list">
                ${Object.entries(waveformCategories[activeWaveformCategory].waveforms).map(([kind, waveform]) => `
                  <button class="waveform-source" type="button" draggable="true" data-wave-kind="${kind}">
                    ${renderWavePreview(kind)}
                    <span><strong>${waveform.label}</strong><small>${waveform.detail}</small></span>
                    <i>＋</i>
                  </button>
                `).join("")}
              </div>
              <div class="event-library">
                <h3>イベント</h3>
                <button class="waveform-source shock-source" type="button" draggable="true" data-event-kind="shock">
                  ${renderShockPreview()}
                  <span><strong>ショック</strong><small>除細動を実行</small></span>
                  <i>＋</i>
                </button>
              </div>
            </aside>

            <div class="timeline-area">
              <div class="timeline-heading">
                <h2 class="section-title">時間軸</h2>
                <span>${timeline.events.length}イベント</span>
              </div>
              <div class="timeline-track ${timeline.events.length ? "" : "empty"}" data-timeline-drop>
                ${timeline.events.map((event, index) => {
                  const isShock = event.kind === "shock";
                  const hasFollowingWaveform = Boolean(timeline.events[index + 1] && timeline.events[index + 1].kind !== "shock");
                  const waveform = timelineWaveforms[event.kind] || timelineWaveforms.sinus;
                  return `
                    <article class="timeline-event ${isShock ? "shock-event" : ""} ${timeline.activeIndex === index ? "active" : ""}" draggable="true" data-timeline-index="${index}">
                      <div class="timeline-event-head">
                        <strong>${isShock ? "SHOCK" : waveform.label}</strong>
                        <button type="button" class="timeline-remove" data-remove-event="${index}" title="イベントを削除" aria-label="イベントを削除">×</button>
                      </div>
                      ${isShock ? `
                        ${renderShockPreview()}
                        <div class="timeline-event-fields shock-event-fields">
                          <label><span>必要出力</span><input type="number" min="5" max="360" step="5" value="${event.joules || 150}" data-event-field="joules" data-event-index="${index}"><small>J以上</small></label>
                        </div>
                      ` : `
                        ${renderWavePreview(event.kind)}
                        <div class="timeline-event-fields">
                          ${hasFollowingWaveform ? `<label><span>継続</span><input type="number" min="5" max="600" value="${event.duration}" data-event-field="duration" data-event-index="${index}"><small>秒</small></label>` : ""}
                          <label><span>HR</span><input type="number" min="0" max="260" value="${event.hr}" data-event-field="hr" data-event-index="${index}"><small>bpm</small></label>
                        </div>
                      `}
                    </article>
                  `;
                }).join("") || `<div class="timeline-empty">波形をここへドラッグ</div>`}
              </div>
            </div>
          </div>

          <div class="scenario-actions timeline-actions">
            <button class="button blue" type="button" data-save-timeline>SAVE SCENARIO</button>
            <button class="button amber" type="button" data-action="START_TIMELINE_SCENARIO" ${timeline.events.length && !invalidShockStart ? "" : "disabled"}>START SCENARIO</button>
            <button class="button" type="button" data-action="CLEAR_TIMELINE_SCENARIO">RESET</button>
          </div>

          <details class="legacy-scenarios">
            <summary>従来のプリセット</summary>
            <div class="preset-grid">
              ${Object.entries(presets).map(([key, preset]) => `
                <button class="preset-card ${state.scenario.selectedPreset === key ? "active" : ""}" data-preset="${key}">
                  <strong>${preset.name}</strong>
                  <span>${rhythmLabels[preset.initial.rhythm]} / ${preset.initial.energy}J</span>
                </button>
              `).join("")}
            </div>
            <button class="button amber legacy-start" type="button" data-action="START_SCENARIO">START PRESET</button>
          </details>
        </div>
        ${renderEvents()}
      </section>
    `;
  }

  function setupTimelineBuilder() {
    const track = app.querySelector("[data-timeline-drop]");
    if (!track) return;

    const currentEvents = () => (state.timelineScenario?.events || []).map(event => ({ ...event }));
    const currentName = () => app.querySelector("[data-timeline-name]")?.value.trim() || "タイムラインシナリオ";
    const saveTimeline = events => action("SAVE_TIMELINE_SCENARIO", { name: currentName(), events });
    const hasValidShockOrder = events => events.every((event, index) => (
      event.kind !== "shock" || (index > 0 && events[index - 1].kind !== "shock")
    ));
    const addTimelineEvent = (kind, insertionIndex = currentEvents().length) => {
      if (kind === "shock") {
        const events = currentEvents();
        events.splice(insertionIndex, 0, {
          id: `event-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          kind: "shock",
          joules: 150
        });
        if (!hasValidShockOrder(events)) return;
        saveTimeline(events);
        return;
      }
      const waveform = timelineWaveforms[kind];
      if (!waveform) return;
      const events = currentEvents();
      events.splice(insertionIndex, 0, {
        id: `event-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        kind,
        duration: 30,
        hr: waveform.hr
      });
      saveTimeline(events);
    };
    let insertionCards = [];
    let insertionMidpoints = [];
    let activeInsertionIndex = null;
    let pendingClientX = null;
    let previewFrame = null;
    let activeDragPayload = null;
    const prepareInsertionPreview = () => {
      insertionCards = [...track.querySelectorAll("[data-timeline-index]")];
      insertionMidpoints = insertionCards.map(card => card.offsetLeft + card.offsetWidth / 2);
    };
    const getInsertionIndex = clientX => {
      if (!insertionCards.length && track.querySelector("[data-timeline-index]")) {
        prepareInsertionPreview();
      }
      const pointerX = clientX - track.getBoundingClientRect().left + track.scrollLeft;
      const index = insertionMidpoints.findIndex(midpoint => pointerX < midpoint);
      return index === -1 ? insertionCards.length : index;
    };
    const clearInsertionPreview = () => {
      if (previewFrame !== null) cancelAnimationFrame(previewFrame);
      previewFrame = null;
      pendingClientX = null;
      activeInsertionIndex = null;
      insertionCards = [];
      insertionMidpoints = [];
      delete track.dataset.insertionIndex;
      track.classList.remove("drag-over", "insert-at-end", "invalid-drop");
      track.querySelectorAll(".shift-for-insert, .insert-before, .insert-after").forEach(card => {
        card.classList.remove("shift-for-insert", "insert-before", "insert-after");
      });
    };
    const renderInsertionPreview = insertionIndex => {
      if (insertionIndex === activeInsertionIndex) return;
      activeInsertionIndex = insertionIndex;
      track.dataset.insertionIndex = String(insertionIndex);
      track.classList.add("drag-over");
      const previewEvents = currentEvents();
      if (activeDragPayload?.source === "library") {
        previewEvents.splice(insertionIndex, 0, { kind: activeDragPayload.kind });
      } else if (activeDragPayload?.source === "timeline") {
        const [moved] = previewEvents.splice(activeDragPayload.index, 1);
        const adjustedIndex = activeDragPayload.index < insertionIndex ? insertionIndex - 1 : insertionIndex;
        if (moved) previewEvents.splice(Math.max(0, adjustedIndex), 0, moved);
      }
      const validDrop = hasValidShockOrder(previewEvents);
      track.classList.toggle("invalid-drop", !validDrop);
      track.classList.toggle("insert-at-end", insertionIndex === insertionCards.length);
      insertionCards.forEach((card, index) => {
        card.classList.toggle("shift-for-insert", validDrop && index >= insertionIndex);
        card.classList.toggle("insert-before", validDrop && index === insertionIndex);
        card.classList.toggle("insert-after", validDrop && insertionIndex === insertionCards.length && index === insertionCards.length - 1);
      });
    };
    const showInsertionPreview = clientX => {
      pendingClientX = clientX;
      if (previewFrame !== null) return;
      previewFrame = requestAnimationFrame(() => {
        previewFrame = null;
        renderInsertionPreview(getInsertionIndex(pendingClientX));
      });
    };

    app.querySelectorAll("[data-wave-kind]").forEach(button => {
      button.addEventListener("click", () => addTimelineEvent(button.dataset.waveKind));
      button.addEventListener("dragstart", event => {
        prepareInsertionPreview();
        activeDragPayload = { source: "library", kind: button.dataset.waveKind };
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", JSON.stringify(activeDragPayload));
      });
      button.addEventListener("dragend", () => {
        clearInsertionPreview();
        setTimeout(() => { activeDragPayload = null; }, 0);
      });
    });

    app.querySelectorAll("[data-event-kind]").forEach(button => {
      button.addEventListener("click", () => addTimelineEvent(button.dataset.eventKind));
      button.addEventListener("dragstart", event => {
        prepareInsertionPreview();
        activeDragPayload = { source: "library", kind: button.dataset.eventKind };
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", JSON.stringify(activeDragPayload));
      });
      button.addEventListener("dragend", () => {
        clearInsertionPreview();
        setTimeout(() => { activeDragPayload = null; }, 0);
      });
    });

    app.querySelectorAll("[data-timeline-index]").forEach(card => {
      card.addEventListener("dragstart", event => {
        prepareInsertionPreview();
        activeDragPayload = { source: "timeline", index: Number(card.dataset.timelineIndex) };
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", JSON.stringify(activeDragPayload));
        card.classList.add("dragging");
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
        clearInsertionPreview();
        setTimeout(() => { activeDragPayload = null; }, 0);
      });
    });

    track.addEventListener("dragover", event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = activeDragPayload?.source === "library" ? "copy" : "move";
      showInsertionPreview(event.clientX);
    });
    track.addEventListener("dragleave", event => {
      if (!track.contains(event.relatedTarget)) clearInsertionPreview();
    });
    track.addEventListener("drop", event => {
      event.preventDefault();
      const insertionIndexValue = getInsertionIndex(event.clientX);
      clearInsertionPreview();
      let payload = activeDragPayload;
      try {
        const transferredPayload = event.dataTransfer.getData("text/plain");
        if (transferredPayload) payload = JSON.parse(transferredPayload);
      } catch {
        // Some browsers clear drag data before drop; use the in-memory payload.
      }
      activeDragPayload = null;
      if (!payload) return;

      let insertionIndex = insertionIndexValue;
      if (payload.source === "library") {
        addTimelineEvent(payload.kind, insertionIndex);
        return;
      }
      if (payload.source === "timeline") {
        const events = currentEvents();
        const sourceIndex = Number(payload.index);
        if (!events[sourceIndex]) return;
        const [moved] = events.splice(sourceIndex, 1);
        if (sourceIndex < insertionIndex) insertionIndex -= 1;
        events.splice(Math.max(0, insertionIndex), 0, moved);
        if (!hasValidShockOrder(events)) return;
        saveTimeline(events);
      }
    });

    app.querySelectorAll("[data-remove-event]").forEach(button => {
      button.addEventListener("click", () => {
        const events = currentEvents();
        events.splice(Number(button.dataset.removeEvent), 1);
        if (!hasValidShockOrder(events)) return;
        saveTimeline(events);
      });
    });

    app.querySelectorAll("[data-event-field]").forEach(input => {
      input.addEventListener("change", () => {
        const events = currentEvents();
        const event = events[Number(input.dataset.eventIndex)];
        if (!event) return;
        event[input.dataset.eventField] = Number(input.value);
        saveTimeline(events);
      });
    });

    app.querySelector("[data-timeline-name]")?.addEventListener("change", () => saveTimeline(currentEvents()));
    app.querySelector("[data-save-timeline]")?.addEventListener("click", () => saveTimeline(currentEvents()));
  }

  function renderShell() {
    if (route === "monitor") {
      if (!state.powered) {
        app.innerHTML = `
          <div class="screen monitor-off-screen">
            <div class="monitor-off-mark">OFF</div>
          </div>
        `;
        return;
      }

      app.innerHTML = `
        <div class="screen monitor-screen style-${state.monitorStyle || "classic"}">
          <div class="topbar">
            <div class="brand"><span class="status-dot"></span>SimMonitor</div>
            <div class="monitor-topbar-controls">
              <div class="muted" id="monitor-meta">${currentRhythmLabel()} / ${monitorStyleLabels[state.monitorStyle] || "Classic Green"} ${state.alarmMuted ? " / ALARM SILENCED" : ""}</div>
              ${audioAvailable ? `<button class="audio-toggle ${monitorAudio.enabled ? "active" : ""}" id="monitor-audio-toggle" type="button" title="モニター音" aria-label="モニター音" aria-pressed="${monitorAudio.enabled}">${monitorAudio.enabled ? "🔊" : "🔇"}</button>` : ""}
            </div>
          </div>
          <div class="alarm-indicator alarm-${alarmSeverity()}" id="monitor-alarm-indicator" role="status" aria-label="${alarmLabel()}"></div>
          <section class="monitor">
            <div class="wave-panel">
              <div class="wave-header">
                <span id="monitor-wave-lead">ECG ${state.lead || "II"}</span>
                <span id="monitor-wave-status">${state.powered ? leadStatusText() : "OFF"}</span>
              </div>
              <canvas id="wave"></canvas>
              <div class="off-overlay ${state.powered ? "" : "active"}" id="monitor-off">OFF</div>
            </div>
            ${renderMonitorReadouts()}
          </section>
        </div>
      `;
      app.querySelector("#monitor-audio-toggle")?.addEventListener("click", async () => {
        try {
          await monitorAudio.setEnabled(!monitorAudio.enabled);
        } catch {
          if (!disposed) onError("モニター音を有効にできませんでした。");
          return;
        }
        if (disposed) return;
        const button = app.querySelector("#monitor-audio-toggle");
        if (button) {
          button.textContent = monitorAudio.enabled ? "🔊" : "🔇";
          button.classList.toggle("active", monitorAudio.enabled);
          button.setAttribute("aria-pressed", String(monitorAudio.enabled));
        }
        syncMonitorAudio(null, state);
        if (monitorAudio.enabled) monitorAudio.operation();
      });
      ecg.resize();
      return;
    }

    const presetsExpanded = app.querySelector(".legacy-scenarios")?.open;
    app.innerHTML = `
      <div class="screen">
        <div class="topbar">
          <div class="instructor-heading">${embedded ? "" : '<a class="instructor-home-button" href="/">ホーム</a>'}<div class="brand"><span class="status-dot"></span>SimMonitor Instructor</div></div>
          <div class="tabs">
            <button class="tab ${activeInstructorTab === "live" ? "active" : ""}" data-tab="live">Live</button>
            <button class="tab ${activeInstructorTab === "scenario" ? "active" : ""}" data-tab="scenario">Scenario</button>
          </div>
        </div>
        ${activeInstructorTab === "scenario" ? renderScenarioTab() : renderLiveTab()}
      </div>
    `;

    const presets = app.querySelector(".legacy-scenarios");
    if (presets && presetsExpanded) presets.open = true;

    app.querySelectorAll("[data-tab]").forEach(button => {
      button.addEventListener("click", () => {
        activeInstructorTab = button.dataset.tab;
        renderShell();
      });
    });
    app.querySelectorAll("[data-wave-category]").forEach(button => {
      button.addEventListener("click", () => {
        activeWaveformCategory = button.dataset.waveCategory;
        renderShell();
      });
    });
    app.querySelectorAll("[data-action]").forEach(button => {
      button.addEventListener("click", async () => {
        if (!await action(button.dataset.action)) return;
        if (["START_SCENARIO", "START_TIMELINE_SCENARIO"].includes(button.dataset.action)) {
          activeInstructorTab = "live";
          renderShell();
        }
      });
    });
    app.querySelectorAll("[data-rhythm]").forEach(button => {
      button.addEventListener("click", () => action("SET_RHYTHM", button.dataset.rhythm));
    });
    app.querySelectorAll("[data-preset]").forEach(button => {
      button.addEventListener("click", () => action("APPLY_SCENARIO_PRESET", button.dataset.preset));
    });
    app.querySelectorAll("[data-lead-check]").forEach(button => {
      button.addEventListener("click", () => action("SET_LEAD_CHECK_ENABLED", button.dataset.leadCheck === "on"));
    });
    setupTimelineBuilder();
  }

  function updateText(id, value) {
    const element = app.querySelector(`#${id}`);
    if (element) element.textContent = value;
  }

  function syncMonitorAudio(previousState, nextState) {
    if (route !== "monitor") return;
    monitorAudio.updateCharge(Boolean(nextState?.powered && nextState?.charging), nextState?.chargeProgress);
    monitorAudio.setReady(Boolean(nextState?.powered && nextState?.charged));
    monitorAudio.setAlarm(nextState?.alarmMuted ? "normal" : alarmSeverity());
    if (!previousState || !monitorAudio.enabled) return;

    if (nextState.lastShockAt && nextState.lastShockAt !== previousState.lastShockAt) {
      monitorAudio.shock();
      return;
    }

    const operationChanged =
      previousState.energy !== nextState.energy ||
      previousState.lead !== nextState.lead ||
      previousState.sensitivity !== nextState.sensitivity ||
      previousState.syncEnabled !== nextState.syncEnabled ||
      previousState.deviceMode !== nextState.deviceMode ||
      previousState.alarmMuted !== nextState.alarmMuted ||
      previousState.leadCheckEnabled !== nextState.leadCheckEnabled ||
      (previousState.charged && !nextState.charged) ||
      (previousState.charging && !nextState.charging && !nextState.charged);
    if (operationChanged) monitorAudio.operation();
  }

  function updateMonitorDom(previousState) {
    syncMonitorAudio(previousState, state);
    const screen = app.querySelector(".monitor-screen");
    const canvas = app.querySelector("#wave");
    if (!screen || !canvas || previousState?.powered !== state.powered) {
      renderShell();
      return;
    }

    const style = state.monitorStyle || "classic";
    screen.className = `screen monitor-screen style-${style}`;
    updateText("monitor-meta", `${currentRhythmLabel()} / ${monitorStyleLabels[state.monitorStyle] || "Classic Green"} ${state.alarmMuted ? " / ALARM SILENCED" : ""}`);
    updateText("monitor-wave-lead", `ECG ${state.lead || "II"}`);
    updateText("monitor-wave-status", state.powered ? leadStatusText() : "OFF");
    updateText("monitor-hr", monitorSignalActive() ? state.vitals.hr : "--");
    updateText("monitor-energy", state.energy);
    updateText("monitor-lead", state.lead || "II");
    updateText("monitor-sensitivity", state.sensitivity || "10 mm/mV");
    updateText("monitor-charge-state", chargeText());
    const alarmIndicator = app.querySelector(`#${"monitor-alarm-indicator"}`);
    if (alarmIndicator) {
      alarmIndicator.className = `alarm-indicator alarm-${alarmSeverity()}`;
      alarmIndicator.setAttribute("aria-label", alarmLabel());
    }

    const chargeProgress = app.querySelector(`#${"monitor-charge-progress"}`);
    if (chargeProgress) chargeProgress.style.width = `${state.chargeProgress}%`;

    const offOverlay = app.querySelector(`#${"monitor-off"}`);
    if (offOverlay) offOverlay.classList.toggle("active", !state.powered);

    // Keep the sweep running through control and lead-state changes. A real
    // monitor changes the trace from the current cursor instead of restarting it.
    if (previousState?.monitorStyle !== state.monitorStyle) {
      ecg.reset(canvas);
    }

  }

  function handleKey(event) {
    if (route !== "instructor") return;
    const map = {
      F9: "CHARGE",
      F10: "SHOCK",
      F11: "LEAD_NEXT",
      F12: "SENSITIVITY_NEXT"
    };
    const mapped = map[event.key];
    if (!mapped) return;
    event.preventDefault();
    const now = Date.now();
    if (now - (lastKeyAt.get(event.key) || 0) < 250) return;
    lastKeyAt.set(event.key, now);
    action(mapped);
  }

  window.addEventListener("keydown", handleKey);
  const ecg = mountEcg({
    app,
    getState: () => state,
    traceActive,
    leadsConnected,
    organizedHeartbeatActive,
    playHeartbeat: () => monitorAudio.heartbeat()
  });
  if (route === "monitor") {
    state = { powered: false };
    renderShell();
  } else {
    app.innerHTML = '<div class="sim-loading"><p>演習に接続しています…</p></div>';
  }

  return {
    update(next) {
      const previous = state;
      state = next;
      if (route === "monitor") updateMonitorDom(previous);
      else if (activeInstructorTab === "scenario" && previous &&
        JSON.stringify(previous.timelineScenario) === JSON.stringify(next.timelineScenario) &&
        previous.scenario.selectedPreset === next.scenario.selectedPreset) {
        const events = app.querySelector(".events");
        if (events) events.innerHTML = renderEventRows();
      } else renderShell();
    },
    close() {
      disposed = true;
      ecg.close();
      window.removeEventListener("keydown", handleKey);
      monitorAudio.close();
      app.replaceChildren();
    }
  };
}
