import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Series,
  Sequence,
  Audio,
} from "remotion";

interface Lesson_e9cf6f38Props {
  title: string;
  description: string;
  keyPoints: string[];
  lessonNumber: number;
  audioUrl?: string | null;
}

// Graph node component
const GraphNode: React.FC<{
  x: number;
  y: number;
  label: string;
  color: string;
  scale?: number;
  opacity?: number;
  pulse?: boolean;
  frame: number;
  visited?: boolean;
  current?: boolean;
  distance?: string;
}> = ({ x, y, label, color, scale = 1, opacity = 1, pulse, frame, visited, current, distance }) => {
  const pulseScale = pulse
    ? 1 + 0.08 * Math.sin(frame * 0.15)
    : 1;
  const glowSize = current ? 15 + 5 * Math.sin(frame * 0.2) : 0;

  return (
    <g transform={`translate(${x}, ${y}) scale(${scale * pulseScale})`} opacity={opacity}>
      {current && (
        <circle
          cx={0}
          cy={0}
          r={32}
          fill="none"
          stroke="#FFD700"
          strokeWidth={3}
          opacity={0.6 + 0.4 * Math.sin(frame * 0.2)}
          filter={`drop-shadow(0 0 ${glowSize}px #FFD700)`}
        />
      )}
      <circle
        cx={0}
        cy={0}
        r={26}
        fill={visited ? "#4CAF50" : color}
        stroke={current ? "#FFD700" : "#fff"}
        strokeWidth={current ? 3 : 2}
        filter="drop-shadow(0 2px 4px rgba(0,0,0,0.3))"
      />
      <text
        x={0}
        y={5}
        textAnchor="middle"
        fill="#fff"
        fontSize={16}
        fontWeight="bold"
        fontFamily="Arial, sans-serif"
      >
        {label}
      </text>
      {distance !== undefined && (
        <text
          x={0}
          y={-36}
          textAnchor="middle"
          fill="#FFD700"
          fontSize={13}
          fontWeight="bold"
          fontFamily="Arial, sans-serif"
        >
          {distance}
        </text>
      )}
    </g>
  );
};

// Graph edge component
const GraphEdge: React.FC<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  weight: number;
  opacity?: number;
  highlighted?: boolean;
  frame: number;
  animProgress?: number;
}> = ({ x1, y1, x2, y2, weight, opacity = 1, highlighted, frame, animProgress = 1 }) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = dx / len;
  const ny = dy / len;
  const sx = x1 + nx * 28;
  const sy = y1 + ny * 28;
  const ex = x1 + (x2 - x1) * animProgress;
  const ey = y1 + (y2 - y1) * animProgress;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const pulseOpacity = highlighted ? 0.8 + 0.2 * Math.sin(frame * 0.15) : 1;

  return (
    <g opacity={opacity * pulseOpacity}>
      <line
        x1={sx}
        y1={sy}
        x2={ex}
        y2={ey}
        stroke={highlighted ? "#FFD700" : "#8899AA"}
        strokeWidth={highlighted ? 3.5 : 2}
        strokeLinecap="round"
      />
      {animProgress >= 0.5 && (
        <g>
          <rect
            x={mx - 14}
            y={my - 12}
            width={28}
            height={20}
            rx={5}
            fill={highlighted ? "#FFD700" : "#334455"}
            opacity={0.9}
          />
          <text
            x={mx}
            y={my + 4}
            textAnchor="middle"
            fill={highlighted ? "#000" : "#fff"}
            fontSize={12}
            fontWeight="bold"
            fontFamily="Arial, sans-serif"
          >
            {weight}
          </text>
        </g>
      )}
    </g>
  );
};

// Progress bar
const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 20,
        left: 60,
        right: 60,
        height: 6,
        backgroundColor: "rgba(255,255,255,0.15)",
        borderRadius: 3,
      }}
    >
      <div
        style={{
          width: `${progress * 100}%`,
          height: "100%",
          backgroundColor: "#4FC3F7",
          borderRadius: 3,
          transition: "width 0.3s",
          boxShadow: "0 0 10px rgba(79, 195, 247, 0.5)",
        }}
      />
    </div>
  );
};

