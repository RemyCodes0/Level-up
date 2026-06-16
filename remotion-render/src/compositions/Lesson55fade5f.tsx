import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Series, Audio, staticFile } from "remotion";
import React from "react";

const fps = 30;

function useFade(start: number, end: number) {
  const frame = useCurrentFrame();
  return interpolate(frame, [start, end], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
}

function useSpringVal(startFrame: number, config = { damping: 12, stiffness: 150 }) {
  const frame = useCurrentFrame();
  const { fps: f } = useVideoConfig();
  return spring({ frame: frame - startFrame, fps: f, config });
}

const Title: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ fontFamily: "Georgia, serif", fontWeight: "bold", ...style }}>{children}</div>
);

const FadeIn: React.FC<{ start: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ start, children, style }) => {
  const op = useFade(start, start + 20);
  return <div style={{ opacity: op, ...style }}>{children}</div>;
};

// Scene 1: Intro
const Scene1: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps: f } = useVideoConfig();
  const titleSpring = spring({ frame: frame - 10, fps: f, config: { damping: 14, stiffness: 120 } });
  const sub1Spring = spring({ frame: frame - 30, fps: f, config: { damping: 14, stiffness: 120 } });
  const curveProgress = interpolate(frame, [60, 160], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const W = 760, H = 120;
  const pts = Array.from({ length: 60 }, (_, i) => {
    const t = i / 59;
    const x = t * W;
    const y = H - 20 - Math.sin(t * Math.PI) * (H - 40);
    return `${x},${y}`;
  });
  const visiblePts = pts.slice(0, Math.max(2, Math.floor(curveProgress * 60)));
  const pathD = `M ${visiblePts.join(" L ")} L ${visiblePts[visiblePts.length - 1].split(",")[0]},${H} L 0,${H} Z`;

  return (
    <AbsoluteFill style={{ background: "#0a1628", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <Audio src={staticFile("audio/0a123c02-da3c-4923-ab9e-fe353037647c.mp3")} />
      <FadeIn start={0} style={{ color: "#FFD700", fontSize: 28, letterSpacing: 4, marginBottom: 16 }}>Lesson 2</FadeIn>
      <div style={{ transform: `translateY(${(1 - titleSpring) * 40}px)`, opacity: titleSpring }}>
        <Title style={{ color: "#fff", fontSize: 58, textAlign: "center", lineHeight: 1.1 }}>The Definite Integral</Title>
      </div>
      <div style={{ transform: `translateY(${(1 - sub1Spring) * 30}px)`, opacity: sub1Spring }}>
        <Title style={{ color: "#fff", fontSize: 34, textAlign: "center", fontWeight: "normal", marginTop: 12 }}>& the Fundamental Theorem of Calculus</Title>
      </div>
      <div style={{ marginTop: 48, width: 760, height: 120 }}>
        <svg width="760" height="120" style={{ overflow: "visible" }}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4dd9ac" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#4dd9ac" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          {curveProgress > 0.02 && <path d={pathD} fill="url(#areaGrad)" />}
          {visiblePts.length > 1 && <polyline points={visiblePts.join(" ")} fill="none" stroke="#4dd9ac" strokeWidth="3" />}
        </svg>
      </div>
    </AbsoluteFill>
  );
};

// Scene 2: Notation
const Scene2: React.FC = () => {
  const labels = [
    { text: "lower bound a", delay: 40, x: 180, y: 320 },
    { text: "upper bound b", delay: 80, x: 180, y: 200 },
    { text: "the function", delay: 120, x: 520, y: 260 },
    { text: "variable of integration", delay: 160, x: 520, y: 310 },
  ];
  return (
    <AbsoluteFill style={{ background: "#fff", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <Audio src={staticFile("audio/eda5fd63-8134-4021-87cd-8488654beafd.mp3")} />
      <FadeIn start={0} style={{ fontSize: 22, color: "#555", marginBottom: 20 }}>Definite Integral Notation</FadeIn>
      <div style={{ fontSize: 96, color: "#1a237e", fontFamily: "Georgia, serif", lineHeight: 1 }}>
        ∫<sub style={{ fontSize: 40 }}>a</sub><sup style={{ fontSize: 40 }}>b</sup> f(x) dx
      </div>
      <div style={{ position: "relative", width: 600, height: 160, marginTop: 20 }}>
        {labels.map((l, i) => (
          <FadeIn key={i} start={l.delay} style={{ position: "absolute", left: l.x, top: l.y - 260, color: "#E65100", fontSize: 18, fontWeight: "bold", background: "#FFF3E0", padding: "4px 10px", borderRadius: 6 }}>
            {l.text}
          </FadeIn>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// Scene 3: Area diagram
const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const shadeProgress = interpolate(frame, [20, 80], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const labelOp = useFade(90, 110);
  const W = 500, H = 280, offX = 80, offY = 30;
  const curvePoints: [number, number][] = Array.from({ length: 50 }, (_, i) => {
    const t = i / 49;
    const x = offX + t * W;
    const y = offY + H - 20 - Math.sin(t * Math.PI) * (H - 60);
    return [x, y];
  });
  const visibleCount = Math.max(2, Math.floor(shadeProgress * 50));
  const vp = curvePoints.slice(0, visibleCount);
  const shadeD = vp.length > 1 ? `M ${vp.map(p => p.join(",")).join(" L ")} L ${vp[vp.length - 1][0]},${offY + H} L ${vp[0][0]},${offY + H} Z` : "";

  return (
    <AbsoluteFill style={{ background: "#fff", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <Audio src={staticFile("audio/e85a5023-de92-4b4b-9e33-33503ad0f117.mp3")} />
      <FadeIn start={0} style={{ fontSize: 22, color: "#1a237e", fontWeight: "bold", marginBottom: 10 }}>Area Between Curve and X-Axis</FadeIn>
      <svg width="680" height="340">
        <line x1={offX} y1={offY} x2={offX} y2={offY + H} stroke="#333" strokeWidth="2" />
        <line x1={offX} y1={offY + H} x2={offX + W + 20} y2={offY + H} stroke="#333" strokeWidth="2" />
        {shadeD && <path d={shadeD} fill="#4dd9ac" fillOpacity="0.4" />}
        {vp.length > 1 && <polyline points={vp.map(p => p.join(",")).join(" ")} fill="none" stroke="#1a237e" strokeWidth="3" />}
        <line x1={offX} y1={offY + 10} x2={offX} y2={offY + H} stroke="#555" strokeWidth="1.5" strokeDasharray="6,4" />
        <line x1={offX + W} y1={offY + 10} x2={offX + W} y2={offY + H} stroke="#555" strokeWidth="1.5" strokeDasharray="6,4" />
        <text x={offX - 4} y={offY + H + 18} textAnchor="middle" fontSize="18" fill="#1a237e" fontStyle="italic">a</text>
        <text x={offX + W + 4} y={offY + H + 18} textAnchor="middle" fontSize="18" fill="#1a237e" fontStyle="italic">b</text>
        <line x1={offX} y1={offY + H + 30} x2={offX + W} y2={offY + H + 30} stroke="#333" strokeWidth="1.5" markerEnd="url(#arr)" />
      </svg>
      <div style={{ opacity: labelOp, fontSize: 22, color: "#E65100", fontWeight: "bold", marginTop: -10 }}>↑ Net Signed Area</div>
    </AbsoluteFill>
  );
};

// Scene 4: Signed area
const Scene4: React.FC = () => {
  const frame = useCurrentFrame();
  const posOp = useFade(10, 30);
  const negOp = useFade(50, 70);
  const W = 440, H = 240, ox = 60, oy = 40;
  const curve: [number, number][] = Array.from({ length: 60 }, (_, i) => {
    const t = i / 59;
    const x = ox + t * W;
    const y = oy + H / 2 - Math.sin(t * Math.PI * 2) * (H / 2 - 20);
    return [x, y];
  });
  const mid = Math.floor(curve.length / 2);
  const above = curve.slice(0, mid + 1);
  const below = curve.slice(mid);
  const aboveD = `M ${above.map(p => p.join(",")).join(" L ")} L ${above[above.length - 1][0]},${oy + H / 2} L ${above[0][0]},${oy + H / 2} Z`;
  const belowD = `M ${below.map(p => p.join(",")).join(" L ")} L ${below[below.length - 1][0]},${oy + H / 2} L ${below[0][0]},${oy + H / 2} Z`;

  return (
    <AbsoluteFill style={{ background: "#fff", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <Audio src={staticFile("audio/5e2f2a20-6877-4f94-9d1c-25da4fedd4cb.mp3")} />
      <FadeIn start={0} style={{ fontSize: 22, color: "#1a237e", fontWeight: "bold", marginBottom: 10 }}>Net Signed Area: + Above, − Below</FadeIn>
      <svg width="580" height="320">
        <line x1={ox} y1={oy} x2={ox} y2={oy + H} stroke="#333" strokeWidth="2" />
        <line x1={ox} y1={oy + H / 2} x2={ox + W + 20} y2={oy + H / 2} stroke="#333" strokeWidth="2" />
        <path d={aboveD} fill="#4CAF50" fillOpacity={posOp * 0.5} />
        <path d={belowD} fill="#F44336" fillOpacity={negOp * 0.5} />
        <polyline points={curve.map(p => p.join(",")).join(" ")} fill="none" stroke="#1a237e" strokeWidth="3" />
        {posOp > 0.1 && <text x={ox + W / 4} y={oy + H / 2 - 50} textAnchor="middle" fontSize="32" fill="#2e7d32" opacity={posOp}>+</text>}
        {posOp > 0.1 && <text x={ox + W / 4} y={oy + H / 2 - 18} textAnchor="middle" fontSize="15" fill="#2e7d32" opacity={posOp}>Positive Area</text>}
        {negOp > 0.1 && <text x={ox + W * 3 / 4} y={oy + H / 2 + 50} textAnchor="middle" fontSize="32" fill="#c62828" opacity={negOp}>−</text>}
        {negOp > 0.1 && <text x={ox + W * 3 / 4} y={oy + H / 2 + 70} textAnchor="middle" fontSize="15" fill="#c62828" opacity={negOp}>Negative Area</text>}
      </svg>
    </AbsoluteFill>
  );
};

// Scene 5: Net area example
const Scene5: React.FC = () => (
  <AbsoluteFill style={{ background: "#fff", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
    <Audio src={staticFile("audio/26e3be21-c7db-4538-837e-7a52a2aaf421.mp3")} />
    <FadeIn start={0} style={{ fontSize: 22, color: "#1a237e", fontWeight: "bold" }}>Net Area Example</FadeIn>
    <FadeIn start={20} style={{ fontSize: 32, color: "#2e7d32", fontWeight: "bold" }}>Area above = 10</FadeIn>
    <FadeIn start={60} style={{ fontSize: 32, color: "#c62828", fontWeight: "bold" }}>Area below = 4</FadeIn>
    <FadeIn start={100} style={{ fontSize: 48, color: "#E65100", fontWeight: "bold" }}>10 − 4 = 6</FadeIn>
    <FadeIn start={140} style={{ fontSize: 32, color: "#1a237e" }}>∫<sub>a</sub><sup>b</sup> f(x) dx = 6</FadeIn>
  </AbsoluteFill>
);

// Scene 6: FTC concept
const Scene6: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps: f } = useVideoConfig();
  const titleOp = useFade(0, 25);
  const leftSpring = spring({ frame: frame - 30, fps: f, config: { damping: 12 } });
  const rightSpring = spring({ frame: frame - 50, fps: f, config: { damping: 12 } });
  const arrowOp = useFade(80, 100);

  return (
    <AbsoluteFill style={{ background: "#0d1b2a", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <Audio src={staticFile("audio/6bb02ed1-2f2e-456a-9fa7-276a0a8c6d56.mp3")} />
      <div style={{ opacity: titleOp, fontSize: 32, color: "#fff", fontWeight: "bold", marginBottom: 40, fontFamily: "Georgia,serif" }}>Fundamental Theorem of Calculus</div>
      <div style={{ display: "flex", alignItems: "center", gap: 60 }}>
        <div style={{ transform: `translateX(${(1 - leftSpring) * -80}px)`, opacity: leftSpring, textAlign: "center" }}>
          <div style={{ fontSize: 28, color: "#FFD700", fontWeight: "bold" }}>Differentiation</div>
          <div style={{ fontSize: 40, color: "#FFD700" }}>↓</div>
        </div>
        <div style={{ opacity: arrowOp, textAlign: "center" }}>
          <div style={{ fontSize: 20, color: "#fff", fontWeight: "bold", marginBottom: 8 }}>Inverse Operations</div>
          <div style={{ fontSize: 48, color: "#fff" }}>⟷</div>
        </div>
        <div style={{ transform: `translateX(${(1 - rightSpring) * 80}px)`, opacity: rightSpring, textAlign: "center" }}>
          <div style={{ fontSize: 28, color: "#4dd9ac", fontWeight: "bold" }}>Integration</div>
          <div style={{ fontSize: 40, color: "#4dd9ac" }}>↑</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 7: FTC formula
const Scene7: React.FC = () => (
  <AbsoluteFill style={{ background: "#fff", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 20 }}>
    <Audio src={staticFile("audio/9999e0e7-b6fa-485c-8ae9-9fec4d194d55.mp3")} />
    <FadeIn start={0} style={{ fontSize: 24, color: "#1a237e" }}>If F′(x) = f(x)</FadeIn>
    <FadeIn start={20} style={{ fontSize: 16, color: "#888", fontStyle: "italic" }}>F is an antiderivative of f</FadeIn>
    <FadeIn start={50} style={{ fontSize: 36, color: "#E65100", fontWeight: "bold" }}>↓</FadeIn>
    <FadeIn start={70} style={{ fontSize: 44, color: "#E65100", fontWeight: "bold", fontFamily: "Georgia,serif" }}>
      ∫<sub>a</sub><sup>b</sup> f(x) dx = <span style={{ color: "#2e7d32" }}>F(b)</span> − <span style={{ color: "#c62828" }}>F(a)</span>
    </FadeIn>
    <div style={{ display: "flex", gap: 60, marginTop: 10 }}>
      <FadeIn start={110} style={{ fontSize: 16, color: "#2e7d32" }}>upper bound evaluated</FadeIn>
      <FadeIn start={130} style={{ fontSize: 16, color: "#c62828" }}>lower bound evaluated</FadeIn>
    </div>
  </AbsoluteFill>
);

// Scene 8: Steps
const Scene8: React.FC = () => (
  <AbsoluteFill style={{ background: "#fff", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 24 }}>
    <Audio src={staticFile("audio/ac3ee42a-dee3-468b-a6fa-65ebf4a83e54.mp3")} />
    <div style={{ background: "#f5f5f5", borderRadius: 16, padding: "40px 60px", minWidth: 500 }}>
      <FadeIn start={0} style={{ fontSize: 20, color: "#555", marginBottom: 12 }}>Step 1</FadeIn>
      <FadeIn start={0} style={{ fontSize: 44, color: "#1a237e", fontFamily: "Georgia,serif" }}>∫<sub>1</sub><sup>3</sup> 2x dx</FadeIn>
      <div style={{ borderTop: "1px solid #ddd", margin: "20px 0" }} />
      <FadeIn start={60} style={{ fontSize: 20, color: "#555", marginBottom: 6 }}>Step 2</FadeIn>
      <FadeIn start={60}>
        <span style={{ fontSize: 22, color: "#E65100", fontWeight: "bold" }}>Antiderivative: </span>
        <span style={{ fontSize: 28, color: "#1a237e" }}>F(x) = x²</span>
      </FadeIn>
      <div style={{ borderTop: "1px solid #ddd", margin: "20px 0" }} />
      <FadeIn start={120} style={{ fontSize: 20, color: "#555", marginBottom: 6 }}>Step 3</FadeIn>
      <FadeIn start={120} style={{ fontSize: 34, fontFamily: "Georgia,serif" }}>
        <span style={{ color: "#2e7d32" }}>F(3)</span> − <span style={{ color: "#c62828" }}>F(1)</span>
      </FadeIn>
    </div>
  </AbsoluteFill>
);

// Scene 9: Result
const Scene9: React.FC = () => {
  const W = 260, H = 220, ox = 20, oy = 10;
  const linePoints: [number, number][] = [[ox + 20, oy + H - 10], [ox + W, oy + 10]];
  const shadeD = `M ${ox + 60},${oy + H - 10} L ${ox + W},${oy + 10} L ${ox + W},${oy + H - 10} Z`;
  return (
    <AbsoluteFill style={{ background: "#fff", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 40 }}>
      <Audio src={staticFile("audio/2ae65bfd-e9d3-4232-a06b-88310217c24b.mp3")} />
      <div style={{ flexDirection: "column", display: "flex", gap: 14 }}>
        <FadeIn start={0} style={{ fontSize: 28, color: "#1a237e" }}>F(3) − F(1)</FadeIn>
        <FadeIn start={30} style={{ fontSize: 28, color: "#1a237e" }}>= 3² − 1²</FadeIn>
        <FadeIn start={60} style={{ fontSize: 28, color: "#1a237e" }}>= 9 − 1</FadeIn>
        <FadeIn start={90}>
          <div style={{ fontSize: 48, color: "#E65100", fontWeight: "bold", background: "#FFF3E0", padding: "8px 24px", borderRadius: 10 }}>= 8</div>
        </FadeIn>
      </div>
      <FadeIn start={110}>
        <svg width={W + 40} height={H + 40}>
          <line x1={ox} y1={oy + H - 10} x2={ox + W + 10} y2={oy + H - 10} stroke="#333" strokeWidth="2" />
          <line x1={ox + 20} y1={oy} x2={ox + 20} y2={oy + H} stroke="#333" strokeWidth="2" />
          <path d={shadeD} fill="#4dd9ac" fillOpacity="0.5" />
          <polyline points={linePoints.map(p => p.join(",")).join(" ")} stroke="#1a237e" strokeWidth="3" fill="none" />
          <text x={ox + W / 2 + 30} y={oy + H / 2 + 20} textAnchor="middle" fontSize="14" fill="#E65100" fontWeight="bold">8 sq units</text>
        </svg>
      </FadeIn>
    </AbsoluteFill>
  );
};

// Scene 10: Swap bounds
const Scene10: React.FC = () => (
  <AbsoluteFill style={{ background: "#fff", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 0 }}>
    <Audio src={staticFile("audio/60e2942e-5cb7-4f6a-93f2-1ee04ae4fd14.mp3")} />
    <FadeIn start={0} style={{ flex: 1, textAlign: "center", padding: 30 }}>
      <div style={{ fontSize: 36, color: "#1a237e", fontFamily: "Georgia,serif" }}>∫<sub>a</sub><sup>b</sup> f(x) dx</div>
      <div style={{ fontSize: 22, color: "#2e7d32", marginTop: 16 }}>→ a to b</div>
    </FadeIn>
    <FadeIn start={30} style={{ fontSize: 52, color: "#333", fontWeight: "bold" }}>= −</FadeIn>
    <FadeIn start={60} style={{ flex: 1, textAlign: "center", padding: 30 }}>
      <div style={{ fontSize: 36, color: "#1a237e", fontFamily: "Georgia,serif" }}>∫<sub>b</sub><sup>a</sup> f(x) dx</div>
      <div style={{ fontSize: 22, color: "#c62828", marginTop: 16 }}>← b to a</div>
    </FadeIn>
  </AbsoluteFill>
);

// Scene 11: Zero width
const Scene11: React.FC = () => (
  <AbsoluteFill style={{ background: "#fff", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 20 }}>
    <Audio src={staticFile("audio/646608a7-7b79-4e40-a4b7-4e9ba47e7127.mp3")} />
    <FadeIn start={0} style={{ fontSize: 22, color: "#1a237e", fontWeight: "bold" }}>Property: Same Bounds = Zero</FadeIn>
    <svg width="400" height="200">
      <line x1="40" y1="20" x2="40" y2="160" stroke="#333" strokeWidth="2" />
      <line x1="40" y1="160" x2="380" y2="160" stroke="#333" strokeWidth="2" />
      <path d="M 60,140 Q 140,40 220,80 Q 300,120 360,50" fill="none" stroke="#1a237e" strokeWidth="3" />
      <line x1="200" y1="20" x2="200" y2="160" stroke="#555" strokeWidth="2" strokeDasharray="8,5" />
      <text x="196" y="175" fontSize="18" fill="#1a237e" fontStyle="italic">a = b</text>
    </svg>
    <FadeIn start={40} style={{ fontSize: 44, color: "#E65100", fontWeight: "bold", fontFamily: "Georgia,serif" }}>
      ∫<sub>a</sub><sup>a</sup> f(x) dx = 0
    </FadeIn>
    <FadeIn start={70} style={{ fontSize: 16, color: "#888", fontStyle: "italic" }}>No width, no area</FadeIn>
  </AbsoluteFill>
);

// Scene 12: Additivity
const Scene12: React.FC = () => {
  const W = 480, H = 200, ox = 40, oy = 20;
  const curve: [number, number][] = Array.from({ length: 60 }, (_, i) => {
    const t = i / 59;
    return [ox + t * W, oy + H - 20 - Math.sin(t * Math.PI) * (H - 60)];
  });
  const mid = 30;
  const leftD = `M ${curve.slice(0, mid + 1).map(p => p.join(",")).join(" L ")} L ${curve[mid][0]},${oy + H} L ${curve[0][0]},${oy + H} Z`;
  const rightD = `M ${curve.slice(mid).map(p => p.join(",")).join(" L ")} L ${curve[59][0]},${oy + H} L ${curve[mid][0]},${oy + H} Z`;
  return (
    <AbsoluteFill style={{ background: "#fff", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <Audio src={staticFile("audio/de4a1661-0630-447e-8e50-9e5f2077c44d.mp3")} />
      <FadeIn start={0} style={{ fontSize: 20, color: "#1a237e", fontWeight: "bold", marginBottom: 10 }}>Additivity: Split or Combine Intervals</FadeIn>
      <svg width="580" height="280">
        <path d={leftD} fill="#4dd9ac" fillOpacity="0.5" />
        <path d={rightD} fill="#9c27b0" fillOpacity="0.3" />
        <polyline points={curve.map(p => p.join(",")).join(" ")} fill="none" stroke="#1a237e" strokeWidth="3" />
        <line x1={ox} y1={oy} x2={ox} y2={oy + H} stroke="#555" strokeDasharray="6,4" strokeWidth="1.5" />
        <line x1={curve[mid][0]} y1={oy} x2={curve[mid][0]} y2={oy + H} stroke="#555" strokeDasharray="6,4" strokeWidth="1.5" />
        <line x1={ox + W} y1={oy} x2={ox + W} y2={oy + H} stroke="#555" strokeDasharray="6,4" strokeWidth="1.5" />
        <text x={ox} y={oy + H + 18} textAnchor="middle" fontSize="16" fill="#1a237e" fontStyle="italic">a</text>
        <text x={curve[mid][0]} y={oy + H + 18} textAnchor="middle" fontSize="16" fill="#1a237e" fontStyle="italic">b</text>
        <text x={ox + W} y={oy + H + 18} textAnchor="middle" fontSize="16" fill="#1a237e" fontStyle="italic">c</text>
        <text x={ox + W / 4} y={oy + H / 2} textAnchor="middle" fontSize="14" fill="#00695c">∫[a→b]</text>
        <text x={ox + W * 3 / 4} y={oy + H / 2} textAnchor="middle" fontSize="14" fill="#6a1b9a">∫[b→c]</text>
      </svg>
      <FadeIn start={60} style={{ fontSize: 24, color: "#1a237e", fontWeight: "bold" }}>∫[a→b] + ∫[b→c] = ∫[a→c]</FadeIn>
    </AbsoluteFill>
  );
};

// Scene 13: Summary
const Scene13: React.FC = () => {
  const bullets = [
    { text: "Definite integral = net signed area", delay: 20 },
    { text: "FTC: ∫[a→b] f(x) dx = F(b) − F(a)", delay: 80 },
    { text: "Properties: swapped bounds, zero-width, additivity", delay: 140 },
  ];
  return (
    <AbsoluteFill style={{ background: "#0d1b2a", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 24 }}>
      <Audio src={staticFile("audio/5e75ee75-ddee-42e6-b954-1c44338b5c28.mp3")} />
      <FadeIn start={0} style={{ fontSize: 36, color: "#FFD700", fontWeight: "bold", marginBottom: 20 }}>Key Takeaways</FadeIn>
      {bullets.map((b, i) => (
        <FadeIn key={i} start={b.delay} style={{ fontSize: i === 1 ? 22 : 20, color: i === 1 ? "#E65100" : "#fff", display: "flex", alignItems: "center", gap: 12, maxWidth: 640 }}>
          <span style={{ color: "#4dd9ac", fontSize: 24 }}>●</span>
          <span style={{ fontWeight: i === 1 ? "bold" : "normal" }}>{b.text}</span>
        </FadeIn>
      ))}
    </AbsoluteFill>
  );
};

// Scene 14: Closing
const Scene14: React.FC = () => {
  const frame = useCurrentFrame();
  const glow = interpolate(Math.sin(frame * 0.05), [-1, 1], [0.7, 1]);
  return (
    <AbsoluteFill style={{ background: "linear-gradient(135deg,#0a1628 0%,#1a237e 100%)", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 24 }}>
      <Audio src={staticFile("audio/67ce935f-09a9-4fa0-b56e-940b5524f0b1.mp3")} />
      <FadeIn start={0} style={{ fontSize: 48, color: "#FFD700", fontWeight: "bold", fontFamily: "Georgia,serif", opacity: glow, textAlign: "center" }}>
        ∫<sub>a</sub><sup>b</sup> f(x) dx = F(b) − F(a)
      </FadeIn>
      <FadeIn start={40} style={{ display: "flex", alignItems: "center", gap: 40, marginTop: 20 }}>
        <span style={{ fontSize: 24, color: "#4dd9ac" }}>Derivatives</span>
        <span style={{ fontSize: 28, color: "#fff" }}>⟷</span>
        <span style={{ fontSize: 24, color: "#E65100" }}>Integrals</span>
      </FadeIn>
      <FadeIn start={80} style={{ fontSize: 20, color: "#fff", fontStyle: "italic" }}>Two sides of one coin</FadeIn>
    </AbsoluteFill>
  );
};

export const Lesson55fade5f = () => (
  <Series>
    <Series.Sequence durationInFrames={404}><Scene1 /></Series.Sequence>
    <Series.Sequence durationInFrames={431}><Scene2 /></Series.Sequence>
    <Series.Sequence durationInFrames={445}><Scene3 /></Series.Sequence>
    <Series.Sequence durationInFrames={380}><Scene4 /></Series.Sequence>
    <Series.Sequence durationInFrames={358}><Scene5 /></Series.Sequence>
    <Series.Sequence durationInFrames={414}><Scene6 /></Series.Sequence>
    <Series.Sequence durationInFrames={392}><Scene7 /></Series.Sequence>
    <Series.Sequence durationInFrames={486}><Scene8 /></Series.Sequence>
    <Series.Sequence durationInFrames={463}><Scene9 /></Series.Sequence>
    <Series.Sequence durationInFrames={396}><Scene10 /></Series.Sequence>
    <Series.Sequence durationInFrames={322}><Scene11 /></Series.Sequence>
    <Series.Sequence durationInFrames={394}><Scene12 /></Series.Sequence>
    <Series.Sequence durationInFrames={455}><Scene13 /></Series.Sequence>
    <Series.Sequence durationInFrames={474}><Scene14 /></Series.Sequence>
  </Series>
);