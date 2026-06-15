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

interface Lesson_c6b0a3aeProps {
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
    <div
      style={{
        position: "absolute",
        left: x - 28 * scale,
        top: y - 28 * scale,
        width: 56 * scale,
        height: 56 * scale,
        borderRadius: "50%",
        background: color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: 800,
        fontSize: 22 * scale,
        fontFamily: "monospace",
        boxShadow: `0 0 ${pulse ? 20 : 8}px ${color}88`,
        transform: `scale(${pulseScale})`,
        opacity,
        border: `3px solid rgba(255,255,255,0.3)`,
        transition: "background 0.3s",
      }}
    >
      {label}
    </div>
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
  progress?: number;
  showWeight?: boolean;
}> = ({ x1, y1, x2, y2, weight, color = "#667", opacity = 1, progress = 1, showWeight = true }) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: x1,
          top: y1 - 2,
          width: len * progress,
          height: 4,
          background: color,
          transformOrigin: "0 50%",
          transform: `rotate(${angle}deg)`,
          opacity,
          borderRadius: 2,
        }}
      />
      {showWeight && progress > 0.5 && (
        <div
          style={{
            position: "absolute",
            left: mx - 14,
            top: my - 22,
            background: "#1a1a2e",
            color: "#ffd700",
            padding: "2px 8px",
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 700,
            fontFamily: "monospace",
            border: "1px solid #ffd700",
            opacity,
          }}
        >
          {weight}
        </div>
      )}
    </>
  );
};

const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => (
  <div
    style={{
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: 6,
      background: "rgba(255,255,255,0.1)",
    }}
  >
    <div
      style={{
        width: `${progress * 100}%`,
        height: "100%",
        background: "linear-gradient(90deg, #00d2ff, #7b2ff7, #ff6b6b)",
        borderRadius: 3,
      }}
    />
  </div>
);

// INTRO SECTION
const IntroSection: React.FC<Lesson_c6b0a3aeProps> = ({ title, description, lessonNumber }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSpring = spring({ frame, fps, config: { damping: 12, stiffness: 80 }, from: 0, to: 1 });
  const subtitleOpacity = interpolate(frame, [40, 70], [0, 1], { extrapolateRight: "clamp" });
  const descOpacity = interpolate(frame, [80, 120], [0, 1], { extrapolateRight: "clamp" });
  const descY = interpolate(frame, [80, 120], [40, 0], { extrapolateRight: "clamp" });
  const lessonBadgeScale = spring({ frame: frame - 10, fps, config: { damping: 8, stiffness: 120 }, from: 0, to: 1 });

  const bgShift = Math.sin(frame * 0.02) * 10;

  // Floating particles
  const particles = Array.from({ length: 20 }, (_, i) => ({
    x: (i * 97 + 30) % 1920,
    y: ((i * 137 + 50) % 1080),
    size: 3 + (i % 5) * 2,
    speed: 0.5 + (i % 3) * 0.3,
    delay: i * 8,
  }));

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${135 + bgShift}deg, #0a0a23 0%, #1a1a3e 40%, #0d0d2b 100%)`,
        fontFamily: "'Segoe UI', sans-serif",
      }}
    >
      {particles.map((p, i) => {
        const py = (p.y + (frame - p.delay) * p.speed) % 1120 - 40;
        const px = p.x + Math.sin((frame + p.delay) * 0.03) * 30;
        const pOpacity = interpolate(frame, [p.delay, p.delay + 30], [0, 0.4], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: px,
              top: py,
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              background: i % 2 === 0 ? "#7b2ff7" : "#00d2ff",
              opacity: pOpacity * 0.5,
            }}
          />
        );
      })}

      <div
        style={{
          position: "absolute",
          top: 60,
          left: 80,
          transform: `scale(${lessonBadgeScale})`,
          background: "linear-gradient(135deg, #7b2ff7, #00d2ff)",
          padding: "12px 30px",
          borderRadius: 20,
          color: "#fff",
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: 2,
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
        <div
          style={{
            fontSize: 72,
            fontWeight: 900,
            color: "#fff",
            textShadow: "0 0 40px rgba(123,47,247,0.5)",
            lineHeight: 1.2,
            marginBottom: 20,
          }}
        >
          {title}
        </div>
        <div
          style={{
            opacity: subtitleOpacity,
            fontSize: 20,
            color: "#aaa",
            letterSpacing: 4,
            textTransform: "uppercase",
            marginBottom: 30,
          }}
        >
          Graph Algorithms — Shortest Path
        </div>
        <div
          style={{
            opacity: descOpacity,
            transform: `translateY(${descY}px)`,
            fontSize: 28,
            color: "#c8c8e0",
            maxWidth: 900,
            margin: "0 auto",
            lineHeight: 1.6,
          }}
        >
          {description}
        </div>
      </div>

      {/* Animated graph icon */}
      <svg
        width={200}
        height={200}
        style={{
          position: "absolute",
          bottom: 60,
          right: 80,
          opacity: interpolate(frame, [60, 100], [0, 0.3], { extrapolateRight: "clamp" }),
          transform: `rotate(${frame * 0.3}deg)`,
        }}
        viewBox="0 0 200 200"
      >
        <circle cx={100} cy={40} r={15} fill="#7b2ff7" />
        <circle cx={40} cy={140} r={15} fill="#00d2ff" />
        <circle cx={160} cy={140} r={15} fill="#ff6b6b" />
        <line x1={100} y1={55} x2={45} y2={128} stroke="#556" strokeWidth={3} />
        <line x1={100} y1={55} x2={155} y2={128} stroke="#556" strokeWidth={3} />
        <line x1={55} y1={140} x2={145} y2={140} stroke="#556" strokeWidth={3} />
      </svg>

      <ProgressBar progress={0} />
    </AbsoluteFill>
  );
};

