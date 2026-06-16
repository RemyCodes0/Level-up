import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Series, Audio, staticFile } from "remotion";
import React from "react";

const FPS = 30;

const fade = (frame: number, start: number, duration: number = 15) =>
  interpolate(frame, [start, start + duration], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

const slideUp = (frame: number, start: number, fps: number) =>
  spring({ frame: frame - start, fps, config: { damping: 20, stiffness: 120, mass: 1 }, durationInFrames: 20 });

const GridBg: React.FC<{ color?: string }> = ({ color = "#e8e8f0" }) => (
  <svg style={{ position: "absolute", width: "100%", height: "100%", opacity: 0.4 }}>
    {Array.from({ length: 20 }, (_, i) => (
      <line key={`h${i}`} x1="0" y1={i * 54} x2="1920" y2={i * 54} stroke={color} strokeWidth="1" />
    ))}
    {Array.from({ length: 36 }, (_, i) => (
      <line key={`v${i}`} x1={i * 54} y1="0" x2={i * 54} y2="1080" stroke={color} strokeWidth="1" />
    ))}
  </svg>
);

const Title: React.FC<{ text: string; color?: string; size?: number; top?: number }> = ({
  text, color = "#1a237e", size = 56, top = 80
}) => {
  const frame = useCurrentFrame();
  const o = fade(frame, 0);
  return (
    <div style={{ position: "absolute", top, left: 0, right: 0, textAlign: "center", opacity: o }}>
      <span style={{ fontSize: size, fontWeight: 800, color, fontFamily: "Georgia, serif" }}>{text}</span>
    </div>
  );
};

const MathBox: React.FC<{ text: string; color?: string; bg?: string; size?: number; style?: React.CSSProperties }> = ({
  text, color = "#1a237e", bg = "transparent", size = 48, style = {}
}) => (
  <div style={{ background: bg, borderRadius: 12, padding: "12px 28px", display: "inline-block", ...style }}>
    <span style={{ fontSize: size, fontWeight: 700, color, fontFamily: "Georgia, serif" }}>{text}</span>
  </div>
);

const StepItem: React.FC<{ text: string; color: string; frame: number; startAt: number; index: number }> = ({
  text, color, frame, startAt, index
}) => {
  const s = slideUp(frame, startAt + index * 18, FPS);
  const o = fade(frame, startAt + index * 18);
  return (
    <div style={{ transform: `translateY(${(1 - s) * 30}px)`, opacity: o, marginBottom: 28 }}>
      <span style={{ fontSize: 40, fontWeight: 700, color, fontFamily: "Georgia, serif" }}>{text}</span>
    </div>
  );
};

// Scene 1: Intro
const Scene1: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s1 = spring({ frame, fps, config: { damping: 18, stiffness: 100 }, durationInFrames: 25 });
  const arrowO = fade(frame, 60);
  const eq2O = fade(frame, 80);
  return (
    <AbsoluteFill style={{ background: "#fff" }}>
      <GridBg />
      <div style={{ position: "absolute", top: 100, left: 0, right: 0, textAlign: "center", transform: `scale(${0.6 + 0.4 * s1})`, opacity: s1 }}>
        <span style={{ fontSize: 72, fontWeight: 900, color: "#1a237e", fontFamily: "Georgia, serif" }}>Integration Techniques</span>
      </div>
      <div style={{ position: "absolute", top: 210, left: 0, right: 0, textAlign: "center", opacity: fade(frame, 20) }}>
        <span style={{ fontSize: 46, fontWeight: 700, color: "#00897b", fontFamily: "Georgia, serif" }}>Lesson 3: U-Substitution</span>
      </div>
      <div style={{ position: "absolute", top: 340, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 40 }}>
        <MathBox text="∫f(g(x))g'(x)dx" color="#1a237e" size={44} style={{ opacity: fade(frame, 40), background: "#e8eaf6", borderRadius: 16 }} />
        <div style={{ opacity: arrowO, fontSize: 52, color: "#f57c00" }}>→</div>
        <MathBox text="∫f(u)du" color="#2e7d32" size={44} style={{ opacity: eq2O, background: "#e8f5e9", borderRadius: 16 }} />
      </div>
      <div style={{ position: "absolute", top: 500, left: 0, right: 0, textAlign: "center", opacity: fade(frame, 100) }}>
        <span style={{ fontSize: 36, color: "#555", fontFamily: "Georgia, serif", fontStyle: "italic" }}>U-Substitution: Integration's Chain Rule</span>
      </div>
    </AbsoluteFill>
  );
};

