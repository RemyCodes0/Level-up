import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Series,
  Audio,
  staticFile,
} from "remotion";

const COLORS = {
  deepBlue: "#0a1628",
  blue: "#1e3a8a",
  lightBlue: "#3b82f6",
  gold: "#f59e0b",
  white: "#ffffff",
  green: "#22c55e",
  lightGreen: "#bbf7d0",
  red: "#ef4444",
  teal: "#14b8a6",
  orange: "#f97316",
  darkBg: "#0f172a",
};

const useFade = (start: number, end: number) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [start, end], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
};

const Title: React.FC<{ text: string; color?: string; size?: number; style?: React.CSSProperties }> = ({
  text, color = COLORS.white, size = 48, style = {}
}) => (
  <div style={{ color, fontSize: size, fontWeight: "bold", fontFamily: "Georgia, serif", textAlign: "center", ...style }}>
    {text}
  </div>
);

const CoordPlane: React.FC<{ width?: number; height?: number }> = ({ width = 400, height = 300 }) => (
  <svg width={width} height={height} style={{ display: "block" }}>
    <rect width={width} height={height} fill="#1e293b" rx={8} />
    <line x1={40} y1={height - 40} x2={width - 20} y2={height - 40} stroke="#94a3b8" strokeWidth={2} />
    <line x1={40} y1={20} x2={40} y2={height - 40} stroke="#94a3b8" strokeWidth={2} />
    <text x={width - 15} y={height - 35} fill="#94a3b8" fontSize={12}>x</text>
    <text x={45} y={18} fill="#94a3b8" fontSize={12}>y</text>
  </svg>
);

const FadeIn: React.FC<{ delay?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  delay = 0, children, style = {}
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [delay, delay + 20], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  return <div style={{ opacity, ...style }}>{children}</div>;
};

// Scene 1: Intro
const Scene1: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleOp = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });
  const sub1Op = interpolate(frame, [40, 70], [0, 1], { extrapolateRight: "clamp" });
  const icon1Op = interpolate(frame, [80, 110], [0, 1], { extrapolateRight: "clamp" });
  const icon2Op = interpolate(frame, [110, 140], [0, 1], { extrapolateRight: "clamp" });
  const icon3Op = interpolate(frame, [140, 170], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.deepBlue, alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <div style={{ opacity: titleOp, textAlign: "center" }}>
        <Title text="Applications of Integration" size={54} color={COLORS.white} />
      </div>
      <div style={{ opacity: sub1Op, marginTop: 16 }}>
        <Title text="Area, Volume, and Accumulation" size={32} color={COLORS.gold} />
      </div>
      <div style={{ display: "flex", gap: 60, marginTop: 60 }}>
        <div style={{ opacity: icon1Op, textAlign: "center" }}>
          <svg width={100} height={80}>
            <path d="M10,70 Q30,20 50,30 Q70,40 90,70 Z" fill="#22c55e" opacity={0.7} />
            <path d="M10,70 Q30,50 50,55 Q70,60 90,70" fill="none" stroke="#ef4444" strokeWidth={2} />
            <path d="M10,70 Q30,20 50,30 Q70,40 90,70" fill="none" stroke="#3b82f6" strokeWidth={2} />
          </svg>
          <div style={{ color: COLORS.white, fontSize: 12 }}>Area</div>
        </div>
        <div style={{ opacity: icon2Op, textAlign: "center" }}>
          <svg width={100} height={80}>
            <ellipse cx={50} cy={40} rx={30} ry={35} fill="#14b8a6" opacity={0.6} />
            <ellipse cx={50} cy={40} rx={8} ry={35} fill="none" stroke="#14b8a6" strokeWidth={1} strokeDasharray="4,2" />
          </svg>
          <div style={{ color: COLORS.white, fontSize: 12 }}>Volume</div>
        </div>
        <div style={{ opacity: icon3Op, textAlign: "center" }}>
          <svg width={100} height={80}>
            <rect x={10} y={70} width={80} height={2} fill="#94a3b8" />
            <path d="M10,60 Q30,20 50,30 Q70,40 90,15" fill="none" stroke="#3b82f6" strokeWidth={2} />
            <path d="M10,60 Q30,20 50,30 Q70,40 90,15 L90,70 L10,70 Z" fill="#3b82f6" opacity={0.3} />
          </svg>
          <div style={{ color: COLORS.white, fontSize: 12 }}>Accumulation</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 2: Area Between Curves
const Scene2: React.FC = () => {
  const frame = useCurrentFrame();
  const graphOp = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });
  const shadeOp = interpolate(frame, [30, 60], [0, 1], { extrapolateRight: "clamp" });
  const formulaOp = interpolate(frame, [70, 100], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.darkBg, alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <FadeIn delay={0}><Title text="Area Between Two Curves" size={36} color={COLORS.gold} style={{ marginBottom: 20 }} /></FadeIn>
      <div style={{ opacity: graphOp }}>
        <svg width={500} height={280}>
          <rect width={500} height={280} fill="#1e293b" rx={8} />
          <line x1={50} y1={250} x2={470} y2={250} stroke="#94a3b8" strokeWidth={2} />
          <line x1={50} y1={20} x2={50} y2={250} stroke="#94a3b8" strokeWidth={2} />
          <text x={100} y={265} fill="#94a3b8" fontSize={12}>a</text>
          <text x={370} y={265} fill="#94a3b8" fontSize={12}>b</text>
          <clipPath id="clip2">
            <rect x={100} y={0} width={280} height={280} />
          </clipPath>
          <path d="M100,220 Q200,60 380,80" fill="none" stroke="none" />
          <path d="M100,220 Q200,60 380,80 L380,170 Q200,190 100,220 Z" fill="#22c55e" opacity={shadeOp * 0.5} />
          <path d="M100,220 Q200,60 380,80" fill="none" stroke="#3b82f6" strokeWidth={2.5} />
          <path d="M100,220 Q200,190 380,170" fill="none" stroke="#ef4444" strokeWidth={2.5} />
          <line x1={100} y1={250} x2={100} y2={20} stroke="#94a3b8" strokeWidth={1} strokeDasharray="4,3" />
          <line x1={380} y1={250} x2={380} y2={20} stroke="#94a3b8" strokeWidth={1} strokeDasharray="4,3" />
          <text x={310} y={90} fill="#3b82f6" fontSize={14} fontWeight="bold">f(x)</text>
          <text x={310} y={165} fill="#ef4444" fontSize={14} fontWeight="bold">g(x)</text>
        </svg>
      </div>
      <div style={{ opacity: formulaOp, marginTop: 20, background: "#1e3a8a", padding: "12px 28px", borderRadius: 10 }}>
        <Title text="A = ∫[a to b] [f(x) − g(x)] dx" size={26} color={COLORS.white} />
      </div>
    </AbsoluteFill>
  );
};

