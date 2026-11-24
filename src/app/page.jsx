export default function Home() {
  return (
    <main className="launcher">
      <header>
        <h1>SimMonitor</h1>
        <p>除細動器シミュレーター</p>
      </header>
      <section className="launcher-card">
        <h2>ブラウザデモ</h2>
        <p>Picoなしで、モニターを見ながら充電と模擬ショックを体験できます。</p>
        <a className="primary-link" href="/demo">デモを開く</a>
      </section>
      <section className="launcher-card">
        <h2>ローカル演習</h2>
        <p>PCで演習を開始し、表示されたモニターURLをiPadで開いてください。</p>
        <a className="primary-link" href="/sim-monitor/instructor">新しい演習を開く</a>
      </section>
      <section className="launcher-card">
        <h2>iPadモニター</h2>
        <form action="/sim-monitor/monitor">
          <label htmlFor="monitor-room">接続ID</label>
          <div className="connection-controls">
            <input id="monitor-room" name="room" required pattern="[A-Za-z0-9_\\-]{16,80}" minLength={16} maxLength={80} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
            <button type="submit">モニターを開く</button>
          </div>
        </form>
      </section>
    </main>
  );
}
