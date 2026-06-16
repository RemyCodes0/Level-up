import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Series, Audio, staticFile } from "remotion";
import React from "react";

const FPS = 30;

const fadeIn = (frame: number, start: number, duration: number) =>
  interpolate(frame, [start, start + duration], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

const slideUp = (frame: number, start: number, duration: number) =>
  interpolate(frame, [start, start + duration], [30, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

const Text: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ fontFamily: "Georgia, serif", ...style }}>{children}</div>
);

const AnimatedBullet: React.FC<{ frame: number; delay: number; color: string; text: string }> = ({ frame, delay, color, text }) => {
  const f = Math.max(0, frame - delay);
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 24, opacity: fadeIn(f, 0, 20), transform: `translateY(${slideUp(f, 0, 20)}px)` }}>
      <div style={{ width: 16, height: 16, borderRadius: "50%", background: color, marginTop: 6, flexShrink: 0 }} />
      <Text style={{ fontSize: 28, color: "#fff", lineHeight: 1.5 }}>{text}</Text>
    </div>
  );
};

const CoordGrid: React.FC<{ width: number; height: number; color?: string }> = ({ width, height, color = "#334" }) => {
  const lines: React.ReactNode[] = [];
  const step = 40;
  for (let x = 0; x <= width; x += step) lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={height} stroke={color} strokeWidth={0.5} />);
  for (let y = 0; y <= height; y += step) lines.push(<line key={`h${y}`} x1={0} y1={y} x2={width} y2={y} stroke={color} strokeWidth={0.5} />);
  return <svg width={width} height={height} style={{ position: "absolute", top: 0, left: 0 }}><g>{lines}</g></svg>;
};