// Scene 3: Find Intersection Points
const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const graphOp = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });
  const dotOp = interpolate(frame, [35, 60], [0, 1], { extrapolateRight: "clamp" });
  const calloutOp = interpolate(frame, [70, 100], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.darkBg, alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <FadeIn delay={0}><Title text="Find Intersection Points First" size={36} color={COLORS.gold} style={{ marginBottom: 20 }} /></FadeIn>
      <div style={{ opacity: graphOp }}>
        <svg width={500} height={260}>
          <rect width={500} height={260} fill="#1e293b" rx={8} />
          <line x1={50} y1={230} x2={470} y2={230} stroke="#94a3b8" strokeWidth={2} />
          <line x1={50} y1={20} x2={50} y2={230} stroke="#94a3b8" strokeWidth={2} />
          <path d="M100,200 Q200,60 380,80" fill="none" stroke="#3b82f6" strokeWidth={2.5} />
          <path d="M100,200 Q200,180 380,160" fill="none" stroke="#ef4444" strokeWidth={2.5} />
          <line x1={100} y1={230} x2={100} y2={200} stroke="#fbbf24" strokeWidth={1} strokeDasharray="4,3" />
          <line x1={380} y1={230} x2={380} y2={80} stroke="#fbbf24" strokeWidth={1} strokeDasharray="4,3" />
          <circle cx={100} cy={200} r={8} fill="#fbbf24" opacity={dotOp} />
          <circle cx={380} cy={80} r={8} fill="#fbbf24" opacity={dotOp} />
          <text x={93} y={248} fill="#fbbf24" fontSize={13} opacity={dotOp}>a</text>
          <text x={374} y={248} fill="#fbbf24" fontSize={13} opacity={dotOp}>b</text>
        </svg>
      </div>
      <div style={{ opacity: calloutOp, marginTop: 20, background: "#1e3a8a", padding: "12px 28px", borderRadius: 10, textAlign: "center" }}>
        <div style={{ color: COLORS.white, fontSize: 20 }}>Set f(x) = g(x), solve for x</div>
        <div style={{ color: COLORS.gold, fontSize: 15, marginTop: 6 }}>→ gives intersection points a and b</div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 4: Example Area
const Scene4: React.FC = () => {
  const frame = useCurrentFrame();
  const graphOp = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });
  const step1Op = interpolate(frame, [40, 65], [0, 1], { extrapolateRight: "clamp" });
  const step2Op = interpolate(frame, [80, 105], [0, 1], { extrapolateRight: "clamp" });
  const answerOp = interpolate(frame, [120, 150], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.darkBg, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 40, padding: "0 40px" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <FadeIn delay={0}><Title text="Area: y=x vs y=x²" size={28} color={COLORS.gold} style={{ marginBottom: 16 }} /></FadeIn>
        <div style={{ opacity: graphOp }}>
          <svg width={280} height={260}>
            <rect width={280} height={260} fill="#1e293b" rx={8} />
            <line x1={30} y1={230} x2={260} y2={230} stroke="#94a3b8" strokeWidth={2} />
            <line x1={30} y1={20} x2={30} y2={230} stroke="#94a3b8" strokeWidth={2} />
            <path d="M30,230 L230,30" fill="none" stroke="#3b82f6" strokeWidth={2.5} />
            <path d="M30,230 Q130,230 230,30" fill="none" stroke="#ef4444" strokeWidth={2.5} />
            <path d="M30,230 L230,30 Q130,230 30,230 Z" fill="#fef08a" opacity={0.35} />
            <circle cx={30} cy={230} r={5} fill="#fbbf24" />
            <circle cx={230} cy={30} r={5} fill="#fbbf24" />
            <text x={22} y={245} fill="#fbbf24" fontSize={11}>(0,0)</text>
            <text x={215} y={25} fill="#fbbf24" fontSize={11}>(1,1)</text>
            <text x={180} y={80} fill="#3b82f6" fontSize={13}>y=x</text>
            <text x={80} y={190} fill="#ef4444" fontSize={13}>y=x²</text>
          </svg>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ opacity: step1Op, background: "#1e3a8a", padding: "10px 18px", borderRadius: 8 }}>
          <div style={{ color: COLORS.white, fontSize: 17 }}>x² = x → x = 0, 1</div>
        </div>
        <div style={{ opacity: step2Op, background: "#1e3a8a", padding: "10px 18px", borderRadius: 8 }}>
          <div style={{ color: COLORS.white, fontSize: 15 }}>∫₀¹ (x − x²) dx</div>
          <div style={{ color: COLORS.white, fontSize: 15 }}> = [x²/2 − x³/3]₀¹</div>
          <div style={{ color: COLORS.white, fontSize: 15 }}> = 1/2 − 1/3</div>
        </div>
        <div style={{ opacity: answerOp, background: "#15803d", padding: "12px 18px", borderRadius: 8, textAlign: "center" }}>
          <div style={{ color: COLORS.white, fontSize: 26, fontWeight: "bold" }}>Answer = 1/6</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 5: Disk Method
