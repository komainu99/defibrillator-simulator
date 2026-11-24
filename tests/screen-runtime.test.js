import assert from "node:assert/strict";
import test from "node:test";
import { mountDemo } from "../src/features/simulator/demo.js";
import { mountSimulator } from "../src/features/simulator/screen-runtime.js";
import { createMonitorSession } from "../src/lib/simulator/session.js";

function fakeBrowser() {
  const names = {
    window: { addEventListener() {}, removeEventListener() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {}
  };
  const original = Object.fromEntries(Object.keys(names).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.assign(globalThis, names);
  return () => {
    for (const [name, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  };
}

function view(t, options = {}) {
  const restore = fakeBrowser();
  let openScenario;
  const host = {
    innerHTML: "",
    replaceChildren() {},
    querySelector: () => null,
    querySelectorAll(selector) {
      if (selector !== "[data-tab]") return [];
      return [{ dataset: { tab: "scenario" }, addEventListener(_, callback) { openScenario = callback; } }];
    }
  };
  const screen = mountSimulator({
    app: host, role: "instructor", onError: message => assert.fail(message), ...options
  });
  t.after(() => {
    try { screen.close(); } finally { restore(); }
  });
  return { host, screen, scenario: () => openScenario() };
}

test("instructor renders recent events and escapes user-provided names", t => {
  const { host, screen } = view(t);
  const session = createMonitorSession();
  t.after(() => session.close());
  session.applyAction("SAVE_TIMELINE_SCENARIO", { name: '<img src=x onerror="fail()">', events: [] });
  screen.update(session.snapshot());
  assert.match(host.innerHTML, /TIMELINE SAVED &lt;img src=x onerror=&quot;fail\(\)&quot;&gt;/);
  assert.doesNotMatch(host.innerHTML, /<img src=x/);
});

test("an accepted PSVT timeline has a preview in the Scenario tab", t => {
  const { host, screen, scenario } = view(t);
  const session = createMonitorSession();
  t.after(() => session.close());
  assert.equal(session.applyAction("SAVE_TIMELINE_SCENARIO", { events: [{ kind: "psvt", duration: 30, hr: 180 }] }), true);
  screen.update(session.snapshot());
  scenario();
  assert.match(host.innerHTML, /data-timeline-index="0"/);
  assert.match(host.innerHTML, /<strong>PSVT<\/strong>/);
  assert.match(host.innerHTML, /<polyline points="[^"]+"/);
});

test("demo monitor initially shows OFF, then the wave with audio controls hidden", t => {
  const { host, screen } = view(t, { role: "monitor", audioAvailable: false });
  const session = createMonitorSession();
  t.after(() => session.close());
  assert.match(host.innerHTML, /monitor-off-screen/);
  session.applyAction("START_SCENARIO");
  screen.update(session.snapshot());
  assert.match(host.innerHTML, /<canvas id="wave"/);
  assert.doesNotMatch(host.innerHTML, /monitor-audio-toggle/);
});

test("demo controls charge, shock and restart without a server", { timeout: 5000 }, async t => {
  const restore = fakeBrowser();
  t.mock.method(globalThis, "fetch", () => assert.fail("Demo must not request a server"));
  const actions = new Map();
  const start = {
    addEventListener(_, callback) { this.click = callback; },
    removeEventListener() {}
  };
  let onInstructorRender;
  const instructor = {
    html: "",
    set innerHTML(html) {
      this.html = html;
      onInstructorRender?.(html);
    },
    querySelector: () => null,
    querySelectorAll(selector) {
      if (selector !== "[data-action]") return [];
      return ["CHARGE", "SHOCK"].map(action => ({
        dataset: { action },
        addEventListener(_, callback) { actions.set(action, callback); }
      }));
    },
    replaceChildren() {}
  };
  const monitor = {
    innerHTML: "",
    querySelector: () => null,
    querySelectorAll: () => [],
    replaceChildren() {}
  };
  const elements = {
    "[data-demo-error]": {},
    "[data-demo-start]": start,
    "[data-demo-instructor]": instructor,
    "[data-demo-monitor]": monitor
  };
  const demo = mountDemo({
    querySelector: selector => elements[selector],
    replaceChildren() {}
  });
  t.after(() => {
    try { demo(); } finally { restore(); }
  });

  assert.match(monitor.innerHTML, /monitor-off-screen/);
  start.click();
  assert.match(monitor.innerHTML, /monitor-meta">VF/);
  const ready = new Promise(resolve => {
    onInstructorRender = html => {
      if (html.includes("READY 150J")) resolve();
    };
  });
  await actions.get("CHARGE")();
  await ready;
  await actions.get("SHOCK")();
  assert.match(monitor.innerHTML, /monitor-meta">NSR/);
  assert.match(instructor.html, /SHOCK 150J/);
  start.click();
  assert.match(monitor.innerHTML, /monitor-meta">VF/);
  assert.doesNotMatch(instructor.html, /SHOCK 150J/);
});
