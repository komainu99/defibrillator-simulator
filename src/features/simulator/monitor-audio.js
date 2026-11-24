export class MonitorAudio {
  constructor() {
    this.context = null;
    this.disposed = false;
    this.enabled = false;
    this.buffers = new Map();
    this.loopSources = new Map();
    this.alarmLevel = "normal";
  }

  async setEnabled(enabled) {
    if (!enabled) {
      this.enabled = false;
      this.stopCharge();
      this.stopRepeatingSounds();
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error("Web Audio is unavailable");
    this.context ||= new AudioContext();
    await this.context.resume();
    if (!this.buffers.size) await this.loadSounds();
    this.enabled = !this.disposed;
  }

  async loadSounds() {
    const names = ["heartbeat", "charging", "charged", "shock", "operation", "alarm-medium", "alarm-high"];
    const decoded = await Promise.all(names.map(async name => {
      const response = await fetch(`/sim-monitor/audio/${name}.wav`);
      if (!response.ok) throw new Error(`音声を読み込めません: ${name}`);
      return [name, await this.context.decodeAudioData(await response.arrayBuffer())];
    }));
    this.buffers = new Map(decoded);
  }

  play(name) {
    if (!this.enabled || !this.context || !this.buffers.has(name)) return null;
    const source = this.context.createBufferSource();
    source.buffer = this.buffers.get(name);
    source.connect(this.context.destination);
    source.start();
    return source;
  }

  startLoop(name) {
    if (!this.enabled || !this.context || !this.buffers.has(name) || this.loopSources.has(name)) return;
    const source = this.context.createBufferSource();
    source.buffer = this.buffers.get(name);
    source.loop = true;
    source.connect(this.context.destination);
    source.start();
    this.loopSources.set(name, source);
  }

  stopLoop(name) {
    const source = this.loopSources.get(name);
    if (!source) return;
    try { source.stop(); } catch {}
    source.disconnect();
    this.loopSources.delete(name);
  }

  heartbeat() {
    this.play("heartbeat");
  }

  operation() {
    this.play("operation");
  }

  shock() {
    this.play("shock");
  }

  updateCharge(charging) {
    if (!this.enabled || !charging) {
      this.stopCharge();
      return;
    }
    this.startLoop("charging");
  }

  stopCharge() {
    this.stopLoop("charging");
  }

  setReady(active) {
    if (!this.enabled || !active) {
      this.stopLoop("charged");
      return;
    }
    this.startLoop("charged");
  }

  setAlarm(level) {
    if (!this.enabled || level === "normal") {
      this.stopLoop("alarm-medium");
      this.stopLoop("alarm-high");
      this.alarmLevel = "normal";
      return;
    }
    if (this.alarmLevel === level) return;
    this.stopLoop("alarm-medium");
    this.stopLoop("alarm-high");
    this.alarmLevel = level;
    this.startLoop(level === "high" ? "alarm-high" : "alarm-medium");
  }

  stopRepeatingSounds() {
    for (const name of [...this.loopSources.keys()]) this.stopLoop(name);
    this.alarmLevel = "normal";
  }

  close() {
    this.disposed = true;
    this.enabled = false;
    this.stopRepeatingSounds();
    void this.context?.close().catch(() => {});
  }
}
