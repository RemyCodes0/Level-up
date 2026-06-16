import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Series, Audio, staticFile } from "remotion";
import React from "react";

const COLORS = {
  deepBlue: "#0a1628",
  blue: "#2563eb",
  gold: "#f59e0b",
  green: "#10b981",
  lightGreen: "rgba(16,185,129,0.3)",
  red: "#ef4444",
  teal: "#14b8a6",
  orange: "#f97316",
  white: "#ffffff",
  lightBlue: "rgba(37,99,235,0.3)",
  darkPanel: "#0f1f3d",
};

const useFade = (start: number, end: number) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [start, end], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
};

const MathText: React.FC<{ text: string; size?: number; color?: string; style?: React.CSSProperties }> = ({ text, size = 20, color = COLORS.white, style }) => (
  <div style={{ fontFamily: "serif", fontSize: size, color, ...style }}>{text}</div>
);

const FadeIn: React.FC<{ startFrame: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ startFrame, children, style }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [startFrame, startFrame + 20], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  return <div style={{ opacity, ...style }}>{children}</div>;
};

const CoordPlane: React.FC<{ width?: number; height?: number; children?: React.ReactNode }> = ({ width = 400, height = 280, children }) => (
  <svg width={width} height={height} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 8 }}>
    <line x1={30} y1={height - 30} x2={width - 10} y2={height - 30} stroke="#aaa" strokeWidth={1.5} />
    <line x1={30} y1={10} x2={30} y2={height - 30} stroke="#aaa" strokeWidth={1.5} />
    <text x={width - 15} y={height - 25} fill="#aaa" fontSize={14}>x</text>
    <text x={15} y={18} fill="#aaa" fontSize={14}>y</text>
    {children}
  </svg>
);

const Title: React.FC<{ text: string; size?: number; color?: string }> = ({ text, size = 36, color = COLORS.white }) => {
  const opacity = useFade(0, 20);
  return <div style={{ fontSize: size, fontWeight: "bold", color, opacity, textAlign: "center", fontFamily: "sans-serif" }}>{text}</div>;
};

const SceneWrapper: React.FC<{ children: React.ReactNode; bg?: string }> = ({ children, bg = COLORS.deepBlue }) => (
  <AbsoluteFill style={{ background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40 }}>
    {children}
  </AbsoluteFill>
);

// Scene 1: Intro
const Scene1: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleOp = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });
  const icon1Op = interpolate(frame, [40, 60], [0, 1], { extrapolateRight: "clamp" });
  const icon2Op = interpolate(frame, [70, 90], [0, 1], { extrapolateRight: "clamp" });
  const icon3Op = interpolate(frame, [100, 120], [0, 1], { extrapolateRight: "clamp" });
  const subtitleOp = interpolate(frame, [130, 155], [0, 1], { extrapolateRight: "clamp" });
  return (
    <SceneWrapper>
      <div style={{ opacity: titleOp, fontSize: 48, fontWeight: "bold", color: COLORS.white, textAlign: "center", fontFamily: "sans-serif", marginBottom: 40 }}>
        Applications of Integration
      </div>
      <div style={{ display: "flex", gap: 60, marginBottom: 40 }}>
        <div style={{ opacity: icon1Op, textAlign: "center" }}>
          <svg width={100} height={80}>
            <path d="M10,70 Q30,20 50,40 Q70,60 90,10" fill="none" stroke={COLORS.blue} strokeWidth={2} />
            <path d="M20,70 Q40,40 60,55 Q80,70 90,70 Z" fill={COLORS.lightGreen} />
            <text x={35} y={78} fill="#aaa" fontSize={11}>Area</text>
          </svg>
        </div>
        <div style={{ opacity: icon2Op, textAlign: "center" }}>
          <svg width={100} height={80}>
            <ellipse cx={50} cy={40} rx={30} ry={35} fill="none" stroke={COLORS.teal} strokeWidth={2} />
            <ellipse cx={50} cy={40} rx={30} ry={10} fill="rgba(20,184,166,0.3)" />
            <text x={28} y={78} fill="#aaa" fontSize={11}>Volume</text>
          </svg>
        </div>
        <div style={{ opacity: icon3Op, textAlign: "center" }}>
          <svg width={100} height={80}>
            <polyline points="10,65 30,50 50,30 70,40 90,20" fill="none" stroke={COLORS.blue} strokeWidth={2} />
            <polygon points="10,65 30,50 50,30 70,40 90,20 90,65" fill={COLORS.lightBlue} />
            <text x={15} y={78} fill="#aaa" fontSize={11}>Accumulation</text>
          </svg>
        </div>
      </div>
      <div style={{ opacity: subtitleOp, fontSize: 28, color: COLORS.gold, fontFamily: "sans-serif" }}>
        Area, Volume, and Accumulation
      </div>
    </SceneWrapper>
  );
};

