"use client";

import { useEffect, useRef, useState } from "react";
import { monitorApiUrl, sendMonitorAction } from "../../lib/simulator/client.js";
import { ConnectionPanel } from "./connection-panel.jsx";
import { mountSimulator } from "./screen-runtime.js";

export function SimulatorScreen({ role, room, addresses = [] }) {
  const host = useRef(null);
  const [connection, setConnection] = useState("connecting");
  const [error, setError] = useState("");

  useEffect(() => {
    const isMonitor = role === "monitor";
    document.body.classList.toggle("monitor-display", isMonitor);
    const simulator = mountSimulator({
      app: host.current, role, onError: setError,
      sendAction: role === "instructor" ? (action, value) => sendMonitorAction(room, action, value) : undefined
    });
    const events = new EventSource(monitorApiUrl("events", room));
    events.onmessage = event => {
      try {
        simulator.update(JSON.parse(event.data));
        setConnection("connected");
      } catch {
        setError("モニターの状態を表示できませんでした。演習画面を再読み込みしてください。");
      }
    };
    events.onerror = () => setConnection(events.readyState === EventSource.CLOSED ? "closed" : "retrying");

    return () => {
      events.close();
      simulator.close();
      document.body.classList.remove("monitor-display");
    };
  }, [role, room]);

  const connectionMessages = {
    connecting: "演習に接続中…",
    connected: "演習に接続済み",
    retrying: "通信が切れました。再接続中…",
    closed: "接続できませんでした。演習URLを確認してページを再読み込みしてください。"
  };
  return (
    <>
      <div role="status" className={`connection-banner${["retrying", "closed"].includes(connection) ? " disconnected" : ""}`}>
        {connectionMessages[connection]}
      </div>
      {role === "instructor" && <ConnectionPanel room={room} addresses={addresses} />}
      {error && <div className="connection-banner disconnected" role="alert">
        {error} <button type="button" onClick={() => setError("")}>閉じる</button>
      </div>}
      <main id="app" ref={host} />
    </>
  );
}
