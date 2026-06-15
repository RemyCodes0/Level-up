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

interface Lesson_757b5682Props {
  title: string;
  description: string;
  keyPoints: string[];
  lessonNumber: number;
  audioUrl?: string | null;
}

// Helper: Graph Node component
const GraphNode: React.FC<{
  x: number;
  y: number;
  label: string;
  color: string;
  scale?: number;
  opacity?: number;
  pulse?: boolean;
  frame: number;
  fps: number;
}> = ({ x, y, label, color, scale = 1, opacity = 1, pulse, frame, fps }) => {
  const pulseScale = pulse
    ? 1 + 0.08 * Math.sin((frame / fps) * Math.PI * 2)
    : 1;
  return (
    <div
      style={{
        position: "absolute",
        left: x - 30 * scale,
        top: y - 30 * scale,
        width: 60 * scale,
        height: 60 * scale,
        borderRadius: "50%",
        background: color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: "bold",
        fontSize: 20 * scale,
        fontFamily: "monospace",
        boxShadow: `0 0 ${pulse ? 20 : 8}px ${color}`,
        opacity,
        transform: `scale(${pulseScale})`,
        transition: "all 0.3s",
        border: "3px solid rgba(255,255,255,0.3)",
      }}
    >
      {label}
    </div>
  );
};

// Helper: Edge component
const GraphEdge: React.FC<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  weight: number;
  color?: string;
  opacity?: number;
  progress?: number;
  showWeight?: boolean;
}> = ({
  x1,
  y1,
  x2,
  y2,
  weight,
  color = "#667",
  opacity = 1,
  progress = 1,
  showWeight = true,
}) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: x1,
          top: y1,
          width: len * progress,
          height: 3,
          background: color,
          opacity,
          transformOrigin: "0 0",
          transform: `rotate(${angle}rad)`,
        }}
      />
      {showWeight && progress > 0.5 && (
        <div
          style={{
            position: "absolute",
            left: mx - 15,
            top: my - 15,
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.7)",
            color: "#ffd700",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: "bold",
            fontFamily: "monospace",
            opacity: opacity * progress,
            border: "2px solid #ffd700",
          }}
        >
          {weight}
        </div>
      )}
    </>
  );
};

// Scene 1: Title & Introduction
const TitleScene: React.FC<{ title: string; lessonNumber: number; description: string }> = ({
  title,
  lessonNumber,
  description,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSpring = spring({ frame, fps, config: { damping: 12, stiffness: 80 } });
  const descFade = interpolate(frame, [40, 80], [0, 1], { extrapolateRight: "clamp" });
  const descSlide = interpolate(frame, [40, 80], [40, 0], { extrapolateRight: "clamp" });
  const lessonBadgeScale = spring({ frame: frame - 10, fps, config: { damping: 10 } });
  const bgPulse = 0.5 + 0.5 * Math.sin(frame / 60);

  // Animated background particles
  const particles = Array.from({ length: 20 }, (_, i) => ({
    x: (i * 97 + frame * (0.3 + i * 0.05)) % 1920,
    y: (i * 137 + frame * (0.2 + i * 0.03)) % 1080,
    size: 3 + (i % 5) * 2,
    opacity: 0.1 + (i % 3) * 0.05,
  }));

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 50%, hsl(220, 60%, ${12 + bgPulse * 5}%) 0%, hsl(240, 50%, 8%) 100%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: "#4fc3f7",
            opacity: p.opacity,
          }}
        />
      ))}

      <div
        style={{
          transform: `scale(${lessonBadgeScale})`,
          background: "linear-gradient(135deg, #ff6b6b, #ee5a24)",
          padding: "10px 30px",
          borderRadius: 30,
          color: "#fff",
          fontSize: 22,
          fontWeight: "bold",
          fontFamily: "sans-serif",
          marginBottom: 30,
          boxShadow: "0 4px 20px rgba(238,90,36,0.4)",
        }}
      >
        LESSON {lessonNumber}
      </div>

      <div
        style={{
          transform: `scale(${titleSpring})`,
          fontSize: 72,
          fontWeight: "bold",
          color: "#fff",
          textAlign: "center",
          fontFamily: "sans-serif",
          maxWidth: 1400,
          lineHeight: 1.2,
          textShadow: "0 4px 30px rgba(79,195,247,0.5)",
        }}
      >
        {title}
      </div>

      <div
        style={{
          opacity: descFade,
          transform: `translateY(${descSlide}px)`,
          fontSize: 28,
          color: "#b0bec5",
          textAlign: "center",
          maxWidth: 1000,
          marginTop: 40,
          fontFamily: "sans-serif",
          lineHeight: 1.6,
        }}
      >
        {description}
      </div>

      {/* Decorative lines */}
      <div
        style={{
          position: "absolute",
          bottom: 80,
          width: interpolate(frame, [0, 120], [0, 600], { extrapolateRight: "clamp" }),
          height: 3,
          background: "linear-gradient(90deg, transparent, #4fc3f7, transparent)",
        }}
      />
    </AbsoluteFill>
  );
};

