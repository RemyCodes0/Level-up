// scripts/seedLibraryComponents.js
//
// Hand-written starter set for the global reusable-component library, so
// the admin Component Library page shows something real immediately
// instead of starting empty. Pre-approved (status: "active") — these are
// trusted, human-written TSX, same trust level as lessonComponentLibrary.js,
// not "as we go" candidates that need review.
//
// The six components below were picked directly from real production
// evidence, not guessed: cross-referencing two separate real courses' logs
// this session found the model independently reinventing — and independently
// mis-building (bare <g>/<path> instead of a self-contained <svg>) — the
// exact same small set of shapes: Gear, Shaft, Gauge, Arrow, AngleArc, Wheel.
// Seeding these means those specific, already-proven-costly reinventions
// stop happening starting with the very next course generated.
//
// Same contract as every other shared component (see lessonComponentLibrary.js's
// own header comment): only consumes PALETTE.bg/.accent/.text, CLAMP/SAFE/
// ZONES/clampPos/SVG_FRAME, useCurrentFrame/interpolate/useMemo — nothing else
// guaranteed to exist.
//
// ── Usage ────────────────────────────────────────────────────────────────
//   node scripts/seedLibraryComponents.js
//
// Safe to re-run: skips any name that already exists (any status), same
// non-destructive rule saveCandidates follows in globalComponentLibrary.js —
// never overwrites something an admin may have already reviewed/edited.

const mongoose = require("mongoose");
require("dotenv").config();

const LibraryComponent = require("../models/LibraryComponent");