// Scene 2: Area Between Curves
const Scene2: React.FC = () => {
  const frame = useCurrentFrame();
  const graphOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const shadeOp = interpolate(frame, [30, 60], [0, 1], { extrapolateRight: "clamp" });
  const formulaOp = interpolate(frame, [80, 110], [0, 1], { extrapolateRight: "clamp" });
  return (
    <SceneWrapper>
      <Title text="Area Between Two Curves" size={32} />
      <div style={{ opacity: graphOp, marginTop: 20 }}>
        <CoordPlane width={420} height={260}>
          <defs>
            <clipPath id="areaClip2">
              <rect x={80} y={10} width={250} height={220} />
            </clipPath>
          </defs>
          <path d="M80,180 Q160,40 330,80" fill="none" stroke={COLORS.blue} strokeWidth={2.5} />
          <path d="M80,200 Q180,160 330,140" fill="none" stroke={COLORS.red} strokeWidth={2.5} />
          <path d="M80,180 Q160,40 330,80 L330,140 Q180,160 80,200 Z" fill={COLORS.lightGreen} opacity={shadeOp} />
          <line x1={80} y1={220} x2={80} y2={180} stroke="#aaa" strokeWidth={1} strokeDasharray="4" />
          <line x1={330} y1={220} x2={330} y2={80} stroke="#aaa" strokeWidth={1} strokeDasharray="4" />
          <text x={70} y={235} fill="#aaa" fontSize={13}>a</text>
          <text x={322} y={235} fill="#aaa" fontSize={13}>b</text>
          <text x={150} y={45} fill={COLORS.blue} fontSize={14}>f(x)</text>
          <text x={200} y={165} fill={COLORS.red} fontSize={14}>g(x)</text>
        </CoordPlane>
      </div>
      <div style={{ opacity: formulaOp, marginTop: 20, background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: "12px 24px" }}>
        <MathText text="A = ∫[a to b] [f(x) − g(x)] dx" size={24} color={COLORS.white} />
      </div>
    </SceneWrapper>
  );
};

// Scene 3: Intersection Points
const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const graphOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const dotScale = spring({ frame: frame - 30, fps: 30, config: { damping: 12 } });
  const labelOp = interpolate(frame, [50, 75], [0, 1], { extrapolateRight: "clamp" });
  const calloutOp = interpolate(frame, [80, 105], [0, 1], { extrapolateRight: "clamp" });
  return (
    <SceneWrapper>
      <Title text="Find Intersection Points First" size={30} />
      <div style={{ opacity: graphOp, marginTop: 20 }}>
        <CoordPlane width={420} height={260}>
          <path d="M60,190 Q180,40 360,70" fill="none" stroke={COLORS.blue} strokeWidth={2.5} />
          <path d="M60,210 Q200,170 360,130" fill="none" stroke={COLORS.red} strokeWidth={2.5} />
          <circle cx={110} cy={178} r={8 * dotScale} fill={COLORS.gold} />
          <circle cx={290} cy={110} r={8 * dotScale} fill={COLORS.gold} />
          <line x1={110} y1={220} x2={110} y2={178} stroke="#aaa" strokeWidth={1} strokeDasharray="4" />
          <line x1={290} y1={220} x2={290} y2={110} stroke="#aaa" strokeWidth={1} strokeDasharray="4" />
          <text x={100} y={235} fill={COLORS.gold} fontSize={13} opacity={labelOp}>a</text>
          <text x={282} y={235} fill={COLORS.gold} fontSize={13} opacity={labelOp}>b</text>
          <text x={140} y={45} fill={COLORS.blue} fontSize={14}>f(x)</text>
          <text x={220} y={170} fill={COLORS.red} fontSize={14}>g(x)</text>
        </CoordPlane>
      </div>
      <FadeIn startFrame={80} style={{ marginTop: 16, background: "rgba(245,158,11,0.15)", border: `2px solid ${COLORS.gold}`, borderRadius: 10, padding: "12px 24px" }}>
        <MathText text="Set f(x) = g(x), solve for x" size={20} color={COLORS.gold} />
      </FadeIn>
    </SceneWrapper>
  );
};

