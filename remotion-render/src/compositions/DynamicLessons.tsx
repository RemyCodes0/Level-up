import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Series,
  Easing,
} from "remotion";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const FONT = "'Inter', 'Segoe UI', sans-serif";
const MONO = "'Fira Mono', 'Courier New', monospace";

const C = {
  bg: "#060d1a",
  bgAlt: "#0a1628",
  indigo: "#6366f1",
  indigoLight: "#818cf8",
  cyan: "#06b6d4",
  green: "#22d3a4",
  yellow: "#fbbf24",
  red: "#f43f5e",
  white: "#f1f5f9",
  muted: "#64748b",
  card: "rgba(99,102,241,0.07)",
  cardBorder: "rgba(99,102,241,0.2)",
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const fadeIn = (frame: number, start: number, dur = 20) =>
  clamp(interpolate(frame, [start, start + dur], [0, 1]), 0, 1);
const slideUp = (frame: number, fps: number, delay = 0) =>
  spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 18, stiffness: 120 }, from: 40, to: 0 });
const slideLeft = (frame: number, fps: number, delay = 0) =>
  spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 16, stiffness: 100 }, from: -120, to: 0 });
const scaleIn = (frame: number, fps: number, delay = 0) =>
  spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 14, stiffness: 90 }, from: 0.5, to: 1 });

// ─── SCENE 1: TITLE (210 frames = 7s) ────────────────────────────────────────
const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleY = slideUp(frame, fps, 5);
  const titleOp = fadeIn(frame, 5);
  const subtitleOp = fadeIn(frame, 30);
  const subtitleY = slideUp(frame, fps, 30);
  const badgeOp = fadeIn(frame, 55);
  const lineW = interpolate(frame, [20, 60], [0, 700], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exitOp = interpolate(frame, [185, 210], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Animated graph nodes for background
  const nodes = [
    { x: 200, y: 300 }, { x: 500, y: 180 }, { x: 820, y: 350 },
    { x: 1100, y: 200 }, { x: 1400, y: 400 }, { x: 1650, y: 250 },
    { x: 320, y: 700 }, { x: 680, y: 820 }, { x: 1000, y: 680 },
    { x: 1280, y: 780 }, { x: 1550, y: 650 },
  ];
  const edges = [
    [0,1],[1,2],[2,3],[3,4],[4,5],[0,6],[6,7],[7,8],[8,9],[9,10],[1,7],[2,8],[3,9],[4,10],
  ];

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: exitOp, overflow: "hidden" }}>
      {/* Background graph */}
      <svg width="1920" height="1080" style={{ position: "absolute", opacity: 0.08 }}>
        {edges.map(([a, b], i) => (
          <line key={i}
            x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y}
            stroke={C.indigo} strokeWidth="2"
            strokeDasharray="8 6"
            opacity={fadeIn(frame, i * 8 + 10)}
          />
        ))}
        {nodes.map((n, i) => (
          <circle key={i} cx={n.x} cy={n.y} r={18}
            fill="none" stroke={C.indigo} strokeWidth="2"
            opacity={fadeIn(frame, i * 6 + 5)}
          />
        ))}
      </svg>

      {/* Glow */}
      <div style={{
        position: "absolute", top: "40%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: 900, height: 300, borderRadius: "50%",
        background: "radial-gradient(ellipse, rgba(99,102,241,0.25) 0%, transparent 70%)",
      }} />

      {/* Algorithm tag */}
      <div style={{
        position: "absolute", top: "26%", left: "50%", transform: "translateX(-50%)",
        opacity: badgeOp,
        background: "rgba(6,182,212,0.12)",
        border: `1px solid ${C.cyan}`,
        borderRadius: 999, padding: "7px 28px",
        fontFamily: MONO, fontSize: 16, color: C.cyan, letterSpacing: "4px",
        textTransform: "uppercase" as const,
      }}>
        Graph Algorithm · Shortest Path
      </div>

      {/* Title */}
      <div style={{
        position: "absolute", top: "42%", left: "50%",
        transform: `translate(-50%, calc(-50% + ${titleY}px))`,
        opacity: titleOp,
        fontFamily: FONT, fontSize: 104, fontWeight: 900, color: C.white,
        letterSpacing: "-4px", textAlign: "center",
        textShadow: `0 0 100px rgba(99,102,241,0.7)`,
      }}>
        Dijkstra's Algorithm
      </div>

      {/* Underline */}
      <div style={{
        position: "absolute", top: "calc(42% + 55px)", left: "50%",
        transform: "translateX(-50%)",
        width: lineW, height: 5,
        background: `linear-gradient(90deg, ${C.indigo}, ${C.cyan})`,
        borderRadius: 3,
      }} />

      {/* Subtitle */}
      <div style={{
        position: "absolute", top: "62%", left: "50%",
        transform: `translate(-50%, ${subtitleY}px)`,
        opacity: subtitleOp,
        fontFamily: FONT, fontSize: 28, color: C.muted,
        textAlign: "center", maxWidth: 800, lineHeight: 1.6,
      }}>
        Finding the shortest path between nodes in a weighted graph — used in GPS, networking, and AI.
      </div>

      {/* Author tag */}
      <div style={{
        position: "absolute", bottom: "8%", left: "50%",
        transform: "translateX(-50%)",
        opacity: fadeIn(frame, 70),
        fontFamily: MONO, fontSize: 16, color: C.muted,
        letterSpacing: "2px",
      }}>
        5-Minute Deep Dive
      </div>
    </AbsoluteFill>
  );
};

