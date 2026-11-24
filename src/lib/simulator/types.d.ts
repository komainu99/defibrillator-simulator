export type MonitorSnapshot = ReturnType<ReturnType<typeof import("./session.js").createMonitorSession>["snapshot"]>;

export type MonitorAction = {
  action: string;
  value?: unknown;
  operationId?: string;
};

export type MonitorClient = {
  update(snapshot: MonitorSnapshot): void;
  close(): void;
};

export type LeadStatus = Record<"red" | "yellow" | "green", boolean>;

export type TimelineEvent =
  | { id: string; kind: "shock"; joules: number }
  | { id: string; kind: string; duration: number; hr: number };

export type PicoMessage = {
  type?: unknown;
  position?: unknown;
  joules?: unknown;
  name?: unknown;
  rotary?: { position?: { position?: unknown; joules?: unknown } };
  leads?: Partial<LeadStatus>;
};

export type SerialPort = {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
};

export type SerialNavigator = Navigator & {
  serial?: { requestPort(): Promise<SerialPort> };
};