// Scene 2: Graph Basics - Nodes and Weighted Edges
const GraphBasicsScene: React.FC<{ keyPoint: string }> = ({ keyPoint }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const nodes = [
    { x: 400, y: 300, label: "A", delay: 0 },
    { x: 700, y: 150, label: "B", delay: 15 },
    { x: 1000, y: 300, label: "C", delay: 30 },
    { x: 700, y: 500, label: "D", delay: 45 },
    { x: 1300, y: 400, label: "E", delay: 60 },
    { x: 1500, y: 200, label: "F", delay: 75 },
  ];

  const edges = [
    { from: 0, to: 1, w: 4, delay: 90 },
    { from: 1, to: 2, w: 2, delay: 110 },
    { from: 0, to: 3, w: 7, delay: 130 },
    { from: 1, to: 3, w: 1, delay: 150 },
    { from: 2, to: 4, w: 3, delay: 170 },
    { from: 3, to: 4, w: 5, delay: 190 },
    { from: 2, to: 5, w: 6, delay: 210 },
    { from: 4, to: 5, w: 2, delay: 230 },
  ];

  const textFade = interpolate(frame, [0, 40], [0, 1], { extrapolateRight: "clamp" });
  const textSlide = interpolate(frame, [0, 40], [-30, 0], { extrapolateRight: "clamp" });

  const conceptFade = interpolate(frame, [300, 360], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(180deg, #0d1117 0%, #161b22 100%)",
      }}
    >
      {/* Title */}
      <div
        style={{
          position: "absolute",
          top: 40,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: textFade,
          transform: `translateY(${textSlide}px)`,
        }}
      >
        <div
          style={{
            fontSize: 42,
            fontWeight: "bold",
            color: "#4fc3f7",
            fontFamily: "sans-serif",
          }}
        >
          Weighted Graphs
        </div>
      </div>

      {/* Key point banner */}
      <div
        style={{
          position: "absolute",
          bottom: 60,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          opacity: conceptFade,
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, rgba(79,195,247,0.15), rgba(79,195,247,0.05))",
            border: "2px solid rgba(79,195,247,0.3)",
            borderRadius: 16,
            padding: "20px 50px",
            maxWidth: 1000,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "#4fc3f7",
              fontFamily: "sans-serif",
              letterSpacing: 3,
              marginBottom: 8,
              fontWeight: "bold",
            }}
          >
            KEY CONCEPT
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#e0e0e0",
              fontFamily: "sans-serif",
              fontWeight: 500,
            }}
          >
            {keyPoint}
          </div>
        </div>
      </div>

      {/* Edges */}
      {edges.map((edge, i) => {
        const prog = interpolate(frame, [edge.delay, edge.delay + 30], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <GraphEdge
            key={`e${i}`}
            x1={nodes[edge.from].x}
            y1={nodes[edge.from].y}
            x2={nodes[edge.to].x}
            y2={nodes[edge.to].y}
            weight={edge.w}
            color="#4a5568"
            progress={prog}
            opacity={prog}
          />
        );
      })}

      {/* Nodes */}
      {nodes.map((node, i) => {
        const s = spring({ frame: frame - node.delay, fps, config: { damping: 12 } });
        return (
          <GraphNode
            key={`n${i}`}
            x={node.x}
            y={node.y}
            label={node.label}
            color="#2196f3"
            scale={s}
            opacity={s}
            frame={frame}
            fps={fps}
          />
        );
      })}

      {/* Labels for "Node" and "Edge" with arrows */}
      {frame > 250 && (
        <>
          <div
            style={{
              position: "absolute",
              left: 200,
              top: 240,
              opacity: interpolate(frame, [250, 290], [0, 1], { extrapolateRight: "clamp" }),
              transform: `translateX(${interpolate(frame, [250, 290], [-20, 0], { extrapolateRight: "clamp" })}px)`,
            }}
          >
            <div
              style={{
                color: "#81c784",
                fontSize: 22,
                fontFamily: "sans-serif",
                fontWeight: "bold",
              }}
            >
              ← Node
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              left: 500,
              top: 180,
              opacity: interpolate(frame, [270, 310], [0, 1], { extrapolateRight: "clamp" }),
            }}
          >
            <div
              style={{
                color: "#ffd700",
                fontSize: 22,
                fontFamily: "sans-serif",
                fontWeight: "bold",
              }}
            >
              ↑ Weighted Edge
            </div>
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};