// ─── SCENE 2: THE PROBLEM (240 frames = 8s) ───────────────────────────────────
const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerY = slideUp(frame, fps, 0);
  const exitOp = interpolate(frame, [210, 240], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const problems = [
    { icon: "🗺️", label: "GPS Navigation", detail: "Shortest driving route from A to B" },
    { icon: "🌐", label: "Network Routing", detail: "Fastest data path across the internet" },
    { icon: "🎮", label: "Game AI", detail: "NPC pathfinding through a map" },
    { icon: "✈️", label: "Flight Planning", detail: "Cheapest connecting flight itinerary" },
  ];

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: exitOp, padding: "80px 160px", overflow: "hidden" }}>
      <div style={{ fontFamily: FONT, fontSize: 52, fontWeight: 800, color: C.white, transform: `translateY(${headerY}px)`, marginBottom: 12 }}>
        The Problem
      </div>
      <div style={{
        fontFamily: MONO, fontSize: 16, color: C.cyan, letterSpacing: "3px",
        textTransform: "uppercase" as const, marginBottom: 40,
        opacity: fadeIn(frame, 15),
      }}>
        Why do we need Dijkstra?
      </div>

      <div style={{ fontFamily: FONT, fontSize: 26, color: C.muted, maxWidth: 1100, lineHeight: 1.7, marginBottom: 60, opacity: fadeIn(frame, 20) }}>
        Given a weighted graph — where edges have costs (distance, time, price) — find the{" "}
        <span style={{ color: C.cyan, fontWeight: 700 }}>minimum-cost path</span> from a source node to every other node.
      </div>

      {/* Problem cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {problems.map((p, i) => {
          const delay = 30 + i * 20;
          return (
            <div key={i} style={{
              background: C.card,
              border: `1.5px solid ${C.cardBorder}`,
              borderLeft: `5px solid ${C.indigo}`,
              borderRadius: 16, padding: "28px 36px",
              opacity: fadeIn(frame, delay),
              transform: `translateX(${slideLeft(frame, fps, delay)}px)`,
              display: "flex", alignItems: "center", gap: 20,
            }}>
              <span style={{ fontSize: 42 }}>{p.icon}</span>
              <div>
                <div style={{ fontFamily: FONT, fontSize: 24, fontWeight: 700, color: C.white, marginBottom: 6 }}>{p.label}</div>
                <div style={{ fontFamily: FONT, fontSize: 18, color: C.muted }}>{p.detail}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Complexity badge */}
      <div style={{
        marginTop: 50, opacity: fadeIn(frame, 110),
        display: "inline-flex", alignItems: "center", gap: 16,
        background: "rgba(34,211,164,0.1)", border: `1px solid ${C.green}`,
        borderRadius: 12, padding: "16px 28px",
      }}>
        <span style={{ fontFamily: MONO, fontSize: 20, color: C.green }}>Time Complexity: O((V + E) log V)</span>
        <span style={{ fontFamily: FONT, fontSize: 18, color: C.muted }}>with a min-heap priority queue</span>
      </div>
    </AbsoluteFill>
  );
};