// Scene 4: Example Area
const Scene4: React.FC = () => {
  const frame = useCurrentFrame();
  const graphOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const step1Op = interpolate(frame, [40, 60], [0, 1], { extrapolateRight: "clamp" });
  const step2Op = interpolate(frame, [80, 100], [0, 1], { extrapolateRight: "clamp" });
  const answerScale = spring({ frame: frame - 130, fps: 30, config: { damping: 10 } });
  return (
    <SceneWrapper>
      <Title text="Example: Area Between y=x and y=x²" size={26} />
      <div style={{ display: "flex", gap: 30, marginTop: 20, alignItems: "flex-start" }}>
        <div style={{ opacity: graphOp }}>
          <CoordPlane width={260} height={220}>
            <path d="M30,220 L230,20" fill="none" stroke={COLORS.blue} strokeWidth={2.5} />
            <path d="M30,220 Q130,130 230,20" fill="none" stroke={COLORS.red} strokeWidth={2.5} />
            <path d="M30,220 Q130,130 230,20 L230,20 L30,220 Z" fill="rgba(253,224,71,0.3)" />
            <circle cx={30} cy={220} r={5} fill={COLORS.gold} />
            <circle cx={230} cy={20} r={5} fill={COLORS.gold} />
            <text x={22} y={240} fill="#aaa" fontSize={12}>0</text>
            <text x={222} y={240} fill="#aaa" fontSize={12}>1</text>
            <text x={140} y={100} fill={COLORS.blue} fontSize={13}>y=x</text>
            <text x={80} y={155} fill={COLORS.red} fontSize={13}>y=x²</text>
          </CoordPlane>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ opacity: step1Op, background: "rgba(255,255,255,0.08)", borderRadius: 8, padding: "10px 16px" }}>
            <MathText text="x² = x → x = 0, 1" size={18} />
          </div>
          <div style={{ opacity: step2Op, background: "rgba(255,255,255,0.08)", borderRadius: 8, padding: "10px 16px" }}>
            <MathText text="∫₀¹(x − x²)dx" size={18} />
            <MathText text="= [x²/2 − x³/3]₀¹" size={18} style={{ marginTop: 6 }} />
          </div>
          <div style={{ transform: `scale(${answerScale})`, transformOrigin: "left", background: COLORS.green, borderRadius: 8, padding: "10px 20px" }}>
            <MathText text="= 1/6" size={24} color={COLORS.white} />
          </div>
        </div>
      </div>
    </SceneWrapper>
  );
};

// Scene 5: Disk Method
const Scene5: React.FC = () => {
  const frame = useCurrentFrame();
  const curveOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const solidOp = interpolate(frame, [30, 60], [0, 1], { extrapolateRight: "clamp" });
  const diskOp = interpolate(frame, [70, 95], [0, 1], { extrapolateRight: "clamp" });
  const formulaOp = interpolate(frame, [110, 135], [0, 1], { extrapolateRight: "clamp" });
  return (
    <SceneWrapper>
      <Title text="Disk Method: Solid of Revolution" size={28} />
      <div style={{ display: "flex", gap: 40, marginTop: 20 }}>
        <div style={{ opacity: curveOp }}>
          <CoordPlane width={200} height={180}>
            <path d="M30,160 Q80,120 100,60 Q120,20 170,10" fill="none" stroke={COLORS.blue} strokeWidth={2.5} />
            <text x={120} y={45} fill={COLORS.blue} fontSize={13}>y=f(x)</text>
          </CoordPlane>
        </div>
        <div style={{ opacity: solidOp }}>
          <svg width={200} height={180}>
            <ellipse cx={100} cy={90} rx={60} ry={70} fill="rgba(20,184,166,0.4)" stroke={COLORS.teal} strokeWidth={2} />
            <ellipse cx={100} cy={90} rx={60} ry={20} fill="rgba(20,184,166,0.2)" stroke={COLORS.teal} strokeWidth={1} />
            <rect x={88} y={55} width={25} height={30} fill="rgba(239,68,68,0.6)" stroke={COLORS.red} strokeWidth={1} opacity={diskOp} />
            <text x={115} y={68} fill={COLORS.red} fontSize={11} opacity={diskOp}>r=f(x)</text>
          </svg>
        </div>
      </div>
      <div style={{ opacity: formulaOp, background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: "12px 24px" }}>
        <MathText text="V = π ∫[a to b] [f(x)]² dx" size={22} color={COLORS.white} />
      </div>
    </SceneWrapper>
  );
};