const STARTER_COMPONENTS = [
  {
    name: "Gear",
    description:
      "Rotating mechanical gear with a configurable tooth count — for gearboxes, engines, and machinery diagrams.",
    propsDoc: "{ cx, cy, radius, teeth, color, rotationSpeed }",
    domainTags: ["engineering", "physics", "mechanics"],
    code: `// Gear({ cx, cy, radius, teeth, color, rotationSpeed })
// A continuously rotating mechanical gear — self-contained <svg>, fully driven by props.
function Gear({ cx, cy, radius, teeth, color, rotationSpeed }) {
  const frame = useCurrentFrame();
  const n = teeth || 10;
  const toothH = radius * 0.22;
  const innerR = radius - toothH;
  const angle = (frame * (rotationSpeed || 1)) % 360;

  const path = useMemo(() => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 0.5) / n) * Math.PI * 2;
      const a2 = ((i + 1) / n) * Math.PI * 2;
      pts.push([Math.cos(a0) * innerR, Math.sin(a0) * innerR]);
      pts.push([Math.cos(a0 + 0.05) * radius, Math.sin(a0 + 0.05) * radius]);
      pts.push([Math.cos(a1 - 0.05) * radius, Math.sin(a1 - 0.05) * radius]);
      pts.push([Math.cos(a1 + 0.05) * radius, Math.sin(a1 + 0.05) * radius]);
      pts.push([Math.cos(a2 - 0.05) * radius, Math.sin(a2 - 0.05) * radius]);
    }
    return "M " + pts.map((p) => p[0] + "," + p[1]).join(" L ") + " Z";
  }, [n, radius, innerR]);

  return (
    <svg style={SVG_FRAME}>
      <g transform={"translate(" + cx + "," + cy + ") rotate(" + angle + ")"}>
        <path d={path} fill={color || PALETTE.accent} opacity={0.9} />
        <circle cx={0} cy={0} r={innerR * 0.35} fill={PALETTE.bg} stroke={color || PALETTE.accent} strokeWidth={3} />
      </g>
    </svg>
  );
}`,
    example: `<Gear cx={960} cy={540} radius={140} teeth={12} color={PALETTE.accent} rotationSpeed={1.5} />`,
  },
  {
    name: "Shaft",
    description:
      "Straight mechanical rod/shaft connecting two points, with an optional draw-in reveal — for linking gears, pistons, or axles.",
    propsDoc: "{ x1, y1, x2, y2, thickness, color, revealAt }",
    domainTags: ["engineering", "physics", "mechanics"],
    code: `// Shaft({ x1, y1, x2, y2, thickness, color, revealAt })
// A straight mechanical shaft/rod — draws in over ~16 frames if revealAt is given.
function Shaft({ x1, y1, x2, y2, thickness, color, revealAt }) {
  const frame = useCurrentFrame();
  const grown = interpolate(frame - (revealAt || 0), [0, 16], [0, 1], CLAMP);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const t = thickness || 14;
  const c = color || PALETTE.text;

  return (
    <svg style={SVG_FRAME}>
      <g transform={"translate(" + x1 + "," + y1 + ") rotate(" + angleDeg + ")"}>
        <rect x={0} y={-t / 2} width={len * grown} height={t} rx={t / 2} fill={c} opacity={0.85} />
        <circle cx={0} cy={0} r={t * 0.7} fill={c} opacity={0.9} />
        <circle cx={len * grown} cy={0} r={t * 0.7} fill={c} opacity={grown} />
      </g>
    </svg>
  );
}`,
    example: `<Shaft x1={500} y1={540} x2={1420} y2={540} thickness={16} color={PALETTE.text} revealAt={0} />`,
  },
  {
    name: "Gauge",
    description:
      "Animated dial gauge with a needle that sweeps to a value — for pressure, speed, temperature, or any bounded-range readout.",
    propsDoc: "{ cx, cy, radius, value, min, max, label, color, revealAt }",
    domainTags: ["engineering", "physics", "data"],
    code: `// Gauge({ cx, cy, radius, value, min, max, label, color, revealAt })
// A dial gauge — needle sweeps from min up to \`value\` starting at revealAt.
function Gauge({ cx, cy, radius, value, min, max, label, color, revealAt }) {
  const frame = useCurrentFrame();
  const lo = min !== undefined ? min : 0;
  const hi = max !== undefined ? max : 100;
  const grown = interpolate(frame - (revealAt || 0), [0, 30], [lo, value], CLAMP);
  const pct = clampPos((grown - lo) / (hi - lo), 0, 1);
  const startAngle = -220;
  const endAngle = 40;
  const needleAngle = startAngle + (endAngle - startAngle) * pct;
  const tickCount = 8;
  const c = color || PALETTE.accent;

  return (
    <svg style={SVG_FRAME}>
      <g transform={"translate(" + cx + "," + cy + ")"}>
        <circle cx={0} cy={0} r={radius} fill={PALETTE.bg} stroke={PALETTE.text} strokeWidth={3} opacity={0.5} />
        {Array.from({ length: tickCount + 1 }).map((_, i) => {
          const a = ((startAngle + (endAngle - startAngle) * (i / tickCount)) * Math.PI) / 180;
          const tx1 = Math.cos(a) * radius * 0.82;
          const ty1 = Math.sin(a) * radius * 0.82;
          const tx2 = Math.cos(a) * radius * 0.95;
          const ty2 = Math.sin(a) * radius * 0.95;
          return <line key={i} x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke={PALETTE.text} strokeWidth={2} opacity={0.5} />;
        })}
        <line
          x1={0} y1={0}
          x2={Math.cos((needleAngle * Math.PI) / 180) * radius * 0.75}
          y2={Math.sin((needleAngle * Math.PI) / 180) * radius * 0.75}
          stroke={c} strokeWidth={5}
          style={{ filter: "drop-shadow(0 0 8px " + c + ")" }}
        />
        <circle cx={0} cy={0} r={radius * 0.08} fill={c} />
        <text x={0} y={radius * 0.5} textAnchor="middle" fontSize={22} fontWeight={800} fill={PALETTE.text}>
          {Math.round(grown)}
        </text>
        {label ? (
          <text x={0} y={radius + 32} textAnchor="middle" fontSize={18} fill={PALETTE.text} opacity={0.75}>
            {label}
          </text>
        ) : null}
      </g>
    </svg>
  );
}`,
    example: `<Gauge cx={960} cy={620} radius={220} value={72} min={0} max={100} label="Pressure" color={PALETTE.accent} revealAt={0} />`,
  },
  {
    name: "Arrow",
    description:
      "Directional arrow that draws in from a start to an end point with an optional label — for forces, vectors, flow direction, cause→effect.",
    propsDoc: "{ x1, y1, x2, y2, color, thickness, revealAt, label }",
    domainTags: ["physics", "math", "general"],
    code: `// Arrow({ x1, y1, x2, y2, color, thickness, revealAt, label })
// A straight arrow that draws in from (x1,y1) to (x2,y2) with an arrowhead — reveal-driven, not looping.
function Arrow({ x1, y1, x2, y2, color, thickness, revealAt, label }) {
  const frame = useCurrentFrame();
  const grown = interpolate(frame - (revealAt || 0), [0, 18], [0, 1], CLAMP);
  const curX = x1 + (x2 - x1) * grown;
  const curY = y1 + (y2 - y1) * grown;
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  const t = thickness || 4;
  const headLen = 16;
  const c = color || PALETTE.accent;

  return (
    <svg style={SVG_FRAME}>
      <line x1={x1} y1={y1} x2={curX} y2={curY} stroke={c} strokeWidth={t} opacity={0.9} />
      <g transform={"translate(" + curX + "," + curY + ") rotate(" + angle + ")"} opacity={grown}>
        <path d={"M 0,0 L -" + headLen + ",-" + headLen / 2 + " L -" + headLen + "," + headLen / 2 + " Z"} fill={c} />
      </g>
      {label && grown > 0.6 ? (
        <text x={(x1 + curX) / 2} y={(y1 + curY) / 2 - 14} textAnchor="middle" fontSize={18} fontWeight={700} fill={PALETTE.text} opacity={grown}>
          {label}
        </text>
      ) : null}
    </svg>
  );
}`,
    example: `<Arrow x1={500} y1={600} x2={1400} y2={480} color={PALETTE.accent} thickness={5} label="Force" revealAt={0} />`,
  },
  {
    name: "AngleArc",
    description:
      "Arc sweeping between two angles around a point, with an optional angle label — for geometry, physics angle-of-incidence, rotational diagrams.",
    propsDoc: "{ cx, cy, radius, startAngle, endAngle, color, label, revealAt }",
    domainTags: ["math", "physics", "geometry"],
    code: `// AngleArc({ cx, cy, radius, startAngle, endAngle, color, label, revealAt })
// Sweeps an arc between two angles (degrees, 0 = +x axis, clockwise) to mark/label an angle.
function AngleArc({ cx, cy, radius, startAngle, endAngle, color, label, revealAt }) {
  const frame = useCurrentFrame();
  const grown = interpolate(frame - (revealAt || 0), [0, 24], [0, 1], CLAMP);
  const sweep = startAngle + (endAngle - startAngle) * grown;
  const toRad = (d) => (d * Math.PI) / 180;
  const sx = cx + Math.cos(toRad(startAngle)) * radius;
  const sy = cy + Math.sin(toRad(startAngle)) * radius;
  const ex = cx + Math.cos(toRad(sweep)) * radius;
  const ey = cy + Math.sin(toRad(sweep)) * radius;
  const largeArc = Math.abs(sweep - startAngle) > 180 ? 1 : 0;
  const c = color || PALETTE.accent;
  const midAngle = toRad((startAngle + sweep) / 2);

  return (
    <svg style={SVG_FRAME}>
      <line x1={cx} y1={cy} x2={sx} y2={sy} stroke={c} strokeWidth={2} opacity={0.5} />
      <line x1={cx} y1={cy} x2={ex} y2={ey} stroke={c} strokeWidth={2} opacity={0.1 + 0.5 * grown} />
      <path
        d={"M " + sx + "," + sy + " A " + radius + "," + radius + " 0 " + largeArc + " 1 " + ex + "," + ey}
        fill="none" stroke={c} strokeWidth={4} opacity={0.9}
      />
      {label && grown > 0.5 ? (
        <text
          x={cx + Math.cos(midAngle) * (radius + 30)}
          y={cy + Math.sin(midAngle) * (radius + 30)}
          textAnchor="middle" fontSize={18} fontWeight={700} fill={PALETTE.text} opacity={grown}
        >
          {label}
        </text>
      ) : null}
    </svg>
  );
}`,
    example: `<AngleArc cx={960} cy={540} radius={180} startAngle={-30} endAngle={60} color={PALETTE.accent} label="θ" revealAt={0} />`,
  },
  {
    name: "Wheel",
    description: "Rotating wheel/pulley rim with spokes — for wheels, pulleys, and rotating machinery.",
    propsDoc: "{ cx, cy, radius, color, rotationSpeed, spokes }",
    domainTags: ["engineering", "physics", "mechanics"],
    code: `// Wheel({ cx, cy, radius, color, rotationSpeed, spokes })
// A rotating wheel/pulley rim with spokes — same family as Gear but smooth-rimmed.
function Wheel({ cx, cy, radius, color, rotationSpeed, spokes }) {
  const frame = useCurrentFrame();
  const n = spokes || 6;
  const angle = (frame * (rotationSpeed || 1)) % 360;
  const c = color || PALETTE.accent;

  return (
    <svg style={SVG_FRAME}>
      <g transform={"translate(" + cx + "," + cy + ") rotate(" + angle + ")"}>
        <circle cx={0} cy={0} r={radius} fill="none" stroke={c} strokeWidth={8} opacity={0.9} />
        <circle cx={0} cy={0} r={radius * 0.14} fill={c} />
        {Array.from({ length: n }).map((_, i) => {
          const a = (i / n) * Math.PI * 2;
          return (
            <line
              key={i}
              x1={0} y1={0}
              x2={Math.cos(a) * radius * 0.92} y2={Math.sin(a) * radius * 0.92}
              stroke={c} strokeWidth={5} opacity={0.75}
            />
          );
        })}
      </g>
    </svg>
  );
}`,
    example: `<Wheel cx={960} cy={540} radius={160} color={PALETTE.accent} rotationSpeed={2} spokes={8} />`,
  },

  // ── Second wave: 50 broadly-reusable components spanning physics,
  // chemistry/biology, computer science, data visualization, astronomy, and
  // math — requested directly ("generate 50 most used components") to give
  // the library real breadth beyond the original 6 mechanics-focused seeds.
  // Same contract, same trust level, every one individually validated
  // against the real checkComponentCode gate (see globalComponentLibrary.js)
  // before this script was ever run — not just visually plausible.

  // Physics / mechanics
  {
    name: "Pulley",
    description: "Two rotating pulleys connected by a belt — for mechanical advantage, belt drives, block-and-tackle diagrams.",
    propsDoc: "{ x1, x2, y, radius, color, rotationSpeed }",
    domainTags: ["physics", "mechanics", "engineering"],
    code: `function Pulley({ x1, x2, y, radius, color, rotationSpeed }) {
  const frame = useCurrentFrame();
  const angle = (frame * (rotationSpeed || 1)) % 360;
  const c = color || PALETTE.accent;
  const r = radius || 40;
  return (
    <svg style={SVG_FRAME}>
      <line x1={x1} y1={y - r} x2={x2} y2={y - r} stroke={c} strokeWidth={4} opacity={0.8} />
      <line x1={x1} y1={y + r} x2={x2} y2={y + r} stroke={c} strokeWidth={4} opacity={0.8} />
      {[x1, x2].map((cx, i) => (
        <g key={i} transform={"translate(" + cx + "," + y + ") rotate(" + angle + ")"}>
          <circle cx={0} cy={0} r={r} fill="none" stroke={c} strokeWidth={6} opacity={0.9} />
          <line x1={0} y1={0} x2={r * 0.8} y2={0} stroke={c} strokeWidth={3} opacity={0.7} />
        </g>
      ))}
    </svg>
  );
}`,
    example: `<Pulley x1={700} x2={1200} y={540} radius={50} color={PALETTE.accent} rotationSpeed={2} />`,
  },
  {
    name: "Spring",
    description: "A coiled spring that stretches and compresses — for elasticity, Hooke's law, suspension diagrams.",
    propsDoc: "{ x1, y1, x2, y2, coils, color, thickness }",
    domainTags: ["physics", "mechanics", "engineering"],
    code: `function Spring({ x1, y1, x2, y2, coils, color, thickness }) {
  const frame = useCurrentFrame();
  const stretch = 1 + Math.sin(frame / 15) * 0.15;
  const dx = (x2 - x1) * stretch;
  const dy = (y2 - y1) * stretch;
  const n = coils || 8;
  const c = color || PALETTE.accent;
  const pts = [];
  for (let i = 0; i <= n * 2; i++) {
    const t = i / (n * 2);
    const zig = i % 2 === 0 ? -1 : 1;
    pts.push([x1 + dx * t, y1 + dy * t + zig * 14]);
  }
  const d = "M " + pts.map((p) => p[0] + "," + p[1]).join(" L ");
  return (
    <svg style={SVG_FRAME}>
      <path d={d} fill="none" stroke={c} strokeWidth={thickness || 3} strokeLinejoin="round" opacity={0.9} />
    </svg>
  );
}`,
    example: `<Spring x1={960} y1={300} x2={960} y2={700} coils={10} color={PALETTE.accent} thickness={3} />`,
  },
  {
    name: "Pendulum",
    description: "A swinging pendulum bob on a rod — for oscillation, periodic motion, simple harmonic motion.",
    propsDoc: "{ pivotX, pivotY, length, color, radius }",
    domainTags: ["physics", "mechanics"],
    code: `function Pendulum({ pivotX, pivotY, length, color, radius }) {
  const frame = useCurrentFrame();
  const angle = Math.sin(frame / 25) * 35;
  const rad = (angle * Math.PI) / 180;
  const bobX = pivotX + Math.sin(rad) * length;
  const bobY = pivotY + Math.cos(rad) * length;
  const c = color || PALETTE.accent;
  return (
    <svg style={SVG_FRAME}>
      <circle cx={pivotX} cy={pivotY} r={6} fill={PALETTE.text} opacity={0.7} />
      <line x1={pivotX} y1={pivotY} x2={bobX} y2={bobY} stroke={c} strokeWidth={2.5} opacity={0.8} />
      <circle cx={bobX} cy={bobY} r={radius || 24} fill={c} opacity={0.9} style={{ filter: "drop-shadow(0 0 10px " + c + ")" }} />
    </svg>
  );
}`,
    example: `<Pendulum pivotX={960} pivotY={260} length={320} color={PALETTE.accent} radius={26} />`,
  },
  {
    name: "ForceVector",
    description: "A labeled force arrow with adjustable angle and magnitude — for free-body diagrams, physics vectors.",
    propsDoc: "{ x, y, angle, magnitude, color, label }",
    domainTags: ["physics", "math"],
    code: `function ForceVector({ x, y, angle, magnitude, color, label }) {
  const rad = ((angle || 0) * Math.PI) / 180;
  const len = 40 + (magnitude || 50);
  const ex = x + Math.cos(rad) * len;
  const ey = y + Math.sin(rad) * len;
  const c = color || PALETTE.accent;
  return (
    <svg style={SVG_FRAME}>
      <line x1={x} y1={y} x2={ex} y2={ey} stroke={c} strokeWidth={5} opacity={0.9} />
      <g transform={"translate(" + ex + "," + ey + ") rotate(" + (angle || 0) + ")"}>
        <path d="M 0,0 L -16,-8 L -16,8 Z" fill={c} />
      </g>
      {label ? (
        <text x={ex} y={ey - 16} textAnchor="middle" fontSize={18} fontWeight={700} fill={PALETTE.text}>{label}</text>
      ) : null}
    </svg>
  );
}`,
    example: `<ForceVector x={800} y={600} angle={-40} magnitude={80} color={PALETTE.accent} label="F = 20N" />`,
  },
  {
    name: "InclinedPlane",
    description: "A ramp with a block sliding along it — for friction, gravity components, inclined-plane problems.",
    propsDoc: "{ x, y, width, height, color, blockProgress }",
    domainTags: ["physics", "mechanics"],
    code: `function InclinedPlane({ x, y, width, height, color, blockProgress }) {
  const frame = useCurrentFrame();
  const t = blockProgress !== undefined ? blockProgress : (Math.sin(frame / 30) + 1) / 2;
  const c = color || PALETTE.accent;
  const topX = x + width;
  const topY = y - height;
  const blockX = x + width * (1 - t);
  const blockY = y - height * (1 - t);
  return (
    <svg style={SVG_FRAME}>
      <path d={"M " + x + "," + y + " L " + topX + "," + topY + " L " + topX + "," + y + " Z"} fill={c} opacity={0.18} stroke={c} strokeWidth={2} />
      <rect x={blockX - 16} y={blockY - 32} width={32} height={32} fill={c} opacity={0.9} rx={4} />
    </svg>
  );
}`,
    example: `<InclinedPlane x={600} y={800} width={400} height={220} color={PALETTE.accent} />`,
  },
  {
    name: "Piston",
    description: "A reciprocating piston moving inside a cylinder — for engines, pumps, compressors.",
    propsDoc: "{ cx, cy, width, height, color, speed }",
    domainTags: ["physics", "engineering", "mechanics"],
    code: `function Piston({ cx, cy, width, height, color, speed }) {
  const frame = useCurrentFrame();
  const c = color || PALETTE.accent;
  const stroke = Math.sin(frame * (speed || 0.1)) * (height * 0.35);
  return (
    <svg style={SVG_FRAME}>
      <rect x={cx - width / 2} y={cy - height / 2} width={width} height={height} fill="none" stroke={c} strokeWidth={3} opacity={0.6} rx={6} />
      <rect x={cx - width * 0.3} y={cy + stroke - height * 0.15} width={width * 0.6} height={height * 0.3} fill={c} opacity={0.9} rx={4} />
      <line x1={cx} y1={cy + stroke} x2={cx} y2={cy + height / 2 + 40} stroke={c} strokeWidth={4} opacity={0.7} />
    </svg>
  );
}`,
    example: `<Piston cx={960} cy={500} width={140} height={220} color={PALETTE.accent} speed={0.12} />`,
  },
  {
    name: "Waveform",
    description: "An animated sine wave — for sound, light, oscillation, signal diagrams.",
    propsDoc: "{ x, y, width, amplitude, frequency, color }",
    domainTags: ["physics", "math", "general"],
    code: `function Waveform({ x, y, width, amplitude, frequency, color }) {
  const frame = useCurrentFrame();
  const phase = frame * 0.08;
  const pts = useMemo(() => {
    const arr = [];
    const n = 60;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const px = x + width * t;
      const py = y + Math.sin(t * (frequency || 4) * Math.PI * 2 + phase) * (amplitude || 30);
      arr.push(px + "," + py);
    }
    return arr.join(" L ");
  }, [x, y, width, amplitude, frequency, phase]);
  return (
    <svg style={SVG_FRAME}>
      <path d={"M " + pts} fill="none" stroke={color || PALETTE.accent} strokeWidth={3} opacity={0.9} />
    </svg>
  );
}`,
    example: `<Waveform x={300} y={540} width={1320} amplitude={60} frequency={3} color={PALETTE.accent} />`,
  },
  {
    name: "Orbit",
    description: "A small body orbiting a central point on an elliptical path — for planetary motion, satellites, circular motion.",
    propsDoc: "{ cx, cy, radius, color, bodyColor, bodyRadius, speed }",
    domainTags: ["physics", "astronomy"],
    code: `function Orbit({ cx, cy, radius, color, bodyColor, bodyRadius, speed }) {
  const frame = useCurrentFrame();
  const angle = (frame * (speed || 1)) / 20;
  const bx = cx + Math.cos(angle) * radius;
  const by = cy + Math.sin(angle) * radius * 0.5;
  return (
    <svg style={SVG_FRAME}>
      <ellipse cx={cx} cy={cy} rx={radius} ry={radius * 0.5} fill="none" stroke={color || PALETTE.text} strokeWidth={1.5} opacity={0.35} />
      <circle cx={cx} cy={cy} r={16} fill={color || PALETTE.accent} opacity={0.9} />
      <circle cx={bx} cy={by} r={bodyRadius || 10} fill={bodyColor || PALETTE.text} opacity={0.95} />
    </svg>
  );
}`,
    example: `<Orbit cx={960} cy={540} radius={260} color={PALETTE.accent} bodyColor={PALETTE.text} bodyRadius={12} speed={1.2} />`,
  },

  // Chemistry / biology
  {
    name: "Atom",
    description: "A nucleus with orbiting electrons on tilted rings — for atomic structure, electron shells.",
    propsDoc: "{ cx, cy, nucleusRadius, electronCount, orbitRadius, color }",
    domainTags: ["chemistry", "physics", "science"],
    code: `function Atom({ cx, cy, nucleusRadius, electronCount, orbitRadius, color }) {
  const frame = useCurrentFrame();
  const n = electronCount || 3;
  const c = color || PALETTE.accent;
  const r = orbitRadius || 70;
  return (
    <svg style={SVG_FRAME}>
      {Array.from({ length: n }).map((_, i) => {
        const tilt = (i / n) * 180;
        const angle = frame * (1.2 + i * 0.25) + i * 50;
        const rad = (angle * Math.PI) / 180;
        return (
          <g key={i} transform={"rotate(" + tilt + " " + cx + " " + cy + ")"}>
            <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.4} fill="none" stroke={PALETTE.text} strokeWidth={1} opacity={0.25} />
            <circle cx={cx + Math.cos(rad) * r} cy={cy + Math.sin(rad) * r * 0.4} r={6} fill={PALETTE.text} opacity={0.85} />
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={nucleusRadius || 22} fill={c} opacity={0.9} style={{ filter: "drop-shadow(0 0 10px " + c + ")" }} />
    </svg>
  );
}`,
    example: `<Atom cx={960} cy={540} nucleusRadius={26} electronCount={3} orbitRadius={90} color={PALETTE.accent} />`,
  },
  {
    name: "MoleculeBond",
    description: "Two bonded atoms connected by a line, each independently colored and labeled — for simple molecules, ionic/covalent bonds.",
    propsDoc: "{ x1, y1, x2, y2, r1, r2, color1, color2, label1, label2 }",
    domainTags: ["chemistry", "science"],
    code: `function MoleculeBond({ x1, y1, x2, y2, r1, r2, color1, color2, label1, label2 }) {
  const frame = useCurrentFrame();
  const pulse = 1 + Math.sin(frame / 12) * 0.04;
  return (
    <svg style={SVG_FRAME}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={PALETTE.text} strokeWidth={4} opacity={0.6} />
      <circle cx={x1} cy={y1} r={(r1 || 30) * pulse} fill={color1 || PALETTE.accent} opacity={0.9} />
      <circle cx={x2} cy={y2} r={(r2 || 22) * pulse} fill={color2 || PALETTE.text} opacity={0.9} />
      {label1 ? <text x={x1} y={y1 + 6} textAnchor="middle" fontSize={18} fontWeight={700} fill={PALETTE.bg}>{label1}</text> : null}
      {label2 ? <text x={x2} y={y2 + 5} textAnchor="middle" fontSize={14} fontWeight={700} fill={PALETTE.bg}>{label2}</text> : null}
    </svg>
  );
}`,
    example: `<MoleculeBond x1={800} y1={500} x2={1000} y2={560} r1={34} r2={22} color1={PALETTE.accent} color2={PALETTE.text} label1="O" label2="H" />`,
  },
  {
    name: "Beaker",
    description: "A beaker with a liquid fill level and optional rising bubble — for chemistry reactions, solutions.",
    propsDoc: "{ x, y, width, height, fillLevel, liquidColor, bubble }",
    domainTags: ["chemistry", "science"],
    code: `function Beaker({ x, y, width, height, fillLevel, liquidColor, bubble }) {
  const frame = useCurrentFrame();
  const c = liquidColor || PALETTE.accent;
  const level = fillLevel !== undefined ? fillLevel : 0.6;
  const liquidY = y + height * (1 - level);
  const bubbleY = bubble ? y + height - ((frame * 2) % (height * level || 1)) : null;
  return (
    <svg style={SVG_FRAME}>
      <path d={"M " + x + "," + y + " L " + x + "," + (y + height) + " L " + (x + width) + "," + (y + height) + " L " + (x + width) + "," + y} fill="none" stroke={PALETTE.text} strokeWidth={3} opacity={0.7} />
      <path d={"M " + (x + 3) + "," + liquidY + " L " + (x + 3) + "," + (y + height - 3) + " L " + (x + width - 3) + "," + (y + height - 3) + " L " + (x + width - 3) + "," + liquidY + " Z"} fill={c} opacity={0.55} />
      {bubble && bubbleY !== null ? <circle cx={x + width / 2} cy={bubbleY} r={5} fill={PALETTE.text} opacity={0.5} /> : null}
    </svg>
  );
}`,
    example: `<Beaker x={860} y={400} width={200} height={260} fillLevel={0.55} liquidColor={PALETTE.accent} bubble={true} />`,
  },
  {
    name: "CellMembrane",
    description: "An organic wobbling cell outline with a nucleus — for biology, cell structure.",
    propsDoc: "{ cx, cy, radius, color, nucleusColor }",
    domainTags: ["biology", "science"],
    code: `function CellMembrane({ cx, cy, radius, color, nucleusColor }) {
  const frame = useCurrentFrame();
  const wobble = Math.sin(frame / 20) * 6;
  const c = color || PALETTE.accent;
  return (
    <svg style={SVG_FRAME}>
      <ellipse cx={cx} cy={cy} rx={radius + wobble} ry={radius - wobble} fill={c} opacity={0.15} stroke={c} strokeWidth={2.5} />
      <circle cx={cx} cy={cy} r={radius * 0.35} fill={nucleusColor || PALETTE.text} opacity={0.55} />
    </svg>
  );
}`,
    example: `<CellMembrane cx={960} cy={540} radius={160} color={PALETTE.accent} nucleusColor={PALETTE.text} />`,
  },
  {
    name: "HelixStrandPair",
    description: "A double-helix strand segment, two twisting sine paths — for DNA/RNA, genetics.",
    propsDoc: "{ x, y, width, height, color1, color2, twists }",
    domainTags: ["biology", "science"],
    code: `function HelixStrandPair({ x, y, width, height, color1, color2, twists }) {
  const frame = useCurrentFrame();
  const n = twists || 4;
  const points1 = [];
  const points2 = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const phase = t * n * Math.PI * 2 + frame * 0.03;
    points1.push([x + Math.sin(phase) * width, y + height * t]);
    points2.push([x + Math.sin(phase + Math.PI) * width, y + height * t]);
  }
  const d1 = "M " + points1.map((p) => p[0] + "," + p[1]).join(" L ");
  const d2 = "M " + points2.map((p) => p[0] + "," + p[1]).join(" L ");
  return (
    <svg style={SVG_FRAME}>
      <path d={d1} fill="none" stroke={color1 || PALETTE.accent} strokeWidth={4} opacity={0.9} />
      <path d={d2} fill="none" stroke={color2 || PALETTE.text} strokeWidth={4} opacity={0.9} />
    </svg>
  );
}`,
    example: `<HelixStrandPair x={960} y={200} width={70} height={680} color1={PALETTE.accent} color2={PALETTE.text} twists={4} />`,
  },
  {
    name: "BacteriumBody",
    description: "A capsule-shaped microorganism body with an optional flagellum — for microbiology.",
    propsDoc: "{ cx, cy, length, width, color, flagella }",
    domainTags: ["biology", "science"],
    code: `function BacteriumBody({ cx, cy, length, width, color, flagella }) {
  const frame = useCurrentFrame();
  const wiggle = Math.sin(frame / 8) * 8;
  const c = color || PALETTE.accent;
  return (
    <svg style={SVG_FRAME}>
      <rect x={cx - length / 2} y={cy - width / 2} width={length} height={width} rx={width / 2} fill={c} opacity={0.85} />
      {flagella ? (
        <path d={"M " + (cx - length / 2) + "," + cy + " Q " + (cx - length / 2 - 30) + "," + (cy + wiggle) + " " + (cx - length / 2 - 60) + "," + (cy - wiggle)} fill="none" stroke={c} strokeWidth={2} opacity={0.6} />
      ) : null}
    </svg>
  );
}`,
    example: `<BacteriumBody cx={960} cy={540} length={140} width={50} color={PALETTE.accent} flagella={true} />`,
  },
  {
    name: "PhIndicator",
    description: "A pH scale bar with a positioned marker and value label — for acid/base chemistry.",
    propsDoc: "{ x, y, width, value, color }",
    domainTags: ["chemistry", "science"],
    code: `function PhIndicator({ x, y, width, value, color }) {
  const clamped = clampPos(value !== undefined ? value : 7, 0, 14);
  const markerX = x + (clamped / 14) * width;
  const c = color || PALETTE.accent;
  return (
    <svg style={SVG_FRAME}>
      <rect x={x} y={y} width={width} height={20} rx={10} fill="none" stroke={PALETTE.text} strokeWidth={2} opacity={0.5} />
      <circle cx={markerX} cy={y + 10} r={12} fill={c} opacity={0.95} style={{ filter: "drop-shadow(0 0 8px " + c + ")" }} />
      <text x={markerX} y={y - 14} textAnchor="middle" fontSize={16} fontWeight={700} fill={PALETTE.text}>{clamped.toFixed(1)}</text>
    </svg>
  );
}`,
    example: `<PhIndicator x={600} y={700} width={720} value={4.5} color={PALETTE.accent} />`,
  },
  {
    name: "ChemBondLine",
    description: "A single, double, or triple bond line between two points — for molecular structure diagrams.",
    propsDoc: "{ x1, y1, x2, y2, order, color }",
    domainTags: ["chemistry", "science"],
    code: `function ChemBondLine({ x1, y1, x2, y2, order, color }) {
  const c = color || PALETTE.text;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const n = order || 1;
  const offsets = n === 1 ? [0] : n === 2 ? [-4, 4] : [-6, 0, 6];
  return (
    <svg style={SVG_FRAME}>
      {offsets.map((o, i) => (
        <line key={i} x1={x1 + nx * o} y1={y1 + ny * o} x2={x2 + nx * o} y2={y2 + ny * o} stroke={c} strokeWidth={3} opacity={0.75} />
      ))}
    </svg>
  );
}`,
    example: `<ChemBondLine x1={800} y1={540} x2={950} y2={540} order={2} color={PALETTE.text} />`,
  },
  {
    name: "FlaskShape",
    description: "An Erlenmeyer flask outline with a liquid fill level — for chemistry lab diagrams.",
    propsDoc: "{ cx, y, neckWidth, bodyWidth, height, fillLevel, liquidColor }",
    domainTags: ["chemistry", "science"],
    code: `function FlaskShape({ cx, y, neckWidth, bodyWidth, height, fillLevel, liquidColor }) {
  const c = liquidColor || PALETTE.accent;
  const level = fillLevel !== undefined ? fillLevel : 0.4;
  const bottomY = y + height;
  const neckBottomY = y + height * 0.35;
  const liquidTopY = bottomY - (bottomY - neckBottomY) * level;
  const liquidHalfWidth = bodyWidth / 2;
  return (
    <svg style={SVG_FRAME}>
      <path
        d={"M " + (cx - neckWidth / 2) + "," + y + " L " + (cx - neckWidth / 2) + "," + neckBottomY + " L " + (cx - bodyWidth / 2) + "," + bottomY + " L " + (cx + bodyWidth / 2) + "," + bottomY + " L " + (cx + neckWidth / 2) + "," + neckBottomY + " L " + (cx + neckWidth / 2) + "," + y}
        fill="none" stroke={PALETTE.text} strokeWidth={3} opacity={0.7}
      />
      <path
        d={"M " + (cx - liquidHalfWidth) + "," + liquidTopY + " L " + (cx - bodyWidth / 2) + "," + bottomY + " L " + (cx + bodyWidth / 2) + "," + bottomY + " L " + (cx + liquidHalfWidth) + "," + liquidTopY + " Z"}
        fill={c} opacity={0.5}
      />
    </svg>
  );
}`,
    example: `<FlaskShape cx={960} y={380} neckWidth={40} bodyWidth={220} height={320} fillLevel={0.45} liquidColor={PALETTE.accent} />`,
  },
  {
    name: "CrystalLattice",
    description: "A pulsing grid of dots — for crystal structures, atomic lattices, molecular grids.",
    propsDoc: "{ x, y, cols, rows, spacing, color }",
    domainTags: ["chemistry", "science"],
    code: `function CrystalLattice({ x, y, cols, rows, spacing, color }) {
  const frame = useCurrentFrame();
  const pulse = 1 + Math.sin(frame / 15) * 0.08;
  const c = color || PALETTE.accent;
  const items = [];
  for (let r = 0; r < (rows || 4); r++) {
    for (let col = 0; col < (cols || 4); col++) {
      items.push({ x: x + col * spacing, y: y + r * spacing });
    }
  }
  return (
    <svg style={SVG_FRAME}>
      {items.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={6 * pulse} fill={c} opacity={0.8} />)}
    </svg>
  );
}`,
    example: `<CrystalLattice x={760} y={380} cols={5} rows={5} spacing={70} color={PALETTE.accent} />`,
  },

  // Computer science
  {
    name: "GraphNode",
    description: "A single labeled, optionally active/highlighted graph or tree node — for algorithm/data-structure diagrams.",
    propsDoc: "{ cx, cy, radius, label, color, active }",
    domainTags: ["computer-science", "algorithms"],
    code: `function GraphNode({ cx, cy, radius, label, color, active }) {
  const frame = useCurrentFrame();
  const pulse = active ? 1 + Math.sin(frame / 8) * 0.08 : 1;
  const c = color || PALETTE.accent;
  return (
    <svg style={SVG_FRAME}>
      <circle cx={cx} cy={cy} r={(radius || 30) * pulse} fill={active ? c : PALETTE.bg} stroke={c} strokeWidth={3}
        opacity={0.95} style={active ? { filter: "drop-shadow(0 0 12px " + c + ")" } : undefined} />
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize={18} fontWeight={800} fill={active ? PALETTE.bg : PALETTE.text}>{label}</text>
    </svg>
  );
}`,
    example: `<GraphNode cx={960} cy={540} radius={34} label="A" color={PALETTE.accent} active={true} />`,
  },
  {
    name: "ArrayCell",
    description: "A single indexed array box with a value — for array/list visualizations.",
    propsDoc: "{ x, y, size, value, index, color, active }",
    domainTags: ["computer-science", "data-structures"],
    code: `function ArrayCell({ x, y, size, value, index, color, active }) {
  const c = color || PALETTE.accent;
  return (
    <svg style={SVG_FRAME}>
      <rect x={x} y={y} width={size} height={size} rx={8} fill={active ? c : PALETTE.bg} stroke={c} strokeWidth={2.5} opacity={0.95} />
      <text x={x + size / 2} y={y + size / 2 + 7} textAnchor="middle" fontSize={22} fontWeight={800} fill={active ? PALETTE.bg : PALETTE.text}>{value}</text>
      {index !== undefined ? (
        <text x={x + size / 2} y={y + size + 22} textAnchor="middle" fontSize={14} fill={PALETTE.text} opacity={0.6}>{index}</text>
      ) : null}
    </svg>
  );
}`,
    example: `<ArrayCell x={900} y={500} size={70} value={42} index={3} color={PALETTE.accent} active={true} />`,
  },
  {
    name: "PointerCallout",
    description: "A bouncing arrow pointing at a target with a label — for pointer/index callouts in code diagrams.",
    propsDoc: "{ x, y, label, color, bounce }",
    domainTags: ["computer-science", "general"],
    code: `function PointerCallout({ x, y, label, color, bounce }) {
  const frame = useCurrentFrame();
  const offset = bounce ? Math.sin(frame / 8) * 6 : 0;
  const c = color || PALETTE.accent;
  return (
    <svg style={SVG_FRAME}>
      <path d={"M " + x + "," + (y + offset) + " L " + (x - 10) + "," + (y - 20 + offset) + " L " + (x + 10) + "," + (y - 20 + offset) + " Z"} fill={c} opacity={0.9} />
      <line x1={x} y1={y - 20 + offset} x2={x} y2={y - 50 + offset} stroke={c} strokeWidth={3} opacity={0.8} />
      <text x={x} y={y - 60 + offset} textAnchor="middle" fontSize={16} fontWeight={700} fill={PALETTE.text}>{label}</text>
    </svg>
  );
}`,
    example: `<PointerCallout x={960} y={640} label="head" color={PALETTE.accent} bounce={true} />`,
  },
  {
    name: "StackColumn",
    description: "A vertical stack of labeled blocks — for stack data structure visualizations.",
    propsDoc: "{ x, y, items, blockHeight, width, color }",
    domainTags: ["computer-science", "data-structures"],
    code: `function StackColumn({ x, y, items, blockHeight, width, color }) {
  const c = color || PALETTE.accent;
  const h = blockHeight || 50;
  return (
    <svg style={SVG_FRAME}>
      {(items || []).map((v, i) => (
        <g key={i}>
          <rect x={x} y={y - i * h} width={width || 120} height={h - 6} rx={6} fill={c} opacity={0.85} />
          <text x={x + (width || 120) / 2} y={y - i * h + h / 2} textAnchor="middle" fontSize={18} fontWeight={700} fill={PALETTE.bg}>{v}</text>
        </g>
      ))}
    </svg>
  );
}`,
    example: `<StackColumn x={880} y={800} items={[1,2,3]} blockHeight={54} width={140} color={PALETTE.accent} />`,
  },
  {
    name: "QueueLane",
    description: "A horizontal row of labeled blocks — for queue data structure visualizations.",
    propsDoc: "{ x, y, items, blockWidth, height, color }",
    domainTags: ["computer-science", "data-structures"],
    code: `function QueueLane({ x, y, items, blockWidth, height, color }) {
  const c = color || PALETTE.accent;
  const w = blockWidth || 70;
  return (
    <svg style={SVG_FRAME}>
      {(items || []).map((v, i) => (
        <g key={i}>
          <rect x={x + i * w} y={y} width={w - 6} height={height || 60} rx={6} fill={c} opacity={0.85} />
          <text x={x + i * w + (w - 6) / 2} y={y + (height || 60) / 2 + 6} textAnchor="middle" fontSize={18} fontWeight={700} fill={PALETTE.bg}>{v}</text>
        </g>
      ))}
    </svg>
  );
}`,
    example: `<QueueLane x={600} y={540} items={["A","B","C"]} blockWidth={80} height={64} color={PALETTE.accent} />`,
  },
  {
    name: "BinaryDigit",
    description: "A pulsing 0/1 badge — for binary, bits, boolean logic.",
    propsDoc: "{ cx, cy, size, value, color }",
    domainTags: ["computer-science", "math"],
    code: `function BinaryDigit({ cx, cy, size, value, color }) {
  const frame = useCurrentFrame();
  const pulse = 1 + Math.sin(frame / 10) * 0.05;
  const c = color || PALETTE.accent;
  return (
    <svg style={SVG_FRAME}>
      <rect x={cx - size / 2} y={cy - size / 2} width={size * pulse} height={size * pulse} rx={10} fill={c} opacity={0.9} />
      <text x={cx} y={cy + size * 0.18} textAnchor="middle" fontSize={size * 0.55} fontWeight={800} fill={PALETTE.bg}>{value}</text>
    </svg>
  );
}`,
    example: `<BinaryDigit cx={960} cy={540} size={80} value={1} color={PALETTE.accent} />`,
  },
  {
    name: "BlinkCursor",
    description: "A blinking vertical text cursor — for typing/terminal animations.",
    propsDoc: "{ x, y, height, color }",
    domainTags: ["computer-science", "general"],
    code: `function BlinkCursor({ x, y, height, color }) {
  const frame = useCurrentFrame();
  const visible = Math.floor(frame / 15) % 2 === 0;
  return (
    <svg style={SVG_FRAME}>
      <line x1={x} y1={y} x2={x} y2={y + (height || 28)} stroke={color || PALETTE.accent} strokeWidth={3} opacity={visible ? 0.95 : 0} />
    </svg>
  );
}`,
    example: `<BlinkCursor x={1040} y={520} height={30} color={PALETTE.accent} />`,
  },
  {
    name: "TerminalFrame",
    description: "A rounded terminal/code-editor window frame with title-bar dots — for code/terminal diagrams.",
    propsDoc: "{ x, y, width, height, color }",
    domainTags: ["computer-science", "general"],
    code: `function TerminalFrame({ x, y, width, height, color }) {
  const c = color || PALETTE.text;
  return (
    <svg style={SVG_FRAME}>
      <rect x={x} y={y} width={width} height={height} rx={12} fill="none" stroke={c} strokeWidth={2} opacity={0.5} />
      <rect x={x} y={y} width={width} height={36} rx={12} fill={c} opacity={0.12} />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={x + 20 + i * 20} cy={y + 18} r={6} fill={c} opacity={0.5} />
      ))}
    </svg>
  );
}`,
    example: `<TerminalFrame x={560} y={300} width={800} height={480} color={PALETTE.text} />`,
  },

  // Data / general
  {
    name: "BarColumn",
    description: "A single bar that grows to a target height on reveal — building block for bar charts.",
    propsDoc: "{ x, y, width, targetHeight, color, revealAt, label }",
    domainTags: ["data", "general", "business"],
    code: `function BarColumn({ x, y, width, targetHeight, color, revealAt, label }) {
  const frame = useCurrentFrame();
  const grown = interpolate(frame - (revealAt || 0), [0, 24], [0, targetHeight], CLAMP);
  const c = color || PALETTE.accent;
  return (
    <svg style={SVG_FRAME}>
      <rect x={x} y={y - grown} width={width} height={grown} rx={4} fill={c} opacity={0.9} />
      {label ? <text x={x + width / 2} y={y + 22} textAnchor="middle" fontSize={14} fill={PALETTE.text} opacity={0.8}>{label}</text> : null}
    </svg>
  );
}`,
    example: `<BarColumn x={900} y={800} width={80} targetHeight={300} color={PALETTE.accent} revealAt={0} label="Q1" />`,
  },
  {
    name: "LineTrend",
    description: "An animated trend line that draws in with a leading dot — for line charts, growth curves.",
    propsDoc: "{ points, color, revealAt }",
    domainTags: ["data", "general", "business"],
    code: `function LineTrend({ points, color, revealAt }) {
  const frame = useCurrentFrame();
  const grown = interpolate(frame - (revealAt || 0), [0, 40], [0, 1], CLAMP);
  const c = color || PALETTE.accent;
  const n = Math.max(1, Math.floor(points.length * grown));
  const visible = points.slice(0, n);
  const d = visible.map((p, i) => (i === 0 ? "M " : "L ") + p.x + "," + p.y).join(" ");
  const last = visible[visible.length - 1] || points[0];
  return (
    <svg style={SVG_FRAME}>
      <path d={d} fill="none" stroke={c} strokeWidth={3} opacity={0.9} />
      {last ? <circle cx={last.x} cy={last.y} r={7} fill={c} /> : null}
    </svg>
  );
}`,
    example: `<LineTrend points={[{x:300,y:700},{x:600,y:500},{x:900,y:600},{x:1200,y:350}]} color={PALETTE.accent} revealAt={0} />`,
  },
  {
    name: "PercentRing",
    description: "A circular progress ring that fills to a percentage — for completion/progress indicators.",
    propsDoc: "{ cx, cy, radius, percent, color, label }",
    domainTags: ["data", "general"],
    code: `function PercentRing({ cx, cy, radius, percent, color, label }) {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, 40], [0, percent], CLAMP);
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - p / 100);
  const c = color || PALETTE.accent;
  return (
    <svg style={SVG_FRAME}>
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke={PALETTE.text} strokeWidth={12} opacity={0.15} />
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke={c} strokeWidth={12} strokeDasharray={circumference}
        strokeDashoffset={offset} strokeLinecap="round" transform={"rotate(-90 " + cx + " " + cy + ")"} opacity={0.9} />
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize={28} fontWeight={800} fill={PALETTE.text}>{Math.round(p)}%</text>
      {label ? <text x={cx} y={cy + radius + 30} textAnchor="middle" fontSize={16} fill={PALETTE.text} opacity={0.7}>{label}</text> : null}
    </svg>
  );
}`,
    example: `<PercentRing cx={960} cy={540} radius={120} percent={72} color={PALETTE.accent} label="Complete" />`,
  },
  {
    name: "CountdownTimer",
    description: "A circular countdown clock counting down from a starting time — for timers, deadlines.",
    propsDoc: "{ cx, cy, startSeconds, color }",
    domainTags: ["data", "general"],
    code: `function CountdownTimer({ cx, cy, startSeconds, color }) {
  const frame = useCurrentFrame();
  const remaining = Math.max(0, (startSeconds || 10) - frame / 30);
  const c = color || PALETTE.accent;
  const mm = Math.floor(remaining / 60);
  const ss = Math.floor(remaining % 60);
  return (
    <svg style={SVG_FRAME}>
      <circle cx={cx} cy={cy} r={70} fill="none" stroke={c} strokeWidth={4} opacity={0.6} />
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize={34} fontWeight={800} fill={PALETTE.text}>
        {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
      </text>
    </svg>
  );
}`,
    example: `<CountdownTimer cx={960} cy={540} startSeconds={30} color={PALETTE.accent} />`,
  },
  {
    name: "ChecklistItem",
    description: "A checkbox and label that checks in on reveal — for checklists, step-by-step lists.",
    propsDoc: "{ x, y, label, checked, color, revealAt }",
    domainTags: ["data", "general"],
    code: `function ChecklistItem({ x, y, label, checked, color, revealAt }) {
  const frame = useCurrentFrame();
  const grown = interpolate(frame - (revealAt || 0), [0, 16], [0, 1], CLAMP);
  const c = color || PALETTE.accent;
  return (
    <svg style={SVG_FRAME}>
      <rect x={x} y={y} width={28} height={28} rx={6} fill={checked ? c : "none"} stroke={c} strokeWidth={2.5} opacity={0.9} />
      {checked ? (
        <path d={"M " + (x + 6) + "," + (y + 14) + " L " + (x + 12) + "," + (y + 20) + " L " + (x + 22) + "," + (y + 8)} fill="none" stroke={PALETTE.bg} strokeWidth={3} strokeLinecap="round" opacity={grown} />
      ) : null}
      <text x={x + 40} y={y + 21} fontSize={18} fill={PALETTE.text} opacity={0.9}>{label}</text>
    </svg>
  );
}`,
    example: `<ChecklistItem x={700} y={500} label="Initialize array" checked={true} color={PALETTE.accent} revealAt={0} />`,
  },
  {
    name: "FloatingTooltip",
    description: "A small floating label bubble with a pointer tail — for callouts, annotations.",
    propsDoc: "{ x, y, text, color, bob }",
    domainTags: ["data", "general"],
    code: `function FloatingTooltip({ x, y, text, color, bob }) {
  const frame = useCurrentFrame();
  const offset = bob ? Math.sin(frame / 12) * 4 : 0;
  const c = color || PALETTE.accent;
  const w = 20 + text.length * 9;
  return (
    <svg style={SVG_FRAME}>
      <rect x={x - w / 2} y={y - 40 + offset} width={w} height={34} rx={8} fill={c} opacity={0.95} />
      <path d={"M " + (x - 6) + "," + (y - 6 + offset) + " L " + (x + 6) + "," + (y - 6 + offset) + " L " + x + "," + (y + 4 + offset) + " Z"} fill={c} opacity={0.95} />
      <text x={x} y={y - 18 + offset} textAnchor="middle" fontSize={15} fontWeight={700} fill={PALETTE.bg}>{text}</text>
    </svg>
  );
}`,
    example: `<FloatingTooltip x={960} y={500} text="O(n log n)" color={PALETTE.accent} bob={true} />`,
  },
  {
    name: "StatusBadgeShape",
    description: "A small pill-shaped status badge — for tags, labels, status indicators.",
    propsDoc: "{ x, y, text, color }",
    domainTags: ["data", "general"],
    code: `function StatusBadgeShape({ x, y, text, color }) {
  const c = color || PALETTE.accent;
  const w = 24 + text.length * 10;
  return (
    <svg style={SVG_FRAME}>
      <rect x={x} y={y} width={w} height={30} rx={15} fill={c} opacity={0.9} />
      <text x={x + w / 2} y={y + 20} textAnchor="middle" fontSize={14} fontWeight={700} fill={PALETTE.bg}>{text}</text>
    </svg>
  );
}`,
    example: `<StatusBadgeShape x={880} y={400} text="NEW" color={PALETTE.accent} />`,
  },
  {
    name: "HorizontalProgressBar",
    description: "A horizontal bar that fills to a percentage — for progress/loading indicators.",
    propsDoc: "{ x, y, width, height, percent, color, revealAt }",
    domainTags: ["data", "general"],
    code: `function HorizontalProgressBar({ x, y, width, height, percent, color, revealAt }) {
  const frame = useCurrentFrame();
  const p = interpolate(frame - (revealAt || 0), [0, 40], [0, percent], CLAMP);
  const c = color || PALETTE.accent;
  return (
    <svg style={SVG_FRAME}>
      <rect x={x} y={y} width={width} height={height} rx={height / 2} fill="none" stroke={PALETTE.text} strokeWidth={2} opacity={0.3} />
      <rect x={x} y={y} width={(width * p) / 100} height={height} rx={height / 2} fill={c} opacity={0.9} />
    </svg>
  );
}`,
    example: `<HorizontalProgressBar x={600} y={700} width={720} height={24} percent={68} color={PALETTE.accent} revealAt={0} />`,
  },

  // Astronomy / earth
  {
    name: "GlowPlanet",
    description: "A glowing sphere with an optional ring — for planets, celestial bodies.",
    propsDoc: "{ cx, cy, radius, color, ring }",
    domainTags: ["astronomy", "science"],
    code: `function GlowPlanet({ cx, cy, radius, color, ring }) {
  const frame = useCurrentFrame();
  const pulse = 1 + Math.sin(frame / 20) * 0.02;
  const c = color || PALETTE.accent;
  return (
    <svg style={SVG_FRAME}>
      {ring ? <ellipse cx={cx} cy={cy} rx={radius * 1.8} ry={radius * 0.35} fill="none" stroke={c} strokeWidth={4} opacity={0.5} /> : null}
      <circle cx={cx} cy={cy} r={radius * pulse} fill={c} opacity={0.9} style={{ filter: "drop-shadow(0 0 24px " + c + ")" }} />
    </svg>
  );
}`,
    example: `<GlowPlanet cx={960} cy={540} radius={100} color={PALETTE.accent} ring={true} />`,
  },
  {
    name: "TwinkleStar",
    description: "A twinkling 4-point star — for starfields, night skies.",
    propsDoc: "{ cx, cy, size, color, phase }",
    domainTags: ["astronomy", "science"],
    code: `function TwinkleStar({ cx, cy, size, color, phase }) {
  const frame = useCurrentFrame();
  const twinkle = 0.5 + Math.abs(Math.sin(frame / 15 + (phase || 0))) * 0.5;
  const c = color || PALETTE.text;
  const s = size || 14;
  return (
    <svg style={SVG_FRAME}>
      <path d={"M " + cx + "," + (cy - s) + " L " + (cx + s * 0.25) + "," + (cy - s * 0.25) + " L " + (cx + s) + "," + cy + " L " + (cx + s * 0.25) + "," + (cy + s * 0.25) + " L " + cx + "," + (cy + s) + " L " + (cx - s * 0.25) + "," + (cy + s * 0.25) + " L " + (cx - s) + "," + cy + " L " + (cx - s * 0.25) + "," + (cy - s * 0.25) + " Z"}
        fill={c} opacity={twinkle} />
    </svg>
  );
}`,
    example: `<TwinkleStar cx={960} cy={300} size={16} color={PALETTE.text} phase={1.2} />`,
  },
  {
    name: "OrbitingSatellite",
    description: "A small craft orbiting a central point — for satellites, orbital mechanics.",
    propsDoc: "{ cx, cy, radius, color, speed }",
    domainTags: ["astronomy", "physics"],
    code: `function OrbitingSatellite({ cx, cy, radius, color, speed }) {
  const frame = useCurrentFrame();
  const angle = (frame * (speed || 1)) / 15;
  const sx = cx + Math.cos(angle) * radius;
  const sy = cy + Math.sin(angle) * radius;
  const c = color || PALETTE.accent;
  return (
    <svg style={SVG_FRAME}>
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke={PALETTE.text} strokeWidth={1} opacity={0.2} />
      <rect x={sx - 8} y={sy - 5} width={16} height={10} fill={c} opacity={0.95} transform={"rotate(" + (angle * 180) / Math.PI + " " + sx + " " + sy + ")"} />
    </svg>
  );
}`,
    example: `<OrbitingSatellite cx={960} cy={540} radius={220} color={PALETTE.accent} speed={1.5} />`,
  },
  {
    name: "DriftingCloud",
    description: "A soft, drifting cloud made of overlapping shapes — for weather, sky scenes.",
    propsDoc: "{ cx, cy, scale, color, speed }",
    domainTags: ["astronomy", "general"],
    code: `function DriftingCloud({ cx, cy, scale, color, speed }) {
  const frame = useCurrentFrame();
  const drift = (frame * (speed || 0.3)) % 200;
  const c = color || PALETTE.text;
  const s = scale || 1;
  return (
    <svg style={SVG_FRAME}>
      <g transform={"translate(" + (drift - 100) + ",0)"} opacity={0.7}>
        <ellipse cx={cx} cy={cy} rx={60 * s} ry={30 * s} fill={c} />
        <ellipse cx={cx - 40 * s} cy={cy + 8 * s} rx={40 * s} ry={22 * s} fill={c} />
        <ellipse cx={cx + 45 * s} cy={cy + 6 * s} rx={44 * s} ry={24 * s} fill={c} />
      </g>
    </svg>
  );
}`,
    example: `<DriftingCloud cx={700} cy={300} scale={1.2} color={PALETTE.text} speed={0.4} />`,
  },
  {
    name: "LightBeam",
    description: "A directional, fading light beam/ray — for optics, illumination, light sources.",
    propsDoc: "{ x, y, angle, length, width, color, revealAt }",
    domainTags: ["physics", "astronomy", "science"],
    code: `function LightBeam({ x, y, angle, length, width, color, revealAt }) {
  const frame = useCurrentFrame();
  const grown = interpolate(frame - (revealAt || 0), [0, 20], [0, 1], CLAMP);
  const rad = ((angle || 0) * Math.PI) / 180;
  const ex = x + Math.cos(rad) * length * grown;
  const ey = y + Math.sin(rad) * length * grown;
  const perpX = -Math.sin(rad) * (width || 20);
  const perpY = Math.cos(rad) * (width || 20);
  const c = color || PALETTE.accent;
  return (
    <svg style={SVG_FRAME}>
      <path d={"M " + (x - perpX / 4) + "," + (y - perpY / 4) + " L " + (ex - perpX) + "," + (ey - perpY) + " L " + (ex + perpX) + "," + (ey + perpY) + " L " + (x + perpX / 4) + "," + (y + perpY / 4) + " Z"}
        fill={c} opacity={0.25 * grown} />
    </svg>
  );
}`,
    example: `<LightBeam x={400} y={200} angle={35} length={500} width={40} color={PALETTE.accent} revealAt={0} />`,
  },

  // Math / geometry
  {
    name: "NumberLineMarker",
    description: "A number line with tick marks and a positioned value marker — for math, number sense.",
    propsDoc: "{ x, y, width, min, max, value, color }",
    domainTags: ["math", "general"],
    code: `function NumberLineMarker({ x, y, width, min, max, value, color }) {
  const t = (clampPos(value, min, max) - min) / (max - min || 1);
  const markerX = x + width * t;
  const c = color || PALETTE.accent;
  return (
    <svg style={SVG_FRAME}>
      <line x1={x} y1={y} x2={x + width} y2={y} stroke={PALETTE.text} strokeWidth={3} opacity={0.5} />
      {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
        <line key={i} x1={x + width * f} y1={y - 8} x2={x + width * f} y2={y + 8} stroke={PALETTE.text} strokeWidth={2} opacity={0.4} />
      ))}
      <circle cx={markerX} cy={y} r={12} fill={c} opacity={0.95} style={{ filter: "drop-shadow(0 0 8px " + c + ")" }} />
      <text x={markerX} y={y - 24} textAnchor="middle" fontSize={16} fontWeight={700} fill={PALETTE.text}>{value}</text>
    </svg>
  );
}`,
    example: `<NumberLineMarker x={400} y={540} width={1120} min={0} max={10} value={6.5} color={PALETTE.accent} />`,
  },
  {
    name: "CoordinateAxes",
    description: "X/Y axes with optional light grid lines — for graphing, coordinate geometry.",
    propsDoc: "{ cx, cy, width, height, color, grid }",
    domainTags: ["math", "general"],
    code: `function CoordinateAxes({ cx, cy, width, height, color, grid }) {
  const c = color || PALETTE.text;
  const lines = [];
  if (grid) {
    for (let gx = -width / 2; gx <= width / 2; gx += 80) lines.push({ x1: cx + gx, y1: cy - height / 2, x2: cx + gx, y2: cy + height / 2 });
    for (let gy = -height / 2; gy <= height / 2; gy += 80) lines.push({ x1: cx - width / 2, y1: cy + gy, x2: cx + width / 2, y2: cy + gy });
  }
  return (
    <svg style={SVG_FRAME}>
      {lines.map((l, i) => <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={c} strokeWidth={1} opacity={0.1} />)}
      <line x1={cx - width / 2} y1={cy} x2={cx + width / 2} y2={cy} stroke={c} strokeWidth={2.5} opacity={0.6} />
      <line x1={cx} y1={cy - height / 2} x2={cx} y2={cy + height / 2} stroke={c} strokeWidth={2.5} opacity={0.6} />
    </svg>
  );
}`,
    example: `<CoordinateAxes cx={960} cy={540} width={1400} height={760} color={PALETTE.text} grid={true} />`,
  },
  {
    name: "PlottedCurve",
    description: "An animated function curve that draws in point by point — for graphing functions.",
    propsDoc: "{ points, color, revealAt }",
    domainTags: ["math", "general"],
    code: `function PlottedCurve({ points, color, revealAt }) {
  const frame = useCurrentFrame();
  const grown = interpolate(frame - (revealAt || 0), [0, 40], [0, 1], CLAMP);
  const n = Math.max(1, Math.floor(points.length * grown));
  const visible = points.slice(0, n);
  const d = visible.map((p, i) => (i === 0 ? "M " : "L ") + p.x + "," + p.y).join(" ");
  return (
    <svg style={SVG_FRAME}>
      <path d={d} fill="none" stroke={color || PALETTE.accent} strokeWidth={3.5} opacity={0.9} strokeLinecap="round" />
    </svg>
  );
}`,
    example: `<PlottedCurve points={[{x:300,y:700},{x:500,y:400},{x:700,y:650},{x:900,y:300},{x:1100,y:500}]} color={PALETTE.accent} revealAt={0} />`,
  },
  {
    name: "PieSliceShape",
    description: "One animated pie/wedge slice sweeping in — building block for pie charts.",
    propsDoc: "{ cx, cy, radius, startAngle, endAngle, color, revealAt }",
    domainTags: ["math", "data", "general"],
    code: `function PieSliceShape({ cx, cy, radius, startAngle, endAngle, color, revealAt }) {
  const frame = useCurrentFrame();
  const grown = interpolate(frame - (revealAt || 0), [0, 24], [0, 1], CLAMP);
  const sweep = startAngle + (endAngle - startAngle) * grown;
  const toRad = (d) => (d * Math.PI) / 180;
  const sx = cx + Math.cos(toRad(startAngle)) * radius;
  const sy = cy + Math.sin(toRad(startAngle)) * radius;
  const ex = cx + Math.cos(toRad(sweep)) * radius;
  const ey = cy + Math.sin(toRad(sweep)) * radius;
  const largeArc = Math.abs(sweep - startAngle) > 180 ? 1 : 0;
  return (
    <svg style={SVG_FRAME}>
      <path d={"M " + cx + "," + cy + " L " + sx + "," + sy + " A " + radius + "," + radius + " 0 " + largeArc + " 1 " + ex + "," + ey + " Z"} fill={color || PALETTE.accent} opacity={0.85} />
    </svg>
  );
}`,
    example: `<PieSliceShape cx={960} cy={540} radius={180} startAngle={0} endAngle={120} color={PALETTE.accent} revealAt={0} />`,
  },
  {
    name: "FractionBarShape",
    description: "A bar split into equal segments, some filled — for fraction visualization.",
    propsDoc: "{ x, y, width, height, numerator, denominator, color }",
    domainTags: ["math", "general"],
    code: `function FractionBarShape({ x, y, width, height, numerator, denominator, color }) {
  const c = color || PALETTE.accent;
  const segW = width / (denominator || 1);
  return (
    <svg style={SVG_FRAME}>
      {Array.from({ length: denominator || 1 }).map((_, i) => (
        <rect key={i} x={x + i * segW} y={y} width={segW - 3} height={height} rx={4}
          fill={i < numerator ? c : "none"} stroke={c} strokeWidth={2} opacity={i < numerator ? 0.9 : 0.4} />
      ))}
    </svg>
  );
}`,
    example: `<FractionBarShape x={660} y={500} width={600} height={80} numerator={3} denominator={8} color={PALETTE.accent} />`,
  },
  {
    name: "TallyMarks",
    description: "Animated tally marks in groups of five — for counting, statistics.",
    propsDoc: "{ x, y, count, color, spacing }",
    domainTags: ["math", "data", "general"],
    code: `function TallyMarks({ x, y, count, color, spacing }) {
  const frame = useCurrentFrame();
  const shown = Math.min(count, Math.floor(frame / 6));
  const c = color || PALETTE.text;
  const gap = spacing || 14;
  const marks = [];
  for (let i = 0; i < shown; i++) {
    const groupIndex = Math.floor(i / 5);
    const posInGroup = i % 5;
    const gx = x + groupIndex * (gap * 6) + posInGroup * gap;
    if (posInGroup === 4) {
      marks.push({ x1: gx - gap * 4 - 4, y1: y - 24, x2: gx + 4, y2: y + 24 });
    } else {
      marks.push({ x1: gx, y1: y - 22, x2: gx, y2: y + 22 });
    }
  }
  return (
    <svg style={SVG_FRAME}>
      {marks.map((m, i) => <line key={i} x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} stroke={c} strokeWidth={3} opacity={0.85} />)}
    </svg>
  );
}`,
    example: `<TallyMarks x={700} y={540} count={12} color={PALETTE.text} spacing={16} />`,
  },
  {
    name: "ProtractorArc",
    description: "A protractor semicircle with an animated angle marker — for geometry, angle measurement.",
    propsDoc: "{ cx, cy, radius, angle, color }",
    domainTags: ["math", "geometry"],
    code: `function ProtractorArc({ cx, cy, radius, angle, color }) {
  const frame = useCurrentFrame();
  const grown = interpolate(frame, [0, 30], [0, angle], CLAMP);
  const c = color || PALETTE.accent;
  const rad = (grown * Math.PI) / 180;
  const mx = cx + Math.cos(Math.PI - rad) * radius;
  const my = cy - Math.sin(Math.PI - rad) * radius;
  return (
    <svg style={SVG_FRAME}>
      <path d={"M " + (cx - radius) + "," + cy + " A " + radius + "," + radius + " 0 0 1 " + (cx + radius) + "," + cy} fill="none" stroke={PALETTE.text} strokeWidth={2} opacity={0.4} />
      <line x1={cx} y1={cy} x2={cx - radius} y2={cy} stroke={c} strokeWidth={2.5} opacity={0.7} />
      <line x1={cx} y1={cy} x2={mx} y2={my} stroke={c} strokeWidth={3} opacity={0.95} />
      <text x={cx} y={cy - radius - 16} textAnchor="middle" fontSize={16} fontWeight={700} fill={PALETTE.text}>{Math.round(grown)}°</text>
    </svg>
  );
}`,
    example: `<ProtractorArc cx={960} cy={700} radius={200} angle={65} color={PALETTE.accent} />`,
  },

  // Misc / general
  {
    name: "HorseshoeMagnet",
    description: "A horseshoe magnet with labeled N/S poles — for magnetism, physics.",
    propsDoc: "{ cx, cy, size, colorN, colorS }",
    domainTags: ["physics", "general"],
    code: `function HorseshoeMagnet({ cx, cy, size, colorN, colorS }) {
  const frame = useCurrentFrame();
  const pulse = 1 + Math.sin(frame / 15) * 0.03;
  const s = size || 100;
  return (
    <svg style={SVG_FRAME}>
      <path d={"M " + (cx - s / 2) + "," + (cy - s) + " L " + (cx - s / 2) + "," + (cy + s * 0.3) + " A " + (s / 2) + "," + (s / 2) + " 0 0 0 " + (cx + s / 2) + "," + (cy + s * 0.3) + " L " + (cx + s / 2) + "," + (cy - s)}
        fill="none" stroke={PALETTE.text} strokeWidth={s * 0.28 * pulse} strokeLinecap="round" opacity={0.3} />
      <rect x={cx - s / 2 - 4} y={cy - s} width={s * 0.28} height={s * 0.5} fill={colorN || PALETTE.accent} opacity={0.9} />
      <rect x={cx + s / 2 - s * 0.28 + 4} y={cy - s} width={s * 0.28} height={s * 0.5} fill={colorS || PALETTE.text} opacity={0.9} />
    </svg>
  );
}`,
    example: `<HorseshoeMagnet cx={960} cy={540} size={140} colorN={PALETTE.accent} colorS={PALETTE.text} />`,
  },
  {
    name: "ThermometerGauge",
    description: "A vertical thermometer with a mercury fill level — for temperature readouts.",
    propsDoc: "{ x, y, height, value, min, max, color }",
    domainTags: ["physics", "data", "general"],
    code: `function ThermometerGauge({ x, y, height, value, min, max, color }) {
  const lo = min === undefined ? 0 : min;
  const hi = max === undefined ? 100 : max;
  const t = clampPos((value - lo) / (hi - lo || 1), 0, 1);
  const bulbR = 22;
  const fillH = height * t;
  const c = color || PALETTE.accent;
  return (
    <svg style={SVG_FRAME}>
      <rect x={x - 10} y={y} width={20} height={height} rx={10} fill="none" stroke={PALETTE.text} strokeWidth={2} opacity={0.5} />
      <circle cx={x} cy={y + height + bulbR - 6} r={bulbR} fill="none" stroke={PALETTE.text} strokeWidth={2} opacity={0.5} />
      <rect x={x - 6} y={y + height - fillH} width={12} height={fillH} rx={6} fill={c} opacity={0.9} />
      <circle cx={x} cy={y + height + bulbR - 6} r={bulbR - 5} fill={c} opacity={0.9} />
    </svg>
  );
}`,
    example: `<ThermometerGauge x={960} y={300} height={400} value={72} min={0} max={100} color={PALETTE.accent} />`,
  },
  {
    name: "AudioWaveformBars",
    description: "Pulsing vertical bars like an audio level meter — for sound, audio, music visualizations.",
    propsDoc: "{ x, y, barCount, barWidth, height, color }",
    domainTags: ["general", "physics"],
    code: `function AudioWaveformBars({ x, y, barCount, barWidth, height, color }) {
  const frame = useCurrentFrame();
  const n = barCount || 12;
  const c = color || PALETTE.accent;
  return (
    <svg style={SVG_FRAME}>
      {Array.from({ length: n }).map((_, i) => {
        const h = (0.3 + Math.abs(Math.sin(frame / 8 + i * 0.7)) * 0.7) * height;
        return (
          <rect key={i} x={x + i * (barWidth + 6)} y={y + (height - h) / 2} width={barWidth} height={h} rx={barWidth / 2} fill={c} opacity={0.85} />
        );
      })}
    </svg>
  );
}`,
    example: `<AudioWaveformBars x={700} y={460} barCount={14} barWidth={12} height={160} color={PALETTE.accent} />`,
  },
  {
    name: "PulsingHalo",
    description: "A soft expanding ring pulse around a center dot — for emphasis, attention, notifications.",
    propsDoc: "{ cx, cy, radius, color, revealAt }",
    domainTags: ["general", "data"],
    code: `function PulsingHalo({ cx, cy, radius, color, revealAt }) {
  const frame = useCurrentFrame();
  const local = frame - (revealAt || 0);
  const cycle = local % 60;
  const grown = interpolate(cycle, [0, 60], [0.4, 1.6], CLAMP);
  const fade = interpolate(cycle, [0, 60], [0.7, 0], CLAMP);
  const c = color || PALETTE.accent;
  return (
    <svg style={SVG_FRAME}>
      {local >= 0 ? <circle cx={cx} cy={cy} r={radius * grown} fill="none" stroke={c} strokeWidth={3} opacity={fade} /> : null}
      <circle cx={cx} cy={cy} r={radius * 0.4} fill={c} opacity={0.9} />
    </svg>
  );
}`,
    example: `<PulsingHalo cx={960} cy={540} radius={60} color={PALETTE.accent} revealAt={0} />`,
  },
];

async function main() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGO_URI);

  try {
    let created = 0;
    let skipped = 0;
    for (const c of STARTER_COMPONENTS) {
      const exists = await LibraryComponent.findOne({ name: c.name }).select("_id").lean();
      if (exists) {
        console.log(`  skip  ${c.name} (already exists)`);
        skipped++;
        continue;
      }
      await LibraryComponent.create({ ...c, status: "active", usageCount: 0 });
      console.log(`  seeded ${c.name}`);
      created++;
    }
    console.log(`\nDone. Created ${created}, skipped ${skipped}.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