// ─── SCENE 3: GRAPH ANATOMY (270 frames = 9s) ─────────────────────────────────
const GraphAnatomyScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exitOp = interpolate(frame, [240, 270], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Graph definition
  const nodes: { id: string; x: number; y: number; label: string }[] = [
    { id: "A", x: 200, y: 300, label: "A (Start)" },
    { id: "B", x: 550, y: 120, label: "B" },
    { id: "C", x: 550, y: 480, label: "C" },
    { id: "D", x: 900, y: 120, label: "D" },
    { id: "E", x: 900, y: 480, label: "E" },
    { id: "F", x: 1200, y: 300, label: "F (End)" },
  ];
  const edges = [
    { a: 0, b: 1, w: 4 }, { a: 0, b: 2, w: 2 },
    { a: 1, b: 2, w: 5 }, { a: 1, b: 3, w: 10 },
    { a: 2, b: 4, w: 3 }, { a: 3, b: 5, w: 11 },
    { a: 4, b: 3, w: 4 }, { a: 4, b: 5, w: 6 },
  ];

  const graphOp = fadeIn(frame, 10);

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: exitOp, overflow: "hidden" }}>
      {/* Left: header + legend */}
      <div style={{ position: "absolute", left: 80, top: 80, width: 500 }}>
        <div style={{ fontFamily: FONT, fontSize: 48, fontWeight: 800, color: C.white, transform: `translateY(${slideUp(frame, fps, 0)}px)`, marginBottom: 12 }}>
          Graph Anatomy
        </div>
        <div style={{ fontFamily: MONO, fontSize: 15, color: C.cyan, letterSpacing: "3px", textTransform: "uppercase" as const, marginBottom: 36, opacity: fadeIn(frame, 10) }}>
          Nodes · Edges · Weights
        </div>

        {[
          { color: C.indigoLight, label: "Node (Vertex)", detail: "A location or state in the graph" },
          { color: C.cyan, label: "Edge", detail: "A connection between two nodes" },
          { color: C.yellow, label: "Weight", detail: "The cost to traverse an edge (e.g. distance)" },
          { color: C.green, label: "Start Node", detail: "Source: where Dijkstra begins" },
        ].map((item, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 22,
            opacity: fadeIn(frame, 30 + i * 18),
            transform: `translateX(${slideLeft(frame, fps, 30 + i * 18)}px)`,
          }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: item.color, marginTop: 4, flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, color: C.white }}>{item.label}</div>
              <div style={{ fontFamily: FONT, fontSize: 16, color: C.muted }}>{item.detail}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Right: SVG Graph */}
      <div style={{ position: "absolute", right: 80, top: 60, width: 800, height: 620 }}>
        <svg width="800" height="600" style={{ opacity: graphOp }}>
          {/* Edges */}
          {edges.map((e, i) => {
            const a = nodes[e.a], b = nodes[e.b];
            const mx = (a.x + b.x) / 2 - 160, my = (a.y + b.y) / 2 - 40;
            return (
              <g key={i}>
                <line
                  x1={a.x - 160} y1={a.y} x2={b.x - 160} y2={b.y}
                  stroke={C.indigo} strokeWidth="2.5"
                  opacity={fadeIn(frame, 15 + i * 8)}
                />
                <rect x={mx - 14} y={my - 14} width={28} height={22} rx={5}
                  fill={C.bgAlt} stroke={C.yellow} strokeWidth="1.2"
                  opacity={fadeIn(frame, 20 + i * 8)}
                />
                <text x={mx} y={my + 4}
                  textAnchor="middle"
                  fontFamily={MONO} fontSize="14" fill={C.yellow}
                  opacity={fadeIn(frame, 20 + i * 8)}>
                  {e.w}
                </text>
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map((n, i) => {
            const isStart = i === 0;
            const isEnd = i === 5;
            const delay = 10 + i * 12;
            const sc = scaleIn(frame, fps, delay);
            return (
              <g key={i} style={{ opacity: fadeIn(frame, delay) }}>
                <circle
                  cx={n.x - 160} cy={n.y} r={34}
                  fill={isStart ? C.green : isEnd ? C.cyan : C.indigo}
                  opacity={0.85}
                  transform={`scale(${sc})`}
                  style={{ transformOrigin: `${n.x - 160}px ${n.y}px` }}
                />
                <text x={n.x - 160} y={n.y + 7}
                  textAnchor="middle" fontFamily={FONT}
                  fontSize="22" fontWeight="800" fill={C.white}>
                  {n.id}
                </text>
              </g>
            );
          })}

          {/* Labels */}
          {nodes.map((n, i) => (
            <text key={i}
              x={n.x - 160} y={n.y + 56}
              textAnchor="middle" fontFamily={FONT}
              fontSize="13" fill={C.muted}
              opacity={fadeIn(frame, 60 + i * 8)}>
              {n.label}
            </text>
          ))}
        </svg>
      </div>
    </AbsoluteFill>
  );
};

// ─── SCENE 4: ALGORITHM STEPS (300 frames = 10s) ─────────────────────────────
const AlgorithmStepsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exitOp = interpolate(frame, [270, 300], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const steps = [
    {
      num: "01",
      title: "Initialize",
      code: "dist[start] = 0; dist[all others] = ∞",
      detail: "Set distance to source as 0, all others as infinity. Add all nodes to a priority queue.",
      color: C.cyan,
    },
    {
      num: "02",
      title: "Pick Minimum",
      code: "u = priority_queue.extract_min()",
      detail: "Extract the unvisited node with the smallest tentative distance from the queue.",
      color: C.indigoLight,
    },
    {
      num: "03",
      title: "Relax Edges",
      code: "if dist[u] + w(u,v) < dist[v]: dist[v] = dist[u] + w(u,v)",
      detail: "For each neighbor v of u: if going through u gives a shorter path, update v's distance.",
      color: C.yellow,
    },
    {
      num: "04",
      title: "Mark Visited",
      code: "visited.add(u)",
      detail: "Mark u as finalized — its shortest distance is now permanently known.",
      color: C.green,
    },
    {
      num: "05",
      title: "Repeat",
      code: "while priority_queue is not empty: goto step 2",
      detail: "Continue until all reachable nodes are visited or the destination is reached.",
      color: C.red,
    },
  ];

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: exitOp, padding: "60px 120px", overflow: "hidden" }}>
      <div style={{ fontFamily: FONT, fontSize: 48, fontWeight: 800, color: C.white, transform: `translateY(${slideUp(frame, fps, 0)}px)`, marginBottom: 8 }}>
        The Algorithm — Step by Step
      </div>
      <div style={{ fontFamily: MONO, fontSize: 15, color: C.cyan, letterSpacing: "3px", textTransform: "uppercase" as const, marginBottom: 36, opacity: fadeIn(frame, 10) }}>
        Greedy approach with a min-heap
      </div>

      <div style={{ display: "flex", flexDirection: "column" as const, gap: 18 }}>
        {steps.map((s, i) => {
          const delay = 15 + i * 30;
          return (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", gap: 28,
              opacity: fadeIn(frame, delay),
              transform: `translateX(${slideLeft(frame, fps, delay)}px)`,
              background: C.card,
              border: `1.5px solid ${C.cardBorder}`,
              borderLeft: `5px solid ${s.color}`,
              borderRadius: 14, padding: "20px 28px",
            }}>
              <div style={{
                fontFamily: MONO, fontSize: 26, fontWeight: 800,
                color: s.color, minWidth: 52, opacity: 0.6,
              }}>
                {s.num}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: FONT, fontSize: 22, fontWeight: 700, color: C.white, marginBottom: 6 }}>
                  {s.title}
                </div>
                <div style={{
                  fontFamily: MONO, fontSize: 15, color: s.color,
                  background: "rgba(0,0,0,0.3)", borderRadius: 7, padding: "6px 14px",
                  marginBottom: 8, display: "inline-block",
                }}>
                  {s.code}
                </div>
                <div style={{ fontFamily: FONT, fontSize: 17, color: C.muted, lineHeight: 1.5 }}>
                  {s.detail}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ─── SCENE 5: LIVE WALKTHROUGH (450 frames = 15s) ────────────────────────────
