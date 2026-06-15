import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Series,
  Audio,
} from "remotion";

interface Lesson_dadf8175Props {
  title: string;
  description: string;
  keyPoints: string[];
  lessonNumber: number;
  audioUrl?: string | null;
}

const GraphNode: React.FC<{
  x: number;
  y: number;
  label: string;
  color: string;
  scale?: number;
  opacity?: number;
  pulse?: boolean;
  frame?: number;
}> = ({ x, y, label, color, scale = 1, opacity = 1, pulse = false, frame = 0 }) => {
  const pulseScale = pulse ? 1 + 0.08 * Math.sin(frame * 0.15) : 1;
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale * pulseScale})`} opacity={opacity}>
      <circle r="30" fill={color} stroke="#fff" strokeWidth="3" />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontSize="18"
        fontWeight="bold"
        fontFamily="monospace"
      >
        {label}
      </text>
    </g>
  );
};

const GraphEdge: React.FC<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  weight: number;
  color?: string;
  opacity?: number;
  strokeWidth?: number;
  progress?: number;
}> = ({ x1, y1, x2, y2, weight, color = "#888", opacity = 1, strokeWidth = 3, progress = 1 }) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const offsetX = (dx / len) * 30;
  const offsetY = (dy / len) * 30;
  const sx = x1 + offsetX;
  const sy = y1 + offsetY;
  const ex = x1 + offsetX + (x2 - x1 - 2 * offsetX) * progress;
  const ey = y1 + offsetY + (y2 - y1 - 2 * offsetY) * progress;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const perpX = -dy / len * 15;
  const perpY = dx / len * 15;

  return (
    <g opacity={opacity}>
      <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      {progress > 0.5 && (
        <g>
          <rect x={mx + perpX - 14} y={my + perpY - 12} width="28" height="24" rx="6" fill="#222" stroke={color} strokeWidth="2" />
          <text x={mx + perpX} y={my + perpY + 2} textAnchor="middle" dominantBaseline="central" fill="#FFD700" fontSize="14" fontWeight="bold" fontFamily="monospace">
            {weight}
          </text>
        </g>
      )}
    </g>
  );
};

// --- INTRO SECTION ---
const IntroSection: React.FC<{ title: string; lessonNumber: number; description: string }> = ({
  title,
  lessonNumber,
  description,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSpring = spring({ frame, fps, from: 0, to: 1, config: { damping: 12, stiffness: 80 } });
  const descFade = interpolate(frame, [40, 80], [0, 1], { extrapolateRight: "clamp" });
  const descSlide = interpolate(frame, [40, 80], [40, 0], { extrapolateRight: "clamp" });
  const lessonBadgeScale = spring({ frame: frame - 10, fps, from: 0, to: 1, config: { damping: 8, stiffness: 100 } });
  const bgRotate = interpolate(frame, [0, 600], [0, 360]);
  const progressWidth = interpolate(frame, [0, 500], [0, 100], { extrapolateRight: "clamp" });

  // Animated background circles
  const circles = Array.from({ length: 8 }).map((_, i) => {
    const angle = (i / 8) * Math.PI * 2 + bgRotate * (Math.PI / 180) * 0.3;
    const radius = 300 + 50 * Math.sin(frame * 0.02 + i);
    const cx = 960 + Math.cos(angle) * radius;
    const cy = 540 + Math.sin(angle) * radius;
    const opacity = 0.08 + 0.04 * Math.sin(frame * 0.05 + i);
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: cx - 60,
          top: cy - 60,
          width: 120,
          height: 120,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(0,200,255,${opacity}), transparent)`,
        }}
      />
    );
  });

  return (
    <AbsoluteFill style={{ background: "linear-gradient(135deg, #0a0a2e 0%, #1a1a4e 50%, #0a0a2e 100%)" }}>
      {circles}
      <div
        style={{
          position: "absolute",
          top: 80,
          left: "50%",
          transform: `translateX(-50%) scale(${lessonBadgeScale})`,
          background: "linear-gradient(135deg, #FFD700, #FFA500)",
          borderRadius: 20,
          padding: "10px 30px",
          color: "#1a1a2e",
          fontFamily: "monospace",
          fontWeight: "bold",
          fontSize: 24,
        }}
      >
        LESSON {lessonNumber}
      </div>
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: `translate(-50%, -50%) scale(${titleSpring})`,
          textAlign: "center",
          width: "80%",
        }}
      >
        <h1
          style={{
            color: "#fff",
            fontSize: 72,
            fontFamily: "sans-serif",
            fontWeight: 900,
            textShadow: "0 0 40px rgba(0,200,255,0.5)",
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {title}
        </h1>
        <p
          style={{
            color: "#aac",
            fontSize: 28,
            fontFamily: "sans-serif",
            marginTop: 40,
            opacity: descFade,
            transform: `translateY(${descSlide}px)`,
            lineHeight: 1.6,
          }}
        >
          {description}
        </p>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 60,
          left: "50%",
          transform: "translateX(-50%)",
          width: 400,
          height: 6,
          background: "#333",
          borderRadius: 3,
        }}
      >
        <div
          style={{
            width: `${progressWidth}%`,
            height: "100%",
            background: "linear-gradient(90deg, #00c8ff, #FFD700)",
            borderRadius: 3,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

// --- KEY POINT 1: Graphs are made of nodes connected by weighted edges ---
const GraphBasicsSection: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const nodes = [
    { x: 300, y: 300, label: "A" },
    { x: 600, y: 180, label: "B" },
    { x: 900, y: 300, label: "C" },
    { x: 600, y: 500, label: "D" },
    { x: 1100, y: 500, label: "E" },
  ];

  const edges = [
    { from: 0, to: 1, weight: 4 },
    { from: 0, to: 3, weight: 2 },
    { from: 1, to: 2, weight: 3 },
    { from: 1, to: 3, weight: 1 },
    { from: 2, to: 4, weight: 5 },
    { from: 3, to: 4, weight: 7 },
  ];

  const titleFade = interpolate(frame, [0, 40], [0, 1], { extrapolateRight: "clamp" });
  const titleSlide = interpolate(frame, [0, 40], [-50, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg, #0d1b2a 0%, #1b2838 100%)" }}>
      <div
        style={{
          position: "absolute",
          top: 40,
          left: "50%",
          transform: `translateX(-50%) translateY(${titleSlide}px)`,
          opacity: titleFade,
          color: "#FFD700",
          fontSize: 42,
          fontWeight: "bold",
          fontFamily: "sans-serif",
          textAlign: "center",
          width: "80%",
        }}
      >
        Graphs: Nodes + Weighted Edges
      </div>

      <svg
        width="1920"
        height="1080"
        style={{ position: "absolute", top: 0, left: 0 }}
        viewBox="0 0 1400 700"
      >
        {edges.map((edge, i) => {
          const delay = 60 + i * 40;
          const progress = interpolate(frame, [delay, delay + 60], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <GraphEdge
              key={i}
              x1={nodes[edge.from].x}
              y1={nodes[edge.from].y}
              x2={nodes[edge.to].x}
              y2={nodes[edge.to].y}
              weight={edge.weight}
              color="#4488ff"
              opacity={progress}
              progress={progress}
            />
          );
        })}
        {nodes.map((node, i) => {
          const nodeSpring = spring({
            frame: frame - 20 - i * 15,
            fps,
            from: 0,
            to: 1,
            config: { damping: 10, stiffness: 100 },
          });
          return (
            <GraphNode
              key={i}
              x={node.x}
              y={node.y}
              label={node.label}
              color="#2266cc"
              scale={nodeSpring}
              opacity={nodeSpring}
              frame={frame}
            />
          );
        })}
      </svg>

      {/* Explanation text appearing at bottom */}
      {frame > 200 && (
        <div
          style={{
            position: "absolute",
            bottom: 60,
            left: "50%",
            transform: "translateX(-50%)",
            opacity: interpolate(frame, [200, 250], [0, 1], { extrapolateRight: "clamp" }),
            color: "#ddd",
            fontSize: 28,
            fontFamily: "sans-serif",
            textAlign: "center",
            background: "rgba(0,0,0,0.6)",
            padding: "20px 40px",
            borderRadius: 16,
            maxWidth: "80%",
          }}
        >
          Each <span style={{ color: "#4488ff", fontWeight: "bold" }}>node</span> represents a location.
          Each <span style={{ color: "#FFD700", fontWeight: "bold" }}>edge weight</span> represents the cost to travel between nodes.
        </div>
      )}

      {/* Highlight nodes and edges labels */}
      {frame > 350 && (
        <div
          style={{
            position: "absolute",
            top: 120,
            right: 80,
            opacity: interpolate(frame, [350, 400], [0, 1], { extrapolateRight: "clamp" }),
            transform: `translateX(${interpolate(frame, [350, 400], [30, 0], { extrapolateRight: "clamp" })}px)`,
            color: "#aaffaa",
            fontSize: 24,
            fontFamily: "monospace",
            background: "rgba(0,0,0,0.7)",
            padding: "15px 25px",
            borderRadius: 12,
            border: "1px solid #4488ff",
          }}
        >
          5 nodes, 6 edges
        </div>
      )}
    </AbsoluteFill>
  );
};

// --- KEY POINT 2: Dijkstra always picks closest unvisited node ---
const GreedySelectionSection: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const nodes = [
    { x: 200, y: 350, label: "S" },
    { x: 450, y: 200, label: "A" },
    { x: 450, y: 500, label: "B" },
    { x: 700, y: 350, label: "C" },
    { x: 950, y: 200, label: "D" },
    { x: 950, y: 500, label: "E" },
  ];

  const edges = [
    { from: 0, to: 1, weight: 2 },
    { from: 0, to: 2, weight: 5 },
    { from: 1, to: 3, weight: 3 },
    { from: 2, to: 3, weight: 1 },
    { from: 3, to: 4, weight: 4 },
    { from: 3, to: 5, weight: 6 },
  ];

  // Simulation: visit order S(0) -> A(2) -> C(5) -> B(5) -> D(9) -> E(11)
  const visitOrder = [0, 1, 3, 2, 4, 5];
  const visitDistances = [0, 2, 5, 5, 9, 11];
  const visitLabels = ["S:0", "A:2", "C:5", "B:5", "D:9", "E:11"];

  const stepDuration = 250;
  const currentStep = Math.min(Math.floor(frame / stepDuration), visitOrder.length - 1);

  const titleFade = interpolate(frame, [0, 40], [0, 1], { extrapolateRight: "clamp" });

  const getNodeColor = (index: number) => {
    const visitIdx = visitOrder.indexOf(index);
    if (visitIdx <= currentStep && visitIdx >= 0) {
      if (visitIdx === currentStep) return "#FFD700";
      return "#22cc44";
    }
    return "#555";
  };

  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg, #1a0a2e 0%, #2a1a3e 100%)" }}>
      <div
        style={{
          position: "absolute",
          top: 30,
          left: "50%",
          transform: "translateX(-50%)",
          opacity: titleFade,
          color: "#FFD700",
          fontSize: 38,
          fontWeight: "bold",
          fontFamily: "sans-serif",
          textAlign: "center",
        }}
      >
        Greedy Selection: Always Pick Closest Unvisited
      </div>

      <svg
        width="1920"
        height="1080"
        style={{ position: "absolute", top: 0, left: 0 }}
        viewBox="0 0 1200 700"
      >
        {edges.map((edge, i) => {
          const fromVisited = visitOrder.indexOf(edge.from) <= currentStep && visitOrder.indexOf(edge.from) >= 0;
          const toVisited = visitOrder.indexOf(edge.to) <= currentStep && visitOrder.indexOf(edge.to) >= 0;
          const highlighted = fromVisited && toVisited;
          return (
            <GraphEdge
              key={i}
              x1={nodes[edge.from].x}
              y1={nodes[edge.from].y}
              x2={nodes[edge.to].x}
              y2={nodes[edge.to].y}
              weight={edge.weight}
              color={highlighted ? "#22cc44" : "#555"}
              strokeWidth={highlighted ? 4 : 2}
              opacity={0.9}
              progress={1}
            />
          );
        })}
        {nodes.map((node, i) => {
          const isCurrentStep = visitOrder[currentStep] === i;
          return (
            <GraphNode
              key={i}
              x={node.x}
              y={node.y}
              label={node.label}
              color={getNodeColor(i)}
              scale={1}
              pulse={isCurrentStep}
              frame={frame}
            />
          );
        })}
        {/* Distance labels on nodes */}
        {nodes.map((node, i) => {
          const visitIdx = visitOrder.indexOf(i);
          if (visitIdx >= 0 && visitIdx <= currentStep) {
            return (
              <text
                key={`dist-${i}`}
                x={node.x}
                y={node.y - 45}
                textAnchor="middle"
                fill="#FFD700"
                fontSize="16"
                fontWeight="bold"
                fontFamily="monospace"
              >
                d={visitDistances[visitIdx]}
              </text>
            );
          }
          return null;
        })}
      </svg>

      {/* Step tracker at the bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 40,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: 20,
          alignItems: "center",
        }}
      >
        {visitLabels.map((label, i) => {
          const active = i <= currentStep;
          const isCurrent = i === currentStep;
          const stepSpring = spring({
            frame: frame - i * stepDuration,
            fps,
            from: 0,
            to: 1,
            config: { damping: 12, stiffness: 100 },
          });
          return (
            <div
              key={i}
              style={{
                padding: "10px 20px",
                borderRadius: 12,
                background: isCurrent
                  ? "linear-gradient(135deg, #FFD700, #FFA500)"
                  : active
                  ? "#22cc44"
                  : "#333",
                color: isCurrent || active ? "#000" : "#888",
                fontFamily: "monospace",
                fontWeight: "bold",
                fontSize: 20,
                transform: `scale(${active ? stepSpring : 0.8})`,
                opacity: active ? 1 : 0.4,
                border: isCurrent ? "3px solid #fff" : "2px solid transparent",
              }}
            >
              {label}
            </div>
          );
        })}
      </div>

      {/* "Current node" indicator */}
      <div
        style={{
          position: "absolute",
          top: 100,
          left: 60,
          background: "rgba(0,0,0,0.7)",
          padding: "15px 25px",
          borderRadius: 12,
          border: "2px solid #FFD700",
          color: "#FFD700",
          fontFamily: "monospace",
          fontSize: 22,
        }}
      >
        Step {currentStep + 1}: Visiting{" "}
        <span style={{ fontWeight: "bold", fontSize: 28 }}>
          {nodes[visitOrder[currentStep]].label}
        </span>
      </div>
    </AbsoluteFill>
  );
};

