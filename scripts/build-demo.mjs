import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const destination = join(root, "out");
const marker = join(destination, ".simmonitor-demo");
const markerContent = "SimMonitor static demo\n";

const entries = await readdir(destination).catch(error => {
  if (error.code === "ENOENT") return [];
  throw error;
});
if (entries.length) {
  if (!entries.includes(".simmonitor-demo") || await readFile(marker, "utf8") !== markerContent) {
    throw new Error("out/ に別のファイルがあります。空のディレクトリでビルドしてください。");
  }
  await rm(destination, { recursive: true });
}

await mkdir(destination, { recursive: true });
await writeFile(marker, markerContent);

// The public artifact contains only browser code and styles. WAV provenance is pending.
const files = [
  ["demo/index.html", "index.html"],
  ["demo/index.html", "demo/index.html"],
  ["demo/demo-entry.js", "assets/demo-entry.js"],
  ["src/app/globals.css", "assets/demo.css"],
  ["src/features/simulator/demo.js", "assets/features/simulator/demo.js"],
  ["src/features/simulator/screen-runtime.js", "assets/features/simulator/screen-runtime.js"],
  ["src/features/simulator/ecg-canvas.js", "assets/features/simulator/ecg-canvas.js"],
  ["src/features/simulator/monitor-audio.js", "assets/features/simulator/monitor-audio.js"],
  ["src/lib/simulator/session.js", "assets/lib/simulator/session.js"]
];
for (const [source, target] of files) {
  const path = join(destination, target);
  await mkdir(dirname(path), { recursive: true });
  await copyFile(join(root, source), path);
}
console.log("Static demo generated in out/");