// Scene 2: Reversing the Chain Rule
const Scene2: React.FC = () => {
  const frame = useCurrentFrame();
  const lO = fade(frame, 10);
  const rO = fade(frame, 30);
  const arO = fade(frame, 50);
  return (
    <AbsoluteFill style={{ background: "#fafafa" }}>
      <GridBg color="#dde" />
      <Title text="Reversing the Chain Rule" />
      <div style={{ position: "absolute", top: 180, left: 60, right: 60, display: "flex", gap: 60 }}>
        <div style={{ flex: 1, background: "#e8eaf6", borderRadius: 20, padding: 40, opacity: lO }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: "#1565c0", marginBottom: 24 }}>Differentiation</div>
          <MathBox text="d/dx[f(g(x))]" color="#1565c0" size={34} />
          <div style={{ fontSize: 36, color: "#1565c0", margin: "12px 0" }}>=</div>
          <MathBox text="f'(g(x)) · g'(x)" color="#1565c0" size={34} />
        </div>
        <div style={{ display: "flex", alignItems: "center", opacity: arO, flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 52, color: "#f57c00" }}>←</div>
          <div style={{ fontSize: 22, color: "#f57c00", fontWeight: 700 }}>Reverse</div>
        </div>
        <div style={{ flex: 1, background: "#fff3e0", borderRadius: 20, padding: 40, opacity: rO }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: "#e65100", marginBottom: 24 }}>Integration (Reverse)</div>
          <MathBox text="∫f'(g(x))·g'(x)dx" color="#e65100" size={34} />
          <div style={{ fontSize: 36, color: "#e65100", margin: "12px 0" }}>=</div>
          <MathBox text="f(g(x)) + C" color="#e65100" size={34} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 3: Set u = Inner Function
const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const eq1O = fade(frame, 5);
  const bracketO = fade(frame, 30);
  const arrowO = fade(frame, 60);
  const uEqO = fade(frame, 80);
  const finalO = fade(frame, 120);
  return (
    <AbsoluteFill style={{ background: "#fff" }}>
      <GridBg />
      <Title text="Set u = Inner Function g(x)" />
      <div style={{ position: "absolute", top: 200, left: 0, right: 0, textAlign: "center", opacity: eq1O }}>
        <MathBox text="∫f(g(x))g'(x)dx" color="#1a237e" size={52} />
      </div>
      <div style={{ position: "absolute", top: 300, left: 0, right: 0, textAlign: "center", opacity: bracketO }}>
        <span style={{ fontSize: 30, color: "#c62828", fontWeight: 700, fontFamily: "Georgia, serif" }}>↑ inner function g(x)</span>
      </div>
      <div style={{ position: "absolute", top: 370, left: 0, right: 0, textAlign: "center", opacity: arrowO, fontSize: 52, color: "#f57c00" }}>↓</div>
      <div style={{ position: "absolute", top: 430, left: 0, right: 0, textAlign: "center", opacity: uEqO }}>
        <MathBox text="u = g(x)" color="#c62828" size={48} style={{ background: "#ffebee", borderRadius: 14 }} />
      </div>
      <div style={{ position: "absolute", top: 540, left: 0, right: 0, textAlign: "center", opacity: finalO }}>
        <MathBox text="∫f(u)du" color="#2e7d32" size={56} style={{ background: "#e8f5e9", borderRadius: 16 }} />
      </div>
    </AbsoluteFill>
  );
};