const Scene5: React.FC = () => {
  const frame = useCurrentFrame();
  const leftOp = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });
  const rightOp = interpolate(frame, [40, 70], [0, 1], { extrapolateRight: "clamp" });
  const formulaOp = interpolate(frame, [90, 120], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.darkBg, alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <FadeIn delay={0}><Title text="Disk Method: Solid of Revolution" size={34} color={COLORS.gold} style={{ marginBottom: 20 }} /></FadeIn>
      <div style={{ display: "flex", gap: 50, alignItems: "center" }}>
        <div style={{ opacity: leftOp }}>
          <svg width={200} height={200}>
            <rect width={200} height={200} fill="#1e293b" rx={8} />
            <line x1={20} y1={180} x2={185} y2={180} stroke="#94a3b8" strokeWidth={2} />
            <line x1={20} y1={10} x2={20} y2={180} stroke="#94a3b8" strokeWidth={2} />
            <path d="M20,160 Q80,60 180,40" fill="none" stroke="#3b82f6" strokeWidth={2.5} />
            <text x={140} y={60} fill="#3b82f6" fontSize={13}>y=f(x)</text>
          </svg>
        </div>
        <div style={{ color: COLORS.white, fontSize: 28 }}>→</div>
        <div style={{ opacity: rightOp }}>
          <svg width={200} height={200}>
            <rect width={200} height={200} fill="#1e293b" rx={8} />
            <ellipse cx={100} cy={100} rx={80} ry={90} fill="#14b8a6" opacity={0.4} />
            <ellipse cx={100} cy={100} rx={80} ry={90} fill="none" stroke="#14b8a6" strokeWidth={2} />
            <ellipse cx={100} cy={100} rx={20} ry={90} fill="none" stroke="#0d9488" strokeWidth={1} strokeDasharray="4,2" />
            <ellipse cx={100} cy={110} rx={22} ry={8} fill="#ef4444" opacity={0.7} stroke="#ef4444" strokeWidth={1} />
            <text x={125} y={108} fill="#ef4444" fontSize={11}>r=f(x)</text>
          </svg>
        </div>
      </div>
      <div style={{ opacity: formulaOp, marginTop: 24, background: "#1e3a8a", padding: "12px 28px", borderRadius: 10 }}>
        <Title text="V = π ∫[a to b] [f(x)]² dx" size={26} color={COLORS.white} />
      </div>
    </AbsoluteFill>
  );
};