// Animated text reveal
const AnimatedText: React.FC<{
  text: string;
  frame: number;
  startFrame: number;
  style?: React.CSSProperties;
}> = ({ text, frame, startFrame, style }) => {
  const opacity = interpolate(frame - startFrame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  const y = interpolate(frame - startFrame, [0, 20], [30, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        ...style,
      }}
    >
      {text}
    </div>
  );
};

// Floating particles background
const Particles: React.FC<{ frame: number; count?: number }> = ({ frame, count = 20 }) => {
  const particles = React.useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      x: (i * 137.5) % 100,
      y: (i * 97.3) % 100,
      size: 2 + (i % 4),
      speed: 0.2 + (i % 5) * 0.1,
      phase: i * 0.7,
    }));
  }, [count]);

  return (
    <>
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: `${(p.y + frame * p.speed * 0.3) % 110 - 5}%`,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            backgroundColor: `rgba(79, 195, 247, ${0.15 + 0.1 * Math.sin(frame * 0.05 + p.phase)})`,
          }}
        />
      ))}
    </>
  );
};

// ===== SCENE COMPONENTS =====

// Scene 1: Title / Intro
const TitleScene: React.FC<{ title: string; lessonNumber: number; description: string }> = ({
  title,
  lessonNumber,
  description,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSpring = spring({ frame, fps, config: { damping: 12, stiffness: 80 } });
  const lessonBadgeSpring = spring({ frame: frame - 10, fps, config: { damping: 15, stiffness: 100 } });
  const descOpacity = interpolate(frame, [40, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const descY = interpolate(frame, [40, 70], [40, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const lineWidth = interpolate(frame, [80, 120], [0, 400], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Animated graph preview in background
  const graphOpacity = interpolate(frame, [60, 100], [0, 0.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #0D1117 0%, #161B22 40%, #1A2332 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Particles frame={frame} count={30} />

      {/* Background graph */}
      <div style={{ position: "absolute", width: "100%", height: "100%", opacity: graphOpacity }}>
        <svg width="100%" height="100%" viewBox="0 0 1920 1080">
          <GraphEdge x1={200} y1={300} x2={500} y2={200} weight={4} frame={frame} animProgress={1} />
          <GraphEdge x1={500} y1={200} x2={800} y2={350} weight={2} frame={frame} animProgress={1} />
          <GraphEdge x1={200} y1={300} x2={450} y2={550} weight={7} frame={frame} animProgress={1} />
          <GraphEdge x1={1200} y1={400} x2={1500} y2={300} weight={3} frame={frame} animProgress={1} />
          <GraphEdge x1={1500} y1={300} x2={1700} y2={500} weight={5} frame={frame} animProgress={1} />
          <GraphNode x={200} y={300} label="A" color="#3F51B5" frame={frame} />
          <GraphNode x={500} y={200} label="B" color="#3F51B5" frame={frame} />
          <GraphNode x={800} y={350} label="C" color="#3F51B5" frame={frame} />
          <GraphNode x={450} y={550} label="D" color="#3F51B5" frame={frame} />
          <GraphNode x={1200} y={400} label="E" color="#3F51B5" frame={frame} />
          <GraphNode x={1500} y={300} label="F" color="#3F51B5" frame={frame} />
          <GraphNode x={1700} y={500} label="G" color="#3F51B5" frame={frame} />
        </svg>
      </div>

      {/* Lesson badge */}
      <div
        style={{
          transform: `scale(${lessonBadgeSpring})`,
          backgroundColor: "#4FC3F7",
          color: "#0D1117",
          padding: "8px 24px",
          borderRadius: 20,
          fontSize: 18,
          fontWeight: "bold",
          fontFamily: "Arial, sans-serif",
          marginBottom: 30,
          letterSpacing: 2,
        }}
      >
        LESSON {lessonNumber}
      </div>

      {/* Title */}
      <div
        style={{
          transform: `scale(${titleSpring})`,
          fontSize: 64,
          fontWeight: "bold",
          color: "#FFFFFF",
          fontFamily: "Arial, sans-serif",
          textAlign: "center",
          maxWidth: 1200,
          lineHeight: 1.2,
          textShadow: "0 4px 20px rgba(79,195,247,0.3)",
        }}
      >
        {title}
      </div>

      {/* Decorative line */}
      <div
        style={{
          width: lineWidth,
          height: 3,
          background: "linear-gradient(90deg, transparent, #4FC3F7, transparent)",
          margin: "25px 0",
          borderRadius: 2,
        }}
      />

      {/* Description */}
      <div
        style={{
          opacity: descOpacity,
          transform: `translateY(${descY}px)`,
          fontSize: 24,
          color: "#B0BEC5",
          fontFamily: "Arial, sans-serif",
          textAlign: "center",
          maxWidth: 900,
          lineHeight: 1.6,
          padding: "0 40px",
        }}
      >
        {description}
      </div>

      <ProgressBar progress={0} />
    </AbsoluteFill>
  );
};

// Scene 2: Key Point 1 - Graphs are made of nodes connected by weighted edges
const GraphBasicsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const nodes = [
    { x: 400, y: 300, label: "A" },
    { x: 700, y: 180, label: "B" },
    { x: 1000, y: 300, label: "C" },
    { x: 550, y: 520, label: "D" },
    { x: 850, y: 520, label: "E" },
    { x: 1200, y: 500, label: "F" },
  ];

  const edges = [
    { from: 0, to: 1, weight: 4, appearAt: 60 },
    { from: 1, to: 2, weight: 2, appearAt: 90 },
    { from: 0, to: 3, weight: 7, appearAt: 120 },
    { from: 1, to: 4, weight: 3, appearAt: 150 },
    { from: 2, to: 5, weight: 5, appearAt: 180 },
    { from: 3, to: 4, weight: 1, appearAt: 210 },
    { from: 4, to: 5, weight: 6, appearAt: 240 },
    { from: 2, to: 4, weight: 8, appearAt: 270 },
  ];

  const headerSpring = spring({ frame, fps, config: { damping: 12 } });

  // Staggered node appearance
  const nodeAppearances = nodes.map((_, i) =>
    spring({ frame: frame - 30 - i * 15, fps, config: { damping: 14, stiffness: 90 } })
  );

  // Labels for explanation
  const showNodeLabel = frame > 40;
  const showEdgeLabel = frame > 160;
  const showWeightLabel = frame > 280;

  const nodeLabelOpacity = interpolate(frame, [40, 65], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const edgeLabelOpacity = interpolate(frame, [160, 185], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const weightLabelOpacity = interpolate(frame, [280, 305], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Highlight pulse for concept
  const conceptPhase = Math.floor(frame / 180) % 3;

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #0D1117 0%, #1A1F2E 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <Particles frame={frame} count={15} />

      {/* Header */}
      <div
        style={{
          transform: `translateY(${(1 - headerSpring) * -50}px)`,
          opacity: headerSpring,
          fontSize: 42,
          fontWeight: "bold",
          color: "#4FC3F7",
          fontFamily: "Arial, sans-serif",
          marginTop: 50,
          textAlign: "center",
          textShadow: "0 2px 10px rgba(79,195,247,0.3)",
        }}
      >
        Key Concept #1
      </div>

      <div
        style={{
          fontSize: 28,
          color: "#E0E0E0",
          fontFamily: "Arial, sans-serif",
          marginTop: 10,
          textAlign: "center",
          opacity: interpolate(frame, [15, 35], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          maxWidth: 800,
        }}
      >
        Graphs are made of nodes connected by weighted edges
      </div>

      {/* Graph SVG */}
      <div style={{ position: "absolute", top: 160, width: "100%", height: "70%" }}>
        <svg width="100%" height="100%" viewBox="0 0 1600 700">
          {/* Edges */}
          {edges.map((edge, i) => {
            const progress = interpolate(frame - edge.appearAt, [0, 30], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            if (progress <= 0) return null;
            return (
              <GraphEdge
                key={`edge-${i}`}
                x1={nodes[edge.from].x}
                y1={nodes[edge.from].y}
                x2={nodes[edge.to].x}
                y2={nodes[edge.to].y}
                weight={edge.weight}
                frame={frame}
                animProgress={progress}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node, i) => (
            <GraphNode
              key={`node-${i}`}
              x={node.x}
              y={node.y}
              label={node.label}
              color="#3F51B5"
              scale={nodeAppearances[i]}
              opacity={nodeAppearances[i]}
              frame={frame}
              pulse={conceptPhase === 0 && frame > 300}
            />
          ))}
        </svg>
      </div>

      {/* Concept labels */}
      {showNodeLabel && (
        <div
          style={{
            position: "absolute",
            left: 80,
            bottom: 200,
            opacity: nodeLabelOpacity,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              backgroundColor: "#3F51B5",
              border: "2px solid #fff",
            }}
          />
          <span
            style={{
              color: "#E0E0E0",
              fontSize: 22,
              fontFamily: "Arial, sans-serif",
              fontWeight: "bold",
            }}
          >
            Nodes (vertices)
          </span>
        </div>
      )}

      {showEdgeLabel && (
        <div
          style={{
            position: "absolute",
            left: 80,
            bottom: 150,
            opacity: edgeLabelOpacity,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 40,
              height: 3,
              backgroundColor: "#8899AA",
              borderRadius: 2,
            }}
          />
          <span
            style={{
              color: "#E0E0E0",
              fontSize: 22,
              fontFamily: "Arial, sans-serif",
              fontWeight: "bold",
            }}
          >
            Edges (connections)
          </span>
        </div>
      )}

      {showWeightLabel && (
        <div
          style={{
            position: "absolute",
            left: 80,
            bottom: 100,
            opacity: weightLabelOpacity,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              backgroundColor: "#334455",
              padding: "2px 8px",
              borderRadius: 4,
              color: "#fff",
              fontSize: 14,
              fontFamily: "Arial, sans-serif",
              fontWeight: "bold",
            }}
          >
            5
          </div>
          <span
            style={{
              color: "#E0E0E0",
              fontSize: 22,
              fontFamily: "Arial, sans-serif",
              fontWeight: "bold",
            }}
          >
            Weights (costs / distances)
          </span>
        </div>
      )}

      <ProgressBar progress={0.15} />
    </AbsoluteFill>
  );
};

// Scene 3: Algorithm Overview - Dijkstra picks closest unvisited node
const GreedySelectionScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const nodes = [
    { x: 300, y: 350, label: "S" },
    { x: 550, y: 200, label: "A" },
    { x: 550, y: 500, label: "B" },
    { x: 800, y: 350, label: "C" },
    { x: 1050, y: 200, label: "D" },
    { x: 1050, y: 500, label: "E" },
    { x: 1300, y: 350, label: "T" },
  ];

  const edges = [
    { from: 0, to: 1, weight: 2 },
    { from: 0, to: 2, weight: 5 },
    { from: 1, to: 3, weight: 3 },
    { from: 2, to: 3, weight: 1 },
    { from: 1, to: 4, weight: 7 },
    { from: 3, to: 5, weight: 4 },
    { from: 3, to: 4, weight: 2 },
    { from: 4, to: 6, weight: 1 },
    { from: 5, to: 6, weight: 3 },
  ];

  // Animation: step through visiting nodes
  // Steps: visit S(0), then A(dist=2), then C(dist=5), then D(dist=7), then T(dist=8), then B(dist=5), then E(dist=9)
  const steps = [
    { visitNode: 0, currentNode: 0, startFrame: 80, distances: ["0", "∞", "∞", "∞", "∞", "∞", "∞"] },
    { visitNode: 1, currentNode: 1, startFrame: 250, distances: ["0", "2", "5", "∞", "∞", "∞", "∞"] },
    { visitNode: 3, currentNode: 3, startFrame: 420, distances: ["0", "2", "5", "5", "∞", "∞", "∞"] },
    { visitNode: 2, currentNode: 2, startFrame: 590, distances: ["0", "2", "5", "5", "7", "9", "∞"] },
    { visitNode: 4, currentNode: 4, startFrame: 760, distances: ["0", "2", "5", "5", "7", "9", "∞"] },
    { visitNode: 6, currentNode: 6, startFrame: 930, distances: ["0", "2", "5", "5", "7", "9", "8"] },
  ];

  // Determine current step
  let currentStepIdx = -1;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (frame >= steps[i].startFrame) {
      currentStepIdx = i;
      break;
    }
  }

  const visitedNodes = new Set<number>();
  let currentNode = -1;
  let distances = ["∞", "∞", "∞", "∞", "∞", "∞", "∞"];

  if (currentStepIdx >= 0) {
    for (let i = 0; i <= currentStepIdx; i++) {
      visitedNodes.add(steps[i].visitNode);
    }
    currentNode = steps[currentStepIdx].currentNode;
    distances = steps[currentStepIdx].distances;
  }

  // Highlight edges for current shortest path
  const highlightedEdges = new Set<number>();
  if (currentStepIdx >= 1) highlightedEdges.add(0); // S->A
  if (currentStepIdx >= 2) highlightedEdges.add(2); // A->C
  if (currentStepIdx >= 4) highlightedEdges.add(6); // C->D
  if (currentStepIdx >= 5) highlightedEdges.add(7); // D->T

  const headerSpring = spring({ frame, fps, config: { damping: 12 } });

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #0D1117 0%, #1A1F2E 100%)",
      }}
    >
      <Particles frame={frame} count={12} />

      {/* Header */}
      <div
        style={{
          position: "absolute",
          top: 30,
          width: "100%",
          textAlign: "center",
          transform: `translateY(${(1 - headerSpring) * -40}px)`,
          opacity: headerSpring,
        }}
      >
        <div
          style={{
            fontSize: 38,
            fontWeight: "bold",
            color: "#4FC3F7",
            fontFamily: "Arial, sans-serif",
            textShadow: "0 2px 10px rgba(79,195,247,0.3)",
          }}
        >
          Key Concept #2
        </div>
        <div
          style={{
            fontSize: 24,
            color: "#E0E0E0",
            fontFamily: "Arial, sans-serif",
            marginTop: 8,
          }}
        >
          Dijkstra always picks the closest unvisited node
        </div>
      </div>

      {/* Greedy badge */}
      {frame > 40 && (
        <div
          style={{
            position: "absolute",
            top: 120,
            right: 60,
            backgroundColor: "rgba(255,152,0,0.15)",
            border: "2px solid #FF9800",
            borderRadius: 12,
            padding: "8px 20px",
            opacity: interpolate(frame, [40, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          <span
            style={{
              color: "#FF9800",
              fontSize: 18,
              fontWeight: "bold",
              fontFamily: "Arial, sans-serif",
            }}
          >
            🏆 Greedy Strategy
          </span>
        </div>
      )}

      {/* Graph */}
      <div style={{ position: "absolute", top: 130, width: "100%", height: "65%" }}>
        <svg width="100%" height="100%" viewBox="0 0 1600 700">
          {edges.map((edge, i) => (
            <GraphEdge
              key={`e-${i}`}
              x1={nodes[edge.from].x}
              y1={nodes[edge.from].y}
              x2={nodes[edge.to].x}
              y2={nodes[edge.to].y}
              weight={edge.weight}
              frame={frame}
              highlighted={highlightedEdges.has(i)}
              animProgress={1}
            />
          ))}
          {nodes.map((node, i) => (
            <GraphNode
              key={`n-${i}`}
              x={node.x}
              y={node.y}
              label={node.label}
              color={i === 0 ? "#E91E63" : i === 6 ? "#9C27B0" : "#3F51B5"}
              frame={frame}
              visited={visitedNodes.has(i)}
              current={currentNode === i}
              distance={frame > 80 ? distances[i] : undefined}
              pulse={currentNode === i}
            />
          ))}
        </svg>
      </div>

      {/* Step indicator */}
      {currentStepIdx >= 0 && (
        <div
          style={{
            position: "absolute",
            bottom: 70,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 20,
            alignItems: "center",
          }}
        >
          {steps.map((step, i) => {
            const active = i <= currentStepIdx;
            const isCurrent = i === currentStepIdx;
            return (
              <div
                key={i}
                style={{
                  width: isCurrent ? 44 : 36,
                  height: isCurrent ? 44 : 36,
                  borderRadius: "50%",
                  backgroundColor: active ? "#4CAF50" : "rgba(255,255,255,0.1)",
                  border: isCurrent ? "3px solid #FFD700" : "2px solid rgba(255,255,255,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: active ? "#fff" : "#666",
                  fontSize: 14,
                  fontWeight: "bold",
                  fontFamily: "Arial, sans-serif",
                  transition: "all 0.3s",
                  boxShadow: isCurrent ? "0 0 15px rgba(255,215,0,0.4)" : "none",
                }}
              >
                {nodes[step.visitNode].label}
              </div>
            );
          })}
        </div>
      )}

      <ProgressBar progress={0.35} />
    </AbsoluteFill>
  );
};