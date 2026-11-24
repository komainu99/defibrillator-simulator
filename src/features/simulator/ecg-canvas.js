// Keep the ECG sweep and drawing state independent of the screen controls.
export function mountEcg({ app, getState, traceActive, leadsConnected, organizedHeartbeatActive, playHeartbeat }) {
  let state;
  let phase = 0;
  let lastFrameAt = performance.now();
  let frameId;
  const waveRuntime = new WeakMap();
  const visibleWaveSeconds = 6;
  const shockArtifactSeconds = 1.05;

  function resizeCanvas() {
    app.querySelectorAll("canvas").forEach(canvas => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * devicePixelRatio));
      canvas.height = Math.max(1, Math.floor(rect.height * devicePixelRatio));
      waveRuntime.delete(canvas);
    });
  }

  function gaussian(x, center, width, amplitude) {
    return amplitude * Math.exp(-Math.pow((x - center) / width, 2));
  }

  function pseudoNoise(seed) {
    return Math.sin(seed * 12.9898 + 78.233) * 43758.5453 % 1;
  }

  function traceNoise(seconds) {
    const slowDrift = 0.018 * Math.sin(seconds * Math.PI * 2 * 0.28 + 0.6);
    const mainsHum = 0.006 * Math.sin(seconds * Math.PI * 2 * 50);
    const muscleNoise =
      0.012 * pseudoNoise(Math.floor(seconds * 95)) +
      0.007 * pseudoNoise(Math.floor(seconds * 173) + 19);
    return slowDrift + mainsHum + muscleNoise;
  }

  function shockArtifactAt(seconds, shockLocalTime) {
    if (!Number.isFinite(shockLocalTime)) return 0;
    const t = seconds - shockLocalTime;
    if (t < 0 || t > shockArtifactSeconds) return 0;
    const decay = Math.exp(-t * 7.5);
    const initialSpike =
      gaussian(t, 0.018, 0.006, 2.8) -
      gaussian(t, 0.045, 0.012, 1.5);
    const downwardDeflection = -gaussian(t, 0.082, 0.014, 2.2);
    const recoveryTime = t - 0.082;
    const recoveryTail = recoveryTime > 0 ? -0.9 * Math.exp(-recoveryTime * 4.2) : 0;
    const ring =
      Math.sin(t * Math.PI * 2 * 18) * 0.55 * decay +
      Math.sin(t * Math.PI * 2 * 31 + 0.8) * 0.25 * decay;
    const baselineKick = 0.38 * Math.exp(-t * 3.2);
    const fadeProgress = Math.max(0, Math.min(1, (t - 0.72) / (shockArtifactSeconds - 0.72)));
    const smoothFade = 1 - fadeProgress * fadeProgress * (3 - 2 * fadeProgress);
    return (initialSpike + downwardDeflection + recoveryTail + ring + baselineKick) * smoothFade;
  }

  function postShockRecoveryScale(seconds, shockLocalTime) {
    if (!Number.isFinite(shockLocalTime)) return 1;
    const t = seconds - shockLocalTime;
    if (t < 0 || t > shockArtifactSeconds) return 1;
    if (t < 0.12) return 1;
    const recovery = (t - 0.12) / (shockArtifactSeconds - 0.12);
    return 0.08 + Math.min(1, recovery) * 0.92;
  }

  function rhythmValueAt(seconds, shockLocalTime = Number.NaN) {
    if (!traceActive()) return 0;
    const noise = traceNoise(seconds);
    if (!leadsConnected()) return noise * 0.18;
    const artifact = shockArtifactAt(seconds, shockLocalTime);
    const recoveryScale = postShockRecoveryScale(seconds, shockLocalTime);
    if (state.rhythm === "asystole") {
      return (0.004 * Math.sin(seconds * Math.PI * 2 * 0.35) + noise * 0.45) * recoveryScale + artifact;
    }
    if (state.rhythm === "vf") {
      const vf =
        0.32 * Math.sin(seconds * Math.PI * 2 * 6.1 + phase * 0.7) +
        0.18 * Math.sin(seconds * Math.PI * 2 * 9.4 + 1.7) +
        0.1 * Math.sin(seconds * Math.PI * 2 * 13.2 + phase * 0.4);
      return vf * recoveryScale + noise * (0.55 + recoveryScale * 0.8) + artifact;
    }

    if (["pulseless_vt", "monomorphic_vt", "ventricular_escape"].includes(state.rhythm)) {
      const hr = Math.max(20, Math.min(240, Number(state.vitals.hr) || 170));
      const rr = 60 / hr;
      const beat = ((seconds % rr) + rr) % rr;
      let y = gaussian(beat, rr * 0.28, rr * 0.12, 0.72);
      y -= gaussian(beat, rr * 0.48, rr * 0.15, 0.58);
      y += gaussian(beat, rr * 0.7, rr * 0.12, 0.22);
      return y * recoveryScale + noise * 0.6 + artifact;
    }

    if (["polymorphic_vt", "tdp"].includes(state.rhythm)) {
      const rate = Math.max(140, Math.min(260, Number(state.vitals.hr) || 200));
      const envelopeRate = state.rhythm === "tdp" ? 0.42 : 0.23;
      const envelope = 0.22 + 0.5 * Math.abs(Math.sin(seconds * Math.PI * 2 * envelopeRate));
      const twisting = Math.sin(seconds * Math.PI * 2 * rate / 60);
      const harmonic = 0.24 * Math.sin(seconds * Math.PI * 2 * rate / 30 + 0.8);
      return (twisting + harmonic) * envelope * recoveryScale + noise * 0.7 + artifact;
    }

    if (["psvt", "avnrt", "avrt", "atrial_tachycardia"].includes(state.rhythm)) {
      const hr = Math.max(120, Math.min(240, Number(state.vitals.hr) || 180));
      const rr = 60 / hr;
      const beat = ((seconds % rr) + rr) % rr;
      let y = 0.008 * Math.sin(seconds * Math.PI * 2 * 0.3);
      y += gaussian(beat, rr * 0.28, rr * 0.018, -0.12);
      y += gaussian(beat, rr * 0.32, rr * 0.012, 0.76);
      y += gaussian(beat, rr * 0.36, rr * 0.018, -0.2);
      y += gaussian(beat, rr * 0.64, rr * 0.08, 0.12);
      return y * recoveryScale + noise * 0.72 + artifact;
    }

    if (state.rhythm === "atrial_flutter") {
      const hr = Math.max(75, Math.min(200, Number(state.vitals.hr) || 150));
      const rr = 60 / hr;
      const beat = ((seconds % rr) + rr) % rr;
      const flutterPhase = ((seconds * 5) % 1 + 1) % 1;
      let y = (flutterPhase - 0.5) * 0.14;
      y += gaussian(beat, rr * 0.36, rr * 0.012, -0.14);
      y += gaussian(beat, rr * 0.39, rr * 0.009, 0.86);
      y += gaussian(beat, rr * 0.43, rr * 0.015, -0.24);
      return y * recoveryScale + noise * 0.55 + artifact;
    }

    if (state.rhythm === "atrial_fibrillation") {
      const hr = Math.max(60, Math.min(200, Number(state.vitals.hr) || 130));
      const phase = seconds * hr / 60 + 0.19 * Math.sin(seconds * 2.7) + 0.08 * Math.sin(seconds * 7.1);
      const beat = ((phase % 1) + 1) % 1;
      let y = 0.035 * Math.sin(seconds * Math.PI * 2 * 7.3) + 0.024 * Math.sin(seconds * Math.PI * 2 * 11.7);
      y += gaussian(beat, 0.34, 0.014, -0.14);
      y += gaussian(beat, 0.38, 0.009, 0.88);
      y += gaussian(beat, 0.42, 0.016, -0.25);
      return y * recoveryScale + noise * 0.75 + artifact;
    }

    const hr = Math.max(20, Math.min(220, Number(state.vitals.hr) || 72));
    const rr = 60 / hr;
    const beat = ((seconds % rr) + rr) % rr;
    const beatIndex = Math.floor(seconds / rr);

    if (state.rhythm === "complete_av_block") {
      const pBeat = ((seconds % 0.75) + 0.75) % 0.75;
      let y = gaussian(pBeat, 0.14, 0.025, 0.1);
      y += gaussian(beat, rr * 0.34, rr * 0.025, -0.12);
      y += gaussian(beat, rr * 0.39, rr * 0.018, 0.72);
      y += gaussian(beat, rr * 0.45, rr * 0.028, -0.2);
      return y * recoveryScale + noise + artifact;
    }

    const dropQrs =
      (state.rhythm === "sinus_arrest" && beatIndex % 4 === 3) ||
      (state.rhythm === "wenckebach" && beatIndex % 4 === 3) ||
      (["mobitz_2", "av_block_2_1"].includes(state.rhythm) && beatIndex % 2 === 1) ||
      (state.rhythm === "advanced_av_block" && beatIndex % 3 !== 0);
    if (state.rhythm === "sinus_arrest" && dropQrs) {
      return noise * 0.7 * recoveryScale + artifact;
    }

    const qrsCenter = state.rhythm === "av_block_1" ? 0.47 : 0.38;
    let y = 0.012 * Math.sin(seconds * Math.PI * 2 * 0.25);
    if (state.rhythm !== "junctional_escape") y += gaussian(beat, rr * 0.18, rr * 0.035, 0.11);
    if (!dropQrs) {
      y += gaussian(beat, rr * (qrsCenter - 0.025), rr * 0.012, -0.16);
      y += gaussian(beat, rr * qrsCenter, rr * 0.008, 0.92);
      y += gaussian(beat, rr * (qrsCenter + 0.025), rr * 0.014, -0.28);
      y += gaussian(beat, rr * 0.66, rr * 0.075, 0.24);
    }
    return y * recoveryScale + noise + artifact;
  }

  function wavePixelsPerSecond(w, scale) {
    return w / scale / visibleWaveSeconds;
  }

  function drawGrid(ctx, w, h, scale, pixelsPerSecond, clipX = 0, clipWidth = w) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(clipX, 0, clipWidth, h);
    ctx.clip();
    const minor = pixelsPerSecond * 0.04 * scale;
    const major = pixelsPerSecond * 0.2 * scale;
    ctx.strokeStyle = canvasColor(ctx.canvas, "--wave-grid", "#142326");
    ctx.lineWidth = 1 * scale;
    ctx.globalAlpha = 0.52;
    for (let x = 0; x < w; x += minor) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += minor) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let x = 0; x < w; x += major) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += major) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function restoreBand(ctx, w, h, scale, pixelsPerSecond, x, width) {
    if (width <= 0) return;
    if (x + width <= w) {
      ctx.fillStyle = canvasColor(ctx.canvas, "--wave-bg", "#050708");
      ctx.fillRect(x, 0, width, h);
      drawGrid(ctx, w, h, scale, pixelsPerSecond, x, width);
      return;
    }
    restoreBand(ctx, w, h, scale, pixelsPerSecond, x, w - x);
    restoreBand(ctx, w, h, scale, pixelsPerSecond, 0, x + width - w);
  }

  function waveYAtTime(seconds, h, shockLocalTime = Number.NaN) {
    return h * 0.5 - rhythmValueAt(seconds, shockLocalTime) * h * 0.32;
  }

  function resetWaveCanvas(canvas, ctx, w, h, scale) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = canvasColor(canvas, "--wave-bg", "#050708");
    ctx.fillRect(0, 0, w, h);
    drawGrid(ctx, w, h, scale, wavePixelsPerSecond(w, scale));
    return {
      sweepX: 0,
      sampleTime: 0,
      lastHeartbeatBeat: -1,
      lastY: waveYAtTime(0, h),
      lastShockAt: state?.lastShockAt,
      shockLocalTime: Number.NaN,
      width: w,
      height: h,
      powered: state?.powered,
      monitorStyle: state?.monitorStyle
    };
  }

  function canvasColor(canvas, variable, fallback) {
    const value = getComputedStyle(canvas).getPropertyValue(variable).trim();
    return value || fallback;
  }

  function drawSingleWave(canvas, deltaMs) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const scale = devicePixelRatio;

    let runtime = waveRuntime.get(canvas);
    const needsReset =
      !runtime ||
      runtime.width !== w ||
      runtime.height !== h ||
      runtime.powered !== state?.powered ||
      runtime.monitorStyle !== state?.monitorStyle;

    if (needsReset) {
      runtime = resetWaveCanvas(canvas, ctx, w, h, scale);
      waveRuntime.set(canvas, runtime);
    }

    if (state?.powered) {
      const pixelsPerSecond = wavePixelsPerSecond(w, scale);
      const speed = pixelsPerSecond * scale / 1000;
      const step = deltaMs * speed;
      const eraseWidth = Math.max(24 * scale, w * 0.0225);
      const previousX = runtime.sweepX;
      const nextX = (previousX + step) % w;

      if (state.lastShockAt && state.lastShockAt !== runtime.lastShockAt) {
        runtime.lastShockAt = state.lastShockAt;
        runtime.shockLocalTime = runtime.sampleTime;
      }

      restoreBand(ctx, w, h, scale, pixelsPerSecond, nextX, eraseWidth);

      ctx.strokeStyle =
        state.rhythm === "asystole"
          ? canvasColor(canvas, "--wave-asystole", "#6be7ff")
          : canvasColor(canvas, "--wave-ecg", "#20f071");
      ctx.lineWidth = 3 * scale;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 10 * scale;
      ctx.beginPath();

      if (nextX >= previousX) {
        ctx.moveTo(previousX, runtime.lastY);
        for (let px = previousX + scale; px <= nextX; px += scale) {
          const seconds = runtime.sampleTime + ((px - previousX) / scale) / pixelsPerSecond;
          ctx.lineTo(px, waveYAtTime(seconds, h, runtime.shockLocalTime));
        }
        ctx.lineTo(nextX, waveYAtTime(runtime.sampleTime + ((nextX - previousX) / scale) / pixelsPerSecond, h, runtime.shockLocalTime));
      } else {
        ctx.moveTo(previousX, runtime.lastY);
        for (let px = previousX + scale; px < w; px += scale) {
          const seconds = runtime.sampleTime + ((px - previousX) / scale) / pixelsPerSecond;
          ctx.lineTo(px, waveYAtTime(seconds, h, runtime.shockLocalTime));
        }
        const firstSegmentSeconds = ((w - previousX) / scale) / pixelsPerSecond;
        ctx.lineTo(w, waveYAtTime(runtime.sampleTime + firstSegmentSeconds, h, runtime.shockLocalTime));
        ctx.moveTo(0, waveYAtTime(runtime.sampleTime + firstSegmentSeconds, h, runtime.shockLocalTime));
        for (let px = scale; px <= nextX; px += scale) {
          const seconds = runtime.sampleTime + firstSegmentSeconds + (px / scale) / pixelsPerSecond;
          ctx.lineTo(px, waveYAtTime(seconds, h, runtime.shockLocalTime));
        }
        ctx.lineTo(nextX, waveYAtTime(runtime.sampleTime + firstSegmentSeconds + (nextX / scale) / pixelsPerSecond, h, runtime.shockLocalTime));
      }

      ctx.stroke();
      ctx.shadowBlur = 0;

      runtime.sweepX = nextX;
      runtime.sampleTime += (step / scale) / pixelsPerSecond;
      runtime.lastY = waveYAtTime(runtime.sampleTime, h, runtime.shockLocalTime);

      if (organizedHeartbeatActive()) {
        const rr = 60 / Math.max(20, Math.min(240, Number(state.vitals.hr)));
        const beat = Math.floor(runtime.sampleTime / rr);
        if (beat > runtime.lastHeartbeatBeat) {
          if (runtime.lastHeartbeatBeat >= 0) playHeartbeat();
          runtime.lastHeartbeatBeat = beat;
        }
      } else {
        runtime.lastHeartbeatBeat = -1;
      }
    }
  }

  function drawWave() {
    state = getState();
    const now = performance.now();
    const deltaMs = Math.min(64, now - lastFrameAt);
    lastFrameAt = now;
    const canvases = app.querySelectorAll("canvas");
    canvases.forEach(canvas => drawSingleWave(canvas, deltaMs));

    phase += deltaMs * 0.00085;
    frameId = requestAnimationFrame(drawWave);
  }

  window.addEventListener("resize", resizeCanvas);
  const resizeObserver = new ResizeObserver(resizeCanvas);
  resizeObserver.observe(app);
  frameId = requestAnimationFrame(drawWave);

  return {
    resize: resizeCanvas,
    reset: canvas => waveRuntime.delete(canvas),
    close() {
      window.removeEventListener("resize", resizeCanvas);
      resizeObserver.disconnect();
      cancelAnimationFrame(frameId);
    }
  };
}