// Scene 1
const Scene1: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#0a1628", justifyContent: "center", alignItems: "center" }}>
      <CoordGrid width={1280} height={720} color="#1a2a4a" />
      <svg width={1280} height={720} style={{ position: "absolute" }}>
        <defs>
          <linearGradient id="tealGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00bcd4" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#00bcd4" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`M 100,600 Q 400,200 640,400 Q 880,580 1180,150`} fill="none" stroke="#00bcd4" strokeWidth={3}
          strokeDasharray={2000} strokeDashoffset={interpolate(frame, [20, 120], [2000, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
        <path d={`M 100,600 Q 400,200 640,400 Q 880,580 1180,150 L 1180,620 L 100,620 Z`}
          fill="url(#tealGrad)" opacity={interpolate(frame, [80, 150], [0, 0.5], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
      </svg>
      <div style={{ zIndex: 10, textAlign: "center" }}>
        <Text style={{ fontSize: 72, color: "#fff", fontWeight: "bold", opacity: fadeIn(frame, 10, 30), transform: `translateY(${slideUp(frame, 10, 30)}px)`, textShadow: "0 4px 20px rgba(0,188,212,0.5)" }}>
          Introduction to Integration
        </Text>
        <Text style={{ fontSize: 38, color: "#00bcd4", marginTop: 24, opacity: fadeIn(frame, 40, 30), transform: `translateY(${slideUp(frame, 40, 30)}px)` }}>
          The Concept of Antiderivatives
        </Text>
      </div>
      <Audio src={staticFile("audio/8b833d63-1a86-4c9a-89bb-7ab6e8740ede.mp3")} />
    </AbsoluteFill>
  );
};

// Scene 2
const Scene2: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = Math.sin(frame * 0.1) * 0.05 + 1;
  const pulseR = Math.sin(frame * 0.1 + Math.PI) * 0.05 + 1;
  return (
    <AbsoluteFill style={{ background: "#fff", justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
      <Text style={{ fontSize: 44, fontWeight: "bold", color: "#222", marginBottom: 60, opacity: fadeIn(frame, 5, 20) }}>Integration Reverses Differentiation</Text>
      <div style={{ display: "flex", gap: 100, alignItems: "center" }}>
        <div style={{ textAlign: "center", opacity: fadeIn(frame, 15, 20), transform: `scale(${pulse})` }}>
          <div style={{ fontSize: 28, color: "#e67e22", fontWeight: "bold", marginBottom: 12 }}>F(x) → f(x)</div>
          <div style={{ width: 200, height: 60, background: "#e67e22", clipPath: "polygon(0 20%,85% 20%,85% 0%,100% 50%,85% 100%,85% 80%,0 80%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 22 }}>Differentiation</Text>
          </div>
          <div style={{ fontSize: 40, marginTop: 16 }}>▶</div>
        </div>
        <div style={{ textAlign: "center", opacity: fadeIn(frame, 30, 20), transform: `scale(${pulseR})` }}>
          <div style={{ fontSize: 28, color: "#2980b9", fontWeight: "bold", marginBottom: 12 }}>f(x) → F(x)</div>
          <div style={{ width: 200, height: 60, background: "#2980b9", clipPath: "polygon(100% 20%,15% 20%,15% 0%,0% 50%,15% 100%,15% 80%,100% 80%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 22 }}>Integration</Text>
          </div>
          <div style={{ fontSize: 40, marginTop: 16 }}>◀</div>
        </div>
      </div>
      <Audio src={staticFile("audio/8ae4d182-3d40-4b60-a647-dae70635cee0.mp3")} />
    </AbsoluteFill>
  );
};

// Scene 3
const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#fff", justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
      <Text style={{ fontSize: 52, color: "#e67e22", fontWeight: "bold", opacity: fadeIn(frame, 5, 20) }}>F′(x) = f(x)</Text>
      <div style={{ opacity: fadeIn(frame, 25, 20), marginTop: 20, fontSize: 36, color: "#555" }}>↓ means</div>
      <Text style={{ fontSize: 40, color: "#2980b9", fontWeight: "bold", marginTop: 20, opacity: fadeIn(frame, 45, 20) }}>F(x) is the antiderivative of f(x)</Text>
      <div style={{ display: "flex", gap: 60, marginTop: 40, opacity: fadeIn(frame, 65, 20) }}>
        <div style={{ border: "2px solid #e67e22", borderRadius: 8, padding: "10px 20px", textAlign: "center" }}>
          <Text style={{ fontSize: 28, color: "#e67e22" }}>F′(x)</Text>
          <Text style={{ fontSize: 18, color: "#888" }}>derivative of F</Text>
        </div>
        <div style={{ border: "2px solid #2980b9", borderRadius: 8, padding: "10px 20px", textAlign: "center" }}>
          <Text style={{ fontSize: 28, color: "#2980b9" }}>f(x)</Text>
          <Text style={{ fontSize: 18, color: "#888" }}>original function</Text>
        </div>
      </div>
      <Audio src={staticFile("audio/74b88b01-cd16-4154-80a4-e55bc2311b71.mp3")} />
    </AbsoluteFill>
  );
};

// Scene 4
const Scene4: React.FC = () => {
  const frame = useCurrentFrame();
  const highlight = interpolate(frame, [60, 120], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: "#f8f9fa", justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 80, alignItems: "center", marginBottom: 40 }}>
        <div style={{ textAlign: "center", opacity: fadeIn(frame, 5, 20), background: `rgba(230,126,34,${0.1 + 0.2 * highlight})`, padding: 30, borderRadius: 12, border: "2px solid #e67e22" }}>
          <Text style={{ fontSize: 36, color: "#e67e22", fontWeight: "bold" }}>d/dx [x²] = 2x</Text>
          <div style={{ marginTop: 16, fontSize: 24, color: "#e67e22" }}>→ Differentiation</div>
        </div>
        <div style={{ textAlign: "center", opacity: fadeIn(frame, 25, 20), background: `rgba(41,128,185,${0.1 + 0.2 * (1 - highlight)})`, padding: 30, borderRadius: 12, border: "2px solid #2980b9" }}>
          <Text style={{ fontSize: 36, color: "#2980b9", fontWeight: "bold" }}>∫2x dx = x²</Text>
          <div style={{ marginTop: 16, fontSize: 24, color: "#2980b9" }}>← Integration</div>
        </div>
      </div>
      <svg width={300} height={200} style={{ opacity: fadeIn(frame, 50, 25) }}>
        <line x1={150} y1={0} x2={150} y2={200} stroke="#ccc" strokeWidth={1.5} />
        <line x1={0} y1={180} x2={300} y2={180} stroke="#ccc" strokeWidth={1.5} />
        <path d="M 10,175 Q 150,10 290,175" fill="none" stroke="#00bcd4" strokeWidth={3} />
        <text x={155} y={50} fontSize={18} fill="#00bcd4">y = x²</text>
      </svg>
      <Audio src={staticFile("audio/77c425b0-765c-4863-a88f-2a5ca736f016.mp3")} />
    </AbsoluteFill>
  );
};

// Scene 5
const Scene5: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#1a1a2e", justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
      <Text style={{ fontSize: 48, color: "#fff", marginBottom: 60, opacity: fadeIn(frame, 5, 20) }}>Reading Integral Notation</Text>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 90, marginBottom: 60 }}>
        <span style={{ color: "#9b59b6", opacity: fadeIn(frame, 15, 20), display: "inline-block" }}>∫</span>
        <span style={{ color: "#e67e22", opacity: fadeIn(frame, 30, 20), display: "inline-block" }}> f(x) </span>
        <span style={{ color: "#27ae60", opacity: fadeIn(frame, 45, 20), display: "inline-block" }}>dx</span>
      </div>
      <div style={{ display: "flex", gap: 60 }}>
        {[
          { color: "#9b59b6", sym: "∫", label: "integral sign\n(elongated S)", delay: 60 },
          { color: "#e67e22", sym: "f(x)", label: "integrand:\nthe function", delay: 80 },
          { color: "#27ae60", sym: "dx", label: "variable of\nintegration", delay: 100 },
        ].map(({ color, sym, label, delay }) => (
          <div key={sym} style={{ textAlign: "center", opacity: fadeIn(frame, delay, 20) }}>
            <div style={{ width: 2, height: 40, background: color, margin: "0 auto" }} />
            <div style={{ border: `2px solid ${color}`, borderRadius: 8, padding: "10px 16px", background: `${color}22` }}>
              <Text style={{ fontSize: 22, color, whiteSpace: "pre-line" }}>{label}</Text>
            </div>
          </div>
        ))}
      </div>
      <Audio src={staticFile("audio/e56cd0c3-d97a-43bb-bace-abfab3e34930.mp3")} />
    </AbsoluteFill>
  );
};

