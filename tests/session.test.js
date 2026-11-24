import assert from "node:assert/strict";
import test from "node:test";
import { createMonitorSession } from "../src/lib/simulator/session.js";
import { picoAction } from "../src/features/simulator/pico-serial.js";

function until(session, predicate) {
  return new Promise((resolve, reject) => {
    let unsubscribe;
    const timeout = setTimeout(() => {
      unsubscribe?.();
      reject(new Error("Session transition timed out"));
    }, 4500);
    unsubscribe = session.subscribe({
      update(state) {
        if (!predicate(state)) return;
        clearTimeout(timeout);
        queueMicrotask(() => {
          unsubscribe();
          resolve(state);
        });
      },
      close() {}
    });
  });
}

test("preset starts without Pico and a charged shock changes VF to sinus", async t => {
  const session = createMonitorSession();
  t.after(() => session.close());
  assert.equal(session.snapshot().powered, false);
  session.applyAction("START_SCENARIO");
  assert.equal(session.snapshot().rhythm, "vf");
  session.applyAction("SHOCK");
  assert.equal(session.snapshot().lastShockAt, null);
  session.applyAction("CHARGE");
  assert.equal(session.snapshot().charging, true);
  await until(session, state => state.charged);
  session.applyAction("SHOCK");
  const outcome = session.snapshot();
  assert.equal(outcome.rhythm, "sinus");
  assert.equal(outcome.charged, false);
  assert.equal(outcome.scenario.shockCount, 1);
});

test("timeline waits for sufficient energy and advances after the shock", async t => {
  const session = createMonitorSession();
  t.after(() => session.close());
  assert.equal(session.applyAction("SAVE_TIMELINE_SCENARIO", {
    events: [{ kind: "vf" }, { kind: "shock", joules: 150 }, { kind: "rosc", hr: 80 }]
  }), true);
  const before = session.snapshot();
  session.applyAction("START_TIMELINE_SCENARIO");
  assert.equal(before.timelineScenario.active, false);
  assert.equal(session.snapshot().timelineScenario.awaitingShockIndex, 1);
  session.applyAction("SET_ROTARY_POSITION", { position: "energy", joules: 150 });
  session.applyAction("CHARGE");
  await until(session, state => state.charged);
  session.applyAction("SHOCK");
  await until(session, state => state.rhythm === "rosc");
  assert.equal(session.snapshot().timelineScenario.awaitingShockIndex, null);
});

test("Pico translates rotary, telemetry, buttons and lead state", () => {
  assert.deepEqual(picoAction({ type: "telemetry", rotary: { position: { position: "energy", joules: 150 } } }),
    ["SET_ROTARY_POSITION", { position: "energy", joules: 150 }]);
  assert.deepEqual(picoAction({ type: "rotary", position: "off" }), ["SET_ROTARY_POSITION", { position: "off" }]);
  assert.deepEqual(picoAction({ type: "button", name: "charge" }), ["CHARGE"]);
  assert.deepEqual(picoAction({ type: "lead_status", leads: { red: true } }),
    ["SET_LEAD_STATUS", { red: true, yellow: false, green: false }]);
  assert.equal(picoAction({ type: "rotary", position: "energy" }), null);
});