// Scene 6: Each Disk
const Scene6: React.FC = () => {
  const frame = useCurrentFrame();
  const diskOp = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });
  const eq1Op = interpolate(frame, [40, 65], [0, 1], { extrapolateRight: "clamp" });
  const eq2Op = interpolate(frame, [80, 105], [0, 1], { extrapolateRight: "clamp" });
  const eq3Op = interpolate(frame, [120, 150], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.darkBg, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 50 }}>
      <div style={{ opacity: diskOp }}>
        <svg width={200} height={200}>
          <rect width={200} height={200} fill="#1e293b" rx={8} />
          <ellipse cx={100} cy={100} rx={70} ry={70} fill="#14b8a6" opacity={0.5} />
          <ellipse cx={100} cy={100} rx={70} ry={70} fill="none" stroke="#14b8a6" strokeWidth={2} />
          <line x1={100} y1={100} x2={170} y2={100} stroke="#fbbf24" strokeWidth={2} />
          <text x={120} y={95} fill="#fbbf24" fontSize={13}>r = f(x)</text>
          <line x1={30} y1={165} x2={30} y2={190} stroke="#ef4444" strokeWidth={2} />
          <line x1={170} y1={165} x2={170} y2={190} stroke="#ef4444" strokeWidth={2} />
          <line x1={30} y1={180} x2={170} y2={180} stroke="#ef4444" strokeWidth={2} />
          <text x={75} y={198} fill="#ef4444" fontSize={12}>dx</text>
        </svg>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <FadeIn delay={0}><Title text="Each Disk: Area × Thickness" size={28} color={COLORS.gold} style={{ marginBottom: 10 }} /></FadeIn>
        <div style={{ opacity: eq1Op, background: "#1e3a8a", padding: "8px 18px", borderRadius: 8 }}>
          <div style={{ color: COLORS.white, fontSize: 18 }}>Area of disk = π[f(x)]²</div>
        </div>
        <div style={{ opacity: eq2Op, background: "#1e3a8a", padding: "8px 18px", borderRadius: 8 }}>
          <div style={{ color: COLORS.white, fontSize: 18 }}>Volume element = π[f(x)]² dx</div>
        </div>
        <div style={{ opacity: eq3Op, background: "#1e3a8a", padding: "8px 18px", borderRadius: 8 }}>
          <div style={{ color: COLORS.white, fontSize: 18 }}>V = π ∫[a to b] [f(x)]² dx</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 7: Washer Method
const Scene7: React.FC = () => {
  const frame = useCurrentFrame();
  const leftOp = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });
  const rightOp = interpolate(frame, [40, 70], [0, 1], { extrapolateRight: "clamp" });
  const formulaOp = interpolate(frame, [90, 120], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.darkBg, alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <FadeIn delay={0}><Title text="Washer Method: Hollow Solid" size={34} color={COLORS.gold} style={{ marginBottom: 20 }} /></FadeIn>
      <div style={{ display: "flex", gap: 40, alignItems: "center" }}>
        <div style={{ opacity: leftOp, textAlign: "center" }}>
          <svg width={180} height={180}>
            <rect width={180} height={180} fill="#1e293b" rx={8} />
            <line x1={20} y1={160} x2={165} y2={160} stroke="#94a3b8" strokeWidth={2} />
            <line x1={20} y1={10} x2={20} y2={160} stroke="#94a3b8" strokeWidth={2} />
            <path d="M20,140 Q70,40 160,30" fill="none" stroke="#3b82f6" strokeWidth={2} />
            <path d="M20,140 Q70,100 160,80" fill="none" stroke="#f97316" strokeWidth={2} />
            <path d="M20,140 Q70,40 160,30 L160,80 Q70,100 20,140 Z" fill="#22c55e" opacity={0.4} />
            <text x={110} y={45} fill="#3b82f6" fontSize={12}>R(x)</text>
            <text x={110} y={90} fill="#f97316" fontSize={12}>r(x)</text>
          </svg>
          <div style={{ color: COLORS.white, fontSize={13} }}>Cross-section</div>
        </div>
        <div style={{ color: COLORS.white, fontSize: 24 }}>→</div>
        <div style={{ opacity: rightOp, textAlign: "center" }}>
          <svg width={180} height={180}>
            <rect width={180} height={180} fill="#1e293b" rx={8} />
            <ellipse cx={90} cy={90} rx={65} ry={70} fill="#14b8a6" opacity={0.35} />
            <ellipse cx={90} cy={90} rx={65} ry={70} fill="none" stroke="#14b8a6" strokeWidth={2} />
            <ellipse cx={90} cy={90} rx={22} ry={70} fill="#0f172a" />
            <ellipse cx={90} cy={90} rx={22} ry={70} fill="none" stroke="#f97316" strokeWidth={1.5} />
            <text x={20} y={88} fill="#3b82f6" fontSize={11}>R(x)</text>
            <text x={95} y={88} fill="#f97316" fontSize={11}>r(x)</text>
          </svg>
          <div style={{ color: COLORS.white, fontSize: 13 }}>3D Washer</div>
        </div>
      </div>
      <div style={{ opacity: formulaOp, marginTop: 22, background: "#1e3a8a", padding: "12px 28px", borderRadius: 10 }}>
        <Title text="V = π ∫([R(x)]² − [r(x)]²) dx" size={22} color={COLORS.white} />
      </div>
    </AbsoluteFill>
  );
};