// Scene 6
const Scene6: React.FC = () => {
  const frame = useCurrentFrame();
  const glow = Math.sin(frame * 0.15) * 0.5 + 0.5;
  return (
    <AbsoluteFill style={{ background: "#f0f4f8", justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 72 }}>
        <span style={{ color: "#2980b9", opacity: fadeIn(frame, 5, 20) }}>∫f(x)dx</span>
        <span style={{ color: "#555", opacity: fadeIn(frame, 25, 15) }}>=</span>
        <span style={{ color: "#e67e22", opacity: fadeIn(frame, 40, 20) }}>F(x)</span>
        <span style={{ color: "#e74c3c", opacity: fadeIn(frame, 60, 20) }}>+ C</span>
      </div>
      <div style={{ marginTop: 50, opacity: fadeIn(frame, 70, 20), display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ width: 50, height: 50, borderRadius: "50%", background: "#e74c3c", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 ${20 * glow}px #e74c3c` }}>
          <Text style={{ color: "#fff", fontSize: 28, fontWeight: "bold" }}>?</Text>
        </div>
        <div style={{ borderLeft: "3px dashed #e74c3c", paddingLeft: 20 }}>
          <Text style={{ fontSize: 28, color: "#e74c3c" }}>Why is this here?</Text>
        </div>
      </div>
      <Audio src={staticFile("audio/6ea6f561-8af3-49b5-9ebb-12aa48125d24.mp3")} />
    </AbsoluteFill>
  );
};

// Scene 7
const Scene7: React.FC = () => {
  const frame = useCurrentFrame();
  const rows = [
    { expr: "d/dx [x²", c: "+ 5", end: "] = 2x", delay: 10 },
    { expr: "d/dx [x²", c: "+ 100", end: "] = 2x", delay: 50 },
    { expr: "d/dx [x²", c: "+ C", end: "] = 2x", delay: 90 },
  ];
  return (
    <AbsoluteFill style={{ background: "#fff", justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 30 }}>
      <Text style={{ fontSize: 44, fontWeight: "bold", color: "#222", marginBottom: 20, opacity: fadeIn(frame, 5, 15) }}>Why C Exists: Constants Disappear</Text>
      {rows.map(({ expr, c, end, delay }) => (
        <div key={c} style={{ opacity: fadeIn(frame, delay, 20), transform: `translateY(${slideUp(frame, delay, 20)}px)`, fontSize: 42, display: "flex", gap: 4 }}>
          <Text style={{ color: "#333" }}>{expr}</Text>
          <Text style={{ color: "#e74c3c", fontWeight: "bold" }}>{c}</Text>
          <Text style={{ color: "#333" }}>{end}</Text>
        </div>
      ))}
      <div style={{ marginTop: 30, opacity: fadeIn(frame, 130, 20), border: "3px solid #e67e22", borderRadius: 12, padding: "16px 32px", background: "#fff9f0" }}>
        <Text style={{ fontSize: 36, color: "#e67e22", fontWeight: "bold" }}>constants vanish!</Text>
      </div>
      <Audio src={staticFile("audio/cf0d0dc9-5192-4c7f-b9ce-6a24dfcfeabb.mp3")} />
    </AbsoluteFill>
  );
};

// Scene 8
const Scene8: React.FC = () => {
  const frame = useCurrentFrame();
  const curves = [
    { label: "y = x²", color: "#e74c3c", offset: 0, delay: 10 },
    { label: "y = x² + 2", color: "#e67e22", offset: -30, delay: 40 },
    { label: "y = x² − 3", color: "#27ae60", offset: 45, delay: 70 },
    { label: "y = x² + 5", color: "#2980b9", offset: -60, delay: 100 },
  ];
  const cx = 320, base = 300, scale = 0.04;
  return (
    <AbsoluteFill style={{ background: "#0d1b2a", justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
      <Text style={{ fontSize: 38, color: "#fff", fontWeight: "bold", marginBottom: 20, opacity: fadeIn(frame, 5, 20) }}>Family of Antiderivatives of 2x</Text>
      <svg width={700} height={420}>
        <line x1={cx} y1={0} x2={cx} y2={420} stroke="#444" strokeWidth={1.5} />
        <line x1={0} y1={base} x2={700} y2={base} stroke="#444" strokeWidth={1.5} />
        {curves.map(({ label, color, offset, delay }) => {
          const op = fadeIn(frame, delay, 25);
          const pts = Array.from({ length: 41 }, (_, i) => { const x = i * 17; const xi = (x - cx) * 0.3; const y = base - (xi * xi * scale + offset); return `${x},${y}`; }).join(" ");
          return (
            <g key={label} opacity={op}>
              <polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} />
              <text x={560} y={base - (((560 - cx) * 0.3) ** 2 * scale + offset)} fontSize={18} fill={color}>{label}</text>
            </g>
          );
        })}
      </svg>
      <Text style={{ fontSize: 26, color: "#aaa", marginTop: 16, opacity: fadeIn(frame, 130, 20) }}>+ C accounts for all of these</Text>
      <Audio src={staticFile("audio/f313758a-e3a8-4386-9d59-d0eb1a22b014.mp3")} />
    </AbsoluteFill>
  );
};

// Scene 9
const Scene9: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#fff", justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
      <Text style={{ fontSize: 44, fontWeight: "bold", color: "#222", marginBottom: 40, opacity: fadeIn(frame, 5, 20) }}>Power Rule for Integration</Text>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 60, opacity: fadeIn(frame, 20, 25) }}>
        <span style={{ color: "#333" }}>∫x</span>
        <span style={{ color: "#9b59b6", fontSize: 40 }}>n</span>
        <span style={{ color: "#333" }}> dx =</span>
        <span style={{ color: "#333" }}> x</span>
        <span style={{ color: "#2980b9", fontSize: 40 }}>n+1</span>
        <span style={{ color: "#333" }}> /</span>
        <span style={{ color: "#e67e22" }}>(n+1)</span>
        <span style={{ color: "#333" }}> + C</span>
      </div>
      <div style={{ marginTop: 40, opacity: fadeIn(frame, 60, 20), display: "flex", gap: 30 }}>
        <div style={{ border: "2px solid #9b59b6", borderRadius: 8, padding: "8px 20px" }}><Text style={{ color: "#9b59b6", fontSize: 22 }}>n = original exponent</Text></div>
        <div style={{ border: "2px solid #2980b9", borderRadius: 8, padding: "8px 20px" }}><Text style={{ color: "#2980b9", fontSize: 22 }}>n+1 = new exponent</Text></div>
        <div style={{ border: "2px solid #e67e22", borderRadius: 8, padding: "8px 20px" }}><Text style={{ color: "#e67e22", fontSize: 22 }}>n+1 = denominator</Text></div>
      </div>
      <Text style={{ fontSize: 28, color: "#e74c3c", marginTop: 30, opacity: fadeIn(frame, 90, 20) }}>Valid for n ≠ −1</Text>
      <Audio src={staticFile("audio/6dc9b48f-1cc2-4f1f-b0f9-1a7eb4d34ebe.mp3")} />
    </AbsoluteFill>
  );
};