// Scene 4: Computing du
const Scene4: React.FC = () => {
  const frame = useCurrentFrame();
  const steps = [
    { text: "Step 1: Let u = g(x)", color: "#1565c0" },
    { text: "Step 2: Differentiate: du = g'(x) dx", color: "#00897b" },
    { text: "Step 3: Replace g(x) with u, g'(x)dx with du", color: "#6a1b9a" },
  ];
  const finalO = fade(frame, 120);
  return (
    <AbsoluteFill style={{ background: "#fafafa" }}>
      <GridBg color="#dde" />
      <Title text="Computing du = g'(x)dx" />
      <div style={{ position: "absolute", top: 190, left: 140 }}>
        {steps.map((s, i) => (
          <StepItem key={i} text={s.text} color={s.color} frame={frame} startAt={20} index={i} />
        ))}
      </div>
      <div style={{ position: "absolute", top: 460, left: 0, right: 0, textAlign: "center", opacity: finalO }}>
        <span style={{ fontSize: 32, color: "#555", fontFamily: "Georgia, serif" }}>∫f(</span>
        <span style={{ fontSize: 32, color: "#c62828", fontWeight: 800, fontFamily: "Georgia, serif", background: "#ffebee", padding: "2px 8px", borderRadius: 6 }}>g(x)</span>
        <span style={{ fontSize: 32, color: "#555", fontFamily: "Georgia, serif" }}>)</span>
        <span style={{ fontSize: 32, color: "#00897b", fontWeight: 800, fontFamily: "Georgia, serif", background: "#e0f2f1", padding: "2px 8px", borderRadius: 6 }}>g'(x)dx</span>
        <span style={{ fontSize: 32, color: "#555", fontFamily: "Georgia, serif" }}> → ∫f(</span>
        <span style={{ fontSize: 32, color: "#c62828", fontWeight: 800, fontFamily: "Georgia, serif" }}>u</span>
        <span style={{ fontSize: 32, color: "#555", fontFamily: "Georgia, serif" }}>)</span>
        <span style={{ fontSize: 32, color: "#00897b", fontWeight: 800, fontFamily: "Georgia, serif" }}>du</span>
      </div>
    </AbsoluteFill>
  );
};

// Scene 5: Example integral
const Scene5: React.FC = () => {
  const frame = useCurrentFrame();
  const eqO = fade(frame, 5);
  const bracketO = fade(frame, 40);
  const tealO = fade(frame, 80);
  return (
    <AbsoluteFill style={{ background: "#f5f5f5" }}>
      <GridBg color="#ccc" />
      <Title text="Example: ∫2x(x²+1)⁵ dx" />
      <div style={{ position: "absolute", top: 220, left: 0, right: 0, textAlign: "center", opacity: eqO }}>
        <MathBox text="∫2x(x² + 1)⁵ dx" color="#212121" size={60} />
      </div>
      <div style={{ position: "absolute", top: 340, left: 200, opacity: bracketO }}>
        <span style={{ fontSize: 36, color: "#c62828", fontFamily: "Georgia, serif" }}>↑ inner function = g(x) = </span>
        <span style={{ fontSize: 36, color: "#c62828", fontWeight: 800, fontFamily: "Georgia, serif" }}>(x² + 1)</span>
      </div>
      <div style={{ position: "absolute", top: 430, left: 200, opacity: tealO }}>
        <span style={{ fontSize: 36, color: "#00897b", fontFamily: "Georgia, serif" }}>↑ </span>
        <span style={{ fontSize: 36, color: "#00897b", fontWeight: 800, fontFamily: "Georgia, serif" }}>2x</span>
        <span style={{ fontSize: 36, color: "#00897b", fontFamily: "Georgia, serif" }}> looks like g'(x)</span>
      </div>
    </AbsoluteFill>
  );
};

// Scene 6: Substituting u and du
const Scene6: React.FC = () => {
  const frame = useCurrentFrame();
  const l1O = fade(frame, 10);
  const l2O = fade(frame, 40);
  const l3O = fade(frame, 80);
  const ansO = fade(frame, 140);
  return (
    <AbsoluteFill style={{ background: "#fff" }}>
      <GridBg />
      <Title text="Substituting u and du" />
      <div style={{ position: "absolute", top: 190, left: 140, opacity: l1O }}>
        <MathBox text="u = x² + 1" color="#c62828" size={44} style={{ background: "#ffebee", borderRadius: 12 }} />
      </div>
      <div style={{ position: "absolute", top: 270, left: 140, opacity: l2O }}>
        <MathBox text="du = 2x dx" color="#00897b" size={44} style={{ background: "#e0f2f1", borderRadius: 12 }} />
      </div>
      <div style={{ position: "absolute", top: 370, left: 0, right: 0, textAlign: "center", opacity: l3O }}>
        <span style={{ fontSize: 38, fontFamily: "Georgia, serif", color: "#555" }}>∫</span>
        <span style={{ fontSize: 38, fontFamily: "Georgia, serif", color: "#00897b", textDecoration: "line-through" }}>2x</span>
        <span style={{ fontSize: 38, fontFamily: "Georgia, serif", color: "#c62828", textDecoration: "line-through" }}>(x²+1)⁵</span>
        <span style={{ fontSize: 38, fontFamily: "Georgia, serif", color: "#00897b", textDecoration: "line-through" }}>dx</span>
        <span style={{ fontSize: 38, fontFamily: "Georgia, serif", color: "#555" }}> → ∫</span>
        <span style={{ fontSize: 38, fontFamily: "Georgia, serif", color: "#2e7d32", fontWeight: 800 }}>u⁵ du</span>
      </div>
      <div style={{ position: "absolute", top: 470, left: 0, right: 0, textAlign: "center", opacity: ansO }}>
        <MathBox text="= u⁶/6 + C" color="#2e7d32" size={52} style={{ background: "#e8f5e9", borderRadius: 16 }} />
      </div>
    </AbsoluteFill>
  );
};