// Scene 6: Each Disk
const Scene6: React.FC = () => {
  const frame = useCurrentFrame();
  const step1Op = interpolate(frame, [20, 45], [0, 1], { extrapolateRight: "clamp" });
  const step2Op = interpolate(frame, [60, 85], [0, 1], { extrapolateRight: "clamp" });
  const step3Op = interpolate(frame, [100, 125], [0, 1], { extrapolateRight: "clamp" });
  return (
    <SceneWrapper>
      <Title text="Each Disk: Area × Thickness" size={30} />
      <div style={{ display: "flex", gap: 50, marginTop: 24, alignItems: "center" }}>
        <svg width={140} height={140}>
          <ellipse cx={70} cy={70} rx={55} ry={55} fill="rgba(20,184,166,0.4)" stroke={COLORS.teal} strokeWidth={2.5} />
          <line x1={70} y1={70} x2={125} y2={70} stroke={COLORS.white} strokeWidth={1.5} strokeDasharray="4" />
          <text x={90} y={65} fill={COLORS.white} fontSize={12}>r = f(x)</text>
          <line x1={63} y1={15} x2={77} y2={15} stroke={COLORS.gold} strokeWidth={2} />
          <line x1={63} y1={125} x2={77} y2={125} stroke={COLORS.gold} strokeWidth={2} />
          <text x={80} y={70} fill={COLORS.gold} fontSize={11}>dx</text>
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ opacity: step1Op, background: "rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 16px" }}>
            <MathText text="Area of disk = π[f(x)]²" size={18} />
          </div>
          <div style={{ opacity: step2Op, background: "rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 16px" }}>
            <MathText text="Volume element = π[f(x)]²dx" size={18} />
          </div>
          <div style={{ opacity: step3Op, background: "rgba(37,99,235,0.3)", borderRadius: 8, padding: "8px 16px", border: `1px solid ${COLORS.blue}` }}>
            <MathText text="V = π ∫[a,b] [f(x)]² dx" size={20} color={COLORS.gold} />
          </div>
        </div>
      </div>
    </SceneWrapper>
  );
};

