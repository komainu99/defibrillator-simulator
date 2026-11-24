"use client";

import { useEffect, useRef } from "react";
import { mountDemo } from "../../features/simulator/demo.js";

export function DemoScreen() {
  const root = useRef(null);
  useEffect(() => mountDemo(root.current), []);
  return <div ref={root}><p role="status">デモを読み込んでいます…</p></div>;
}