// Scene 10
const Scene10: React.FC = () => {
  const frame = useCurrentFrame();
  const steps = [
    { text: "∫x³ dx", delay: 10, color: "#333" },
    { text: "add 1 to exponent: 3+1 = 4", delay: 40, color: "#9b59b6" },
    { text: "x⁴ / 4", delay: 70, color: "#2980b9" },
    { text: "+ C", delay: 100, color: "#e74c3c" },
  ];
  return (
    <AbsoluteFill style={{ background: "#f8f9fa", justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
      <Text style={{ fontSize: 42, fontWeight: "bold", color: "#222", marginBottom: 30, opacity: fadeIn(frame, 5, 20) }}>Applying the Power Rule to x³</Text>
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 30 }}>
        {steps.map(({ text, delay, color }) => (
          <React.Fragment key={text}>
            <Text style={{ fontSize: 40, color, fontWeight: "bold", opacity: fadeIn(frame, delay, 20) }}>{text}</Text>
            {text !== "+ C" && <span style={{ fontSize: 36, color: "#aaa", opacity: fadeIn(frame, delay + 15, 15) }}>→</span>}
          </React.Fragment>
        ))}
      </div>
      <div style={{ opacity: fadeIn(frame, 120, 25), border: "3px solid #2980b9", borderRadius: 12, padding: "14px 40px", marginBottom: 30 }}>
        <Text style={{ fontSize: 48, color: "#2980b9", fontWeight: "bold" }}>x⁴/4 + C</Text>
      </div>
      <div style={{ borderTop: "2px dashed #ccc", paddingTop: 20, opacity: fadeIn(frame, 150, 25), textAlign: "center" }}>
        <Text style={{ fontSize: 28, color: "#27ae60" }}>d/dx [x⁴/4 + C] = 4x³/4 = x³ ✓</Text>
      </div>
      <Audio src={staticFile("audio/541d7c91-f7a7-41be-93ec-ec6681debf05.mp3")} />
    </AbsoluteFill>
  );
};