// --- KEY POINT 3: Edge Relaxation ---
const EdgeRelaxationSection: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleFade = interpolate(frame, [0, 40], [0, 1], { extrapolateRight: "clamp" });

  // We show a simple scenario: Node A (dist=2) relaxes edge to C (weight=3)
  // Old dist to C = infinity, new dist = 2+3=5
  const phase = frame < 400 ? 0 : frame < 800 ? 1 : frame < 1200 ? 2 : 3;

  const nodeAx = 300;
  const nodeAy = 400;
  const nodeCx = 800;
  const nodeCy = 400;
  const nodeBx = 550;
  const nodeBy = 200;

  const arrowProgress = interpolate(frame, [100, 250], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Relaxation animation
  const relaxGlow = frame > 400 ? 0.5 + 0.5 * Math.sin(frame * 0.1) : 0;
  const oldDistFade = interpolate(frame, [400, 500], [1, 0.3], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const newDistFade = interpolate(frame, [500, 600], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Second example: through B
  const phase2Arrow = interpolate(frame, [800, 950], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const betterPathGlow = frame > 1200 ? 0.5 + 0.5 * Math.sin(frame * 0.12) : 0;

  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg, #0a1628 0%, #162040 100%)" }}>
      <div
        style={{
          position: "absolute",
          top: 30,
          left: "50%",
          transform: "translateX(-50%)",
          opacity: titleFade,
          color: "#ff6644",
          fontSize: 42,
          fontWeight: "bold",
          fontFamily: "sans-serif",
          textAlign: "center",
        }}
      >
        Edge Relaxation
      </div>

      <svg
        width="1920"
        height="1080"
        style={{ position: "absolute", top: 0, left: 0 }}
        viewBox="0 0 1100 650"
      >
        {/* Edge A -> C */}
        <GraphEdge
          x1={nodeAx}
          y1={nodeAy}
          x2={nodeCx}
          y2={nodeCy}
          weight={3}
          color={phase >= 1 ? `rgba(255,${Math.floor(100 + relaxGlow * 155)},0,1)` : "#4488ff"}
          strokeWidth={phase >= 1 ? 5 : 3}
          progress={arrowProgress}
        />
        {/* Edge A -> B */}
        {frame > 800 && (
          <GraphEdge
            x1={nodeAx}
            y1={nodeAy}
            x2={nodeBx}
            y2={nodeBy}
            weight={1}
            color="#44ddaa"
            strokeWidth={3}
            progress={phase2Arrow}
          />
        )}
        {/* Edge B -> C */}
        {frame > 900 && (
          <GraphEdge
            x1={nodeBx}
            y1={nodeBy}
            x2={nodeCx}
            y2={nodeCy}
            weight={1}
            color="#44ddaa"
            strokeWidth={3}
            progress={interpolate(frame, [900, 1050], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
          />
        )}

        {/* Node A */}
        <GraphNode x={nodeAx} y={nodeAy} label="A" color="#22cc44" frame={frame} />
        <text x={nodeAx} y={nodeAy - 50} textAnchor="middle" fill="#22cc44" fontSize="20" fontFamily="monospace" fontWeight="bold">
          dist = 2
        </text>

        {/* Node C */}
        <GraphNode x={nodeCx} y={nodeCy} label="C" color={phase >= 1 ? "#FFD700" : "#555"} pulse={phase >= 1} frame={frame} />
        {/* Distance label for C */}
        <text x={nodeCx} y={nodeCy - 50} textAnchor="middle" fill={phase >= 2 ? "#44ddaa" : "#ff6644"} fontSize="20" fontFamily="monospace" fontWeight="bold" opacity={phase >= 1 ? 1 : 0.5}>
          {phase === 0 ? "dist = ∞" : phase === 1 ? "dist = ∞ → 5" : phase >= 2 ? "dist = 5 → 4" : "dist = 5"}
        </text>

        {/* Node B */}
        {frame > 800 && (
          <>
            <GraphNode
              x={nodeBx}
              y={nodeBy}
              label="B"
              color="#44ddaa"
              scale={spring({ frame: frame - 800, fps, from: 0, to: 1, config: { damping: 10, stiffness: 80 } })}
              frame={frame}
            />
            <text x={nodeBx} y={nodeBy - 50} textAnchor="middle" fill="#44ddaa" fontSize="20" fontFamily="monospace" fontWeight="bold">
              dist = 3
            </text>
          </>
        )}
      </svg>

      {/* Explanation boxes */}
      {frame > 250 && frame < 800 && (
        <div
          style={{
            position: "absolute",
            bottom: 100,
            left: "50%",
            transform: "translateX(-50%)",
            opacity: interpolate(frame, [250, 320], [0, 1], { extrapolateRight: "clamp" }),
            background: "rgba(0,0,0,0.8)",
            padding: "20px 40px",
            borderRadius: 16,
            border: "2px solid #ff6644",
            color: "#fff",
            fontSize: 26,
            fontFamily: "sans-serif",
            textAlign: "center",
            maxWidth: "70%",
          }}
        >
          <strong style={{ color: "#ff6644" }}>Relaxation:</strong> If dist[A] + weight(A→C) {"<"} dist[C],
          <br />
          then update dist[C] = 2 + 3 = <strong style={{ color: "#FFD700" }}>5</strong>
        </div>
      )}

      {frame >= 1050 && (
        <div
          style={{
            position: "absolute",
            bottom: 100,
            left: "50%",
            transform: "translateX(-50%)",
            opacity: interpolate(frame, [1050, 1120], [0, 1], { extrapolateRight: "clamp" }),
            background: "rgba(0,0,0,0.8)",
            padding: "20px 40px",
            borderRadius: 16,
            border: "2px solid #44ddaa",
            color: "#fff",
            fontSize: 26,
            fontFamily: "sans-serif",
            textAlign: "center",
            maxWidth: "70%",
          }}
        >
          Found a <strong style={{ color: "#44ddaa" }}>better path</strong> through B!
          <br />
          dist[B] + weight(B→C) = 3 + 1 = <strong style={{ color: "#FFD700" }}>4 {"<"} 5</strong> → Update!
        </div>
      )}

      {/* Formula floating */}
      <div
        style={{
          position: "absolute",
          top: 100,
          right: 80,
          opacity: interpolate(frame, [60, 120], [0, 1], { extrapolateRight: "clamp" }),
          transform: `translateY(${interpolate(frame, [60, 120], [20, 0], { extrapolateRight: "clamp" })}px)`,
          background: "rgba(255,255,255,0.05)",
          padding: "15px 25px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.2)",
          color: "#ccc",
          fontFamily: "monospace",
          fontSize: 20,
        }}
      >
        if dist[u] + w(u,v) {"<"} dist[v]:
        <br />
        &nbsp;&nbsp;dist[v] = dist[u] + w(u,v)
      </div>
    </AbsoluteFill>
  );
};

// --- KEY POINT 4: Priority Queue ---
const PriorityQueueSection: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleFade = interpolate(frame, [0, 40], [0, 1], { extrapolateRight: "clamp" });

  // Priority queue entries simulated
  const allEntries = [
    { node: "S", dist: 0, color: "#22cc44" },
    { node: "A", dist: 2, color: "#4488ff" },
    { node: "B", dist: 5, color: "#4488ff" },
    { node: "C", dist: 5, color: "#4488ff" },
    { node: "D", dist: 9, color: "#4488ff" },
    { node: "E", dist: 11, color: "#4488ff" },
  ];

  const visibleCount = Math.min(