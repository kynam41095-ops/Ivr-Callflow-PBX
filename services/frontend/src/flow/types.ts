// Kiểu TS của tài liệu kịch bản, gõ tay theo $defs của
// contracts/flow-document.schema.json 1.1.0. Bộ kiểm thật vẫn là file schema
// (xem validate.ts) — file này chỉ là kiểu lúc biên dịch.

export type NodeId = string;

export type TimeRange = { from: string; to: string };
export type IntRange = { from: number; to: number };

export type ScheduleRule = {
  time: TimeRange;
  weekday?: IntRange;
  monthDay?: IntRange;
  month?: IntRange;
  year?: IntRange;
};

export type StartNode = {
  type: "start";
  label?: string;
  nextNodeId: NodeId;
  fallbackNodeId: NodeId;
};

export type PlayNode = {
  type: "play";
  label?: string;
  mediaId: string;
  nextNodeId: NodeId;
};

export type MenuNode = {
  type: "menu";
  label?: string;
  promptMediaId: string;
  choices: Record<string, NodeId>;
  timeoutSeconds: number;
  maxRetries?: number;
  onTimeoutNodeId: NodeId;
  onInvalidNodeId: NodeId;
};

export type QueueNode = {
  type: "queue";
  label?: string;
  queueRef: string;
};

export type HangupNode = {
  type: "hangup";
  label?: string;
};

export type ScheduleNode = {
  type: "schedule";
  label?: string;
  timezone: string;
  rules: ScheduleRule[];
  onOpenNodeId: NodeId;
  onClosedNodeId: NodeId;
};

export type FlowNode =
  | StartNode
  | PlayNode
  | MenuNode
  | QueueNode
  | HangupNode
  | ScheduleNode;

export type CanvasPosition = { x: number; y: number };

export type FlowCanvas = {
  positions: Record<NodeId, CanvasPosition>;
};

export type FlowDocument = {
  schemaVersion: "1.1.0";
  startNodeId: NodeId;
  nodes: Record<NodeId, FlowNode>;
  canvas?: FlowCanvas;
};
