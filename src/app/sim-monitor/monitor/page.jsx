import { isRoomId } from "../../../lib/simulator/room-id.js";
import { SimulatorScreen } from "../../../features/simulator/simulator-screen.jsx";

export const metadata = { title: "iPadモニター | SimMonitor" };

export default async function MonitorPage({ searchParams }) {
  const { room } = await searchParams;
  if (!isRoomId(room)) {
    return (
      <main className="launcher">
        <h1>iPadモニター</h1>
        <p>インストラクター画面で表示されたモニターURLを開いてください。</p>
        <a className="primary-link" href="/">接続IDを入力する</a>
      </main>
    );
  }
  return <SimulatorScreen key={room} role="monitor" room={room} />;
}