// Scene 8: Washer = Outer - Inner
const Scene8: React.FC = () => {
  const frame = useCurrentFrame();
  const d1Op = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });
  const d2Op = interpolate(frame, [35, 60], [0, 1], { extrapolateRight: "clamp" });
  const d3Op = interpolate(frame, [70, 95], [0, 1], { extrapolateRight: "clamp" });
  const eqOp = interpolate(frame, [105, 135], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.darkBg, alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <FadeIn delay={0}><Title text="Washer = Outer Disk − Inner Disk" size={32} color={COLORS.gold} style={{ marginBottom: 24 }} /></FadeIn>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ opacity: d1Op, textAlign: "center" }}>
          <svg width={130} height={130}>
            <circle cx={65} cy={65} r={58} fill="#14b8a6" opacity={0.6} />
            <circle cx={65} cy={65} r={58} fill="none" stroke="#14b8a6" strokeWidth={2} />
            <text x={40} y={68} fill={COLORS.white} fontSize={13}>R(x)</text>
          </svg>
          <div style={{ color: COLORS.white, fontSize: 13 }}>Full Disk</div>
        </div>
        <div style={{ color: COLORS.white, fontSize: 36, opacity: d2Op }}>−</div>
        <div style={{ opacity: d2Op, textAlign: "center" }}>
          <svg width={130} height={130}>
            <circle cx={65} cy={65} r={28} fill="#f97316" opacity={0.6} />
            <circle cx={65} cy={65} r={28} fill="none" stroke="#f97316" strokeWidth={2} />
            <text x={46} y={68} fill={COLORS.white} fontSize={13}>r(x)</text>
          </svg>
          <div style={{ color: COLORS.white, fontSize: 13 }}>Inner Hole</div>
        </div>
        <div style={{ color: COLORS.white, fontSize: 36, opacity: d3Op }}>=</div>
        <div style={{ opacity: d3Op, textAlign: "center" }}>
          <svg width={130} height={130}>
            <circle cx={65} cy={65} r={58} fill="#22c55e" opacity={0.5} />
            <circle cx={65} cy={65} r={28} fill="#0f172a" />
            <circle cx={65} cy={65} r={58} fill="none" stroke="#22c55e" strokeWidth={2} />
            <circle cx={65} cy={65} r={28} fill="none" stroke="#f97316" strokeWidth={1.5} />
          </svg>
          <div style={{ color: COLORS.white, fontSize: 13 }}>Washer</div>
        </div>
      </div>
      <div style={{ opacity: eqOp, marginTop: 24, background: "#1e3a8a", padding: "10px 22px", borderRadius: 10 }}>
        <div style={{ color: COLORS.white, fontSize: 18, textAlign: "center" }}>π[R(x)]² − π[r(x)]² = π([R(x)]² − [r(x)]²)</div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 9: Distance = Integral of Velocity
const Scene9: React.FC = () => {
  const frame = useCurrentFrame();
  const graphOp = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });
  const shadeOp = interpolate(frame, [30, 60], [0, 1], { extrapolateRight: "clamp" });
  const formulaOp = interpolate(frame, [70, 100], [0, 1], { extrapolateRight: "clamp" });
  const carX = interpolate(frame, [0, 200], [60, 400], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.darkBg, alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <FadeIn delay={0}><Title text="Distance = Integral of Velocity" size={34} color={COLORS.gold} style={{ marginBottom: 16 }} /></FadeIn>
      <div style={{ opacity: graphOp, position: "relative" }}>
        <svg width={500} height={220}>
          <rect width={500} height={220} fill="#1e293b" rx={8} />
          <line x1={50} y1={190} x2={470} y2={190} stroke="#94a3b8" strokeWidth={2} />
          <line x1={50} y1={15} x2={50} y2={190} stroke="#94a3b8" strokeWidth={2} />
          <text x={460} y={205} fill="#94a3b8" fontSize={12}>t</text>
          <text x={55} y={15} fill="#94a3b8" fontSize={12}>v(t)</text>
          <path d="M60,170 Q150,40 270,60 Q350,75 450,50" fill="none" stroke="none" />
          <path d="M60,170 Q150,40 270,60 Q350,75 450,50 L450,190 L60,190 Z" fill="#3b82f6" opacity={shadeOp * 0.4} />
          <path d="M60,170 Q150,40 270,60 Q350,75 450,50" fill="none" stroke="#3b82f6" strokeWidth={2.5} />
          <text x={200} y={140} fill={COLORS.white} fontSize={13} opacity={shadeOp}>Total Distance</text>
          <text x={55} y={205} fill="#94a3b8" fontSize={11}>0</text>
          <text x={440} y={205} fill="#94a3b8" fontSize={11}>T</text>
        </svg>
        <svg width={30} height={20} style={{ position: "absolute", top: 170, left: carX }}>
          <rect width={28} height={14} fill="#fbbf24" rx={3} />
          <circle cx={6} cy={14} r={4} fill="#374151" />
          <circle cx={22} cy={14} r={4} fill="#374151" />
        </svg>
      </div>
      <div style={{ opacity: formulaOp, marginTop: 20, background: "#1e3a8a", padding: "12px 28px", borderRadius: 10 }}>
        <Title text="Distance = ∫[0 to T] v(t) dt" size={26} color={COLORS.white} />
      </div>
    </AbsoluteFill>
  );
};