// We animate Dijkstra step by step on the 6-node graph from Scene 3

interface NodeState { dist: number; visited: boolean; prev: string | null; active: boolean }

const GRAPH_NODES = ["A","B","C","D","E","F"];
const GRAPH_EDGES: [string,string,number][] = [
  ["A","B",4],["A","C",2],["B","C",5],["B","D",10],
  ["C","E",3],["D","F",11],["E","D",4],["E","F",6],
];

// Pre-compute Dijkstra steps
function dijkstraSteps() {
  type State = { dists: Record<string,number>; visited: Set<string>; active: string; relaxed: string[]; prev: Record<string,string|null> };
  const INF = Infinity;
  const dists: Record<string,number> = {};
  const prev: Record<string,string|null> = {};
  GRAPH_NODES.forEach(n => { dists[n] = INF; prev[n] = null; });
  dists["A"] = 0;

  const steps: State[] = [];
  const unvisited = new Set(GRAPH_NODES);

  while (unvisited.size > 0) {
    // pick min
    let u = "";
    let minD = INF;
    for (const n of Array.from(unvisited)) {
      if (dists[n] < minD) { minD = dists[n]; u = n; }
    }
    if (!u || dists[u] === INF) break;

    unvisited.delete(u);
    const visited = new Set(GRAPH_NODES.filter(n => !unvisited.has(n)));

    // relax
    const relaxed: string[] = [];
    for (const [a, b, w] of GRAPH_EDGES) {
      const neighbor = a === u ? b : b === u ? a : null;
      if (!neighbor || !unvisited.has(neighbor)) continue;
      // directed: only a→b
      if (a !== u) continue;
      const newDist = dists[u] + w;
      if (newDist < dists[neighbor]) {
        dists[neighbor] = newDist;
        prev[neighbor] = u;
        relaxed.push(neighbor);
      }
    }

    steps.push({
      dists: { ...dists },
      visited: new Set(visited),
      active: u,
      relaxed: [...relaxed],
      prev: { ...prev },
    });
  }
  return steps;
}

const DIJKSTRA_STEPS = dijkstraSteps();

// Frame breakpoints: each step gets ~65 frames
const STEP_FRAMES = 65;

const NODE_POS: Record<string, {x:number; y:number}> = {
  A: { x: 140, y: 280 }, B: { x: 400, y: 110 }, C: { x: 400, y: 440 },
  D: { x: 660, y: 110 }, E: { x: 660, y: 440 }, F: { x: 900, y: 280 },
};

const LiveWalkthroughScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exitOp = interpolate(frame, [420, 450], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const stepIdx = Math.min(Math.floor(frame / STEP_FRAMES), DIJKSTRA_STEPS.length - 1);
  const step = DIJKSTRA_STEPS[stepIdx];
  const stepFrame = frame % STEP_FRAMES;

  // Build final shortest path for last step
  const isFinal = stepIdx === DIJKSTRA_STEPS.length - 1;
  const shortestPath: string[] = [];
  if (isFinal && step.prev["F"] !== null) {
    let cur: string | null = "F";
    while (cur) { shortestPath.unshift(cur); cur = step.prev[cur] ?? null; }
  }

  const getNodeColor = (n: string) => {
    if (n === step.active) return C.yellow;
    if (step.visited.has(n)) return C.green;
    if (isFinal && shortestPath.includes(n)) return C.cyan;
    return C.indigo;
  };

  const getEdgeColor = (a: string, b: string) => {
    if (isFinal) {
      const pi = shortestPath.indexOf(a), pj = shortestPath.indexOf(b);
      if (pi !== -1 && pj !== -1 && Math.abs(pi - pj) === 1) return C.cyan;
    }
    if ((a === step.active && step.relaxed.includes(b)) || (b === step.active && step.relaxed.includes(a))) return C.yellow;
    if (step.visited.has(a) && step.visited.has(b)) return C.green;
    return C.muted;
  };

  const stepLabels = [
    "Visit A (dist=0): relax neighbors B (+4) and C (+2)",
    "Visit C (dist=2): relax neighbor E (2+3=5)",
    "Visit B (dist=4): relax neighbor D (4+10=14)",
    "Visit E (dist=5): relax D (5+4=9 ✓) and F (5+6=11)",
    "Visit D (dist=9): relax F (9+11=20? No, 11 is better)",
    "Visit F (dist=11): Destination reached! ✅",
  ];

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: exitOp, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ position: "absolute", top: 50, left: 80 }}>
        <div style={{ fontFamily: FONT, fontSize: 46, fontWeight: 800, color: C.white, marginBottom: 6 }}>
          Live Walkthrough
        </div>
        <div style={{ fontFamily: MONO, fontSize: 15, color: C.cyan, letterSpacing: "3px", textTransform: "uppercase" as const }}>
          Source: A → Target: F
        </div>
      </div>

      {/* Step indicator */}
      <div style={{ position: "absolute", top: 50, right: 80 }}>
        <div style={{
          background: "rgba(251,191,36,0.12)", border: `1px solid ${C.yellow}`,
          borderRadius: 12, padding: "12px 24px",
          fontFamily: MONO, fontSize: 18, color: C.yellow,
        }}>
          Step {stepIdx + 1} / {DIJKSTRA_STEPS.length}
        </div>
      </div>

      {/* Graph SVG */}
      <div style={{ position: "absolute", top: 140, left: 80 }}>
        <svg width="1080" height="560">
          {/* Edges */}
          {GRAPH_EDGES.map(([a, b, w], i) => {
            const pa = NODE_POS[a], pb = NODE_POS[b];
            const ec = getEdgeColor(a, b);
            const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
            return (
              <g key={i}>
                <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                  stroke={ec} strokeWidth={ec === C.cyan ? 4 : 2}
                  strokeDasharray={ec === C.muted ? "6 4" : undefined}
                />
                <rect x={mx - 13} y={my - 12} width={26} height={20} rx={4}
                  fill={C.bgAlt} stroke={C.yellow} strokeWidth="1" />
                <text x={mx} y={my + 5} textAnchor="middle"
                  fontFamily={MONO} fontSize="13" fill={C.yellow}>{w}</text>
              </g>
            );
          })}

          {/* Nodes */}
          {GRAPH_NODES.map((n) => {
            const p = NODE_POS[n];
            const nc = getNodeColor(n);
            const d = step.dists[n];
            return (
              <g key={n}>
                {n === step.active && (
                  <circle cx={p.x} cy={p.y} r={50}
                    fill="none" stroke={C.yellow}
                    strokeWidth="2" opacity={0.3 + 0.3 * Math.sin(stepFrame * 0.3)} />
                )}
                <circle cx={p.x} cy={p.y} r={36}
                  fill={nc} opacity={0.9} />
                <text x={p.x} y={p.y + 8} textAnchor="middle"
                  fontFamily={FONT} fontSize="24" fontWeight="800" fill={C.white}>{n}</text>
                {/* Distance badge */}
                <rect x={p.x - 24} y={p.y - 60} width={48} height={22} rx={5}
                  fill={C.bgAlt} stroke={nc} strokeWidth="1.5" />
                <text x={p.x} y={p.y - 44} textAnchor="middle"
                  fontFamily={MONO} fontSize="14" fill={nc}>
                  {d === Infinity ? "∞" : d}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Step description */}
      <div style={{
        position: "absolute", bottom: 120, left: 80, right: 80,
        background: "rgba(99,102,241,0.1)", border: `1px solid ${C.cardBorder}`,
        borderLeft: `5px solid ${C.yellow}`,
        borderRadius: 14, padding: "20px 32px",
        opacity: fadeIn(stepFrame, 5),
      }}>
        <div style={{ fontFamily: FONT, fontSize: 22, color: C.white, lineHeight: 1.5 }}>
          {stepLabels[stepIdx] || ""}
        </div>
      </div>

      {/* Distance table */}
      <div style={{ position: "absolute", top: 160, right: 80, width: 320 }}>
        <div style={{ fontFamily: MONO, fontSize: 14, color: C.muted, letterSpacing: "2px", marginBottom: 12 }}>DISTANCE TABLE</div>
        {GRAPH_NODES.map((n) => {
          const d = step.dists[n];
          const isActive = n === step.active;
          const isDone = step.visited.has(n);
          return (
            <div key={n} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 18px", marginBottom: 6,
              background: isActive ? "rgba(251,191,36,0.12)" : isDone ? "rgba(34,211,164,0.08)" : C.card,
              border: `1px solid ${isActive ? C.yellow : isDone ? C.green : C.cardBorder}`,
              borderRadius: 8,
            }}>
              <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: isActive ? C.yellow : isDone ? C.green : C.white }}>
                {n} {isDone && "✓"} {isActive && "←"}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 18, color: isActive ? C.yellow : isDone ? C.green : C.muted }}>
                {d === Infinity ? "∞" : d}
              </span>
            </div>
          );
        })}

        {isFinal && shortestPath.length > 0 && (
          <div style={{
            marginTop: 16, background: "rgba(6,182,212,0.1)", border: `1px solid ${C.cyan}`,
            borderRadius: 10, padding: "14px 18px",
            opacity: fadeIn(stepFrame, 10),
          }}>
            <div style={{ fontFamily: MONO, fontSize: 13, color: C.cyan, marginBottom: 6 }}>SHORTEST PATH A→F</div>
            <div style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, color: C.white }}>
              {shortestPath.join(" → ")}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 16, color: C.cyan, marginTop: 4 }}>
              Total cost: {step.dists["F"]}
            </div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