// Scene 7: Back-substitute
const Scene7: React.FC = () => {
  const frame = useCurrentFrame();
  const topO = fade(frame, 5);
  const arrowO = fade(frame, 40);
  const finalO = fade(frame, 80);
  const noteO = fade(frame, 140);
  return (
    <AbsoluteFill style={{ background: "#fafafa" }}>
      <GridBg color="#dde" />
      <Title text="Back-Substitute to Get Final Answer" />
      <div style={{ position: "absolute", top: 200, left: 0, right: 0, textAlign: "center", opacity: topO }}>
        <MathBox text="u⁶/6 + C" color="#1a237e" size={52} />
      </div>
      <div style={{ position: "absolute", top: 290, left: 0, right: 0, textAlign: "center", opacity: arrowO }}>
        <div style={{ fontSize: 48, color: "#f57c00" }}>↓</div>
        <div style={{ fontSize: 30, color: "#f57c00", fontWeight: 700, fontFamily: "Georgia, serif" }}>Back-substitute u = x² + 1</div>
      </div>
      <div style={{ position: "absolute", top: 400, left: 0, right: 0, textAlign: "center", opacity: finalO }}>
        <div style={{ display: "inline-block", background: "#e8f5e9", border: "4px solid #2e7d32", borderRadius: 20, padding: "20px 50px" }}>
          <MathBox text="(x²+1)⁶/6 + C" color="#2e7d32" size={60} />
        </div>
        <span style={{ fontSize: 50, color: "#2e7d32", marginLeft: 20 }}>✓</span>
      </div>
      <div style={{ position: "absolute", top: 560, left: 0, right: 0, textAlign: "center", opacity: noteO }}>
        <span style={{ fontSize: 28, color: "#777", fontStyle: "italic", fontFamily: "Georgia, serif" }}>Always substitute back for indefinite integrals.</span>
      </div>
    </AbsoluteFill>
  );
};

// Scene 8: Definite Integrals
const Scene8: React.FC = () => {
  const frame = useCurrentFrame();
  const lO = fade(frame, 10);
  const rO = fade(frame, 30);
  const ansO = fade(frame, 100);
  return (
    <AbsoluteFill style={{ background: "#fff" }}>
      <GridBg />
      <Title text="Definite Integrals: Two Approaches" />
      <div style={{ position: "absolute", top: 180, left: 40, right: 40, display: "flex", gap: 40 }}>
        <div style={{ flex: 1, background: "#e8eaf6", borderRadius: 20, padding: 32, opacity: lO }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: "#1565c0", marginBottom: 16 }}>Option 1: Change Limits</div>
          <div style={{ fontSize: 28, color: "#1565c0", fontFamily: "Georgia, serif", lineHeight: 2 }}>
            ∫₀¹ 2x(x²+1)⁵ dx<br />
            u = x²+1<br />
            x=0 → u=1<br />
            x=1 → u=2<br />
            = ∫₁² u⁵ du<br />
            = [u⁶/6]₁²
          </div>
        </div>
        <div style={{ flex: 1, background: "#fff3e0", borderRadius: 20, padding: 32, opacity: rO }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: "#e65100", marginBottom: 16 }}>Option 2: Back-Substitute</div>
          <div style={{ fontSize: 28, color: "#e65100", fontFamily: "Georgia, serif", lineHeight: 2 }}>
            ∫ u⁵ du = u⁶/6 + C<br />
            = (x²+1)⁶/6 + C<br />
            Apply x=0 to x=1<br />
            = 2⁶/6 - 1⁶/6
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 80, left: 0, right: 0, textAlign: "center", opacity: ansO }}>
        <div style={{ display: "inline-block", border: "4px solid #2e7d32", borderRadius: 50, padding: "10px 40px" }}>
          <span style={{ fontSize: 44, fontWeight: 800, color: "#2e7d32", fontFamily: "Georgia, serif" }}>= 63/6 = 21/2</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 9: Pattern (ax+b)^n