// Scene 10: Work Done
const Scene10: React.FC = () => {
  const frame = useCurrentFrame();
  const trackOp = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });
  const graphOp = interpolate(frame, [30, 55], [0, 1], { extrapolateRight: "clamp" });
  const formulaOp = interpolate(frame, [70, 100], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.darkBg, alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <FadeIn delay={0}><Title text="Work Done by a Variable Force" size={34} color={COLORS.gold} style={{ marginBottom: 16 }} /></FadeIn>
      <div style={{ opacity: trackOp }}>
        <svg width={500} height={80}>
          <rect width={500} height={80} fill="#1e293b" rx={8} />
          <rect x={20} y={50} width={460} height={12} fill="#475569" rx={4} />
          <rect x={60} y={35} width={50} height={30} fill="#64748b" rx={4} />
          <text x={70} y={55} fill={COLORS.white} fontSize={13}>Block</text>
          <text x={55} y={75} fill="#94a3b8" fontSize={11}>a</text>
          <text x={420} y={75} fill="#94a3b8" fontSize={11}>b</text>
          <line x1={60} y1={62} x2={420} y2={62} stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="5,3" />
        </svg>
      </div>
      <div style={{ opacity: graphOp, marginTop: 10 }}>
        <svg width={500} height={180}>
          <rect width={500} height={180} fill="#1e293b" rx={8} />
          <line x1={50} y1={150} x2={470} y2={150} stroke="#94a3b8" strokeWidth={2} />
          <line x1={50} y1={10} x2={50} y2={150} stroke="#94a3b8" strokeWidth={2} />
          <path d="M70,120 Q150,40 250,60 Q350,80 440,30" fill="none" stroke="none" />
          <path d="M70,120 Q150,40 250,60 Q350,80 440,30 L440,150 L70,150 Z" fill="#f97316" opacity={0.4} />
          <path d="M70,120 Q150,40 250,60 Q350,80 440,30" fill="none" stroke="#f97316" strokeWidth={2.5} />
          <line x1={70} y1={90} x2={440} y2={90} stroke="#fbbf24" strokeWidth={1} strokeDasharray="5,3" />
          <text x={200} y={115} fill="#f97316" fontSize={13}>Variable Force F(x)</text>
          <text x={220} y={84} fill="#fbbf24" fontSize={11}>Constant Force</text>
          <text x={55} y={165} fill="#94a3b8" fontSize={11}>a</text>
          <text x={430} y={165} fill="#94a3b8" fontSize={11}>b</text>
          <text x={455} y={155} fill="#94a3b8" fontSize={12}>x</text>
          <text x={54} y={12} fill="#94a3b8" fontSize={12}>F</text>
        </svg>
      </div>
      <div style={{ opacity: formulaOp, marginTop: 14, background: "#1e3a8a", padding: "10px 28px", borderRadius: 10 }}>
        <Title text="Work = ∫[a to b] F(x) dx" size={26} color={COLORS.white} />
      </div>
    </AbsoluteFill>
  );
};

