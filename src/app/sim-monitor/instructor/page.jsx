import { networkInterfaces } from "node:os";
import { redirect } from "next/navigation";
import { createId, isRoomId } from "../../../lib/simulator/room-id.js";
import { SimulatorScreen } from "../../../features/simulator/simulator-screen.jsx";

export const metadata = { title: "インストラクター | SimMonitor" };

export default async function InstructorPage({ searchParams }) {
  const { room } = await searchParams;
  if (!isRoomId(room)) redirect(`/sim-monitor/instructor?room=${createId()}`);

  const addresses = [...new Set(Object.values(networkInterfaces()).flat()
    .filter(address => address.family === "IPv4" && !address.internal && !address.address.startsWith("169.254."))
    .map(address => address.address))];

  return <SimulatorScreen key={room} role="instructor" room={room} addresses={addresses} />;
}