// Scene 7: Washer Method
const Scene7: React.FC = () => {
  const frame = useCurrentFrame();
  const leftOp = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });
  const rightOp = interpolate(frame, [35, 60], [0, 1], { extrapolateRight: "clamp" });
  const formulaOp = interpolate(frame, [90, 115], [0, 1], { extrapolateRight: "clamp" });
  return (
    <SceneWrapper>
      <Title text="Washer Method: Hollow Solid Volume" size={26} />
      <div style={{ display: "flex", gap: 40, marginTop: 20 }}>
        <div style={{ opacity: leftOp }}>
          <CoordPlane width={200} height={180}>
            <path d="M30,150 Q100,60 170,30" fill="none" stroke={COLORS.blue} strokeWidth={2.5} />
            <path d="M30,160 Q100,110 170,90" fill="none" stroke={COLORS.orange} strokeWidth={2.5} />
            <path d="M30,150 Q100,60 170,30 L170,90 Q100,110 30,160 Z" fill="rgba(16,185,129,0.3)" />
            <text x={110} y={45} fill={COLORS.blue} fontSize={12}>R(x)</text>
            <text x={110} y={100} fill={COLORS.orange} fontSize={12}>r(x)</text>
          </CoordPlane>
        </div>
        <div style={{ opacity: rightOp }}>
          <svg width={180} height={180}>
            <ellipse cx={90} cy={90} rx={70} ry={80} fill="rgba(20,184,166,0.3)" stroke={COLORS.teal} strokeWidth={2} />
            <ellipse cx={90} cy={90} rx={35} ry={40} fill={COLORS.deepBlue} stroke={COLORS.orange} strokeWidth={2} />
            <text x={130} y={55} fill={COLORS.blue} fontSize={11}>R(x)</text>
            <text x={95} y={88} fill={COLORS.orange} fontSize={11}>r(x)</text>
          </svg>
        </div>
      </div>
      <div style={{ opacity: formulaOp, background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 20px" }}>
        <MathText text="V = π ∫[a,b] ([R(x)]² − [r(x)]²) dx" size={20} color={COLORS.white} />
      </div>
    </SceneWrapper>
  );
};

// Scene 8: Washer = Outer - Inner
const Scene8: React.FC = () => {
  const frame = useCurrentFrame();
  const d1Op = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const d2Op = interpolate(frame, [25, 45], [0, 1], { extrapolateRight: "clamp" });
  const d3Op = interpolate(frame, [50, 70], [0, 1], { extrapolateRight: "clamp" });
  const eqOp = interpolate(frame, [85, 110], [0, 1], { extrapolateRight: "clamp" });
  return (
    <SceneWrapper>
      <Title text="Washer = Outer Disk Minus Inner Disk" size={24} />
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 24 }}>
        <div style={{ opacity: d1Op, textAlign: "center" }}>
          <svg width={110} height={110}><circle cx={55} cy={55} r={50} fill="rgba(20,184,166,0.5)" stroke={COLORS.teal} strokeWidth={2} /></svg>
          <div style={{ color: COLORS.white, fontFamily: "sans-serif", fontSize: 13 }}>Full Disk R(x)</div>
        </div>
        <div style={{ fontSize: 40, color: COLORS.white }}>−</div>
        <div style={{ opacity: d2Op, textAlign: "center" }}>
          <svg width={110} height={110}><circle cx={55} cy={55} r={30} fill="rgba(249,115,22,0.5)" stroke={COLORS.orange} strokeWidth={2} /></svg>
          <div style={{ color: COLORS.white, fontFamily: "sans-serif", fontSize: 13 }}>Inner Hole r(x)</div>
        </div>
        <div style={{ fontSize: 40, color: COLORS.white }}>=</div>
        <div style={{ opacity: d3Op, textAlign: "center" }}>
          <svg width={110} height={110}>
            <circle cx={55} cy={55} r={50} fill="rgba(16,185,129,0.5)" stroke={COLORS.green} strokeWidth={2} />
            <circle cx={55} cy={55} r={30} fill={COLORS.deepBlue} stroke={COLORS.green} strokeWidth={1.5} />
          </svg>
          <div style={{ color: COLORS.white, fontFamily: "sans-serif", fontSize: 13 }}>Washer</div>
        </div>
      </div>
      <div style={{ opacity: eqOp, marginTop: 16, background: "rgba(255,255,255,0.08)", borderRadius: 8, padding: "10px 20px" }}>
        <MathText text="π[R(x)]² − π[r(x)]² = π([R(x)]² − [r(x)]²)" size={18} color={COLORS.gold} />
      </div>
    </SceneWrapper>
  );
};

