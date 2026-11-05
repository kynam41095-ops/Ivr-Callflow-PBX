import { useCallback, useEffect, useRef, useState } from "react";
import {
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useStore,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./spike.css";

type SpikeNodeData = { label: string };
type SpikeNode = Node<SpikeNodeData, "spike">;

const initialNodes: SpikeNode[] = [
  {
    id: "start",
    type: "spike",
    position: { x: 0, y: 0 },
    data: { label: "start" },
  },
  {
    id: "play",
    type: "spike",
    position: { x: 300, y: 0 },
    data: { label: "play" },
  },
  {
    id: "hangup",
    type: "spike",
    position: { x: 600, y: 0 },
    data: { label: "hangup" },
  },
];

const initialEdges: Edge[] = [
  { id: "e-start-play", source: "start", target: "play" },
  { id: "e-play-hangup", source: "play", target: "hangup" },
];

function SpikeNodeView({ id, data }: NodeProps<SpikeNode>) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const measuredWidth = useStore(
    (state) => state.nodeLookup.get(id)?.measured.width,
  );

  useEffect(() => {
    const wrapper = bodyRef.current?.closest(".react-flow__node");
    if (wrapper && measuredWidth !== undefined) {
      wrapper.setAttribute("data-measured-width", String(measuredWidth));
    }
  }, [measuredWidth]);

  return (
    <div ref={bodyRef} className="spike-node">
      <Handle type="target" position={Position.Top} />
      {data.label}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = {
  spike: SpikeNodeView,
} satisfies NodeTypes;

export default function SpikePage() {
  const [nodes, setNodes] = useState<SpikeNode[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);

  const onNodesChange = useCallback((changes: NodeChange<SpikeNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((current) => addEdge(connection, current));
  }, []);

  return (
    <div className="spike-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        autoPanOnConnect={false}
      >
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