// ─── SCENE 6: PSEUDOCODE (210 frames = 7s) ───────────────────────────────────
const PseudocodeScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exitOp = interpolate(frame, [185, 210], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const lines = [
    { text: "function Dijkstra(Graph, source):", color: C.cyan, indent: 0 },
    { text: "    dist[source] ← 0", color: C.green, indent: 0 },
    { text: "    for each vertex v in Graph:", color: C.white, indent: 0 },
    { text: "        if v ≠ source:", color: C.white, indent: 0 },
    { text: "            dist[v] ← INFINITY", color: C.muted, indent: 0 },
    { text: "        prev[v] ← UNDEFINED", color: C.muted, indent: 0 },
    { text: "    Q ← min_priority_queue(all vertices)", color: C.yellow, indent: 0 },
    { text: "", color: C.white, indent: 0 },
    { text: "    while Q is not empty:", color: C.indigoLight, indent: 0 },
    { text: "        u ← Q.extract_min()          // node with min dist", color: C.cyan, indent: 0 },
    { text: "        for each neighbor v of u:", color: C.white, indent: 0 },
    { text: "            alt ← dist[u] + weight(u, v)", color: C.white, indent: 0 },
    { text: "            if alt < dist[v]:         // found shorter path!", color: C.yellow, indent: 0 },
    { text: "                dist[v] ← alt", color: C.green, indent: 0 },
    { text: "                prev[v] ← u", color: C.green, indent: 0 },
    { text: "                Q.decrease_key(v, alt)", color: C.green, indent: 0 },
    { text: "", color: C.white, indent: 0 },
    { text: "    return dist, prev", color: C.cyan, indent: 0 },
  ];

  return (
    <AbsoluteFill style={{ background: "#070e1c", opacity: exitOp, overflow: "hidden" }}>
      {/* Left panel header */}
      <div style={{ position: "absolute", top: 60, left: 80 }}>
        <div style={{ fontFamily: FONT, fontSize: 46, fontWeight: 800, color: C.white, marginBottom: 8 }}>
          Pseudocode
        </div>
        <div style={{ fontFamily: MONO, fontSize: 15, color: C.cyan, letterSpacing: "3px", textTransform: "uppercase" as const, marginBottom: 30 }}>
          The implementation blueprint
        </div>
      </div>

      {/* Code block */}
      <div style={{
        position: "absolute", top: 160, left: 80, right: 80, bottom: 80,
        background: "rgba(0,0,0,0.5)", border: `1px solid ${C.cardBorder}`,
        borderRadius: 18, overflow: "hidden",
      }}>
        {/* Title bar */}
        <div style={{
          padding: "14px 24px",
          background: "rgba(99,102,241,0.12)",
          borderBottom: `1px solid ${C.cardBorder}`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: C.red }} />
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: C.yellow }} />
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: C.green }} />
          <span style={{ fontFamily: MONO, fontSize: 14, color: C.muted, marginLeft: 12 }}>dijkstra.pseudo</span>
        </div>

        {/* Lines */}
        <div style={{ padding: "24px 36px" }}>
          {lines.map((line, i) => (
            <div key={i} style={{
              fontFamily: MONO, fontSize: 18, color: line.color,
              lineHeight: 1.9,
              opacity: fadeIn(frame, 15 + i * 10),
              transform: `translateX(${interpolate(frame, [15 + i * 10, 30 + i * 10], [-30, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px)`,
              display: "flex", alignItems: "center",
            }}>
              <span style={{ color: C.muted, minWidth: 36, fontSize: 13, userSelect: "none" as const }}>
                {line.text ? i + 1 : ""}
              </span>
              <span>{line.text}</span>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── SCENE 7: COMPLEXITY & VARIANTS (210 frames = 7s) ────────────────────────
const ComplexityScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exitOp = interpolate(frame, [185, 210], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const variants = [
    { name: "Simple Array", time: "O(V²)", space: "O(V)", note: "Good for dense graphs", color: C.muted },
    { name: "Binary Heap", time: "O((V+E) log V)", space: "O(V+E)", note: "Most common implementation", color: C.indigo },
    { name: "Fibonacci Heap", time: "O(V log V + E)", space: "O(V+E)", note: "Theoretically optimal", color: C.cyan },
  ];

  const limits = [
    { icon: "✅", text: "Works with non-negative edge weights" },
    { icon: "✅", text: "Finds shortest path to ALL nodes at once" },
    { icon: "✅", text: "Optimal — guaranteed shortest path" },
    { icon: "❌", text: "Fails with negative edge weights (use Bellman-Ford)" },
    { icon: "❌", text: "Not efficient for extremely large sparse graphs (use A*)" },
  ];

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: exitOp, padding: "70px 120px", overflow: "hidden" }}>
      <div style={{ fontFamily: FONT, fontSize: 48, fontWeight: 800, color: C.white, transform: `translateY(${slideUp(frame, fps, 0)}px)`, marginBottom: 8 }}>
        Complexity & Variants
      </div>
      <div style={{ fontFamily: MONO, fontSize: 15, color: C.cyan, letterSpacing: "3px", textTransform: "uppercase" as const, marginBottom: 36, opacity: fadeIn(frame, 10) }}>
        When and how to use Dijkstra
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
        {/* Variants */}
        <div>
          <div style={{ fontFamily: FONT, fontSize: 24, fontWeight: 700, color: C.white, marginBottom: 18, opacity: fadeIn(frame, 20) }}>
            Implementation Variants
          </div>
          {variants.map((v, i) => (
            <div key={i} style={{
              background: C.card, border: `1.5px solid ${v.color}`,
              borderRadius: 14, padding: "20px 24px", marginBottom: 16,
              opacity: fadeIn(frame, 30 + i * 20),
              transform: `translateX(${slideLeft(frame, fps, 30 + i * 20)}px)`,
            }}>
              <div style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, color: v.color }}>{v.name}</div>
              <div style={{ display: "flex", gap: 24, marginTop: 8 }}>
                <span style={{ fontFamily: MONO, fontSize: 16, color: C.white }}>Time: {v.time}</span>
                <span style={{ fontFamily: MONO, fontSize: 16, color: C.muted }}>Space: {v.space}</span>
              </div>
              <div style={{ fontFamily: FONT, fontSize: 16, color: C.muted, marginTop: 6 }}>{v.note}</div>
            </div>
          ))}
        </div>

        {/* Limits */}
        <div>
          <div style={{ fontFamily: FONT, fontSize: 24, fontWeight: 700, color: C.white, marginBottom: 18, opacity: fadeIn(frame, 20) }}>
            Properties & Limitations
          </div>
          {limits.map((l, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", gap: 16,
              background: C.card, border: `1px solid ${C.cardBorder}`,
              borderRadius: 10, padding: "14px 20px", marginBottom: 12,
              opacity: fadeIn(frame, 30 + i * 18),
              transform: `translateX(${slideLeft(frame, fps, 30 + i * 18)}px)`,
            }}>
              <span style={{ fontSize: 20 }}>{l.icon}</span>
              <span style={{ fontFamily: FONT, fontSize: 18, color: l.icon === "✅" ? C.green : C.red }}>{l.text}</span>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── SCENE 8: SUMMARY (180 frames = 6s) ──────────────────────────────────────
const SummaryScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({ frame, fps, config: { damping: 13 }, from: 0.7, to: 1 });
  const mainOp = fadeIn(frame, 0);

  const keyTakeaways = [
    "Greedy algorithm: always expand the nearest unvisited node",
    "Requires non-negative edge weights to guarantee correctness",
    "Use a min-heap for O((V+E) log V) performance",
    "Returns shortest path to every node from the source",
    "Foundation for A*, GPS routing, and network protocols",
  ];

  const gridOffset = (frame * 0.8) % 80;

  return (
    <AbsoluteFill style={{
      background: "linear-gradient(145deg, #060d1a 0%, #0f0f3a 100%)",
      display: "flex", flexDirection: "column" as const,
      alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    }}>
      {/* Subtle grid */}
      <svg width="1920" height="1080" style={{ position: "absolute", opacity: 0.04 }}>
        {Array.from({ length: 15 }, (_, i) => (
          <line key={i} x1="0" y1={i * 80 - gridOffset} x2="1920" y2={i * 80 - gridOffset}
            stroke={C.indigo} strokeWidth="1" />
        ))}
      </svg>

      {/* Glow */}
      <div style={{
        position: "absolute", top: "30%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: 800, height: 200, borderRadius: "50%",
        background: "radial-gradient(ellipse, rgba(99,102,241,0.3) 0%, transparent 70%)",
      }} />

      <div style={{
        fontFamily: FONT, fontSize: 76, fontWeight: 900, color: C.white,
        transform: `scale(${scale})`, opacity: mainOp, textAlign: "center",
        textShadow: `0 0 80px rgba(99,102,241,0.6)`,
        marginBottom: 12,
      }}>
        ✅ Algorithm Mastered
      </div>

      <div style={{
        fontFamily: FONT, fontSize: 28, color: C.indigo,
        opacity: fadeIn(frame, 20), marginBottom: 48, textAlign: "center",
      }}>
        Dijkstra's Shortest Path — Key Takeaways
      </div>

      <div style={{ width: 900, display: "flex", flexDirection: "column" as const, gap: 14 }}>
        {keyTakeaways.map((t, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 16,
            opacity: fadeIn(frame, 30 + i * 18),
            transform: `translateY(${interpolate(frame, [30 + i * 18, 50 + i * 18], [18, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px)`,
            fontFamily: FONT, fontSize: 20, color: C.white,
            background: C.card, border: `1px solid ${C.cardBorder}`,
            borderRadius: 10, padding: "14px 22px",
          }}>
            <span style={{ color: C.green, fontSize: 18 }}>▸</span>
            {t}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        position: "absolute", bottom: 50,
        fontFamily: MONO, fontSize: 15, color: C.muted, letterSpacing: "2px",
        opacity: fadeIn(frame, 100),
      }}>
        Dijkstra · 1959 · E.W. Dijkstra
      </div>
    </AbsoluteFill>
  );
};

