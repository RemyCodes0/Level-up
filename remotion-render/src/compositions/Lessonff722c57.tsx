import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Series, Audio, staticFile } from "remotion";
import React from "react";

const COLORS = {
  darkBlue: "#0a1628",
  blue: "#1e3a8a",
  lightBlue: "#3b82f6",
  gold: "#f59e0b",
  green: "#10b981",
  red: "#ef4444",
  orange: "#f97316",
  purple: "#8b5cf6",
  white: "#ffffff",
  cream: "#fef9ef",
  yellow: "#fde047",
};

const fade = (frame: number, start: number, dur: number) =>
  interpolate(frame, [start, start + dur], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

const slideUp = (frame: number, start: number, dur: number) =>
  interpolate(frame, [start, start + dur], [40, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

function MathText({ text, color = COLORS.white, size = 28, bold = false, style = {} }: { text: string; color?: string; size?: number; bold?: boolean; style?: React.CSSProperties }) {
  return (
    <span style={{ color, fontSize: size, fontWeight: bold ? "bold" : "normal", fontFamily: "Georgia, serif", ...style }}>
      {text}
    </span>
  );
}

function AnimLine({ frame, startFrame, children, style = {} }: { frame: number; startFrame: number; children: React.ReactNode; style?: React.CSSProperties }) {
  const op = fade(frame, startFrame, 20);
  const y = slideUp(frame, startFrame, 20);
  return (
    <div style={{ opacity: op, transform: `translateY(${y}px)`, marginBottom: 16, ...style }}>
      {children}
    </div>
  );
}

function Scene1({ frame }: { frame: number }) {
  const titleOp = fade(frame, 10, 30);
  const subtitleOp = fade(frame, 40, 30);
  const icon1Op = fade(frame, 80, 40);
  const icon2Op = fade(frame, 110, 40);

  const particles = [
    { x: 10, y: 20, r: 3, delay: 0 },
    { x: 80, y: 15, r: 2, delay: 10 },
    { x: 50, y: 80, r: 4, delay: 20 },
    { x: 20, y: 70, r: 2, delay: 5 },
    { x: 90, y: 60, r: 3, delay: 15 },
    { x: 30, y: 40, r: 2, delay: 25 },
    { x: 70, y: 85, r: 3, delay: 8 },
  ];

  return (
    <AbsoluteFill style={{ background: COLORS.darkBlue, justifyContent: "center", alignItems: "center" }}>
      {particles.map((p, i) => {
        const pOp = interpolate(frame, [p.delay, p.delay + 60, p.delay + 120], [0, 0.4, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
        return <div key={i} style={{ position: "absolute", left: `${p.x}%`, top: `${p.y}%`, width: p.r * 4, height: p.r * 4, borderRadius: "50%", background: COLORS.lightBlue, opacity: pOp }} />;
      })}
      <div style={{ textAlign: "center", zIndex: 1 }}>
        <div style={{ opacity: titleOp, transform: `translateY(${slideUp(frame, 10, 30)}px)` }}>
          <MathText text="Integration by Parts &" size={42} bold color={COLORS.white} />
          <br />
          <MathText text="Trigonometric Integrals" size={42} bold color={COLORS.white} />
        </div>
        <div style={{ opacity: subtitleOp, marginTop: 16 }}>
          <MathText text="Lesson 4" size={30} color={COLORS.gold} bold />
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 80, marginTop: 48 }}>
          <div style={{ opacity: icon1Op, background: "rgba(30,58,138,0.6)", padding: "20px 32px", borderRadius: 16, border: `2px solid ${COLORS.lightBlue}` }}>
            <MathText text="f(x)·g(x)" size={28} color={COLORS.lightBlue} bold />
          </div>
          <div style={{ opacity: icon2Op, background: "rgba(30,58,138,0.6)", padding: "20px 32px", borderRadius: 16, border: `2px solid ${COLORS.gold}` }}>
            <MathText text="∿ sin(x)" size={28} color={COLORS.gold} bold />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function Scene2({ frame }: { frame: number }) {
  const titleOp = fade(frame, 5, 20);
  const prodOp = fade(frame, 30, 25);
  const arrowOp = fade(frame, 80, 25);
  const formulaOp = fade(frame, 130, 30);
  const bracketOp = fade(frame, 190, 25);

  return (
    <AbsoluteFill style={{ background: "#f8f8f0", justifyContent: "center", alignItems: "center" }}>
      <div style={{ width: 700, padding: 40 }}>
        <div style={{ opacity: titleOp, textAlign: "center", marginBottom: 32 }}>
          <MathText text="The Integration by Parts Formula" size={30} bold color={COLORS.blue} />
        </div>
        <div style={{ opacity: prodOp, background: "#e8f0fe", padding: "16px 24px", borderRadius: 10, marginBottom: 20, border: `2px solid ${COLORS.lightBlue}` }}>
          <MathText text="d/dx[uv] = u'v + uv'" size={28} color={COLORS.blue} bold />
        </div>
        <div style={{ opacity: arrowOp, textAlign: "center", marginBottom: 20 }}>
          <MathText text="↓  Rearrange and integrate" size={20} color="#555" />
        </div>
        <div style={{ opacity: formulaOp, background: "#fff0f0", padding: "20px 32px", borderRadius: 12, border: `3px solid ${COLORS.red}`, textAlign: "center", marginBottom: 16 }}>
          <MathText text="∫u dv = uv − ∫v du" size={38} color={COLORS.red} bold />
        </div>
        <div style={{ opacity: bracketOp, textAlign: "center" }}>
          <MathText text="⌐ derived from product rule ¬" size={18} color="#777" style={{ borderTop: `1px solid #aaa`, paddingTop: 8 }} />
        </div>
      </div>
    </AbsoluteFill>
  );
}

function Scene3({ frame }: { frame: number }) {
  const intOp = fade(frame, 10, 25);
  const splitOp = fade(frame, 60, 25);
  const uOp = fade(frame, 90, 25);
  const dvOp = fade(frame, 110, 25);
  const duOp = fade(frame, 150, 25);
  const vOp = fade(frame, 170, 25);
  const bubbleOp = fade(frame, 40, 25);

  return (
    <AbsoluteFill style={{ background: COLORS.darkBlue, justifyContent: "center", alignItems: "center" }}>
      <div style={{ textAlign: "center", width: 680 }}>
        <div style={{ opacity: bubbleOp, background: "rgba(255,255,255,0.1)", borderRadius: 20, padding: "8px 20px", display: "inline-block", marginBottom: 24, border: `1px dashed ${COLORS.gold}` }}>
          <MathText text="💭 Choose wisely!" size={20} color={COLORS.gold} />
        </div>
        <div style={{ opacity: intOp, marginBottom: 32 }}>
          <MathText text="∫ x · eˣ dx" size={44} bold color={COLORS.white} />
        </div>
        <div style={{ opacity: splitOp, display: "flex", justifyContent: "center", alignItems: "stretch", gap: 0, marginBottom: 32 }}>
          <div style={{ background: "rgba(16,185,129,0.2)", border: `2px solid ${COLORS.green}`, borderRadius: "12px 0 0 12px", padding: "16px 32px", opacity: uOp }}>
            <MathText text="u = x" size={28} bold color={COLORS.green} />
          </div>
          <div style={{ width: 2, background: "#888", alignSelf: "stretch" }} />
          <div style={{ background: "rgba(249,115,22,0.2)", border: `2px solid ${COLORS.orange}`, borderRadius: "0 12px 12px 0", padding: "16px 32px", opacity: dvOp }}>
            <MathText text="dv = eˣ dx" size={28} bold color={COLORS.orange} />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 80 }}>
          <div style={{ opacity: duOp, textAlign: "center" }}>
            <MathText text="↓" size={24} color={COLORS.green} />
            <br />
            <MathText text="du = dx" size={24} color={COLORS.green} bold />
          </div>
          <div style={{ opacity: vOp, textAlign: "center" }}>
            <MathText text="↓" size={24} color={COLORS.orange} />
            <br />
            <MathText text="v = eˣ" size={24} color={COLORS.orange} bold />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

const LIATE = [
  { letter: "L", label: "Logarithmic", color: COLORS.purple },
  { letter: "I", label: "Inverse Trig", color: COLORS.lightBlue },
  { letter: "A", label: "Algebraic", color: COLORS.green },
  { letter: "T", label: "Trigonometric", color: COLORS.orange },
  { letter: "E", label: "Exponential", color: COLORS.red },
];

function Scene4({ frame }: { frame: number }) {
  const titleOp = fade(frame, 5, 20);
  const arrowOp = fade(frame, 200, 30);
  const glowOp = fade(frame, 280, 40);

  return (
    <AbsoluteFill style={{ background: COLORS.cream, justifyContent: "center", alignItems: "center" }}>
      <div style={{ opacity: titleOp, position: "absolute", top: 40, textAlign: "center", width: "100%" }}>
        <MathText text="LIATE Rule: Choosing u" size={30} bold color={COLORS.darkBlue} />
      </div>
      <div style={{ display: "flex", gap: 40, alignItems: "center" }}>
        <div style={{ opacity: arrowOp, textAlign: "center", marginRight: 16 }}>
          <MathText text="Choose u" size={16} color="#555" />
          <br />
          <MathText text="↓" size={40} color="#555" />
          <br />
          <MathText text="higher" size={16} color="#555" />
        </div>
        <div>
          {LIATE.map((item, i) => {
            const op = fade(frame, 40 + i * 35, 25);
            const y = slideUp(frame, 40 + i * 35, 25);
            const isComplete = frame > 280;
            return (
              <div key={i} style={{ opacity: op, transform: `translateY(${y}px)`, display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
                <div style={{
                  width: 60, height: 60, borderRadius: 12,
                  background: isComplete ? `${item.color}33` : "transparent",
                  border: `3px solid ${item.color}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: isComplete ? `0 0 16px ${item.color}88` : "none",
                }}>
                  <MathText text={item.letter} size={32} bold color={item.color} />
                </div>
                <MathText text={item.label} size={22} color={item.color} bold />
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ opacity: glowOp, position: "absolute", bottom: 50, textAlign: "center" }}>
        <MathText text="✦ LIATE ✦" size={36} bold color={COLORS.gold} style={{ textShadow: `0 0 20px ${COLORS.gold}` }} />
      </div>
    </AbsoluteFill>
  );
}

function Scene5({ frame }: { frame: number }) {
  const titleOp = fade(frame, 5, 20);
  const liateOp = fade(frame, 30, 25);
  const aHighOp = fade(frame, 80, 25);
  const eHighOp = fade(frame, 110, 25);
  const uBoxOp = fade(frame, 160, 30);
  const dvBoxOp = fade(frame, 190, 30);
  const arrowOp = fade(frame, 220, 30);

  return (
    <AbsoluteFill style={{ background: "#0d1f3c", justifyContent: "center", alignItems: "center" }}>
      <div style={{ opacity: titleOp, position: "absolute", top: 36, textAlign: "center", width: "100%" }}>
        <MathText text="∫ x · eˣ dx" size={36} bold color={COLORS.white} />
      </div>
      <div style={{ display: "flex", gap: 60, alignItems: "center", marginTop: 40 }}>
        <div style={{ opacity: liateOp }}>
          {LIATE.map((item, i) => {
            const isA = item.letter === "A";
            const isE = item.letter === "E";
            const highlighted = (isA && frame > 80) || (isE && frame > 110);
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, background: highlighted ? `${item.color}33` : "transparent", borderRadius: 8, padding: "4px 10px" }}>
                <MathText text={`${item.letter} - ${item.label}`} size={20} color={highlighted ? item.color : "#aaa"} bold={highlighted} />
              </div>
            );
          })}
        </div>
        <div style={{ position: "relative" }}>
          <div style={{ opacity: arrowOp, position: "absolute", left: -48, top: 24, fontSize: 24, color: COLORS.green }}>→</div>
          <div style={{ opacity: uBoxOp, background: `${COLORS.green}22`, border: `3px solid ${COLORS.green}`, borderRadius: 12, padding: "16px 28px", marginBottom: 20 }}>
            <MathText text="u = x" size={28} bold color={COLORS.green} />
            <br />
            <MathText text="(Algebraic)" size={16} color={COLORS.green} />
          </div>
          <div style={{ opacity: dvBoxOp, background: `${COLORS.red}22`, border: `3px solid ${COLORS.red}`, borderRadius: 12, padding: "16px 28px" }}>
            <MathText text="dv = eˣ dx" size={28} bold color={COLORS.red} />
            <br />
            <MathText text="(Exponential)" size={16} color={COLORS.red} />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function Scene6({ frame }: { frame: number }) {
  const lines = [
    { text: "u = x,  dv = eˣ dx", color: COLORS.lightBlue, start: 20 },
    { text: "du = dx,  v = eˣ", color: COLORS.lightBlue, start: 80 },
    { text: "∫x·eˣ dx = x·eˣ − ∫eˣ dx", color: "#333", start: 150, highlight: true },
    { text: "= x·eˣ − eˣ + C", color: COLORS.green, start: 230, bold: true },
  ];
  const checkOp = fade(frame, 320, 30);

  return (
    <AbsoluteFill style={{ background: "#f9f9f4", justifyContent: "center", alignItems: "center" }}>
      <div style={{ width: 680, background: "white", borderRadius: 16, padding: 48, boxShadow: "0 4px 24px rgba(0,0,0,0.12)" }}>
        <div style={{ marginBottom: 24, textAlign: "center" }}>
          <MathText text="Solving ∫x·eˣ dx" size={28} bold color={COLORS.darkBlue} />
        </div>
        {lines.map((l, i) => (
          <AnimLine key={i} frame={frame} startFrame={l.start}>
            <div style={{ background: l.highlight ? COLORS.yellow + "55" : "transparent", padding: l.highlight ? "8px 12px" : "0", borderRadius: 8 }}>
              <MathText text={l.text} size={26} color={l.color} bold={l.bold} />
            </div>
          </AnimLine>
        ))}
        <div style={{ opacity: checkOp, textAlign: "right", marginTop: 16 }}>
          <span style={{ fontSize: 36, color: COLORS.green }}>✓</span>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function Scene7({ frame }: { frame: number }) {
  const circleOp = fade(frame, 10, 30);
  const identityOp = fade(frame, 80, 30);
  const form1Op = fade(frame, 160, 30);
  const form2Op = fade(frame, 200, 30);

  return (
    <AbsoluteFill style={{ background: COLORS.darkBlue, justifyContent: "center", alignItems: "center" }}>
      <div style={{ display: "flex", gap: 60, alignItems: "center" }}>
        <div style={{ opacity: circleOp }}>
          <svg width={220} height={220}>
            <circle cx={110} cy={110} r={90} fill="none" stroke={COLORS.lightBlue} strokeWidth={3} />
            <line x1={110} y1={110} x2={180} y2={110} stroke={COLORS.white} strokeWidth={2} />
            <line x1={180} y1={110} x2={180} y2={38} stroke={COLORS.green} strokeWidth={2} />
            <line x1={110} y1={110} x2={180} y2={38} stroke={COLORS.gold} strokeWidth={2} />
            <text x={145} y={130} fill={COLORS.white} fontSize={14}>cos x</text>
            <text x={188} y={80} fill={COLORS.green} fontSize={14}>sin x</text>
            <text x={125} y={70} fill={COLORS.gold} fontSize={14}>1</text>
          </svg>
        </div>
        <div>
          <div style={{ opacity: identityOp, marginBottom: 24 }}>
            <MathText text="sin²x + cos²x = 1" size={34} bold color={COLORS.lightBlue} />
          </div>
          <div style={{ opacity: form1Op, background: `${COLORS.green}22`, border: `2px solid ${COLORS.green}`, borderRadius: 10, padding: "12px 20px", marginBottom: 12 }}>
            <MathText text="sin²x = 1 − cos²x" size={22} color={COLORS.green} bold />
            <span style={{ fontSize: 14, color: "#aaa" }}> ←</span>
          </div>
          <div style={{ opacity: form2Op, background: `${COLORS.lightBlue}22`, border: `2px solid ${COLORS.lightBlue}`, borderRadius: 10, padding: "12px 20px" }}>
            <MathText text="cos²x = 1 − sin²x" size={22} color={COLORS.lightBlue} bold />
            <span style={{ fontSize: 14, color: "#aaa" }}> ←</span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function Scene8({ frame }: { frame: number }) {
  const titleOp = fade(frame, 5, 20);
  const card1Op = fade(frame, 40, 30);
  const card2Op = fade(frame, 90, 30);
  const ex1Op = fade(frame, 160, 30);
  const ex2Op = fade(frame, 200, 30);

  return (
    <AbsoluteFill style={{ background: "#111827", justifyContent: "center", alignItems: "center" }}>
      <div style={{ opacity: titleOp, position: "absolute", top: 36, textAlign: "center", width: "100%" }}>
        <MathText text="Power Reduction Formulas" size={30} bold color={COLORS.white} />
      </div>
      <div style={{ display: "flex", gap: 40, marginTop: 40 }}>
        <div style={{ opacity: card1Op, background: "rgba(59,130,246,0.2)", border: `3px solid ${COLORS.lightBlue}`, borderRadius: 16, padding: "28px 36px", textAlign: "center", minWidth: 260 }}>
          <MathText text="sin²x = (1 − cos2x) / 2" size={22} bold color={COLORS.lightBlue} />
          <div style={{ opacity: ex1Op, marginTop: 20, background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "10px 14px" }}>
            <MathText text="∫sin²x dx" size={18} color="#aaa" />
            <br />
            <MathText text="= ∫(1−cos2x)/2 dx" size={18} color={COLORS.lightBlue} />
          </div>
        </div>
        <div style={{ opacity: card2Op, background: "rgba(139,92,246,0.2)", border: `3px solid ${COLORS.purple}`, borderRadius: 16, padding: "28px 36px", textAlign: "center", minWidth: 260 }}>
          <MathText text="cos²x = (1 + cos2x) / 2" size={22} bold color={COLORS.purple} />
          <div style={{ opacity: ex2Op, marginTop: 20, background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "10px 14px" }}>
            <MathText text="∫cos²x dx" size={18} color="#aaa" />
            <br />
            <MathText text="= ∫(1+cos2x)/2 dx" size={18} color={COLORS.purple} />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function Scene9({ frame }: { frame: number }) {
  const titleOp = fade(frame, 5, 20);
  const step1Op = fade(frame, 50, 25);
  const step2Op = fade(frame, 130, 25);
  const step3Op = fade(frame, 210, 30);
  const noteOp = fade(frame, 300, 30);

  return (
    <AbsoluteFill style={{ background: "#f8f8f0", justifyContent: "center", alignItems: "center" }}>
      <div style={{ width: 680, background: "white", borderRadius: 16, padding: 44, boxShadow: "0 4px 24px rgba(0,0,0,0.12)" }}>
        <div style={{ opacity: titleOp, marginBottom: 24, textAlign: "center" }}>
          <MathText text="∫ cos²x dx" size={34} bold color={COLORS.darkBlue} />
        </div>
        <AnimLine frame={frame} startFrame={50}>
          <div style={{ background: COLORS.orange + "33", padding: "10px 16px", borderRadius: 8 }}>
            <MathText text="Step 1: = ∫ (1 + cos2x)/2 dx" size={24} color={COLORS.orange} bold />
          </div>
        </AnimLine>
        <AnimLine frame={frame} startFrame={130}>
          <MathText text="Step 2: = ∫ (1/2) dx + ∫ (cos2x/2) dx" size={22} color={COLORS.darkBlue} />
        </AnimLine>
        <AnimLine frame={frame} startFrame={210}>
          <MathText text="Step 3: = x/2 + sin(2x)/4 + C" size={26} bold color={COLORS.green} />
        </AnimLine>
        <div style={{ opacity: noteOp, marginTop: 20, background: `${COLORS.lightBlue}22`, border: `2px solid ${COLORS.lightBlue}`, borderRadius: 10, padding: "10px 16px" }}>
          <MathText text="📝 Reduced power using identity" size={18} color={COLORS.lightBlue} />
        </div>
      </div>
    </AbsoluteFill>
  );
}

function Scene10({ frame }: { frame: number }) {
  const topOp = fade(frame, 10, 25);
  const arr1Op = fade(frame, 80, 25);
  const mid1Op = fade(frame, 110, 25);
  const arr2Op = fade(frame, 170, 25);
  const mid2Op = fade(frame, 200, 25);
  const loopOp = fade(frame, 280, 30);

  return (
    <AbsoluteFill style={{ background: "#0f172a", justifyContent: "center", alignItems: "center" }}>
      <div style={{ textAlign: "center", width: 600 }}>
        <div style={{ opacity: topOp, background: `${COLORS.yellow}22`, border: `3px solid ${COLORS.yellow}`, borderRadius: 16, padding: "16px 32px", display: "inline-block", marginBottom: 12 }}>
          <MathText text="∫ eˣsin(x) dx" size={32} bold color={COLORS.yellow} />
        </div>
        <div style={{ opacity: arr1Op, margin: "8px 0" }}>
          <MathText text="↓ IBP Round 1" size={18} color="#aaa" />
        </div>
        <div style={{ opacity: mid1Op, background: `${COLORS.orange}22`, border: `2px solid ${COLORS.orange}`, borderRadius: 12, padding: "12px 28px", display: "inline-block", marginBottom: 12 }}>
          <MathText text="eˣsin(x) − ∫ eˣcos(x) dx" size={26} color={COLORS.orange} bold />
        </div>
        <div style={{ opacity: arr2Op, margin: "8px 0" }}>
          <MathText text="↓ IBP Round 2" size={18} color="#aaa" />
        </div>
        <div style={{ opacity: mid2Op, background: `${COLORS.red}22`, border: `2px solid ${COLORS.red}`, borderRadius: 12, padding: "12px 28px", display: "inline-block", marginBottom: 20 }}>
          <MathText text="... + ∫ eˣsin(x) dx" size={26} color={COLORS.red} bold />
        </div>
        <div style={{ opacity: loopOp, background: "rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 20px" }}>
          <MathText text="↩ Same integral appears again!" size={22} bold color={COLORS.white} />
        </div>
      </div>
    </AbsoluteFill>
  );
}

function Scene11({ frame }: { frame: number }) {
  const step1Op = fade(frame, 20, 25);
  const step2Op = fade(frame, 110, 30);
  const calloutOp = fade(frame, 130, 30);
  const step3Op = fade(frame, 230, 30);

  return (
    <AbsoluteFill style={{ background: "#f8f8f0", justifyContent: "center", alignItems: "center" }}>
      <div style={{ width: 720, background: "white", borderRadius: 16, padding: 44, boxShadow: "0 4px 24px rgba(0,0,0,0.12)" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <MathText text="Solving Algebraically" size={28} bold color={COLORS.darkBlue} />
        </div>
        <AnimLine frame={frame} startFrame={20}>
          <MathText text="∫eˣsin(x)dx = eˣsin(x) − eˣcos(x) − ∫eˣsin(x)dx" size={20} color={COLORS.darkBlue} />
        </AnimLine>
        <div style={{ opacity: step2Op, marginBottom: 16 }}>
          <div style={{ background: COLORS.yellow + "66", padding: "10px 16px", borderRadius: 8, display: "inline-block" }}>
            <MathText text="2∫eˣsin(x)dx = eˣsin(x) − eˣcos(x)" size={22} bold color="#333" />
          </div>
        </div>
        <div style={{ opacity: calloutOp, background: `${COLORS.orange}22`, border: `2px solid ${COLORS.orange}`, borderRadius: 10, padding: "8px 16px", marginBottom: 16, display: "inline-block" }}>
          <MathText text="✦ Solve algebraically! (add ∫eˣsin x to both sides)" size={17} color={COLORS.orange} />
        </div>
        <AnimLine frame={frame} startFrame={230}>
          <MathText text="∫eˣsin(x)dx = (eˣsin(x) − eˣcos(x))/2 + C" size={24} bold color={COLORS.green} />
        </AnimLine>
      </div>
    </AbsoluteFill>
  );
}

function Scene12({ frame }: { frame: number }) {
  const intOp = fade(frame, 10, 25);
  const call1Op = fade(frame, 60, 25);
  const call2Op = fade(frame, 100, 25);
  const subOp = fade(frame, 170, 30);
  const resOp = fade(frame, 270, 30);

  return (
    <AbsoluteFill style={{ background: COLORS.darkBlue, justifyContent: "center", alignItems: "center" }}>
      <div style={{ width: 680, textAlign: "center" }}>
        <div style={{ opacity: intOp, marginBottom: 24 }}>
          <MathText text="∫ sin³x · cos x dx" size={38} bold color={COLORS.white} />
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 24, marginBottom: 28 }}>
          <div style={{ opacity: call1Op, background: `${COLORS.green}22`, border: `2px solid ${COLORS.green}`, borderRadius: 12, padding: "10px 18px" }}>
            <MathText text="💡 Save sin x for du" size={18} color={COLORS.green} bold />
          </div>
          <div style={{ opacity: call2Op, background: `${COLORS.lightBlue}22`, border: `2px solid ${COLORS.lightBlue}`, borderRadius: 12, padding: "10px 18px" }}>
            <MathText text="Convert sin²x = 1 − cos²x" size={18} color={COLORS.lightBlue} bold />
          </div>
        </div>
        <div style={{ opacity: subOp, background: "rgba(255,255,255,0.1)", borderRadius: 14, padding: "20px 28px", marginBottom: 20, textAlign: "left" }}>
          <MathText text="u = cos x,  du = −sin x dx" size={22} color={COLORS.gold} />
          <br />
          <MathText text="∫ sin²x · sin x · cos x dx = ∫(1−u²)(−du)" size={20} color={COLORS.white} />
        </div>
        <div style={{ opacity: resOp }}>
          <MathText text="= −u + u³/3 + C = −cos x + cos³x/3 + C" size={22} bold color={COLORS.orange} />
        </div>
      </div>
    </AbsoluteFill>
  );
}

function Scene13({ frame }: { frame: number }) {
  const titleOp = fade(frame, 5, 25);
  const panels = [
    { label: "Integration by Parts", content: "∫u dv = uv − ∫v du", color: COLORS.green, start: 50 },
    { label: "Choosing u (LIATE)", content: "L I A T E", color: COLORS.gold, start: 110 },
    { label: "Trig Identities", content: "sin²x + cos²x = 1\nPower Reduction Formulas", color: COLORS.lightBlue, start: 170 },
    { label: "Apply Twice + Solve", content: "2∫eˣsin x dx =\neˣsin x − eˣcos x", color: COLORS.red, start: 230 },
  ];

  return (
    <AbsoluteFill style={{ background: COLORS.darkBlue, justifyContent: "center", alignItems: "center" }}>
      <div style={{ opacity: titleOp, position: "absolute", top: 36, textAlign: "center", width: "100%" }}>
        <MathText text="Lesson 4 Summary: Key Techniques" size={30} bold color={COLORS.white} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, width: 720, marginTop: 40, justifyContent: "center" }}>
        {panels.map((p, i) => {
          const op = fade(frame, p.start, 30);
          const y = slideUp(frame, p.start, 30);
          return (
            <div key={i} style={{
              opacity: op, transform: `translateY(${y}px)`,
              background: `${p.color}18`,
              border: `2px solid ${p.color}`,
              borderRadius: 16,
              padding: "20px 24px",
              width: 310,
              boxShadow: `0 0 18px ${p.color}44`,
              textAlign: "center",
            }}>
              <div style={{ marginBottom: 10 }}>
                <MathText text={p.label} size={18} bold color={p.color} />
              </div>
              <MathText text={p.content} size={18} color={COLORS.white} />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

export const Lessonff722c57 = () => {
  const scenes = [
    { dur: 432, audio: "audio/14e77818-5663-4997-b333-5bae1ccd9cf9.mp3", Component: Scene1 },
    { dur: 517, audio: "audio/9ad32ef7-3b2a-4a6f-8d73-542779ca7e76.mp3", Component: Scene2 },
    { dur: 359, audio: "audio/c17720ac-92c1-4f67-a827-6c4b372d0028.mp3", Component: Scene3 },
    { dur: 390, audio: "audio/db0f26d2-0403-46a9-8ae5-05d549836ca9.mp3", Component: Scene4 },
    { dur: 391, audio: "audio/1f07faad-e379-43b4-8c77-649286037a0e.mp3", Component: Scene5 },
    { dur: 436, audio: "audio/dd8035d1-5c1d-4697-b874-2a42575a09c2.mp3", Component: Scene6 },
    { dur: 423, audio: "audio/bd18f9eb-93e8-4a99-8a99-37820d83e293.mp3", Component: Scene7 },
    { dur: 461, audio: "audio/eaae5133-2d46-4fc4-ba52-06f546cf45c2.mp3", Component: Scene8 },
    { dur: 482, audio: "audio/1cb252b2-27f0-47f3-a442-8c8cbc18f5aa.mp3", Component: Scene9 },
    { dur: 477, audio: "audio/390cbb80-59c1-4662-90ff-cbc2c69113c1.mp3", Component: Scene10 },
    { dur: 452, audio: "audio/d944633a-9caa-48e3-bb58-6d1c38a11d66.mp3", Component: Scene11 },
    { dur: 450, audio: "audio/7a326931-1ae5-4307-964a-c327a23394d7.mp3", Component: Scene12 },
    { dur: 674, audio: "audio/cdb1ff04-9899-4f19-8c71-70a6ac815d27.mp3", Component: Scene13 },
  ];

  return (
    <Series>
      {scenes.map(({ dur, audio, Component }, i) => (
        <Series.Sequence key={i} durationInFrames={dur}>
          <Audio src={staticFile(audio)} />
          <SceneWrapper Component={Component} />
        </Series.Sequence>
      ))}
    </Series>
  );
};

function SceneWrapper({ Component }: { Component: React.FC<{ frame: number }> }) {
  const frame = useCurrentFrame();
  return <Component frame={frame} />;
}