// Scene 3: Dijkstra's Greedy Choice - Always picks closest unvisited
const GreedyChoiceScene: React.FC<{ keyPoint: string }> = ({ keyPoint }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Simplified graph for demonstration
  const nodes = [
    { x: 300, y: 400, label: "S", visited: false },
    { x: 600, y: 200, label: "A", visited: false },
    { x: 600, y: 600, label: "B", visited: false },
    { x: 950, y: 200, label: "C", visited: false },
    { x: 950, y: 600, label: "D", visited: false },
    { x: 1300, y: 400, label: "T", visited: false },
  ];

  const edges = [
    { from: 0, to: 1, w: 2 },
    { from: 0, to: 2, w: 5 },
    { from: 1, to: 2, w: 1 },
    { from: 1, to: 3, w: 4 },
    { from: 2, to: 4, w: 3 },
    { from: 3, to: 5, w: 2 },
    { from: 4, to: 5, w: 6 },
  ];

  // Steps of the algorithm
  const steps = [
    { visited: [0], current: 0, distances: [0, Infinity, Infinity, Infinity, Infinity, Infinity], label: "Start at S (dist=0)" },
    { visited: [0, 1], current: 1, distances: [0, 2, 5, Infinity, Infinity, Infinity], label: "Visit A (dist=2) — closest!" },
    { visited: [0, 1, 2], current: 2, distances: [0, 2, 3, 6, Infinity, Infinity], label: "Visit B (dist=3) — closest!" },
    { visited: [0, 1, 2, 3], current: 3, distances: [0, 2, 3, 6, 6, Infinity], label: "Visit C (dist=6) — closest!" },
    { visited: [0, 1, 2, 3, 4], current: 4, distances: [0, 2, 3, 6, 6, 8], label: "Visit D (dist=6) — closest!" },
    { visited: [0, 1, 2, 3, 4, 5], current: 5, distances: [0, 2, 3, 6, 6, 8], label: "Visit T (dist=8) — Done!" },
  ];

  const stepDuration = 200;
  const stepIndex = Math.min(Math.floor(frame / stepDuration), steps.length - 1);
  const step = steps[stepIndex];
  const stepProgress = (frame % stepDuration) / stepDuration;

  const titleFade = interpolate(frame, [0, 40], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(180deg, #0a0e14 0%, #1a1f2e 100%)",
      }}
    >
      {/* Title */}
      <div
        style={{
          position: "absolute",
          top: 30,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: titleFade,
        }}
      >
        <div style={{ fontSize: 40, fontWeight: "bold", color: "#ff9800", fontFamily: "sans-serif" }}>
          Greedy Choice Property
        </div>
        <div style={{ fontSize: 22, color: "#aaa", fontFamily: "sans-serif", marginTop: 8 }}>
          {keyPoint}
        </div>
      </div>

      {/* Step label */}
      <div
        style={{
          position: "absolute",
          top: 120,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            background: "rgba(255,152,0,0.15)",
            border: "2px solid rgba(255,152,0,0.4)",
            borderRadius: 12,
            padding: "12px 30px",
            fontSize: 24,
            color: "#ffcc80",
            fontFamily: "monospace",
            fontWeight: "bold",
          }}
        >
          Step {stepIndex + 1}: {step.label}
        </div>
      </div>

      {/* Edges */}
      {edges.map((edge, i) => {
        const isOnPath =
          step.visited.includes(edge.from) && step.visited.includes(edge.to);
        return (
          <GraphEdge
            key={`e${i}`}
            x1={nodes[edge.from].x}
            y1={nodes[edge.from].y}
            x2={nodes[edge.to].x}
            y2={nodes[edge.to].y}
            weight={edge.w}
            color={isOnPath ? "#ff9800" : "#3a3f4b"}
            opacity={isOnPath ? 1 : 0.5}
          />
        );
      })}

      {/* Nodes */}
      {nodes.map((node, i) => {
        const isVisited = step.visited.includes(i);
        const isCurrent = step.current === i;
        const nodeScale = spring({
          frame: frame - (step.visited.indexOf(i) >= 0 ? step.visited.indexOf(i) * stepDuration : frame + 100),
          fps,
          config: { damping: 12 },
        });

        let color = "#37474f";
        if (isCurrent) color = "#ff9800";
        else if (isVisited) color = "#4caf50";

        return (
          <React.Fragment key={`n${i}`}>
            <GraphNode
              x={node.x}
              y={node.y}
              label={node.label}
              color={color}
              scale={isVisited ? 1.1 : 0.9}
              opacity={1}
              pulse={isCurrent}
              frame={frame}
              fps={fps}
            />
            {/* Distance label */}
            <div
              style={{
                position: "absolute",
                left: node.x - 25,
                top: node.y + 38,
                width: 50,
                textAlign: "center",
                fontSize: 18,
                fontFamily: "monospace",
                color: isVisited ? "#fff" : "#666",
                fontWeight: "bold",
              }}
            >
              {step.distances[i] === Infinity ? "∞" : step.distances[i]}
            </div>
          </React.Fragment>
        );
      })}

      {/* Progress bar for steps */}
      <div
        style={{
          position: "absolute",
          bottom: 40,
          left: 200,
          right: 200,
          height: 8,
          background: "#1a1f2e",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${((stepIndex + stepProgress) / steps.length) * 100}%`,
            height: "100%",
            background: "linear-gradient(90deg, #ff9800, #ff5722)",
            borderRadius: 4,
            transition: "width 0.1s",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

// Scene 4: Edge Relaxation
const EdgeRelaxationScene: React.FC<{ keyPoint: string }> = ({ keyPoint }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const phases = [
    { frame: 0, title: "What is Edge Relaxation?", desc: "When we find a shorter path to a node, we update its distance." },
    { frame: 200, title: "Example", desc: "" },
  ];

  const titleFade = interpolate(frame, [0, 40], [0, 1], { extrapolateRight: "clamp" });

  // Relaxation demo
  const nodeA = { x: 400, y: 450, label: "A" };
  const nodeB = { x: 800, y: 250, label: "B" };
  const nodeC = { x: 1200, y: 450, label: "C" };

  const phase1 = frame >= 100;
  const phase2 = frame >= 400;
  const phase3 = frame >= 700;

  const distBOld = 10;
  const distAtoB = 3;
  const distA = 2;
  const distBNew = distA + distAtoB; // 5

  const relaxationHappened = phase3;
  const relaxPulse = relaxationHappened
    ? 1 + 0.1 * Math.sin((frame - 700) / 10)
    : 1;

  // Animated arrow for relaxation
  const arrowProgress = phase2
    ? interpolate(frame, [400, 500], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 0;

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(180deg, #0d0d1a 0%, #1a1a2e 100%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 30,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: titleFade,
        }}
      >
        <div style={{ fontSize: 40, fontWeight: "bold", color: "#e91e63", fontFamily: "sans-serif" }}>
          Edge Relaxation
        </div>
        <div style={{ fontSize: 22, color: "#aaa", fontFamily: "sans-serif", marginTop: 8 }}>
          {keyPoint}
        </div>
      </div>

      {/* Concept explanation */}
      {frame >= 50 && frame < 200 && (
        <div
          style={{
            position: "absolute",
            top: 200,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            opacity: interpolate(frame, [50, 90], [0, 1], { extrapolateRight: "clamp" }),
          }}
        >
          <div
            style={{
              maxWidth: 1000,
              fontSize: 32,
              color: "#e0e0e0",
              fontFamily: "sans-serif",
              textAlign: "center",
              lineHeight: 1.6,
            }}
          >
            If <span style={{ color: "#4fc3f7" }}>dist[A] + weight(A→B)</span>{" "}
            {"<"} <span style={{ color: "#ff5252" }}>dist[B]</span>,<br />
            then update{" "}
            <span style={{ color: "#69f0ae" }}>dist[B] = dist[A] + weight(A→B)</span>
          </div>
        </div>
      )}

      {/* Demo graph */}
      {phase1 && (
        <>
          <GraphEdge
            x1={nodeA.x}
            y1={nodeA.y}
            x2={nodeB.x}
            y2={nodeB.y}
            weight={distAtoB}
            color={phase2 ? "#e91e63" : "#555"}
            progress={interpolate(frame, [150, 200], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
          />
          <GraphEdge
            x1={nodeB.x}
            y1={nodeB.y}
            x2={nodeC.x}
            y2={nodeC.y}
            weight={4}
            color="#555"
            progress={interpolate(frame, [180, 230], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
          />

          <GraphNode
            x={nodeA.x}
            y={nodeA.y}
            label={nodeA.label}
            color="#4caf50"
            scale={spring({ frame: frame - 120, fps, config: { damping: 12 } })}
            frame={frame}
            fps={fps}
            pulse={phase2 && !phase3}
          />

          {/* Distance label for A */}
          <div
            style={{
              position: "absolute",
              left: nodeA.x - 40,
              top: nodeA.y + 45,
              width: 80,
              textAlign: "center",
              fontSize: 22,
              fontFamily: "monospace",
              color: "#4caf50",
              fontWeight: "bold",
              opacity: interpolate(frame, [130, 160], [0, 1], { extrapolateRight: "clamp" }),
            }}
          >
            d={distA}
          </div>

          <GraphNode
            x={nodeB.x}
            y={nodeB.y}
            label={nodeB.label}
            color={relaxationHappened ? "#69f0ae" : "#ff5252"}
            scale={relaxPulse * spring({ frame: frame - 140, fps, config: { damping: 12 } })}
            frame={frame}
            fps={fps}
            pulse={relaxationHappened}
          />

          {/* Distance label for B - animated change */}
          <div
            style={{
              position: "absolute",
              left: nodeB.x - 50,
              top: nodeB.y + 45,
              width: 100,
              textAlign: "center",
              fontSize: 22,
              fontFamily: "monospace",
              color: relaxationHappened ? "#69f0ae" : "#ff5252",
              fontWeight: "bold",
              opacity: interpolate(frame, [150, 180], [0, 1], { extrapolateRight: "clamp" }),
            }}
          >
            {relaxationHappened ? (
              <>
                <span style={{ textDecoration: "line-through", color: "#ff5252", marginRight: 8 }}>
                  d={distBOld}
                </span>
                <span style={{ color: "#69f0ae" }}>d={distBNew}</span>
              </>
            ) : (
              `d=${distBOld}`
            )}
          </div>

          <GraphNode
            x={nodeC.x}
            y={nodeC.y}
            label={nodeC.label}
            color="#37474f"
            scale={spring({ frame: frame - 160, fps, config: { damping: 12 } })}
            frame={frame}
            fps={fps}
          />
        </>
      )}

      {/* Relaxation check formula */}
      {phase2 && (
        <div
          style={{
            position: "absolute",
            top: 650,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            opacity: interpolate(frame, [400, 440], [0, 1], { extrapolateRight: "clamp" }),
          }}
        >
          <div
            style={{
              background: "rgba(233,30,99,0.1)",
              border: "2px solid rgba(233,30,99,0.3)",
              borderRadius: 12,
              padding: "15px 40px",
              fontSize: 26,
              fontFamily: "monospace",
              color: "#fff",
            }}
          >
            {relaxationHappened ? (
              <span style={{ color: "#69f0ae" }}>
                ✓ {distA} + {distAtoB} = {distBNew} {"<"} {distBOld} → Update dist[B] = {distBNew}
              </span>
            ) : (
              <span>
                Check: dist[A] + w(A