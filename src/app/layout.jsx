import "./globals.css";

export const metadata = {
  title: "SimMonitor",
  description: "除細動器シミュレーター"
};

export default function RootLayout({ children }) {
  return <html lang="ja"><body>{children}</body></html>;
}