const Scene9: React.FC = () => {
  const frame = useCurrentFrame();
  const hO = fade(frame, 5);
  const p1O = fade(frame, 30);
  const p2O = fade(frame, 70);
  const p3O = fade(frame, 110);
  return (
    <AbsoluteFill style={{ background: "#e3f2fd" }}>
      <Title text="Pattern: (ax+b)ⁿ Substitution" color="#0d47a1" />
      <div style={{ position: "absolute", top: 170, left: 0, right: 0, textAlign: "center", opacity: hO }}>
        <span style={{ fontSize: 36, fontWeight: 800, color: "#0d47a1", fontFamily: "Georgia, serif" }}>Pattern 1: Power of a Function</span>
      </div>
      <div style={{ position: "absolute", top: 240, left: 0, right: 0, textAlign: "center", opacity: p1O }}>
        <MathBox text="∫(ax+b)ⁿ dx" color="#1a237e" size={52} style={{ background: "#bbdefb", borderRadius: 14 }} />
      </div>
      <div style={{ position: "absolute", top: 340, left: 140, opacity: p2O }}>
        <MathBox text="u = ax+b" color="#c62828" size={40} style={{ background: "#ffebee", borderRadius: 10 }} />
        <span style={{ fontSize: 32, marginLeft: 30, fontFamily: "Georgia, serif", color: "#555" }}>  →  </span>
        <MathBox text="du = a dx" color="#00897b" size={40} style={{ background: "#e0f2f1", borderRadius: 10 }} />
      </div>
      <div style={{ position: "absolute", top: 440, left: 0, right: 0, textAlign: "center", opacity: p3O }}>
        <span style={{ fontSize: 36, fontFamily: "Georgia, serif", color: "#555" }}>∫(3x+5)⁴ dx → </span>
        <MathBox text="(1/3)∫u⁴ du" color="#2e7d32" size={36} style={{ background: "#e8f5e9", borderRadius: 10 }} />
      </div>
    </AbsoluteFill>
  );
};