// Scene 11
const Scene11: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#fff", justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 30 }}>
      <Text style={{ fontSize: 42, fontWeight: "bold", color: "#222", opacity: fadeIn(frame, 5, 20) }}>Constant Rule for Integration</Text>
      <div style={{ opacity: fadeIn(frame, 20, 20), fontSize: 56, display: "flex", gap: 10 }}>
        <span style={{ color: "#333" }}>∫</span>
        <span style={{ color: "#e67e22", fontWeight: "bold" }}>k</span>
        <span style={{ color: "#333" }}> dx =</span>
        <span style={{ color: "#2980b9", fontWeight: "bold" }}>kx</span>
        <span style={{ color: "#333" }}> + C</span>
      </div>
      <div style={{ opacity: fadeIn(frame, 50, 20), fontSize: 44, color: "#555" }}>∫5 dx = 5x + C</div>
      <div style={{ opacity: fadeIn(frame, 80, 20), fontSize: 32, color: "#27ae60" }}>d/dx [5x + C] = 5 ✓</div>
      <svg width={400} height={60} style={{ opacity: fadeIn(frame, 100, 20) }}>
        <line x1={0} y1={30} x2={400} y2={30} stroke="#e67e22" strokeWidth={4} />
        <text x={170} y={20} fontSize={18} fill="#e67e22">constant function</text>
        <text x={180} y={55} fontSize={16} fill="#888">y = 5</text>
      </svg>
      <Audio src={staticFile("audio/928c7577-09d7-4809-b3cb-19b8bbc26671.mp3")} />
    </AbsoluteFill>
  );
};

