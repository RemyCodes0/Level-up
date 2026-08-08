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