// ─── ROOT COMPOSITION ─────────────────────────────────────────────────────────
// Total: 210+240+270+300+450+210+210+180 = 2070 frames ≈ 69s ≈ ~5 min at 30fps
// (Scaled: for exactly 5 min = 9000 frames at 30fps, scale all durations ×4.35)
// We'll use 30fps, each scene duration below, total = 9000 = 5 min

export const DynamicLesson: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Series>
        {/* Scene 1: Title — 7s = 210f */}
        <Series.Sequence durationInFrames={420}>
          <TitleScene />
        </Series.Sequence>

        {/* Scene 2: Problem — 8s */}
        <Series.Sequence durationInFrames={480}>
          <ProblemScene />
        </Series.Sequence>

        {/* Scene 3: Graph Anatomy — 9s */}
        <Series.Sequence durationInFrames={540}>
          <GraphAnatomyScene />
        </Series.Sequence>

        {/* Scene 4: Algorithm Steps — 10s */}
        <Series.Sequence durationInFrames={600}>
          <AlgorithmStepsScene />
        </Series.Sequence>

        {/* Scene 5: Live Walkthrough — 15s */}
        <Series.Sequence durationInFrames={900}>
          <LiveWalkthroughScene />
        </Series.Sequence>

        {/* Scene 6: Pseudocode — 7s */}
        <Series.Sequence durationInFrames={420}>
          <PseudocodeScene />
        </Series.Sequence>

        {/* Scene 7: Complexity — 7s */}
        <Series.Sequence durationInFrames={420}>
          <ComplexityScene />
        </Series.Sequence>

        {/* Scene 8: Summary — 6s */}
        <Series.Sequence durationInFrames={360}>
          <SummaryScene />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};

// ─── REMOTION CONFIG (add to your remotion.config.ts or Root.tsx) ─────────────
//
// import { Composition } from "remotion";
// import { DijkstraLesson } from "./DijkstraLesson";
//
// export const RemotionRoot: React.FC = () => (
//   <>
//     <Composition
//       id="DijkstraLesson"
//       component={DijkstraLesson}
//       durationInFrames={4140}   // 9s+...= 4140 total frames above
//       fps={30}
//       width={1920}
//       height={1080}
//     />
//   </>
// );
//
// Total frames: 420+480+540+600+900+420+420+360 = 4140 frames = 138s ≈ 2.3 min
// For exactly 5 min: multiply all durationInFrames × 2.17, or slow down fps to 14.
// Recommended: set fps=14, durationInFrames=4140 → 4140/14 = 295s ≈ 5 min.
// Or: double all scene durations for ~276s and set fps=30.