// Scene 11: Population Growth
const Scene11: React.FC = () => {
  const frame = useCurrentFrame();
  const graphOp = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });
  const shadeOp = interpolate(frame, [30, 60], [0, 1], { extrapolateRight: "clamp" });
  const formulaOp = interpolate(frame, [70, 100], [0, 1], { extrapolateRight: "clamp" });
  const numCount = Math.floor(interpolate(frame, [60, 200], [0, 8], { extrapolateRight: "clamp" }));

  return (
    <AbsoluteFill style={{ background: COLORS.darkBg, alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <FadeIn delay={0}><Title text="Population Growth via Integration" size={32} color={COLORS.gold} style={{ marginBottom: 14 }} /></FadeIn>
      <div style={{ opacity: graphOp }}>
        <svg width={480} height={190}>
          <rect width={480} height={190} fill="#1e293b" rx={8} />
          <line x1={40} y1={160} x2={450} y2={160} stroke="#94a3b8" strokeWidth={2} />
          <line x1={40} y1={10} x2={40} y2={160} stroke="#94a3b8" strokeWidth={2} />
          <path d="M80,140 Q160,80 240,60 Q320,40 410,20" fill="none" stroke="none" />
          <path d="M80,140 Q160,80 240,60 Q320,40 410,20 L410,160 L80,160 Z" fill="#22c55e" opacity={shadeOp * 0.4} />
          <path d="M80,140 Q160,80 240,60 Q320,40 410,20" fill="none" stroke="#22c55e" strokeWidth={2.5} />
          <text x={200} y={120} fill={COLORS.white} fontSize={13} opacity={shadeOp}>Growth Area</text>
          <text x={73} y={175} fill="#94a3b8" fontSize={11}>t₁</text>
          <text x={403} y={175} fill="#94a3b8" fontSize={11}>t₂</text>
          <text x={447} y={165} fill="#94a3b8" fontSize={12}>t</text>
        </svg>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", maxWidth: 300 }}>
        {Array.from({ length: numCount }).map((_, i) => (
          <div key={i} style={{ fontSize: 22 }}>👤</div>
        ))}
      </div>
      <div style={{ opacity: formulaOp, marginTop: 10, background: "#1e3a8a", padding: "10px 28px", borderRadius: 10 }}>
        <Title text="Growth = ∫[t₁ to t₂] r(t) dt" size={22} color={COLORS.white} />
      </div>
    </AbsoluteFill>
  );
};

// Scene 12: Summing Infinitely Many Pieces
const Scene12: React.FC = () => {
  const frame = useCurrentFrame();
  const p1Op = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });
  const p2Op = interpolate(frame, [30, 55], [0, 1], { extrapolateRight: "clamp" });
  const p3Op = interpolate(frame, [60, 85], [0, 1], { extrapolateRight: "clamp" });
  const capOp = interpolate(frame, [100, 130], [0, 1], { extrapolateRight: "clamp" });

  const panels = [
    { color: "#22c55e", label: "Area Strip", shape: "rect", op: p1Op },
    { color: "#14b8a6", label: "Disk Slice", shape: "circle", op: p2Op },
    { color: "#3b82f6", label: "v(t) Bar", shape: "bar", op: p3Op },
  ];

  return (
    <AbsoluteFill style={{ background: COLORS.darkBg, alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <FadeIn delay={0}><Title text="Integration: Summing Infinitely Many Pieces" size={28} color={COLORS.gold} style={{ marginBottom: 24 }} /></FadeIn>
      <div style={{ display: "flex", gap: 40 }}>
        {panels.map((p, i) => (
          <div key={i} style={{ opacity: p.op, textAlign: "center" }}>
            <svg width={120} height={120}>
              <rect width={120} height={120} fill="#1e293b" rx={8} />
              {p.shape === "rect" && (
                <>
                  <rect x={40} y={20} width={16} height={80} fill={p.color} opacity={0.7} />
                  <line x1={10} y1={100} x2={110} y2={100} stroke="#94a3b8" strokeWidth={1.5} />
                  <line x1={10} y1={10} x2={10} y2={100} stroke="#94a3b8" strokeWidth={1.5} />
                </>
              )}
              {p.shape === "circle" && (
                <>
                  <ellipse cx={60} cy={60} rx={45} ry={12} fill={p.color} opacity={0.6} />
                  <ellipse cx={60} cy={60} rx={45} ry={12} fill="none" stroke={p.color} strokeWidth={1.5} />
                  <line x1={60} y1={48} x2={60} y2={72} stroke="#94a3b8" strokeWidth={1.5} />
                </>
              )}
              {p.shape === "bar" && (
                <>
                  <rect x={45} y={20} width={14} height={70} fill={p.color} opacity={0.7} />
                  <line x1={10} y1={90} x2={110} y2={90} stroke="#94a3b8" strokeWidth={1.5} />
                  <line x1={10} y1={10} x2={10} y2={90} stroke="#94a3b8" strokeWidth={1.5} />
                </>
              )}
              <text x={25} y={115} fill="#fbbf24" fontSize={11}>f(x)·dx</text>
            </svg>
            <div style={{ color: COLORS.white, fontSize: 13, marginTop: 6 }}>{p.label}</div>
          </div>
        ))}
      </div>
      <div style={{ opacity: capOp, marginTop: 28, background: "#1e3a8a", padding: "14px 32px", borderRadius: 10, maxWidth: 600, textAlign: "center" }}>
        <div style={{ color: COLORS.white, fontSize: 18 }}>Sum of infinitely many pieces = Definite Integral</div>
        <div style={{ color: COLORS.gold, fontSize: 32, marginTop: 6 }}>∫</div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 13: Summary
const Scene13: React.FC = () => {
  const frame = useCurrentFrame();
  const panels = [
    { title: "Area Between Curves", formula: "A = ∫[f(x)−g(x)]dx", delay: 0 },
    { title: "Disk Method", formula: "V = π∫[f(x)]²dx", delay: 30 },
    { title: "Washer Method", formula: "V = π∫([R]²−[r]²)dx", delay: 60 },
    { title: "Accumulation", formula: "∫v(t)dt, ∫F(x)dx", delay: 90 },
  ];

  return (
    <AbsoluteFill style={{ background: "#0a1628", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <FadeIn delay={0}>
        <Title text="Lesson 5 Summary: Four Key Applications" size={34} color={COLORS.gold} style={{ marginBottom: 30 }} />
      </FadeIn>
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", justifyContent: "center" }}>
        {panels.map((p, i) => {
          const op = interpolate(frame, [p.delay, p.delay + 25], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
          return (
            <div key={i} style={{
              opacity: op,
              border: `2px solid ${COLORS.gold}`,
              borderRadius: 12,
              padding: "20px 24px",
              width: 230,
              background: "#1e293b",
              textAlign: "center",
            }}>
              <div style={{ color: COLORS.gold, fontSize: 16, fontWeight: "bold", marginBottom: 12 }}>{p.title}</div>
              <div style={{ color: COLORS.white, fontSize: 15 }}>{p.formula}</div>
            </div>
          );
        })}
      </div>
      <FadeIn delay={120}>
        <div style={{ color: "#94a3b8", fontSize: 16, marginTop: 32, textAlign: "center" }}>
          Integration unifies all these applications through the same core idea.
        </div>
      </FadeIn>
    </AbsoluteFill>
  );
};

export const Lessonad45cd5a = () => {
  return (
    <Series>
      <Series.Sequence durationInFrames={448}>
        <Audio src={staticFile("audio/a0253919-b667-4658-b2f2-3b8a46b0a669.mp3")} />
        <Scene1 />
      </Series.Sequence>
      <Series.Sequence durationInFrames={416}>
        <Audio src={staticFile("audio/50ff4538-8af1-4a69-8bb0-63c279e39acb.mp3")} />
        <Scene2 />
      </Series.Sequence>
      <Series.Sequence durationInFrames={372}>
        <Audio src={staticFile("audio/d151e25a-f8eb-47cd-af55-ec614d4883eb.mp3")} />
        <Scene3 />
      </Series.Sequence>
      <Series.Sequence durationInFrames={469}>
        <Audio src={staticFile("audio/775b3d20-98aa-45e3-8e6c-65c3f9149a1a.mp3")} />
        <Scene4 />
      </Series.Sequence>
      <Series.Sequence durationInFrames={402}>
        <Audio src={staticFile("audio/39f772af-f7a2-412d-b8ff-503a5b47cfdc.mp3")} />
        <Scene5 />
      </Series.Sequence>
      <Series.Sequence durationInFrames={456}>
        <Audio src={staticFile("audio/243e6146-86d5-4858-b83d-4b54aa4c11d6.mp3")} />
        <Scene6 />
      </Series.Sequence>
      <Series.Sequence durationInFrames={456}>
        <Audio src={staticFile("audio/225e1812-1156-49c3-b9fc-57963efba613.mp3")} />
        <Scene7 />
      </Series.Sequence>
      <Series.Sequence durationInFrames={396}>
        <Audio src={staticFile("audio/4cc7c1bf-a904-417c-bce7-06f399af150e.mp3")} />
        <Scene8 />
      </Series.Sequence>
      <Series.Sequence durationInFrames={444}>
        <Audio src={staticFile("audio/7eaa0fd0-ac3b-42f6-b82a-ff0ed7274bc6.mp3")} />
        <Scene9 />
      </Series.Sequence>
      <Series.Sequence durationInFrames={425}>
        <Audio src={staticFile("audio/03837a5d-f1a1-41ab-bb43-e492c565fb41.mp3")} />
        <Scene10 />
      </Series.Sequence>
      <Series.Sequence durationInFrames={396}>
        <Audio src={staticFile("audio/3dddb68c-ed2d-44c3-b13c-6b3f52bf6782.mp3")} />
        <Scene11 />
      </Series.Sequence>
      <Series.Sequence durationInFrames={451}>
        <Audio src={staticFile("audio/60efb9c5-42b6-4731-a08d-49915a94ec08.mp3")} />
        <Scene12 />
      </Series.Sequence>
      <Series.Sequence durationInFrames={647}>
        <Audio src={staticFile("audio/d85b7014-bffa-407b-9d48-336762be1b88.mp3")} />
        <Scene13 />
      </Series.Sequence>
    </Series>
  );
};