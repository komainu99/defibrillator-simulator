import { DemoScreen } from "./demo-screen.jsx";

export const metadata = { title: "ブラウザデモ | SimMonitor" };

export default function DemoPage() {
  return (
    <main className="demo-page">
      <a className="instructor-home-button" href="/">ホーム</a>
      <DemoScreen />
    </main>
  );
}