// Scene 10: e^g(x) and sin(g(x)) patterns
const Scene10: React.FC = () => {
  const frame = useCurrentFrame();
  const lO = fade(frame, 10);
  const rO = fade(frame, 40);
  return (
    <AbsoluteFill style={{ background: "#fff" }}>
      <GridBg />
      <Title text="Patterns: eᵍ⁽ˣ⁾ and sin(g(x))" />
      <div style={{ position: "absolute", top: 180, left: 40, right: 40, display: "flex", gap: 60 }}>
        <div style={{ flex: 1, background: "#fce4ec", borderRadius: 20, padding: 36, opacity: lO }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#c62828", marginBottom: 16 }}>Exponential Pattern</div>
          <MathBox text="∫eᵍ⁽ˣ⁾ g'(x)dx" color="#c62828" size={34} />
          <div style={{ fontSize: 28, color: "#c62828", margin: "8px 0", fontFamily: "Georgia, serif" }}>u = g(x)  →  du = g'(x)dx</div>
          <div style={{ fontSize: 36, color: "#555", margin: "8px 0", fontFamily: "Georgia, serif" }}>→  ∫eᵘ du</div>
          <MathBox text="= eᵘ + C" color="#2e7d32" size={36} style={{ background: "#e8f5e9", borderRadius: 10 }} />
        </div>
        <div style={{ flex: 1, background: "#fff8e1", borderRadius: 20, padding: 36, opacity: rO }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#f57c00", marginBottom: 16 }}>Trig Pattern</div>
          <MathBox text="∫sin(g(x))g'(x)dx" color="#f57c00" size={34} />
          <div style={{ fontSize: 28, color: "#f57c00", margin: "8px 0", fontFamily: "Georgia, serif" }}>u = g(x)  →  du = g'(x)dx</div>
          <div style={{ fontSize: 36, color: "#555", margin: "8px 0", fontFamily: "Georgia, serif" }}>→  ∫sin(u) du</div>
          <MathBox text="= -cos(u) + C" color="#2e7d32" size={36} style={{ background: "#e8f5e9", borderRadius: 10 }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 11: x·e^(x²)
const Scene11: React.FC = () => {
  const frame = useCurrentFrame();
  const eqO = fade(frame, 5);
  const s1O = fade(frame, 40);
  const s2O = fade(frame, 80);
  const s3O = fade(frame, 120);
  const finO = fade(frame, 170);
  return (
    <AbsoluteFill style={{ background: "#fafafa" }}>
      <GridBg color="#dde" />
      <Title text="Function Times Its Own Derivative" />
      <div style={{ position: "absolute", top: 190, left: 0, right: 0, textAlign: "center", opacity: eqO }}>
        <MathBox text="∫x·eˣ² dx" color="#1a237e" size={56} />
      </div>
      <div style={{ position: "absolute", top: 290, left: 0, right: 0, textAlign: "center", opacity: s1O }}>
        <span style={{ fontSize: 32, color: "#c62828", fontFamily: "Georgia, serif", fontWeight: 700 }}>u = x²  →  du = 2x dx  →  x dx = du/2</span>
      </div>
      <div style={{ position: "absolute", top: 360, left: 0, right: 0, textAlign: "center", opacity: s2O }}>
        <span style={{ fontSize: 34, color: "#555", fontFamily: "Georgia, serif" }}>∫x·eˣ² dx = (1/2)∫eᵘ du</span>
      </div>
      <div style={{ position: "absolute", top: 430, left: 0, right: 0, textAlign: "center", opacity: s3O }}>
        <span style={{ fontSize: 34, color: "#555", fontFamily: "Georgia, serif" }}> = (1/2)eᵘ + C</span>
      </div>
      <div style={{ position: "absolute", top: 510, left: 0, right: 0, textAlign: "center", opacity: finO }}>
        <MathBox text="= (1/2)eˣ² + C" color="#2e7d32" size={50} style={{ background: "#e8f5e9", borderRadius: 14 }} />
      </div>
    </AbsoluteFill>
  );
};

// Scene 12: Pitfall
const Scene12: React.FC = () => {
  const frame = useCurrentFrame();
  const bannerO = fade(frame, 5);
  const wrongO = fade(frame, 40);
  const rightO = fade(frame, 100);
  return (
    <AbsoluteFill style={{ background: "#fff" }}>
      <GridBg />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 90, background: "#f9a825", display: "flex", alignItems: "center", justifyContent: "center", opacity: bannerO }}>
        <span style={{ fontSize: 42, fontWeight: 900, color: "#fff", letterSpacing: 2 }}>⚠ Common Mistake</span>
      </div>
      <div style={{ position: "absolute", top: 110, left: 0, right: 0, textAlign: "center", opacity: wrongO }}>
        <div style={{ display: "inline-block", background: "#ffebee", border: "3px solid #c62828", borderRadius: 14, padding: "16px 40px", position: "relative" }}>
          <span style={{ fontSize: 36, color: "#c62828", fontFamily: "Georgia, serif" }}>∫x · u⁵ du  ← </span>
          <span style={{ fontSize: 30, color: "#c62828", fontWeight: 700 }}>x still present! ✗</span>
        </div>
      </div>
      <div style={{ position: "absolute", top: 260, left: 0, right: 0, textAlign: "center" }}>
        <span style={{ fontSize: 34, color: "#555", fontFamily: "Georgia, serif", fontWeight: 700 }}>All x-terms MUST be replaced by u-terms.</span>
      </div>
      <div style={{ position: "absolute", top: 360, left: 0, right: 0, textAlign: "center", opacity: rightO }}>
        <div style={{ display: "inline-block", background: "#e8f5e9", border: "3px solid #2e7d32", borderRadius: 14, padding: "16px 40px" }}>
          <span style={{ fontSize: 36, color: "#2e7d32", fontFamily: "Georgia, serif" }}>∫u⁵ du  ← all x replaced ✓</span>
        </div>
      </div>
      <div style={{ position: "absolute", top: 490, left: 0, right: 0, textAlign: "center", opacity: fade(frame, 140) }}>
        <span style={{ fontSize: 30, color: "#333", fontWeight: 700 }}>All x-terms must be replaced by u-terms.</span>
      </div>
    </AbsoluteFill>
  );
};

// Scene 13: Summary
const Scene13: React.FC = () => {
  const frame = useCurrentFrame();
  const steps = [
    { text: "1. Identify inner function, set u = g(x)", color: "#1565c0" },
    { text: "2. Compute du = g'(x)dx, solve for dx", color: "#00897b" },
    { text: "3. Substitute u and du, integrate", color: "#e65100" },
    { text: "4. Back-substitute u = g(x) for final answer", color: "#2e7d32" },
  ];
  const formulaO = fade(frame, 160);
  return (
    <AbsoluteFill style={{ background: "#fff" }}>
      <GridBg />
      <div style={{ position: "absolute", top: 40, left: 0, right: 0, textAlign: "center", opacity: fade(frame, 0) }}>
        <span style={{ fontSize: 56, fontWeight: 900, color: "#1a237e", fontFamily: "Georgia, serif" }}>U-Substitution: Summary</span>
      </div>
      <div style={{ position: "absolute", top: 150, left: 120 }}>
        {steps.map((s, i) => (
          <StepItem key={i} text={s.text} color={s.color} frame={frame} startAt={20} index={i} />
        ))}
      </div>
      <div style={{ position: "absolute", bottom: 60, left: 0, right: 0, textAlign: "center", opacity: formulaO }}>
        <div style={{ display: "inline-block", background: "#e8eaf6", border: "3px solid #1a237e", borderRadius: 16, padding: "16px 48px" }}>
          <span style={{ fontSize: 40, fontWeight: 800, color: "#1a237e", fontFamily: "Georgia, serif" }}>∫f(g(x))g'(x)dx = ∫f(u)du</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Lessonec0e4ed8 = () => {
  return (
    <Series>
      <Series.Sequence durationInFrames={404}>
        <Audio src={staticFile("audio/adcd1970-b26f-4c6f-af72-e955adeb2eb3.mp3")} />
        <Scene1 />
      </Series.Sequence>
      <Series.Sequence durationInFrames={425}>
        <Audio src={staticFile("audio/b0d972d8-ed70-4bbb-9895-9acc508c1368.mp3")} />
        <Scene2 />
      </Series.Sequence>
      <Series.Sequence durationInFrames={409}>
        <Audio src={staticFile("audio/474b9746-ad5a-455b-b9b9-8cf1b9d633cb.mp3")} />
        <Scene3 />
      </Series.Sequence>
      <Series.Sequence durationInFrames={374}>
        <Audio src={staticFile("audio/cdbe5b99-3344-49ca-862b-8c6041496791.mp3")} />
        <Scene4 />
      </Series.Sequence>
      <Series.Sequence durationInFrames={379}>
        <Audio src={staticFile("audio/e528ae70-c1db-4b33-a825-dc090edf53fd.mp3")} />
        <Scene5 />
      </Series.Sequence>
      <Series.Sequence durationInFrames={417}>
        <Audio src={staticFile("audio/7012a153-f55e-4f99-acd2-757365073709.mp3")} />
        <Scene6 />
      </Series.Sequence>
      <Series.Sequence durationInFrames={427}>
        <Audio src={staticFile("audio/b3db5bc9-2f20-4271-a348-012e4d7aa28f.mp3")} />
        <Scene7 />
      </Series.Sequence>
      <Series.Sequence durationInFrames={399}>
        <Audio src={staticFile("audio/be456917-90c4-4145-a087-d7bbbdd18349.mp3")} />
        <Scene8 />
      </Series.Sequence>
      <Series.Sequence durationInFrames={434}>
        <Audio src={staticFile("audio/f5e29df2-b03a-4fe1-8f2f-46e71a9c96cb.mp3")} />
        <Scene9 />
      </Series.Sequence>
      <Series.Sequence durationInFrames={447}>
        <Audio src={staticFile("audio/0279d044-0255-43f0-a115-c033341dde7e.mp3")} />
        <Scene10 />
      </Series.Sequence>
      <Series.Sequence durationInFrames={494}>
        <Audio src={staticFile("audio/f46d5b88-6d24-4e47-a14e-45ebd60a5605.mp3")} />
        <Scene11 />
      </Series.Sequence>
      <Series.Sequence durationInFrames={496}>
        <Audio src={staticFile("audio/21d26087-c917-4d6c-8f4a-9d7c58bdc8fc.mp3")} />
        <Scene12 />
      </Series.Sequence>
      <Series.Sequence durationInFrames={486}>
        <Audio src={staticFile("audio/923ee607-f0f7-4bf8-8868-7bf34946aa48.mp3")} />
        <Scene13 />
      </Series.Sequence>
    </Series>
  );
};