// Scene 12
const Scene12: React.FC = () => {
  const frame = useCurrentFrame();
  const shadeProgress = interpolate(frame, [40, 130], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const W = 600, H = 400, pad = 60;
  const a = pad, b = W - pad, mid = H * 0.3;
  const pts = Array.from({ length: 50 }, (_, i) => { const x = a + (b - a) * i / 49; const t = (i / 49) * 2 - 1; const y = mid + 80 * Math.sin(t * Math.PI * 0.8) - 40 * t; return [x, y]; });
  const shadeCount = Math.floor(shadeProgress * pts.length);
  const shadePts = shadeCount > 1 ? [...pts.slice(0, shadeCount).map(p => p.join(",")).join(" "), ` ${pts[shadeCount - 1][0]},${H - pad} ${a},${H - pad}`].join(" ") : "";
  const curvePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]},${p[1]}`).join(" ");
  return (
    <AbsoluteFill style={{ background: "#f0f4f8", justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
      <Text style={{ fontSize: 42, fontWeight: "bold", color: "#222", marginBottom: 20, opacity: fadeIn(frame, 5, 20) }}>Integral = Area Under the Curve</Text>
      <svg width={W} height={H}>
        <line x1={pad / 2} y1={H - pad} x2={W - pad / 2} y2={H - pad} stroke="#888" strokeWidth={2} />
        <line x1={pad} y1={pad / 2} x2={pad} y2={H - pad / 2} stroke="#888" strokeWidth={2} />
        {shadeCount > 1 && <polygon points={shadePts} fill="rgba(41,128,185,0.3)" />}
        <path d={curvePath} fill="none" stroke="#e67e22" strokeWidth={3} opacity={fadeIn(frame, 10, 25)} />
        <line x1={a} y1={pad / 2} x2={a} y2={H - pad} stroke="#2980b9" strokeWidth={2} strokeDasharray="6,4" opacity={fadeIn(frame, 30, 20)} />
        <line x1={b} y1={pad / 2} x2={b} y2={H - pad} stroke="#2980b9" strokeWidth={2} strokeDasharray="6,4" opacity={fadeIn(frame, 30, 20)} />
        <text x={a - 8} y={H - pad + 20} fontSize={18} fill="#2980b9" opacity={fadeIn(frame, 30, 20)}>a</text>
        <text x={b - 6} y={H - pad + 20} fontSize={18} fill="#2980b9" opacity={fadeIn(frame, 30, 20)}>b</text>
        <text x={W / 2 - 60} y={H / 2 + 30} fontSize={20} fill="#fff" fontWeight="bold" opacity={interpolate(frame, [80, 110], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}>Area = ∫f(x)dx</text>
      </svg>
      <Audio src={staticFile("audio/ee44b953-fa75-4a07-abce-1cef63280f1b.mp3")} />
    </AbsoluteFill>
  );
};

// Scene 13
const Scene13: React.FC = () => {
  const frame = useCurrentFrame();
  const bullets = [
    { color: "#e67e22", text: "Integration reverses differentiation: F′(x) = f(x)", delay: 20 },
    { color: "#2980b9", text: "∫f(x)dx = F(x) + C", delay: 50 },
    { color: "#e74c3c", text: "C exists because constants vanish under differentiation", delay: 80 },
    { color: "#27ae60", text: "Power rule: ∫xⁿdx = xⁿ⁺¹/(n+1) + C  |  Constant rule: ∫k dx = kx + C", delay: 110 },
  ];
  return (
    <AbsoluteFill style={{ background: "#0a1628", justifyContent: "center", alignItems: "center", flexDirection: "column", padding: "0 80px" }}>
      <Text style={{ fontSize: 52, color: "#fff", fontWeight: "bold", marginBottom: 50, opacity: fadeIn(frame, 5, 25), textAlign: "center" }}>Lesson 1 Summary</Text>
      {bullets.map((b) => <AnimatedBullet key={b.delay} frame={frame} delay={b.delay} color={b.color} text={b.text} />)}
      <Audio src={staticFile("audio/c9f32281-2cf5-4c4c-b8a3-bfabfd491335.mp3")} />
    </AbsoluteFill>
  );
};

export const Lesson62f41839 = () => {
  return (
    <Series>
      <Series.Sequence durationInFrames={455}><Scene1 /></Series.Sequence>
      <Series.Sequence durationInFrames={396}><Scene2 /></Series.Sequence>
      <Series.Sequence durationInFrames={345}><Scene3 /></Series.Sequence>
      <Series.Sequence durationInFrames={379}><Scene4 /></Series.Sequence>
      <Series.Sequence durationInFrames={456}><Scene5 /></Series.Sequence>
      <Series.Sequence durationInFrames={312}><Scene6 /></Series.Sequence>
      <Series.Sequence durationInFrames={520}><Scene7 /></Series.Sequence>
      <Series.Sequence durationInFrames={438}><Scene8 /></Series.Sequence>
      <Series.Sequence durationInFrames={451}><Scene9 /></Series.Sequence>
      <Series.Sequence durationInFrames={435}><Scene10 /></Series.Sequence>
      <Series.Sequence durationInFrames={412}><Scene11 /></Series.Sequence>
      <Series.Sequence durationInFrames={518}><Scene12 /></Series.Sequence>
      <Series.Sequence durationInFrames={525}><Scene13 /></Series.Sequence>
    </Series>
  );
};