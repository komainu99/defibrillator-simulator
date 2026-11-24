import { createMonitorSession } from "../../lib/simulator/session.js";
import { mountSimulator } from "./screen-runtime.js";

export function mountDemo(root) {
  root.innerHTML = `
    <header class="demo-header">
      <h1>SimMonitor ブラウザデモ</h1>
      <p>Picoの接続は不要です。このタブ内で模擬操作とモニターを確認できます。デモは無音です。</p>
      <ol class="demo-steps">
        <li>「デモを開始」でVFのプリセットを起動します。</li>
        <li>Live画面で「CHARGE」を押し、準備完了を待ちます。</li>
        <li>「SHOCK」を押し、波形と操作履歴の変化を確認します。</li>
      </ol>
      <button class="button demo-start" type="button" data-demo-start>デモを開始</button>
      <p role="alert" data-demo-error hidden></p>
    </header>
    <div class="demo-workspace">
      <section class="demo-monitor" aria-label="モニター表示" data-demo-monitor></section>
      <section aria-label="インストラクター操作" data-demo-instructor></section>
    </div>
    <footer class="demo-footer">医学教育・訓練用のシミュレーターです。臨床判断や治療には使用できません。</footer>
  `;

  let session = createMonitorSession();
  const error = root.querySelector("[data-demo-error]");
  const updateError = message => {
    error.hidden = !message;
    error.textContent = message;
  };
  const start = root.querySelector("[data-demo-start]");
  const begin = () => {
    updateError("");
    unsubscribe();
    session.close();
    session = createMonitorSession();
    unsubscribe = watchSession();
    session.applyAction("START_SCENARIO");
    start.textContent = "デモを最初からやり直す";
  };
  const monitor = mountSimulator({
    app: root.querySelector("[data-demo-monitor]"),
    role: "monitor", audioAvailable: false, onError: updateError
  });
  const instructor = mountSimulator({
    app: root.querySelector("[data-demo-instructor]"),
    role: "instructor", embedded: true, onError: updateError,
    sendAction(action, value) {
      updateError("");
      if (!session.applyAction(action, value)) throw new Error("この操作を適用できませんでした。");
    }
  });
  const watchSession = () => session.subscribe({
    update(snapshot) {
      monitor.update(snapshot);
      instructor.update(snapshot);
    },
    close() {}
  });
  let unsubscribe = watchSession();
  start.addEventListener("click", begin);

  return () => {
    start.removeEventListener("click", begin);
    unsubscribe();
    session.close();
    monitor.close();
    instructor.close();
    root.replaceChildren();
  };
}