// KEY POINT 1: Graphs are made of nodes connected by weighted edges
const KeyPoint1Section: React.FC<Lesson_c6b0a3aeProps> = ({ keyPoints }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const nodes = [
    { x: 300, y: 280, label: "A", color: "#7b2ff7" },
    { x: 600, y: 180, label: "B", color: "#00d2ff" },
    { x: 900, y: 280, label: "C", color: "#ff6b6b" },
    { x: 450, y: 500, label: "D", color: "#ffd700" },
    { x: 750, y: 500, label: "E", color: "#00e676" },
  ];

  const edges = [
    { from: 0, to: 1, weight: 4 },
    { from: 0, to: 3, weight: 2 },
    { from: 1, to: 2, weight: 3 },
    { from: 1, to: 4, weight: 5 },
    { from: 2, to: 4, weight: 1 },
    { from: 3, to: 4, weight: 7 },
  ];

  const titleOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });
  const titleY = interpolate(frame, [0, 30], [-30, 0], { extrapolateRight: "clamp" });

  const kpOpacity = interpolate(frame, [40, 80], [0, 1], { extrapolateRight: "clamp" });
  const kpX = interpolate(frame, [40, 80], [-50, 0], { extrapolateRight: "clamp" });

  // Animate nodes appearing one by one
  const nodeAppearFrames = nodes.map((_, i) => 100 + i * 40);
  // Animate edges appearing
  const edgeAppearFrames = edges.map((_, i) => 300 + i * 50);

  // Labels explanation
  const labelExplainOpacity = interpolate(frame, [600, 640], [0, 1], { extrapolateRight: "clamp" });

  // Node highlight animation
  const highlightIdx = Math.floor((frame - 700) / 80) % nodes.length;
  const showHighlight = frame > 700;

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(180deg, #0a0a23, #12122e)",
        fontFamily: "'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 40,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
        }}
      >
        <div style={{ fontSize: 18, color: "#7b2ff7", letterSpacing: 3, fontWeight: 700, marginBottom: 8 }}>
          KEY CONCEPT 1
        </div>
        <div style={{ fontSize: 42, fontWeight: 800, color: "#fff" }}>
          What is a Graph?
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 80,
          left: 80,
          right: 80,
          opacity: kpOpacity,
          transform: `translateX(${kpX}px)`,
          background: "rgba(123,47,247,0.12)",
          border: "2px solid rgba(123,47,247,0.3)",
          borderRadius: 16,
          padding: "20px 30px",
          fontSize: 26,
          color: "#e0e0ff",
          fontWeight: 600,
          textAlign: "center",
        }}
      >
        💡 {keyPoints[0]}
      </div>

      {/* Graph visualization area */}
      <div
        style={{
          position: "absolute",
          top: 140,
          left: 200,
          width: 1000,
          height: 500,
        }}
      >
        {/* Edges */}
        {edges.map((e, i) => {
          const edgeProgress = interpolate(frame, [edgeAppearFrames[i], edgeAppearFrames[i] + 40], [0, 1], {
            extrapolateRight: "clamp",
            extrapolateLeft: "clamp",
          });
          return (
            <GraphEdge
              key={`e${i}`}
              x1={nodes[e.from].x - 200}
              y1={nodes[e.from].y - 140}
              x2={nodes[e.to].x - 200}
              y2={nodes[e.to].y - 140}
              weight={e.weight}
              color={edgeProgress > 0.9 ? "#556" : "#7b2ff7"}
              opacity={edgeProgress}
              progress={edgeProgress}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((n, i) => {
          const nodeScale = spring({
            frame: frame - nodeAppearFrames[i],
            fps,
            config: { damping: 10, stiffness: 100 },
            from: 0,
            to: 1,
          });
          const isHighlighted = showHighlight && highlightIdx === i;
          return (
            <GraphNode
              key={`n${i}`}
              x={n.x - 200}
              y={n.y - 140}
              label={n.label}
              color={isHighlighted ? "#fff" : n.color}
              scale={nodeScale}
              opacity={frame >= nodeAppearFrames[i] ? 1 : 0}
              pulse={isHighlighted}
              frame={frame}
            />
          );
        })}

        {/* Labels */}
        {frame > 600 && (
          <>
            <div
              style={{
                position: "absolute",
                left: 40,
                top: 10,
                opacity: labelExplainOpacity,
                color: "#aaa",
                fontSize: 20,
                fontWeight: 600,
              }}
            >
              <span style={{ color: "#7b2ff7" }}>●</span> Nodes = Vertices
            </div>
            <div
              style={{
                position: "absolute",
                left: 40,
                top: 40,
                opacity: labelExplainOpacity,
                color: "#aaa",
                fontSize: 20,
                fontWeight: 600,
              }}
            >
              <span style={{ color: "#ffd700" }}>—</span> Numbers = Edge Weights (distances)
            </div>
          </>
        )}
      </div>

      <ProgressBar progress={0.15} />
    </AbsoluteFill>
  );
};

// KEY POINT 2: Dijkstra always picks the closest unvisited node
const KeyPoint2Section: React.FC<Lesson_c6b0a3aeProps> = ({ keyPoints }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const nodes = [
    { x: 200, y: 200, label: "S", dist: 0 },
    { x: 480, y: 120, label: "A", dist: 4 },
    { x: 480, y: 340, label: "B", dist: 2 },
    { x: 760, y: 120, label: "C", dist: 7 },
    { x: 760, y: 340, label: "D", dist: 5 },
    { x: 1000, y: 230, label: "T", dist: 9 },
  ];

  const edges = [
    { from: 0, to: 1, w: 4 },
    { from: 0, to: 2, w: 2 },
    { from: 1, to: 3, w: 3 },
    { from: 2, to: 4, w: 3 },
    { from: 1, to: 4, w: 5 },
    { from: 3, to: 5, w: 2 },
    { from: 4, to: 5, w: 4 },
  ];

  // Dijkstra step simulation
  // Visit order: S(0), B(2), A(4), D(5), C(7), T(9)
  const visitOrder = [0, 2, 1, 4, 3, 5];
  const stepDuration = 200;
  const stepStart = 200;

  const currentStepRaw = (frame - stepStart) / stepDuration;
  const currentStep = Math.floor(Math.max(0, Math.min(currentStepRaw, visitOrder.length - 1)));
  const visitedSet = new Set<number>();
  for (let i = 0; i <= currentStep && frame >= stepStart; i++) {
    visitedSet.add(visitOrder[i]);
  }

  // Currently being "picked" node
  const pickingIdx = frame >= stepStart ? visitOrder[Math.min(currentStep, visitOrder.length - 1)] : -1;
  const pickPhase = (frame - stepStart) % stepDuration;
  const isPicking = pickPhase < 60 && frame >= stepStart;

  const titleSpring = spring({ frame, fps, config: { damping: 12 }, from: 0, to: 1 });

  const kpOpacity = interpolate(frame, [60, 100], [0, 1], { extrapolateRight: "clamp" });

  // Greedy text
  const greedyOpacity = interpolate(frame, [1400, 1450], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(180deg, #0d0d2b, #1a0a30)",
        fontFamily: "'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 40,
          left: 0,
          right: 0,
          textAlign: "center",
          transform: `scale(${titleSpring})`,
        }}
      >
        <div style={{ fontSize: 18, color: "#00d2ff", letterSpacing: 3, fontWeight: 700, marginBottom: 8 }}>
          KEY CONCEPT 2
        </div>
        <div style={{ fontSize: 40, fontWeight: 800, color: "#fff" }}>
          The Greedy Choice
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 120,
          left: 80,
          right: 80,
          opacity: kpOpacity,
          background: "rgba(0,210,255,0.1)",
          border: "2px solid rgba(0,210,255,0.3)",
          borderRadius: 16,
          padding: "16px 30px",
          fontSize: 24,
          color: "#e0f0ff",
          fontWeight: 600,
          textAlign: "center",
        }}
      >
        💡 {keyPoints[1]}
      </div>

      {/* Graph area */}
      <div style={{ position: "absolute", top: 180, left: 160, width: 1100, height: 400 }}>
        {edges.map((e, i) => {
          const fromVisited = visitedSet.has(e.from);
          const toVisited = visitedSet.has(e.to);
          const edgeColor = fromVisited && toVisited ? "#00e676" : "#444";
          return (
            <GraphEdge
              key={`e${i}`}
              x1={nodes[e.from].x}
              y1={nodes[e.from].y}
              x2={nodes[e.to].x}
              y2={nodes[e.to].y}
              weight={e.w}
              color={edgeColor}
              opacity={0.8}
              progress={1}
            />
          );
        })}
        {nodes.map((n, i) => {
          const visited = visitedSet.has(i);
          const picking = isPicking && pickingIdx === i;
          const nodeColor = visited ? "#00e676" : "#555";
          return (
            <React.Fragment key={`n${i}`}>
              <GraphNode
                x={n.x}
                y={n.y}
                label={n.label}
                color={picking ? "#ffd700" : nodeColor}
                pulse={picking}
                frame={frame}
              />
              {/* Distance label */}
              <div
                style={{
                  position: "absolute",
                  left: n.x - 20,
                  top: n.y + 35,
                  fontSize: 18,
                  color: visited ? "#00e676" : "#888",
                  fontWeight: 700,
                  fontFamily: "monospace",
                  textAlign: "center",
                  width: 40,
                }}
              >
                d={visited ? n.dist : "∞"}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Visit order visualization */}
      <div
        style={{
          position: "absolute",
          bottom: 100,
          left: 80,
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        <span style={{ color: "#aaa", fontSize: 18, marginRight: 10 }}>Visit Order:</span>
        {visitOrder.map((vi, i) => {
          const shown = i <= currentStep && frame >= stepStart;
          const sc = shown
            ? spring({ frame: frame - (stepStart + i * stepDuration), fps, config: { damping: 10 }, from: 0, to: 1 })
            : 0;
          return (
            <div
              key={i}
              style={{
                width: 50,
                height: 50,
                borderRadius: "50%",
                background: shown ? "#00e676" : "#333",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: shown ? "#000" : "#666",
                fontWeight: 800,
                fontSize: 20,
                transform: `scale(${sc})`,
                fontFamily: "monospace",
              }}
            >
              {nodes[vi].label}
            </div>
          );
        })}
      </div>

      {/* Greedy explanation */}
      <div
        style={{
          position: "absolute",
          bottom: 30,
          right: 80,
          opacity: greedyOpacity,
          color: "#ffd700",
          fontSize: 22,
          fontWeight: 700,
          fontStyle: "italic",
        }}
      >
        "Always choose the nearest unvisited node" — Greedy Strategy
      </div>

      <ProgressBar progress={0.35} />
    </AbsoluteFill>
  );
};

// KEY POINT 3: Edge Relaxation
const KeyPoint3Section: React.FC<Lesson_c6b0a3aeProps> = ({ keyPoints }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSpring = spring({ frame, fps, config: { damping: 12 }, from: 0, to: 1 });
  const kpOpacity = interpolate(frame, [40, 80], [0, 1], { extrapolateRight: "clamp" });

  // Relaxation demo: 3 nodes A -> B -> C
  // Show relaxation of edge A->C through B
  // dist[A]=0, dist[B]=3, dist[C]=∞ initially
  // Then relax A->C direct = 10, then through B = 3+2 = 5

  const phase1Start = 200;
  const phase2Start = 600;
  const phase3Start = 1000;
  const phase4Start = 1400;

  // Phase 1: Show three nodes
  const showNodes = frame >= phase1Start;
  const nodeScale = spring({ frame: frame - phase1Start, fps, config: { damping: 10 }, from: 0, to: 1 });

  // Phase 2: Show direct edge A->C with weight 10
  const directEdgeProgress = interpolate(frame, [phase2Start, phase2Start + 60], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  // Phase 3: dist[C] = 10
  const distCDirect = frame >= phase2Start + 80;

  // Phase 4: Relax through B -> dist[C] = min(10, 3+2) = 5
  const relaxProgress = interpolate(frame, [phase3Start, phase3Start + 60], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  const showNewDist = frame >= phase4Start;
  const newDistScale = spring({ frame: frame - phase4Start, fps, config: { damping: 8, stiffness: 120 }, from: 0, to: 1 });

  // Formula animation
  const formulaOpacity = interpolate(frame, [phase4Start + 100, phase4Start + 150], [0, 1], { extrapolateRight: "clamp" });

  // Glow for the relaxed path
  const glowPhase = frame >= phase4Start;
  const glowIntensity = glowPhase ? 0.5 + 0.3 * Math.sin(frame * 0.1) : 0;

  const nodePositions = [
    { x: 250, y: 300, label: "A", dist: "0" },
    { x: 600, y: 160, label: "B", dist: "3" },
    { x: 950, y: 300, label: "C", dist: showNewDist ? "5" : distCDirect ? "10" : "∞" },
  ];

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(180deg, #0e0e28, #1a0a25)",
        fontFamily: "'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 40,
          left: 0,
          right: 0,
          textAlign: "center",
          transform: `scale(${titleSpring})`,
        }}
      >
        <div style={{ fontSize: 18, color: "#ff6b6b", letterSpacing: 3, fontWeight: 700, marginBottom: 8 }}>
          KEY CONCEPT 3
        </div>
        <div style={{ fontSize: 40, fontWeight: 800, color: "#fff" }}>
          Edge Relaxation
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 110,
          left: 80,
          right: 80,
          opacity: kpOpacity,
          background: "rgba(255,107,107,0.1)",
          border: "2px solid rgba(255,107,107,0.3)",
          borderRadius: 16,
          padding: "16px 30px",
          fontSize: 24,
          color: "#ffe0e0",
          fontWeight: 600,
          textAlign: "center",
        }}
      >
        💡 {keyPoints[2]}
      </div>

      {/* Graph area */}
      <div style={{ position: "absolute", top: 100, left: 200, width: 1000, height: 500 }}>
        {/* Edge A->B */}
        {showNodes && (
          <GraphEdge
            x1={nodePositions[0].x}
            y1={nodePositions[0].y}
            x2={nodePositions[1].x}
            y2={nodePositions[1].y}
            weight={3}
            color={glowPhase ? `rgba(0,230,118,${0.5 + glowIntensity})` : "#556"}
            progress={nodeScale}
          />
        )}

        {/* Edge B->C */}
        {frame >= phase3Start && (
          <GraphEdge
            x1={nodePositions[1].x}
            y1={nodePositions[1].y}
            x2={nodePositions[2].x}
            y2={nodePositions[2].y}
            weight={2}
            color={glowPhase ? `rgba(0,230,118,${0.5 + glowIntensity})` : "#7b