// Scene 9: Distance = Integral of Velocity
const Scene9: React.FC = () => {
  const frame = useCurrentFrame();
  const graphOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const shadeOp = interpolate(frame, [25, 55], [0, 1], { extrapolateRight: "clamp" });
  const formulaOp = interpolate(frame, [80, 105], [0, 1], { extrapolateRight: "clamp" });
  const carX = interpolate(frame, [60, 200], [30, 360], { extrapolateRight: "clamp" });
  return (
    <SceneWrapper>
      <Title text="Distance = Integral of Velocity" size={28} />
      <div style={{ opacity: graphOp, marginTop: 16 }}>
        <CoordPlane width={420} height={220}>
          <path d="M50,180 Q120,80 200,100 Q280,120 370,50" fill="none" stroke={COLORS.blue} strokeWidth={2.5} />
          <path d="M50,180 Q120,80 200,100 Q280,120 370,50 L370,190 L50,190 Z" fill={COLORS.lightBlue} opacity={shadeOp} />
          <text x={180} y={210} fill="#aaa" fontSize={13}>t →</text>
          <text x={32} y={100} fill={COLORS.blue} fontSize={13}>v(t)</text>
          <text x={155} y={155} fill={COLORS.white} fontSize={12} opacity={shadeOp}>Total Distance</text>
        </CoordPlane>
      </div>
      <div style={{ display: "flex", alignItems: "center", marginTop: 8 }}>
        <svg width={400} height={40}>
          <rect x={20} y={15} width={carX - 20} height={12} fill="rgba(37,99,235,0.2)" />
          <text x={carX} y={26} fontSize={20}>🚗</text>
        </svg>
      </div>
      <div style={{ opacity: formulaOp, background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 20px" }}>
        <MathText text="Distance = ∫₀ᵀ v(t) dt" size={22} color={COLORS.white} />
      </div>
    </SceneWrapper>
  );
};

// Scene 10: Work by Variable Force
const Scene10: React.FC = () => {
  const frame = useCurrentFrame();
  const trackOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const shadeOp = interpolate(frame, [30, 60], [0, 1], { extrapolateRight: "clamp" });
  const formulaOp = interpolate(frame, [80, 105], [0, 1], { extrapolateRight: "clamp" });
  return (
    <SceneWrapper>
      <Title text="Work Done by a Variable Force" size={28} />
      <div style={{ opacity: trackOp, marginTop: 16 }}>
        <CoordPlane width={420} height={220}>
          <path d="M50,180 Q120,100 200,80 Q280,60 370,110" fill="none" stroke={COLORS.orange} strokeWidth={2.5} />
          <path d="M50,180 Q120,100 200,80 Q280,60 370,110 L370,190 L50,190 Z" fill="rgba(249,115,22,0.3)" opacity={shadeOp} />
          <line x1={50} y1={190} x2={370} y2={190} stroke="#aaa" strokeWidth={1.5} />
          <text x={40} y={210} fill="#aaa" fontSize={12}>a</text>
          <text x={362} y={210} fill="#aaa" fontSize={12}>b</text>
          <text x={180} y={55} fill={COLORS.orange} fontSize={14}>F(x) Variable</text>
          <line x1={150} y1={190} x2={150} y2={155} stroke="#aaa" strokeWidth={1} strokeDasharray="3" />
          <text x={105} y={155} fill="#aaa" fontSize={11}>Constant Force</text>
          <rect x={40} y={175} width={40} height={20} fill={COLORS.teal} rx={3} />
          <text x={48} y={189} fill={COLORS.white} fontSize={10}>Block</text>
        </CoordPlane>
      </div>
      <div style={{ opacity: formulaOp, background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 20px", marginTop: 8 }}>
        <MathText text="Work = ∫[a to b] F(x) dx" size={22} color={COLORS.white} />
      </div>
    </SceneWrapper>
  );
};

// Scene 11: Population Growth
const Scene11: React.FC = () => {
  const frame = useCurrentFrame();
  const graphOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const shadeOp = interpolate(frame, [30, 60], [0, 1], { extrapolateRight: "clamp" });
  const formulaOp = interpolate(frame, [80, 105], [0, 1], { extrapolateRight: "clamp" });
  const iconsCount = Math.floor(interpolate(frame, [60, 200], [0, 8], { extrapolateRight: "clamp" }));
  return (
    <SceneWrapper>
      <Title text="Population Growth via Integration" size={26} />
      <div style={{ display: "flex", gap: 30, marginTop: 16 }}>
        <div style={{ opacity: graphOp }}>
          <CoordPlane width={280} height={200}>
            <path d="M40,180 Q100,140 160,80 Q220,40 260,20" fill="none" stroke={COLORS.green} strokeWidth={2.5} />
            <path d="M80,180 Q130,140 180,100 L180,190 L80,190 Z" fill={COLORS.lightGreen} opacity={shadeOp} />
            <line x1={80} y1={190} x2={80} y2={155} stroke="#aaa" strokeWidth={1} strokeDasharray="3" />
            <line x1={180} y1={190} x2={180} y2={100} stroke="#aaa" strokeWidth={1} strokeDasharray="3" />
            <text x={72} y={205} fill="#aaa" fontSize={11}>t₁</text>
            <text x={172} y={205} fill="#aaa" fontSize={11}>t₂</text>
            <text x={195} y={55} fill={COLORS.green} fontSize={13}>r(t)</text>
          </CoordPlane>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", flexWrap: "wrap", width: 120, gap: 4 }}>
            {Array.from({ length: iconsCount }).map((_, i) => (
              <div key={i} style={{ fontSize: 18 }}>👤</div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ opacity: formulaOp, background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 20px" }}>
        <MathText text="Growth = ∫[t₁ to t₂] r(t) dt" size={22} color={COLORS.white} />
      </div>
    </SceneWrapper>
  );
};

// Scene 12: Summing Infinite Pieces
const Scene12: React.FC = () => {
  const frame = useCurrentFrame();
  const p1Op = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const p2Op = interpolate(frame, [25, 45], [0, 1], { extrapolateRight: "clamp" });
  const p3Op = interpolate(frame, [50, 70], [0, 1], { extrapolateRight: "clamp" });
  const captionOp = interpolate(frame, [90, 115], [0, 1], { extrapolateRight: "clamp" });
  return (
    <SceneWrapper>
      <Title text="Integration: Summing Infinitely Many Pieces" size={24} />
      <div style={{ display: "flex", gap: 30, marginTop: 24 }}>
        <div style={{ opacity: p1Op, textAlign: "center" }}>
          <svg width={120} height={120}>
            <rect x={55} y={20} width={15} height={80} fill={COLORS.lightGreen} stroke={COLORS.green} strokeWidth={1.5} />
            <text x={20} y={115} fill="#aaa" fontSize={11}>f(x)·dx</text>
            <text x={30} y={18} fill={COLORS.white} fontSize={11}>Area Strip</text>
          </svg>
        </div>
        <div style={{ opacity: p2Op, textAlign: "center" }}>
          <svg width={120} height={120}>
            <ellipse cx={60} cy={60} rx={40} ry={12} fill="rgba(20,184,166,0.5)" stroke={COLORS.teal} strokeWidth={1.5} />
            <text x={20} y={100} fill="#aaa" fontSize={11}>f(x)·dx</text>
            <text x={35} y={18} fill={COLORS.white} fontSize={11}>Disk</text>
          </svg>
        </div>
        <div style={{ opacity: p3Op, textAlign: "center" }}>
          <svg width={120} height={120}>
            <rect x={55} y={30} width={12} height={70} fill={COLORS.lightBlue} stroke={COLORS.blue} strokeWidth={1.5} />
            <text x={20} y={115} fill="#aaa" fontSize={11}>f(x)·dx</text>
            <text x={28} y={18} fill={COLORS.white} fontSize={11}>v(t) Bar</text>
          </svg>
        </div>
      </div>
      <div style={{ opacity: captionOp, marginTop: 20, background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "14px 28px", textAlign: "center" }}>
        <div style={{ fontSize: 36, color: COLORS.white, marginBottom: 6 }}>∫</div>
        <div style={{ color: COLORS.white, fontFamily: "sans-serif", fontSize: 16 }}>Sum of infinitely many pieces = Definite Integral</div>
      </div>
    </SceneWrapper>
  );
};

// Scene 13: Summary
const Scene13: React.FC = () => {
  const frame = useCurrentFrame();
  const panels = [
    { label: "Area Between Curves", formula: "A = ∫[f(x)−g(x)]dx", color: COLORS.green, delay: 0 },
    { label: "Disk Method", formula: "V = π∫[f(x)]²dx", color: COLORS.teal, delay: 20 },
    { label: "Washer Method", formula: "V = π∫([R]²−[r]²)dx", color: COLORS.blue, delay: 40 },
    { label: "Accumulation", formula: "∫v(t)dt, ∫F(x)dx", color: COLORS.orange, delay: 60 },
  ];
  return (
    <SceneWrapper>
      <Title text="Lesson 5 Summary: Four Key Applications" size={28} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginTop: 24, justifyContent: "center" }}>
        {panels.map((p, i) => {
          const op = interpolate(frame, [p.delay, p.delay + 25], [0, 1], { extrapolateRight: "clamp" });
          const sc = spring({ frame: frame - p.delay, fps: 30, config: { damping: 12 } });
          return (
            <div key={i} style={{ opacity: op, transform: `scale(${sc})`, width: 220, border: `2px solid ${COLORS.gold}`, borderRadius: 12, padding: 16, background: "rgba(255,255,255,0.06)", textAlign: "center" }}>
              <div style={{ color: p.color, fontWeight: "bold", fontSize: 16, fontFamily: "sans-serif", marginBottom: 10 }}>{p.label}</div>
              <div style={{ color: COLORS.white, fontSize: 14, fontFamily: "serif" }}>{p.formula}</div>
            </div>
          );
        })}
      </div>
      <FadeIn startFrame={120} style={{ marginTop: 20, color: COLORS.gold, fontSize: 18, fontFamily: "sans-serif", textAlign: "center" }}>
        Integration connects geometry, physics, and real-world change.
      </FadeIn>
    </SceneWrapper>
  );
};

export const Lesson399b7f58 = () => {
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