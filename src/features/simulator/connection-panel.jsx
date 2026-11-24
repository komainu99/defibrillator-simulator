"use client";

import { useEffect, useRef, useState } from "react";
import { readPico } from "./pico-serial.js";

const initialSerial = { state: "idle", message: "Picoは未接続です。" };

function connectionDetails(room, addresses) {
  const monitor = new URL("/sim-monitor/monitor", location.origin);
  monitor.searchParams.set("room", room);
  const isLoopback = ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(monitor.hostname);
  const links = isLoopback && addresses.length ? addresses.map(address => {
    const url = new URL(monitor);
    url.hostname = address;
    return url.href;
  }) : [monitor.href];
  const python = /Win/i.test(navigator.platform) ? ".\\.venv\\Scripts\\python.exe" : ".venv/bin/python";
  return {
    links,
    loopbackOnly: isLoopback && !addresses.length,
    serialSupported: "serial" in navigator,
    command: `${python} hardware/pico_bridge.py --url ${location.origin} --room ${room}`
  };
}

export function ConnectionPanel({ room, addresses }) {
  const [details, setDetails] = useState(null);
  const [serial, setSerial] = useState(initialSerial);
  const [copyMessage, setCopyMessage] = useState("");
  const controllerRef = useRef(null);

  useEffect(() => {
    setDetails(connectionDetails(room, addresses));
    return () => controllerRef.current?.abort();
  }, [room, addresses]);

  async function copy(text, label) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const field = document.createElement("textarea");
        field.value = text;
        field.style.cssText = "position:fixed;opacity:0";
        document.body.append(field);
        try {
          field.select();
          if (!document.execCommand("copy")) throw new Error("Copy failed");
        } finally {
          field.remove();
        }
      }
      setCopyMessage(`${label}をコピーしました。`);
    } catch {
      setCopyMessage("コピーできませんでした。表示された文字列を選択してください。");
    }
  }

  async function connect() {
    if (controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setSerial({ state: "connecting", message: "Picoへ接続中…" });
    try {
      await readPico({
        room,
        signal: controller.signal,
        onConnected: () => setSerial({ state: "connected", message: "Pico接続済み" }),
        onSendError: message => setSerial({ state: "connected", message })
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        setSerial(error.name === "NotFoundError"
          ? { state: "idle", message: "Picoの選択がキャンセルされました。" }
          : { state: "error", message: error.message });
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        if (controller.signal.aborted) setSerial(initialSerial);
      }
    }
  }

  return (
    <section className="pairing-panel" aria-label="機器の接続">
      <h2>iPadモニター</h2>
      <p>PCと同じネットワークのiPadで、次のURLを開いてください。</p>
      {details?.links.map(link => (
        <div key={link} className="connection-controls monitor-link">
          <a href={link} target="_blank" rel="noreferrer">{link}</a>
          <button type="button" onClick={() => copy(link, "モニターURL")}>コピー</button>
        </div>
      ))}
      {details?.loopbackOnly && <p>PCのLANアドレスが見つかりません。ネットワークを確認してください。</p>}
      <p>接続ID <code>{room}</code></p>
      <section className="monitor-bridge-panel" aria-labelledby="pico-title">
        <h3 id="pico-title">Raspberry Pi Pico</h3>
        <p>Picoを接続していない場合も、Scenarioから演習を開始できます。</p>
        {details && !details.serialSupported && <p>このブラウザーではWeb Serialを利用できません。Pythonブリッジを使用できます。</p>}
        {details?.serialSupported && (
          <div className="pico-serial-controls">
            <span className="pico-serial-status" data-state={serial.state} role="status">{serial.message}</span>
            <button id="picoSerialConnect" type="button" disabled={["connecting", "connected"].includes(serial.state)} onClick={connect}>Picoを接続</button>
            <button type="button" disabled={serial.state !== "connected"} onClick={() => controllerRef.current?.abort()}>切断</button>
          </div>
        )}
        {details && (
          <details className="bridge-fallback" open={!details.serialSupported}>
            <summary>Pythonブリッジ</summary>
            <p>PicoをUSB接続し、READMEの手順でPythonの仮想環境を作成してから実行します。</p>
            <div className="bridge-command-row">
              <pre>{details.command}</pre>
              <button type="button" onClick={() => copy(details.command, "コマンド")}>コピー</button>
            </div>
          </details>
        )}
      </section>
      {copyMessage && <p role="status">{copyMessage}</p>}
    </section>
  );
}
